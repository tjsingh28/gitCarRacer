const CAR_COLORS = [
    '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653',
    '#6a4c93', '#1982c4', '#8ac926', '#ff595e', '#ff924c',
    '#ffca3a', '#c77dff', '#4cc9f0', '#f72585', '#ffffff'
];

export class UIManager {
    constructor() {
        this.selectedColor = CAR_COLORS[0];

        this.onCreateRoom = null;
        this.onJoinRoom = null;
        this.onStartGame = null;
        this.onLeaveRoom = null;
        this.onRematch = null;
        this.onMainMenu = null;

        // Screens
        this.screens = document.querySelectorAll('.screen');
        this.menuScreen = document.getElementById('menu-screen');
        this.lobbyScreen = document.getElementById('lobby-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.resultsScreen = document.getElementById('results-screen');

        // Buttons
        this.btnCreate = document.getElementById('btn-create');
        this.btnJoin = document.getElementById('btn-join');
        this.btnStart = document.getElementById('btn-start');
        this.btnLeave = document.getElementById('btn-leave');
        this.btnRematch = document.getElementById('btn-rematch');
        this.btnMenu = document.getElementById('btn-menu');

        // Inputs
        this.nameInput = document.getElementById('player-name');
        this.roomCodeInput = document.getElementById('room-code');

        // Lobby
        this.lobbyCode = document.getElementById('lobby-code');
        this.playerList = document.getElementById('player-list');

        // HUD
        this.hudLap = document.getElementById('hud-lap');
        this.hudPos = document.getElementById('hud-pos');
        this.hudSpeed = document.getElementById('hud-speed');
        this.hudHuddles = document.getElementById('hud-huddles');
        this.hudPowerup = document.getElementById('hud-powerup');
        this.countdown = document.getElementById('countdown');

        // Results
        this.resultsList = document.getElementById('results-list');

        // Color picker
        this.colorPicker = document.getElementById('color-picker');
        this._buildColorPicker();

        // Default player name
        if (this.nameInput && !this.nameInput.value) {
            this.nameInput.value = 'Racer';
        }

        // Room code input: auto-uppercase, alphanumeric only
        if (this.roomCodeInput) {
            this.roomCodeInput.addEventListener('input', () => {
                this.roomCodeInput.value = this.roomCodeInput.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '');
            });
        }

        // Wire up buttons
        this.btnCreate?.addEventListener('click', () => {
            this.onCreateRoom?.(this.getName(), this.getColor());
        });

        this.btnJoin?.addEventListener('click', () => {
            this.onJoinRoom?.(this.getRoomCode(), this.getName(), this.getColor());
        });

        this.btnStart?.addEventListener('click', () => {
            this.onStartGame?.();
        });

        this.btnLeave?.addEventListener('click', () => {
            this.onLeaveRoom?.();
        });

        this.btnRematch?.addEventListener('click', () => {
            this.onRematch?.();
        });

        this.btnMenu?.addEventListener('click', () => {
            this.onMainMenu?.();
        });
    }

    _buildColorPicker() {
        if (!this.colorPicker) return;
        this.colorPicker.innerHTML = '';

        CAR_COLORS.forEach((color, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;

            swatch.addEventListener('click', () => {
                this.colorPicker.querySelectorAll('.color-swatch').forEach(s => {
                    s.classList.remove('selected');
                });
                swatch.classList.add('selected');
                this.selectedColor = color;
            });

            if (i === 0) {
                swatch.classList.add('selected');
            }

            this.colorPicker.appendChild(swatch);
        });
    }

    showScreen(screenId) {
        this.screens.forEach(s => s.classList.remove('active'));
        document.getElementById(screenId)?.classList.add('active');
    }

    showMenu() {
        this.showScreen('menu-screen');
    }

    showLobby(roomCode, isHost) {
        this.showScreen('lobby-screen');
        if (this.lobbyCode) {
            this.lobbyCode.textContent = roomCode;
        }
        if (this.btnStart) {
            this.btnStart.style.display = isHost ? '' : 'none';
        }
    }

    updatePlayerList(players) {
        if (!this.playerList) return;
        this.playerList.innerHTML = '';

        players.forEach(player => {
            const entry = document.createElement('div');
            entry.className = 'player-entry';

            const dot = document.createElement('span');
            dot.className = 'player-dot';
            dot.style.backgroundColor = player.color;
            entry.appendChild(dot);

            const name = document.createElement('span');
            name.textContent = player.name;
            entry.appendChild(name);

            if (player.isHost) {
                const badge = document.createElement('span');
                badge.className = 'player-host';
                badge.textContent = '★ Host';
                entry.appendChild(badge);
            }

            this.playerList.appendChild(entry);
        });
    }

    showGame() {
        this.showScreen('game-screen');
    }

    showCountdown(value) {
        if (!this.countdown) return;
        this.countdown.classList.remove('hidden');

        if (value === 0) {
            this.countdown.textContent = 'GO!';
            this.countdown.style.color = '#2a9d8f';
            setTimeout(() => this.hideCountdown(), 500);
        } else {
            this.countdown.textContent = value;
            this.countdown.style.color = '';
        }
    }

    hideCountdown() {
        this.countdown?.classList.add('hidden');
    }

    updateHUD(data) {
        const { lap, totalLaps, position, totalPlayers, speed, huddlesCleared, powerup } = data;

        if (this.hudLap) this.hudLap.textContent = `Lap ${lap}/${totalLaps}`;
        if (this.hudPos) this.hudPos.textContent = `Pos: ${position}/${totalPlayers}`;
        if (this.hudSpeed) this.hudSpeed.textContent = `${speed} km/h`;
        if (this.hudHuddles) this.hudHuddles.textContent = `Huddles: ${huddlesCleared}`;

        if (this.hudPowerup) {
            const emoji = { boost: '🚀', shield: '🛡️', missile: '🎯' };
            this.hudPowerup.textContent = powerup ? (emoji[powerup] || '') : '';
        }
    }

    showResults(results) {
        this.showScreen('results-screen');
        if (!this.resultsList) return;
        this.resultsList.innerHTML = '';

        const sorted = [...results].sort((a, b) => (a.time || Infinity) - (b.time || Infinity));

        sorted.forEach((result, index) => {
            const row = document.createElement('div');
            row.className = 'result-row';

            const pos = document.createElement('span');
            pos.className = 'result-pos';
            pos.textContent = this._ordinal(index + 1);
            row.appendChild(pos);

            const dot = document.createElement('span');
            dot.className = 'player-dot';
            dot.style.backgroundColor = result.color;
            row.appendChild(dot);

            const name = document.createElement('span');
            name.className = 'result-name';
            name.textContent = result.name;
            row.appendChild(name);

            const time = document.createElement('span');
            time.className = 'result-stat';
            time.textContent = result.time != null ? this._formatTime(result.time) : 'DNF';
            row.appendChild(time);

            const huddles = document.createElement('span');
            huddles.className = 'result-stat';
            huddles.textContent = `${result.huddlesCleared || 0} huddles`;
            row.appendChild(huddles);

            this.resultsList.appendChild(row);
        });
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    }

    _ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    getName() {
        return this.nameInput?.value?.trim() || 'Racer';
    }

    getColor() {
        return this.selectedColor;
    }

    getRoomCode() {
        return (this.roomCodeInput?.value || '').toUpperCase();
    }
}
