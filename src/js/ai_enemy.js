// Suspect AI: finite state machine (GDD 19/40) with vision, hearing, compliance and cover use.
(function (TR) {
  const U = TR.U, D = TR.D;

  const LINES = new Proxy({}, { get: (_, k) => TR.L.raw('l.' + String(k)) });

  class Suspect extends TR.Character {
    constructor(game, x, y, typeKey, opts) {
      const T = D.enemyTypes[typeKey];
      super(game, x, y, { kind: 'enemy', faction: 'suspect', hp: T.hp, clothes: U.pick(T.clothes), skin: U.pick(D.skin), hair: U.pick(D.hair), angle: Math.random() * 6.28, name: T.label });
      this.type = typeKey; this.T = T;
      this.weapon = new TR.WeaponInst(D.weapons[U.pick(T.weapons)]);
      this.weapon.reserve = 999;
      this.hasWeapon = true;
      this.state = 'IDLE'; this.stateT = 0;
      this.home = [x, y];
      this.target = null; this.lastKnown = null; this.reactT = 0; this.lostT = 0;
      this.complyCd = 0; this.yellCount = 0; this.moraleBonus = 0;
      this.fake = Math.random() < T.fakeSurrender; this.fakeT = U.rand(7, 14);
      this.burst = 0; this.nextShotT = 0;
      this.lookT = U.rand(1, 4); this.lookA = this.angle;
      this.aware = false;
      this.coverT = U.rand(1.5, 3); this.atCover = null;
      this.hostage = null; this.executeT = 7; this.threatT = 0;
      this.patrols = Math.random() < 0.35;
      this.seen = null;
      this.everHostile = false;
      this.perceiveT = Math.random() * 0.1;
      this.hurtLineT = 0;
    }
    isThreat() { return this.alive && !this.restrained && !this.surrendered && this.stunT <= 0 && this.hasWeapon; }
    // actively dangerous (weapon raised at police)
    isHostile() { return this.isThreat() && (this.state === 'COMBAT' || this.state === 'HOSTAGE' || this.state === 'ALERT' || this.state === 'HIDE'); }

    setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }

    canSee(c) {
      const d = U.dist(this.x, this.y, c.x, c.y);
      if (d > 13) return false;
      if (d > 2.2) {
        const diff = Math.abs(U.angleDiff(this.angle, U.angleTo(this.x, this.y, c.x, c.y)));
        if (diff > 0.96) return false;
      }
      return this.game.map.los(this.x, this.y, c.x, c.y);
    }

    perceive() {
      let best = null, bd = 1e9;
      for (const p of this.game.police) {
        if (!p.alive) continue;
        if (!this.canSee(p)) continue;
        const d = U.dist(this.x, this.y, p.x, p.y);
        if (d < bd) { bd = d; best = p; }
      }
      this.seen = best;
      // a buzzing drone makes idle suspects suspicious
      const dr = this.game.player && this.game.player.drone;
      if (!best && dr && (this.state === 'IDLE' || this.state === 'PATROL') && U.dist(this.x, this.y, dr.x, dr.y) < 6 && this.canSee(dr)) {
        this.lastKnown = [dr.x, dr.y]; this.clearPath(); this.setState('SUSPICIOUS');
      }
      return best;
    }

    alertOthers(x, y, radius) {
      for (const e of this.game.enemies) {
        if (e === this || !e.alive || e.surrendered || e.restrained) continue;
        if (U.dist(e.x, e.y, this.x, this.y) < radius && (e.state === 'IDLE' || e.state === 'PATROL' || e.state === 'SUSPICIOUS')) {
          e.aware = true; e.lastKnown = [x + U.rand(-1, 1), y + U.rand(-1, 1)];
          e.setState(e.type === 'aggressive' ? 'INVESTIGATE' : 'ALERT');
        }
      }
    }

    engage(target, fast) {
      const first = !this.aware;
      this.target = target; this.aware = true; this.everHostile = true;
      this.lastKnown = [target.x, target.y];
      if (this.state !== 'COMBAT') {
        const r = this.T.reaction;
        let rt = U.rand(r[0], r[1]);
        if (this.state === 'ALERT' || this.state === 'HIDE') rt *= 0.55;
        if (fast) rt *= 0.5;
        this.reactT = rt;
        this.burst = 0;
        this.setState('COMBAT');
        if (first && Math.random() < 0.6) this.shout(U.pick(LINES.spot));
        if (this.type === 'leader') { this.alertOthers(target.x, target.y, 16); this.shout(TR.t('l.leader')); }
        else this.alertOthers(target.x, target.y, 6);
      }
    }
    shout(text) {
      this.say(text);
      if (this.visibleToTeam || U.dist(this.x, this.y, this.game.player.x, this.game.player.y) < 10) TR.Voice.say(text, { voice: 'suspect', pitch: 0.75, rate: 1.3, vol: 0.8 });
    }

    // --------------------------------------------------------------- main update
    update(dt) {
      this.baseUpdate(dt);
      if (!this.alive) return;
      if (this.complyCd > 0) this.complyCd -= dt;
      if (this.hurtLineT > 0) this.hurtLineT -= dt;
      this.stateT += dt;
      if (this.restrained) { this.moving = false; return; }

      if (this.stunT > 0) {
        this.moving = false;
        // stumble
        if (Math.random() < 0.05) this.moveVel(U.rand(-0.6, 0.6), U.rand(-0.6, 0.6), dt * 4);
        this.angle += Math.sin(performance.now() / 300 + this.id) * dt * 1.5;
        if (this.stunT - dt <= 0 && !this.surrendered) { this.aware = true; this.setState(this.target ? 'COMBAT' : 'ALERT'); this.reactT = 0.6; }
        return;
      }

      if (this.surrendered) { this.updateSurrendered(dt); return; }

      this.perceiveT -= dt;
      if (this.perceiveT <= 0) { this.perceiveT = 0.1; this.perceive(); }
      const seen = this.seen;
      if (seen && this.state !== 'COMBAT' && this.state !== 'HOSTAGE' && this.state !== 'FLEE') {
        if (this.hostage && this.hostage.alive && this.hostage.held) { this.target = seen; this.aware = true; this.setState('HOSTAGE'); }
        else this.engage(seen);
      }
      if (this.hostage && this.hostage.alive && this.hostage.held && this.state !== 'HOSTAGE' && this.state !== 'FLEE' && this.aware && this.state !== 'COMBAT') this.setState('HOSTAGE');

      switch (this.state) {
        case 'IDLE': this.sIdle(dt); break;
        case 'PATROL': this.sPatrol(dt); break;
        case 'SUSPICIOUS': this.sSuspicious(dt); break;
        case 'INVESTIGATE': this.sInvestigate(dt); break;
        case 'ALERT': this.sAlert(dt); break;
        case 'COMBAT': this.sCombat(dt); break;
        case 'SEARCH': this.sSearch(dt); break;
        case 'FLEE': this.sFlee(dt); break;
        case 'HIDE': this.sHide(dt); break;
        case 'HOSTAGE': this.sHostage(dt); break;
      }
    }

    lookAround(dt, rate) {
      this.lookT -= dt;
      if (this.lookT <= 0) {
        this.lookT = U.rand(1.5, 4);
        const room = this.game.map.roomAt(this.x, this.y);
        if (room && room.doors.length && Math.random() < 0.6) {
          const d = this.game.map.doors[U.pick(room.doors)];
          this.lookA = U.angleTo(this.x, this.y, d.cx, d.cy);
        } else this.lookA = this.angle + U.rand(-1.8, 1.8);
      }
      this.faceTowards(this.lookA, rate || 1.6, dt);
    }

    sIdle(dt) {
      this.moving = false;
      this.lookAround(dt, 1.4);
      if (this.patrols && this.stateT > U.rand(4, 9)) {
        const room = this.game.map.roomAt(this.home[0], this.home[1]);
        if (room && room.floorCells.length) {
          const c = U.pick(room.floorCells);
          const w = this.game.map.w;
          if (this.setPath((c % w) + 0.5, ((c / w) | 0) + 0.5)) this.setState('PATROL');
        }
        this.stateT = 0;
      }
    }
    sPatrol(dt) {
      const r = this.followPath(dt, 1.3 * this.speedMul, true, 3);
      if (r !== 'moving') { this.clearPath(); this.setState('IDLE'); }
    }
    sSuspicious(dt) {
      this.moving = false;
      if (this.lastKnown) this.faceTowards(U.angleTo(this.x, this.y, this.lastKnown[0], this.lastKnown[1]), 3, dt);
      if (this.stateT > 1.4) {
        if (this.lastKnown && (this.type === 'aggressive' || this.type === 'tactical' || Math.random() < 0.4)) {
          this.setPath(this.lastKnown[0], this.lastKnown[1], { canUnlock: true });
          this.setState('INVESTIGATE');
        } else this.setState('ALERT');
      }
    }
    sInvestigate(dt) {
      const r = this.followPath(dt, 1.8 * this.speedMul, true, 4);
      if (r !== 'moving') {
        this.clearPath();
        this.lookAround(dt, 2.5);
        if (this.stateT > 6) this.setState('ALERT');
      }
      if (this.stateT > 14) { this.clearPath(); this.setState('ALERT'); }
    }
    sAlert(dt) {
      // hold an ambush angle towards the last known position or the nearest door
      this.moving = false;
      if (!this.ambushA || this.stateT < dt * 2) {
        const map = this.game.map;
        const room = map.roomAt(this.x, this.y);
        let a = this.angle;
        if (this.lastKnown) a = U.angleTo(this.x, this.y, this.lastKnown[0], this.lastKnown[1]);
        if (room && room.doors.length) {
          let bd = 1e9;
          for (const di of room.doors) {
            const d = map.doors[di];
            const dd = U.dist(this.x, this.y, d.cx, d.cy);
            if (dd < bd) { bd = dd; a = U.angleTo(this.x, this.y, d.cx, d.cy); }
          }
        }
        this.ambushA = a;
      }
      this.faceTowards(this.ambushA + Math.sin(this.stateT * 0.7 + this.id) * 0.35, 2.5, dt);
      if (this.stateT > 35) { this.ambushA = null; this.setState('IDLE'); }
    }
    sSearch(dt) {
      if (!this.lastKnown) { this.setState('ALERT'); return; }
      const r = this.followPath(dt, 2.0 * this.speedMul, true, 5);
      if (r !== 'moving') { this.clearPath(); this.lookAround(dt, 3); }
      if (this.stateT > 9) { this.clearPath(); this.ambushA = null; this.setState('ALERT'); }
    }
    sFlee(dt) {
      if (!this.path) {
        const dest = this.findFleeSpot();
        if (!dest || !this.setPath(dest[0], dest[1], { canUnlock: true })) { this.setState('HIDE'); return; }
      }
      const r = this.followPath(dt, 3.3 * this.speedMul, true, 8);
      if (r !== 'moving') { this.clearPath(); this.setState('HIDE'); }
      // cornered: fight
      if (this.seen && U.dist(this.x, this.y, this.seen.x, this.seen.y) < 3 && this.stateT > 1) { this.clearPath(); this.engage(this.seen, true); }
    }
    sHide(dt) {
      this.moving = false; this.crouch = true;
      this.lookAround(dt, 2);
      if (this.seen) {
        const d = U.dist(this.x, this.y, this.seen.x, this.seen.y);
        if (d < 6 || this.type !== 'nervous') this.engage(this.seen, true);
      }
    }
    findFleeSpot() {
      const map = this.game.map;
      let best = null, bs = -1e9;
      for (const room of map.rooms) {
        if (room.outside || !room.floorCells.length) continue;
        const c = U.pick(room.floorCells);
        const x = (c % map.w) + 0.5, y = ((c / map.w) | 0) + 0.5;
        let near = 1e9;
        for (const p of this.game.police) if (p.alive) near = Math.min(near, U.dist(x, y, p.x, p.y));
        const own = U.dist(x, y, this.x, this.y);
        const s = near - own * 0.35 + Math.random() * 2;
        if (own > 3 && s > bs) { bs = s; best = [x, y]; }
      }
      return best;
    }

    sCombat(dt) {
      let t = this.target;
      if (!t || !t.alive) {
        t = this.seen;
        if (!t) { this.target = null; this.setState('SEARCH'); if (this.lastKnown) this.setPath(this.lastKnown[0], this.lastKnown[1], { canUnlock: true }); return; }
        this.target = t;
      }
      // switch to the closest visible officer
      if (this.seen && this.seen !== t) {
        if (U.dist(this.x, this.y, this.seen.x, this.seen.y) + 1.5 < U.dist(this.x, this.y, t.x, t.y)) { this.target = t = this.seen; }
      }
      const canSee = this.seen === t || (t && this.canSeeQuick(t));
      const w = this.weapon;
      if (w.ammo <= 0 && !w.reloading) w.startReload(this);
      // flee on low morale
      if (this.T.fleeHp && this.hp < this.T.fleeHp && Math.random() < dt * 0.6 && this.type !== 'aggressive') {
        this.shout(U.pick(LINES.flee)); this.clearPath(); this.setState('FLEE'); return;
      }
      if (canSee) {
        this.lastKnown = [t.x, t.y]; this.lostT = 0;
        const aimA = U.angleTo(this.x, this.y, t.x, t.y);
        this.faceTowards(aimA, this.T.turn, dt);
        this.reactT -= dt;
        const d = U.dist(this.x, this.y, t.x, t.y);
        if (this.reactT <= 0 && Math.abs(U.angleDiff(this.angle, aimA)) < 0.18 && d < w.def.range) {
          this.nextShotT -= dt;
          if (this.nextShotT <= 0 && w.canFire()) {
            let spread = w.def.spread * this.T.accuracy + w.bloom * 0.6;
            if (t.moving) spread *= 1.2;
            if (t.moveSpeed > 4) spread *= 1.2;
            spread += Math.max(0, d - 8) * 0.12;
            TR.Combat.fire(this.game, this, w, this.angle, spread);
            if (w.def.auto) {
              if (this.burst <= 0) this.burst = U.randInt(3, 6);
              this.burst--;
              this.nextShotT = this.burst <= 0 ? U.rand(0.35, 0.85) : 0;
            } else this.nextShotT = U.rand(0.22, 0.5);
          }
        }
        // movement style
        if (this.type === 'aggressive') {
          if (d > 3.5 && this.stateT > 0.8) {
            this.repathT = (this.repathT || 0) - dt;
            if (!this.path || this.repathT <= 0) { this.repathT = 0.7; this.setPath(t.x, t.y, { canUnlock: true, force: true }); }
            this.followPath(dt, 2.0 * this.speedMul, false);
          } else this.moving = false;
        } else if (this.type === 'tactical' || this.type === 'leader') {
          this.coverT -= dt;
          if (this.coverT <= 0) {
            this.coverT = U.rand(2.5, 4.5);
            const c = this.findCover(t.x, t.y);
            if (c) this.setPath(c[0], c[1]);
          }
          if (this.path) { const r = this.followPath(dt, 2.6 * this.speedMul, false); if (r !== 'moving') this.clearPath(); }
          else this.moving = false;
        } else this.moving = false;
      } else {
        this.lostT += dt;
        this.moving = false;
        if (this.lastKnown) this.faceTowards(U.angleTo(this.x, this.y, this.lastKnown[0], this.lastKnown[1]), this.T.turn * 0.6, dt);
        if (this.path) { const r = this.followPath(dt, 2.4 * this.speedMul, false); if (r !== 'moving') this.clearPath(); }
        const hold = this.type === 'aggressive' ? 0.9 : this.type === 'nervous' ? 2.5 : U.rand(3, 6);
        if (this.lostT > hold) {
          this.lostT = 0;
          if (this.type === 'nervous' && Math.random() < 0.5) { this.clearPath(); this.setState('FLEE'); return; }
          this.target = null;
          this.ambushA = null;
          if (this.type === 'tactical' && Math.random() < 0.5) { this.setState('ALERT'); return; }
          this.setState('SEARCH');
          if (this.lastKnown) this.setPath(this.lastKnown[0], this.lastKnown[1], { canUnlock: true });
        }
      }
    }
    canSeeQuick(t) {
      return U.dist(this.x, this.y, t.x, t.y) < 13 && this.game.map.los(this.x, this.y, t.x, t.y) &&
        Math.abs(U.angleDiff(this.angle, U.angleTo(this.x, this.y, t.x, t.y))) < 1.1;
    }
    findCover(tx, ty) {
      const map = this.game.map;
      const cx = Math.floor(this.x), cy = Math.floor(this.y);
      let best = null, bs = 1e9;
      for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) {
        if (!map.inside(x, y)) continue;
        const i = map.idx(x, y);
        if (map.moveBlock[i] || map.doorAt[i] >= 0) continue;
        const px = x + 0.5, py = y + 0.5;
        const dT = U.dist(px, py, tx, ty);
        if (dT < 3) continue;
        // prefer spots next to half cover that the target can still see (peek positions) or fully hidden spots
        let adjCover = 0;
        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (map.inside(x + ddx, y + ddy) && map.lowCover[map.idx(x + ddx, y + ddy)]) adjCover = 1; }
        const visible = map.los(px, py, tx, ty);
        let s = U.dist(px, py, this.x, this.y) * 0.8;
        if (adjCover && visible) s -= 4; else if (!visible) s -= 2; else s += 4;
        s += Math.random();
        if (s < bs && map.findPath(this.x, this.y, px, py, { radius: 0.3 })) { bs = s; best = [px, py]; }
      }
      return best;
    }

    sHostage(dt) {
      const h = this.hostage;
      if (!h || !h.alive || !h.held) { this.hostage = null; if (this.seen) this.engage(this.seen, true); else this.setState('ALERT'); return; }
      const threat = this.seen || this.target;
      // stand behind the hostage relative to the threat
      let ax = h.x, ay = h.y, a = this.angle;
      if (threat) a = U.angleTo(h.x, h.y, threat.x, threat.y);
      const gx = ax - Math.cos(a) * 0.55, gy = ay - Math.sin(a) * 0.55;
      if (this.game.map.circleFree(gx, gy, this.r)) {
        const dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy);
        if (d > 0.05) this.moveVel(dx / d * Math.min(2, d * 6), dy / d * Math.min(2, d * 6), dt); else this.moving = false;
      }
      if (threat) this.faceTowards(U.angleTo(this.x, this.y, threat.x, threat.y), 5, dt);
      if (this.seen) {
        this.threatT += dt;
        if (this.threatT > 0.3 && (!this.bubble || this.bubble.t < 0.3) && Math.random() < dt * 1.2) this.shout(U.pick(LINES.hostage));
        const d = U.dist(this.x, this.y, this.seen.x, this.seen.y);
        this.executeT -= dt * (d < 4 ? 1.4 : 1);
        this.game.hostageTension = Math.max(this.game.hostageTension || 0, 1 - this.executeT / 7);
        if (this.executeT <= 0) {
          // executes the hostage
          const aimA = U.angleTo(this.x, this.y, h.x, h.y);
          this.angle = aimA;
          this.weapon.cooldown = 0;
          TR.Combat.fire(this.game, this, this.weapon, aimA, 0.2);
          TR.Combat.fire(this.game, this, this.weapon, aimA, 0.2);
          if (h.alive) h.takeDamage(200, this, { execution: true });
          this.hostage = null;
          this.engage(this.seen, true);
        }
      } else {
        this.threatT = 0;
        this.executeT = Math.min(7, this.executeT + dt * 0.3);
      }
    }

    updateSurrendered(dt) {
      this.moving = false;
      if (!this.fake || this.restrained) return;
      // fake surrender: when nobody is close and watching, draw a hidden weapon
      let watched = false;
      for (const p of this.game.police) {
        if (!p.alive) continue;
        const d = U.dist(p.x, p.y, this.x, this.y);
        if (d < 2.5 || (d < 7 && Math.abs(U.angleDiff(p.angle, U.angleTo(p.x, p.y, this.x, this.y))) < 0.35 && this.game.map.los(p.x, p.y, this.x, this.y))) watched = true;
      }
      if (!watched) this.fakeT -= dt;
      if (this.fakeT <= 0) {
        this.fake = false;
        this.surrendered = false;
        this.weapon = new TR.WeaponInst(D.weapons.e_pistol); this.weapon.reserve = 99;
        this.hasWeapon = true;
        this.shout(U.pick(LINES.fake));
        const target = this.perceive() || this.game.player;
        this.state = 'IDLE';
        this.engage(target, true);
      }
    }

    // --------------------------------------------------------------- events
    hear(ev) {
      if (!this.alive || this.restrained || this.surrendered || this.stunT > 0) return;
      if (ev.src && ev.src.faction === 'suspect') {
        if (ev.type === 'gunshot' && (this.state === 'IDLE' || this.state === 'PATROL')) { this.aware = true; this.lastKnown = [ev.x, ev.y]; this.setState('ALERT'); }
        return;
      }
      const loud = ev.type === 'gunshot' || ev.type === 'bang' || ev.type === 'kick' || ev.type === 'explosion';
      if (this.state === 'COMBAT' || this.state === 'HOSTAGE' || this.state === 'FLEE') {
        if (this.state === 'COMBAT' && !this.seen) this.lastKnown = [ev.x + U.rand(-1, 1), ev.y + U.rand(-1, 1)];
        return;
      }
      this.lastKnown = [ev.x + U.rand(-1.2, 1.2), ev.y + U.rand(-1.2, 1.2)];
      if (loud) {
        this.aware = true;
        if (this.type === 'nervous' && Math.random() < 0.35) { this.setState('FLEE'); this.clearPath(); return; }
        if (this.hostage && this.hostage.alive) { this.setState('HOSTAGE'); return; }
        if (this.type === 'aggressive' && Math.random() < 0.6) { this.setPath(this.lastKnown[0], this.lastKnown[1], { canUnlock: true }); this.setState('INVESTIGATE'); }
        else { this.ambushA = null; this.setState('ALERT'); }
        if (this.type === 'leader') { this.shout(U.pick(LINES.alert)); this.alertOthers(ev.x, ev.y, 16); }
      } else if (this.state === 'IDLE' || this.state === 'PATROL') {
        this.clearPath();
        this.setState('SUSPICIOUS');
      } else if (this.state === 'ALERT') {
        this.ambushA = U.angleTo(this.x, this.y, ev.x, ev.y);
      }
    }

    onYell(src) {
      if (!this.alive || this.restrained || this.surrendered) return;
      if (this.complyCd > 0) return;
      this.complyCd = 0.9;
      this.yellCount++;
      let p = this.T.comply;
      if (this.stunT > 0) p += 0.55;
      if (this.hp < this.maxHp * 0.6) p += 0.2;
      p += this.moraleBonus;
      let n = 0;
      for (const c of this.game.police) if (c.alive && U.dist(c.x, c.y, this.x, this.y) < 8 && this.game.map.los(c.x, c.y, this.x, this.y)) n++;
      p += 0.08 * Math.max(0, n - 1);
      if (Math.abs(U.angleDiff(src.angle, U.angleTo(src.x, src.y, this.x, this.y))) < 0.2) p += 0.1;
      p += 0.06 * (this.yellCount - 1);
      if (this.state === 'COMBAT' && this.stunT <= 0) p -= 0.08;
      if (this.hostage && this.hostage.alive) p -= 0.05;
      if (!this.aware) p += 0.1;
      p = U.clamp(p, 0.03, 0.95);
      if (Math.random() < p) this.surrender();
      else {
        if (!this.bubble || Math.random() < 0.5) this.shout(U.pick(LINES.refuse));
        if (this.hostage && this.hostage.alive) { this.executeT -= 1.2; this.setState('HOSTAGE'); return; }
        if (this.stunT <= 0 && this.state !== 'COMBAT') {
          if (this.type === 'nervous' && Math.random() < 0.4) { this.clearPath(); this.setState('FLEE'); }
          else this.engage(src, true);
        }
      }
    }
    surrender() {
      this.surrendered = true;
      this.clearPath();
      this.moving = false;
      this.setState('SURRENDER');
      this.shout(U.pick(LINES.surrender));
      if (this.hasWeapon) {
        this.game.dropWeapon(this);
        this.hasWeapon = false;
      }
      if (this.hostage) { this.hostage.release(); this.hostage = null; }
      this.game.onSurrender(this);
    }
    onStunned(t, kind) {
      if (kind === 'gas') {
        this.moraleBonus += 0.06;
        if (!this.bubble && Math.random() < 0.4) this.say(U.pick(LINES.cough), 1.2);
        if (this.hostage && this.hostage.alive && Math.random() < 0.3) { this.hostage.release(); this.hostage = null; }
        return;
      }
      if (this.hostage && this.hostage.alive) { this.hostage.release(); this.hostage = null; }
      if (kind === 'taser' || kind === 'impact') this.aware = true;
    }
    onDamaged(src, d) {
      if (this.hurtLineT <= 0) { this.hurtLineT = 3; if (Math.random() < 0.5) this.shout(U.pick(LINES.hurt)); }
      if (this.surrendered) return;
      this.moraleBonus += d / 250;
      if (src && src.faction === 'police') {
        if (this.hostage && this.hostage.alive && this.state === 'HOSTAGE') { this.executeT = Math.min(this.executeT, 0.8); return; }
        if (this.stunT <= 0) this.engage(src, true);
        if (this.type === 'nervous' && this.hp < this.T.fleeHp && Math.random() < 0.5) { this.clearPath(); this.setState('FLEE'); }
      }
    }
    die(src, info) {
      if (this.hostage) { this.hostage.release(); this.hostage = null; }
      if (this.hasWeapon) { this.game.dropWeapon(this); this.hasWeapon = false; }
      super.die(src, info);
    }
  }
  TR.Suspect = Suspect;
})(window.TR);
