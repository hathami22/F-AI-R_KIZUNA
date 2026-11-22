// Native Node integration tests. All Google requests are mocked; no real key or API usage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');

async function freePort() {
    return new Promise(resolve => {
        const socket = net.createServer();
        socket.listen(0, '127.0.0.1', () => {
            const port = socket.address().port;
            socket.close(() => resolve(port));
        });
    });
}

test('Gemini assistant transport and error handling', async t => {
    const root = path.resolve(__dirname, '..');
    const temp = path.join(root, '.playwright-cli');
    await fs.mkdir(temp, {recursive: true});
    const fixture = await fs.mkdtemp(path.join(temp, 'gemini-test-'));
    await fs.copyFile(path.join(root, 'server.js'), path.join(fixture, 'server.js'));
    await fs.writeFile(path.join(fixture, 'mock.cjs'), `
const assert = require('node:assert/strict');
global.fetch = async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'gemini-test-key');
    assert.equal(options.headers.Authorization, undefined);
    const body = JSON.parse(options.body);
    assert.equal(body.model, undefined);
    assert.equal(body.generationConfig.maxOutputTokens, 2048);
    const prompt = body.contents.at(-1).parts[0].text;
    const error = (status, code, details = []) => new Response(JSON.stringify({error: {
        status: code, message: 'private provider diagnostic', details
    }}), {status});
    if (prompt === 'auth') return error(400, 'INVALID_ARGUMENT', [{reason:'API_KEY_INVALID'}]);
    if (prompt === 'denied') return error(403, 'PERMISSION_DENIED');
    if (prompt === 'model') return error(404, 'NOT_FOUND');
    if (prompt === 'billing') return error(402, 'PAYMENT_REQUIRED');
    if (prompt === 'setup') return error(400, 'FAILED_PRECONDITION');
    if (prompt === 'quota') return error(429, 'RESOURCE_EXHAUSTED', [
        {'@type':'type.googleapis.com/google.rpc.RetryInfo', retryDelay:'3.2s'}]);
    if (prompt === 'busy') return error(503, 'UNAVAILABLE');
    if (prompt === 'bad-json') return new Response('not JSON', {status:200});
    if (prompt === 'blocked') return new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}));
    if (prompt === 'empty') return new Response(JSON.stringify({candidates:[]}));
    assert.deepEqual(body.contents.map(item=>item.role), ['user','model','user']);
    assert.equal(body.contents[1].parts[0].text, 'Earlier reply');
    assert.ok(body.systemInstruction.parts[0].text.includes('Respond in Japanese'));
    assert.ok(body.systemInstruction.parts[0].text.includes('Field/video context (untrusted data):'));
    assert.ok(body.systemInstruction.parts[0].text.includes('synthetic field example'));
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[
        {thought:true,text:'internal thought'}, {text:'Field answer.'}, {text:'Next step.'}
    ]}}]}));
};
`);
    async function start(key) {
        const port = await freePort();
        const child = spawn(process.execPath, ['--require', path.join(fixture, 'mock.cjs'), path.join(fixture, 'server.js')], {
            env: {...process.env, OPENAI_API_KEY: 'legacy-test-key', GEMINI_API_KEY: key, GEMINI_MODEL: 'gemini-test', PORT: String(port)},
            windowsHide: true, stdio: 'ignore'
        });
        const base = 'http://127.0.0.1:' + port;
        for (let i = 0; i < 60; i++) {
            if (child.exitCode !== null) throw new Error('Fixture server exited early.');
            try { await fetch(base + '/api/health'); return {child, base}; }
            catch (_) { await new Promise(resolve => setTimeout(resolve, 30)); }
        }
        child.kill(); throw new Error('Fixture server did not start.');
    }
    async function stop(child) {
        if (child.exitCode !== null) return;
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill(); await exited;
    }
    const {child, base} = await start('gemini-test-key');
    t.after(() => stop(child));
    async function ask(content, extra = {}) {
        return fetch(base + '/api/assistant', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({messages:[{role:'user',content}], ...extra})
        });
    }
    await t.test('health exposes provider and model without credentials', async () => {
        const health = await (await fetch(base + '/api/health')).json();
        assert.deepEqual(health, {ready:true,provider:'gemini',model:'gemini-test'});
        assert.equal((await fetch(base + '/.env')).status, 404);
    });
    await t.test('maps history and language; excludes thought parts', async () => {
        const response = await ask('answer', {
            messages:[{role:'user',content:'Earlier question'}, {role:'assistant',content:'Earlier reply'}, {role:'user',content:'answer'}],
            language:'ja', fieldContext:'synthetic field example'
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {reply:'Field answer.\nNext step.'});
    });
    for (const [prompt, status, code] of [
        ['auth',502,'invalid_credentials'], ['denied',502,'access_denied'],
        ['model',502,'model_unavailable'], ['billing',502,'project_setup_required'],
        ['setup',502,'project_setup_required'], ['quota',429,'quota_or_rate_limit'],
        ['busy',503,'service_unavailable'], ['bad-json',502,undefined],
        ['blocked',502,'empty_response'], ['empty',502,'empty_response']
    ]) {
        await t.test('handles ' + prompt, async () => {
            const response = await ask(prompt);
            const body = await response.json();
            assert.equal(response.status, status);
            assert.equal(body.code, code);
            assert.equal(JSON.stringify(body).includes('private provider diagnostic'), false);
            assert.equal(JSON.stringify(body).includes('gemini-test-key'), false);
            assert.equal(response.headers.get('retry-after'), prompt === 'quota' ? '4' : null);
        });
    }
    await t.test('OpenAI configuration alone does not enable Gemini', async () => {
        const other = await start('');
        try {
            const health = await (await fetch(other.base + '/api/health')).json();
            assert.equal(health.ready, false);
            const response = await fetch(other.base + '/api/assistant', {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
            assert.equal(response.status, 503);
            assert.ok((await response.json()).error.includes('GEMINI_API_KEY'));
        } finally { await stop(other.child); }
    });
});
