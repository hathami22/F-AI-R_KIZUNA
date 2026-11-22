# Nabta Admin Dashboard

Nabta is a Bootstrap 5 admin dashboard based on the Spark Admin template.

## Getting Started

The agriculture assistant uses a small Node.js API proxy. Install Node.js 18 or newer, then clone the repository:
```
git clone --branch dashboard https://github.com/hathami22/F-AI-R_KIZUNA.git
cd F-AI-R_KIZUNA
```

Set your OpenAI API key in the server environment and start the dashboard:
```powershell
$env:OPENAI_API_KEY = "<your OpenAI API key>"
node server.js
```
Then open `http://localhost:3000`. The server binds to `127.0.0.1` by default. `OPENAI_MODEL` can optionally select a different supported model; the default is `gpt-4.1-mini`. No API key is stored in the repository or sent to browser code.

The dashboard's non-AI pages can still be served with `python -m http.server 8000`, but the assistant API requires `node server.js`.

## Survey Data

The dashboard uses the simulated weed detections, GPS route, and field-density GeoJSON in `assets/data/`. These files contain elapsed survey time rather than calendar dates, so the date-range picker is a reporting-period control and does not filter the single simulated run.

## Robot Simulation

Open **Robot Simulation** from the sidebar to run autonomous movement, adaptive speed,
laser targeting, crop-proximity skips, and GPS weed-density mapping. All plants, positions,
and treatment outcomes are simulated.

After a run finishes, select **Use completed run in dashboard**. The dashboard, tables,
alerts, and assistant survey context will use that completed run on their next page load.
Use the **Dashboard survey** selector to switch between the bundled survey and the latest
completed simulation. The latest run is stored in this browser on this site's origin.
CSV and GeoJSON exports are also available from the simulation page.

## Video Weed Detection

Install the Python inference dependencies once with `python -m pip install -r inference/requirements.txt`.
Place the trained one-stem YOLO pose checkpoint at `models/best.pt`, or set `NABTA_MODEL_PATH`
to its absolute path. The model file is excluded from Git. Set `NABTA_PYTHON` when using
a particular Python interpreter or virtual environment.

Start the website with `node server.js` and open **Weed Detection** in the sidebar.
The Node server starts the local inference service when the page checks model status.
Choose an MP4, wait for **Model ready**, and select **Start detection**. Pause, seek,
adjust confidence, or choose the 640-pixel mode for faster processing. Video playback
follows inference speed, up to 12 sampled frames per video second, with synchronized
boxes and stem points. Processing uses CUDA when supported by the installed PyTorch,
otherwise CPU. The video remains in the browser and sampled JPEG frames go to the local
service through the website. Frames are processed in memory.

The inference port defaults to 8091 and can be changed with `NABTA_DETECTION_PORT`.
The Agriculture Assistant and video inference have separate runtime dependencies.

## Pest Video Diagnostics

The caterpillar detector is a separate YOLO object-detection model. Copy the supplied
`pest_best.zip` file to `models/pest_best.pt` (rename it; do not extract the archive), or set
`NABTA_PEST_MODEL_PATH` to its absolute path. The checkpoint is intentionally excluded
from Git; `.gitignore` covers `models/*.pt`. The stem/weed pose checkpoint is optional
for this page, and the caterpillar checkpoint is optional for **Weed Detection**.

Open **Pest Video Diagnostics** from the sidebar, choose a video, and start detection.
The report counts sampled frames and frame-level detections, not unique insects. The
optional AI diagnostic sends only that compact report to the Node API/OpenAI; video
frames are not sent to OpenAI. Configure `OPENAI_API_KEY` to enable it. This checkpoint
has one trained label (`caterpillar`) and its archive metadata declares AGPL-3.0; verify
the applicable terms before redistributing the checkpoint.

## Agriculture Assistant

Open **Agriculture Assistant** from the sidebar to ask questions about the survey or general agricultural topics. The browser sends the conversation and a compact summary of the simulated survey to the local Node server, which forwards the request to OpenAI. Conversations are not stored by the dashboard. Verify AI suggestions against local conditions and regulations; they are not a crop diagnosis or pesticide-use instructions.

## Original Template Attribution
```
The original design and code are by Spark Admin Dev and development team.
```

## License

 - Design and Code is Copyright &copy; <a href="https://sparkadminpro.gumroad.com/" target="_blank">Spark Admin Dev</a>
 - Licensed cover under [MIT]
 - Distributed by <a href="https://themewagon.com" target="_blank">ThemeWagon</a>
