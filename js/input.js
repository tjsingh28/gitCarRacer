export class InputManager {
    constructor() {
        this.keys = {};
        this.touches = { left: false, right: false, gas: false, brake: false };
        this._bind();
    }

    _bind() {
        window.addEventListener('keydown', e => { this.keys[e.code] = true; });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });

        // Mobile buttons
        const mapBtn = (id, prop) => {
            const el = document.getElementById(id);
            if (!el) return;
            const on = () => { this.touches[prop] = true; };
            const off = () => { this.touches[prop] = false; };
            el.addEventListener('touchstart', e => { e.preventDefault(); on(); });
            el.addEventListener('touchend', e => { e.preventDefault(); off(); });
            el.addEventListener('touchcancel', off);
            el.addEventListener('mousedown', on);
            el.addEventListener('mouseup', off);
            el.addEventListener('mouseleave', off);
        };
        mapBtn('ctrl-left', 'left');
        mapBtn('ctrl-right', 'right');
        mapBtn('ctrl-gas', 'gas');
        mapBtn('ctrl-brake', 'brake');
    }

    get left()  { return this.keys['ArrowLeft']  || this.keys['KeyA'] || this.touches.left; }
    get right() { return this.keys['ArrowRight'] || this.keys['KeyD'] || this.touches.right; }
    get up()    { return this.keys['ArrowUp']    || this.keys['KeyW'] || this.touches.gas; }
    get down()  { return this.keys['ArrowDown']  || this.keys['KeyS'] || this.touches.brake; }
}
