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
