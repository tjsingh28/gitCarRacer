import { Car } from './car.js';
import { Track } from './track.js';
import { vecDist } from './utils.js';
import { seededRandom } from './utils.js';

export class GameState {
    constructor() {
        this.phase = 'waiting';
        this.track = null;
        this.cars = new Map();
        this.localCar = null;
        this.powerups = [];
        this.countdownTimer = 0;
        this.raceTimer = 0;
        this.totalLaps = 5;
        this.results = [];
        this.trackSeed = 0;

        this._huddleProgress = new Map();
    }

    init(trackSeed, players, localPlayerId) {
        this.trackSeed = trackSeed;
        this.track = new Track(trackSeed, players.length);

        const rng = seededRandom(trackSeed + 7777);

        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const sp = this.track.startPositions[i];
            const car = new Car(p.id, p.name, p.color, sp.x, sp.y, sp.angle);
            if (p.id === localPlayerId) {
                car.isLocal = true;
                this.localCar = car;
            }
            this.cars.set(p.id, car);
        }

        this.powerups = this.track.powerupSpawns.map(spawn => {
            const roll = rng();
            let type;
            if (roll < 0.5) type = 'boost';
            else if (roll < 0.8) type = 'shield';
            else type = 'missile';
            return { x: spawn.x, y: spawn.y, type, active: true, respawnTimer: 0 };
        });

        this.phase = 'countdown';
        this.countdownTimer = 3.0;
        this.raceTimer = 0;
        this.results = [];
        this._huddleProgress = new Map();
    }

    update(dt, localInput) {
        if (this.phase === 'countdown') {
            this.countdownTimer -= dt;
            if (this.countdownTimer <= 0) {
                this.countdownTimer = 0;
                this.phase = 'racing';
            }
            return;
        }

        if (this.phase !== 'racing') return;

        this.raceTimer += dt;

        // Apply local input
        if (this.localCar && localInput) {
            this.localCar.steerInput = (localInput.right ? 1 : 0) - (localInput.left ? 1 : 0);
            this.localCar.gasInput = localInput.up ? 1 : 0;
            this.localCar.brakeInput = localInput.down ? 1 : 0;
        }

        // Update all cars
        for (const car of this.cars.values()) {
            if (!car.finished) {
                car.update(dt, this.track.isOnTrack(car.pos));
            }
        }

        // Car-car collisions (all pairs)
        const carArr = [...this.cars.values()];
        for (let i = 0; i < carArr.length; i++) {
            for (let j = i + 1; j < carArr.length; j++) {
                carArr[i].applyCollision(carArr[j]);
            }
        }

        // Car-obstacle collisions
        for (const car of this.cars.values()) {
            if (car.finished) continue;
            for (const huddle of this.track.huddles) {
                for (const obs of huddle.obstacles) {
                    const dx = car.pos.x - obs.x;
                    const dy = car.pos.y - obs.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const minDist = obs.type === 'barrel' ? obs.w / 2 + 12 : Math.max(obs.w, obs.h) / 2 + 8;
                    if (dist < minDist && dist > 0.01) {
                        if (obs.type === 'ramp') {
                            // Ramp gives a small speed boost instead of blocking
                            const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
                            car.vel.x += forward.x * 0.5;
                            car.vel.y += forward.y * 0.5;
                        } else if (!car.shieldActive) {
                            // Bounce off wall/barrel
                            const nx = dx / dist;
                            const ny = dy / dist;
                            const push = minDist - dist;
                            car.pos.x += nx * push;
                            car.pos.y += ny * push;
                            const dot = car.vel.x * nx + car.vel.y * ny;
                            car.vel.x -= 1.5 * dot * nx;
                            car.vel.y -= 1.5 * dot * ny;
                            car.vel.x *= 0.7;
                            car.vel.y *= 0.7;
                        }
                    }
                }
            }
        }

        // Power-up pickups
        for (const pu of this.powerups) {
            if (pu.active) {
                for (const car of this.cars.values()) {
                    if (car.finished) continue;
                    const dist = vecDist(car.pos, { x: pu.x, y: pu.y });
                    if (dist < 30) {
                        car.applyPowerup(pu.type);
                        pu.active = false;
                        pu.respawnTimer = 10.0;
                        break;
                    }
                }
            } else {
                pu.respawnTimer -= dt;
                if (pu.respawnTimer <= 0) {
                    pu.active = true;
                    pu.respawnTimer = 0;
                }
            }
        }

        // Checkpoint / lap progression for all cars
        const track = this.track;
        const numCheckpoints = track.checkpoints.length; // 8
        const pathLen = track.centerPath.length;

        for (const car of this.cars.values()) {
            if (car.finished) continue;

            const nearestIdx = track.getNearestPathIndex(car.pos);
            const cpStep = Math.floor(pathLen / numCheckpoints);
            const expectedCpIndex = car.checkpoint % numCheckpoints;
            const expectedPathIdx = (expectedCpIndex * cpStep) % pathLen;

            // Check if car is near the expected checkpoint
            const distToExpected = Math.min(
                Math.abs(nearestIdx - expectedPathIdx),
                pathLen - Math.abs(nearestIdx - expectedPathIdx)
            );

            if (distToExpected < cpStep * 0.25) {
                // Passed the expected checkpoint
                car.checkpoint++;

                // Check lap completion: checkpoint wrapped and near start
                if (car.checkpoint > 0 && car.checkpoint % numCheckpoints === 0) {
                    car.lap++;
                    if (car.lap >= this.totalLaps) {
                        car.finished = true;
                        car.finishTime = this.raceTimer;
                        this.results.push({
                            id: car.id,
                            name: car.name,
                            color: car.color,
                            lap: car.lap,
                            time: this.raceTimer,
                            huddlesCleared: car.huddlesCleared,
                            score: car.score
                        });
                    }
                }
            }
        }

        // Huddle clearance checks
        for (let hi = 0; hi < track.huddles.length; hi++) {
            const huddle = track.huddles[hi];
            for (const car of this.cars.values()) {
                if (car.finished) continue;

                const key = car.id + '_' + hi;
                const dist = vecDist(car.pos, huddle.center);

                if (dist < huddle.radius) {
                    if (!this._huddleProgress.has(key)) {
                        // Entered huddle zone — record entry side
                        const entryIdx = track.getNearestPathIndex(car.pos);
                        this._huddleProgress.set(key, { entryIdx });
                    }
                } else if (this._huddleProgress.has(key)) {
                    // Exited huddle zone
                    const progress = this._huddleProgress.get(key);
                    const exitIdx = track.getNearestPathIndex(car.pos);
                    const huddleCenterIdx = track.getNearestPathIndex(huddle.center);

                    // Check that entry and exit are on opposite sides of the huddle center
                    const entryDelta = ((progress.entryIdx - huddleCenterIdx) + pathLen) % pathLen;
                    const exitDelta = ((exitIdx - huddleCenterIdx) + pathLen) % pathLen;
                    const halfPath = pathLen / 2;

                    if ((entryDelta < halfPath) !== (exitDelta < halfPath)) {
                        car.huddlesCleared++;
                    }

                    this._huddleProgress.delete(key);
                }
            }
        }

        // Check if race is finished (local player done is enough)
        if (this.localCar && this.localCar.finished) {
            this.phase = 'finished';
        }
    }

    getLocalState() {
        return this.localCar ? this.localCar.getState() : null;
    }

    applyRemoteState(playerId, state) {
        const car = this.cars.get(playerId);
        if (car) {
            car.applyState(state);
        }
    }

    getCountdownValue() {
        if (this.phase !== 'countdown') return 0;
        const val = Math.ceil(this.countdownTimer);
        return val > 0 ? val : 0;
    }

    getRaceTime() {
        const totalSeconds = this.raceTimer;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const millis = Math.floor((totalSeconds % 1) * 100);
        const ss = String(seconds).padStart(2, '0');
        const mm = String(millis).padStart(2, '0');
        return `${minutes}:${ss}.${mm}`;
    }

    getResults() {
        const allCars = [...this.cars.values()];
        const finished = allCars.filter(c => c.finished).sort((a, b) => a.finishTime - b.finishTime);
        const unfinished = allCars.filter(c => !c.finished);

        const results = [];
        for (const car of [...finished, ...unfinished]) {
            results.push({
                id: car.id,
                name: car.name,
                color: car.color,
                lap: car.lap,
                time: car.finished ? car.finishTime : null,
                huddlesCleared: car.huddlesCleared,
                score: 0
            });
        }
        return results.map((r, i) => ({ ...r, score: this._computeScore(r, i) }));
    }

    _computeScore(result, position) {
        const basePoints = Math.max(0, (this.cars.size - position) * 100);
        const huddleBonus = result.huddlesCleared * 50;
        return basePoints + huddleBonus;
    }

    getPositions() {
        const numCheckpoints = this.track ? this.track.checkpoints.length : 8;
        const entries = [];

        for (const car of this.cars.values()) {
            const fraction = this.track ? this.track.getProgressFraction(car.pos) : 0;
            const progress = car.lap * numCheckpoints + car.checkpoint + fraction;
            entries.push({ id: car.id, progress });
        }

        entries.sort((a, b) => b.progress - a.progress);
        return entries.map(e => e.id);
    }

    getLocalPosition() {
        if (!this.localCar) return 1;
        const positions = this.getPositions();
        const idx = positions.indexOf(this.localCar.id);
        return idx + 1;
    }

    usePowerup() {
        if (this.localCar) {
            this.localCar.usePowerup();
        }
    }

    dispose() {
        this.cars.clear();
        this.localCar = null;
        this.track = null;
        this.powerups = [];
        this.results = [];
        this._huddleProgress.clear();
        this.phase = 'waiting';
    }
}
