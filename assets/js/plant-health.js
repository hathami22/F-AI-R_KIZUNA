(function () {
    'use strict';
    const get = id => document.getElementById(id);
    let file;
    let previewUrl;
    let ready = false;
    let previewReady = false;
    let busy = false;
    let generation = 0;
    let controller;
    let timer;

    function update() {
        get('analyze-plant').disabled = !ready || !file || !previewReady || !get('plant-crop').value || busy;
        get('analyze-plant').textContent = busy ? 'Analyzing leaf…' : 'Analyze leaf';
    }
    function message(text, error = false) {
        get('plant-message').textContent = text;
        get('plant-message').classList.toggle('text-danger', error);
    }
    function clearResult() {
        generation++;
        if (controller) controller.abort();
        busy = false;
        get('plant-result').hidden = true;
        update();
    }
    async function health(attempt = 0) {
        clearTimeout(timer);
        get('plant-model-status').textContent = 'Checking plant-health model…';
        try {
            const response = await fetch('/api/plant-health/health');
            const status = await response.json();
            if (!response.ok) throw new Error(status.error || 'Inference service unavailable.');
            ready = status.ready === true;
            get('plant-model-status').textContent = ready
                ? `MobileNetV3-Large ready · ${status.device} · ${status.plants.length} crops`
                : status.error || 'Plant-health model unavailable.';
            if (ready) {
                const selected = get('plant-crop').value;
                get('plant-crop').replaceChildren(new Option('Choose crop', ''));
                for (const crop of status.plants) get('plant-crop').add(new Option(crop, crop));
                if (status.plants.includes(selected)) get('plant-crop').value = selected;
                get('supported-crops').textContent = status.plants.join(', ');
            }
            update();
        } catch (error) {
            ready = false;
            get('plant-model-status').textContent = error.message;
            update();
            if (attempt < 20) timer = setTimeout(() => health(attempt + 1), 4000);
        }
    }
    get('leaf-photo').onchange = () => {
        clearResult();
        previewReady = false;
        file = undefined;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        get('leaf-preview').hidden = true;
        get('leaf-preview').removeAttribute('src');
        get('leaf-placeholder').hidden = false;
        const selected = get('leaf-photo').files[0];
        if (!selected) { message('Choose a leaf photo and its crop.'); update(); return; }
        if (selected.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
            message('Choose a JPEG, PNG, or WebP image up to 8 MB.', true); update(); return;
        }
        file = selected;
        previewUrl = URL.createObjectURL(file);
        get('leaf-preview').src = previewUrl;
        message('Choose the crop, then analyze the leaf.');
        update();
    };
    get('leaf-preview').onload = () => {
        const image = get('leaf-preview');
        if (image.naturalWidth * image.naturalHeight > 16000000) {
            file = undefined; previewReady = false;
            message('Choose an image up to 16 megapixels.', true); update(); return;
        }
        previewReady = true; image.hidden = false; get('leaf-placeholder').hidden = true; update();
    };
    get('leaf-preview').onerror = () => {
        if (!file) return;
        file = undefined; previewReady = false;
        message('The browser could not read this image.', true); update();
    };
    get('plant-crop').onchange = () => { clearResult(); message('Crop selected. Analyze the photo to update the result.'); };
    get('plant-check-model').onclick = () => health();
    get('plant-form').onsubmit = async event => {
        event.preventDefault();
        if (get('analyze-plant').disabled) return;
        clearResult();
        const token = generation;
        busy = true; update(); message('Analyzing the leaf photo…');
        controller = new AbortController();
        try {
            const query = new URLSearchParams({plant: get('plant-crop').value});
            const response = await fetch('/api/plant-health/predict?' + query, {
                method: 'POST', body: file, headers: {'Content-Type': file.type}, signal: controller.signal
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || result.detail || 'Analysis failed.');
            if (token !== generation) return;
            get('condition-name').textContent = result.disease;
            get('prediction-status').textContent = result.reliable
                ? `Predicted ${result.status.toLowerCase()} · ${result.plant}`
                : `Uncertain prediction · ${result.plant}`;
            get('prediction-confidence').textContent = `${(result.confidence * 100).toFixed(1)}%`;
            get('prediction-threshold').textContent = `${Math.round(result.confidence_threshold * 100)}% model threshold · ${(result.inference_ms).toFixed(0)} ms`;
            get('confidence-message').textContent = result.reliable
                ? 'Above the model threshold. Verify the prediction against the actual plant and growing conditions.'
                : 'Below the model threshold. Review the photo and verify the condition manually.';
            get('confidence-message').className = result.reliable ? 'plant-confidence' : 'plant-confidence uncertain';
            get('plant-alternatives').replaceChildren();
            for (const [condition, probability] of result.top_predictions) {
                const row = document.createElement('tr');
                const name = document.createElement('td'); name.textContent = condition;
                const score = document.createElement('td'); score.textContent = `${(probability*100).toFixed(1)}%`;
                score.className = 'text-end'; row.append(name, score); get('plant-alternatives').append(row);
            }
            get('plant-result').hidden = false;
            message('Leaf analysis complete.');
        } catch (error) {
            if (token === generation && error.name !== 'AbortError') message(error.message, true);
        } finally {
            if (token === generation) { busy = false; update(); }
        }
    };
    window.addEventListener('pagehide', () => {
        clearTimeout(timer); generation++;
        if (controller) controller.abort();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    });
    health();
}());
