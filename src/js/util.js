// Shared math / helpers. Everything lives on the global TR namespace.
window.TR = window.TR || {};

(function (TR) {
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  U.wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  U.angleDiff = (a, b) => U.wrapAngle(b - a);
  U.turnTowards = (cur, target, maxStep) => {
    const d = U.angleDiff(cur, target);
    if (Math.abs(d) <= maxStep) return target;
    return U.wrapAngle(cur + Math.sign(d) * maxStep);
  };
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.chance = (p) => Math.random() < p;
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  U.gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1], bell shaped
  U.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  };
  U.fmtNum = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Deterministic hash noise for procedural textures
  U.hash = (x, y, s) => {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 982451653) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  };

  // Closest point on segment / distance ray-circle
  U.rayCircle = (ox, oy, dx, dy, cx, cy, r) => {
    // returns t along normalized ray or -1
    const fx = ox - cx, fy = oy - cy;
    const b = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    let t = -b - s;
    if (t < 0) t = -b + s;
    if (t < 0) return -1;
    return t;
  };

  U.colorShade = (hex, amt) => {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  };

  // Binary heap for A*
  class Heap {
    constructor() { this.items = []; this.prio = []; }
    get size() { return this.items.length; }
    push(item, p) {
      const it = this.items, pr = this.prio;
      it.push(item); pr.push(p);
      let i = it.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (pr[par] <= pr[i]) break;
        [it[par], it[i]] = [it[i], it[par]];
        [pr[par], pr[i]] = [pr[i], pr[par]];
        i = par;
      }
    }
    pop() {
      const it = this.items, pr = this.prio;
      const top = it[0];
      const lastI = it.pop(), lastP = pr.pop();
      if (it.length > 0) {
        it[0] = lastI; pr[0] = lastP;
        let i = 0;
        const n = it.length;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < n && pr[l] < pr[m]) m = l;
          if (r < n && pr[r] < pr[m]) m = r;
          if (m === i) break;
          [it[m], it[i]] = [it[i], it[m]];
          [pr[m], pr[i]] = [pr[i], pr[m]];
          i = m;
        }
      }
      return top;
    }
  }
  U.Heap = Heap;

  TR.U = U;
})(window.TR);
