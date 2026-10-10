// Firing, hitscan, grenades and explosives.
(function (TR) {
  const U = TR.U;
  const DEG = Math.PI / 180;

  const Combat = {
    // spreadDeg: final half-angle spread in degrees
    fire(game, shooter, w, aim, spreadDeg) {
      const def = w.def;
      if (w.reloading && def.shellReload && w.ammo > 0) w.cancelReload();
      if (!w.canFire()) {
        if (w.ammo <= 0 && w.cooldown <= 0 && !w.reloading) {
          if (shooter === game.player && TR.Input.mouse.pressed[0]) TR.Audio.play('dry', shooter.x, shooter.y);
          w.cooldown = 0.25;
        }
        return false;
      }
      w.ammo--;
      w.cooldown = 60 / def.rpm;
      w.bloom = Math.min(10, w.bloom + def.recoil);
      shooter.muzzleT = 0.06;
      const sup = w.suppressed;
      if (def.taser) TR.Audio.play('taser', shooter.x, shooter.y);
      else if (def.cat === 'shotgun' || def.cat === 'less') { TR.Audio.play('shotgun', shooter.x, shooter.y, { range: 26 }); setTimeout(() => TR.Audio.play('pump', shooter.x, shooter.y, { vol: 0.6 }), 260); }
      else TR.Audio.play('gun', shooter.x, shooter.y, { heavy: def.heavy, suppressed: sup, range: sup ? 10 : 24 });
      game.noise(shooter.x, shooter.y, def.noise * (sup ? 0.35 : 1), 'gunshot', shooter);
      let ox = shooter.x + Math.cos(aim) * 0.42, oy = shooter.y + Math.sin(aim) * 0.42;
      if (!game.map.los(shooter.x, shooter.y, ox, oy, game.map.bulletBlock)) { ox = shooter.x; oy = shooter.y; }
      const pellets = def.pellets || 1;
      for (let i = 0; i < pellets; i++) {
        const a = aim + U.gauss() * spreadDeg * DEG;
        this.hitscan(game, shooter, ox, oy, a, def, w);
      }
      if (!def.taser && def.cat !== 'shotgun' && def.cat !== 'less') game.fx.shell(shooter.x, shooter.y, aim);
      if (!sup && !def.taser) game.fx.muzzleLight(ox, oy);
      if (shooter === game.player) { game.shake(def.cat === 'shotgun' ? 0.35 : def.heavy * 0.14); game.stats.shots++; }
      return true;
    },

    hitscan(game, shooter, ox, oy, a, def, w) {
      const map = game.map;
      const dx = Math.cos(a), dy = Math.sin(a);
      const cover = [];
      const wallD = map.raycast(ox, oy, dx, dy, def.range, map.bulletBlock, cover);
      let best = null, bestT = wallD;
      for (const c of game.characters) {
        if (c === shooter || !c.alive) continue;
        const r = c.r * (c.kneel > 0.5 ? 0.85 : 1) + 0.03;
        const t = U.rayCircle(ox, oy, dx, dy, c.x, c.y, r);
        if (t > 0 && t < bestT) { bestT = t; best = c; }
      }
      let endT = bestT;
      let blocked = false;
      if (best) {
        // half cover near the target stops some shots
        for (const ct of cover) {
          if (ct < bestT && bestT - ct < 1.4 && ct > 0.9) { if (Math.random() < 0.5) { blocked = true; endT = ct; } break; }
        }
      }
      if (best && !blocked && best.shield) {
        const inc = U.angleDiff(best.angle, a + Math.PI);
        if (Math.abs(inc) < 1.2) {
          blocked = true;
          game.fx.sparks(ox + dx * bestT, oy + dy * bestT, a + Math.PI, 5);
          TR.Audio.play('ricochet', best.x, best.y);
        }
      }
      const ex = ox + dx * endT, ey = oy + dy * endT;
      if (def.taser) {
        game.fx.taserWire(shooter, ex, ey);
      } else game.fx.tracer(ox, oy, ex, ey, def.lessLethal ? 'rgba(255,170,90,' : null);

      if (best && !blocked) {
        if (def.taser) {
          best.stun(def.stun, 'taser');
          game.onLessLethal(best, shooter, def);
        } else if (def.lessLethal) {
          best.takeDamage(def.damage, shooter, { weapon: def, lessLethal: true });
          if (best.alive) { best.stun(def.stun, def.gas ? 'gas' : 'impact'); if (best.moraleBonus != null) best.moraleBonus += def.morale || 0.3; }
          if (def.gas) game.fx.puff(best.x, best.y);
          game.onLessLethal(best, shooter, def);
        } else {
          let dmg = def.damage * (w && w.suppressed ? 0.92 : 1);
          const fall = U.clamp((bestT - def.range * 0.6) / (def.range * 0.4), 0, 1);
          dmg *= 1 - fall * 0.35;
          const wasThreat = best.isThreat ? best.isThreat() : false;
          const wasCompliant = best.surrendered || best.restrained || best.stunT > 0 || (best.kind === 'enemy' && !best.hasWeapon);
          const dealt = best.takeDamage(dmg, shooter, { weapon: def, dir: a, wasThreat, wasCompliant });
          game.fx.blood(best.x, best.y, a, dmg);
          game.onHit(best, shooter, dealt, { wasThreat, wasCompliant });
          TR.Audio.play('hit', best.x, best.y, { vol: 0.6 });
        }
      } else if (endT < def.range - 0.01) {
        game.fx.sparks(ex - dx * 0.05, ey - dy * 0.05, a + Math.PI, 3);
        game.fx.bulletHole(ex - dx * 0.04, ey - dy * 0.04);
        if (Math.random() < 0.18) TR.Audio.play('ricochet', ex, ey, { vol: 0.5 });
      }
    }
  };

  // ------------------------------------------------ thrown flashbang
  class Grenade {
    constructor(game, thrower, tx, ty, type) {
      this.game = game; this.thrower = thrower; this.type = type || 'flash';
      this.x = thrower.x + Math.cos(thrower.angle) * 0.35; this.y = thrower.y + Math.sin(thrower.angle) * 0.35;
      const d = Math.min(U.dist(this.x, this.y, tx, ty), 9);
      const a = U.angleTo(this.x, this.y, tx, ty);
      const sp = 3.2 + d * 1.35;
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      this.fuse = 1.45; this.dead = false; this.spin = 0; this.z = 0;
      TR.Audio.play('pin', thrower.x, thrower.y);
    }
    update(dt) {
      const map = this.game.map;
      this.fuse -= dt;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const h = dt / sub;
        const nx = this.x + this.vx * h;
        if (map.isMoveBlocked(Math.floor(nx), Math.floor(this.y)) && !this.throughOpenDoor(nx, this.y)) { this.vx *= -0.45; this.bounce(); } else this.x = nx;
        const ny = this.y + this.vy * h;
        if (map.isMoveBlocked(Math.floor(this.x), Math.floor(ny)) && !this.throughOpenDoor(this.x, ny)) { this.vy *= -0.45; this.bounce(); } else this.y = ny;
      }
      const fr = Math.pow(0.12, dt);
      this.vx *= fr; this.vy *= fr;
      this.spin += Math.hypot(this.vx, this.vy) * dt * 3;
      if (this.fuse <= 0) { this.dead = true; this.game.detonate(this.type, this.x, this.y, this.thrower); }
    }
    throughOpenDoor() { return false; }
    bounce() { if (Math.hypot(this.vx, this.vy) > 0.8) TR.Audio.play('bounce', this.x, this.y); }
    draw(g) {
      const TS = TR.TS;
      g.save(); g.translate(this.x * TS, this.y * TS); g.rotate(this.spin);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(-3, -1, 8, 6);
      g.fillStyle = { flash: '#3b4a3a', stinger: '#2f3f5a', cs: '#6a5a2a', smoke: '#5a5f63' }[this.type] || '#3b4a3a'; g.fillRect(-4, -2.5, 8, 5);
      g.fillStyle = '#c9c9c9'; g.fillRect(3, -1.5, 2, 3);
      g.restore();
      if (this.fuse < 0.4) { g.fillStyle = 'rgba(255,80,60,0.8)'; g.beginPath(); g.arc(this.x * TS, this.y * TS, 2, 0, 7); g.fill(); }
    }
  }
  TR.Grenade = Grenade;

  // ------------------------------------------------ placed breach charge
  class BreachCharge {
    constructor(game, door, owner, side) {
      this.game = game; this.door = door; this.owner = owner; this.side = side;
      const p = door.sidePoint(side, 0.28);
      this.x = p[0]; this.y = p[1];
      this.fuse = 2.2; this.dead = false;
      TR.Audio.play('charge', this.x, this.y);
    }
    update(dt) {
      const before = this.fuse;
      this.fuse -= dt;
      if (Math.floor(before * 3) !== Math.floor(this.fuse * 3) && this.fuse > 0) TR.Audio.play('charge', this.x, this.y, { vol: 0.5 });
      if (this.fuse <= 0) { this.dead = true; this.game.explodeDoor(this.door, this.side, this.owner); }
    }
    draw(g) {
      const TS = TR.TS;
      g.fillStyle = '#252a22'; g.fillRect(this.x * TS - 6, this.y * TS - 4, 12, 8);
      g.fillStyle = (Math.floor(this.fuse * 6) % 2) ? '#ff4b3a' : '#551a14'; g.fillRect(this.x * TS - 1.5, this.y * TS - 1.5, 3, 3);
    }
  }
  TR.BreachCharge = BreachCharge;

  TR.Combat = Combat;
})(window.TR);
