import { seededRandom, vecAdd, vecScale, vecNorm, vecSub, vecLen } from './utils.js';

function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
}

function seededRandRange(rng, min, max) {
    return min + rng() * (max - min);
}

function seededRandInt(rng, min, max) {
    return Math.floor(seededRandRange(rng, min, max + 1));
}

export class Track {
    constructor(seed, playerCount) {
        this.seed = seed;
        this.playerCount = Math.max(1, Math.min(15, playerCount));
        this.trackWidth = 220 + this.playerCount * 15;

        const rng = seededRandom(seed);

        this.waypoints = this._generateWaypoints(rng);
        this.centerPath = this._generateCenterPath(this.waypoints);
        this.totalLength = this._computeTotalLength();

        const boundaries = this._computeBoundaries();
        this.innerBoundary = boundaries.inner;
        this.outerBoundary = boundaries.outer;

        this.startLine = this._computeStartLine();
        this.startPositions = this._computeStartPositions();
        this.checkpoints = this._computeCheckpoints();
        this.huddles = this._generateHuddles(rng);
        this.powerupSpawns = this._generatePowerupSpawns(rng);
    }

    _generateWaypoints(rng) {
        const cx = 2000, cy = 2000;
        const count = seededRandInt(rng, 12, 20);
        const waypoints = [];
        const angleStep = (Math.PI * 2) / count;

        for (let i = 0; i < count; i++) {
            const baseAngle = angleStep * i;
            const jitter = seededRandRange(rng, -angleStep * 0.25, angleStep * 0.25);
            const angle = baseAngle + jitter;
            const radius = seededRandRange(rng, 600, 1200);
            waypoints.push({
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius
            });
        }

        return waypoints;
    }

    _generateCenterPath(waypoints) {
        const n = waypoints.length;
        const pointsPerSegment = Math.ceil(240 / n);
        const path = [];

        for (let i = 0; i < n; i++) {
            const p0 = waypoints[(i - 1 + n) % n];
            const p1 = waypoints[i];
            const p2 = waypoints[(i + 1) % n];
            const p3 = waypoints[(i + 2) % n];

            for (let j = 0; j < pointsPerSegment; j++) {
                const t = j / pointsPerSegment;
                path.push(catmullRom(p0, p1, p2, p3, t));
            }
        }

        return path;
    }

    _computeTotalLength() {
        let len = 0;
        const path = this.centerPath;
        for (let i = 0; i < path.length; i++) {
            const next = path[(i + 1) % path.length];
            len += vecLen(vecSub(next, path[i]));
        }
        return len;
    }

    _computeBoundaries() {
        const path = this.centerPath;
        const n = path.length;
        const halfW = this.trackWidth / 2;
        const inner = [];
        const outer = [];

        for (let i = 0; i < n; i++) {
            const prev = path[(i - 1 + n) % n];
            const next = path[(i + 1) % n];
            const dir = vecNorm(vecSub(next, prev));
            const perp = { x: -dir.y, y: dir.x };

            inner.push(vecAdd(path[i], vecScale(perp, -halfW)));
            outer.push(vecAdd(path[i], vecScale(perp, halfW)));
        }

        return { inner, outer };
    }

    _computeStartLine() {
        const dir = this.getTrackDirection(0);
        return {
            pos: { x: this.centerPath[0].x, y: this.centerPath[0].y },
            angle: Math.atan2(dir.y, dir.x)
        };
    }

    _computeStartPositions() {
        const positions = [];
        const dir = this.getTrackDirection(0);
        const angle = Math.atan2(dir.y, dir.x);
        const perp = { x: -dir.y, y: dir.x };
        const backDir = { x: -dir.x, y: -dir.y };

        const cols = 3;
        const colSpacing = this.trackWidth / (cols + 1);
        const rowSpacing = 60;

        for (let i = 0; i < 15; i++) {
            const row = Math.floor(i / cols);
            const col = (i % cols) - 1;

            const base = this.centerPath[0];
            const offset = vecAdd(
                vecScale(perp, col * colSpacing),
                vecScale(backDir, (row + 1) * rowSpacing + 40)
            );

            positions.push({
                x: base.x + offset.x,
                y: base.y + offset.y,
                angle
            });
        }

        return positions;
    }

    _computeCheckpoints() {
        const checkpoints = [];
        const n = this.centerPath.length;
        const step = Math.floor(n / 8);

        for (let i = 0; i < 8; i++) {
            const idx = (i * step) % n;
            const dir = this.getTrackDirection(idx);
            checkpoints.push({
                x: this.centerPath[idx].x,
                y: this.centerPath[idx].y,
                angle: Math.atan2(dir.y, dir.x)
            });
        }

        return checkpoints;
    }

    _generateHuddles(rng) {
        const huddleCount = seededRandInt(rng, 3, 5);
        const huddles = [];
        const n = this.centerPath.length;
        const safeZone = Math.floor(n * 0.1);

        for (let i = 0; i < huddleCount; i++) {
            const fraction = (i + 1) / (huddleCount + 1);
            const idx = Math.floor(safeZone + fraction * (n - safeZone)) % n;
            const center = this.centerPath[idx];
            const radius = seededRandRange(rng, 120, 200);
            const obstacleCount = seededRandInt(rng, 5, 12);
            const obstacles = [];

            for (let j = 0; j < obstacleCount; j++) {
                const oAngle = rng() * Math.PI * 2;
                const oDist = rng() * radius;
                const ox = center.x + Math.cos(oAngle) * oDist;
                const oy = center.y + Math.sin(oAngle) * oDist;

                const roll = rng();
                let type;
                if (roll < 0.5) type = 'wall';
                else if (roll < 0.8) type = 'barrel';
                else type = 'ramp';

                let w, h;
                if (type === 'wall') {
                    w = seededRandRange(rng, 40, 80);
                    h = seededRandRange(rng, 15, 30);
                } else if (type === 'barrel') {
                    w = h = seededRandRange(rng, 18, 30);
                } else {
                    w = seededRandRange(rng, 35, 55);
                    h = seededRandRange(rng, 25, 40);
                }

                obstacles.push({ x: ox, y: oy, w, h, type });
            }

            huddles.push({ center: { x: center.x, y: center.y }, radius, obstacles });
        }

        return huddles;
    }

    _generatePowerupSpawns(rng) {
        const count = seededRandInt(rng, 6, 10);
        const spawns = [];
        const n = this.centerPath.length;

        const huddleIndices = this.huddles.map(h => this.getNearestPathIndex(h.center));

        for (let i = 0; i < count; i++) {
            const fraction = i / count;
            let idx = Math.floor(fraction * n) % n;

            let tooClose = false;
            for (const hIdx of huddleIndices) {
                const dist = Math.min(Math.abs(idx - hIdx), n - Math.abs(idx - hIdx));
                if (dist < n * 0.05) { tooClose = true; break; }
            }

            if (!tooClose) {
                const pt = this.centerPath[idx];
                const dir = this.getTrackDirection(idx);
                const perp = { x: -dir.y, y: dir.x };
                const lateralOffset = seededRandRange(rng, -this.trackWidth * 0.3, this.trackWidth * 0.3);
                spawns.push({
                    x: pt.x + perp.x * lateralOffset,
                    y: pt.y + perp.y * lateralOffset
                });
            } else {
                const offsetIdx = (idx + Math.floor(n * 0.05)) % n;
                const pt = this.centerPath[offsetIdx];
                spawns.push({ x: pt.x, y: pt.y });
            }
        }

        return spawns;
    }

    getTrackDirection(index) {
        const path = this.centerPath;
        const n = path.length;
        const i = ((index % n) + n) % n;
        const next = path[(i + 1) % n];
        return vecNorm(vecSub(next, path[i]));
    }

    getNearestPathIndex(pos) {
        const path = this.centerPath;
        let bestDist = Infinity;
        let bestIdx = 0;

        for (let i = 0; i < path.length; i++) {
            const dx = pos.x - path[i].x;
            const dy = pos.y - path[i].y;
            const d = dx * dx + dy * dy;
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }

        return bestIdx;
    }

    getProgressFraction(pos) {
        const idx = this.getNearestPathIndex(pos);
        return idx / this.centerPath.length;
    }

    isOnTrack(pos) {
        const idx = this.getNearestPathIndex(pos);
        const cp = this.centerPath[idx];
        const dx = pos.x - cp.x;
        const dy = pos.y - cp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const margin = 20;
        return dist < this.trackWidth / 2 + margin;
    }

    render(ctx, camera) {
        const canvas = ctx.canvas;
        const halfW = canvas.width / 2;
        const halfH = canvas.height / 2;

        function toScreen(wx, wy) {
            return {
                x: (wx - camera.x) * camera.zoom + halfW,
                y: (wy - camera.y) * camera.zoom + halfH
            };
        }

        ctx.save();

        // -- Asphalt fill (track polygon: outer forward, inner reversed) --
        ctx.beginPath();
        for (let i = 0; i < this.outerBoundary.length; i++) {
            const s = toScreen(this.outerBoundary[i].x, this.outerBoundary[i].y);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();

        ctx.moveTo(
            toScreen(this.innerBoundary[0].x, this.innerBoundary[0].y).x,
            toScreen(this.innerBoundary[0].x, this.innerBoundary[0].y).y
        );
        for (let i = this.innerBoundary.length - 1; i >= 0; i--) {
            const s = toScreen(this.innerBoundary[i].x, this.innerBoundary[i].y);
            ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();

        ctx.fillStyle = '#3a3a3a';
        ctx.fill('evenodd');

        // -- Curbs (red/white stripes on edges) --
        this._renderCurb(ctx, this.outerBoundary, camera, toScreen);
        this._renderCurb(ctx, this.innerBoundary, camera, toScreen);

        // -- Center dashed line --
        ctx.beginPath();
        ctx.setLineDash([12 * camera.zoom, 12 * camera.zoom]);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * camera.zoom;
        for (let i = 0; i < this.centerPath.length; i++) {
            const s = toScreen(this.centerPath[i].x, this.centerPath[i].y);
            if (i === 0) ctx.moveTo(s.x, s.y);
            else ctx.lineTo(s.x, s.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // -- Start/finish checkered line --
        this._renderStartLine(ctx, camera, toScreen);

        // -- Huddle obstacles --
        for (const huddle of this.huddles) {
            for (const obs of huddle.obstacles) {
                this._renderObstacle(ctx, obs, camera, toScreen);
            }
        }

        // -- Power-up spawns --
        for (const pu of this.powerupSpawns) {
            const s = toScreen(pu.x, pu.y);
            const size = 8 * camera.zoom;

            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(Math.PI / 4);
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 10 * camera.zoom;
            ctx.fillStyle = '#00ffcc';
            ctx.fillRect(-size / 2, -size / 2, size, size);
            ctx.shadowBlur = 0;
            ctx.restore();
        }

        ctx.restore();
    }

    _renderCurb(ctx, boundary, camera, toScreen) {
        const segLen = 20;
        ctx.lineWidth = 6 * camera.zoom;
        for (let i = 0; i < boundary.length; i++) {
            const a = boundary[i];
            const b = boundary[(i + 1) % boundary.length];
            const sa = toScreen(a.x, a.y);
            const sb = toScreen(b.x, b.y);

            ctx.beginPath();
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
            ctx.strokeStyle = (Math.floor(i / 3) % 2 === 0) ? '#cc0000' : '#ffffff';
            ctx.stroke();
        }
    }

    _renderStartLine(ctx, camera, toScreen) {
        const sl = this.startLine;
        const dir = this.getTrackDirection(0);
        const perp = { x: -dir.y, y: dir.x };
        const halfW = this.trackWidth / 2;
        const squares = 8;
        const squareSize = this.trackWidth / squares;

        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < squares; col++) {
                const lateral = -halfW + col * squareSize;
                const forward = row * squareSize - squareSize;

                const wx = sl.pos.x + perp.x * lateral + dir.x * forward;
                const wy = sl.pos.y + perp.y * lateral + dir.y * forward;

                const corners = [
                    { x: wx, y: wy },
                    { x: wx + perp.x * squareSize, y: wy + perp.y * squareSize },
                    { x: wx + perp.x * squareSize + dir.x * squareSize, y: wy + perp.y * squareSize + dir.y * squareSize },
                    { x: wx + dir.x * squareSize, y: wy + dir.y * squareSize }
                ];

                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const s = toScreen(corners[k].x, corners[k].y);
                    if (k === 0) ctx.moveTo(s.x, s.y);
                    else ctx.lineTo(s.x, s.y);
                }
                ctx.closePath();
                ctx.fillStyle = ((row + col) % 2 === 0) ? '#ffffff' : '#111111';
                ctx.fill();
            }
        }
    }

    _renderObstacle(ctx, obs, camera, toScreen) {
        const s = toScreen(obs.x, obs.y);
        const w = obs.w * camera.zoom;
        const h = obs.h * camera.zoom;

        if (obs.type === 'wall') {
            ctx.fillStyle = '#555555';
            ctx.fillRect(s.x - w / 2, s.y - h / 2, w, h);
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1 * camera.zoom;
            ctx.strokeRect(s.x - w / 2, s.y - h / 2, w, h);
        } else if (obs.type === 'barrel') {
            const r = (obs.w / 2) * camera.zoom;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = '#cc2222';
            ctx.fill();
            ctx.strokeStyle = '#881111';
            ctx.lineWidth = 1.5 * camera.zoom;
            ctx.stroke();
        } else if (obs.type === 'ramp') {
            ctx.beginPath();
            ctx.moveTo(s.x, s.y - h / 2);
            ctx.lineTo(s.x + w / 2, s.y + h / 2);
            ctx.lineTo(s.x - w / 2, s.y + h / 2);
            ctx.closePath();
            ctx.fillStyle = '#e8a020';
            ctx.fill();
            ctx.strokeStyle = '#cc8800';
            ctx.lineWidth = 1.5 * camera.zoom;
            ctx.stroke();
        }
    }

    renderMinimap(ctx, width, height, cars) {
        const padding = 10;
        const path = this.centerPath;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of path) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }

        const trackW = maxX - minX;
        const trackH = maxY - minY;
        const scale = Math.min((width - padding * 2) / trackW, (height - padding * 2) / trackH);
        const offX = (width - trackW * scale) / 2;
        const offY = (height - trackH * scale) / 2;

        function toMini(wx, wy) {
            return {
                x: (wx - minX) * scale + offX,
                y: (wy - minY) * scale + offY
            };
        }

        ctx.save();

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Track outline
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            const m = toMini(path[i].x, path[i].y);
            if (i === 0) ctx.moveTo(m.x, m.y);
            else ctx.lineTo(m.x, m.y);
        }
        ctx.closePath();
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = Math.max(2, this.trackWidth * scale);
        ctx.stroke();

        // Car dots
        if (cars && cars.length > 0) {
            for (const car of cars) {
                const m = toMini(car.x, car.y);
                ctx.beginPath();
                ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = car.color || '#ff0000';
                ctx.fill();
            }
        }

        ctx.restore();
    }
}
