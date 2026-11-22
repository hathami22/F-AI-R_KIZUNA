"""Generate the Nabta pipeline PDF and a matching high-resolution PNG.

Run: python -m pip install reportlab pypdfium2 pypdf
     python tools/generate_pipeline.py
"""
from pathlib import Path
import math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import simpleSplit
import pypdfium2 as pdfium
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'documentation'
OUT.mkdir(exist_ok=True)
PDF = OUT / 'nabta-project-pipeline-gemini.pdf'
PNG = OUT / 'nabta-project-pipeline-gemini.png'
W, H = 1440, 1160
GREEN, INK, MUTED, BORDER = '#104b31', '#142b20', '#52665b', '#d9e4dc'
ORANGE, PALE, GROUND = '#b65c16', '#edf4ee', '#f6f8f5'
c = canvas.Canvas(str(PDF), pagesize=(W, H))
c.setTitle('Nabta | Complete Project Pipeline')
c.setAuthor('Nabta project')


def rect(x, y, w, h, fill, stroke=None, radius=10):
    c.setFillColor(HexColor(fill))
    c.setStrokeColor(HexColor(stroke or fill))
    c.roundRect(x, H-y-h, w, h, radius, fill=1, stroke=bool(stroke))


def text(x, y, value, size=14, color=INK, bold=False):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
    c.setFillColor(HexColor(color))
    c.drawString(x, H-y-size, value)


def para(x, y, value, width, size=14, color=MUTED, leading=None, bold=False):
    leading = leading or size*1.45
    lines = simpleSplit(value, 'Helvetica-Bold' if bold else 'Helvetica', size, width)
    for line in lines:
        text(x, y, line, size, color, bold)
        y += leading
    return y


def arrow(x1, y1, x2, y2, color=GREEN, dashed=False):
    c.setStrokeColor(HexColor(color)); c.setFillColor(HexColor(color)); c.setLineWidth(1.6)
    c.setDash(5, 4) if dashed else c.setDash()
    c.line(x1, H-y1, x2, H-y2)
    angle = math.atan2(y2-y1, x2-x1)
    p = c.beginPath(); p.moveTo(x2, H-y2)
    p.lineTo(x2-8*math.cos(angle-.45), H-(y2-8*math.sin(angle-.45)))
    p.lineTo(x2-8*math.cos(angle+.45), H-(y2-8*math.sin(angle+.45))); p.close()
    c.drawPath(p, stroke=0, fill=1); c.setDash()


def connector(points, color=GREEN, dashed=False):
    c.setStrokeColor(HexColor(color)); c.setLineWidth(1.6)
    c.setDash(5, 4) if dashed else c.setDash()
    for (x1,y1),(x2,y2) in zip(points, points[1:-1]):
        c.line(x1,H-y1,x2,H-y2)
    arrow(*points[-2],*points[-1],color=color,dashed=dashed)


def box(x, y, title, body, status, width=310, height=126):
    rect(x, y, width, height, '#ffffff', BORDER)
    text(x+18, y+14, status, 10, ORANGE if status.startswith('PLANNED') else GREEN, True)
    text(x+18, y+36, title, 18, INK, True)
    bottom = para(x+18, y+62, body, width-36, 12, leading=15)
    assert bottom <= y+height-8, (title, bottom)


def page_header(title, sub, number):
    rect(0, 0, W, H, GROUND, radius=0)
    text(48, 28, 'Nabta', 24, GREEN, True)
    text(48, 70, title, 34, INK, True)
    para(48, 116, sub, W-96, 15)
    text(48, H-35, 'NABTA ROAM  /  NABTA LINK', 11, GREEN, True)
    text(W-215, H-35, 'Project pipeline  |  '+str(number)+' / 3', 11, MUTED)


page_header('From training data to field action',
            'End-to-end architecture. Software exists today; physical laser treatment and robot control are proposed integration work.', 1)
text(48, 163, '01  BUILD AND VALIDATE THE MODELS', 13, GREEN, True)
xs = [48, 392, 736, 1080]
for x, title, body, status in [
    (xs[0], 'Collect and annotate', 'Images / video frames; crop and weed boxes; one weed-stem keypoint. Keep field-level train / validation / test splits.', 'TRAINING WORKFLOW'),
    (xs[1], 'Train and evaluate', 'YOLO pose for stems; separate pest detector. Evaluate detection, stem error and unseen-field performance.', 'TRAINING WORKFLOW'),
    (xs[2], 'Package model artifacts', 'Weed best.pt; optional pest_best.pt. Plant-health .pth weights + class metadata. Keep matching versions together.', 'IMPLEMENTED SOFTWARE'),
    (xs[3], 'Deploy local inference', 'Node.js website proxy -> FastAPI / PyTorch. Load available models; use CPU or compatible CUDA hardware.', 'IMPLEMENTED SOFTWARE')]:
    box(x, 189, title, body, status)
for x in xs[:-1]: arrow(x+310, 252, x+336, 252)
connector([(1235,315),(1235,332),(24,332),(24,440),(48,440)])

text(48, 348, '02  PERCEIVE, LOCATE AND PLAN', 13, GREEN, True)
for x, title, body, status in [
    (xs[0], 'Acquire field observations', 'Live camera + timestamped GNSS / heading for a robot. Existing website: sample frames from an uploaded video.', 'VIDEO NOW / ROBOT PLANNED'),
    (xs[1], 'Detect and locate stems', 'Class, box, confidence and stem pixel. Calibrate camera and ground geometry before metric targeting.', 'INFERENCE NOW / CALIBRATION PLANNED'),
    (xs[2], 'Map unique weeds', 'Synchronize pose; associate detections; project onto the ground; compute GPS positions and grid density.', 'SYNTHETIC NOW / FIELD MAPPING PLANNED'),
    (xs[3], 'Plan speed and targets', 'Density + treatment capacity -> target speed and target queue. Exclude crop-adjacent targets; record skips.', 'SIMULATED NOW / CONTROL PLANNED')]:
    box(x, 374, title, body, status, height=133)
for x in xs[:-1]: arrow(x+310, 440, x+336, 440)
text(48, 518, 'Robot observations feed detection. The current MP4 feature does not automatically produce a georeferenced field map.', 12, MUTED)
connector([(1390,440),(1416,440),(1416,545),(891,545),(891,584)],dashed=True)

text(48, 558, '03  EXECUTE ON EITHER NABTA PLATFORM', 13, GREEN, True)
box(48, 584, 'Nabta Roam', 'Autonomous rover: route following, obstacle handling, drive motors, battery and steering. Smart speed commands the drivetrain.', 'PLANNED HARDWARE', width=310, height=133)
box(392, 584, 'Nabta Link', 'Tractor-mounted implement. Tractor supplies motion; speed guidance goes to the operator unless a compatible interface is developed.', 'PLANNED HARDWARE', width=310, height=133)
box(736, 584, 'Gate and actuate', 'Controller checks enclosure, interlocks, target validity and timing. Approved targets trigger the shielded treatment module.', 'PLANNED HARDWARE', height=133)
box(1080, 584, 'Log and verify', 'Record commanded pulses, skipped / missed targets, speed and position. Verify actual weed mortality separately.', 'PLANNED FIELD VALIDATION', height=133)
arrow(702, 650, 724, 650)
connector([(203,717),(203,725),(714,725),(714,650),(736,650)],dashed=True)
arrow(1046, 650, 1068, 650)
text(48, 729, 'Roam and Link are alternative carriers for the same treatment concept. A commanded laser pulse is not proof of biological success.', 12, MUTED)

text(48, 769, '04  REVIEW RESULTS AND IMPROVE', 13, GREEN, True)
box(48, 795, 'Dashboard and exports', 'Review coverage, density, route, treatment counts and alerts. Export GPS / weed CSV and density GeoJSON.', 'IMPLEMENTED FOR SIMULATED SURVEYS', width=420, height=133)
box(510, 795, 'Video and crop-health tools', 'Uploaded video -> synchronized overlays. Leaf photo + selected crop -> separate MobileNetV3 health classification.', 'IMPLEMENTED LOCAL INFERENCE', width=420, height=133)
box(972, 795, 'Review and retrain', 'Inspect failures; add verified examples; re-annotate; retrain; validate before releasing a new model version.', 'PLANNED ITERATION LOOP', width=420, height=133)
arrow(468, 861, 498, 861)
arrow(930, 861, 960, 861)
rect(48, 957, 1344, 119, PALE)
text(68, 972, 'Separate simulation branch', 17, GREEN, True)
para(68, 1000, 'Synthetic plants + ideal GPS -> simulated smart speed and laser hits -> route / weed / density exports -> saved completed run -> dashboard. This branch does not run the trained detection model or actuate real hardware.', 1000, 15)
text(1130, 982, 'Website languages', 13, GREEN, True)
text(1130, 1008, 'English / Arabic / Japanese', 12)
text(1130, 1032, 'Arabic uses RTL layout', 12, MUTED)
c.showPage()

page_header('Data, models and application services',
            'The implemented application runs locally. The assistant is an optional external API integration.', 2)
sections = [
    ('Training and annotation', [
        ('Weed / crop model', 'Prepare images and YOLO pose .txt labels with bounding boxes and one stem keypoint, plus data.yaml. Split by field or recording session to avoid near-duplicate leakage. Train in Kaggle or another GPU environment.'),
        ('Evaluation before deployment', 'Check detection precision / recall, stem localization in pixels and calibrated ground units, crop confusion, missed weeds, latency and performance on a held-out field. Freeze model, preprocessing, class order and dataset versions.'),
        ('Independent models', 'Weed/stem pose, caterpillar detection and plant-health classification are separate tasks. Plant health uses a MobileNetV3-Large deployment bundle with five supported crops and 24 classes. It is not validated on field-camera images.')]),
    ('Local inference and website', [
        ('Uploaded video', 'Browser reads the local video and samples JPEG frames. Node proxies requests to FastAPI. YOLO returns boxes, labels, scores and stem keypoints where supported. The browser draws overlays and advances playback at inference speed, up to 12 sampled frames per video second.'),
        ('Plant health', 'User chooses a leaf photo and crop. Browser -> /api/plant-health/predict -> FastAPI /disease/predict -> classifier -> candidate condition, within-crop confidence, alternatives and uncertainty warning.'),
        ('Optional agriculture assistant', 'Browser sends conversation and compact survey context to Node -> Google Gemini. Pest diagnostic requests send a frame-count summary, not video frames. The API key stays on the server. Responses request the selected UI language.')]),
    ('Survey storage and review', [
        ('Current data sources', 'Dashboard reads bundled CSV / GeoJSON or the latest completed synthetic simulation saved in browser localStorage. These are simulated surveys, not a connected robot telemetry feed.'),
        ('Exports and identity', 'GPS route CSV records time, latitude, longitude and actual / target speeds. Weed CSV records ID, species, position, status and treatment time. Density GeoJSON records count, surveyed area and density. Keep stable plant identities before claiming unique field counts.'),
        ('Limitations to preserve', 'Frame detections may repeat the same plant or insect. An MP4 may have no usable GNSS or camera calibration. Missing model weights disable the corresponding feature. Weight files are excluded from Git and must be installed separately.')])
]
y=174
for title, rows in sections:
    text(48, y, title, 22, GREEN, True); y+=40
    for label, body in rows:
        text(48, y, label, 14, INK, True)
        bottom=para(300, y, body, 1060, 15)
        y=bottom+23
    y+=14
assert y < 1090, y
c.showPage()

page_header('Robot integration and delivery roadmap',
            'Use measured hardware performance to replace simulation assumptions, one subsystem at a time.', 3)
rows = [
    ('1', 'Validate perception', 'Use representative day / shade / dusty-field footage. Label crop stems and weed stems accurately; measure missed weeds, crop confusion and localization error. Keep a completely separate field test set.', 'Exit: repeatable measurements and a versioned model.'),
    ('2', 'Build one treatment channel', 'Test calibrated targeting, focus, dwell, cooling and enclosure/interlock behavior on a stationary or controlled fixture. Measure actual weed mortality and crop damage rather than counting pulse commands as success.', 'Exit: verified treatment effect within a measured operating envelope.'),
    ('3', 'Integrate motion and localization', 'Synchronize camera timestamps with GNSS, heading and wheel/IMU data. Transform image stem locations into robot and world coordinates. Track plants across frames. Test timing and positioning error while moving slowly.', 'Exit: position and timing accuracy support the chosen speed and map grid.'),
    ('4', 'Integrate Roam or Link', 'Roam adds autonomous route planning, obstacle handling and drivetrain control. Link adds a tractor hitch, gauge wheels and a power interface; the operator follows speed guidance unless tractor control is explicitly integrated.', 'Exit: supervised end-to-end operation on the selected platform.'),
    ('5', 'Connect a real field-data service', 'Develop the device telemetry/API bridge and durable run storage. Log run ID, field boundary, timestamps, model version, GNSS quality, detections, commanded pulses, failures and verified outcomes. Keep synthetic and physical runs clearly labeled.', 'Exit: real data reaches the dashboard without being confused with simulation.'),
    ('6', 'Run field trials and iterate', 'Compare against an untreated control and the farmer\'s current method. Measure weeds killed, crop injury, hectares/hour, energy/hectare, labor and downtime. Laser weeding itself uses no spray water; any wider irrigation or water-saving benefit needs separate evidence.', 'Exit: evidence supports performance, reliability and resource-use claims.')
]
y=174
for n,title,body,exit_ in rows:
    rect(48,y,44,38,GREEN,radius=5);text(63,y+5,n,22,'#ffffff',True)
    text(112,y,title,20,INK,True)
    bottom=para(112,y+33,body,1255,14)
    bottom=para(112,bottom+6,exit_,1255,13,GREEN)
    y=bottom+28
assert y<1090,y
text(48, 1076, 'Basis: current repository README, server.js, inference/server.py, model metadata, and simulation engine. Hardware blocks are proposed.', 11, MUTED)
c.save()
document=pdfium.PdfDocument(PDF)
document[0].render(scale=2).to_pil().save(PNG)
for i,page in enumerate(document):
    review = ROOT/'.playwright-cli'
    review.mkdir(exist_ok=True)
    page.render(scale=1).to_pil().save(review/f'nabta-pipeline-review-{i+1}.png')
    assert PdfReader(PDF).pages[i].extract_text().strip(), f'Empty page {i+1}'
print(f'Created {PDF} ({len(document)} pages)')
print(f'Created {PNG}')
