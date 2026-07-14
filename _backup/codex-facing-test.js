const fs = require('fs');

const port = 9555;
const url = 'file:///C:/Users/Ricardo/Desktop/Jogo%20Objetivo/index.html';

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    const page = pages.find(item => item.type === 'page' && item.url.includes('index.html'));
    if (!page) throw new Error('Page not found');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();

    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(JSON.stringify(message.error)));
            else resolve(message.result);
        }
    });

    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));

    function send(method, params = {}) {
        const messageId = ++id;
        ws.send(JSON.stringify({ id: messageId, method, params }));
        return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    }

    async function key(code, down) {
        const values = {
            ArrowRight: [39, 'ArrowRight'],
            ArrowLeft: [37, 'ArrowLeft']
        };
        const [windowsVirtualKeyCode, key] = values[code];
        await send('Input.dispatchKeyEvent', {
            type: down ? 'keyDown' : 'keyUp',
            windowsVirtualKeyCode,
            code,
            key
        });
    }

    async function shot(name) {
        await wait(500);
        const state = await send('Runtime.evaluate', {
            returnByValue: true,
            expression: `({ facing: player.facing, vx: player.vx, currentAnim: animManager.currentAnim, frameIndex: animManager.frameIndex, x: player.x })`
        });
        const image = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
        fs.writeFileSync(`${name}.png`, Buffer.from(image.data, 'base64'));
        return state.result.value;
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        mobile: false
    });
    await send('Page.navigate', { url });
    await wait(1000);
    await send('Runtime.evaluate', {
        expression: `document.getElementById('btn-start').click(); document.getElementById('btn-story-next').click();`
    });
    await wait(1000);

    await key('ArrowRight', true);
    await wait(700);
    await key('ArrowRight', false);
    const afterRight = await shot('facing-after-right');

    await key('ArrowLeft', true);
    await wait(700);
    await key('ArrowLeft', false);
    const afterLeft = await shot('facing-after-left');

    console.log(JSON.stringify({ afterRight, afterLeft }, null, 2));
    ws.close();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
