// Visual effects: tracers, particles, decals, lights, floating text.
(function (TR) {
  const U = TR.U;
  const TS = TR.TS;

  class FX {
    constructor(game) {
      this.game = game;
      this.items = [];
      this.lights = [];
      const m = game.map;
      this.decal = document.createElement('canvas');
      this.decal.width = m.w * TS; this.decal.height = m.h * TS;
      this.dg = this.decal.getContext('2d');
    }
    add(o) { this.items.push(o); return o; }
    tracer(x0, y0, x1, y1, col) { this.add({ type: 'tracer', x0, y0, x1, y1, t: 0.07, max: 0.07, col: col || 'rgba(255,236,170,' }); }
    taserWire(src, x1, y1) { this.add({ type: 'wire', src, x1, y1, t: 1.0, max: 1.0 }); }
    muzzleLight(x, y) { this.lights.push({ x, y, r: 3.2, t: 0.05, max: 0.05, col: '255,210,140', a: 0.35 }); }
    sparks(x, y, a, n) {
      for (let i = 0; i < n; i++) {
        const aa = a + U.rand(-1, 1); const sp = U.rand(2, 6);
        this.add({ type: 'spark', x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, t: U.rand(0.08, 0.2), max: 0.2 });
      }
      this.add({ type: 'dust', x, y, t: 0.5, max: 0.5, r: 0.12 });
    }
    blood(x, y, a, dmg) {
      const n = Math.min(10, 3 + (dmg / 8) | 0);
      for (let i = 0; i < n; i++) {
        const aa = a + U.rand(-0.5, 0.5); const sp = U.rand(1, 4.5);
        this.add({ type: 'blood', x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, t: U.rand(0.15, 0.35), max: 0.35, s: U.rand(1.2, 2.6) });
      }
      // decal splat behind target
      const g = this.dg;
      const bx = (x + Math.cos(a) * U.rand(0.2, 0.6)) * TS, by = (y + Math.sin(a) * U.rand(0.2, 0.6)) * TS;
      g.fillStyle = 'rgba(110,12,10,' + U.rand(0.35, 0.6) + ')';
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(bx + U.rand(-5, 5), by + U.rand(-5, 5), U.rand(1.5, 4.5), 0, 7); g.fill(); }
    }
    bloodPool(x, y) {
      this.add({ type: 'pool', x, y, t: 6, max: 6, r: 0 });
    }
    bulletHole(x, y) {
      const g = this.dg;
      g.fillStyle = 'rgba(15,15,15,0.7)'; g.beginPath(); g.arc(x * TS, y * TS, 1.3, 0, 7); g.fill();
    }
    scorch(x, y, r) {
      const g = this.dg;
      const gr = g.createRadialGradient(x * TS, y * TS, 0, x * TS, y * TS, r * TS);
      gr.addColorStop(0, 'rgba(10,8,6,0.75)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x * TS, y * TS, r * TS, 0, 7); g.fill();
    }
    shell(x, y, a) {
      const aa = a + Math.PI / 2 + U.rand(-0.3, 0.3); const sp = U.rand(1.5, 3);
      this.add({ type: 'shell', x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, t: 0.35, max: 0.35, rot: Math.random() * 6 });
    }
    flash(x, y) {
      this.lights.push({ x, y, r: 9, t: 0.35, max: 0.35, col: '255,255,255', a: 0.95 });
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28; this.add({ type: 'smoke', x, y, vx: Math.cos(a) * U.rand(0.3, 1.2), vy: Math.sin(a) * U.rand(0.3, 1.2), t: U.rand(1.5, 3), max: 3, r: U.rand(0.3, 0.7) }); }
    }
    explosion(x, y) {
      this.lights.push({ x, y, r: 7, t: 0.4, max: 0.4, col: '255,170,90', a: 0.9 });
      for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; const sp = U.rand(0.5, 3); this.add({ type: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: U.rand(1.5, 3.5), max: 3.5, r: U.rand(0.35, 0.9), dark: true }); }
      for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; const sp = U.rand(3, 9); this.add({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: U.rand(0.15, 0.4), max: 0.4 }); }
      this.scorch(x, y, 1.4);
    }
    dust(x, y) { this.add({ type: 'dust', x: x + U.rand(-0.1, 0.1), y: y + U.rand(-0.1, 0.1), t: 0.45, max: 0.45, r: 0.08 }); }
    puff(x, y) { for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; this.add({ type: 'smoke', x, y, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6, t: 1.2, max: 1.2, r: 0.2, tint: 'rgba(230,200,120,' }); } }
    stinger(x, y) {
      this.lights.push({ x, y, r: 5, t: 0.2, max: 0.2, col: '255,230,200', a: 0.6 });
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, sp = U.rand(4, 10); this.add({ type: 'pellet', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: U.rand(0.2, 0.45), max: 0.45 }); }
      for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28; this.add({ type: 'smoke', x, y, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8, t: 1.5, max: 1.5, r: 0.3 }); }
    }
    popup(x, y, text, col) { this.add({ type: 'text', x, y, text, col: col || '#e8c46a', t: 1.6, max: 1.6 }); }

    update(dt) {
      for (const o of this.items) {
        o.t -= dt;
        if (o.vx != null) {
          o.x += o.vx * dt; o.y += o.vy * dt;
          const f = o.type === 'smoke' ? 0.35 : 0.02;
          const k = Math.pow(f, dt); o.vx *= k; o.vy *= k;
        }
        if (o.type === 'shell' && o.t <= 0) {
          const g = this.dg; g.fillStyle = '#b08a3e'; g.save(); g.translate(o.x * TS, o.y * TS); g.rotate(o.rot); g.fillRect(-1.5, -0.7, 3, 1.4); g.restore();
        }
        if (o.type === 'blood' && o.t <= 0) {
          const g = this.dg; g.fillStyle = 'rgba(100,10,8,0.6)'; g.beginPath(); g.arc(o.x * TS, o.y * TS, o.s, 0, 7); g.fill();
        }
        if (o.type === 'pool') {
          o.r = Math.min(0.55, o.r + dt * 0.25);
          if (o.t <= 0) { const g = this.dg; g.fillStyle = 'rgba(90,8,6,0.75)'; g.beginPath(); g.ellipse(o.x * TS, o.y * TS, o.r * TS, o.r * TS * 0.8, 0.3, 0, 7); g.fill(); }
        }
      }
      this.items = this.items.filter((o) => o.t > 0);
      for (const l of this.lights) l.t -= dt;
      this.lights = this.lights.filter((l) => l.t > 0);
    }

    drawUnder(g) {
      for (const o of this.items) {
        if (o.type === 'pool') {
          g.fillStyle = 'rgba(90,8,6,0.75)'; g.beginPath(); g.ellipse(o.x * TS, o.y * TS, o.r * TS, o.r * TS * 0.8, 0.3, 0, 7); g.fill();
        }
      }
    }
    draw(g) {
      for (const o of this.items) {
        const k = o.t / o.max;
        switch (o.type) {
          case 'tracer':
            g.strokeStyle = o.col + (0.8 * k) + ')'; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(o.x0 * TS, o.y0 * TS); g.lineTo(o.x1 * TS, o.y1 * TS); g.stroke();
            break;
          case 'wire':
            if (!o.src.alive) break;
            g.strokeStyle = 'rgba(200,220,255,' + (0.8 * k) + ')'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(o.src.x * TS, o.src.y * TS);
            g.quadraticCurveTo(((o.src.x + o.x1) / 2) * TS + 6, ((o.src.y + o.y1) / 2) * TS + 6, o.x1 * TS, o.y1 * TS); g.stroke();
            if (Math.random() < 0.5) { g.fillStyle = '#bfe4ff'; g.beginPath(); g.arc(o.x1 * TS, o.y1 * TS, 2.5, 0, 7); g.fill(); }
            break;
          case 'spark':
            g.fillStyle = 'rgba(255,220,130,' + k + ')'; g.fillRect(o.x * TS - 1, o.y * TS - 1, 2, 2);
            break;
          case 'blood':
            g.fillStyle = 'rgba(140,15,12,' + k + ')'; g.beginPath(); g.arc(o.x * TS, o.y * TS, o.s, 0, 7); g.fill();
            break;
          case 'shell':
            g.fillStyle = '#d0a64a'; g.save(); g.translate(o.x * TS, o.y * TS); g.rotate(o.rot + k * 10); g.fillRect(-1.5, -0.7, 3, 1.4); g.restore();
            break;
          case 'dust':
            g.fillStyle = 'rgba(180,170,150,' + (0.35 * k) + ')'; g.beginPath(); g.arc(o.x * TS, o.y * TS, (o.r + (1 - k) * 0.25) * TS, 0, 7); g.fill();
            break;
          case 'pellet':
            g.fillStyle = 'rgba(40,40,40,' + k + ')'; g.fillRect(o.x * TS - 1, o.y * TS - 1, 2, 2);
            break;
          case 'smoke':
            g.fillStyle = (o.tint || (o.dark ? 'rgba(60,55,50,' : 'rgba(210,210,205,')) + (0.35 * k) + ')';
            g.beginPath(); g.arc(o.x * TS, o.y * TS, (o.r + (1 - k) * 0.6) * TS, 0, 7); g.fill();
            break;
        }
      }
    }
    drawLights(g) {
      g.globalCompositeOperation = 'lighter';
      for (const l of this.lights) {
        const k = l.t / l.max;
        const gr = g.createRadialGradient(l.x * TS, l.y * TS, 0, l.x * TS, l.y * TS, l.r * TS);
        gr.addColorStop(0, 'rgba(' + l.col + ',' + (l.a * k) + ')'); gr.addColorStop(1, 'rgba(' + l.col + ',0)');
        g.fillStyle = gr; g.beginPath(); g.arc(l.x * TS, l.y * TS, l.r * TS, 0, 7); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    drawText(g, cam) {
      for (const o of this.items) {
        if (o.type !== 'text') continue;
        const k = o.t / o.max;
        const s = cam.toScreen(o.x, o.y - (1 - k) * 0.8);
        g.globalAlpha = Math.min(1, k * 2);
        g.font = '600 13px Bahnschrift, "Segoe UI", sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(o.text, s[0] + 1, s[1] + 1);
        g.fillStyle = o.col; g.fillText(o.text, s[0], s[1]);
        g.globalAlpha = 1;
      }
    }
  }
  TR.FX = FX;
})(window.TR);
