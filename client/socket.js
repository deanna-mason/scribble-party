//Websocket client wrapper with auto-reconnect. Also defines message types and validation logic for incoming messages.
(function () {
    const listeners = new Map(); // a map where each key is a message type and each value is an array of callback functions.
    let socket = null;  //holds the current Websocket connection.
    let backoff = 500;  //wait time before trying to reconnect after a drop.
    let intentionalClose = false;  // distinguishes an intentional disconnect from a dropped connection.

    //builds the webSocket URL based on the current page.
    function wsUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}`;
    }

    //opens a new Websocket and sets up 4 event handlers.
    function connect() {
        intentionalClose = false;
        socket = new WebSocket(wsUrl());

        //When the connection opens, reset backoff and emit a '__open__' event.
        socket.addEventListener('open', () => {
            backoff = 500;
            emit('__open__', {});
        });

        //When a message is received, parse it and emit an event based on its type.
        socket.addEventListener('message', (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg && msg.type) emit(msg.type, msg.payload || {});
        });

        socket.addEventListener('close', () => {
            emit('__close__', {});
            if (!intentionalClose) {
                setTimeout(connect, backoff);
                backoff = Math.min(backoff * 2, 10_000); //this is the exponential backoff logic.
            }
        });
        socket.addEventListener('error', (err) => {
            console.error('Socket error', err);
        });
    }

    //Sends a message through the Websocket to the server - for example, when someone creates a room or submits a drawing.
    function send(type, payload = {}) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('Socket not open, dropping message', type);
            return;
        }
        socket.send(JSON.stringify({ type, payload }));
    }


    function on(type, callback) {
        if (!listeners.has(type)) listeners.set(type, []); //creates an empty array for this message type if it doesn't exist yet.
        listeners.get(type).push(callback); //adds the callback to the array of listeners for this message type.
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
