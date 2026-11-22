"""Local YOLO inference service used by the Nabta Node proxy."""

import io
import os
import threading
import time
from pathlib import Path

os.environ.setdefault('YOLO_AUTOINSTALL', 'false')

import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool
from ultralytics import YOLO


MODEL_DIRECTORY = Path(__file__).resolve().parents[1] / 'models'
POSE_MODEL_PATH = Path(os.environ.get('NABTA_MODEL_PATH', MODEL_DIRECTORY / 'best.pt'))
PEST_MODEL_PATH = Path(os.environ.get('NABTA_PEST_MODEL_PATH', MODEL_DIRECTORY / 'pest_best.pt'))
MAX_FRAME_BYTES = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 16000000
torch.set_num_threads(min(4, os.cpu_count() or 1))
device = 0 if torch.cuda.is_available() else 'cpu'
lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

pose_model = None
pest_model = None
if POSE_MODEL_PATH.is_file():
    pose_model = YOLO(str(POSE_MODEL_PATH))
    if pose_model.task != 'pose' or list(pose_model.model.kpt_shape) != [1, 3]:
        raise RuntimeError('NABTA_MODEL_PATH must be a pose model with one stem keypoint.')
    pose_model.predict(Image.new('RGB', (640, 640)), imgsz=640, device=device, verbose=False)
if PEST_MODEL_PATH.is_file():
    pest_model = YOLO(str(PEST_MODEL_PATH))
    if pest_model.task != 'detect':
        raise RuntimeError('NABTA_PEST_MODEL_PATH must be an object-detection model.')
    pest_model.predict(Image.new('RGB', (640, 640)), imgsz=640, device=device, verbose=False)
if pose_model is None and pest_model is None:
    raise FileNotFoundError(
        'No model checkpoints found. Add models/best.pt for stem detection or '
        'models/pest_best.pt for caterpillar detection.'
    )


@app.get('/health')
def health():
    return {
        'ready': pose_model is not None or pest_model is not None,
        'pose_ready': pose_model is not None,
        'pest_ready': pest_model is not None,
        'device': 'CUDA' if device == 0 else 'CPU',
        'pose_classes': list(pose_model.names.values()) if pose_model is not None else [],
        'pest_classes': list(pest_model.names.values()) if pest_model is not None else [],
        'keypoints': 1 if pose_model is not None else 0,
    }


async def read_frame(request: Request):
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_FRAME_BYTES:
            raise HTTPException(413, 'Frame exceeds 8 MB.')
    if not content:
        raise HTTPException(400, 'An image frame is required.')
    return bytes(content)


def decode_frame(content):
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.width * image.height > 16000000:
                raise HTTPException(413, 'Frame exceeds 16 megapixels.')
            return image.convert('RGB')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise HTTPException(400, 'The frame could not be decoded as an image.') from error


def detect(content, confidence, image_size):
    if pose_model is None:
        raise HTTPException(503, 'The stem pose model is not installed.')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'The model is busy. Retry after the current frame finishes.')
    try:
        image = decode_frame(content)
        start = time.perf_counter()
        result = pose_model.predict(image, conf=confidence, imgsz=image_size,
                                    device=device, verbose=False)[0].cpu()
        detections = []
        for index, box in enumerate(result.boxes):
            stem = None
            if result.keypoints is not None:
                x, y, score = result.keypoints.data[index, 0].tolist()
                if x != 0 or y != 0:
                    stem = {'x': x, 'y': y, 'confidence': score}
            class_id = int(box.cls.item())
            detections.append({'class_id': class_id, 'class_name': result.names[class_id],
                               'confidence': float(box.conf.item()),
                               'box': box.xyxy[0].tolist(), 'stem': stem})
        return {'width': image.width, 'height': image.height, 'detections': detections,
                'inference_ms': round((time.perf_counter() - start) * 1000, 1)}
    finally:
        lock.release()


def detect_pests(content, confidence, image_size):
    if pest_model is None:
        raise HTTPException(503, 'The caterpillar detection model is not installed.')
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'The model is busy. Retry after the current frame finishes.')
    try:
        image = decode_frame(content)
        start = time.perf_counter()
        result = pest_model.predict(image, conf=confidence, imgsz=image_size,
                                    device=device, verbose=False)[0].cpu()
        detections = []
        for box in result.boxes:
            class_id = int(box.cls.item())
            detections.append({
                'class_id': class_id,
                'class_name': result.names[class_id],
                'confidence': float(box.conf.item()),
                'box': box.xyxy[0].tolist(),
            })
        return {
            'width': image.width,
            'height': image.height,
            'detections': detections,
            'inference_ms': round((time.perf_counter() - start) * 1000, 1),
        }
    finally:
        lock.release()


@app.post('/frame')
async def frame(request: Request, confidence: float = 0.25, image_size: int = 1024):
    if not 0.05 <= confidence <= 0.95 or image_size not in (640, 1024):
        raise HTTPException(400, 'Invalid confidence threshold or image size.')
    if pose_model is None:
        raise HTTPException(503, 'The stem pose model is not installed.')
    return await run_in_threadpool(detect, await read_frame(request), confidence, image_size)


@app.post('/pest/frame')
async def pest_frame(request: Request, confidence: float = 0.25, image_size: int = 1024):
    if not 0.05 <= confidence <= 0.95 or image_size not in (640, 1024):
        raise HTTPException(400, 'Invalid confidence threshold or image size.')
    if pest_model is None:
        raise HTTPException(503, 'The caterpillar detection model is not installed.')
    return await run_in_threadpool(detect_pests, await read_frame(request), confidence, image_size)


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('NABTA_DETECTION_PORT', '8091')))
