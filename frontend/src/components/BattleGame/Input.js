export class Input {
    constructor(canvas, gameClient) {
        this.canvas = canvas;
        this.client = gameClient;
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.touchStart = null;
        this.touchMove = null;
        this.shooting = false;
        this.lastShotAt = 0;
        this.shootCooldown = 800;
        this.localPlayerId = null;
        this.getState = null;

        this.setupKeyboard();
        this.setupMouse();
        this.setupTouch();
    }

    setLocalPlayer(id, stateGetter) {
        this.localPlayerId = id;
        this.getState = typeof stateGetter === 'function' ? stateGetter : () => stateGetter;
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === ' ') {
                e.preventDefault();
                this.tryShoot();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    setupMouse() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            this.sendRotation();
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.shooting = true;
            this.tryShoot();
        });

        this.canvas.addEventListener('mouseup', () => {
            this.shooting = false;
        });
    }

    setupTouch() {
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.touchStart = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top,
            };
            this.touchMove = { ...this.touchStart };
            this.shooting = true;
            this.tryShoot();
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.touchMove = {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top,
            };
            this.sendRotation();
            this.sendMoveFromTouch();
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.shooting = false;
            this.touchStart = null;
            this.touchMove = null;
            this.client.move(0, 0);
        });
    }

    sendMoveFromTouch() {
        if (!this.touchStart || !this.touchMove) return;

        const dx = this.touchMove.x - this.touchStart.x;
        const dy = this.touchMove.y - this.touchStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) {
            const nx = dx / dist;
            const ny = dy / dist;
            this.client.move(nx, ny);
        } else {
            this.client.move(0, 0);
        }
    }

    sendRotation() {
        if (!this.localPlayerId || !this.getState) return;

        const state = this.getState();
        const player = state?.players?.[this.localPlayerId];
        if (!player) return;

        const screenX = this.touchMove ? this.touchMove.x : this.mouseX;
        const screenY = this.touchMove ? this.touchMove.y : this.mouseY;

        const rotation = Math.atan2(
            screenY - this.canvas.height / 2,
            screenX - this.canvas.width / 2
        );
        this.client.rotate(rotation);
    }

    tryShoot() {
        const now = Date.now();
        if (now - this.lastShotAt < this.shootCooldown) return;
        this.lastShotAt = now;

        const screenX = this.touchMove ? this.touchMove.x : this.mouseX;
        const screenY = this.touchMove ? this.touchMove.y : this.mouseY;

        const angle = Math.atan2(
            screenY - this.canvas.height / 2,
            screenX - this.canvas.width / 2
        );
        this.client.shoot(angle);
    }

    update() {
        let dx = 0;
        let dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;

        if (dx !== 0 || dy !== 0) {
            this.client.move(dx, dy);
        }

        if (this.shooting) {
            this.tryShoot();
        }
    }
}
