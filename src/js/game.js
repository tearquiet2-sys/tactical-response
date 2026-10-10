// Game session: world simulation, objectives, ROE scoring and world rendering.
(function (TR) {
  const U = TR.U, D = TR.D, I = TR.Input;
  const TS = TR.TS;

  const EVIDENCE_LABELS = { phone: 'Burner Phone', drugs: 'Narcotics', documents: 'Documents', cash: 'Marked Cash', laptop: 'Laptop', drive: 'Encrypted Drive', weapon: 'Weapon', footage: 'Security Recordings' };

  class Game {
    constructor(mission, loadout, hooks) {
      TR.game = this;
      this.mission = mission; this.loadout = loadout; this.hooks = hooks || {};
      this.map = new TR.GameMap(mission.build());
      this.map.ambient = mission.ambient;
      this.map.render();
      this.clouds = []; this.feed = []; this.dmgDirs = []; this.hitMarker = null; this.rain = []; this.autosaveT = 8;
      this.fx = new TR.FX(this);
      this.camera = new TR.Camera();
      this.time = 0; this.paused = false; this.over = false; this.timeScale = 1;
      this.characters = []; this.npcs = []; this.enemies = []; this.civilians = []; this.police = []; this.officers = [];
      this.items = []; this.grenades = []; this.charges = [];
      this.radioLog = []; this.radioCd = 0;
      this.hints = []; this.hintText = null;
      this.shakeAmt = 0;
      this.hurtFlash = 0;
      this.revealT = 0;
      this.hostageTension = 0;
      this.wheelOpen = false; this.wheel = null;
      this.clearedRooms = new Set();
      this.enteredRooms = new Set();
      this.roomLabel = null;
      this.extractReady = false;
      this.stats = {
        shots: 0, hits: 0, kills: 0, arrests: 0, civSecured: 0, civDead: 0, civKilledByPolice: 0, civInjuredByPolice: 0,
        unauthorized: 0, unnecessary: 0, hostageDead: 0, evidence: 0, officersDown: 0, damageTaken: 0, yells: 0, commands: 0,
        neutralized: 0, suspectsKilledByTeam: 0
      };
      this.penaltyLog = [];
      this.spawnAll();
      this.setupObjectives();
      if (this.hooks.snapshot) this.restore(this.hooks.snapshot);
      this.tutorial = mission.tutorial && TR.Save.data.settings.hints && !this.hooks.snapshot ? new TR.Tutorial(this) : null;
      this.camera.x = this.player.x; this.camera.y = this.player.y;
      this.vision = [];
      this.fogCanvas = document.createElement('canvas');
      this.fog = this.fogCanvas.getContext('2d');
      this.radio(null, this.hooks.snapshot ? TR.t('radio.resume') : TR.t('radio.go', mission.name), true);
    }

    // ------------------------------------------------------------ spawning
    spawnAll() {
      const sp = this.map.spawns;
      const m = this.mission;
      const ps = sp.player[0];
      this.player = new TR.Player(this, ps.x, ps.y, this.loadout);
      this.addChar(this.player);
      this.police.push(this.player);
      D.operators.forEach((op, i) => {
        const p = sp.player[i + 1] || ps;
        const o = new TR.Officer(this, p.x, p.y, op, i);
        this.officers.push(o); this.police.push(o); this.addChar(o);
      });
      this.squad = new TR.Squad(this, this.officers);

      // enemies
      const ecount = U.randInt(m.enemies.min, m.enemies.max);
      const cands = U.shuffle(sp.enemy.slice());
      const weights = m.enemies.types;
      const pickType = () => {
        let tot = 0; for (const k in weights) tot += weights[k];
        let r = Math.random() * tot;
        for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
        return 'nervous';
      };
      let leaders = 0;
      for (let i = 0; i < ecount && i < cands.length; i++) {
        let type = pickType();
        if (type === 'leader') { if (leaders) type = 'tactical'; leaders++; }
        const e = new TR.Suspect(this, cands[i].x, cands[i].y, type);
        this.addNpc(e);
      }
      // hostage + taker (mission 03)
      if (sp.hostage.length && sp.taker.length) {
        const h = new TR.Civilian(this, sp.hostage[0].x, sp.hostage[0].y, { held: true, vip: true, name: 'Laura Kim' });
        h.female = true; h.clothes = '#6e4b5e'; h.hair = '#2a1d15';
        this.addNpc(h);
        const t = new TR.Suspect(this, sp.taker[0].x, sp.taker[0].y, 'hostageTaker');
        t.hostage = h; h.heldBy = t;
        t.angle = U.angleTo(t.x, t.y, h.x, h.y);
        this.addNpc(t);
        this.vip = h;
      }
      // civilians
      const ccount = U.randInt(m.civilians.min, m.civilians.max);
      const cc = U.shuffle(sp.civ.slice());
      for (let i = 0; i < ccount && i < cc.length; i++) {
        const held = m.civilians.held && Math.random() < m.civilians.held;
        const c = new TR.Civilian(this, cc[i].x, cc[i].y);
        if (held) { c.state = 'COMPLIANT'; c.surrendered = true; c.tied = true; }
        this.addNpc(c);
      }
      // evidence
      const ev = U.shuffle(sp.evidence.slice());
      for (let i = 0; i < (m.evidence || 0) && i < ev.length; i++) this.addItem(ev[i].x, ev[i].y, ev[i].kind);
      if (m.terminal && sp.terminal.length) this.terminal = { x: sp.terminal[0].x, y: sp.terminal[0].y, used: false };
      this.extractZone = sp.extract[0];
    }
    addChar(c) { this.characters.push(c); }
    addNpc(c) { this.characters.push(c); this.npcs.push(c); if (c.kind === 'enemy') this.enemies.push(c); else this.civilians.push(c); }
    addItem(x, y, kind, label) {
      const it = { x, y, kind, label: label || TR.t('ev.' + kind), collected: false, discovered: false, rot: Math.random() * 6.28 };
      this.items.push(it); return it;
    }
    dropWeapon(s) {
      if (!s.weapon) return;
      const a = s.angle + U.rand(-0.6, 0.6);
      let x = s.x + Math.cos(a) * 0.45, y = s.y + Math.sin(a) * 0.45;
      if (this.map.isMoveBlocked(Math.floor(x), Math.floor(y))) { x = s.x; y = s.y; }
      const it = this.addItem(x, y, 'weapon', s.weapon.def.name);
      it.discovered = s.visibleToTeam;
      it.fromSuspect = true;
    }

    // ------------------------------------------------------------ objectives
    setupObjectives() {
      this.objectives = [
        { id: 'suspects', text: TR.t('obj.suspects'), mandatory: true },
        { id: 'civilians', text: TR.t('obj.civilians'), mandatory: true },
        { id: 'evidence', text: TR.t('obj.evidence'), mandatory: false }
      ];
      if (this.vip) this.objectives.unshift({ id: 'vip', text: TR.t('obj.vip'), mandatory: true });
      if (this.terminal) this.objectives.push({ id: 'footage', text: TR.t('obj.footage'), mandatory: false });
      this.objectives.push({ id: 'extract', text: TR.t('obj.extract'), mandatory: true, hidden: true });
    }
    objectiveState(o) {
      const en = this.enemies, cv = this.civilians;
      switch (o.id) {
        case 'suspects': { const done = en.filter((e) => !e.alive || e.restrained).length; return { done: done === en.length, count: done + '/' + en.length }; }
        case 'civilians': { const done = cv.filter((c) => c.restrained).length; const dead = cv.filter((c) => !c.alive).length; return { done: done + dead === cv.length, count: done + '/' + cv.length, failed: dead > 0 && done + dead === cv.length && done === 0 }; }
        case 'evidence': { const tot = this.items.filter((i) => i.kind !== 'footage').length; const got = this.items.filter((i) => i.collected && i.kind !== 'footage').length; return { done: got === tot && tot > 0, count: got + '/' + tot }; }
        case 'vip': return { done: this.vip.restrained, failed: !this.vip.alive, count: '' };
        case 'footage': return { done: !!(this.terminal && this.terminal.used), count: '' };
        case 'extract': return { done: false, count: '' };
      }
      return { done: false };
    }
    mandatoryDone() {
      return this.objectives.filter((o) => o.mandatory && o.id !== 'extract').every((o) => this.objectiveState(o).done);
    }

    // ------------------------------------------------------------ events
    noise(x, y, radius, type, src) {
      for (const n of this.npcs) {
        if (!n.alive || n === src) continue;
        const d = U.dist(x, y, n.x, n.y);
        if (d > radius) continue;
        if (type !== 'bang' && type !== 'explosion' && d > radius * 0.55 && !this.map.los(x, y, n.x, n.y)) continue;
        n.hear({ x, y, radius, type, src });
      }
    }
    yell(src) {
      TR.Audio.play('squelch', src.x, src.y, { vol: 0.001 });
      for (const n of this.npcs) {
        if (!n.alive || n.restrained) continue;
        const d = U.dist(src.x, src.y, n.x, n.y);
        if (d > 10) continue;
        if (d > 4 && !this.map.los(src.x, src.y, n.x, n.y)) continue;
        n.onYell(src);
      }
      this.noise(src.x, src.y, 10, 'yell', src);
    }
    radio(speaker, text, system) {
      const name = speaker ? speaker.op.call : 'TOC';
      this.radioLog.push({ name, text, t: 6, color: speaker ? speaker.op.color : '#c9a86a' });
      if (this.radioLog.length > 6) this.radioLog.shift();
      TR.Audio.play('squelch');
      this.radioCd = 1.2;
      if (speaker) speaker.say(text, 1.8);
      TR.Voice.say(text, { voice: 'police', pitch: speaker ? 0.9 + speaker.idx * 0.08 : 0.7, rate: 1.3, priority: 1, vol: 0.7 });
    }
    hint(text, dur) { this.hintText = { text, t: dur || 2.6 }; }

    feedPush(text, col) { this.feed.push({ text, col: col || '#d9dcdf', t: 6 }); if (this.feed.length > 5) this.feed.shift(); }
    nameOf(c) { return c.kind === 'player' ? 'Alpha-1' : c.kind === 'team' ? c.op.call : c.kind === 'enemy' ? TR.t('feed.suspect') : ''; }
    onHit(target, src, dmg, info) {
      if (!src) return;
      if (src.faction === 'police') {
        if (src === this.player) { this.stats.hits++; this.hitMarker = { t: 0.18, kill: !target.alive, bad: target.faction !== 'suspect' }; }
        if (target.faction === 'civilian' && target.alive && !target.policeHit) {
          target.policeHit = true; this.stats.civInjuredByPolice++;
          this.penalty(TR.t('pen.civInjured'), D.penalty.civilianInjured, target);
        }
        if (target.faction === 'police' && src === this.player) this.hint(TR.t('hint.friendly'));
        if (target.faction === 'suspect' && info.wasCompliant && !target.unauthFlag) {
          target.unauthFlag = true; this.stats.unauthorized++;
          this.penalty(TR.t('pen.unauth'), D.penalty.unauthorized, target);
        }
      }
    }
    onLessLethal(t, src) {
      if (src.faction !== 'police') return;
      if ((t.faction === 'civilian' && (t.surrendered || t.restrained)) || (t.faction === 'suspect' && (t.surrendered || t.restrained))) {
        if (!t.unnecessaryFlag) { t.unnecessaryFlag = true; this.stats.unnecessary++; this.penalty(TR.t('pen.unnecessary'), D.penalty.unauthorized, t); }
      }
    }
    penalty(label, value, at) {
      this.penaltyLog.push({ label, value });
      if (at) this.fx.popup(at.x, at.y - 0.5, label.toUpperCase() + ' ' + value, '#e0564a');
      this.hint(label + ' (' + value + ')', 3);
    }
    onDeath(c, src, info) {
      this.fx.bloodPool(c.x, c.y);
      c.deathRot = U.rand(-1, 1);
      if (c.claimedBy) { c.claimedBy.task = null; c.claimedBy = null; }
      if (c.kind === 'enemy' && src) this.feedPush(TR.t('feed.killed', this.nameOf(src) || '?', TR.t('feed.suspect')), '#e0564a');
      if (c.kind === 'civ') this.feedPush(TR.t('feed.civDead'), '#e0564a');
      if (c.kind === 'team') this.feedPush(TR.t('feed.officer', c.op.call), '#e0564a');
      if (c.kind === 'enemy') {
        this.stats.kills++;
        if (src && src.faction === 'police') {
          this.stats.neutralized++;
          if (!info.wasThreat && !c.unauthFlag && !info.lessLethal) {
            c.unauthFlag = true; this.stats.unauthorized++;
            this.penalty(TR.t('pen.unauthDeadly'), D.penalty.unauthorized, c);
          }
        }
      } else if (c.kind === 'civ') {
        this.stats.civDead++;
        if (src && src.faction === 'police') { this.stats.civKilledByPolice++; this.penalty(TR.t('pen.civKilled'), D.penalty.civilianShot, c); }
        if (c.vip || c.held || info.execution) { this.stats.hostageDead++; this.penalty(TR.t('pen.hostage'), D.penalty.hostageDeath, null); }
        if (c.vip) { this.radio(null, TR.t('radio.vipDown'), true); setTimeout(() => this.end(false, TR.t('reason.vip')), 2500); }
      } else if (c.kind === 'team') {
        this.stats.officersDown++;
        this.penalty(TR.t('pen.officer'), D.penalty.officerDown, null);
      } else if (c.kind === 'player') {
        this.hint(TR.t('hint.down'), 5);
        setTimeout(() => this.end(false, TR.t('reason.kia')), 2200);
      }
    }
    onSurrender(s) {
      if (this.tutorial) this.tutorial.flag('comply');
    }
    onPlayerHurt(d, src) {
      if (src && src !== this.player) this.dmgDirs.push({ a: U.angleTo(this.player.x, this.player.y, src.x, src.y), t: 1.2 });
      this.hurtFlash = Math.min(1, this.hurtFlash + d / 30);
      this.stats.damageTaken += d;
      this.shake(0.3);
    }
    restrain(t, by) {
      if (!t.alive || t.restrained) return;
      t.restrained = true; t.surrendered = true;
      t.clearPath(); t.moving = false;
      if (t.kind === 'enemy' && t.hasWeapon) { this.dropWeapon(t); t.hasWeapon = false; }
      if (t.kind === 'enemy') t.state = 'ARRESTED'; else t.state = 'RESTRAINED';
      t.stunT = 0;
      TR.Audio.play('cuff', t.x, t.y);
      if (by) this.feedPush(t.kind === 'enemy' ? TR.t('feed.arrested', this.nameOf(by), TR.t('feed.suspect')) : TR.t('feed.secured', this.nameOf(by)), '#8fd18a');
      if (t.kind === 'enemy') { this.stats.arrests++; this.fx.popup(t.x, t.y - 0.5, TR.t('pop.arrest', D.xp.arrest)); }
      else { this.stats.civSecured++; this.fx.popup(t.x, t.y - 0.5, (t.vip ? TR.t('pop.vip', D.xp.hostage) : TR.t('pop.civ', D.xp.civilian)), '#8fd18a'); if (t.vip) this.radio(null, TR.t('radio.vipSafe'), true); }
      if (this.tutorial) this.tutorial.flag('restrain');
      this.checkObjectiveProgress();
    }
    collect(it, by) {
      if (it.collected) return;
      it.collected = true; this.stats.evidence++;
      TR.Audio.play('pickup', it.x, it.y);
      this.fx.popup(it.x, it.y - 0.4, TR.t('pop.ev', it.label.toUpperCase(), D.xp.evidence), '#8fc3e8');
      if (this.tutorial) this.tutorial.flag('evidence');
      this.checkObjectiveProgress();
    }
    useTerminal(term, by) {
      this.revealT = 12;
      TR.Audio.play('uiConfirm');
      if (!term.used) {
        term.used = true;
        this.stats.evidence++;
        this.fx.popup(term.x, term.y - 0.5, TR.t('pop.footage', D.xp.evidence), '#8fc3e8');
        this.radio(null, TR.t('radio.cams'), true);
      } else this.hint(TR.t('hint.camActive'));
      this.checkObjectiveProgress();
    }
    onRoomCleared(id) {
      this.clearedRooms.add(id);
    }
    checkObjectiveProgress() {
      const was = this.extractReady;
      this.extractReady = this.mandatoryDone();
      if (this.extractReady && !was) {
        TR.Audio.play('objective');
        const ex = this.objectives.find((o) => o.id === 'extract'); ex.hidden = false;
        this.radio(null, TR.t('radio.extract'), true);
      }
    }
    requestExtract() {
      if (!this.extractReady) {
        this.hintConfirm = true;
        this.hint(TR.t('hint.early'), 3);
        if (this.abortArmed && this.time - this.abortArmed < 3) { this.end(true, TR.t('reason.early'), true); return; }
        this.abortArmed = this.time;
        return;
      }
      this.end(true, TR.t('reason.allDone'));
    }
    shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a * (TR.Save.data.settings.shake ? 1 : 0)); }

    throwGrenade(thrower, tx, ty, door, type) {
      this.grenades.push(new TR.Grenade(this, thrower, tx, ty, type || 'flash'));
      if (thrower === this.player) this.player.say(TR.t('yell.grenade'), 1.2);
    }
    detonate(type, x, y, thrower) {
      if (type === 'flash') return this.flashbang(x, y, thrower);
      if (type === 'stinger') return this.stinger(x, y, thrower);
      // gas / smoke clouds
      TR.Audio.play('explosion', x, y, { vol: 0.25 });
      TR.Audio.play('medkit', x, y, { vol: 1 });
      this.noise(x, y, 12, 'bang', thrower);
      const cloud = { type, x, y, r: 0.5, maxR: type === 'smoke' ? 3.2 : 3.6, t: type === 'smoke' ? 18 : 14, tick: 0, cells: [] };
      this.clouds.push(cloud);
    }
    stinger(x, y, thrower) {
      TR.Audio.play('flashbang', x, y, { range: 22, vol: 0.7 });
      TR.Audio.play('shotgun', x, y, { vol: 0.5 });
      this.fx.stinger(x, y);
      this.noise(x, y, 26, 'bang', thrower);
      this.shake(0.35);
      for (const c of this.characters) {
        if (!c.alive || c.kind === 'team') continue;
        const d = U.dist(x, y, c.x, c.y);
        if (d > 5.5 || !this.map.los(x, y, c.x, c.y)) continue;
        const sev = 1 - d / 5.5;
        c.takeDamage(4 + 10 * sev, thrower, { lessLethal: true, ignoreArmor: false });
        if (c.alive && c.kind !== 'player') { c.stun(2.5 + 3 * sev, 'impact'); if (c.moraleBonus != null) c.moraleBonus += 0.2; if (c.kind === 'civ') c.panic(x, y); }
        else if (c.kind === 'player') c.stun(0.6 + sev, 'impact');
      }
    }
    updateClouds(dt) {
      const map = this.map;
      for (const cl of this.clouds) {
        cl.t -= dt;
        cl.r = Math.min(cl.maxR, cl.r + dt * 2.2);
        if (cl.t < 2) cl.r = Math.max(0.2, cl.r - dt * 1.2);
        if (cl.type === 'smoke') {
          // cells inside the cloud become opaque
          const want = new Set();
          if (cl.t > 1.5) {
            const r = cl.r * 0.85;
            for (let y = Math.floor(cl.y - r); y <= Math.floor(cl.y + r); y++) for (let x = Math.floor(cl.x - r); x <= Math.floor(cl.x + r); x++) {
              if (!map.inside(x, y) || U.dist(x + 0.5, y + 0.5, cl.x, cl.y) > r) continue;
              const i = map.idx(x, y);
              if (map.staticSight[i] || !map.los(cl.x, cl.y, x + 0.5, y + 0.5, map.staticSight)) continue;
              want.add(i);
            }
          }
          cl.cells.forEach((i) => { if (!want.has(i)) map.addSmoke(i, -1); });
          want.forEach((i) => { if (!cl.cells.includes(i)) map.addSmoke(i, 1); });
          cl.cells = Array.from(want);
        } else {
          cl.tick -= dt;
          if (cl.tick <= 0) {
            cl.tick = 0.5;
            for (const c of this.characters) {
              if (!c.alive || c.kind === 'team') continue;
              if (U.dist(c.x, c.y, cl.x, cl.y) > cl.r || !map.los(cl.x, cl.y, c.x, c.y)) continue;
              if (c.kind === 'player') c.stun(1.2, 'gas');
              else { c.stun(1.4, 'gas'); if (c.kind === 'civ') c.panic(cl.x, cl.y); }
            }
          }
        }
      }
      const dead = this.clouds.filter((c) => c.t <= 0);
      dead.forEach((cl) => cl.cells.forEach((i) => map.addSmoke(i, -1)));
      if (dead.length) this.clouds = this.clouds.filter((c) => c.t > 0);
    }
    drawClouds(g) {
      for (const cl of this.clouds) {
        const col = cl.type === 'smoke' ? '200,202,205' : '215,200,120';
        const a = Math.min(1, cl.t / 2) * (cl.type === 'smoke' ? 0.85 : 0.35);
        for (let i = 0; i < 7; i++) {
          const ang = i * 0.9 + this.time * 0.15 * (i % 2 ? 1 : -1);
          const ox = Math.cos(ang) * cl.r * 0.45, oy = Math.sin(ang) * cl.r * 0.45;
          const gr = g.createRadialGradient((cl.x + ox) * TS, (cl.y + oy) * TS, 0, (cl.x + ox) * TS, (cl.y + oy) * TS, cl.r * 0.8 * TS);
          gr.addColorStop(0, 'rgba(' + col + ',' + (a * 0.6) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
          g.fillStyle = gr; g.beginPath(); g.arc((cl.x + ox) * TS, (cl.y + oy) * TS, cl.r * 0.8 * TS, 0, 7); g.fill();
        }
      }
    }
    flashbang(x, y, thrower) {
      TR.Audio.play('flashbang', x, y, { range: 30 });
      this.fx.flash(x, y);
      this.noise(x, y, 30, 'bang', thrower);
      this.shake(0.5);
      for (const c of this.characters) {
        if (!c.alive) continue;
        const d = U.dist(x, y, c.x, c.y);
        if (d > 8.5) continue;
        if (!this.map.los(x, y, c.x, c.y)) continue;
        const sev = 1 - d / 8.5;
        const facing = Math.abs(U.angleDiff(c.angle, U.angleTo(c.x, c.y, x, y))) < 1.2 ? 1 : 0.5;
        if (c.kind === 'team') { if (d < 1.6) c.stun(0.6, 'flash'); continue; }
        if (c.kind === 'player') {
          const t = 0.8 + 4.2 * sev * facing;
          c.stun(t, 'flash');
          TR.Audio.play('tinnitus', null, null, { dur: t + 1 });
          continue;
        }
        const t = Math.max(d < 3 ? 2.5 : 0, 1.8 + 4.8 * sev * facing);
        c.stun(t, 'flash');
        if (c.kind === 'civ') c.panic(x, y);
      }
    }
    addCharge(door, owner, side) { this.charges.push(new TR.BreachCharge(this, door, owner, side)); }
    explodeDoor(door, side, owner) {
      TR.Audio.play('explosion', door.cx, door.cy, { range: 40 });
      this.fx.explosion(door.cx, door.cy);
      door.forceOpen(door.cx + door.nx * side, door.cy + door.ny * side, true);
      this.noise(door.cx, door.cy, 35, 'explosion', owner);
      this.shake(0.9);
      for (const c of this.characters) {
        if (!c.alive) continue;
        const d = U.dist(c.x, c.y, door.cx, door.cy);
        if (d > 4.5) continue;
        const far = door.side(c.x, c.y) !== side;
        if (far) {
          if (!this.map.los(door.cx, door.cy, c.x, c.y)) continue;
          if (d < 1.7) c.takeDamage(45 * (1 - d / 1.7) + 10, owner, { explosion: true, wasThreat: c.isThreat ? c.isThreat() : false });
          if (c.alive && c.kind !== 'team' && c.kind !== 'player') c.stun(3.5 + (4.5 - d), 'flash');
        } else if (d < 1.6) {
          c.takeDamage(30 * (1 - d / 1.6), owner, { explosion: true });
          if (c === this.player) c.stun(1.5, 'flash');
        }
      }
    }
    kickDoor(door, by, success) {
      this.noise(door.cx, door.cy, 14, 'kick', by);
      this.shake(by === this.player ? 0.35 : 0.15);
      if (success) {
        TR.Audio.play('kick', door.cx, door.cy);
        const wasLocked = door.locked;
        door.forceOpen(by.x, by.y, false);
        if (!wasLocked) door.broken = false;
        // people right behind the door are knocked back
        for (const c of this.npcs) {
          if (!c.alive) continue;
          if (U.dist(c.x, c.y, door.cx, door.cy) < 1.4 && door.side(c.x, c.y) !== door.side(by.x, by.y)) c.stun(1.6, 'impact');
        }
      } else {
        TR.Audio.play('kickFail', door.cx, door.cy);
        door.lockKnown = true;
      }
    }
    playerKick(door) {
      if (this.kickCd > 0) return;
      this.kickCd = 0.8;
      const ok = !door.locked || Math.random() < 0.55;
      this.kickDoor(door, this.player, ok);
      if (!ok) this.hint(TR.t('hint.holds'));
    }

    // ------------------------------------------------------------ interaction context
    interactionContext() {
      const p = this.player;
      const ctx = { primary: null, door: null, prompts: [] };
      let best = null, bs = 1e9;
      const consider = (type, target, x, y, maxD, label, key) => {
        const d = U.dist(p.x, p.y, x, y);
        if (d > maxD) return;
        const facing = Math.abs(U.angleDiff(p.angle, U.angleTo(p.x, p.y, x, y)));
        const s = d + facing * 0.6 + (type === 'restrain' ? -0.6 : 0);
        if (s < bs) { bs = s; best = { type, target, label, key: key || 'E' }; }
      };
      for (const n of this.npcs) {
        if (!n.alive || n.restrained) continue;
        const restrainable = (n.kind === 'enemy' && (n.surrendered || n.stunT > 0)) || (n.kind === 'civ' && (n.state === 'COMPLIANT' || n.stunT > 0));
        if (restrainable) consider('restrain', n, n.x, n.y, 1.3, n.kind === 'enemy' ? TR.t('pr.restrainSus') : TR.t('pr.secureCiv'));
      }
      for (const it of this.items) if (!it.collected) consider('evidence', it, it.x, it.y, 1.15, TR.t('pr.collect', it.label.toUpperCase()));
      if (this.terminal) consider('terminal', this.terminal, this.terminal.x, this.terminal.y, 1.5, this.terminal.used ? TR.t('pr.viewCams') : TR.t('pr.cams'));
      const ez = this.extractZone;
      const inZone = ez && p.x > ez.x1 && p.x < ez.x2 && p.y > ez.y1 && p.y < ez.y2;
      if (!inZone) this.leftStart = true;
      if (inZone && (this.leftStart || this.extractReady)) {
        if (!best) best = { type: 'extract', label: this.extractReady ? TR.t('pr.complete') : TR.t('pr.end'), key: 'E' };
      }
      const door = this.map.doorNear(p.x, p.y, 1.35);
      if (door) {
        ctx.door = door;
        if (!best && !door.isOpen && door.locked && door.lockKnown && p.lockpick) best = { type: 'lockpick', target: door, label: TR.t('pr.pick'), key: 'E' };
        if (!best) best = { type: 'door', target: door, label: door.isOpen ? (door.broken ? '' : TR.t('pr.close')) : (door.wedged ? TR.t('pr.unwedge') : TR.t('pr.open')), key: 'E' };
        if (!door.isOpen) {
          ctx.prompts.push({ key: 'Q', label: TR.t('pr.mirror') });
          ctx.prompts.push({ key: 'F', label: TR.t('pr.kick') });
          if (p.charges > 0) ctx.prompts.push({ key: 'B', label: TR.t('pr.charge') });
          if (p.wedges > 0 && !door.wedged) ctx.prompts.push({ key: 'V', label: TR.t('pr.wedge') });
        }
      }
      ctx.primary = best && best.label ? best : null;
      if (ctx.primary) ctx.prompts.unshift({ key: ctx.primary.key, label: ctx.primary.label + (ctx.primary.type === 'restrain' || ctx.primary.type === 'evidence' ? ' ' + TR.t('pr.hold') : '') });
      return ctx;
    }
    // things under the cursor for team commands
    cursorContext() {
      const w = this.camera.toWorld(I.mouse.x, I.mouse.y);
      let door = null, bd = 1.6;
      for (const d of this.map.doors) { const dd = U.dist(w[0], w[1], d.cx, d.cy); if (dd < bd) { bd = dd; door = d; } }
      let target = null, td = 1.0;
      for (const n of this.npcs) {
        if (!n.alive || n.restrained) continue;
        if (!(n.surrendered || n.stunT > 0 || n.state === 'COMPLIANT')) continue;
        const dd = U.dist(w[0], w[1], n.x, n.y); if (dd < td) { td = dd; target = n; }
      }
      return { x: w[0], y: w[1], door, target };
    }
    issue(type) {
      const ctx = this.cursorContext();
      if ((type === 'stack' || type === 'flashclear' || type === 'openclear' || type === 'kickclear' || type === 'chargeclear') && !ctx.door) {
        // fall back to the door nearest to the player
        ctx.door = this.map.doorNear(this.player.x, this.player.y, 2.5);
      }
      if (type === 'restrain' && !ctx.target) {
        let best = null, bd = 6;
        for (const n of this.npcs) if (n.alive && !n.restrained && (n.surrendered || n.stunT > 0) && n.state !== 'HELD') { const d = U.dist(n.x, n.y, this.player.x, this.player.y); if (d < bd) { bd = d; best = n; } }
        ctx.target = best;
      }
      this.squad.command(type, ctx);
      if (this.tutorial) this.tutorial.flag('cmd_' + type);
    }
    wheelOptions(ctx) {
      const o = [];
      if (ctx.door) {
        if (!ctx.door.isOpen) {
          o.push({ id: 'stack', label: TR.t('wh.stack') });
          o.push({ id: 'openclear', label: TR.t('wh.openclear') });
          o.push({ id: 'flashclear', label: TR.t('wh.flashclear') });
          o.push({ id: 'kickclear', label: TR.t('wh.kickclear') });
          if (this.officers.some((m) => m.alive && m.charges > 0)) o.push({ id: 'chargeclear', label: TR.t('wh.chargeclear') });
        } else {
          o.push({ id: 'openclear', label: TR.t('wh.clearroom') });
          o.push({ id: 'flashclear', label: TR.t('wh.flashclear') });
          o.push({ id: 'stack', label: TR.t('wh.stack') });
        }
      }
      if (ctx.target) o.push({ id: 'restrain', label: TR.t('wh.restrain') });
      o.push({ id: 'follow', label: TR.t('wh.follow') });
      o.push({ id: 'hold', label: TR.t('wh.hold') });
      if (!ctx.door) { o.push({ id: 'move', label: TR.t('wh.move') }); o.push({ id: 'cover', label: TR.t('wh.cover') }); }
      return o;
    }

    // ------------------------------------------------------------ update
    update(dt) {
      if (this.over) return;
      // command wheel (slows time)
      const wheelKey = I.key('Tab') || I.mouse.down[1];
      if (wheelKey && !this.wheelOpen && this.player.alive) {
        const ctx = this.cursorContext();
        this.wheelOpen = true;
        this.wheel = { cx: I.mouse.x, cy: I.mouse.y, ctx, options: this.wheelOptions(ctx), sel: -1 };
        TR.Audio.play('ui');
      } else if (!wheelKey && this.wheelOpen) {
        const w = this.wheel;
        this.wheelOpen = false;
        if (w.sel >= 0) {
          const op = w.options[w.sel];
          const save = I.mouse.x, save2 = I.mouse.y;
          const s = this.camera.toScreen(w.ctx.x, w.ctx.y);
          I.mouse.x = s[0]; I.mouse.y = s[1];
          this.issue(op.id);
          I.mouse.x = save; I.mouse.y = save2;
          TR.Audio.play('uiConfirm');
        }
        this.wheel = null;
      }
      if (this.wheelOpen) {
        const w = this.wheel;
        const dx = I.mouse.x - w.cx, dy = I.mouse.y - w.cy;
        if (Math.hypot(dx, dy) > 28) {
          const a = Math.atan2(dy, dx);
          const n = w.options.length;
          let idx = Math.round(((a + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2 / n)) % n;
          if (idx !== w.sel) TR.Audio.play('uiHover');
          w.sel = idx;
        } else w.sel = -1;
      }
      // direct command hotkeys (GDD 24)
      if (!this.wheelOpen && this.player.alive) {
        const map = { F1: 'follow', F2: 'hold', F3: 'move', F4: 'stack', F5: 'flashclear', F6: 'openclear', F7: 'cover', F8: 'restrain', KeyZ: 'follow', KeyX: 'hold' };
        for (const k in map) if (I.hit(k)) this.issue(map[k]);
      }
      if (I.wheel && !I.key('ShiftLeft')) this.camera.level = U.clamp(this.camera.level - I.wheel * 0.1, 0.7, 1.8);

      const sdt = dt * (this.wheelOpen ? 0.3 : 1);
      this.time += sdt;
      if (this.kickCd > 0) this.kickCd -= sdt;
      if (this.radioCd > 0) this.radioCd -= sdt;
      if (this.revealT > 0) this.revealT -= sdt;
      this.hostageTension = Math.max(0, this.hostageTension - sdt * 0.5);

      this.player.update(sdt);
      this.squad.update(sdt);
      for (const o of this.officers) o.update(sdt);
      for (const n of this.npcs) n.update(sdt);
      for (const d of this.map.doors) d.update(sdt);
      for (const g of this.grenades) g.update(sdt);
      this.grenades = this.grenades.filter((g) => !g.dead);
      for (const c of this.charges) c.update(sdt);
      this.charges = this.charges.filter((c) => !c.dead);
      this.updateClouds(sdt);
      this.separate();
      this.fx.update(sdt);
      this.feed.forEach((f) => (f.t -= sdt)); this.feed = this.feed.filter((f) => f.t > 0);
      this.dmgDirs.forEach((f) => (f.t -= sdt)); this.dmgDirs = this.dmgDirs.filter((f) => f.t > 0);
      if (this.hitMarker) { this.hitMarker.t -= sdt; if (this.hitMarker.t <= 0) this.hitMarker = null; }
      this.showMap = I.key('KeyM');
      this.updateRain(sdt);
      this.autosaveT -= dt;
      if (this.autosaveT <= 0) { this.autosaveT = 8; if (this.hooks.onAutosave) this.hooks.onAutosave(); }
      this.updateVisibility();
      this.updateRooms();
      if (this.tutorial) this.tutorial.update(sdt);
      this.radioLog.forEach((r) => (r.t -= sdt));
      this.radioLog = this.radioLog.filter((r) => r.t > 0);
      if (this.hintText) { this.hintText.t -= sdt; if (this.hintText.t <= 0) this.hintText = null; }
      if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - sdt * 1.2);
      if (!this.extractReady) this.checkObjectiveProgress();
      // camera
      const p = this.player;
      const look = p.aiming ? 0.42 : 0.2;
      let tx = p.x + U.clamp(p.aimX - p.x, -9, 9) * look, ty = p.y + U.clamp(p.aimY - p.y, -6, 6) * look;
      if (p.droneCtl && p.drone) { tx = p.drone.x; ty = p.drone.y; }
      const k = 1 - Math.exp(-7 * dt);
      if (isFinite(tx) && isFinite(ty)) { this.camera.x += (tx - this.camera.x) * k; this.camera.y += (ty - this.camera.y) * k; }
      if (!isFinite(this.camera.x) || !isFinite(this.camera.y)) { this.camera.x = p.x; this.camera.y = p.y; }
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
      const s = this.shakeAmt * this.shakeAmt * 14;
      this.camera.sx = U.rand(-s, s); this.camera.sy = U.rand(-s, s);
      TR.Audio.listener.x = p.x; TR.Audio.listener.y = p.y;
    }
    separate() {
      const cs = this.characters;
      for (let i = 0; i < cs.length; i++) {
        const a = cs[i]; if (!a.alive) continue;
        for (let j = i + 1; j < cs.length; j++) {
          const b = cs[j]; if (!b.alive) continue;
          // officers step past kneeling / cuffed / stunned people instead of being blocked in doorways
          const down = (c) => c.restrained || c.surrendered || c.stunT > 0;
          if ((a.faction === 'police' && down(b)) || (b.faction === 'police' && down(a))) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.r + b.r - 0.04;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), push = (min - d);
          const nx = dx / d, ny = dy / d;
          // stationary (kneeling) people and the player are pushed less
          let wa = 0.5, wb = 0.5;
          const immobile = (c) => c.restrained || c.surrendered || c.kind === 'player';
          if (immobile(a) && !immobile(b)) { wa = 0; wb = 1; } else if (immobile(b) && !immobile(a)) { wa = 1; wb = 0; }
          if (a.kind === 'player' && b.kind === 'team') { wa = 0.1; wb = 0.9; }
          if (b.kind === 'player' && a.kind === 'team') { wa = 0.9; wb = 0.1; }
          const ra = this.map.resolveCircle(a.x - nx * push * wa, a.y - ny * push * wa, a.r);
          const rb = this.map.resolveCircle(b.x + nx * push * wb, b.y + ny * push * wb, b.r);
          a.x = ra[0]; a.y = ra[1]; b.x = rb[0]; b.y = rb[1];
        }
      }
    }
    viewers() {
      const v = [];
      if (this.player.alive) v.push(this.player);
      if (this.player.drone) v.push(this.player.drone);
      for (const o of this.officers) if (o.alive) v.push(o);
      const m = this.player.mirror;
      if (m) {
        const p = m.door.sidePoint(m.side, 0.55);
        v.push({ kind: 'mirror', x: p[0], y: p[1], angle: Math.atan2(m.door.ny * m.side, m.door.nx * m.side), r: 0 });
      }
      return v;
    }
    updateVisibility() {
      const vs = this.viewers();
      this.vision = vs.map((v) => TR.Vision.polygon(this.map, v));
      for (const n of this.npcs) {
        let vis = this.revealT > 0;
        if (!vis) for (const v of vs) { if (TR.Vision.sees(this.map, v, n)) { vis = true; break; } }
        if (vis) { n.visibleToTeam = true; n.lastSeenT = this.time; n.everSeen = true; n.ghost = [n.x, n.y, n.angle]; }
        else n.visibleToTeam = false;
      }
      for (const it of this.items) {
        if (it.discovered || it.collected) continue;
        for (const v of vs) { if (U.dist(v.x, v.y, it.x, it.y) < 9 && TR.Vision.sees(this.map, v, { x: it.x, y: it.y, r: 0.1 })) { it.discovered = true; break; } }
      }
    }
    updateRooms() {
      const r = this.map.roomAt(this.player.x, this.player.y);
      if (r && r !== this.curRoom) {
        this.curRoom = r;
        this.roomLabel = { text: TR.L.room(r.name).toUpperCase(), t: 2.5 };
        this.enteredRooms.add(r.id);
      }
      if (this.roomLabel) { this.roomLabel.t -= 1 / 60; if (this.roomLabel.t <= 0) this.roomLabel = null; }
    }

    // ------------------------------------------------------------ mid-mission save / resume
    serialize() {
      const chr = (c) => ({ x: +c.x.toFixed(3), y: +c.y.toFixed(3), a: +c.angle.toFixed(3), hp: c.hp, ar: c.armor, al: c.alive });
      const p = this.player;
      return {
        v: 1, mission: this.mission.id, loadout: this.loadout, time: this.time, stats: this.stats, pen: this.penaltyLog,
        cleared: Array.from(this.clearedRooms), extractReady: this.extractReady, revealT: this.revealT,
        player: Object.assign(chr(p), { slots: p.slots.map((w) => [w.ammo, w.reserve]), slot: p.slot, gren: p.grenades.map((g) => g.count), ch: p.charges, md: p.medkits, wd: p.wedges, du: !!p.droneUsed && !p.drone, dr: p.drone ? [p.drone.x, p.drone.y, p.drone.battery] : null }),
        officers: this.officers.map((o) => Object.assign(chr(o), { fl: o.flash, ch: o.charges, am: [o.weapon.ammo, o.weapon.reserve] })),
        npcs: this.npcs.map((n) => Object.assign(chr(n), {
          k: n.kind, ty: n.type, s: n.state, su: n.surrendered, re: n.restrained, hw: n.hasWeapon, w: n.weapon ? n.weapon.def.id : null, fk: n.fake, aw: n.aware,
          es: !!n.everSeen, cl: n.clothes, sk: n.skin, hr: n.hair, fe: n.female, vip: n.vip, held: n.held, tied: n.tied, cb: n.complyBase, home: n.home,
          ph: n.policeHit, uf: n.unauthFlag, nf: n.unnecessaryFlag, ex: n.executeT, nm: n.name, dr: n.deathRot,
          h: n.hostage ? this.npcs.indexOf(n.hostage) : -1
        })),
        items: this.items.map((i) => ({ x: i.x, y: i.y, k: i.kind, l: i.label, c: i.collected, d: i.discovered, f: i.fromSuspect })),
        doors: this.map.doors.map((d) => d.serialize()),
        terminal: this.terminal ? this.terminal.used : null
      };
    }
    restore(s) {
      const apply = (c, d) => { c.x = d.x; c.y = d.y; c.angle = d.a; c.hp = d.hp; c.armor = d.ar; c.alive = d.al; c.body = !d.al; };
      this.time = s.time; Object.assign(this.stats, s.stats); this.penaltyLog = s.pen || [];
      this.clearedRooms = new Set(s.cleared || []); this.revealT = s.revealT || 0;
      const p = this.player, sp = s.player;
      apply(p, sp);
      sp.slots.forEach((a, i) => { if (p.slots[i]) { p.slots[i].ammo = a[0]; p.slots[i].reserve = a[1]; } });
      p.slot = Math.min(sp.slot, p.slots.length - 1); p.weapon = p.slots[p.slot]; p.shield = p.shieldEquipped && p.weapon.def.cat === 'pistol';
      (sp.gren || []).forEach((c, i) => { if (p.grenades[i]) p.grenades[i].count = c; });
      p.charges = sp.ch; p.medkits = sp.md; p.wedges = sp.wd || 0; p.droneUsed = sp.du;
      if (sp.dr && p.hasDrone) { p.drone = new TR.Drone(this, p); p.drone.x = sp.dr[0]; p.drone.y = sp.dr[1]; p.drone.battery = sp.dr[2]; p.droneUsed = true; }
      p.aimX = p.x + Math.cos(p.angle); p.aimY = p.y + Math.sin(p.angle);
      s.officers.forEach((d, i) => { const o = this.officers[i]; if (!o) return; apply(o, d); o.flash = d.fl; o.charges = d.ch; o.weapon.ammo = d.am[0]; o.weapon.reserve = d.am[1]; o.order = { type: 'follow' }; });
      this.squad.trail = [[p.x, p.y]];
      // rebuild every NPC from the snapshot
      this.characters = this.characters.filter((c) => c.faction === 'police');
      this.npcs = []; this.enemies = []; this.civilians = []; this.vip = null;
      const made = s.npcs.map((d) => {
        let n;
        if (d.k === 'enemy') {
          n = new TR.Suspect(this, d.x, d.y, d.ty);
          n.hasWeapon = d.hw; if (d.w && TR.D.weapons[d.w]) { n.weapon = new TR.WeaponInst(TR.D.weapons[d.w]); n.weapon.reserve = 999; }
          n.fake = d.fk; n.aware = d.aw; n.executeT = d.ex != null ? d.ex : 7;
          n.state = d.re ? 'ARRESTED' : d.su ? 'SURRENDER' : (d.aw ? 'ALERT' : 'IDLE');
        } else {
          n = new TR.Civilian(this, d.x, d.y, { held: d.held, vip: d.vip, name: d.nm });
          n.female = d.fe; n.complyBase = d.cb; n.tied = d.tied;
          n.state = d.re ? 'RESTRAINED' : d.held ? 'HELD' : d.su ? 'COMPLIANT' : (d.s === 'CALM' ? 'CALM' : 'HIDE');
          if (d.vip) this.vip = n;
        }
        apply(n, d);
        n.surrendered = d.su; n.restrained = d.re; n.everSeen = d.es; n.clothes = d.cl; n.skin = d.sk; n.hair = d.hr;
        n.home = d.home || [d.x, d.y]; n.policeHit = d.ph; n.unauthFlag = d.uf; n.unnecessaryFlag = d.nf; n.deathRot = d.dr;
        n.kneel = (n.surrendered || n.restrained) ? 1 : 0;
        this.addNpc(n);
        return n;
      });
      s.npcs.forEach((d, i) => { if (d.h >= 0 && made[d.h]) { made[i].hostage = made[d.h]; made[d.h].heldBy = made[i]; } });
      this.items = s.items.map((i) => ({ x: i.x, y: i.y, kind: i.k, label: i.l, collected: i.c, discovered: i.d, fromSuspect: i.f, rot: Math.random() * 6.28 }));
      s.doors.forEach((d, i) => { if (this.map.doors[i]) this.map.doors[i].restore(d); });
      if (this.terminal && s.terminal != null) this.terminal.used = s.terminal;
      if (!this.vip) this.objectives = this.objectives.filter((o) => o.id !== 'vip');
      this.leftStart = true;
      this.extractReady = false;
      this.checkObjectiveProgress();
      // blood pools for the dead
      this.characters.forEach((c) => { if (!c.alive) { const g = this.fx.dg; g.fillStyle = 'rgba(90,8,6,0.75)'; g.beginPath(); g.ellipse(c.x * TS, c.y * TS, 16, 13, 0.3, 0, 7); g.fill(); } });
    }

    // ------------------------------------------------------------ rain (outdoor areas on rainy missions)
    updateRain(dt) {
      if (!this.mission.rain) return;
      const cam = this.camera;
      const hw = cam.W / (TS * cam.z) / 2 + 1, hh = cam.H / (TS * cam.z) / 2 + 1;
      while (this.rain.length < 160) this.rain.push({ x: cam.x + U.rand(-hw, hw), y: cam.y + U.rand(-hh, hh), t: U.rand(0, 0.5) });
      for (const r of this.rain) {
        r.t -= dt;
        if (r.t <= 0 || Math.abs(r.x - cam.x) > hw || Math.abs(r.y - cam.y) > hh) { r.x = cam.x + U.rand(-hw, hw); r.y = cam.y + U.rand(-hh, hh); r.t = U.rand(0.25, 0.5); }
      }
    }
    drawRain(g) {
      if (!this.mission.rain) return;
      const map = this.map;
      g.strokeStyle = 'rgba(170,190,215,0.35)'; g.lineWidth = 1;
      g.beginPath();
      for (const r of this.rain) {
        const cx = Math.floor(r.x), cy = Math.floor(r.y);
        if (!map.inside(cx, cy)) continue;
        const room = map.rooms[map.roomOf[map.idx(cx, cy)]];
        if (!room || !room.outside) continue;
        const k = r.t / 0.5;
        g.moveTo(r.x * TS, r.y * TS); g.lineTo((r.x - 0.12) * TS, (r.y + 0.35 * k) * TS);
      }
      g.stroke();
    }

    // ------------------------------------------------------------ tactical map (hold M)
    drawTacticalMap(g, W, H) {
      const fc = this.map.floorCanvas;
      const s = Math.min((W - 160) / fc.width, (H - 160) / fc.height);
      const w = fc.width * s, h = fc.height * s, ox = (W - w) / 2, oy = (H - h) / 2 + 10;
      g.fillStyle = 'rgba(5,7,10,0.82)'; g.fillRect(0, 0, W, H);
      g.drawImage(fc, ox, oy, w, h);
      g.fillStyle = 'rgba(5,8,12,0.35)'; g.fillRect(ox, oy, w, h);
      g.drawImage(this.map.wallCanvas, ox, oy, w, h);
      const ts = TS * s;
      const P = (x, y) => [ox + x * ts, oy + y * ts];
      // rooms
      g.font = '600 10px Bahnschrift, sans-serif'; g.textAlign = 'center';
      this.map.rooms.forEach((r) => {
        if (r.floorCells.length < 6 || r.name === 'Area') return;
        const [x, y] = P(r.cx, r.cy);
        g.fillStyle = this.clearedRooms.has(r.id) ? 'rgba(127,201,138,0.9)' : 'rgba(200,205,210,0.75)';
        g.fillText(TR.L.room(r.name).toUpperCase(), x, y);
      });
      this.map.doors.forEach((d) => { if (d.locked && d.lockKnown) { const [x, y] = P(d.cx, d.cy); g.fillStyle = '#d9544a'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); } if (d.wedged) { const [x, y] = P(d.cx, d.cy); g.fillStyle = '#e8b04a'; g.fillRect(x - 3, y - 3, 6, 6); } });
      const ez = this.extractZone;
      if (ez) { const [x1, y1] = P(ez.x1, ez.y1); g.strokeStyle = 'rgba(127,201,138,0.8)'; g.setLineDash([4, 3]); g.strokeRect(x1, y1, (ez.x2 - ez.x1) * ts, (ez.y2 - ez.y1) * ts); g.setLineDash([]); }
      for (const it of this.items) if (it.discovered && !it.collected) { const [x, y] = P(it.x, it.y); g.strokeStyle = '#6fb3de'; g.lineWidth = 1.5; g.strokeRect(x - 3, y - 3, 6, 6); }
      for (const n of this.npcs) {
        if (!n.everSeen) continue;
        const known = n.visibleToTeam || (n.ghost && this.time - n.lastSeenT < 20);
        if (!known && n.alive && !n.restrained) continue;
        const pos = n.visibleToTeam || !n.ghost ? [n.x, n.y] : n.ghost;
        const [x, y] = P(pos[0], pos[1]);
        let col = n.kind === 'enemy' ? '#e0564a' : '#e8c56a';
        if (!n.alive) col = '#555'; else if (n.restrained) col = '#7fc98a';
        g.fillStyle = col; g.globalAlpha = n.visibleToTeam || !n.alive || n.restrained ? 1 : 0.5;
        g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      const drawP = (c, col) => { const [x, y] = P(c.x, c.y); g.fillStyle = col; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(c.angle) * 11, y + Math.sin(c.angle) * 11); g.stroke(); };
      this.officers.forEach((o) => { if (o.alive) drawP(o, o.op.color); });
      if (this.player.alive) drawP(this.player, '#5fa8e8');
      if (this.player.drone) { const [x, y] = P(this.player.drone.x, this.player.drone.y); g.strokeStyle = '#6fb3de'; g.strokeRect(x - 4, y - 4, 8, 8); }
      g.font = '700 14px Bahnschrift, sans-serif'; g.fillStyle = '#e8b04a'; g.textAlign = 'left';
      g.fillText(TR.t('hud.map') + ' · ' + this.mission.name, ox, oy - 12);
      g.textAlign = 'left';
    }

    // ------------------------------------------------------------ end of mission / scoring
    end(success, reason, early) {
      if (this.over) return;
      this.over = true;
      TR.Voice.stop();
      const r = this.computeResult(success, reason, early);
      if (this.hooks.onEnd) this.hooks.onEnd(r);
    }
    computeResult(success, reason, early) {
      const st = this.stats, X = D.xp, P = D.penalty;
      const civAlive = this.civilians.filter((c) => c.alive);
      const civSecured = this.civilians.filter((c) => c.restrained && !c.vip).length;
      const vipSaved = this.vip ? (this.vip.alive && this.vip.restrained) : null;
      const arrested = this.enemies.filter((e) => e.alive && e.restrained).length;
      const neutralized = this.enemies.filter((e) => !e.alive).length;
      const unresolved = this.enemies.filter((e) => e.alive && !e.restrained).length;
      const evTot = this.items.length + (this.terminal ? 1 : 0);
      const evGot = this.items.filter((i) => i.collected).length + (this.terminal && this.terminal.used ? 1 : 0);
      const evLeft = this.items.filter((i) => !i.collected).length;
      if (success && early) {
        // leaving early with open objectives = failed unless everything essential is done
        if (unresolved > 0 || civAlive.some((c) => !c.restrained) || (this.vip && !vipSaved)) success = false;
      }
      const lines = [];
      const add = (label, v) => { if (v) lines.push({ label, value: v }); };
      if (success) add(TR.t('sl.complete'), X.complete);
      add(TR.t('sl.civ', civSecured), civSecured * X.civilian);
      if (vipSaved) add(TR.t('sl.vip'), X.hostage);
      add(TR.t('sl.arrest', arrested), arrested * X.arrest);
      add(TR.t('sl.neu', neutralized), neutralized * X.neutralized);
      add(TR.t('sl.ev', evGot), evGot * X.evidence);
      if (success && this.player.hp >= this.player.maxHp && st.damageTaken < 1) add(TR.t('sl.nodmg'), X.noDamage);
      if (success && this.time < this.mission.parTime) add(TR.t('sl.par'), Math.round((this.mission.parTime - this.time) * 0.5));
      this.penaltyLog.forEach((p) => lines.push({ label: p.label, value: p.value, penalty: true }));
      if (evLeft) lines.push({ label: TR.t('sl.evLeft', evLeft), value: evLeft * P.evidenceLeft, penalty: true });
      const score = Math.max(0, lines.reduce((s, l) => s + l.value, 0));
      const maxScore = X.complete + this.civilians.filter((c) => !c.vip).length * X.civilian + (this.vip ? X.hostage : 0) + this.enemies.length * X.arrest + evTot * X.evidence + X.noDamage;
      const ratio = score / Math.max(1, maxScore);
      const grade = !success ? 'F' : ratio > 0.92 ? 'S' : ratio > 0.8 ? 'A' : ratio > 0.65 ? 'B' : ratio > 0.5 ? 'C' : 'D';
      const bonus = success ? Math.round(score * 0.2 / 50) * 50 : 0;
      const reward = success ? this.mission.reward : 0;
      return {
        mission: this.mission, success, reason, grade, score, xp: Math.round(score * (success ? 1 : 0.3)), reward, bonus, credits: reward + bonus, lines,
        time: this.time,
        table: {
          civilians: civSecured + '/' + this.civilians.filter((c) => !c.vip).length,
          suspects: (arrested + neutralized) + '/' + this.enemies.length,
          arrested, neutralized,
          evidence: evGot + '/' + evTot,
          civDead: st.civDead, teamDown: st.officersDown,
          accuracy: st.shots ? Math.round(st.hits / st.shots * 100) + '%' : '—',
          vip: this.vip ? (vipSaved ? 'Rescued' : 'Lost') : null
        }
      };
    }

    // ------------------------------------------------------------ rendering
    render(g, W, H, dpr) {
      const cam = this.camera;
      cam.resize(W, H, dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#07090b'; g.fillRect(0, 0, W, H);
      cam.apply(g);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.map.floorCanvas, 0, 0);
      g.drawImage(this.fx.decal, 0, 0);
      this.fx.drawUnder(g);
      // extraction zone
      const ez = this.extractZone;
      if (ez) {
        g.strokeStyle = this.extractReady ? 'rgba(120,220,140,' + (0.5 + Math.sin(this.time * 4) * 0.3) + ')' : 'rgba(120,200,140,0.25)';
        g.setLineDash([8, 6]); g.lineWidth = 2;
        g.strokeRect(ez.x1 * TS + 2, ez.y1 * TS + 2, (ez.x2 - ez.x1) * TS - 4, (ez.y2 - ez.y1) * TS - 4);
        g.setLineDash([]);
      }
      if (this.terminal) this.drawTerminal(g);
      for (const it of this.items) if (!it.collected && (it.discovered)) this.drawItem(g, it);
      // bodies first
      for (const c of this.npcs) if (!c.alive && (c.everSeen)) c.draw(g);
      for (const c of this.officers) if (!c.alive) c.draw(g);
      // NPCs
      for (const c of this.npcs) {
        if (!c.alive) continue;
        if (c.visibleToTeam) c.draw(g);
        else if (c.ghost && this.time - c.lastSeenT < 5) this.drawGhost(g, c);
      }
      for (const c of this.officers) if (c.alive) c.draw(g);
      if (this.player.alive) this.player.draw(g); else this.player.draw(g);
      for (const gr of this.grenades) gr.draw(g);
      for (const ch of this.charges) ch.draw(g);
      if (this.player.drone) this.player.drone.draw(g);
      this.fx.draw(g);
      // fog of war
      this.renderFog(W, H, dpr);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.fogCanvas, 0, 0);
      cam.apply(g);
      this.drawClouds(g);
      this.drawRain(g);
      g.drawImage(this.map.wallCanvas, 0, 0);
      for (const d of this.map.doors) d.draw(g, true);
      this.fx.drawLights(g);
      // laser / aim guide
      if (this.player.alive && this.player.aiming) {
        const p = this.player;
        const d = this.map.raycast(p.x, p.y, Math.cos(p.angle), Math.sin(p.angle), 30, this.map.bulletBlock);
        g.strokeStyle = 'rgba(255,60,50,0.35)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo((p.x + Math.cos(p.angle) * 0.5) * TS, (p.y + Math.sin(p.angle) * 0.5) * TS); g.lineTo((p.x + Math.cos(p.angle) * d) * TS, (p.y + Math.sin(p.angle) * d) * TS); g.stroke();
        g.fillStyle = 'rgba(255,70,60,0.8)'; g.beginPath(); g.arc((p.x + Math.cos(p.angle) * d) * TS, (p.y + Math.sin(p.angle) * d) * TS, 2, 0, 7); g.fill();
      }
      // stack / order markers
      this.drawOrders(g);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    renderFog(W, H, dpr) {
      const fc = this.fogCanvas, f = this.fog;
      if (fc.width !== Math.floor(W * dpr) || fc.height !== Math.floor(H * dpr)) { fc.width = Math.floor(W * dpr); fc.height = Math.floor(H * dpr); }
      f.setTransform(1, 0, 0, 1, 0, 0);
      f.globalCompositeOperation = 'source-over';
      f.clearRect(0, 0, fc.width, fc.height);
      f.fillStyle = this.revealT > 0 ? 'rgba(4,10,14,0.62)' : 'rgba(3,5,8,0.8)';
      f.fillRect(0, 0, fc.width, fc.height);
      f.globalCompositeOperation = 'destination-out';
      this.camera.apply(f);
      for (const v of this.vision) {
        const pts = v.pts;
        const gr = f.createRadialGradient(v.x * TS, v.y * TS, 0, v.x * TS, v.y * TS, v.long * TS);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.97)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
        f.fillStyle = gr;
        f.beginPath();
        f.moveTo(pts[0] * TS, pts[1] * TS);
        for (let i = 2; i < pts.length; i += 2) f.lineTo(pts[i] * TS, pts[i + 1] * TS);
        f.closePath(); f.fill();
      }
      f.globalCompositeOperation = 'source-over';
    }
    drawGhost(g, c) {
      const k = 1 - (this.time - c.lastSeenT) / 5;
      const [x, y] = c.ghost;
      g.globalAlpha = 0.45 * k;
      g.strokeStyle = c.kind === 'enemy' ? '#e0564a' : '#e0c56a';
      g.lineWidth = 1.5;
      g.setLineDash([3, 3]);
      g.beginPath(); g.arc(x * TS, y * TS, 10, 0, 7); g.stroke();
      g.setLineDash([]);
      g.fillStyle = g.strokeStyle; g.font = 'bold 11px Bahnschrift, sans-serif'; g.textAlign = 'center'; g.fillText('?', x * TS, y * TS + 4);
      g.globalAlpha = 1;
    }
    drawItem(g, it) {
      const x = it.x * TS, y = it.y * TS;
      const pulse = 0.5 + Math.sin(this.time * 3 + it.x) * 0.25;
      g.strokeStyle = 'rgba(143,195,232,' + pulse + ')'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke();
      g.save(); g.translate(x, y); g.rotate(it.rot);
      switch (it.kind) {
        case 'weapon': g.fillStyle = '#141516'; g.fillRect(-7, -1.5, 14, 3); g.fillRect(-3, 0, 3, 4); break;
        case 'phone': g.fillStyle = '#1d1f22'; g.fillRect(-2.5, -4.5, 5, 9); g.fillStyle = '#3d6f9a'; g.fillRect(-2, -3.5, 4, 6); break;
        case 'drugs': g.fillStyle = '#e8e6de'; g.fillRect(-4, -3, 8, 6); g.fillStyle = '#b9b7ae'; g.fillRect(-4, -3, 8, 1.5); break;
        case 'documents': g.fillStyle = '#e8e2cf'; g.fillRect(-4, -5, 8, 10); g.fillStyle = '#8a8676'; for (let i = 0; i < 4; i++) g.fillRect(-3, -3 + i * 2, 6, 0.8); break;
        case 'cash': g.fillStyle = '#5f8a4f'; g.fillRect(-5, -3, 10, 6); g.fillStyle = '#9ec08a'; g.fillRect(-2, -1.5, 4, 3); break;
        case 'laptop': g.fillStyle = '#2b2e33'; g.fillRect(-6, -4, 12, 8); g.fillStyle = '#4b5f78'; g.fillRect(-5, -3, 10, 4); break;
        case 'drive': g.fillStyle = '#3a3f46'; g.fillRect(-3, -4, 6, 8); g.fillStyle = '#d04040'; g.fillRect(-1, -3, 2, 1.5); break;
      }
      g.restore();
    }
    drawTerminal(g) {
      const t = this.terminal;
      g.strokeStyle = t.used ? 'rgba(143,195,232,0.3)' : 'rgba(143,195,232,' + (0.5 + Math.sin(this.time * 3) * 0.3) + ')';
      g.lineWidth = 1.5; g.strokeRect(t.x * TS - 10, t.y * TS - 10, 20, 20);
      g.fillStyle = '#6fb3de'; g.font = 'bold 9px Bahnschrift, sans-serif'; g.textAlign = 'center'; g.fillText('CCTV', t.x * TS, t.y * TS + 3);
    }
    drawOrders(g) {
      for (const o of this.officers) {
        if (!o.alive) continue;
        const ord = o.order;
        if ((ord.type === 'move' || ord.type === 'plan') && !ord.arrived) {
          g.strokeStyle = o.op.color; g.globalAlpha = 0.5; g.lineWidth = 1.2; g.setLineDash([4, 4]);
          g.beginPath(); g.moveTo(o.x * TS, o.y * TS); g.lineTo(ord.x * TS, ord.y * TS); g.stroke(); g.setLineDash([]);
          g.beginPath(); g.arc(ord.x * TS, ord.y * TS, 5, 0, 7); g.stroke();
          g.globalAlpha = 1;
        }
      }
      const pl = this.squad.plan;
      if (pl) {
        const d = pl.door;
        g.strokeStyle = 'rgba(232,196,106,' + (0.5 + Math.sin(this.time * 6) * 0.3) + ')'; g.lineWidth = 2;
        g.strokeRect(d.x * TS + 2, d.y * TS + 2, TS - 4, TS - 4);
      }
    }
  }
  TR.Game = Game;

  // ------------------------------------------------------------------ Mission 01 tutorial (contextual hints)
  class Tutorial {
    constructor(game) {
      this.game = game; this.flags = {}; this.t = 0;
      this.steps = [
        { id: 'move', text: TR.t('tut.move'), done: () => this.moved > 4 },
        { id: 'team', text: TR.t('tut.team'), done: () => this.flags.cmd_stack || this.anyBreach() || this.t > 40 },
        { id: 'breach', text: TR.t('tut.breach'), done: () => this.anyBreach() || this.t > 70 },
        { id: 'mirror', when: () => this.game.player.ctx && this.game.player.ctx.door && !this.game.player.ctx.door.isOpen, text: TR.t('tut.mirror'), done: () => this.game.player.mirror || this.flags.mirrorT > 8 },
        { id: 'yell', when: () => this.game.npcs.some((n) => n.visibleToTeam && n.alive && !n.surrendered), text: TR.t('tut.yell'), done: () => this.flags.comply },
        { id: 'roe', when: () => this.game.enemies.some((n) => n.visibleToTeam && n.alive), text: TR.t('tut.roe'), done: () => this.flags.roeT > 9 },
        { id: 'restrain', when: () => this.game.npcs.some((n) => n.alive && !n.restrained && (n.surrendered || n.stunT > 0) && n.visibleToTeam), text: TR.t('tut.restrain'), done: () => this.flags.restrain },
        { id: 'evidence', when: () => this.game.items.some((i) => i.discovered && !i.collected), text: TR.t('tut.evidence'), done: () => this.flags.evidence },
        { id: 'tools', text: TR.t('tut.tools'), done: () => this.current === this.steps[8] && this.shown > 12, delay: 45 }
      ];
      this.shown = 0;
      this.moved = 0; this.last = [game.player.x, game.player.y];
      this.current = null;
    }
    anyBreach() { return this.flags.cmd_flashclear || this.flags.cmd_openclear || this.flags.cmd_kickclear || this.flags.cmd_chargeclear; }
    flag(f) { this.flags[f] = true; }
    update(dt) {
      this.t += dt;
      const p = this.game.player;
      this.moved += U.dist(p.x, p.y, this.last[0], this.last[1]); this.last = [p.x, p.y];
      if (this.current) {
        this.shown += dt;
        if (this.current.id === 'mirror') this.flags.mirrorT = (this.flags.mirrorT || 0) + dt;
        if (this.current.id === 'roe') this.flags.roeT = (this.flags.roeT || 0) + dt;
        if (this.current.done()) { this.current.finished = true; this.current = null; }
        return;
      }
      for (const s of this.steps) {
        if (s.finished) continue;
        if (s.delay && this.game.time < s.delay) continue;
        if (s.when && !s.when()) continue;
        if (s.done()) { s.finished = true; continue; }
        this.current = s; this.shown = 0; break;
      }
    }
  }
  TR.Tutorial = Tutorial;
})(window.TR);
