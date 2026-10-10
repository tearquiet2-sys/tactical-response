// Line of sight / field of view (GDD 22 & 45) and camera.
(function (TR) {
  const U = TR.U;
  const TS = TR.TS;

  const Vision = {
    RAYS: 540,
    profile(v) {
      if (v.kind === 'player') return { cone: 1.08, blend: 0.25, long: 26, short: 3.4 };
      if (v.kind === 'mirror') return { cone: 1.2, blend: 0.2, long: 12, short: 0.6 };
      if (v.kind === 'drone') return { cone: 1.25, blend: 0.3, long: 13, short: 2.4 };
      return { cone: 1.02, blend: 0.25, long: 20, short: 2.6 };
    },
    rangeAt(v, pr, a) {
      const diff = Math.abs(U.angleDiff(v.angle, a));
      if (diff <= pr.cone) return pr.long;
      if (diff <= pr.cone + pr.blend) { const t = (diff - pr.cone) / pr.blend; return U.lerp(pr.long, pr.short, t * t); }
      return pr.short;
    },
    polygon(map, v) {
      const pr = this.profile(v);
      const n = this.RAYS;
      const pts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI + (i / n) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        const r = this.rangeAt(v, pr, a);
        const d = map.raycast(v.x, v.y, dx, dy, r, map.sightBlock);
        pts[i * 2] = v.x + dx * d; pts[i * 2 + 1] = v.y + dy * d;
      }
      return { pts, x: v.x, y: v.y, long: pr.long };
    },
    sees(map, v, t) {
      const pr = this.profile(v);
      const d = U.dist(v.x, v.y, t.x, t.y);
      const a = U.angleTo(v.x, v.y, t.x, t.y);
      if (d > this.rangeAt(v, pr, a) + t.r) return false;
      return map.los(v.x, v.y, t.x, t.y);
    }
  };
  TR.Vision = Vision;

  class Camera {
    constructor() {
      this.x = 0; this.y = 0; this.level = 1; this.dpr = 1; this.sx = 0; this.sy = 0;
      this.resize(window.innerWidth || 1600, window.innerHeight || 900, 1);
    }
    resize(W, H, dpr) { this.W = W; this.H = H; this.dpr = dpr; this.base = Math.max(0.8, Math.min(2.2, H / (TS * 17))); }
    get z() { return this.base * this.level; }
    toScreen(wx, wy) { const z = this.z; return [(wx - this.x) * TS * z + this.W / 2 + this.sx, (wy - this.y) * TS * z + this.H / 2 + this.sy]; }
    toWorld(sx, sy) { const z = this.z; return [(sx - this.W / 2 - this.sx) / (TS * z) + this.x, (sy - this.H / 2 - this.sy) / (TS * z) + this.y]; }
    apply(g) {
      const z = this.z * this.dpr;
      g.setTransform(z, 0, 0, z, (this.W / 2 + this.sx - this.x * TS * this.z) * this.dpr, (this.H / 2 + this.sy - this.y * TS * this.z) * this.dpr);
    }
  }
  TR.Camera = Camera;
})(window.TR);
