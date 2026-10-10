// Doors: hinged leaves that block movement/sight/bullets while closed.
(function (TR) {
  const U = TR.U;
  const TS = TR.TS;

  class Door {
    constructor(map, id, def) {
      this.map = map; this.id = id;
      this.x = def.x; this.y = def.y;
      this.cx = def.x + 0.5; this.cy = def.y + 0.5;
      const t = (xx, yy) => map.cellType(xx, yy);
      const C = TR.CELL;
      const solidL = t(def.x - 1, def.y) === C.T_WALL || t(def.x - 1, def.y) === C.T_GLASS || t(def.x - 1, def.y) === C.T_DOOR;
      const solidR = t(def.x + 1, def.y) === C.T_WALL || t(def.x + 1, def.y) === C.T_GLASS || t(def.x + 1, def.y) === C.T_DOOR;
      this.horizontal = solidL || solidR;
      this.nx = this.horizontal ? 0 : 1; this.ny = this.horizontal ? 1 : 0; // normal
      this.tx = this.horizontal ? 1 : 0; this.ty = this.horizontal ? 0 : 1; // tangent (along the leaf)
      this.locked = def.locked; this.lockKnown = false;
      this.isOpen = def.open; this.broken = false; this.blown = false;
      this.swing = 1; this.anim = this.isOpen ? 1 : 0;
      this.glass = def.glass;
      this.name = def.name;
      this.hingeFlip = U.hash(def.x, def.y, 5) > 0.5;
      this.metal = false;
      this.lastUse = 0;
      this.wedged = false;
    }
    side(px, py) { return (px - this.cx) * this.nx + (py - this.cy) * this.ny >= 0 ? 1 : -1; }
    // point just outside the door on a given side
    sidePoint(side, dist) { return [this.cx + this.nx * side * dist, this.cy + this.ny * side * dist]; }
    applyBlocking() {
      const i = this.map.idx(this.x, this.y);
      const b = this.isOpen ? 0 : 1;
      this.map.moveBlock[i] = b;
      this.map.sightBlock[i] = (this.glass ? 0 : b) || (this.map.smoke && this.map.smoke[i] > 0 ? 1 : 0);
      this.map.bulletBlock[i] = b;
    }
    open(byX, byY, by) {
      if (this.isOpen) return true;
      if (this.wedged) {
        if (!by || by.faction !== 'police') return false;
        this.wedged = false;
      }
      if (this.locked) { this.lockKnown = true; return false; }
      this.isOpen = true;
      this.swing = -this.side(byX, byY);
      this.applyBlocking();
      TR.Audio.play('doorOpen', this.cx, this.cy);
      if (TR.game) TR.game.noise(this.cx, this.cy, 5, 'door', null);
      return true;
    }
    close(game) {
      if (!this.isOpen || this.broken) return false;
      // don't close on someone
      for (const c of game.characters) {
        if (!c.alive && !c.body) continue;
        if (Math.abs(c.x - this.cx) < 0.5 + c.r && Math.abs(c.y - this.cy) < 0.5 + c.r) {
          if (U.dist(c.x, c.y, this.cx, this.cy) < 0.5 + c.r * 0.8) return false;
        }
      }
      this.isOpen = false;
      this.applyBlocking();
      TR.Audio.play('doorClose', this.cx, this.cy);
      return true;
    }
    serialize() { return { o: this.isOpen, l: this.locked, k: this.lockKnown, b: this.broken, x: this.blown, s: this.swing, w: this.wedged }; }
    restore(s) {
      this.isOpen = s.o; this.locked = s.l; this.lockKnown = s.k; this.broken = s.b; this.blown = s.x; this.swing = s.s; this.wedged = s.w;
      this.anim = this.isOpen ? 1 : 0; this.applyBlocking();
    }
    forceOpen(byX, byY, blown) {
      this.locked = false; this.wedged = false;
      this.isOpen = true; this.broken = true; this.blown = !!blown;
      this.swing = -this.side(byX, byY);
      this.anim = 1;
      this.applyBlocking();
    }
    update(dt) {
      const target = this.isOpen ? 1 : 0;
      const sp = this.broken ? 20 : 5;
      if (this.anim < target) this.anim = Math.min(target, this.anim + dt * sp);
      else if (this.anim > target) this.anim = Math.max(target, this.anim - dt * sp);
    }
    draw(g, showLock) {
      const px = this.x * TS, py = this.y * TS;
      // frame posts
      g.fillStyle = '#2a2d31';
      if (this.horizontal) { g.fillRect(px - 1, py + 10, 4, 12); g.fillRect(px + TS - 3, py + 10, 4, 12); }
      else { g.fillRect(px + 10, py - 1, 12, 4); g.fillRect(px + 10, py + TS - 3, 12, 4); }
      if (this.blown) {
        // splinters
        g.fillStyle = '#4a3322';
        for (let i = 0; i < 6; i++) {
          const a = U.hash(this.x, this.y, i), b = U.hash(this.y, this.x, i + 3);
          g.save(); g.translate(px + a * TS, py + b * TS); g.rotate(a * 6); g.fillRect(-4, -1, 8, 2.5); g.restore();
        }
        return;
      }
      const hx = this.horizontal ? (this.hingeFlip ? this.x + 1 : this.x) : this.cx;
      const hy = this.horizontal ? this.cy : (this.hingeFlip ? this.y + 1 : this.y);
      const baseA = this.horizontal ? (this.hingeFlip ? Math.PI : 0) : (this.hingeFlip ? -Math.PI / 2 : Math.PI / 2);
      // swing direction: rotate towards normal*swing
      const nA = Math.atan2(this.ny * this.swing, this.nx * this.swing);
      const d = U.angleDiff(baseA, nA);
      const ease = this.anim * this.anim * (3 - 2 * this.anim);
      const a = baseA + d * ease * (this.broken ? 0.92 : 1);
      g.save();
      g.translate(hx * TS, hy * TS);
      g.rotate(a);
      const len = TS - 1;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2, -2, len, 7);
      g.fillStyle = this.glass ? 'rgba(160,210,230,0.55)' : (this.metal ? '#59606a' : '#6b4a2e');
      g.fillRect(0, -3, len, 6);
      g.fillStyle = this.glass ? 'rgba(230,250,255,0.7)' : 'rgba(255,220,170,0.15)';
      g.fillRect(0, -3, len, 1.5);
      // handle
      g.fillStyle = '#c9b27a'; g.fillRect(len - 7, -4.5, 3, 9);
      g.restore();
      if (this.wedged && !this.isOpen) {
        g.fillStyle = '#e8b04a';
        g.save(); g.translate(this.cx * TS, this.cy * TS); g.rotate(this.horizontal ? 0 : Math.PI / 2);
        g.beginPath(); g.moveTo(-5, 6); g.lineTo(5, 6); g.lineTo(-5, 10); g.closePath(); g.fill();
        g.restore();
      }
      if (showLock && this.locked && this.lockKnown) {
        g.fillStyle = '#c84a3a';
        g.beginPath(); g.arc(this.cx * TS, this.cy * TS, 5, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.fillRect(this.cx * TS - 1, this.cy * TS - 2.5, 2, 5);
      }
    }
  }
  TR.Door = Door;
})(window.TR);
