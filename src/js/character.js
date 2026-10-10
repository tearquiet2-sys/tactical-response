// Base character + weapon instance. Player, officers, suspects and civilians extend Character.
(function (TR) {
  const U = TR.U;
  const TS = TR.TS;
  let NEXT_ID = 1;

  class WeaponInst {
    constructor(def, mods) {
      this.def = def; this.mods = mods || {};
      this.magSize = Math.round(def.mag * (this.mods.extmag ? 1.34 : 1));
      this.ammo = this.magSize;
      this.reserve = this.magSize * ((def.mags || 4) - 1);
      this.cooldown = 0; this.reloadT = 0; this.bloom = 0;
      this.reloading = false;
    }
    get suppressed() { return !!this.mods.suppressor; }
    startReload(owner) {
      if (this.reloading || this.ammo >= this.magSize || this.reserve <= 0) return false;
      this.reloading = true;
      this.reloadT = this.def.shellReload ? this.def.reload : this.def.reload * (this.mods.extmag ? 1.2 : 1);
      TR.Audio.play('reload', owner.x, owner.y, { vol: 0.8 });
      if (TR.game) TR.game.noise(owner.x, owner.y, 4, 'reload', owner);
      return true;
    }
    cancelReload() { if (this.def.shellReload) this.reloading = false; }
    update(dt, owner) {
      if (this.cooldown > 0) this.cooldown -= dt;
      this.bloom = Math.max(0, this.bloom - (this.def.recover || 10) * dt);
      if (this.reloading) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          if (this.def.shellReload) {
            this.ammo++; this.reserve--;
            TR.Audio.play('shell', owner.x, owner.y, { vol: 0.6 });
            if (this.ammo < this.magSize && this.reserve > 0) this.reloadT = this.def.reload; else this.reloading = false;
          } else {
            const need = this.magSize - this.ammo;
            const take = Math.min(need, this.reserve);
            this.ammo += take; this.reserve -= take;
            this.reloading = false;
          }
        }
      }
    }
    canFire() { return !this.reloading && this.cooldown <= 0 && this.ammo > 0; }
  }
  TR.WeaponInst = WeaponInst;

  class Character {
    constructor(game, x, y, opts) {
      this.id = NEXT_ID++;
      this.game = game;
      this.x = x; this.y = y; this.r = 0.3;
      this.angle = opts.angle || 0;
      this.kind = opts.kind; this.faction = opts.faction;
      this.maxHp = opts.hp || 100; this.hp = this.maxHp;
      this.maxArmor = opts.armor || 0; this.armor = this.maxArmor;
      this.alive = true; this.body = false;
      this.name = opts.name || '';
      this.clothes = opts.clothes || '#555'; this.skin = opts.skin || '#c99a73'; this.hair = opts.hair || '#222';
      this.helmet = !!opts.helmet;
      this.color = opts.color || null;
      this.weapon = null;
      this.stunT = 0; this.stunKind = '';
      this.surrendered = false; this.restrained = false;
      this.hasWeapon = false;
      this.speedMul = 1;
      this.path = null; this.pathIdx = 0; this.pathGoal = null; this.pathT = 0; this.stuckT = 0; this.lastPos = [x, y];
      this.bubble = null;
      this.visibleToTeam = false; this.lastSeenT = -99; this.ghost = null;
      this.moving = false; this.moveSpeed = 0;
      this.walkPhase = Math.random() * 6;
      this.crouch = false;
      this.hitFlash = 0;
      this.shield = false;
      this.muzzleT = 0;
      this.restrainProgress = 0;
      this.damagedBy = null;
      this.kneel = 0;
    }
    get isPolice() { return this.faction === 'police'; }
    get active() { return this.alive && !this.restrained; }
    say(text, dur) { this.bubble = { text, t: dur || 2.2, max: dur || 2.2 }; }

    baseUpdate(dt) {
      if (this.bubble) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
      if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);
      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.muzzleT > 0) this.muzzleT -= dt;
      if (this.weapon) this.weapon.update(dt, this);
      const targetK = (this.surrendered || this.restrained) ? 1 : 0;
      this.kneel += (targetK - this.kneel) * Math.min(1, dt * 6);
    }

    // ---- movement ----
    moveVel(vx, vy, dt) {
      const nx = this.x + vx * dt, ny = this.y + vy * dt;
      const r = this.game.map.resolveCircle(nx, ny, this.r);
      this.x = r[0]; this.y = r[1];
      const sp = Math.hypot(vx, vy);
      this.moving = sp > 0.1; this.moveSpeed = sp;
      if (this.moving) this.walkPhase += dt * sp * 3.2;
    }
    faceTowards(a, rate, dt) { this.angle = U.turnTowards(this.angle, a, rate * dt); }

    setPath(tx, ty, opts) {
      opts = opts || {};
      if (!opts.force && this.pathGoal && U.dist(this.pathGoal[0], this.pathGoal[1], tx, ty) < 0.25 && this.path) return !!this.path;
      const p = this.game.map.findPath(this.x, this.y, tx, ty, { canUnlock: opts.canUnlock, radius: this.r + 0.02, avoid: opts.avoid, police: this.faction === 'police' });
      this.path = p; this.pathIdx = 0; this.pathGoal = [tx, ty]; this.stuckT = 0;
      return !!p;
    }
    clearPath() { this.path = null; this.pathGoal = null; }
    // returns 'moving' | 'arrived' | 'blocked' | 'nopath'
    followPath(dt, speed, faceMove, turnRate) {
      if (!this.path) return 'nopath';
      if (this.pathIdx >= this.path.length) { this.moving = false; return 'arrived'; }
      const wp = this.path[this.pathIdx];
      const map = this.game.map;
      const ci = map.idx(Math.floor(wp[0]), Math.floor(wp[1]));
      const di = map.doorAt[ci];
      if (di >= 0) {
        const door = map.doors[di];
        if (!door.isOpen) {
          const dd = U.dist(this.x, this.y, door.cx, door.cy);
          if (dd < 1.15) {
            if (!this.tryOpenDoor(door)) { this.moving = false; return 'blocked'; }
            this.doorWait = 0.25;
          }
        }
      }
      if (this.doorWait > 0) { this.doorWait -= dt; this.moving = false; return 'moving'; }
      const dx = wp[0] - this.x, dy = wp[1] - this.y;
      const d = Math.hypot(dx, dy);
      const last = this.pathIdx === this.path.length - 1;
      if (d < (last ? 0.12 : 0.28)) { this.pathIdx++; if (this.pathIdx >= this.path.length) { this.moving = false; return 'arrived'; } return 'moving'; }
      let sp = speed;
      if (last && d < 0.6) sp = Math.max(0.8, speed * d / 0.6);
      const vx = dx / d * sp, vy = dy / d * sp;
      this.moveVel(vx, vy, dt);
      if (faceMove) this.faceTowards(Math.atan2(dy, dx), turnRate || 8, dt);
      // stuck detection
      this.pathT += dt;
      if (this.pathT > 0.6) {
        const moved = U.dist(this.x, this.y, this.lastPos[0], this.lastPos[1]);
        this.lastPos = [this.x, this.y]; this.pathT = 0;
        if (moved < 0.08) {
          this.stuckT++;
          if (this.stuckT > 2) {
            const g = this.pathGoal;
            this.clearPath();
            if (g) this.setPath(g[0], g[1], { force: true });
            if (this.stuckT > 5) return 'blocked';
          }
        } else this.stuckT = 0;
      }
      return 'moving';
    }
    tryOpenDoor(door) { return door.open(this.x, this.y, this); }

    // ---- damage ----
    takeDamage(dmg, src, info) {
      if (!this.alive) return;
      info = info || {};
      this.hitFlash = 0.12;
      let d = dmg;
      if (this.armor > 0 && !info.ignoreArmor) {
        const absorbed = Math.min(this.armor, d * 0.55);
        this.armor -= absorbed * 1.1;
        if (this.armor < 0) this.armor = 0;
        d -= absorbed;
      }
      this.hp -= d;
      this.damagedBy = src;
      if (this.hp <= 0) { this.hp = 0; this.die(src, info); }
      else this.onDamaged(src, d, info);
      return d;
    }
    onDamaged() { }
    die(src, info) {
      this.alive = false; this.body = true;
      this.moving = false; this.clearPath();
      this.game.onDeath(this, src, info || {});
    }
    stun(t, kind) {
      if (!this.alive) return;
      this.stunT = Math.max(this.stunT, t); this.stunKind = kind || 'flash';
      this.onStunned(t, kind);
    }
    onStunned() { }

    // ---- rendering ----
    draw(g) {
      const px = this.x * TS, py = this.y * TS;
      g.save();
      g.translate(px, py);
      if (!this.alive) { this.drawBody(g); g.restore(); return; }
      // team ring
      if (this.color) {
        g.strokeStyle = this.color; g.globalAlpha = 0.75; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      }
      g.rotate(this.angle);
      const kScale = 1 - this.kneel * 0.1;
      g.scale(kScale, kScale);
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(2, 3, 9, 11, 0, 0, Math.PI * 2); g.fill();
      const sway = this.moving ? Math.sin(this.walkPhase) * 1.4 : 0;
      // feet (stride animation)
      if (this.kneel < 0.5) {
        const st = this.moving ? Math.sin(this.walkPhase) * 4.5 : 0;
        g.fillStyle = '#16181b';
        g.beginPath(); g.ellipse(st, -3.6, 3.4, 2.1, 0, 0, 7); g.ellipse(-st, 3.6, 3.4, 2.1, 0, 0, 7); g.fill();
      }
      const sleeve = U.colorShade(this.clothes, -0.12);
      const handsUp = this.surrendered && !this.restrained;
      const cuffed = this.restrained;
      const wdef = this.weapon && this.hasWeapon ? this.weapon.def : null;
      const stunned = this.stunT > 0;
      g.lineCap = 'round';
      if (cuffed) {
        g.strokeStyle = sleeve; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(-1, -7); g.lineTo(-7, -2); g.moveTo(-1, 7); g.lineTo(-7, 2); g.stroke();
        g.fillStyle = '#d9d9d9'; g.fillRect(-9, -2, 3, 4);
      } else if (handsUp) {
        g.strokeStyle = sleeve; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(0, -7); g.lineTo(3, -11); g.moveTo(0, 7); g.lineTo(3, 11); g.stroke();
        g.fillStyle = this.skin; g.beginPath(); g.arc(4, -11.5, 2.4, 0, 7); g.arc(4, 11.5, 2.4, 0, 7); g.fill();
      } else if (wdef) {
        const len = (wdef.len || 10);
        const pistol = wdef.cat === 'pistol' || wdef.taser;
        const recoil = this.muzzleT > 0 ? -1.5 : 0;
        if (pistol) {
          g.strokeStyle = sleeve; g.lineWidth = 4.5;
          g.beginPath(); g.moveTo(0, -7); g.lineTo(9 + recoil, -1); g.moveTo(0, 7); g.lineTo(9 + recoil, 1); g.stroke();
          g.fillStyle = wdef.taser ? '#e0c02a' : '#1a1b1d';
          g.fillRect(8 + recoil, -1.6, len, 3.2);
          g.fillStyle = this.skin; g.beginPath(); g.arc(9 + recoil, 0, 2.6, 0, 7); g.fill();
        } else {
          g.fillStyle = '#18191b';
          g.fillRect(-1 + recoil, 1.5, len + 5, 3.4);
          if (wdef.cat === 'shotgun' || wdef.cat === 'less') { g.fillStyle = wdef.lessLethal ? '#c76a1f' : '#3a3024'; g.fillRect(6 + recoil, 1.4, 7, 3.6); }
          if (this.weapon.mods && this.weapon.mods.suppressor) { g.fillStyle = '#2c2d30'; g.fillRect(len + 3 + recoil, 1.8, 6, 2.8); }
          g.strokeStyle = sleeve; g.lineWidth = 4.5;
          g.beginPath(); g.moveTo(0, -7); g.lineTo(10 + recoil, 2.5); g.moveTo(0, 7); g.lineTo(2 + recoil, 4); g.stroke();
          g.fillStyle = this.skin; g.beginPath(); g.arc(10 + recoil, 2.8, 2.4, 0, 7); g.arc(2.5 + recoil, 4.2, 2.4, 0, 7); g.fill();
        }
        if (this.muzzleT > 0 && !this.weapon.suppressed && !wdef.taser) {
          const mx = (pistol ? 8 + len : len + 4), my = pistol ? 0 : 3;
          g.fillStyle = 'rgba(255,220,120,0.95)';
          g.beginPath(); g.moveTo(mx, my - 3); g.lineTo(mx + 11 + Math.random() * 5, my); g.lineTo(mx, my + 3); g.fill();
          g.fillStyle = 'rgba(255,255,220,0.9)'; g.beginPath(); g.arc(mx + 1, my, 2.6, 0, 7); g.fill();
        }
      } else {
        // unarmed arms, swinging when walking
        g.strokeStyle = sleeve; g.lineWidth = 4.5;
        g.beginPath(); g.moveTo(0, -7); g.lineTo(3 + sway * 2, -8.5); g.moveTo(0, 7); g.lineTo(3 - sway * 2, 8.5); g.stroke();
        g.fillStyle = this.skin; g.beginPath(); g.arc(4 + sway * 2, -8.5, 2.3, 0, 7); g.arc(4 - sway * 2, 8.5, 2.3, 0, 7); g.fill();
      }
      // torso / shoulders
      g.fillStyle = this.clothes;
      g.beginPath(); g.ellipse(0, 0, 6.2, 9.6, 0, 0, Math.PI * 2); g.fill();
      if (this.isPolice) {
        g.fillStyle = this.vestColor || '#3b4232';
        g.beginPath(); g.ellipse(0.5, 0, 5.2, 7.4, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-3, -5, 2, 10);
        g.fillStyle = this.color || '#6fa7d8'; g.fillRect(-4.5, -8.6, 3, 2.2);
      }
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.ellipse(1.5, -2, 3, 6, 0, 0, Math.PI * 2); g.fill();
      // head
      if (this.helmet) {
        g.fillStyle = '#23272c'; g.beginPath(); g.arc(0.5, 0, 5.4, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(-0.5, -1.5, 2.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111'; g.fillRect(4, -3, 1.6, 6);
      } else {
        g.fillStyle = this.skin; g.beginPath(); g.arc(1, 0, 4.8, 0, Math.PI * 2); g.fill();
        g.fillStyle = this.hair; g.beginPath(); g.arc(-0.2, 0, 4.9, Math.PI * 0.55, Math.PI * 1.45); g.fill();
        g.beginPath(); g.ellipse(-0.8, 0, 3.6, 4.6, 0, 0, Math.PI * 2); g.fill();
      }
      // shield
      if (this.shield) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(12, -11, 5, 23);
        g.fillStyle = '#2d3238'; g.fillRect(11, -12, 4.5, 24);
        g.fillStyle = '#8fb6d0'; g.fillRect(12, -3, 2.5, 6);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(11, -12, 1.2, 24);
      }
      if (this.hitFlash > 0) { g.fillStyle = 'rgba(255,60,40,0.5)'; g.beginPath(); g.ellipse(0, 0, 7, 10, 0, 0, 7); g.fill(); }
      g.restore();
      if (stunned) {
        const t = performance.now() / 150;
        g.fillStyle = this.stunKind === 'taser' ? '#8fd3ff' : '#ffe07a';
        for (let i = 0; i < 3; i++) {
          const a = t + i * 2.1;
          g.beginPath(); g.arc(px + Math.cos(a) * 9, py - 16 + Math.sin(a) * 3, 1.8, 0, 7); g.fill();
        }
      }
    }
    drawBody(g) {
      g.rotate(this.angle + (this.deathRot || 0.6));
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(2, 2, 13, 9, 0, 0, 7); g.fill();
      const c = U.colorShade(this.clothes, -0.35);
      g.strokeStyle = c; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-2, -6); g.lineTo(-10, -12); g.moveTo(2, 6); g.lineTo(9, 11); g.moveTo(-6, 2); g.lineTo(-15, 5); g.moveTo(-6, -1); g.lineTo(-15, -3); g.stroke();
      g.fillStyle = c; g.beginPath(); g.ellipse(-2, 0, 7, 9, 0, 0, 7); g.fill();
      if (this.isPolice) { g.fillStyle = '#2c3126'; g.beginPath(); g.ellipse(-1.5, 0, 5, 7, 0, 0, 7); g.fill(); }
      g.fillStyle = this.helmet ? '#1c1f23' : U.colorShade(this.skin, -0.3);
      g.beginPath(); g.arc(7, 0, 4.6, 0, 7); g.fill();
    }
  }
  TR.Character = Character;
})(window.TR);
