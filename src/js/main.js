// App bootstrap, state machine (menu <-> mission) and the main loop.
(function (TR) {
  const U = TR.U, I = TR.Input, S = TR.Save;
  const TS = TR.TS;

  const App = {
    state: 'menu', game: null, paused: false,
    init() {
      S.load();
      if (!S.data.settings.lang) S.data.settings.lang = TR.L.detect();
      TR.L.set(S.data.settings.lang);
      TR.Audio.settings = S.data.settings;
      // never lose mid-mission progress when the window is closed
      window.addEventListener('beforeunload', () => this.autosave());
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.autosave(); });
      TR.Voice.init();
      this.canvas = document.getElementById('game');
      this.g = this.canvas.getContext('2d');
      I.init(this.canvas);
      TR.UI.init(this);
      TR.HUD.init();
      window.addEventListener('resize', () => this.resize());
      this.resize();
      this.initMenuBg();
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && this.state === 'game' && this.game && !this.game.over) { e.preventDefault(); this.paused ? this.resume() : this.pause(); }
        if (e.code === 'F11') { e.preventDefault(); S.data.settings.fullscreen = !S.data.settings.fullscreen; S.save(); this.setFullscreen(S.data.settings.fullscreen); }
      });
      document.addEventListener('pointerdown', () => TR.Audio.ensure(), { once: true });
      if (S.data.settings.fullscreen) this.setFullscreen(true);
      TR.UI.show('main');
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    },
    setFullscreen(on) {
      if (window.desktop) window.desktop.setFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen();
    },
    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.W = window.innerWidth; this.H = window.innerHeight;
      this.canvas.width = Math.floor(this.W * this.dpr); this.canvas.height = Math.floor(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
    },

    // -------------------------------------------------- flow
    autosave() {
      const g = this.game;
      if (this.state !== 'game' || !g || g.over || !g.player.alive) return;
      try { S.saveResume(g.serialize()); } catch (e) { console.error(e); }
    },
    resumeMission() {
      const snap = S.resume;
      if (!snap) return;
      this.startMission(snap.mission, snap);
    },
    startMission(id, snapshot) {
      const m = TR.Missions.find((q) => q.id === id);
      if (!m || !m.playable) return;
      TR.Audio.ensure();
      TR.Voice.stop();
      this.paused = false;
      this.state = 'deploy';
      TR.UI.show('deploy', { m, resume: !!snapshot });
      if (!snapshot) S.clearResume();
      setTimeout(() => {
        const lo = snapshot ? snapshot.loadout : JSON.parse(JSON.stringify(S.data.loadout));
        // never deploy with something we don't own
        if (!S.owns(lo.primary)) lo.primary = 'ar15';
        if (!S.owns(lo.secondary)) lo.secondary = 'px9';
        try {
          this.game = new TR.Game(m, lo, { onEnd: (r) => this.onEnd(r), onAutosave: () => this.autosave(), snapshot });
        } catch (e) {
          // a broken snapshot must never block the player: start the mission fresh
          console.error(e); S.clearResume();
          this.game = new TR.Game(m, lo, { onEnd: (r) => this.onEnd(r), onAutosave: () => this.autosave() });
        }
        TR.UI.hide();
        this.state = 'game';
        I.enabled = true;
        document.body.classList.add('ingame');
        TR.Audio.startAmbience();
        TR.Audio.play('squelch');
      }, 1500);
    },
    hideTip() { const t = document.getElementById('tip'); if (t) { t.style.display = 'none'; t._html = ''; } },
    pause() { if (!this.game) return; this.paused = true; this.game.paused = true; document.body.classList.remove('ingame'); this.hideTip(); this.autosave(); TR.UI.show('pause'); TR.Voice.stop(); },
    resume() { if (!this.game) return; this.paused = false; this.game.paused = false; TR.UI.hide(); document.body.classList.add('ingame'); I.down = {}; },
    abort() { this.paused = false; this.game.paused = false; this.game.end(false, TR.t('reason.abort')); },
    saveAndQuit() { this.autosave(); this.toMenu('main'); },
    onEnd(r) {
      S.clearResume();
      const d = S.data;
      d.xp += r.xp;
      if (r.success) {
        d.credits += r.credits;
        const prev = d.completed[r.mission.id];
        if (!prev || prev.score < r.score) d.completed[r.mission.id] = { score: r.score, grade: r.grade, time: Math.round(r.time) };
        d.stats.missions++;
      }
      d.stats.arrests += r.table.arrested;
      d.stats.rescued += parseInt(r.table.civilians, 10) || 0;
      S.save();
      document.body.classList.remove('ingame');
      I.enabled = false;
      this.hideTip();
      setTimeout(() => {
        this.state = 'result';
        TR.Audio.stopAmbience();
        TR.Audio.play(r.success ? 'objective' : 'alarm');
        TR.UI.selMission = r.success ? Math.min(r.mission.id + 1, TR.Missions.filter((m) => m.playable).length) : r.mission.id;
        TR.UI.show('result', r);
      }, 1400);
    },
    toMenu(screen) {
      TR.Voice.stop();
      this.game = null; TR.game = null; this.state = 'menu'; this.paused = false;
      this.hideTip();
      document.body.classList.remove('ingame');
      TR.Audio.stopAmbience();
      TR.UI.show(screen || 'main');
    },

    // -------------------------------------------------- menu background: slow pan over the apartment with a sweeping vision cone
    initMenuBg() {
      const m = TR.Missions[0];
      this.bgMap = new TR.GameMap(m.build());
      this.bgMap.render();
      this.bgCam = new TR.Camera();
      this.bgT = 0;
      this.bgFog = document.createElement('canvas');
      this.bgPath = [[43, 20], [42, 14], [30, 13.5], [20, 13.5], [10, 13.5], [10, 9], [5, 9.5], [14, 5], [10, 13.5], [8, 18], [10, 13.5], [30, 13.5], [30, 9], [26, 4], [30, 13.5], [42, 14]];
    },
    renderMenuBg(dt) {
      const g = this.g, W = this.W, H = this.H, dpr = this.dpr;
      if (!this.canvas.width || !this.canvas.height) return;
      this.bgT += dt * 0.35;
      const P = this.bgPath;
      const i = Math.floor(this.bgT) % (P.length - 1), f = this.bgT - Math.floor(this.bgT);
      const a = P[i], b = P[i + 1];
      const e = f * f * (3 - 2 * f);
      const x = U.lerp(a[0], b[0], e), y = U.lerp(a[1], b[1], e);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.sin(this.bgT * 2) * 0.4;
      const cam = this.bgCam;
      cam.resize(W, H, dpr); cam.level = 1.05;
      cam.x += (x + 6 - cam.x) * Math.min(1, dt * 1.5); cam.y += (y - cam.y) * Math.min(1, dt * 1.5);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#07090b'; g.fillRect(0, 0, W, H);
      cam.apply(g);
      g.drawImage(this.bgMap.floorCanvas, 0, 0);
      const poly = TR.Vision.polygon(this.bgMap, { kind: 'player', x, y, angle: ang });
      const fc = this.bgFog;
      if (fc.width !== this.canvas.width || fc.height !== this.canvas.height) { fc.width = this.canvas.width; fc.height = this.canvas.height; }
      const fg = fc.getContext('2d');
      fg.setTransform(1, 0, 0, 1, 0, 0); fg.globalCompositeOperation = 'source-over';
      fg.clearRect(0, 0, fc.width, fc.height); fg.fillStyle = 'rgba(3,5,8,0.86)'; fg.fillRect(0, 0, fc.width, fc.height);
      fg.globalCompositeOperation = 'destination-out'; cam.apply(fg);
      const gr = fg.createRadialGradient(x * TS, y * TS, 0, x * TS, y * TS, 20 * TS);
      gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      fg.fillStyle = gr; fg.beginPath(); fg.moveTo(poly.pts[0] * TS, poly.pts[1] * TS);
      for (let k = 2; k < poly.pts.length; k += 2) fg.lineTo(poly.pts[k] * TS, poly.pts[k + 1] * TS);
      fg.fill();
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(fc, 0, 0);
      cam.apply(g); g.drawImage(this.bgMap.wallCanvas, 0, 0);
      this.bgMap.doors.forEach((d) => d.draw(g, false));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      // left-side darkening for menu readability
      const lg = g.createLinearGradient(0, 0, W * 0.6, 0);
      lg.addColorStop(0, 'rgba(7,9,11,0.95)'); lg.addColorStop(1, 'rgba(7,9,11,0.2)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
    },

    loop(t) {
      const dt = Math.min(0.033, Math.max(0.0001, (t - this.last) / 1000));
      this.last = t;
      try {
        if (!this.canvas.width || !this.canvas.height) { /* minimized */ } else if (this.state === 'game' && this.game) {
          if (!this.paused) this.game.update(dt);
          this.game.render(this.g, this.W, this.H, this.dpr);
          this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          TR.HUD.draw(this.g, this.game, this.W, this.H);
        } else {
          this.renderMenuBg(dt);
        }
      } catch (err) {
        console.error(err);
        if (!this._errShown) { this._errShown = true; TR.UI.flash && TR.UI.flash('Error: ' + err.message); }
      }
      I.endFrame();
      requestAnimationFrame((tt) => this.loop(tt));
    }
  };
  TR.App = App;
  window.addEventListener('load', () => App.init());
})(window.TR);
