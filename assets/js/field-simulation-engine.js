/* Local metre coordinates: x east, y north. Synthetic GPS uses a spherical
   tangent-plane approximation suitable for this 40 by 24 metre demonstration. */
class FieldSimulation {
  constructor(latitude = 36.8, longitude = 10.18, seed = 42) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.width = 40;
    this.height = 24;
    this.swath = 2;
    this.time = 0;
    this.speed = 0;
    this.target = 1.2;
    this.capacity = 2;
    this.x = 0;
    this.y = 1;
    this.lane = 0;
    this.turnRemaining = 0;
    this.done = false;
    this.area = 0;
    this.detected = [];
    this.shots = [];
    this.laserCredit = 0;
    this.crops = [];
    for (let row = 0; row < 12; row++) {
      for (let x = 0.4; x < 40; x += 0.8) this.crops.push({x, y: row * 2 + 1});
    }
    this.track = [];
    this.cells = Array.from({length: 960}, (_, id) => ({
      x: id % 40, y: Math.floor(id / 40), count: 0, area: 0
    }));
    let state = seed;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    this.weeds = [];
    for (let i = 0; i < 6500; i++) {
      const x = random() * 40;
      const y = random() * 24;
      const patch = Math.exp(-((x - 13) ** 2 + (y - 8) ** 2) / 30)
        + 0.8 * Math.exp(-((x - 30) ** 2 + (y - 18) ** 2) / 45);
      if (random() < 0.04 + 0.85 * patch) {
        this.weeds.push({id: this.weeds.length, x, y, seen: false,
          species: random() < 0.2 ? 'grassy-weed' : 'weed'});
      }
    }
    this.sampleGPS();
  }

  gps(x, y) {
    const radius = 6378137;
    return [this.longitude + x / (radius * Math.cos(this.latitude * Math.PI / 180)) * 180 / Math.PI,
      this.latitude + y / radius * 180 / Math.PI];
  }

  lookAhead() {
    const direction = this.lane % 2 === 0 ? 1 : -1;
    const end = Math.max(0, Math.min(40, this.x + 3 * direction));
    const left = Math.min(this.x, end);
    const right = Math.max(this.x, end);
    const count = this.weeds.filter(w => w.x >= left && w.x < right
      && w.y >= this.lane * 2 && w.y < this.lane * 2 + 2).length;
    return count / Math.max(0.01, (right - left) * this.swath);
  }

  survey(start, end) {
    const left = Math.min(start, end);
    const right = Math.max(start, end);
    const bottom = this.lane * 2;
    for (const cell of this.cells) {
      if (cell.y < bottom || cell.y >= bottom + 2) continue;
      cell.area = Math.min(1, cell.area + Math.max(0, Math.min(right, cell.x + 1) - Math.max(left, cell.x)));
    }
    this.area += (right - left) * 2;
    for (const weed of this.weeds) {
      if (weed.seen || weed.x < left || weed.x > right || weed.y < bottom || weed.y >= bottom + 2) continue;
      weed.seen = true;
      // One stable ID per synthetic plant prevents repeated-frame double counting.
      const [longitude, latitude] = this.gps(weed.x, weed.y);
      const protectedCrop = this.crops.some(crop => Math.hypot(crop.x - weed.x, crop.y - weed.y) < 0.15);
      this.detected.push({...weed, seconds: this.time, longitude, latitude,
        status: protectedCrop ? 'crop-protected' : 'queued', treated_seconds: null});
      this.cells[Math.floor(weed.y) * 40 + Math.floor(weed.x)].count++;
    }
  }

  sampleGPS() {
    const [longitude, latitude] = this.gps(this.x, this.y);
    this.track.push({seconds: this.time, longitude, latitude, speed_m_s: this.speed,
      target_m_s: this.target, x_m: this.x, y_m: this.y});
  }

  fireLaser(dt) {
    this.laserCredit = Math.min(1, this.laserCredit + this.capacity * dt);
    const direction = this.lane % 2 === 0 ? 1 : -1;
    for (const weed of this.detected) {
      if (weed.status === 'queued' && (this.x - weed.x) * direction > 1) weed.status = 'missed';
    }
    const candidates = this.detected.filter(weed => weed.status === 'queued'
      && Math.floor(weed.y / 2) === this.lane && Math.abs(weed.x - this.x) <= 1);
    candidates.sort((a, b) => direction * (a.x - b.x));
    if (this.laserCredit >= 1 && candidates.length) {
      const weed = candidates[0];
      weed.status = 'treated';
      weed.treated_seconds = this.time;
      this.shots.push({id: weed.id, x: weed.x, y: weed.y, seconds: this.time,
        longitude: weed.longitude, latitude: weed.latitude});
      this.laserCredit = 0;
    }
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1) throw new Error('Time step must be greater than zero and at most 0.1 s.');
    if (!Number.isFinite(this.capacity) || this.capacity <= 0) throw new Error('Capacity must be positive.');
    if (this.done) return;
    this.time += dt;
    if (this.turnRemaining > 0) {
      this.turnRemaining = Math.max(0, this.turnRemaining - dt);
      // Two metres of headland travel in four seconds, accelerating then braking.
      const elapsed = 4 - this.turnRemaining;
      const offset = elapsed <= 2 ? 0.25 * elapsed ** 2 : 2 - 0.25 * (4 - elapsed) ** 2;
      this.y = this.lane * 2 - 1 + offset;
      this.speed = 0.5 * Math.min(elapsed, 4 - elapsed);
      this.target = this.speed;
    } else {
      const density = this.lookAhead();
      this.target = Math.min(1.2, this.capacity / Math.max(0.01, density * this.swath));
      const backlog = this.detected.filter(weed => weed.status === 'queued'
        && Math.floor(weed.y / 2) === this.lane).length;
      if (backlog > this.capacity) this.target = 0;
      const distanceToEnd = this.lane % 2 === 0 ? 40 - this.x : this.x;
      this.target = Math.min(this.target, Math.sqrt(2 * 0.6 * distanceToEnd));
      const change = Math.max(-0.6 * dt, Math.min(0.3 * dt, this.target - this.speed));
      this.speed = Math.max(0, this.speed + change);
      const previous = this.x;
      const direction = this.lane % 2 === 0 ? 1 : -1;
      this.x = Math.max(0, Math.min(40, this.x + direction * this.speed * dt));
      if (Math.abs(this.x - (direction > 0 ? 40 : 0)) < 0.001) this.x = direction > 0 ? 40 : 0;
      this.survey(previous, this.x);
      this.fireLaser(dt);
      const pending = this.detected.some(weed => weed.status === 'queued'
        && Math.floor(weed.y / 2) === this.lane);
      if (this.x === (direction > 0 ? 40 : 0) && !pending) {
        this.lane++;
        this.speed = 0;
        if (this.lane === 12) {
          this.done = true;
          this.target = 0;
        }
        else this.turnRemaining = 4;
      }
    }
    if (this.done || this.time - this.track[this.track.length - 1].seconds >= 1 - 1e-9) this.sampleGPS();
  }

  geojson() {
    const polygon = (x, y, width, height) => ({type: 'Polygon', coordinates: [[
      this.gps(x,y), this.gps(x+width,y), this.gps(x+width,y+height),
      this.gps(x,y+height), this.gps(x,y)
    ]]});
    const features = [{type: 'Feature', properties: {kind: 'field', simulated: true},
      geometry: polygon(0, 0, 40, 24)}];
    for (const cell of this.cells) {
      features.push({type: 'Feature', properties: {kind: 'density', simulated: true,
        surveyed_m2: cell.area, unique_weeds: cell.count,
        weeds_per_m2: cell.area > 0 ? cell.count / cell.area : null},
        geometry: polygon(cell.x, cell.y, 1, 1)});
    }
    for (const weed of this.detected) {
      features.push({type: 'Feature', properties: {kind: 'weed', simulated: true,
        id: weed.id, species: weed.species, seconds: weed.seconds,
        treatment_status: weed.status, treated_seconds: weed.treated_seconds},
        geometry: {type: 'Point', coordinates: [weed.longitude, weed.latitude]}});
    }
    if (this.track.length > 1) features.push({type: 'Feature',
      properties: {kind: 'route', simulated: true}, geometry: {type: 'LineString',
        coordinates: this.track.map(p => [p.longitude, p.latitude])}});
    return {type: 'FeatureCollection', features};
  }
}
if (typeof module !== 'undefined') module.exports = FieldSimulation;
