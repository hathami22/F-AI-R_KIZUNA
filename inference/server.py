"""Local YOLO pose inference service used by the Nabta Node proxy."""

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


MODEL_PATH = Path(os.environ.get('NABTA_MODEL_PATH', Path(__file__).resolve().parents[1] / 'models' / 'best.pt'))
MAX_FRAME_BYTES = 8 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 16000000
torch.set_num_threads(min(4, os.cpu_count() or 1))
model = YOLO(str(MODEL_PATH))
if model.task != 'pose' or list(model.model.kpt_shape) != [1, 3]:
    raise RuntimeError('Nabta requires a pose model with one stem keypoint and confidence.')
device = 0 if torch.cuda.is_available() else 'cpu'
model.predict(Image.new('RGB', (640, 640)), imgsz=640, device=device, verbose=False)
lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.get('/health')
def health():
    return {'ready': True, 'device': 'CUDA' if device == 0 else 'CPU',
            'classes': model.names, 'keypoints': 1}


def detect(content, confidence, image_size):
    if not lock.acquire(blocking=False):
        raise HTTPException(429, 'The model is busy. Retry after the current frame finishes.')
    try:
        try:
            image = Image.open(io.BytesIO(content))
            if image.width * image.height > 16000000:
                raise HTTPException(413, 'Frame exceeds 16 megapixels.')
            image = image.convert('RGB')
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
            raise HTTPException(400, 'The frame could not be decoded as an image.') from error
        start = time.perf_counter()
        result = model.predict(image, conf=confidence, imgsz=image_size,
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


@app.post('/frame')
async def frame(request: Request, confidence: float = 0.25, image_size: int = 1024):
    if not 0.05 <= confidence <= 0.95 or image_size not in (640, 1024):
        raise HTTPException(400, 'Invalid confidence threshold or image size.')
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_FRAME_BYTES:
            raise HTTPException(413, 'Frame exceeds 8 MB.')
    if not content:
        raise HTTPException(400, 'An image frame is required.')
    return await run_in_threadpool(detect, bytes(content), confidence, image_size)


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('NABTA_DETECTION_PORT', '8091')))
