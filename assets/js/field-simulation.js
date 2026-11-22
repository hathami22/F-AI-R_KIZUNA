const get = id => document.getElementById(id);
let sim = new FieldSimulation();
let running = false;
let last = performance.now();
let transform;
let lastShotId = null;
let flashUntil = 0;
let selectedCell = null;

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return {ctx, width, height};
}

function draw() {
  const {ctx, width, height} = resizeCanvas(get('map'));
  const scale = Math.min((width - 60) / 40, (height - 45) / 24);
  const ox = (width - scale * 40) / 2;
  const oy = (height - scale * 24) / 2;
  transform = {scale, ox, oy};
  const point = (x, y) => [ox + x * scale, height - oy - y * scale];
  for (const cell of sim.cells) {
    const density = cell.area > 0 ? cell.count / cell.area : null;
    const colors = ['#e2efe3', '#83b28d', '#39804e', '#174d2c'];
    ctx.fillStyle = density === null ? '#e0e5e1' : colors[density >= 6 ? 3 : density >= 3 ? 2 : density >= 1 ? 1 : 0];
    const [x, y] = point(cell.x, cell.y + 1);
    ctx.fillRect(x, y, scale + 0.2, scale + 0.2);
  }
  ctx.strokeStyle = '#a6b5ab';
  ctx.lineWidth = 0.5;
  for (let y = 0; y <= 24; y += 2) {
    ctx.beginPath(); ctx.moveTo(...point(0, y)); ctx.lineTo(...point(40, y)); ctx.stroke();
  }
  ctx.fillStyle = '#4b6055'; ctx.font = '13px Segoe UI';
  ctx.fillText('N ↑', 6, 18);
  ctx.fillText('40 m east', width / 2 - 30, height - 5);
  if (get('truth').checked) {
    ctx.fillStyle = '#7a4f22';
    for (const weed of sim.weeds) {ctx.beginPath(); ctx.arc(...point(weed.x, weed.y), 1.5, 0, Math.PI * 2); ctx.fill();}
  }
  ctx.fillStyle = '#2a6150';
  for (const crop of get('showCrops').checked ? sim.crops : []) {
    const [x, y] = point(crop.x, crop.y);
    ctx.fillRect(x - 1, y - 2, 2, 4);
  }
  for (const weed of sim.detected) {
    const [x, y] = point(weed.x, weed.y);
    ctx.fillStyle = weed.status === 'treated' ? '#dc7019' : weed.status === 'crop-protected' ? '#67798a' : '#182923';
    ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#b77b20'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (get('showRoute').checked) {
    sim.track.forEach((p, index) => index ? ctx.lineTo(...point(p.x_m, p.y_m)) : ctx.moveTo(...point(p.x_m, p.y_m)));
  }
  ctx.stroke();
  if (selectedCell) {
    const [sx, sy] = point(selectedCell.x, selectedCell.y + 1);
    ctx.strokeStyle = '#a45010'; ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, scale, scale);
  }
  const [rx, ry] = point(sim.x, sim.y);
  const shot = sim.shots[sim.shots.length - 1];
  if (shot && shot.id !== lastShotId) {
    lastShotId = shot.id;
    flashUntil = performance.now() + 160;
  }
  const flashing = shot && performance.now() < flashUntil;
  if (flashing) {
    ctx.strokeStyle = '#ed7415'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(...point(shot.x, shot.y)); ctx.stroke();
    ctx.beginPath(); ctx.arc(...point(shot.x, shot.y), 5, 0, Math.PI * 2); ctx.stroke();
  }
  const changingRow = sim.turnRemaining > 0;
  ctx.save(); ctx.translate(rx, ry);
  ctx.rotate(changingRow ? -Math.PI / 2 : sim.lane % 2 === 0 ? 0 : Math.PI);
  ctx.fillStyle = '#162d22';
  ctx.fillRect(-8, -9, 15, 4); ctx.fillRect(-8, 5, 15, 4);
  ctx.fillStyle = '#145536'; ctx.fillRect(-7, -5, 14, 10);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(-7, -5, 14, 10);
  ctx.fillStyle = '#e7832b'; ctx.fillRect(4, -3, 5, 6);
  ctx.restore();
  const graph = resizeCanvas(get('chart'));
  const chartX = 28;
  for (const tick of [0, 0.6, 1.2]) {
    const y = graph.height - 8 - tick / 1.2 * (graph.height - 20);
    graph.ctx.strokeStyle = '#e3eae5'; graph.ctx.lineWidth = 1;
    graph.ctx.beginPath(); graph.ctx.moveTo(chartX, y); graph.ctx.lineTo(graph.width, y); graph.ctx.stroke();
    graph.ctx.fillStyle = '#52665b'; graph.ctx.font = '11px sans-serif';
    graph.ctx.fillText(tick.toFixed(1), 0, y + 3);
  }
  const samples = sim.track.slice(-60);
  for (const [field, color, dash] of [['target_m_s', '#a45010', [4, 3]], ['speed_m_s', '#39804e', []]]) {
    graph.ctx.strokeStyle = color; graph.ctx.lineWidth = 2; graph.ctx.setLineDash(dash); graph.ctx.beginPath();
    samples.forEach((p, index) => {
      const x = chartX + (60 - samples.length + index) / 59 * (graph.width - chartX);
      const y = graph.height - 8 - p[field] / 1.2 * (graph.height - 20);
      if (index) graph.ctx.lineTo(x, y); else graph.ctx.moveTo(x, y);
    }); graph.ctx.stroke();
  }
  graph.ctx.setLineDash([]);
  get('speed').textContent = `${sim.speed.toFixed(2)} m/s`;
  get('coverage').textContent = `${(sim.area/960*100).toFixed(1)}%`;
  get('count').textContent = sim.detected.length;
  get('density').textContent = sim.area > 0 ? `${(sim.detected.length/sim.area).toFixed(2)} /m²` : '—';
  get('gps').textContent = sim.gps(sim.x, sim.y).reverse().map(v => v.toFixed(7)).join(' / ');
  get('time').textContent = `${Math.floor(sim.time/60)} min ${Math.floor(sim.time%60)} s`;
  get('ahead').textContent = `${sim.lookAhead().toFixed(2)} weeds/m²`;
  get('target').textContent = `${sim.target.toFixed(2)} m/s`;
  get('treated').textContent = sim.shots.length;
  get('protected').textContent = sim.detected.filter(w => w.status === 'crop-protected').length;
  get('missed').textContent = sim.detected.filter(w => w.status === 'missed').length;
  get('surveyProgress').value = sim.area;
  get('progressArea').textContent = `${Math.min(960, sim.area).toFixed(0)} of 960 m² surveyed`;
  get('rowProgress').textContent = sim.done ? 'All 12 rows surveyed' : `Row ${Math.min(12, sim.lane + 1)} of 12`;
  get('gpsSamples').textContent = sim.track.length.toLocaleString();
  const backlog = sim.detected.filter(w => w.status === 'queued' && Math.floor(w.y / 2) === sim.lane).length;
  const endDistance = sim.lane % 2 === 0 ? 40 - sim.x : sim.x;
  get('speedReason').textContent = sim.done ? 'Survey complete. All rows mapped.'
    : !running ? (sim.time ? 'Survey paused. Resume to continue.' : 'Ready for autonomous survey.')
    : changingRow ? 'Turning into the next crop row.'
    : backlog > sim.capacity ? 'Slowing down to clear queued targets.'
    : endDistance < 1.2 ? 'Braking for the end of the row.'
    : sim.target < 1.19 ? 'Matching speed to weed density and laser capacity.'
    : 'Low target load. Cruising at up to 1.20 m/s.';
  get('laserState').textContent = !running ? 'Idle' : sim.turnRemaining > 0 ? 'Row change' : flashing ? 'Pulse at weed stem' : 'Searching';
  get('state').textContent = sim.done ? 'Run complete' : sim.turnRemaining > 0 ? 'Changing row' : running ? 'Detecting and treating' : sim.time === 0 ? 'Ready' : 'Paused';
  const detail = resizeCanvas(get('laserView'));
  const cx = detail.width / 2;
  detail.ctx.fillStyle = '#183e2c'; detail.ctx.fillRect(cx - 22, 8, 44, 16);
  detail.ctx.strokeStyle = '#39804e'; detail.ctx.lineWidth = 3;
  detail.ctx.beginPath(); detail.ctx.moveTo(cx, 105); detail.ctx.lineTo(cx, 80);
  detail.ctx.moveTo(cx, 92); detail.ctx.lineTo(cx - 16, 78);
  detail.ctx.moveTo(cx, 96); detail.ctx.lineTo(cx + 15, 81); detail.ctx.stroke();
  if (flashing && running) {
    detail.ctx.strokeStyle = '#ed7415'; detail.ctx.lineWidth = 2;
    detail.ctx.beginPath(); detail.ctx.moveTo(cx, 24); detail.ctx.lineTo(cx, 105); detail.ctx.stroke();
    detail.ctx.beginPath(); detail.ctx.arc(cx, 105, 7, 0, Math.PI*2); detail.ctx.stroke();
  }
  detail.ctx.fillStyle = '#4b6055'; detail.ctx.font = '13px Segoe UI';
  detail.ctx.fillText(shot ? `Last stem ${shot.x.toFixed(2)}, ${shot.y.toFixed(2)} m` : 'Waiting for first target', 10, 135);
}

get('start').onclick = () => {
  if (sim.done) return;
  running = !running;
  get('start').textContent = running ? 'Pause survey' : 'Resume survey';
  get('message').textContent = running ? 'Survey running' : 'Survey paused';
};
function reset() {
  const latitude = Number(get('lat').value);
  const longitude = Number(get('lon').value);
  if (!get('lat').checkValidity() || !get('lon').checkValidity() || Math.abs(latitude)>80 || Math.abs(longitude)>179) {
    get('message').textContent = 'Enter latitude from −80 to 80 and longitude from −179 to 179.';
    return;
  }
  sim = new FieldSimulation(latitude, longitude);
  lastShotId = null;
  flashUntil = 0;
  selectedCell = null;
  running = false;
  get('activateRun').disabled = true;
  get('runSaveStatus').textContent = '';
  get('start').disabled = false; get('start').textContent = 'Start survey';
  get('message').textContent = 'Ready to survey';
  get('cellInfo').textContent = 'Select a map cell to inspect its GPS location, count, and surveyed area.';
  draw();
}
get('reset').onclick = reset;
get('origin').onclick = reset;
get('capacity').onchange = () => {
  if (!get('capacity').checkValidity()) get('capacity').value = sim.capacity;
};
function inspectCell(x, y) {
  selectedCell = {x, y};
  const cell = sim.cells[y*40+x];
  const [lon, lat] = sim.gps(x+0.5,y+0.5);
  get('cellInfo').textContent = `${lat.toFixed(7)}, ${lon.toFixed(7)} · ${cell.count} weeds · ${cell.area.toFixed(2)} m² surveyed · ${cell.area>0 ? (cell.count/cell.area).toFixed(2)+' weeds/m²' : 'Unsurveyed'}`;
}
get('map').onclick = event => {
  const rect = get('map').getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left - transform.ox) / transform.scale);
  const y = Math.floor((rect.height - transform.oy - (event.clientY - rect.top)) / transform.scale);
  if (x < 0 || x >= 40 || y < 0 || y >= 24) return;
  inspectCell(x, y);
};
get('map').onkeydown = event => {
  const moves = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]};
  if (!moves[event.key]) return;
  event.preventDefault();
  const current = selectedCell || {x: 0, y: 0};
  const [dx, dy] = moves[event.key];
  inspectCell(Math.max(0, Math.min(39, current.x + dx)), Math.max(0, Math.min(23, current.y + dy)));
};
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(rows, fields) {
  return [fields.join(','), ...rows.map(row => fields.map(field => row[field]).join(','))].join('\n');
}
get('csv').onclick = () => download('simulated_gps_route.csv', csv(sim.track,
  ['seconds','longitude','latitude','speed_m_s','target_m_s','x_m','y_m']), 'text/csv');
get('weeds').onclick = () => download('simulated_weed_gps.csv', csv(sim.detected,
  ['id','species','seconds','longitude','latitude','x','y','status','treated_seconds']), 'text/csv');
get('geo').onclick = () => download('simulated_field_density.geojson', JSON.stringify(sim.geojson(),null,2), 'application/geo+json');
function frame(now) {
  const elapsed = Math.min(0.1, (now-last)/1000);
  last = now;
  if (running) {
    if (get('capacity').checkValidity() && get('capacity').value !== '') {
      sim.capacity = Number(get('capacity').value);
    }
    let remaining = elapsed * Number(get('rate').value);
    while (remaining > 0 && !sim.done) {
      const dt = Math.min(0.05, remaining); sim.step(dt); remaining -= dt;
    }
    if (sim.done) {
      running = false; get('start').disabled = true; get('activateRun').disabled = false;
      get('start').textContent = 'Survey complete'; get('message').textContent = 'Survey complete · exports ready';
    }
  }
  draw(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

get('activateRun').onclick = () => {
  if (!sim.done) return;
  try {
    NabtaFieldData.saveSimulation({
      weedsCsv: csv(sim.detected, ['id','species','seconds','longitude','latitude','x','y','status','treated_seconds']),
      routeCsv: csv(sim.track, ['seconds','longitude','latitude','speed_m_s','target_m_s','x_m','y_m']),
      densityJson: JSON.stringify(sim.geojson())
    });
    get('runSaveStatus').textContent = 'Completed simulation selected. Open the dashboard to view its charts and tables.';
    get('activateRun').disabled = true;
    // Refresh the source selector while retaining the completed simulation on screen.
    const select = get('active-survey');
    if (select) {
      if (!select.querySelector('option[value="simulation"]')) {
        select.add(new Option('Latest completed simulation', 'simulation'));
      }
      select.value = 'simulation';
      select.nextElementSibling.textContent = 'Latest simulation saved in this browser';
    }
  } catch (error) {
    get('runSaveStatus').textContent = 'Could not save the simulation. ' + error.message;
  }
};
