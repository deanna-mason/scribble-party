(function () {
    function onMessage(type, payload) {
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                UI.showScreen(payload.state.state);
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'error':
                UI.showToast(payload.message || 'Something went wrong');
                break;
            default:
                break;
        }
    }

    function init() {
        UI.initLanding();
        Socket.on('room_created', (p) => onMessage('room_created', p));
        Socket.on('room_joined', (p) => onMessage('room_joined', p));
        Socket.on('error', (p) => onMessage('error', p));
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        Socket.connect();
        UI.showScreen('LANDING');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
