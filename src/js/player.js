// Player controller: movement, aim, weapons, yell, interaction, equipment, drone.
(function (TR) {
  const U = TR.U, D = TR.D, I = TR.Input, t = (...a) => TR.t(...a);
  const TS = TR.TS;

  // ------------------------------------------------------------ recon drone
  class Drone {
    constructor(game, owner) {
      this.game = game; this.owner = owner; this.kind = 'drone';
      this.x = owner.x + Math.cos(owner.angle) * 0.5; this.y = owner.y + Math.sin(owner.angle) * 0.5;
      const r = game.map.resolveCircle(this.x, this.y, 0.16); this.x = r[0]; this.y = r[1];
      this.angle = owner.angle; this.r = 0.16; this.battery = 100; this.alive = true; this.buzzT = 0; this.spin = 0;
    }
    update(dt, controlled) {
      this.spin += dt * 40;
      if (!controlled) return;
      let mx = 0, my = 0;
      if (I.key('KeyW')) my -= 1; if (I.key('KeyS')) my += 1; if (I.key('KeyA')) mx -= 1; if (I.key('KeyD')) mx += 1;
      const l = Math.hypot(mx, my);
      if (l > 0) {
        const r = this.game.map.resolveCircle(this.x + mx / l * 3.6 * dt, this.y + my / l * 3.6 * dt, this.r);
        this.x = r[0]; this.y = r[1];
      }
      const m = this.game.camera.toWorld(I.mouse.x, I.mouse.y);
      if (isFinite(m[0])) this.angle = U.turnTowards(this.angle, U.angleTo(this.x, this.y, m[0], m[1]), 8 * dt);
      this.battery -= dt * 1.1;
      this.buzzT -= dt;
      if (this.buzzT <= 0) { this.buzzT = 1; this.game.noise(this.x, this.y, 3.5, 'step', this.owner); }
    }
    draw(g) {
      const x = this.x * TS, y = this.y * TS;
      g.save(); g.translate(x, y); g.rotate(this.angle);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(3, 4, 8, 8, 0, 0, 7); g.fill();
      g.strokeStyle = '#2a2e33'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(-5, -5); g.lineTo(5, 5); g.moveTo(-5, 5); g.lineTo(5, -5); g.stroke();
      for (const [px, py] of [[-5, -5], [5, 5], [-5, 5], [5, -5]]) {
        g.fillStyle = 'rgba(180,200,210,0.25)'; g.beginPath(); g.arc(px, py, 3.6, 0, 7); g.fill();
        g.strokeStyle = 'rgba(220,230,235,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px + Math.cos(this.spin) * 3.4, py + Math.sin(this.spin) * 3.4); g.lineTo(px - Math.cos(this.spin) * 3.4, py - Math.sin(this.spin) * 3.4); g.stroke();
      }
      g.fillStyle = '#3b4148'; g.fillRect(-3, -2.5, 6, 5);
      g.fillStyle = '#e8b04a'; g.fillRect(2, -1, 2, 2);
      g.restore();
      g.fillStyle = (Math.floor(performance.now() / 400) % 2) ? '#6fb3de' : '#2a4a5c'; g.beginPath(); g.arc(x, y - 9, 1.6, 0, 7); g.fill();
    }
  }
  TR.Drone = Drone;

  class Player extends TR.Character {
    constructor(game, x, y, loadout) {
      const arm = D.armor[loadout.armor] || D.armor.tactical;
      super(game, x, y, { kind: 'player', faction: 'police', hp: 100, armor: arm.armor, clothes: '#1d2430', helmet: true, color: '#5fa8e8', name: 'Alpha-1', angle: game.mission.playerFacing || 0, skin: '#c99a73' });
      this.armorDef = arm;
      this.head = D.headgear[loadout.headgear] || D.headgear.helmet;
      this.gasMask = !!this.head.gasImmune;
      this.vestColor = '#3a4232';
      const mods = loadout.mods || {};
      const pdef = D.weapons[loadout.primary] || D.weapons.ar15;
      this.shieldEquipped = !!(pdef && pdef.isShield);
      this.slots = [];
      if (!this.shieldEquipped) this.slots.push(new TR.WeaponInst(pdef, mods[pdef.id] || {}));
      const sdef = D.weapons[loadout.secondary] || D.weapons.px9;
      this.slots.push(new TR.WeaponInst(sdef, mods[sdef.id] || {}));
      this.slots.push(new TR.WeaponInst(D.weapons.taser, {}));
      this.slot = 0; this.weapon = this.slots[0]; this.hasWeapon = true;
      this.shield = this.shieldEquipped;
      const tac = D.tactical[loadout.tactical] || D.tactical.flash2;
      this.grenades = tac.gren.map(([type, count]) => ({ type, count }));
      this.grenSel = 0;
      const ut = D.utility[loadout.utility] || D.utility.charge1;
      this.charges = ut.charges; this.medkits = ut.medkits;
      const gad = loadout.gadget || 'lockpick';
      this.lockpick = gad === 'lockpick';
      this.wedges = gad === 'wedge3' ? 3 : 0;
      this.hasDrone = gad === 'drone';
      this.drone = null; this.droneCtl = false;
      this.switchT = 0; this.yellCd = 0;
      this.action = null; // channelled action {type, t, dur, target}
      this.blindT = 0; this.blindMax = 1;
      this.stepT = 0; this.gassedT = 0;
      this.mirror = null;
      this.aimX = x; this.aimY = y;
      this.sprinting = false; this.aiming = false;
    }
    get wdef() { return this.weapon.def; }
    get grenadeCount() { return this.grenades.reduce((s, g) => s + g.count, 0); }
    get curGrenade() {
      if (!this.grenades.length) return null;
      if (this.grenades[this.grenSel] && this.grenades[this.grenSel].count > 0) return this.grenades[this.grenSel];
      return this.grenades.find((g) => g.count > 0) || this.grenades[this.grenSel] || null;
    }

    switchTo(i) {
      if (i < 0 || i >= this.slots.length || i === this.slot) return;
      this.weapon.cancelReload(); this.weapon.reloading = false;
      this.slot = i; this.weapon = this.slots[i]; this.switchT = 0.35;
      this.shield = this.shieldEquipped && this.weapon.def.cat === 'pistol';
      TR.Audio.play('reload', this.x, this.y, { vol: 0.3 });
    }
    currentSpread() {
      const w = this.weapon;
      let spread = this.aiming ? w.def.ads : w.def.spread;
      if (w.mods.optic) spread *= this.aiming ? 0.65 : 1.1;
      if (w.mods.laser && !this.aiming) spread *= 0.75;
      spread += w.bloom * (this.aiming ? 0.55 : 0.8);
      if (this.moving) spread += this.aiming ? 0.6 : 1.8;
      if (this.stunT > 0) spread += 4;
      if (this.gassedT > 0) spread += 3;
      return spread;
    }

    update(dt) {
      this.baseUpdate(dt);
      if (!this.alive) return;
      const g = this.game;
      if (this.blindT > 0) this.blindT -= dt;
      if (this.switchT > 0) this.switchT -= dt;
      if (this.yellCd > 0) this.yellCd -= dt;
      if (this.gassedT > 0) this.gassedT -= dt;
      const w = this.weapon;

      // drone control
      if (I.hit('KeyT') && !g.wheelOpen) this.toggleDrone();
      if (this.drone) {
        this.drone.update(dt, this.droneCtl);
        if (this.drone.battery <= 0) { this.drone = null; this.droneCtl = false; g.hint(t('hint.droneBat')); }
      }
      if (this.droneCtl) { this.moving = false; return; }

      // aim
      const m = g.camera.toWorld(I.mouse.x, I.mouse.y);
      if (isFinite(m[0]) && isFinite(m[1])) { this.aimX = m[0]; this.aimY = m[1]; }
      const aimA = U.angleTo(this.x, this.y, this.aimX, this.aimY);
      if (!isFinite(this.angle)) this.angle = 0;
      this.angle = U.turnTowards(this.angle, aimA, (this.shield ? 7 : 16) * dt);
      this.aiming = I.mouse.down[2] && !g.wheelOpen;
      // movement
      let mx = 0, my = 0;
      if (I.key('KeyW')) my -= 1; if (I.key('KeyS')) my += 1;
      if (I.key('KeyA')) mx -= 1; if (I.key('KeyD')) mx += 1;
      const ml = Math.hypot(mx, my);
      this.sprinting = I.key('ShiftLeft') && ml > 0 && !this.aiming && !this.shield;
      const walk = I.key('ControlLeft') || I.key('AltLeft');
      let speed = 3.0 * this.armorDef.speed;
      if (this.sprinting) speed = 4.6 * this.armorDef.speed;
      if (this.aiming) speed = 1.8;
      if (walk) speed = Math.min(speed, 1.4);
      if (this.shield) speed *= 0.72;
      if (this.action && this.action.root) speed = 0;
      if (this.stunT > 0) speed *= 0.4;
      if (this.gassedT > 0) speed *= 0.8;
      if (ml > 0) { this.moveVel(mx / ml * speed, my / ml * speed, dt); } else { this.moving = false; this.moveSpeed = 0; }
      // footsteps (noise)
      if (this.moving) {
        this.stepT -= dt * this.moveSpeed;
        if (this.stepT <= 0) {
          this.stepT = 1.25;
          const loud = this.sprinting;
          TR.Audio.play('step', this.x, this.y, { vol: loud ? 0.7 : 0.45, loud, hard: true });
          g.noise(this.x, this.y, loud ? 7 : (walk ? 1.2 : 3.2), 'step', this);
          if (loud) g.fx.dust(this.x, this.y);
        }
      }
      if (g.wheelOpen || g.paused) return;

      // weapons
      if (I.hit('Digit1')) this.switchTo(0);
      if (I.hit('Digit2')) this.switchTo(1);
      if (I.hit('Digit3')) this.switchTo(2);
      if (I.wheel && I.key('ShiftLeft')) this.switchTo((this.slot + (I.wheel > 0 ? 1 : this.slots.length - 1)) % this.slots.length);
      if (I.hit('KeyR')) w.startReload(this);
      const trigger = w.def.auto ? I.mouse.down[0] : I.mouse.pressed[0];
      if (trigger && this.switchT <= 0 && !this.action && !this.sprinting) {
        if (TR.Combat.fire(g, this, w, this.angle, this.currentSpread())) {
          if (w.ammo === 0 && w.reserve > 0 && !w.def.taser) setTimeout(() => { if (this.alive && this.weapon === w) w.startReload(this); }, 150);
          if (w.def.taser && w.reserve > 0) w.startReload(this);
        }
      }
      if (I.mouse.pressed[0] && w.ammo === 0 && w.reserve > 0 && !w.reloading) w.startReload(this);

      // yell
      if (I.hit('Space') && this.yellCd <= 0) {
        this.yellCd = 0.9;
        const line = TR.L.pick('p.yell');
        this.say(line, 1.5);
        TR.Voice.say(line.toLowerCase(), { voice: 'police', pitch: 0.85, rate: 1.3, priority: 2 });
        g.yell(this);
        g.stats.yells++;
      }

      // grenades: C cycles the type, G throws
      if (I.hit('KeyC') && this.grenades.length > 1) { this.grenSel = (this.grenSel + 1) % this.grenades.length; TR.Audio.play('ui'); }
      if (I.hit('KeyG')) {
        const gr = this.curGrenade;
        if (gr && gr.count > 0) { gr.count--; g.throwGrenade(this, m[0], m[1], null, gr.type); }
        else g.hint(t('hint.noFlash'));
      }
      // medkit
      if (I.hit('KeyH')) {
        if (this.medkits > 0 && this.hp < this.maxHp) this.action = { type: 'medkit', t: 0, dur: 2.5, root: true };
        else if (this.medkits <= 0) g.hint(t('hint.noMed'));
      }

      this.updateInteraction(dt);
    }

    toggleDrone() {
      const g = this.game;
      if (!this.hasDrone) { g.hint(t('hint.noDrone')); return; }
      if (!this.drone) {
        if (this.droneUsed) { g.hint(t('hint.droneLost')); return; }
        this.drone = new Drone(g, this); this.droneUsed = true; this.droneCtl = true;
      } else this.droneCtl = !this.droneCtl;
      this.action = null; this.mirror = null;
      TR.Audio.play('ui');
    }

    // context-sensitive interaction (E / Q / F / B / V)
    updateInteraction(dt) {
      const g = this.game;
      const ctx = g.interactionContext();
      this.ctx = ctx;
      // channelled actions
      if (this.action) {
        const a = this.action;
        const holdKey = a.key;
        if (holdKey && !I.key(holdKey)) { this.action = null; this.mirror = null; return; }
        if (a.target && (a.target.alive === false || a.target.collected || a.target.restrained || U.dist(this.x, this.y, a.target.x, a.target.y) > 1.6)) { this.action = null; return; }
        a.t += dt;
        if (a.type === 'mirror') {
          this.mirror = { door: a.door, side: -a.door.side(this.x, this.y) };
          return;
        }
        if (a.type === 'lockpick' && Math.random() < dt * 4) TR.Audio.play('shell', this.x, this.y, { vol: 0.4 });
        if (a.t >= a.dur) {
          const tg = a.target;
          if (a.type === 'restrain') g.restrain(tg, this);
          else if (a.type === 'evidence') g.collect(tg, this);
          else if (a.type === 'medkit') { this.medkits--; this.hp = Math.min(this.maxHp, this.hp + 45); TR.Audio.play('medkit', this.x, this.y); g.fx.popup(this.x, this.y - 0.4, t('pop.hp'), '#7fd48a'); }
          else if (a.type === 'terminal') g.useTerminal(a.target, this);
          else if (a.type === 'charge') { this.charges--; g.addCharge(a.door, this, a.door.side(this.x, this.y)); }
          else if (a.type === 'lockpick') { a.door.locked = false; TR.Audio.play('cuff', a.door.cx, a.door.cy); g.hint(t('hint.unlocked')); }
          this.action = null;
        }
        return;
      }
      this.mirror = null;
      if (I.hit('KeyE') && ctx.primary) {
        const p = ctx.primary;
        if (p.type === 'restrain') this.action = { type: 'restrain', t: 0, dur: 1.2, target: p.target, key: 'KeyE', root: true };
        else if (p.type === 'evidence') this.action = { type: 'evidence', t: 0, dur: 0.6, target: p.target, key: 'KeyE', root: true };
        else if (p.type === 'terminal') this.action = { type: 'terminal', t: 0, dur: 1.0, target: p.target, key: 'KeyE', root: true };
        else if (p.type === 'lockpick') this.action = { type: 'lockpick', t: 0, dur: 3.2, door: p.target, key: 'KeyE', root: true };
        else if (p.type === 'door') {
          const d = p.target;
          if (d.wedged) { d.wedged = false; TR.Audio.play('doorClose', d.cx, d.cy, { vol: 0.4 }); }
          if (d.isOpen) { if (!d.close(g)) g.hint(t('hint.blocked')); }
          else if (!d.open(this.x, this.y)) { g.hint(t(this.lockpick ? 'hint.locked' : 'hint.lockedNoPick')); TR.Audio.play('kickFail', d.cx, d.cy, { vol: 0.25 }); }
        } else if (p.type === 'extract') g.requestExtract();
      }
      if (ctx.door && !ctx.door.isOpen) {
        if (I.hit('KeyQ')) this.action = { type: 'mirror', t: 0, dur: 99, door: ctx.door, key: 'KeyQ' };
        if (I.hit('KeyF')) g.playerKick(ctx.door);
        if (I.hit('KeyB')) {
          if (this.charges > 0) this.action = { type: 'charge', t: 0, dur: 1.2, door: ctx.door, key: 'KeyB', root: true };
          else g.hint(t('hint.noCharge'));
        }
        if (I.hit('KeyV')) {
          if (ctx.door.wedged) { /* already */ } else if (this.wedges > 0) { this.wedges--; ctx.door.wedged = true; TR.Audio.play('doorClose', ctx.door.cx, ctx.door.cy, { vol: 0.5 }); g.hint(t('hint.wedged')); }
          else g.hint(t('hint.noWedge'));
        }
      }
    }

    takeDamage(dmg, src, info) {
      return super.takeDamage(dmg * (this.head ? this.head.dmg : 1), src, info);
    }
    onDamaged(src, d) {
      this.game.onPlayerHurt(d, src);
    }
    stun(tm, kind) {
      // flashbangs blind the player instead of freezing him
      if (kind === 'flash') { const k = this.head && this.head.flashMul ? this.head.flashMul : 1; tm *= k; this.blindT = Math.max(this.blindT, tm); this.blindMax = this.blindT; this.stunT = Math.max(this.stunT, tm * 0.4); }
      else if (kind === 'gas') { if (!this.gasMask) this.gassedT = Math.max(this.gassedT, tm); }
      else super.stun(tm, kind);
    }
  }
  TR.Player = Player;
})(window.TR);
