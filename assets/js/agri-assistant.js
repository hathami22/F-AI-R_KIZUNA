(function () {
    'use strict';

    const form = document.querySelector('#assistant-form');
    const input = document.querySelector('#assistant-input');
    const sendButton = document.querySelector('#assistant-send');
    const messagesElement = document.querySelector('#assistant-messages');
    const statusElement = document.querySelector('#assistant-connection-status');
    const errorElement = document.querySelector('#assistant-error');
    const dataStatusElement = document.querySelector('#assistant-data-status');
    const summaryElement = document.querySelector('#assistant-field-summary');
    const conversation = [];
    let fieldContext = '';
    let apiReady = false;
    let busy = false;

    function setStatus(message, state) {
        statusElement.textContent = message;
        statusElement.dataset.state = state;
    }

    function showError(message) {
        errorElement.textContent = message;
        errorElement.hidden = false;
    }

    function clearError() {
        errorElement.textContent = '';
        errorElement.hidden = true;
    }

    function appendMessage(role, text) {
        const message = document.createElement('article');
        message.className = 'assistant-message assistant-message-' + role;

        const label = document.createElement('span');
        label.className = 'assistant-message-label';
        label.textContent = role === 'user' ? 'You' : 'Nabta';

        const content = document.createElement('p');
        content.className = 'assistant-message-content';
        content.textContent = text;

        message.appendChild(label);
        message.appendChild(content);
        messagesElement.appendChild(message);
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    function addSummaryRow(label, value) {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        summaryElement.appendChild(term);
        summaryElement.appendChild(description);
    }

    function limitHistoryMessage(text) {
        let value = '';
        for (const character of text) {
            if (value.length + character.length > 5000) {
                break;
            }
            value += character;
        }
        return value;
    }

    function summarizeFieldData(data) {
        const summary = data.summary;
        const species = Object.entries(summary.species).sort(function (left, right) {
            return right[1] - left[1];
        }).slice(0, 6).map(function (entry) {
            return { species: entry[0], detections: entry[1] };
        });
        const hotspots = data.densityCells.slice().sort(function (left, right) {
            return right.weedsPerM2 - left.weedsPerM2;
        }).slice(0, 5).map(function (cell) {
            return {
                densityPerM2: cell.weedsPerM2,
                uniqueWeeds: cell.uniqueWeeds,
                surveyedM2: cell.surveyedM2
            };
        });

        fieldContext = JSON.stringify({
            dataset: 'Simulated field survey; observations are not live monitoring.',
            summary: {
                totalDetections: summary.totalDetections,
                treated: summary.treated,
                cropProtected: summary.cropProtected,
                missed: summary.missed,
                treatmentCoveragePercent: Number(summary.treatmentCoverage.toFixed(1)),
                routePoints: summary.routePoints,
                routeDurationSeconds: summary.routeDurationSeconds,
                routeDistanceMeters: Number(summary.routeDistanceMeters.toFixed(1)),
                surveyedAreaM2: Number(summary.surveyedAreaM2.toFixed(1)),
                densityCells: summary.densityCells,
                peakDensityPerM2: summary.peakDensity
            },
            leadingSpecies: species,
            highestDensityCells: hotspots
        });

        summaryElement.replaceChildren();
        addSummaryRow('Detections', summary.totalDetections.toLocaleString());
        addSummaryRow('Treated', summary.treated.toLocaleString() + ' (' + summary.treatmentCoverage.toFixed(1) + '%)');
        addSummaryRow('Crop protected', summary.cropProtected.toLocaleString());
        addSummaryRow('Missed', summary.missed.toLocaleString());
        addSummaryRow('Surveyed area', Math.round(summary.surveyedAreaM2).toLocaleString() + ' m²');
        addSummaryRow('Peak density', summary.peakDensity + ' weeds/m²');
        dataStatusElement.textContent = 'Survey data loaded';
        dataStatusElement.dataset.state = 'ready';
    }

    async function checkApi() {
        const response = await fetch('/api/health');
        if (!response.ok) {
            throw new Error('The assistant server returned HTTP ' + response.status + '.');
        }
        const status = await response.json();
        apiReady = status.ready === true;
        if (apiReady) {
            setStatus('Assistant ready', 'ready');
        } else {
            setStatus('API key not configured', 'warning');
            showError('Add OPENAI_API_KEY to the server environment and restart the Node server to enable chat.');
        }
    }

    async function submitMessage(text) {
        if (busy || !text || !text.trim()) {
            return;
        }
        if (!apiReady) {
            showError('The agriculture assistant is unavailable. Start the Node server with OPENAI_API_KEY configured.');
            return;
        }

        const userMessage = text.trim();
        appendMessage('user', userMessage);
        input.value = '';
        sendButton.disabled = true;
        busy = true;
        clearError();
        setStatus('Nabta is thinking...', 'working');

        try {
            const requestMessages = conversation.concat({ role: 'user', content: userMessage }).slice(-10);
            let requestChars = requestMessages.reduce(function (total, message) {
                return total + message.content.length;
            }, 0);
            while (requestMessages.length > 1 && requestChars > 9000) {
                requestChars -= requestMessages.shift().content.length;
            }
            const response = await fetch('/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: requestMessages,
                    fieldContext: fieldContext
                })
            });
            let result;
            try {
                result = await response.json();
            } catch (error) {
                throw new Error('The assistant server returned an invalid response.');
            }
            if (!response.ok) {
                throw new Error(result.error || 'The assistant could not answer. Please try again.');
            }
            if (typeof result.reply !== 'string' || !result.reply.trim()) {
                throw new Error('The assistant returned an empty reply. Please try again.');
            }

            conversation.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: limitHistoryMessage(result.reply) }
            );
            if (conversation.length > 10) {
                conversation.splice(0, conversation.length - 10);
            }
            appendMessage('assistant', result.reply);
            setStatus('Assistant ready', 'ready');
        } catch (error) {
            showError(error.message);
            setStatus('Assistant unavailable', 'error');
        } finally {
            busy = false;
            sendButton.disabled = !input.value.trim();
            input.focus();
        }
    }

    if (!form || !input || !sendButton || !messagesElement) {
        return;
    }

    appendMessage('assistant', 'Hello! I can help interpret the supplied survey and discuss general agriculture topics. What would you like to know?');

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitMessage(input.value);
    });

    input.addEventListener('input', function () {
        sendButton.disabled = busy || !input.value.trim();
    });

    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            submitMessage(input.value);
        }
    });

    document.querySelectorAll('.assistant-prompt').forEach(function (button) {
        button.addEventListener('click', function () {
            input.value = button.dataset.prompt || '';
            sendButton.disabled = busy || !input.value.trim();
            submitMessage(input.value);
        });
    });

    Promise.allSettled([
        checkApi(),
        window.NabtaFieldData.load().then(summarizeFieldData)
    ]).then(function (results) {
        if (results[0].status === 'rejected') {
            setStatus('Start Node server to chat', 'error');
            showError('The API connection failed. Run node server.js with OPENAI_API_KEY set, then open the dashboard from http://localhost:3000.');
        }
        if (results[1].status === 'rejected') {
            dataStatusElement.textContent = 'Survey data unavailable';
            dataStatusElement.dataset.state = 'error';
            console.error('Unable to prepare field context for the agriculture assistant.', results[1].reason);
        }
    });
}());
