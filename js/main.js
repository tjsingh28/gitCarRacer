import { UIManager } from './ui.js';
import { NetworkManager } from './network.js';
import { GameState } from './game.js';
import { InputManager } from './input.js';
import { generateRoomCode } from './utils.js';

const ui = new UIManager();
const net = new NetworkManager();
const input = new InputManager();
let game = null;

let canvas, ctx, minimapCanvas, minimapCtx;
let camera = { x: 0, y: 0, zoom: 1 };
let animFrameId = null;
let lastTime = 0;
const TARGET_DT = 1 / 30;
let accumulator = 0;
let lastCountdown = -1;

// ── Screens ──

ui.onCreateRoom = (name, color) => {
    const code = generateRoomCode();
    net.createRoom(code, name, color)
        .then(() => {
            ui.showLobby(code, true);
            updateLobbyList();
        })
        .catch(err => alert('Failed to create room: ' + err.message));
};

ui.onJoinRoom = (code, name, color) => {
    if (code.length !== 4) { alert('Enter a 4-character room code'); return; }
    net.joinRoom(code, name, color)
        .then(() => {
            ui.showLobby(code, false);
        })
        .catch(err => alert('Failed to join room: ' + err.message));
};

ui.onStartGame = () => {
    if (!net.isHost) return;
    const seed = Date.now();
    startGame(seed, Array.from(net.players.values()));
    net.sendStartGame(seed);
};

ui.onLeaveRoom = () => {
    net.destroy();
    stopGameLoop();
    ui.showMenu();
};

ui.onRematch = () => {
    if (net.isHost) {
        const seed = Date.now();
        startGame(seed, Array.from(net.players.values()));
        net.sendStartGame(seed);
    }
};

ui.onMainMenu = () => {
    net.destroy();
    stopGameLoop();
    ui.showMenu();
};

// ── Network Events ──

net.addEventListener('players-updated', (e) => {
    updateLobbyList();
});

net.addEventListener('game-start', (e) => {
    const { seed, players } = e.detail;
    startGame(seed, players);
});

net.addEventListener('game-state', (e) => {
    if (!game) return;
    const states = e.detail.state;
    if (Array.isArray(states)) {
        for (const s of states) {
            if (s.id !== net.playerId) {
                game.applyRemoteState(s.id, s);
            }
        }
    }
});

net.addEventListener('race-finish', (e) => {
    if (game) {
        game.phase = 'finished';
        ui.showResults(e.detail.results);
    }
});

function updateLobbyList() {
    const players = Array.from(net.players.values()).map(p => ({
        ...p,
        isHost: net.isHost && p.id === net.playerId
    }));
    ui.updatePlayerList(players);
    const startBtn = document.getElementById('btn-start');
    if (net.isHost && players.length >= 1) {
        startBtn.style.display = '';
    }
}

// ── Game Start ──

function startGame(seed, players) {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    minimapCanvas = document.getElementById('minimap-canvas');
    minimapCtx = minimapCanvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Use powerup key
    window.addEventListener('keydown', onKeyDown);

    game = new GameState();
    game.init(seed, players, net.playerId);

    camera.x = game.localCar.pos.x;
    camera.y = game.localCar.pos.y;
    camera.zoom = 1.5;

    lastCountdown = -1;
    ui.showGame();
    startGameLoop();
}

function onKeyDown(e) {
    if (e.code === 'Space' && game && game.localCar) {
        game.usePowerup();
    }
}

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// ── Game Loop ──

function startGameLoop() {
    lastTime = performance.now();
    accumulator = 0;
    animFrameId = requestAnimationFrame(loop);
}

function stopGameLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('keydown', onKeyDown);
}

function loop(now) {
    animFrameId = requestAnimationFrame(loop);

    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    accumulator += Math.min(rawDt, 0.1);

    // Fixed timestep updates at 30fps
    while (accumulator >= TARGET_DT) {
        update(TARGET_DT);
        accumulator -= TARGET_DT;
    }

    render();
}

// ── Update ──

function update(dt) {
    if (!game) return;

    const localInput = {
        left: input.left,
        right: input.right,
        up: input.up,
        down: input.down
    };

    game.update(dt, localInput);

    // Countdown display
    if (game.phase === 'countdown') {
        const cv = game.getCountdownValue();
        if (cv !== lastCountdown) {
            lastCountdown = cv;
            ui.showCountdown(cv);
        }
    } else if (game.phase === 'racing' && lastCountdown !== -1) {
        lastCountdown = -1;
        ui.hideCountdown();
    }

    // Network: send local state
    if (game.phase === 'racing' && game.localCar) {
        net.send({ type: 'player-state', state: game.getLocalState() });
    }

    // Host: collect and broadcast all states
    if (net.isHost && game.phase === 'racing') {
        // The host also handles incoming player-state messages
        // (set up in network message handler)
    }

    // Update HUD
    if (game.localCar) {
        const pos = game.getLocalPosition();
        const total = game.cars.size;
        ui.updateHUD({
            lap: Math.max(1, game.localCar.lap + 1),
            totalLaps: game.totalLaps,
            position: pos,
            totalPlayers: total,
            speed: Math.round(game.localCar.speed * 15),
            huddlesCleared: game.localCar.huddlesCleared,
            powerup: game.localCar.powerup ? game.localCar.powerup.type : null
        });
    }

    // Camera follow
    if (game.localCar) {
        const target = game.localCar.pos;
        camera.x += (target.x - camera.x) * 0.08;
        camera.y += (target.y - camera.y) * 0.08;
    }

    // Check race finish
    if (game.phase === 'finished') {
        const results = game.getResults();
        ui.showResults(results);
        if (net.isHost) {
            net.sendFinishRace(results);
        }
        stopGameLoop();
    }
}

// ── Render ──

function render() {
    if (!game || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grass/terrain background
    drawBackground(ctx, camera);

    // Track
    game.track.render(ctx, camera);

    // Power-ups
    renderPowerups(ctx, camera);

    // Cars (sorted by y for pseudo depth)
    const sortedCars = Array.from(game.cars.values())
        .sort((a, b) => a.pos.y - b.pos.y);
    for (const car of sortedCars) {
        car.render(ctx, camera);
    }

    // Minimap
    if (minimapCtx) {
        const cars = Array.from(game.cars.values()).map(c => ({
            x: c.pos.x, y: c.pos.y, color: c.color,
            isLocal: c.isLocal
        }));
        game.track.renderMinimap(minimapCtx, 160, 160, cars);
    }
}

function drawBackground(ctx, camera) {
    // Simple tiled grass pattern
    const tileSize = 100;
    const startX = Math.floor((camera.x - canvas.width / 2 / camera.zoom) / tileSize) * tileSize;
    const startY = Math.floor((camera.y - canvas.height / 2 / camera.zoom) / tileSize) * tileSize;
    const endX = camera.x + canvas.width / 2 / camera.zoom + tileSize;
    const endY = camera.y + canvas.height / 2 / camera.zoom + tileSize;

    for (let wx = startX; wx < endX; wx += tileSize) {
        for (let wy = startY; wy < endY; wy += tileSize) {
            const sx = (wx - camera.x) * camera.zoom + canvas.width / 2;
            const sy = (wy - camera.y) * camera.zoom + canvas.height / 2;
            const sw = tileSize * camera.zoom;
            const shade = ((Math.floor(wx / tileSize) + Math.floor(wy / tileSize)) % 2 === 0)
                ? '#2d5a27' : '#276221';
            ctx.fillStyle = shade;
            ctx.fillRect(sx, sy, sw + 1, sw + 1);
        }
    }
}

function renderPowerups(ctx, camera) {
    if (!game) return;
    for (const pu of game.powerups) {
        if (!pu.active) continue;
        const sx = (pu.x - camera.x) * camera.zoom + canvas.width / 2;
        const sy = (pu.y - camera.y) * camera.zoom + canvas.height / 2;
        if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) continue;

        const size = 12 * camera.zoom;
        const glow = Math.sin(performance.now() / 200) * 0.3 + 0.7;
        const colors = { boost: '#ff6b00', shield: '#00aaff', missile: '#ff0055' };
        const color = colors[pu.type] || '#ffff00';

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(performance.now() / 500);
        ctx.globalAlpha = glow;

        // Diamond shape
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.7, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.7, 0);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// ── Network message handling for host relaying player states ──

net.on('player-state', (msg) => {
    if (!game) return;
    if (msg.state && msg.state.id !== net.playerId) {
        game.applyRemoteState(msg.state.id, msg.state);
    }
    // Host broadcasts aggregated states periodically (handled via the relay in NetworkManager)
});

// Single-player support: start without network
document.addEventListener('DOMContentLoaded', () => {
    ui.showMenu();
});
