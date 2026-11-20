// input.js — keyboard and mouse state for Port Solace.
// One shared Input singleton: gameplay modules read held keys, edge-triggered presses
// and mouse movement each frame; the self-test can inject keys through the same surface.

export class Input {
  constructor() {
    this.keys = new Set();       // key codes currently held ('KeyW', 'Space', ...)
    this.pressed = new Set();    // codes that went down since the last frame consumed them
    this.mouseDX = 0;            // accumulated pointer movement, drained by the camera
    this.mouseDY = 0;
    this.mouseDown = false;      // left button held (shooting)
    this.mouseClicked = false;   // left button edge, drained per frame
    this.enabled = true;         // menus turn this off so keys do not leak into gameplay
    this._bound = false;
  }

  bind(dom) {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === dom) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
  }

  // --- read surface used by gameplay ---
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }              // edge: true once per press
  axis(negCode, posCode) { return (this.down(posCode) ? 1 : 0) - (this.down(negCode) ? 1 : 0); }

  drainMouse() {
    const d = { dx: this.mouseDX, dy: this.mouseDY, clicked: this.mouseClicked };
    this.mouseDX = 0; this.mouseDY = 0; this.mouseClicked = false;
    return d;
  }

  endFrame() { this.pressed.clear(); }

  // --- test hooks: the headless self-test drives the game through these ---
  inject(code, isDown) {
    if (isDown) { this.keys.add(code); this.pressed.add(code); }
    else this.keys.delete(code);
  }
  injectClick() { this.mouseDown = true; this.mouseClicked = true; }
  releaseClick() { this.mouseDown = false; }
}

export const input = new Input();
