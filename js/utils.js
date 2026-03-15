// Vector math helpers
export function vec(x = 0, y = 0) { return { x, y }; }
export function vecAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
export function vecSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
export function vecScale(v, s) { return { x: v.x * s, y: v.y * s }; }
export function vecLen(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
export function vecNorm(v) { const l = vecLen(v) || 1; return { x: v.x / l, y: v.y / l }; }
export function vecDot(a, b) { return a.x * b.x + a.y * b.y; }
export function vecDist(a, b) { return vecLen(vecSub(a, b)); }
export function vecRotate(v, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}
export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function randRange(min, max) { return min + Math.random() * (max - min); }
export function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }

// Seeded random for procedural generation
export function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (s >>> 0) / 0xFFFFFFFF;
    };
}

// Generate 4-character room code
export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// Collision: axis-aligned bounding box
export function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
}

// Collision: circle vs circle
export function circleOverlap(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < a.r + b.r;
}

// Angle wrapping
export function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

// Point-in-polygon (for track boundaries)
export function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// Hex color to RGB
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
}
