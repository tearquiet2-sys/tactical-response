// In-game HUD, drawn in screen space on the main canvas.
(function (TR) {
  const U = TR.U, I = TR.Input, t = (...a) => TR.t(...a);
  const F = (w, s) => w + ' ' + s + 'px Bahnschrift, "Segoe UI", sans-serif';
  const C = { panel: 'rgba(12,15,19,0.72)', line: 'rgba(255,255,255,0.08)', text: '#d9dcdf', dim: '#8b939b', amber: '#e8b04a', red: '#d9544a', green: '#7fc98a', blue: '#6fb3de' };

  const HUD = {
    tipEl: null,
    init() { this.tipEl = document.getElementById('tip'); },

    panel(g, x, y, w, h) {
      g.fillStyle = C.panel; g.fillRect(x, y, w, h);
      g.fillStyle = C.line; g.fillRect(x, y, w, 1);
      g.fillStyle = C.amber; g.fillRect(x, y, 3, h);
    },
    bar(g, x, y, w, h, k, col) {
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, w, h);
      g.fillStyle = col; g.fillRect(x, y, Math.max(0, w * U.clamp(k, 0, 1)), h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 1; i < 10; i++) g.fillRect(x + (w * i) / 10, y, 1, h);
    },
    vignette(g, W, H) {
      if (!this._vig || this._vig.w !== W || this._vig.h !== H) {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const v = c.getContext('2d');
        const gr = v.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
        v.fillStyle = gr; v.fillRect(0, 0, W, H);
        this._vig = { c, w: W, h: H };
      }
      g.drawImage(this._vig.c, 0, 0, W, H);
    },

    // operation mode status (top centre, below the room / hostage / CCTV lines): countdown and reinforcement waves
    drawMode(g, game, W) {
      const md = game.mode;
      let y = 128;
      if (md.timeLimit) {
        const done = game.containedT != null;
        const left = Math.max(0, md.timeLimit - (done ? game.containedT : game.time));
        const urgent = !done && left <= 30;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 110, y - 14, 220, 44);
        g.fillStyle = done ? C.green : urgent ? C.red : C.amber; g.fillRect(W / 2 - 110, y - 14, 220, 2);
        g.font = F('600', 10); g.fillStyle = C.dim; g.fillText(done ? t('hud.contained') : t('hud.timeLeft'), W / 2, y);
        g.font = F('700', 22);
        g.fillStyle = done ? C.green : urgent && Math.floor(game.time * 4) % 2 ? '#fff' : urgent ? C.red : C.text;
        g.fillText(U.fmtTime(left), W / 2, y + 23);
        y += 54;
      }
      if (md.waves) {
        const n = md.waves.length, next = md.waves[game.waveIdx];
        let txt = t('hud.wave', game.waveIdx, n);
        if (next && !game.extractReady) txt += '  ·  ' + t('hud.nextWave', U.fmtTime(Math.max(0, next.t - game.time)));
        else if (!next) txt += '  ·  ' + t('hud.wavesDone');
        g.font = F('700', 12);
        const tw = g.measureText(txt).width + 24;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - tw / 2, y - 14, tw, 22);
        g.fillStyle = next && next.t - game.time < 10 && !game.extractReady ? C.red : C.amber;
        g.fillText(txt, W / 2, y + 1);
      }
    },

    draw(g, game, W, H) {
      const p = game.player;
      g.textBaseline = 'alphabetic';
      if (TR.Save.data.settings.vignette) this.vignette(g, W, H);
      if (game.showMap) { game.drawTacticalMap(g, W, H); this.syncTip(game); return; }
      this.drawBubbles(g, game);
      game.fx.drawText(g, game.camera);
      // --- TEAM (top-left)
      let x = 16, y = 16;
      this.panel(g, x, y, 250, 26 + game.officers.length * 40);
      g.font = F('600', 11); g.fillStyle = C.dim; g.textAlign = 'left';
      g.fillText(game.officers.length ? t('hud.team') : t('hud.solo'), x + 14, y + 17);
      game.officers.forEach((o, i) => {
        const yy = y + 28 + i * 40;
        g.fillStyle = o.op.color; g.fillRect(x + 14, yy + 2, 4, 30);
        g.font = F('700', 13); g.fillStyle = o.alive ? C.text : C.red;
        g.fillText(o.op.call, x + 26, yy + 14);
        g.font = F('400', 11); g.fillStyle = C.dim;
        g.fillText(t('role.' + o.op.role), x + 90, yy + 14);
        g.textAlign = 'right';
        g.fillStyle = o.alive ? (o.threat ? C.red : C.amber) : C.red;
        g.fillText(t('st.' + (o.alive ? (o.threat ? 'ENGAGING' : o.status) : 'DOWN')), x + 236, yy + 14);
        g.textAlign = 'left';
        this.bar(g, x + 26, yy + 21, 210, 6, o.hp / o.maxHp, o.hp > 50 ? C.green : o.hp > 25 ? C.amber : C.red);
      });

      // --- OBJECTIVES (top-right)
      const objs = game.objectives.filter((o) => !o.hidden);
      const ow = 360;
      x = W - ow - 16; y = 16;
      this.panel(g, x, y, ow, 30 + objs.length * 22);
      g.font = F('600', 11); g.fillStyle = C.dim; g.fillText(t('hud.objectives'), x + 14, y + 17);
      g.textAlign = 'right'; g.fillStyle = C.text; g.font = F('600', 12); g.fillText(U.fmtTime(game.time), x + ow - 12, y + 17); g.textAlign = 'left';
      objs.forEach((o, i) => {
        const st = game.objectiveState(o);
        const yy = y + 38 + i * 22;
        g.strokeStyle = st.failed ? C.red : st.done ? C.green : C.dim; g.lineWidth = 1.5;
        g.strokeRect(x + 14, yy - 10, 11, 11);
        if (st.done) { g.strokeStyle = C.green; g.beginPath(); g.moveTo(x + 16, yy - 5); g.lineTo(x + 19, yy - 1); g.lineTo(x + 24, yy - 9); g.stroke(); }
        if (st.failed) { g.strokeStyle = C.red; g.beginPath(); g.moveTo(x + 16, yy - 8); g.lineTo(x + 23, yy - 1); g.moveTo(x + 23, yy - 8); g.lineTo(x + 16, yy - 1); g.stroke(); }
        g.font = F(o.mandatory ? '600' : '400', 12);
        g.fillStyle = st.done ? C.dim : (o.id === 'extract' ? C.green : C.text);
        let txt = TR.t('obj.' + o.id) + (o.mandatory ? '' : ' ' + t('hud.optional'));
        if (g.measureText(txt).width > ow - 96) { while (g.measureText(txt + '…').width > ow - 96 && txt.length > 8) txt = txt.slice(0, -1); txt += '…'; }
        g.fillText(txt, x + 32, yy);
        if (st.count) { g.textAlign = 'right'; g.fillStyle = st.done ? C.green : C.amber; g.fillText(st.count, x + ow - 12, yy); g.textAlign = 'left'; }
      });
      // kill / event feed under the objectives
      let fy = y + 30 + objs.length * 22 + 20;
      g.textAlign = 'right'; g.font = F('600', 12);
      game.feed.forEach((f, i) => {
        g.globalAlpha = Math.min(1, f.t);
        const tw = g.measureText(f.text).width + 16;
        g.fillStyle = 'rgba(12,15,19,0.7)'; g.fillRect(W - 16 - tw, fy + i * 22 - 14, tw, 19);
        g.fillStyle = f.col; g.fillText(f.text, W - 24, fy + i * 22);
        g.globalAlpha = 1;
      });
      g.textAlign = 'left';

      // --- top centre: mission + room
      g.textAlign = 'center';
      g.font = F('600', 11); g.fillStyle = C.dim;
      g.fillText(t('hud.mission') + ' ' + game.mission.code + ' · ' + game.mission.name, W / 2, 26);
      if (game.roomLabel) {
        g.globalAlpha = Math.min(1, game.roomLabel.t);
        g.font = F('700', 18); g.fillStyle = C.text; g.fillText(game.roomLabel.text, W / 2, 50);
        g.globalAlpha = 1;
      }
      if (game.hostageTension > 0.05) {
        const k = game.hostageTension;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 160, 62, 320, 26);
        g.fillStyle = C.red; g.fillRect(W / 2 - 156, 80, 312 * k, 4);
        g.font = F('700', 12); g.fillStyle = (Math.floor(game.time * 4) % 2) ? C.red : '#fff'; g.fillText(t('hud.hostage'), W / 2, 76);
      }
      this.drawMode(g, game, W);
      if (game.revealT > 0) { g.font = F('700', 12); g.fillStyle = C.blue; g.fillText('● ' + t('hud.cctv') + '  ' + game.revealT.toFixed(1) + 's', W / 2, 100); }
      if (p.mirror) { g.font = F('700', 12); g.fillStyle = C.blue; g.fillText(t('hud.mirror'), W / 2, 100); }
      g.font = F('600', 10); g.fillStyle = 'rgba(139,147,155,0.7)'; g.fillText('[M] ' + t('hud.map'), W / 2, H - 8);
      g.textAlign = 'left';

      // --- radio log (left)
      y = 16 + 26 + game.officers.length * 40 + 18;
      game.radioLog.forEach((r, i) => {
        g.globalAlpha = Math.min(1, r.t);
        g.font = F('700', 12); g.fillStyle = r.color; g.fillText(r.name + ':', 18, y + i * 18);
        const nw = g.measureText(r.name + ': ').width;
        g.font = F('400', 12); g.fillStyle = C.text; g.fillText(r.text, 18 + nw, y + i * 18);
        g.globalAlpha = 1;
      });

      // --- HP / armor / equipment (bottom-left)
      x = 16; y = H - 118;
      this.panel(g, x, y, 300, 102);
      g.font = F('600', 11); g.fillStyle = C.dim; g.fillText(t('hud.hp'), x + 14, y + 22); g.fillText(t('hud.armor'), x + 14, y + 42);
      this.bar(g, x + 76, y + 13, 208, 10, p.hp / p.maxHp, p.hp > 50 ? C.green : p.hp > 25 ? C.amber : C.red);
      this.bar(g, x + 76, y + 33, 208, 10, p.maxArmor ? p.armor / p.maxArmor : 0, C.blue);
      const gr = p.curGrenade;
      const eq = [['G', gr ? t('g.' + gr.type) : t('g.flash'), gr ? gr.count : 0], ['B', 'C2', p.charges], ['H', t('hud.medkit'), p.medkits]];
      eq.forEach((e, i) => {
        const ex = x + 14 + i * 96;
        g.fillStyle = e[2] > 0 ? C.amber : C.dim; g.font = F('700', 11); g.fillText('[' + e[0] + ']', ex, y + 66);
        g.fillStyle = e[2] > 0 ? C.text : C.dim; g.font = F('600', 12); g.fillText(e[1] + ' ×' + e[2], ex + 22, y + 66);
      });
      const extra = [];
      if (p.grenades.length > 1) extra.push('[C] ' + p.grenades.map((q) => t('g.' + q.type) + ' ' + q.count).join(' / '));
      if (p.lockpick) extra.push(t('n.lockpick'));
      if (p.wedges > 0) extra.push('[V] ' + t('n.wedge3').replace(/x\d/, '×' + p.wedges));
      if (p.hasDrone) extra.push('[T] ' + t('n.drone') + (p.drone ? ' ' + Math.round(p.drone.battery) + '%' : p.droneUsed ? ' ✕' : ''));
      g.font = F('600', 11); g.fillStyle = C.dim;
      g.fillText(extra.join('   ·   '), x + 14, y + 88);

      // --- weapon (bottom-right)
      const w = p.weapon;
      x = W - 286; y = H - 96;
      this.panel(g, x, y, 270, 80);
      g.font = F('600', 12); g.fillStyle = C.dim; g.fillText(w.def.name.toUpperCase() + (w.mods.suppressor ? ' · SUPP' : '') + (w.mods.optic ? ' · RDS' : '') + (w.mods.laser ? ' · LAS' : ''), x + 14, y + 20);
      g.font = F('700', 34); g.fillStyle = w.ammo === 0 ? C.red : C.text;
      g.fillText(String(w.ammo), x + 14, y + 58);
      const aw = g.measureText(String(w.ammo)).width;
      g.font = F('600', 16); g.fillStyle = C.dim; g.fillText(' / ' + w.magSize + '   ' + (w.def.taser ? 'x' + (w.reserve) : '+' + w.reserve), x + 14 + aw, y + 58);
      g.textAlign = 'right';
      if (w.reloading) { g.fillStyle = C.amber; g.font = F('700', 12); g.fillText(t('hud.reloading'), x + 258, y + 20); }
      else if (w.ammo <= w.magSize * 0.25) { g.fillStyle = (Math.floor(game.time * 3) % 2) ? C.amber : C.dim; g.font = F('700', 12); g.fillText(t('hud.reload'), x + 258, y + 20); }
      g.textAlign = 'left';
      p.slots.forEach((s, i) => {
        const sx = x + 14 + i * 84;
        g.fillStyle = i === p.slot ? C.amber : 'rgba(255,255,255,0.12)';
        g.fillRect(sx, y + 64, 78, 2);
        g.font = F('600', 10); g.fillStyle = i === p.slot ? C.text : C.dim;
        g.fillText((i + 1) + ' ' + s.def.name.toUpperCase().slice(0, 13), sx, y + 76);
      });

      // --- interaction prompts (bottom-centre)
      const ctx = p.ctx;
      if (p.alive && ctx && ctx.prompts.length && !game.wheelOpen && !p.droneCtl) {
        const px = W / 2, py = H - 128;
        g.font = F('600', 13);
        const parts = ctx.prompts.map((pr) => ({ ...pr, w: g.measureText(pr.label).width + 40 }));
        const total = parts.reduce((s, pp) => s + pp.w + 10, -10);
        let cx = px - total / 2;
        parts.forEach((pp) => {
          g.fillStyle = 'rgba(12,15,19,0.8)'; g.fillRect(cx, py - 18, pp.w, 26);
          g.fillStyle = C.amber; g.fillRect(cx, py - 18, 24, 26);
          g.fillStyle = '#111'; g.font = F('700', 13); g.textAlign = 'center'; g.fillText(pp.key, cx + 12, py);
          g.fillStyle = C.text; g.font = F('600', 13); g.textAlign = 'left'; g.fillText(pp.label, cx + 32, py);
          cx += pp.w + 10;
        });
      }
      if (p.action && p.action.dur < 90) {
        const k = p.action.t / p.action.dur;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - 100, H - 170, 200, 8);
        g.fillStyle = C.amber; g.fillRect(W / 2 - 100, H - 170, 200 * k, 8);
      }
      if (game.hintText) {
        g.globalAlpha = Math.min(1, game.hintText.t * 2);
        g.font = F('600', 15); g.textAlign = 'center';
        const tw = g.measureText(game.hintText.text).width + 30;
        g.fillStyle = 'rgba(12,15,19,0.85)'; g.fillRect(W / 2 - tw / 2, H * 0.3 - 20, tw, 32);
        g.fillStyle = C.text; g.fillText(game.hintText.text, W / 2, H * 0.3 + 2);
        g.textAlign = 'left'; g.globalAlpha = 1;
      }
      this.syncTip(game);

      if (game.wheelOpen) this.drawWheel(g, game);
      else if (p.alive && !p.droneCtl) this.drawCrosshair(g, game);

      // damage direction arcs
      for (const d of game.dmgDirs) {
        const k = d.t / 1.2;
        g.strokeStyle = 'rgba(217,60,50,' + (0.8 * k) + ')'; g.lineWidth = 6;
        g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) * 0.28, d.a - 0.28, d.a + 0.28); g.stroke();
      }
      // drone feed overlay
      if (p.droneCtl && p.drone) {
        g.strokeStyle = 'rgba(111,179,222,0.6)'; g.lineWidth = 2;
        const m = 40, L = 40;
        [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([cx, cy, sx, sy]) => { g.beginPath(); g.moveTo(cx, cy + sy * L); g.lineTo(cx, cy); g.lineTo(cx + sx * L, cy); g.stroke(); });
        g.fillStyle = 'rgba(111,179,222,0.04)'; for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
        g.font = F('700', 14); g.fillStyle = C.blue; g.textAlign = 'center';
        g.fillText('● ' + t('hud.drone') + ' · ' + t('hud.battery') + ' ' + Math.max(0, Math.round(p.drone.battery)) + '%', W / 2, 70);
        g.font = F('600', 11); g.fillStyle = C.dim; g.fillText('[T] ↩', W / 2, 88);
        g.textAlign = 'left';
      }

      // screen effects
      if (p.gassedT > 0) { g.fillStyle = 'rgba(190,170,70,' + Math.min(0.28, p.gassedT * 0.15) + ')'; g.fillRect(0, 0, W, H); }
      if (game.hurtFlash > 0 || p.hp < 35) {
        const k = Math.max(game.hurtFlash, p.hp < 35 ? 0.35 + Math.sin(game.time * 5) * 0.1 : 0);
        const grd = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
        grd.addColorStop(0, 'rgba(160,0,0,0)'); grd.addColorStop(1, 'rgba(160,0,0,' + (0.55 * k) + ')');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
      }
      if (p.blindT > 0) {
        const k = U.clamp(p.blindT / Math.max(1, p.blindMax) * 1.3, 0, 1);
        g.fillStyle = 'rgba(255,255,250,' + k + ')'; g.fillRect(0, 0, W, H);
      }
      if (game.revealT > 0) { g.fillStyle = 'rgba(111,179,222,0.05)'; for (let yy = 0; yy < H; yy += 4) g.fillRect(0, yy, W, 1); }
      if (!p.alive) { g.fillStyle = 'rgba(40,0,0,0.45)'; g.fillRect(0, 0, W, H); }
    },

    syncTip(game) {
      const step = game.tutorial && game.tutorial.current;
      if (!this.tipEl) return;
      const html = step && !game.showMap ? '<span class="tiphead">' + t('tip.header') + '</span>' + step.text : '';
      if (this.tipEl._html !== html) { this.tipEl.innerHTML = html; this.tipEl._html = html; this.tipEl.style.display = html ? 'block' : 'none'; }
    },

    drawCrosshair(g, game) {
      const p = game.player, w = p.weapon;
      const mx = I.mouse.x, my = I.mouse.y;
      const spread = p.currentSpread();
      const ps = game.camera.toScreen(p.x, p.y);
      const dist = Math.hypot(mx - ps[0], my - ps[1]);
      const r = Math.max(5, Math.tan(spread * Math.PI / 180) * dist * 1.4);
      const col = p.sprinting ? 'rgba(200,200,200,0.35)' : (w.def.lessLethal ? 'rgba(232,176,74,0.95)' : 'rgba(235,240,240,0.9)');
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
      const tick = (a) => { const cx = Math.cos(a), cy = Math.sin(a); g.beginPath(); g.moveTo(mx + cx * r, my + cy * r); g.lineTo(mx + cx * (r + 7), my + cy * (r + 7)); g.stroke(); };
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(tick);
      g.strokeStyle = col; g.lineWidth = 1.5;
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(tick);
      g.fillStyle = col; g.fillRect(mx - 1, my - 1, 2, 2);
      // hit marker
      const hm = game.hitMarker;
      if (hm) {
        g.strokeStyle = hm.bad ? C.amber : hm.kill ? C.red : '#fff'; g.lineWidth = 2;
        const a = 5, b = 11;
        g.beginPath();
        g.moveTo(mx - b, my - b); g.lineTo(mx - a, my - a); g.moveTo(mx + b, my - b); g.lineTo(mx + a, my - a);
        g.moveTo(mx - b, my + b); g.lineTo(mx - a, my + a); g.moveTo(mx + b, my + b); g.lineTo(mx + a, my + a);
        g.stroke();
      }
      if (w.reloading) {
        const k = w.def.shellReload ? 1 - w.reloadT / w.def.reload : 1 - w.reloadT / (w.def.reload * (w.mods.extmag ? 1.2 : 1));
        g.strokeStyle = C.amber; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      }
      const cc = game.cursorContext();
      if (cc.door) {
        const s = game.camera.toScreen(cc.door.cx, cc.door.cy);
        g.strokeStyle = 'rgba(232,176,74,0.45)'; g.lineWidth = 1; g.setLineDash([3, 3]);
        g.strokeRect(s[0] - 14, s[1] - 14, 28, 28); g.setLineDash([]);
      }
    },

    drawWheel(g, game) {
      const w = game.wheel;
      const n = w.options.length;
      const R = 124;
      g.fillStyle = 'rgba(5,7,10,0.35)'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
      g.fillStyle = 'rgba(12,15,19,0.85)'; g.beginPath(); g.arc(w.cx, w.cy, R + 50, 0, 7); g.arc(w.cx, w.cy, 34, 0, 7, true); g.fill();
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i - 0.5) * (Math.PI * 2 / n), a1 = a0 + Math.PI * 2 / n;
        if (i === w.sel) {
          g.fillStyle = 'rgba(232,176,74,0.28)';
          g.beginPath(); g.arc(w.cx, w.cy, R + 50, a0, a1); g.arc(w.cx, w.cy, 34, a1, a0, true); g.fill();
        }
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(w.cx + Math.cos(a0) * 34, w.cy + Math.sin(a0) * 34); g.lineTo(w.cx + Math.cos(a0) * (R + 50), w.cy + Math.sin(a0) * (R + 50)); g.stroke();
        const am = -Math.PI / 2 + i * (Math.PI * 2 / n);
        g.font = F('700', 11); g.textAlign = 'center';
        g.fillStyle = i === w.sel ? C.amber : C.text;
        const words = w.options[i].label.split(' ');
        const lx = w.cx + Math.cos(am) * (R - 10), ly = w.cy + Math.sin(am) * (R - 10);
        if (words.length > 2) { const h = Math.ceil(words.length / 2); g.fillText(words.slice(0, h).join(' '), lx, ly - 2); g.fillText(words.slice(h).join(' '), lx, ly + 11); }
        else g.fillText(w.options[i].label, lx, ly + 4);
      }
      g.font = F('600', 11); g.fillStyle = C.dim; g.textAlign = 'center';
      g.fillText(w.ctx.door ? t('wh.door') : w.ctx.target ? t('wh.target') : t('wh.teamc'), w.cx, w.cy + 4);
      g.textAlign = 'left';
    },

    drawBubbles(g, game) {
      const draw = (c) => {
        if (!c.bubble || !c.alive) return;
        if (c.faction !== 'police' && !c.visibleToTeam && U.dist(c.x, c.y, game.player.x, game.player.y) > 9) return;
        const s = game.camera.toScreen(c.x, c.y - 0.75);
        const b = c.bubble;
        g.globalAlpha = Math.min(1, b.t * 3);
        g.font = F('600', 12);
        const tw = g.measureText(b.text).width + 14;
        const col = c.faction === 'police' ? 'rgba(20,34,52,0.9)' : c.faction === 'suspect' ? 'rgba(70,18,16,0.9)' : 'rgba(60,52,24,0.9)';
        g.fillStyle = col; g.fillRect(s[0] - tw / 2, s[1] - 18, tw, 20);
        g.fillStyle = '#f0f0f0'; g.textAlign = 'center'; g.fillText(b.text, s[0], s[1] - 4);
        g.textAlign = 'left'; g.globalAlpha = 1;
      };
      game.characters.forEach(draw);
      for (const n of game.npcs) {
        if (!n.alive || !n.visibleToTeam || n.bubble) continue;
        let tag = null, col = C.dim;
        if (n.restrained) { tag = t(n.kind === 'enemy' ? 'tag.arrested' : 'tag.secured'); col = C.green; }
        else if (n.stunT > 0) { tag = t(n.stunKind === 'gas' ? 'tag.gassed' : 'tag.stunned'); col = C.amber; }
        else if (n.kind === 'enemy' && n.surrendered) { tag = t('tag.compliant'); col = C.amber; }
        else if (n.kind === 'civ' && n.state === 'COMPLIANT') { tag = t('tag.compliant'); col = C.amber; }
        else if (n.kind === 'civ' && n.state === 'HELD') { tag = t('tag.hostage'); col = C.red; }
        if (tag) {
          const s = game.camera.toScreen(n.x, n.y - 0.62);
          g.font = F('700', 9); g.textAlign = 'center';
          g.fillStyle = 'rgba(0,0,0,0.6)'; const tw = g.measureText(tag).width + 8; g.fillRect(s[0] - tw / 2, s[1] - 9, tw, 12);
          g.fillStyle = col; g.fillText(tag, s[0], s[1]);
          g.textAlign = 'left';
        }
      }
    }
  };
  TR.HUD = HUD;
})(window.TR);
