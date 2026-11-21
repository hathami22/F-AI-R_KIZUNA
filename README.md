# Nabta Admin Dashboard

Nabta is a Bootstrap 5 admin dashboard based on the Spark Admin template.

## Getting Started

Clone this repository and serve the project directory over HTTP so the dashboard can load its datasets:
```
git clone --branch dashboard https://github.com/hathami22/F-AI-R_KIZUNA.git
cd F-AI-R_KIZUNA
python -m http.server 8000
```
Then open `http://localhost:8000`.

## Survey Data

The dashboard uses the simulated weed detections, GPS route, and field-density GeoJSON in `assets/data/`. These files contain elapsed survey time rather than calendar dates, so the date-range picker is a reporting-period control and does not filter the single simulated run.

## Original Template Attribution
```
The original design and code are by Spark Admin Dev and development team.
```

## License

 - Design and Code is Copyright &copy; <a href="https://sparkadminpro.gumroad.com/" target="_blank">Spark Admin Dev</a>
 - Licensed cover under [MIT]
 - Distributed by <a href="https://themewagon.com" target="_blank">ThemeWagon</a>
