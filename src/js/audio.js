// Procedural audio: every sound is synthesized with WebAudio, no asset files required.
(function (TR) {
  const U = TR.U;
  const A = {
    ctx: null, master: null, sfx: null, amb: null,
    listener: { x: 0, y: 0 },
    noiseBuf: null, brownBuf: null,
    settings: { master: 0.8, sfx: 0.9, voice: 0.9, ambience: 0.5 },
    ambNodes: null,
    lastPlay: {},

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
      try {
        const C = window.AudioContext || window.webkitAudioContext;
        this.ctx = new C();
      } catch (e) { return false; }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5;
      comp.attack.value = 0.002; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.amb = ctx.createGain(); this.amb.connect(this.master);
      // noise buffers
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const b = this.brownBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
      this.applySettings();
      return true;
    },

    applySettings() {
      if (!this.ctx) return;
      this.master.gain.value = this.settings.master;
      this.sfx.gain.value = this.settings.sfx;
      this.amb.gain.value = this.settings.ambience * 0.6;
    },

    // spatial gain/pan node chain
    spatial(x, y, vol, range) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      let gain = vol == null ? 1 : vol;
      let pan = 0;
      if (x != null) {
        const d = U.dist(x, y, this.listener.x, this.listener.y);
        const r = range || 14;
        gain *= 1 / (1 + Math.pow(d / r, 2) * 2.2);
        pan = U.clamp((x - this.listener.x) / 14, -0.85, 0.85);
      }
      g.gain.value = gain;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        g.connect(p); p.connect(this.sfx);
      } else g.connect(this.sfx);
      return { node: g, gain };
    },

    noise(dest, t0, dur, type, freq, q, vol, attack, buf) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf || this.noiseBuf;
      src.playbackRate.value = U.rand(0.9, 1.1);
      const f = ctx.createBiquadFilter();
      f.type = type || 'lowpass'; f.frequency.value = freq || 3000; f.Q.value = q || 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.002));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
      return f;
    },

    tone(dest, t0, dur, type, f0, f1, vol, attack) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.003));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return o;
    },

    // Throttle identical sounds (e.g. many footsteps)
    throttle(key, minGap) {
      const now = performance.now();
      if (this.lastPlay[key] && now - this.lastPlay[key] < minGap) return false;
      this.lastPlay[key] = now; return true;
    },

    play(name, x, y, opts) {
      if (!this.ctx || !this.sfx) return;
      opts = opts || {};
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.005;
      const fn = this.sounds[name];
      if (!fn) return;
      const sp = this.spatial(x, y, opts.vol == null ? 1 : opts.vol, opts.range);
      if (sp.gain < 0.004) return;
      fn.call(this, sp.node, t, opts);
    },

    sounds: {
      gun(d, t, o) {
        const heavy = o.heavy || 1; // 0.7 pistol .. 1.4 rifle
        if (o.suppressed) {
          this.noise(d, t, 0.09, 'bandpass', 1800, 1.2, 0.35);
          this.noise(d, t, 0.05, 'highpass', 4000, 0.7, 0.2);
          this.tone(d, t, 0.06, 'triangle', 240, 90, 0.15);
          this.noise(d, t + 0.05, 0.05, 'highpass', 5000, 1, 0.05); // action
          return;
        }
        this.noise(d, t, 0.32 * heavy, 'lowpass', 5200 / heavy, 0.8, 0.95);
        this.noise(d, t, 0.06, 'highpass', 2500, 0.8, 0.6);
        this.tone(d, t, 0.18 * heavy, 'sine', 150 / heavy, 45, 0.9);
        // tail / room reflection
        this.noise(d, t + 0.03, 0.45 * heavy, 'lowpass', 900, 0.5, 0.18, 0.02, this.brownBuf);
      },
      shotgun(d, t) {
        this.noise(d, t, 0.5, 'lowpass', 3000, 0.7, 1.0);
        this.tone(d, t, 0.25, 'sine', 110, 35, 1.0);
        this.noise(d, t + 0.02, 0.6, 'lowpass', 700, 0.5, 0.3, 0.02, this.brownBuf);
      },
      dry(d, t) { this.noise(d, t, 0.03, 'highpass', 4000, 2, 0.25); },
      reload(d, t) {
        this.noise(d, t, 0.05, 'bandpass', 2500, 3, 0.25);
        this.noise(d, t + 0.35, 0.04, 'bandpass', 1800, 3, 0.2);
        this.noise(d, t + 0.9, 0.06, 'bandpass', 3000, 4, 0.35);
        this.noise(d, t + 1.05, 0.04, 'bandpass', 2200, 4, 0.3);
      },
      pump(d, t) {
        this.noise(d, t, 0.07, 'bandpass', 1500, 3, 0.35);
        this.noise(d, t + 0.14, 0.07, 'bandpass', 2200, 3, 0.35);
      },
      shell(d, t) { this.tone(d, t, 0.05, 'triangle', U.rand(3500, 4800), 3000, 0.05); },
      taser(d, t) {
        const o = this.tone(d, t, 0.9, 'square', 55, 50, 0.12);
        this.noise(d, t, 0.9, 'bandpass', 3200, 2, 0.25);
        this.tone(d, t, 0.9, 'sawtooth', 1200, 900, 0.03);
      },
      doorOpen(d, t) {
        this.tone(d, t, 0.5, 'sawtooth', U.rand(160, 220), U.rand(260, 340), 0.03, 0.08);
        this.noise(d, t, 0.12, 'bandpass', 900, 2, 0.12);
      },
      doorClose(d, t) {
        this.noise(d, t, 0.12, 'lowpass', 600, 1, 0.5);
        this.tone(d, t, 0.1, 'sine', 90, 60, 0.4);
      },
      kick(d, t) {
        this.noise(d, t, 0.25, 'lowpass', 900, 1, 1.0);
        this.tone(d, t, 0.2, 'sine', 80, 40, 1.0);
        this.noise(d, t + 0.01, 0.18, 'bandpass', 2400, 1.5, 0.4);
      },
      kickFail(d, t) {
        this.noise(d, t, 0.2, 'lowpass', 600, 1, 0.8);
        this.tone(d, t, 0.18, 'sine', 70, 40, 0.8);
      },
      explosion(d, t) {
        this.noise(d, t, 1.4, 'lowpass', 1800, 0.6, 1.0);
        this.tone(d, t, 0.8, 'sine', 70, 25, 1.0);
        this.noise(d, t + 0.05, 2.2, 'lowpass', 400, 0.5, 0.5, 0.05, this.brownBuf);
      },
      flashbang(d, t) {
        this.noise(d, t, 0.9, 'lowpass', 6000, 0.5, 1.0);
        this.tone(d, t, 0.4, 'sine', 90, 30, 1.0);
        this.noise(d, t + 0.02, 1.4, 'lowpass', 500, 0.5, 0.45, 0.03, this.brownBuf);
      },
      tinnitus(d, t, o) {
        const dur = o.dur || 3;
        const ctx = this.ctx;
        const osc = ctx.createOscillator(); osc.frequency.value = 3700;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g); g.connect(this.sfx);
        osc.start(t); osc.stop(t + dur + 0.1);
      },
      bounce(d, t) { this.tone(d, t, 0.06, 'triangle', U.rand(700, 900), 400, 0.25); },
      pin(d, t) { this.noise(d, t, 0.05, 'highpass', 5000, 2, 0.2); this.tone(d, t + 0.05, 0.08, 'triangle', 2600, 2000, 0.08); },
      step(d, t, o) {
        this.noise(d, t, 0.07, 'lowpass', o.hard ? 900 : 500, 1, o.loud ? 0.35 : 0.14);
      },
      hit(d, t) { this.noise(d, t, 0.08, 'lowpass', 700, 1, 0.5); this.tone(d, t, 0.07, 'sine', 120, 60, 0.4); },
      ricochet(d, t) {
        this.tone(d, t, 0.18, 'sine', U.rand(2500, 4200), U.rand(900, 1500), 0.06);
        this.noise(d, t, 0.04, 'highpass', 3000, 1, 0.25);
      },
      cuff(d, t) {
        for (let i = 0; i < 5; i++) this.noise(d, t + i * 0.05, 0.03, 'bandpass', 3500, 5, 0.18);
      },
      pickup(d, t) { this.tone(d, t, 0.08, 'triangle', 900, 1300, 0.08); this.tone(d, t + 0.07, 0.1, 'triangle', 1300, 1600, 0.06); },
      squelch(d, t) {
        this.noise(d, t, 0.12, 'bandpass', 1800, 1.5, 0.12);
        this.tone(d, t, 0.06, 'square', 1450, 1400, 0.02);
      },
      ui(d, t) { this.tone(d, t, 0.05, 'triangle', 1100, 900, 0.05); },
      uiHover(d, t) { this.tone(d, t, 0.03, 'triangle', 1600, 1500, 0.015); },
      uiConfirm(d, t) { this.tone(d, t, 0.08, 'triangle', 700, 700, 0.06); this.tone(d, t + 0.08, 0.14, 'triangle', 1050, 1050, 0.06); },
      objective(d, t) { this.tone(d, t, 0.15, 'sine', 660, 660, 0.08); this.tone(d, t + 0.12, 0.25, 'sine', 990, 990, 0.08); },
      alarm(d, t) { this.tone(d, t, 0.9, 'square', 880, 660, 0.04); },
      glass(d, t) { for (let i = 0; i < 6; i++) this.tone(d, t + i * 0.03, 0.2, 'triangle', U.rand(3000, 6000), 2000, 0.05); this.noise(d, t, 0.3, 'highpass', 4000, 1, 0.3); },
      heartbeat(d, t) { this.tone(d, t, 0.12, 'sine', 55, 40, 0.3); this.tone(d, t + 0.22, 0.12, 'sine', 50, 38, 0.22); },
      medkit(d, t) { this.noise(d, t, 0.4, 'bandpass', 2000, 1, 0.1); },
      charge(d, t) { for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.18, 0.06, 'square', 2100, 2100, 0.03); }
    },

    startAmbience() {
      if (!this.ctx || this.ambNodes) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource(); src.buffer = this.brownBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      const g = ctx.createGain(); g.gain.value = 0.22;
      src.connect(f); f.connect(g); g.connect(this.amb);
      src.start();
      // low room hum
      const hum = ctx.createOscillator(); hum.frequency.value = 58; hum.type = 'sine';
      const hg = ctx.createGain(); hg.gain.value = 0.015;
      hum.connect(hg); hg.connect(this.amb); hum.start();
      this.ambNodes = [src, hum];
      this.sirenTimer = setInterval(() => { if (Math.random() < 0.35) this.siren(); }, 16000);
    },
    stopAmbience() {
      if (!this.ambNodes) return;
      this.ambNodes.forEach((n) => { try { n.stop(); } catch (e) { /* ignore */ } });
      this.ambNodes = null;
      clearInterval(this.sirenTimer);
    },
    siren() {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
      const dur = 7;
      for (let i = 0; i < 7; i++) {
        o.frequency.setValueAtTime(620, t + i);
        o.frequency.linearRampToValueAtTime(900, t + i + 0.5);
        o.frequency.linearRampToValueAtTime(620, t + i + 1);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.amb);
      o.start(t); o.stop(t + dur);
    }
  };

  // ---------- Voice (Web Speech API, text bubbles are always shown regardless) ----------
  const Voice = {
    voices: [], busyUntil: 0, enabled: true,
    init() {
      if (!('speechSynthesis' in window)) { this.enabled = false; return; }
      const load = () => { this.all = speechSynthesis.getVoices(); this.refresh(); };
      this.all = [];
      load();
      speechSynthesis.onvoiceschanged = load;
    },
    // keep only voices that speak the current UI language
    refresh() {
      const lang = (TR.L && TR.L.lang) || 'en';
      this.voices = (this.all || []).filter((v) => (v.lang || '').toLowerCase().startsWith(lang));
      this.lang = lang;
    },
    pickVoice(kind) {
      if (this.lang !== TR.L.lang) this.refresh();
      if (!this.voices.length) return null;
      const male = this.voices.filter((v) => /david|mark|guy|george|male|james|ryan|christopher|eric|roger|steffan|tolga|ahmet|stefan|conrad|killian|pablo|alvaro|raul|jorge/i.test(v.name));
      const female = this.voices.filter((v) => /zira|susan|hazel|female|aria|jenny|libby|michelle|sonia|emel|filiz|hedda|katja|amala|helena|laura|elvira|sabina/i.test(v.name));
      if (kind === 'female' && female.length) return female[0];
      if (male.length) return kind === 'suspect' && male.length > 1 ? male[1] : male[0];
      if (kind !== 'female' && female.length === this.voices.length && this.voices.length) return this.voices[0];
      return this.voices[0];
    },
    // priority: 2 = player/urgent, 1 = radio, 0 = chatter
    say(text, opts) {
      opts = opts || {};
      // only speak with an English voice; the on-screen text bubbles always show anyway
      if (this.enabled && this.lang !== TR.L.lang) this.refresh();
      if (!this.enabled || A.settings.voice <= 0.01 || !this.voices.length) return;
      const now = performance.now();
      const pr = opts.priority || 0;
      if (now < this.busyUntil && pr < 2) return;
      try {
        if (pr >= 2) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pickVoice(opts.voice);
        if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = opts.rate || 1.25;
        u.pitch = opts.pitch || 1;
        u.volume = U.clamp(A.settings.voice * (opts.vol == null ? 1 : opts.vol), 0, 1);
        speechSynthesis.speak(u);
        this.busyUntil = now + 250 + text.length * 55;
      } catch (e) { /* ignore */ }
    },
    stop() { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  };

  TR.Audio = A;
  TR.Voice = Voice;
})(window.TR);
