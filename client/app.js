(function () {
    function refresh() {
        const st = AppState.get();
        UI.showScreen(st.roomState);
        UI.renderLobby();
    }

    function onMessage(type, payload) {
        const st = AppState.get();
        switch (type) {
            case 'room_created':
            case 'room_joined':
                AppState.set({ playerId: payload.playerId });
                AppState.applySnapshot(payload.state);
                refresh();
                if (payload.isReconnect) UI.showToast('Reconnected');
                break;
            case 'player_joined':
                AppState.set({ players: [...st.players.filter((p) => p.id !== payload.player.id), { ...payload.player, isReady: false, isDoneVoting: false, isConnected: true }] });
                refresh();
                break;
            case 'player_left':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isConnected: false } : p) });
                refresh();
                break;
            case 'player_ready_changed':
                AppState.set({ players: st.players.map((p) => p.id === payload.playerId ? { ...p, isReady: payload.ready } : p) });
                refresh();
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
        UI.initLobby();
        const EVENTS = [
            'room_created', 'room_joined', 'player_joined', 'player_left',
            'player_ready_changed', 'error',
        ];
        for (const type of EVENTS) {
            Socket.on(type, (p) => onMessage(type, p));
        }
        Socket.on('__close__', () => UI.showToast('Connection lost. Reconnecting…'));
        Socket.connect();
        UI.showScreen('LANDING');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
