(function () {
    'use strict';
    const get = id => document.getElementById(id);
    const pestMode = document.documentElement.dataset.detectionModel === 'pest';
    const video = get('source-video');
    const display = get('detection-canvas');
    const capture = document.createElement('canvas');
    let sourceUrl;
    let running = false;
    let generation = 0;
    let controller;
    let ready = false;
    let healthTimer;
    let assistantReady = false;
    let pestFramesSampled = 0;
    let pestFrameDetections = 0;
    let pestClassTotals = new Map();
    let pestConfidenceThresholds = new Set();
    let pestImageSizes = new Set();
    let pestModelClasses = [];
    let pestDevice = '';
    let pestReport = null;
    let diagnosisBusy = false;
    let diagnosisGeneration = 0;

    function message(text, error = false) {
        get('detection-status').textContent = text;
        get('detection-status').classList.toggle('text-danger', error);
    }
    async function checkAssistant() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            assistantReady = response.ok && data.ready === true;
            if (assistantReady) {
                get('pest-ai-diagnostic').textContent =
                    'The AI receives model and frame-count summaries only; video frames stay on your machine.';
                get('pest-diagnose').disabled = !pestReport || diagnosisBusy;
            } else {
                get('pest-ai-diagnostic').textContent =
                    'Set OPENAI_API_KEY on the Node server to enable AI diagnostics. Local model detection works without it.';
            }
        } catch (error) {
            assistantReady = false;
            get('pest-ai-diagnostic').textContent =
                'The Node API is unavailable. Start the dashboard server to enable AI diagnostics.';
        }
    }
    async function generatePestDiagnostic() {
        if (!pestMode || !assistantReady || !pestReport || diagnosisBusy) return;
        const token = ++diagnosisGeneration;
        diagnosisBusy = true;
        get('pest-diagnose').disabled = true;
        get('pest-ai-diagnostic').textContent = 'Generating a cautious diagnostic from the detection summary...';
        try {
            const response = await fetch('/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{
                        role: 'user',
                        content: 'Give a concise agricultural diagnostic for this video detection report. Clearly distinguish model labels from confirmed species or damage, explain that counts are repeated frame-level observations, and suggest safe visual follow-up checks. Do not prescribe pesticides or chemical use.'
                    }],
                    fieldContext: JSON.stringify(pestReport),
                    language: window.NabtaI18n.language
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'The assistant could not create a diagnostic.');
            if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('The assistant returned an empty diagnostic.');
            if (token === diagnosisGeneration) {
                get('pest-ai-diagnostic').dataset.generated = 'true';
                get('pest-ai-diagnostic').dir = 'auto';
                get('pest-ai-diagnostic').textContent = result.reply;
            }
        } catch (error) {
            if (token === diagnosisGeneration) {
                get('pest-ai-diagnostic').textContent = 'The AI diagnostic could not be generated.';
                message(error.message, true);
            }
        } finally {
            if (token === diagnosisGeneration) {
                diagnosisBusy = false;
                get('pest-diagnose').disabled = !assistantReady || !pestReport;
            }
        }
    }
    function clock(seconds) {
        const tenths = Math.round(seconds * 10);
        return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths % 600 / 10)).padStart(2, '0')}.${tenths % 10}`;
    }
    function updateControls() {
        get('detect-play').disabled = !ready || !sourceUrl || video.readyState < 2;
        get('detect-play').textContent = running ? 'Pause detection' : 'Start detection';
        get('timeline').disabled = !sourceUrl || !Number.isFinite(video.duration);
    }
    function resetPestReport() {
        if (!pestMode) return;
        delete get('pest-ai-diagnostic').dataset.generated;
        diagnosisGeneration += 1;
        diagnosisBusy = false;
        pestFramesSampled = 0;
        pestFrameDetections = 0;
        pestClassTotals = new Map();
        pestConfidenceThresholds = new Set();
        pestImageSizes = new Set();
        pestReport = null;
        get('pest-summary').textContent = 'Analyze a video to build a frame-level report.';
        get('pest-class-summary').replaceChildren();
        const empty = document.createElement('li');
        empty.textContent = 'No sampled frames yet.';
        get('pest-class-summary').appendChild(empty);
        get('pest-ai-diagnostic').textContent = assistantReady
            ? 'The AI receives model and frame-count summaries only; video frames stay on your machine.'
            : 'AI diagnostics require OPENAI_API_KEY. Local model detection works without it.';
        get('pest-diagnose').disabled = true;
    }
    function updatePestReport(result) {
        pestFramesSampled += 1;
        pestFrameDetections += result.detections.length;
        pestConfidenceThresholds.add(Number(get('confidence').value));
        pestImageSizes.add(Number(get('image-size').value));
        const classesInFrame = new Set();
        for (const detection of result.detections) {
            let totals = pestClassTotals.get(detection.class_name);
            if (!totals) {
                totals = { frames: 0, boxes: 0, maxConfidence: 0 };
                pestClassTotals.set(detection.class_name, totals);
            }
            totals.boxes += 1;
            totals.maxConfidence = Math.max(totals.maxConfidence, detection.confidence);
            classesInFrame.add(detection.class_name);
        }
        for (const className of classesInFrame) pestClassTotals.get(className).frames += 1;

        const summaryList = get('pest-class-summary');
        summaryList.replaceChildren();
        if (pestClassTotals.size === 0) {
            const empty = document.createElement('li');
            empty.textContent = 'No detections above the selected confidence threshold.';
            summaryList.appendChild(empty);
            get('pest-summary').textContent = `No model detections in ${pestFramesSampled} sampled frames. This does not rule out pests in the video.`;
        } else {
            for (const [className, totals] of pestClassTotals) {
                const row = document.createElement('li');
                row.textContent = `${className}: present in ${totals.frames}/${pestFramesSampled} sampled frames; ${totals.boxes} frame detections; maximum score ${(totals.maxConfidence * 100).toFixed(0)}%.`;
                summaryList.appendChild(row);
            }
            get('pest-summary').textContent =
                `${pestFrameDetections} frame-level detections across ${pestFramesSampled} sampled frames. Repeated frames may show the same insect.`;
        }

        pestReport = {
            source: 'Local YOLO video-frame inference',
            modelClasses: pestModelClasses,
            device: pestDevice,
            framesSampled: pestFramesSampled,
            totalFrameDetections: pestFrameDetections,
            confidenceThresholdsUsed: Array.from(pestConfidenceThresholds).sort((a, b) => a - b),
            imageSizesUsed: Array.from(pestImageSizes).sort((a, b) => a - b),
            classSummary: Array.from(pestClassTotals.entries()).map(([label, totals]) => ({
                label,
                framesPresent: totals.frames,
                frameDetections: totals.boxes,
                maximumScore: Number(totals.maxConfidence.toFixed(3))
            })),
            limitations: [
                'Frame detections may refer to the same insect in multiple frames.',
                'The supplied model has only the caterpillar class.',
                'Model scores are not calibrated probabilities and do not diagnose crop damage.'
            ]
        };
        get('pest-diagnose').disabled = !assistantReady || diagnosisBusy;
    }
    function stop() {
        running = false;
        generation++;
        if (controller) controller.abort();
        updateControls();
        return generation;
    }
    function drawPreview() {
        const scale = Math.min(1, 1280 / video.videoWidth, 1280 / video.videoHeight);
        capture.width = Math.round(video.videoWidth * scale);
        capture.height = Math.round(video.videoHeight * scale);
        display.width = capture.width;
        display.height = capture.height;
        capture.getContext('2d').drawImage(video, 0, 0, capture.width, capture.height);
        display.getContext('2d').drawImage(capture, 0, 0);
        for (const id of ['frame-count','weed-count','inference-time','processing-rate']) get(id).textContent = '—';
        get('video-placeholder').hidden = true;
        display.hidden = false;
        get('timeline').value = video.currentTime;
        get('video-position').textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
    }
    function seek(seconds) {
        if (Math.abs(video.currentTime - seconds) < 0.0001 && video.readyState >= 2) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timeout);
                video.removeEventListener('seeked', done);
                video.removeEventListener('error', failed);
                if (error) reject(error); else resolve();
            };
            const done = () => finish();
            const failed = () => finish(new Error('The browser could not decode this video frame.'));
            const timeout = setTimeout(() => finish(new Error('Video seeking timed out.')), 10000);
            video.addEventListener('seeked', done);
            video.addEventListener('error', failed);
            video.currentTime = seconds;
        });
    }
    function drawDetections(result) {
        const ctx = display.getContext('2d');
        ctx.drawImage(capture, 0, 0);
        const scaleX = display.width / result.width;
        const scaleY = display.height / result.height;
        ctx.font = '16px sans-serif';
        ctx.lineWidth = 2;
        for (const detection of result.detections) {
            const crop = ['onion', 'baby-onion'].includes(detection.class_name);
            const color = pestMode ? '#B4F105' : crop ? '#80dc93' : '#ff9f43';
            const [x1,y1,x2,y2] = detection.box;
            ctx.strokeStyle = color;
            ctx.strokeRect(x1*scaleX, y1*scaleY, (x2-x1)*scaleX, (y2-y1)*scaleY);
            const label = `${detection.class_name} ${(detection.confidence*100).toFixed(0)}%`;
            const width = ctx.measureText(label).width + 8;
            const labelX = Math.min(x1*scaleX, Math.max(0, display.width-width));
            const labelY = Math.max(20, y1*scaleY);
            ctx.fillStyle = '#152a20'; ctx.fillRect(labelX, labelY-20, width, 22);
            ctx.fillStyle = color; ctx.fillText(label, labelX+4, labelY-4);
            const stem = detection.stem;
            if (!pestMode && stem && stem.confidence >= 0.3) {
                ctx.fillStyle = '#ffeb3b';
                ctx.beginPath(); ctx.arc(stem.x*scaleX, stem.y*scaleY, 5, 0, Math.PI*2); ctx.fill();
            }
        }
        get('frame-count').textContent = result.detections.length;
        get('weed-count').textContent = pestMode
            ? result.detections.filter(d => d.class_name === 'caterpillar').length
            : result.detections.filter(d => ['weed','grassy-weed'].includes(d.class_name)).length;
        get('inference-time').textContent = `${result.inference_ms.toFixed(0)} ms`;
        if (pestMode) updatePestReport(result);
    }
    async function requestFrame(blob, token) {
        for (let attempt = 0; attempt < 6; attempt++) {
            if (token !== generation) throw new DOMException('Stopped', 'AbortError');
            controller = new AbortController();
            const query = new URLSearchParams({confidence:get('confidence').value, image_size:get('image-size').value});
            const endpoint = pestMode ? '/api/pest-detection/frame?' : '/api/detection/frame?';
            const response = await fetch(endpoint + query, {
                method:'POST', body:blob, headers:{'Content-Type':'image/jpeg'}, signal:controller.signal
            });
            const result = await response.json();
            if (response.status === 429 && attempt < 5) {
                await new Promise(resolve => setTimeout(resolve, 300));
                continue;
            }
            if (!response.ok) throw new Error(result.error || result.detail || 'Frame detection failed.');
            return result;
        }
    }
    async function play() {
        if (running) { stop(); message('Detection paused.'); return; }
        const token = ++generation;
        running = true; updateControls();
        message(pestMode ? 'Detecting caterpillars…' : 'Detecting plants and stems…');
        try {
            const end = Math.max(0, video.duration - 0.001);
            if (video.currentTime >= end) {
                if (pestMode) resetPestReport();
                await seek(0);
            }
            while (running && token === generation) {
                const started = performance.now();
                capture.getContext('2d').drawImage(video, 0, 0, capture.width, capture.height);
                const blob = await new Promise(resolve => capture.toBlob(resolve, 'image/jpeg', 0.9));
                if (!blob) throw new Error('Could not prepare the video frame.');
                const result = await requestFrame(blob, token);
                if (!running || token !== generation) return;
                drawDetections(result);
                get('timeline').value = video.currentTime;
                get('video-position').textContent = `${clock(video.currentTime)} / ${clock(video.duration)}`;
                get('processing-rate').textContent = `${(1000/(performance.now()-started)).toFixed(1)} fps`;
                if (video.currentTime >= end) {
                    running = false; updateControls(); message('Video detection complete.'); return;
                }
                const wait = Math.max(0, 1000/12 - (performance.now()-started));
                if (wait) await new Promise(resolve => setTimeout(resolve, wait));
                if (!running || token !== generation) return;
                await seek(Math.min(end, video.currentTime + 1/12));
            }
        } catch (error) {
            if (token !== generation || error.name === 'AbortError') return;
            running = false; updateControls(); message(error.message, true);
        }
    }
    async function checkHealth(attempt = 0) {
        clearTimeout(healthTimer);
        get('model-status').textContent = 'Loading model…';
        try {
            const endpoint = pestMode ? '/api/pest-detection/health' : '/api/detection/health';
            const response = await fetch(endpoint);
            const data = await response.json();
            if (!response.ok || !data.ready) throw new Error(data.error || 'Model unavailable.');
            ready = true;
            if (pestMode) {
                pestModelClasses = data.classes || ['caterpillar'];
                pestDevice = data.device || 'local';
                get('model-status').textContent = `Pest model ready · ${pestDevice} · ${pestModelClasses.join(', ')}`;
            } else {
                get('model-status').textContent = `Model ready · ${data.device} · one stem keypoint`;
            }
            updateControls();
        } catch (error) {
            ready = false; updateControls();
            get('model-status').textContent = error.message;
            if (attempt < 20) healthTimer = setTimeout(() => checkHealth(attempt+1), 4000);
        }
    }
    get('video-file').onchange = () => {
        stop();
        if (pestMode) resetPestReport();
        const file = get('video-file').files[0];
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        sourceUrl = undefined;
        display.hidden = true; get('video-placeholder').hidden = false;
        get('video-position').textContent = '0:00 / 0:00';
        for (const id of ['frame-count','weed-count','inference-time','processing-rate']) get(id).textContent = '—';
        if (!file) { video.removeAttribute('src'); updateControls(); return; }
        sourceUrl = URL.createObjectURL(file); video.src = sourceUrl; video.load();
        updateControls();
        message('Reading video…');
    };
    video.onloadeddata = () => {
        if (!Number.isFinite(video.duration) || !video.videoWidth) {
            message('Choose a video with a readable duration and video track.', true); return;
        }
        drawPreview(); get('timeline').max = Math.max(0, video.duration-0.001);
        updateControls(); message('Video ready. Start detection to analyze it.');
    };
    video.onerror = () => { stop(); message('This video could not be decoded. Try an H.264 MP4.', true); };
    get('timeline').onchange = async () => {
        const token = stop();
        try {
            await seek(Number(get('timeline').value));
            if (token === generation) { drawPreview(); message('Position selected. Start detection to continue.'); }
        } catch (error) { if (token === generation) message(error.message, true); }
    };
    get('detect-play').onclick = play;
    get('check-model').onclick = () => checkHealth();
    if (pestMode) {
        get('pest-diagnose').onclick = generatePestDiagnostic;
        resetPestReport();
        checkAssistant();
    }
    window.addEventListener('pagehide', () => {
        stop(); clearTimeout(healthTimer);
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    });
    checkHealth();
}());
