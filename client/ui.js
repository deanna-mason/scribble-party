(function () {
    const SCREEN_MAP = {
        LANDING: 'screen-landing',
        LOBBY: 'screen-lobby',
        CALLER_CHOOSING: 'screen-caller',
        ROUND_ACTIVE: 'screen-round',
        REVEAL: 'screen-reveal',
        GAME_OVER: 'screen-gallery',
    };

    function showScreen(name) {
        const id = SCREEN_MAP[name];
        if (!id) return;
        document.querySelectorAll('.screen').forEach((el) => {
            el.classList.toggle('is-active', el.id === id);
        });
    }

    function showToast(message, durationMs = 3500) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), durationMs);
    }

    // ---- Landing ----
    function initLanding() {
        document.getElementById('btn-show-create').addEventListener('click', () => {
            document.getElementById('form-create').classList.remove('hidden');
            document.getElementById('form-join').classList.add('hidden');
        });
        document.getElementById('btn-show-join').addEventListener('click', () => {
            document.getElementById('form-join').classList.remove('hidden');
            document.getElementById('form-create').classList.add('hidden');
        });
        document.getElementById('form-create').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('input-create-name').value.trim();
            if (!name) return;
            Socket.send('create_room', { name });
        });
        document.getElementById('form-join').addEventListener('submit', (e) => {
            e.preventDefault();
            const code = document.getElementById('input-join-code').value.trim().toUpperCase();
            const name = document.getElementById('input-join-name').value.trim();
            if (!code || !name) return;
            const savedId = AppState.get().playerId;
            Socket.send('join_room', { code, name, playerId: savedId });
        });
    }

    window.UI = { showScreen, showToast, initLanding };
})();
