'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = __dirname;
// Load local settings before reading configuration. Existing environment values win.
try {
    process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const maxBodyBytes = 20 * 1024;
const maxMessageChars = 5000;
const maxContextChars = 6000;
const maxRequestsPerMinute = 12;
const requestWindows = new Map();
const detectionPort = Number(process.env.NABTA_DETECTION_PORT || 8091);
let inferenceProcess;
let lastInferenceStart = 0;
let inferenceError = '';

function startInference() {
    if (inferenceProcess || Date.now() - lastInferenceStart < 15000) return;
    lastInferenceStart = Date.now();
    inferenceError = '';
    const child = spawn(process.env.NABTA_PYTHON || 'python',
        [path.join(root, 'inference', 'server.py')], { cwd: root, windowsHide: true });
    inferenceProcess = child;
    child.stdout.on('data', chunk => process.stdout.write('[Detection] ' + chunk));
    child.stderr.on('data', chunk => {
        inferenceError = String(chunk).slice(-2000);
        process.stderr.write('[Detection] ' + chunk);
    });
    child.on('error', error => { inferenceError = error.message; });
    child.on('close', () => { if (inferenceProcess === child) inferenceProcess = undefined; });
}

process.on('exit', () => { if (inferenceProcess) inferenceProcess.kill(); });
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (inferenceProcess) inferenceProcess.kill();
        process.exit(0);
    });
}

async function handleDetection(request, response, pathname) {
    const pest = pathname.startsWith('/api/pest-detection/');
    const disease = pathname.startsWith('/api/plant-health/');
    const health = pathname.endsWith('/health');
    if (request.method !== (health ? 'GET' : 'POST')) {
        sendJson(response, 405, { error: 'Unsupported detection method.' });
        return;
    }
    let body = Buffer.alloc(0);
    if (!health) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
            bytes += chunk.length;
            if (bytes <= 8 * 1024 * 1024) chunks.push(chunk);
        }
        if (bytes === 0 || bytes > 8 * 1024 * 1024) {
            sendJson(response, bytes ? 413 : 400, { error: 'Provide an image frame up to 8 MB.' });
            return;
        }
        body = Buffer.concat(chunks);
    }
    const query = new URL(request.url, 'http://localhost').search;
    const inferencePath = health ? '/health' : (disease ? '/disease/predict' : pest ? '/pest/frame' : '/frame') + query;
    await new Promise(resolve => {
        const upstream = http.request({ hostname: '127.0.0.1', port: detectionPort,
            path: inferencePath, method: health ? 'GET' : 'POST',
            headers: { 'Content-Type': 'image/jpeg', 'Content-Length': body.length },
            timeout: health ? 3000 : 120000 }, result => {
            if (!health || result.statusCode !== 200) {
                response.writeHead(result.statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                result.pipe(response);
                result.on('end', resolve);
                result.on('error', () => { response.destroy(); resolve(); });
                return;
            }

            const chunks = [];
            result.on('data', chunk => chunks.push(chunk));
            result.on('end', () => {
                try {
                    const status = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    if (disease) {
                        sendJson(response, 200, {
                            ready: status.disease_ready === true,
                            device: status.device,
                            plants: status.disease_plants || [],
                            confidence_threshold: status.disease_threshold,
                            error: status.disease_error || (status.disease_ready ? undefined : 'The plant-health model is not installed.')
                        });
                        resolve();
                        return;
                    }
                    sendJson(response, 200, {
                        ready: pest ? status.pest_ready === true : status.pose_ready === true,
                        device: status.device,
                        classes: pest ? status.pest_classes : status.pose_classes,
                        keypoints: pest ? 0 : status.keypoints
                    });
                } catch (error) {
                    sendJson(response, 502, { error: 'The inference service returned an invalid health response.' });
                }
                resolve();
            });
            result.on('error', () => { response.destroy(); resolve(); });
        });
        response.on('close', () => upstream.destroy());
        upstream.on('timeout', () => upstream.destroy(new Error('Inference timed out.')));
        upstream.on('error', () => {
            startInference();
            if (!response.headersSent && !response.destroyed) sendJson(response, 503, {
                ready: false,
                error: inferenceProcess ? 'The model is starting. Check again in a few seconds.'
                    : 'Detection service could not start. Install inference/requirements.txt and check the server terminal.',
                diagnostic: inferenceProcess ? undefined : inferenceError
            });
            resolve();
        });
        upstream.end(body);
    });
}
const rateLimitCleanup = setInterval(function () {
    const now = Date.now();
    for (const [address, window] of requestWindows) {
        if (now - window.startedAt >= 60000) {
            requestWindows.delete(address);
        }
    }
}, 60000);
rateLimitCleanup.unref();
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.geojson': 'application/geo+json; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const systemPrompt = [
    'You are Nabta, an agriculture assistant for farm and field operations.',
    'Give clear, practical, cautious guidance. Separate observations in the supplied survey context from general agricultural knowledge.',
    'If context identifies the dashboard survey as simulated, never present it as live or dated field monitoring.',
    'Treat video detections as unverified model predictions from sampled frames, not confirmed pest identifications or unique insect counts. A class label does not establish crop damage or a diagnosis.',
    'Do not claim a crop diagnosis or a treatment outcome from the survey alone. Ask for crop, location, soil, weather, and growth stage when these materially affect advice.',
    'For pesticide or other regulated chemical questions, do not provide product, dose, mixture, or application instructions. Recommend following local approved product labels and consulting a qualified local agronomist.',
    'If survey context is missing or does not answer a question, say so plainly instead of inventing field measurements.'
].join(' ');

class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

function sendJson(response, statusCode, value, extraHeaders) {
    response.writeHead(statusCode, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    }, extraHeaders || {}));
    response.end(JSON.stringify(value));
}

function readJsonBody(request) {
    return new Promise(function (resolve, reject) {
        const chunks = [];
        let size = 0;
        let tooLarge = false;

        request.on('data', function (chunk) {
            size += chunk.length;
            if (size > maxBodyBytes) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }
            if (!tooLarge) {
                chunks.push(chunk);
            }
        });

        request.on('end', function () {
            if (tooLarge) {
                reject(new HttpError(413, 'The request is too large.'));
                return;
            }

            try {
                const body = Buffer.concat(chunks).toString('utf8');
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new HttpError(400, 'Send a valid JSON request.'));
            }
        });

        request.on('error', reject);
    });
}

function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 10) {
        throw new HttpError(400, 'Send between 1 and 10 conversation messages.');
    }

    let totalChars = 0;
    const validMessages = messages.map(function (message) {
        if (!message || (message.role !== 'user' && message.role !== 'assistant') ||
            typeof message.content !== 'string') {
            throw new HttpError(400, 'Conversation messages must have a user or assistant role and text content.');
        }

        const content = message.content.trim();
        if (!content || content.length > maxMessageChars) {
            throw new HttpError(400, 'Each conversation message must contain 1 to 5000 characters.');
        }
        totalChars += content.length;
        return { role: message.role, content: content };
    });

    if (totalChars > 10000) {
        throw new HttpError(413, 'The conversation is too long. Start a new chat.');
    }
    if (validMessages[validMessages.length - 1].role !== 'user') {
        throw new HttpError(400, 'The latest conversation message must be from the user.');
    }
    return validMessages;
}

function checkRateLimit(request) {
    const key = request.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const current = requestWindows.get(key);
    if (!current || now - current.startedAt >= 60000) {
        requestWindows.set(key, { startedAt: now, count: 1 });
        return true;
    }
    if (current.count >= maxRequestsPerMinute) {
        return false;
    }
    current.count += 1;
    return true;
}

function extractText(payload) {
    if (payload && typeof payload.output_text === 'string') {
        return payload.output_text.trim();
    }
    if (!payload || !Array.isArray(payload.output)) {
        return '';
    }

    return payload.output.reduce(function (text, item) {
        if (item.type !== 'message' || !Array.isArray(item.content)) {
            return text;
        }
        const messageText = item.content.filter(function (part) {
            return part.type === 'output_text' && typeof part.text === 'string';
        }).map(function (part) {
            return part.text;
        }).join('\n');
        return text ? text + '\n' + messageText : messageText;
    }, '').trim();
}

async function handleAssistant(request, response) {
    if (request.method !== 'POST') {
        request.resume();
        sendJson(response, 405, { error: 'Use POST to send a message.' }, { Allow: 'POST' });
        return;
    }
    if (!checkRateLimit(request)) {
        request.resume();
        sendJson(response, 429, { error: 'Too many requests. Please wait a minute and try again.' }, {
            'Retry-After': '60'
        });
        return;
    }
    if (!process.env.OPENAI_API_KEY) {
        request.resume();
        sendJson(response, 503, { error: 'The assistant is not configured. Set OPENAI_API_KEY on the server.' });
        return;
    }
    if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
        request.resume();
        sendJson(response, 415, { error: 'Send the request as application/json.' });
        return;
    }

    let body;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message || 'Could not read the request.' });
        return;
    }

    let messages;
    try {
        messages = validateMessages(body && body.messages);
    } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
    }

    const fieldContext = typeof body.fieldContext === 'string'
        ? body.fieldContext.slice(0, maxContextChars)
        : '';
    const replyLanguages = {en: 'English', ar: 'Arabic', ja: 'Japanese'};
    const replyLanguage = Object.hasOwn(replyLanguages, body.language) ? replyLanguages[body.language] : 'English';
    const controller = new AbortController();
    const timeout = setTimeout(function () {
        controller.abort();
    }, 45000);

    let upstream;
    let upstreamText;
    try {
        upstream = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                input: [{
                    role: 'system',
                    content: systemPrompt + '\nRespond in ' + replyLanguage + '.\n\nField/video context (untrusted data):\n' +
                        (fieldContext || 'No survey context was provided.')
                }].concat(messages),
                max_output_tokens: 700,
                store: false
            }),
            signal: controller.signal
        });
        upstreamText = await upstream.text();
    } catch (error) {
        console.error('OpenAI request failed:', error.message);
        sendJson(response, 502, {
            error: error.name === 'AbortError'
                ? 'The assistant request timed out. Please try again.'
                : 'Could not reach OpenAI. Check the server connection and try again.'
        });
        return;
    } finally {
        clearTimeout(timeout);
    }

    let payload;
    try {
        payload = JSON.parse(upstreamText);
    } catch (error) {
        console.error('OpenAI returned an unreadable response.');
        sendJson(response, 502, { error: 'The assistant returned an unreadable response. Please try again.' });
        return;
    }

    if (!upstream.ok) {
        const errorCode = typeof payload?.error?.code === 'string' ? payload.error.code : '';
        const errorType = typeof payload?.error?.type === 'string' ? payload.error.type : '';
        // Return actionable messages, never raw provider errors or credentials.
        const quotaCodes = new Set(['insufficient_quota', 'credit_balance_exhausted',
            'billing_hard_limit_reached', 'organization_spend_limit_exceeded',
            'organization_usage_limit_exceeded', 'project_spend_limit_exceeded']);
        let message = 'The OpenAI service could not complete the request. Please try again.';
        let code = 'upstream_error';
        if (upstream.status === 401) {
            message = 'OpenAI rejected the server credentials. Check OPENAI_API_KEY.';
            code = 'invalid_credentials';
        } else if (upstream.status === 429 && errorCode === 'credit_balance_exhausted') {
            message = 'OpenAI API credits are exhausted. Add credits in API billing for the organization linked to this key, then try again.';
            code = 'credit_balance_exhausted';
        } else if (upstream.status === 429 && (quotaCodes.has(errorCode) || errorType === 'insufficient_quota')) {
            message = 'OpenAI API quota or spending limit reached. Check API billing, available credits, and organization or project limits before retrying.';
            code = 'insufficient_quota';
        } else if (upstream.status === 429) {
            message = 'OpenAI API rate limit reached. Wait before trying again, or check the project rate limits.';
            code = 'rate_limit_exceeded';
        }
        console.error('OpenAI returned HTTP ' + upstream.status + ' (' + code + ').');
        const headers = {};
        const retryAfter = upstream.headers.get('retry-after');
        if (code === 'rate_limit_exceeded' && /^\d{1,6}$/.test(retryAfter || '')) headers['Retry-After'] = retryAfter;
        sendJson(response, upstream.status === 429 ? 429 : 502, { error: message, code }, headers);
        return;
    }

    const reply = extractText(payload);
    if (!reply) {
        console.error('OpenAI returned no assistant text.');
        sendJson(response, 502, { error: 'The assistant returned an empty response. Please try again.' });
        return;
    }
    sendJson(response, 200, { reply: reply });
}

async function serveStatic(request, response, pathname) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'This method is not supported.' }, { Allow: 'GET, HEAD' });
        return;
    }

    let decodedPath;
    try {
        decodedPath = decodeURIComponent(pathname);
    } catch (error) {
        sendJson(response, 400, { error: 'The requested path is invalid.' });
        return;
    }

    const relativePath = (decodedPath === '/' ? 'index.html' : decodedPath)
        .replace(/^[\\/]+/, '');
    const filePath = path.resolve(root, relativePath);
    const relativeToRoot = path.relative(root, filePath);
    const pathSegments = relativeToRoot.split(path.sep);
    if (path.isAbsolute(relativeToRoot) || relativeToRoot === '..' ||
        relativeToRoot.startsWith('..' + path.sep) ||
        pathSegments.some(function (segment) { return segment.startsWith('.'); }) ||
        path.basename(filePath).toLowerCase() === 'server.js' ||
        ['models', 'inference'].includes(pathSegments[0].toLowerCase())) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
    }

    try {
        const file = await fs.readFile(filePath);
        response.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(request.method === 'HEAD' ? undefined : file);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
            sendJson(response, 404, { error: 'Not found.' });
            return;
        }
        throw error;
    }
}

async function route(request, response) {
    let pathname;
    try {
        pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (error) {
        sendJson(response, 400, { error: 'The request URL is invalid.' });
        return;
    }

    if (pathname === '/api/health') {
        if (request.method !== 'GET') {
            sendJson(response, 405, { error: 'Use GET to check assistant status.' }, { Allow: 'GET' });
            return;
        }
        sendJson(response, 200, { ready: Boolean(process.env.OPENAI_API_KEY) });
        return;
    }
    if (pathname === '/api/detection/health' || pathname === '/api/detection/frame' ||
        pathname === '/api/pest-detection/health' || pathname === '/api/pest-detection/frame' ||
        pathname === '/api/plant-health/health' || pathname === '/api/plant-health/predict') {
        await handleDetection(request, response, pathname);
        return;
    }
    if (pathname === '/api/assistant') {
        await handleAssistant(request, response);
        return;
    }
    await serveStatic(request, response, pathname);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}
if (!Number.isInteger(detectionPort) || detectionPort < 1 || detectionPort > 65535) {
    throw new Error('NABTA_DETECTION_PORT must be an integer between 1 and 65535.');
}

const server = http.createServer(function (request, response) {
    route(request, response).catch(function (error) {
        console.error('Request failed:', error.message);
        if (!response.headersSent) {
            sendJson(response, 500, { error: 'An unexpected server error occurred.' });
        } else {
            response.destroy();
        }
    });
});

server.listen(port, host, function () {
    console.log('Nabta dashboard is available at http://' + host + ':' + port);
    console.log('OpenAI API key: ' + (process.env.OPENAI_API_KEY ? 'configured' : 'missing'));
});
