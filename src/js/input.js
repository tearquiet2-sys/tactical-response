// Keyboard / mouse state with per-frame "pressed" edges.
(function (TR) {
  const Input = {
    down: {}, pressed: {}, released: {},
    mouse: { x: 0, y: 0, down: [false, false, false], pressed: [false, false, false], released: [false, false, false] },
    wheel: 0,
    enabled: false,
    captureKeys: ['Tab', 'Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'KeyQ', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyB', 'KeyH', 'KeyT', 'KeyV', 'KeyC', 'KeyM', 'ArrowUp', 'ArrowDown'],

    init(canvas) {
      window.addEventListener('keydown', (e) => {
        if (this.enabled && (this.captureKeys.includes(e.code) || e.code.startsWith('Digit'))) e.preventDefault();
        if (!this.down[e.code]) this.pressed[e.code] = true;
        this.down[e.code] = true;
      });
      window.addEventListener('keyup', (e) => {
        this.down[e.code] = false;
        this.released[e.code] = true;
      });
      window.addEventListener('blur', () => { this.down = {}; this.mouse.down = [false, false, false]; });
      canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
      window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button < 3) {
          this.mouse.down[e.button] = true; this.mouse.pressed[e.button] = true;
        }
        if (e.button === 1) e.preventDefault();
      });
      window.addEventListener('mouseup', (e) => {
        if (e.button < 3) { this.mouse.down[e.button] = false; this.mouse.released[e.button] = true; }
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    },
    endFrame() {
      this.pressed = {}; this.released = {};
      this.mouse.pressed = [false, false, false];
      this.mouse.released = [false, false, false];
      this.wheel = 0;
    },
    key(code) { return !!this.down[code]; },
    hit(code) { return !!this.pressed[code]; },
    up(code) { return !!this.released[code]; }
  };
  TR.Input = Input;
})(window.TR);
