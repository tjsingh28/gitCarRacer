import { vec, vecAdd, vecScale, vecLen, vecNorm, vecRotate, clamp, lerp, wrapAngle, hexToRgb } from './utils.js';

export class Car {
    constructor(id, name, color, x, y, angle) {
        this.id = id;
        this.name = name;
        this.color = color;

        this.pos = vec(x, y);
        this.vel = vec(0, 0);
        this.angle = angle;
        this.speed = 0;
        this.angularVel = 0;

        this.width = 20;
        this.height = 40;

        this.maxSpeed = 8;
        this.acceleration = 0.15;
        this.brakeForce = 0.25;
        this.turnSpeed = 0.04;
        this.friction = 0.97;
        this.offTrackFriction = 0.92;

        this.lap = 0;
        this.checkpoint = 0;
        this.finished = false;
        this.finishTime = 0;

        this.powerup = null;
        this.shieldActive = false;
        this.boostActive = false;
        this.boostTimer = 0;

        this.score = 0;
        this.huddlesCleared = 0;

        this.isLocal = false;
        this.trail = [];

        this.steerInput = 0;
        this.gasInput = 0;
        this.brakeInput = 0;

        this.collisionCooldown = 0;
        this.respawnTimer = 0;
        this.driftAngle = 0;
    }

    update(dt, isOnTrack) {
        const effectiveMaxSpeed = this.boostActive ? 12 : this.maxSpeed;

        // Apply acceleration
        if (this.gasInput > 0) {
            const forward = vec(Math.cos(this.angle), Math.sin(this.angle));
            const accel = vecScale(forward, this.acceleration * this.gasInput);
            this.vel = vecAdd(this.vel, accel);
        }

        // Apply boost extra acceleration
        if (this.boostActive) {
            const forward = vec(Math.cos(this.angle), Math.sin(this.angle));
            this.vel = vecAdd(this.vel, vecScale(forward, 0.08));
        }

        // Apply braking
        if (this.brakeInput > 0) {
            const currentSpeed = vecLen(this.vel);
            if (currentSpeed > 0.01) {
                const reduction = this.brakeForce * this.brakeInput;
                const newSpeed = Math.max(0, currentSpeed - reduction);
                this.vel = vecScale(vecNorm(this.vel), newSpeed);
            }
        }

        // Apply steering
        const speedFactor = clamp(this.speed / 3, 0.3, 1.0);
        this.angularVel = this.steerInput * this.turnSpeed * speedFactor;

        // Speed-dependent countersteer for stability
        if (this.speed > 2) {
            const velAngle = Math.atan2(this.vel.y, this.vel.x);
            const angleDiff = wrapAngle(velAngle - this.angle);
            this.angularVel += angleDiff * 0.02;
        }

        // Apply friction
        const frictionFactor = isOnTrack ? this.friction : this.offTrackFriction;
        this.vel = vecScale(this.vel, frictionFactor);

        // Clamp speed
        this.speed = vecLen(this.vel);
        if (this.speed > effectiveMaxSpeed) {
            this.vel = vecScale(vecNorm(this.vel), effectiveMaxSpeed);
            this.speed = effectiveMaxSpeed;
        }

        // Update position and angle
        this.pos = vecAdd(this.pos, this.vel);
        this.angle += this.angularVel;

        // Update speed
        this.speed = vecLen(this.vel);

        // Maintain trail
        this.trail.push(vec(this.pos.x, this.pos.y));
        if (this.trail.length > 20) {
            this.trail.shift();
        }

        // Decrement timers
        if (this.collisionCooldown > 0) this.collisionCooldown--;
        if (this.respawnTimer > 0) this.respawnTimer--;

        if (this.boostActive) {
            this.boostTimer--;
            if (this.boostTimer <= 0) {
                this.boostActive = false;
                this.boostTimer = 0;
            }
        }

        if (this.shieldActive && this.powerup === null) {
            // Shield was used and timer ran out handled via powerup system
        }

        // Compute drift angle
        if (this.speed > 0.5) {
            const velAngle = Math.atan2(this.vel.y, this.vel.x);
            this.driftAngle = wrapAngle(velAngle - this.angle);
        } else {
            this.driftAngle = 0;
        }
    }

    applyCollision(otherCar) {
        const dx = otherCar.pos.x - this.pos.x;
        const dy = otherCar.pos.y - this.pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 22;

        if (dist >= minDist * 2 || dist < 0.01) return false;
        if (this.collisionCooldown > 0 || otherCar.collisionCooldown > 0) return false;

        // Push apart
        const overlap = minDist * 2 - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const push = overlap / 2;

        this.pos.x -= nx * push;
        this.pos.y -= ny * push;
        otherCar.pos.x += nx * push;
        otherCar.pos.y += ny * push;

        // Elastic-ish velocity exchange
        const relVelX = this.vel.x - otherCar.vel.x;
        const relVelY = this.vel.y - otherCar.vel.y;
        const relDot = relVelX * nx + relVelY * ny;

        if (relDot > 0) {
            let bounceFactor = 0.5;

            // Shield makes the other bounce harder
            if (this.shieldActive) {
                bounceFactor = 0.2;
                const hardBounce = 0.8;
                otherCar.vel.x -= nx * relDot * hardBounce;
                otherCar.vel.y -= ny * relDot * hardBounce;
                this.vel.x -= nx * relDot * bounceFactor;
                this.vel.y -= ny * relDot * bounceFactor;
            } else if (otherCar.shieldActive) {
                bounceFactor = 0.8;
                const softBounce = 0.2;
                otherCar.vel.x -= nx * relDot * softBounce;
                otherCar.vel.y -= ny * relDot * softBounce;
                this.vel.x -= nx * relDot * bounceFactor;
                this.vel.y -= ny * relDot * bounceFactor;
            } else {
                this.vel.x -= nx * relDot * bounceFactor;
                this.vel.y -= ny * relDot * bounceFactor;
                otherCar.vel.x += nx * relDot * bounceFactor;
                otherCar.vel.y += ny * relDot * bounceFactor;
            }
        }

        this.collisionCooldown = 15;
        otherCar.collisionCooldown = 15;
        return true;
    }

    applyPowerup(type) {
        switch (type) {
            case 'boost':
                this.powerup = { type, timer: 90 };
                break;
            case 'shield':
                this.powerup = { type, timer: 150 };
                break;
            case 'missile':
                this.powerup = { type, timer: 0 };
                break;
        }
    }

    usePowerup() {
        if (!this.powerup) return;

        switch (this.powerup.type) {
            case 'boost':
                this.boostActive = true;
                this.boostTimer = 90;
                break;
            case 'shield':
                this.shieldActive = true;
                this._shieldTimer = 150;
                this._shieldCountdown = () => {
                    if (this._shieldTimer > 0) {
                        this._shieldTimer--;
                    } else {
                        this.shieldActive = false;
                    }
                };
                break;
            case 'missile':
                // Placeholder
                break;
        }

        this.powerup = null;
    }

    getState() {
        return {
            id: this.id,
            x: this.pos.x,
            y: this.pos.y,
            a: this.angle,
            vx: this.vel.x,
            vy: this.vel.y,
            sp: this.speed,
            lap: this.lap,
            cp: this.checkpoint,
            sc: this.score,
            hc: this.huddlesCleared,
            fin: this.finished,
            sh: this.shieldActive,
            bo: this.boostActive
        };
    }

    applyState(state) {
        this.pos.x = lerp(this.pos.x, state.x, 0.3);
        this.pos.y = lerp(this.pos.y, state.y, 0.3);
        this.angle = this.angle + wrapAngle(state.a - this.angle) * 0.3;
        this.vel.x = state.vx;
        this.vel.y = state.vy;
        this.speed = state.sp;
        this.lap = state.lap;
        this.checkpoint = state.cp;
        this.score = state.sc;
        this.huddlesCleared = state.hc;
        this.finished = state.fin;
        this.shieldActive = state.sh;
        this.boostActive = state.bo;
    }

    render(ctx, camera) {
        const sx = (this.pos.x - camera.x) * camera.zoom + ctx.canvas.width / 2;
        const sy = (this.pos.y - camera.y) * camera.zoom + ctx.canvas.height / 2;
        const margin = 100;

        // Skip if off-screen
        if (sx < -margin || sx > ctx.canvas.width + margin ||
            sy < -margin || sy > ctx.canvas.height + margin) {
            return;
        }

        const zoom = camera.zoom;
        const w = this.width * zoom;
        const h = this.height * zoom;
        const drawAngle = this.angle + this.driftAngle * 0.3;

        // Draw trail
        if (this.trail.length > 1) {
            ctx.beginPath();
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i];
                const tx = (t.x - camera.x) * zoom + ctx.canvas.width / 2;
                const ty = (t.y - camera.y) * zoom + ctx.canvas.height / 2;
                const alpha = (i / this.trail.length) * 0.4;
                if (i === 0) {
                    ctx.moveTo(tx, ty);
                } else {
                    ctx.lineTo(tx, ty);
                }
            }
            const rgb = hexToRgb(this.color);
            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
            ctx.lineWidth = 3 * zoom;
            ctx.stroke();
        }

        // Draw shadow
        ctx.save();
        ctx.translate(sx + 3 * zoom, sy + 3 * zoom);
        ctx.rotate(drawAngle);
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fill();
        ctx.restore();

        // Draw car body
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(drawAngle);

        // Main body (rounded rectangle)
        const bodyX = -w / 2;
        const bodyY = -h / 2;
        const radius = 4 * zoom;
        ctx.beginPath();
        ctx.moveTo(bodyX + radius, bodyY);
        ctx.lineTo(bodyX + w - radius, bodyY);
        ctx.arcTo(bodyX + w, bodyY, bodyX + w, bodyY + radius, radius);
        ctx.lineTo(bodyX + w, bodyY + h - radius);
        ctx.arcTo(bodyX + w, bodyY + h, bodyX + w - radius, bodyY + h, radius);
        ctx.lineTo(bodyX + radius, bodyY + h);
        ctx.arcTo(bodyX, bodyY + h, bodyX, bodyY + h - radius, radius);
        ctx.lineTo(bodyX, bodyY + radius);
        ctx.arcTo(bodyX, bodyY, bodyX + radius, bodyY, radius);
        ctx.closePath();
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Roof (darker inner rect)
        const roofMargin = 3 * zoom;
        const roofH = h * 0.35;
        const roofY = -roofH / 2;
        const rgb = hexToRgb(this.color);
        ctx.fillStyle = `rgb(${Math.max(0, rgb.r - 40)}, ${Math.max(0, rgb.g - 40)}, ${Math.max(0, rgb.b - 40)})`;
        ctx.fillRect(-w / 2 + roofMargin, roofY, w - roofMargin * 2, roofH);

        // Headlights (front = negative Y in car-local space, since angle 0 = right but we draw lengthwise)
        const lightW = w * 0.25;
        const lightH = h * 0.08;
        ctx.fillStyle = 'rgba(255, 255, 220, 0.9)';
        ctx.fillRect(-w / 2 + 2 * zoom, bodyY + 2 * zoom, lightW, lightH);
        ctx.fillRect(w / 2 - 2 * zoom - lightW, bodyY + 2 * zoom, lightW, lightH);

        // Taillights
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fillRect(-w / 2 + 2 * zoom, bodyY + h - 2 * zoom - lightH, lightW, lightH);
        ctx.fillRect(w / 2 - 2 * zoom - lightW, bodyY + h - 2 * zoom - lightH, lightW, lightH);

        ctx.restore();

        // Boost exhaust flames
        if (this.boostActive) {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(drawAngle);
            const flameCount = 3;
            for (let i = 0; i < flameCount; i++) {
                const flameLen = (8 + Math.random() * 10) * zoom;
                const flameW = (3 + Math.random() * 3) * zoom;
                const offsetX = (Math.random() - 0.5) * w * 0.4;
                ctx.beginPath();
                ctx.ellipse(offsetX, h / 2 + flameLen / 2, flameW / 2, flameLen / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = i === 0 ? 'rgba(255, 200, 0, 0.8)' : 'rgba(255, 100, 0, 0.6)';
                ctx.fill();
            }
            ctx.restore();
        }

        // Shield effect
        if (this.shieldActive) {
            ctx.save();
            ctx.translate(sx, sy);
            const shieldRadius = Math.max(w, h) * 0.8;
            const pulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
            ctx.beginPath();
            ctx.arc(0, 0, shieldRadius * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
            ctx.lineWidth = 2 * zoom;
            ctx.stroke();
            ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
            ctx.fill();
            ctx.restore();
        }

        // Name label
        ctx.save();
        ctx.font = `${Math.max(10, 11 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        const labelY = sy - h / 2 - 8 * zoom;
        ctx.strokeText(this.name, sx, labelY);
        ctx.fillText(this.name, sx, labelY);
        ctx.restore();

        // Shield timer tick (decrement here since render is called each frame)
        if (this.shieldActive && this._shieldCountdown) {
            this._shieldCountdown();
        }
    }

    getBoundingBox() {
        return {
            x: this.pos.x - this.width / 2,
            y: this.pos.y - this.height / 2,
            w: this.width,
            h: this.height
        };
    }

    getCorners() {
        const hw = this.width / 2;
        const hh = this.height / 2;
        const corners = [
            vec(-hw, -hh),
            vec(hw, -hh),
            vec(hw, hh),
            vec(-hw, hh)
        ];
        return corners.map(c => {
            const rotated = vecRotate(c, this.angle);
            return vec(this.pos.x + rotated.x, this.pos.y + rotated.y);
        });
    }
}
