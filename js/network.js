function getPeer() {
    return window.Peer || globalThis.Peer;
}

export class NetworkManager extends EventTarget {
    constructor() {
        super();
        this.peer = null;
        this.connections = new Map();
        this.isHost = false;
        this.roomCode = '';
        this.playerId = '';
        this.players = new Map();
        this.connected = false;
        this.messageHandlers = new Map();
    }

    async createRoom(roomCode, playerName, playerColor) {
        const peerId = 'car-huddle-' + roomCode;
        this.roomCode = roomCode;
        this.isHost = true;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout: could not create room'));
            }, 10000);

            this.peer = new (getPeer())(peerId);

            this.peer.on('open', (id) => {
                clearTimeout(timeout);
                this.playerId = id;
                this.connected = true;
                this.players.set(id, { id, name: playerName, color: playerColor, ready: false });
                this._dispatchPlayersUpdated();
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this._setupHostConnection(conn);
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                if (err.type === 'unavailable-id') {
                    reject(new Error('Room code already taken'));
                    return;
                }
                this.dispatchEvent(new CustomEvent('error', { detail: { error: err } }));
                reject(err);
            });
        });
    }

    async joinRoom(roomCode, playerName, playerColor) {
        this.roomCode = roomCode;
        this.isHost = false;
        const hostPeerId = 'car-huddle-' + roomCode;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout: could not join room'));
            }, 10000);

            this.peer = new (getPeer())();

            this.peer.on('open', (id) => {
                this.playerId = id;

                const conn = this.peer.connect(hostPeerId, { reliable: true });

                conn.on('open', () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.connections.set(hostPeerId, conn);
                    conn.send(JSON.stringify({ type: 'join', name: playerName, color: playerColor }));
                    resolve(id);
                });

                conn.on('data', (raw) => {
                    this._handleMessage(hostPeerId, raw);
                });

                conn.on('close', () => {
                    this.connected = false;
                    this.connections.delete(hostPeerId);
                });

                conn.on('error', (err) => {
                    this.dispatchEvent(new CustomEvent('error', { detail: { error: err } }));
                });
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                this.dispatchEvent(new CustomEvent('error', { detail: { error: err } }));
                reject(err);
            });
        });
    }

    _setupHostConnection(conn) {
        conn.on('open', () => {
            this.connections.set(conn.peer, conn);
        });

        conn.on('data', (raw) => {
            this._handleMessage(conn.peer, raw);
        });

        conn.on('close', () => {
            const player = this.players.get(conn.peer);
            this.connections.delete(conn.peer);
            this.players.delete(conn.peer);
            if (player) {
                this.dispatchEvent(new CustomEvent('player-left', { detail: { id: conn.peer } }));
            }
            this._dispatchPlayersUpdated();
        });

        conn.on('error', (err) => {
            this.dispatchEvent(new CustomEvent('error', { detail: { error: err } }));
        });
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        for (const conn of this.connections.values()) {
            if (conn.open) conn.send(data);
        }
    }

    sendToHost(message) {
        const conn = this.connections.values().next().value;
        if (conn && conn.open) conn.send(JSON.stringify(message));
    }

    send(message) {
        if (this.isHost) {
            this.broadcast(message);
        } else {
            this.sendToHost(message);
        }
    }

    on(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    _handleMessage(senderId, raw) {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

        if (data.type === 'join' && this.isHost) {
            this.players.set(senderId, {
                id: senderId,
                name: data.name,
                color: data.color,
                ready: false,
            });
            this.dispatchEvent(new CustomEvent('player-joined', {
                detail: { id: senderId, name: data.name, color: data.color },
            }));
            this._dispatchPlayersUpdated();
            return;
        }

        if (data.type === 'players-list') {
            this.players.clear();
            for (const p of data.players) {
                this.players.set(p.id, p);
            }
            this.dispatchEvent(new CustomEvent('players-updated', {
                detail: { players: data.players },
            }));
        }

        if (data.type === 'start-game') {
            this.dispatchEvent(new CustomEvent('game-start', {
                detail: { seed: data.seed, players: data.players || [...this.players.values()] }
            }));
        }

        if (data.type === 'game-state') {
            this.dispatchEvent(new CustomEvent('game-state', { detail: { state: data.state } }));
        }

        if (data.type === 'race-finish') {
            this.dispatchEvent(new CustomEvent('race-finish', { detail: { results: data.results } }));
        }

        const handler = this.messageHandlers.get(data.type);
        if (handler) {
            handler(data, senderId);
        }

        if (this.isHost && data.type !== 'join') {
            const relay = JSON.stringify({ ...data, senderId });
            for (const [peerId, conn] of this.connections.entries()) {
                if (peerId !== senderId && conn.open) {
                    conn.send(relay);
                }
            }
        }
    }

    _dispatchPlayersUpdated() {
        const players = [...this.players.values()];
        this.dispatchEvent(new CustomEvent('players-updated', { detail: { players } }));
        if (this.isHost) {
            this.broadcast({ type: 'players-list', players });
        }
    }

    sendGameState(state) {
        this.send({ type: 'game-state', state });
    }

    sendPlayerInput(input) {
        this.send({ type: 'player-input', input, playerId: this.playerId });
    }

    sendStartGame(trackSeed) {
        if (this.isHost) {
            this.broadcast({ type: 'start-game', seed: trackSeed, players: [...this.players.values()] });
        }
    }

    sendFinishRace(results) {
        if (this.isHost) {
            this.broadcast({ type: 'race-finish', results });
        }
    }

    getPlayerCount() {
        return this.players.size;
    }

    destroy() {
        for (const conn of this.connections.values()) {
            conn.close();
        }
        this.connections.clear();
        this.players.clear();
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.connected = false;
    }
}
