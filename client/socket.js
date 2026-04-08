(function () {
    const listeners = new Map(); // type → [callback, ...]
    let socket = null;
    let backoff = 500;
    let intentionalClose = false;

    function wsUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}`;
    }

    function connect() {
        intentionalClose = false;
        socket = new WebSocket(wsUrl());
        socket.addEventListener('open', () => {
            backoff = 500;
            emit('__open__', {});
        });
        socket.addEventListener('message', (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg && msg.type) emit(msg.type, msg.payload || {});
        });
        socket.addEventListener('close', () => {
            emit('__close__', {});
            if (!intentionalClose) {
                setTimeout(connect, backoff);
                backoff = Math.min(backoff * 2, 10_000);
            }
        });
        socket.addEventListener('error', (err) => {
            console.error('Socket error', err);
        });
    }

    function send(type, payload = {}) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('Socket not open, dropping message', type);
            return;
        }
        socket.send(JSON.stringify({ type, payload }));
    }

    function on(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(callback);
    }

    function emit(type, payload) {
        const list = listeners.get(type) || [];
        for (const cb of list) cb(payload);
    }

    function disconnect() {
        intentionalClose = true;
        if (socket) socket.close();
    }

    window.Socket = { connect, send, on, disconnect };
})();
