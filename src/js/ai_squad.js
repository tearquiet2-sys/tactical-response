// Squad officers + SquadManager (GDD 24-26): follow, hold, move, stack, breach & clear, cover, restrain.
(function (TR) {
  const U = TR.U, D = TR.D;

  // radio / shout lines come from the language files ('q.<key>')
  const L = new Proxy({}, { get: (_, k) => TR.L.raw('q.' + String(k)) });
  const tq = (k) => TR.t('q.' + k);

  class Officer extends TR.Character {
    constructor(game, x, y, op, idx) {
      super(game, x, y, { kind: 'team', faction: 'police', hp: 100, armor: 100, clothes: '#222a35', helmet: true, color: op.color, name: op.call, skin: U.pick(D.skin), angle: game.mission.playerFacing || 0 });
      this.op = op; this.idx = idx;
      this.weapon = new TR.WeaponInst(D.weapons[op.weapon]);
      this.weapon.reserve = 400;
      this.hasWeapon = true;
      this.flash = op.flash; this.charges = op.charges;
      this.order = { type: 'follow' };
      this.threat = null; this.reactT = 0; this.yellCd = U.rand(0, 1); this.burst = 0; this.shotT = 0;
      this.watchA = this.angle;
      this.task = null; // restrain task
      this.perceiveT = Math.random() * 0.1;
      this.visible = [];
      this.status = 'FOLLOW';
      this.hurtT = 0;
    }
    radio(text) { this.game.radio(this, text); }

    canSee(c) {
      const d = U.dist(this.x, this.y, c.x, c.y);
      if (d > 22) return false;
      if (d > 3) {
        const diff = Math.abs(U.angleDiff(this.angle, U.angleTo(this.x, this.y, c.x, c.y)));
        if (diff > 1.3) return false;
      }
      return this.game.map.los(this.x, this.y, c.x, c.y);
    }
    perceive() {
      this.visible = [];
      for (const e of this.game.npcs) if (e.alive && !e.restrained && this.canSee(e)) this.visible.push(e);
    }
    // is the line to target free of friendlies / civilians?
    clearShot(t) {
      const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
      for (const c of this.game.characters) {
        if (c === this || c === t || !c.alive) continue;
        if (c.faction === 'suspect' && c.isThreat && c.isThreat()) continue;
        const tt = U.rayCircle(this.x, this.y, dx / d, dy / d, c.x, c.y, c.r + 0.18);
        if (tt > 0 && tt < d) return false;
      }
      return true;
    }

    update(dt) {
      this.baseUpdate(dt);
      if (!this.alive) return;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.stunT > 0) { this.moving = false; return; }
      this.yellCd -= dt;
      this.perceiveT -= dt;
      if (this.perceiveT <= 0) { this.perceiveT = 0.12; this.perceive(); }

      // ---- threat assessment
      let shootT = null, sd = 1e9, yellT = null, yd = 1e9, restrainT = null, rd = 1e9;
      for (const e of this.visible) {
        const d = U.dist(this.x, this.y, e.x, e.y);
        if (e.faction === 'suspect') {
          if (e.isThreat()) {
            const facingMe = Math.abs(U.angleDiff(e.angle, U.angleTo(e.x, e.y, this.x, this.y))) < 0.7;
            const awareState = e.state === 'ALERT' || e.state === 'SEARCH' || e.state === 'INVESTIGATE' || e.state === 'SUSPICIOUS';
            const hostile = e.state === 'COMBAT' || e.state === 'HOSTAGE' || e.muzzleT > 0 || e.state === 'HIDE' || (awareState && facingMe && d < 12);
            if (hostile && d < sd) { sd = d; shootT = e; }
            else if (d < 11 && d < yd) { yd = d; yellT = e; }
          } else if ((e.surrendered || e.stunT > 0) && !e.restrained && d < rd) { rd = d; restrainT = e; }
          if (e.isThreat() && d < yd && d < 11) { yd = d; yellT = e; }
        } else if (e.faction === 'civilian') {
          if (!e.surrendered && e.state !== 'HELD' && d < 10 && d < yd) { yd = d; yellT = e; }
          else if (e.surrendered && e.state === 'COMPLIANT' && d < rd) { rd = d; restrainT = e; }
        }
      }
      if (shootT && shootT !== this.threat) {
        this.threat = shootT; this.reactT = U.rand(0.22, 0.4) * (this.op.id === 'grant' ? 0.9 : 1);
        if (Math.random() < 0.4 && this.game.radioCd <= 0) this.radio(U.pick(L.contact));
      }
      if (!shootT) this.threat = null;
      if (yellT && this.yellCd <= 0 && !this.threat) {
        this.yellCd = U.rand(1.8, 2.6);
        const line = yellT.faction === 'suspect' ? U.pick(L.yellSus) : U.pick(L.yellCiv);
        this.say(line);
        if (U.dist(this.x, this.y, this.game.player.x, this.game.player.y) < 14) TR.Voice.say(line, { voice: 'police', pitch: 0.9 + this.idx * 0.08, rate: 1.3, vol: 0.6 });
        this.game.yell(this);
      }

      // ---- combat (officers can shoot while moving)
      let aiming = false;
      if (this.threat) {
        const t = this.threat;
        const a = U.angleTo(this.x, this.y, t.x, t.y);
        this.faceTowards(a, 10, dt);
        aiming = true;
        this.reactT -= dt;
        const w = this.weapon;
        if (w.ammo <= 0) w.startReload(this);
        if (this.reactT <= 0 && Math.abs(U.angleDiff(this.angle, a)) < 0.09 && this.clearShot(t)) {
          this.shotT -= dt;
          if (this.shotT <= 0 && w.canFire()) {
            const spread = (w.def.cat === 'shotgun' ? w.def.spread * 0.8 : 1.3) + w.bloom * 0.4 + (this.moving ? 1 : 0);
            TR.Combat.fire(this.game, this, w, this.angle, spread);
            this.burst++;
            if (this.burst >= (w.def.auto ? 3 : 1)) { this.burst = 0; this.shotT = w.def.auto ? U.rand(0.18, 0.3) : U.rand(0.25, 0.4); } else this.shotT = 0;
          }
        }
      } else if (this.weapon.ammo < this.weapon.magSize * 0.4 && !this.weapon.reloading) this.weapon.startReload(this);

      // ---- restrain task (auto when safe)
      if (!this.threat && !this.task && restrainT && rd < 7 && this.order.type !== 'plan' && this.order.type !== 'move' && !restrainT.claimedBy) {
        this.task = { type: 'restrain', target: restrainT, t: 0 }; restrainT.claimedBy = this;
      }
      if (this.task) { if (this.doTask(dt, aiming)) return; }

      // ---- orders
      const o = this.order;
      switch (o.type) {
        case 'follow': this.status = 'FOLLOW'; this.doFollow(dt, aiming); break;
        case 'hold': this.status = 'HOLD'; this.moving = false; if (!aiming) this.faceTowards(o.watch != null ? o.watch + Math.sin(performance.now() / 1400 + this.idx) * 0.3 : this.angle, 3, dt); break;
        case 'move': case 'plan': {
          this.status = o.label || (o.type === 'move' ? 'MOVE' : 'STACK');
          if (o.delay && o.delay > 0) { o.delay -= dt; this.moving = false; if (!aiming && o.face != null) this.faceTowards(o.face, 5, dt); break; }
          if (!o.arrived) {
            if (!this.path || !this.pathGoal || U.dist(this.pathGoal[0], this.pathGoal[1], o.x, o.y) > 0.2) this.setPath(o.x, o.y, { force: true });
            const sp = o.fast ? 3.6 : (U.dist(this.x, this.y, o.x, o.y) > 5 ? 3.6 : 2.8);
            const r = this.followPath(dt, sp, !aiming, 9);
            if (r === 'arrived' || U.dist(this.x, this.y, o.x, o.y) < 0.2) { o.arrived = true; this.clearPath(); }
            else if (r === 'blocked' || r === 'nopath') { o.arrived = true; o.failed = true; this.clearPath(); }
            // keep eyes on the likely threat direction while moving in a plan
            if (!aiming && o.type === 'plan' && o.lookWhileMoving != null && U.dist(this.x, this.y, o.x, o.y) < 3) this.faceTowards(o.lookWhileMoving, 7, dt);
          } else {
            this.moving = false;
            if (!aiming && o.face != null) this.faceTowards(o.face + (o.sweep ? Math.sin(performance.now() / 900 + this.idx * 2) * 0.5 : 0), 6, dt);
            if (o.type === 'move' && !o.holdAfter) { /* stays */ }
          }
          break;
        }
        case 'cover': this.status = 'COVER'; this.moving = false; if (!aiming) this.faceTowards(U.angleTo(this.x, this.y, o.x, o.y), 5, dt); break;
      }
    }

    doTask(dt, aiming) {
      const t = this.task.target;
      if (!t.alive || t.restrained || this.threat || (t.faction === 'suspect' && !t.surrendered && t.stunT <= 0)) { if (t) t.claimedBy = null; this.task = null; return false; }
      this.status = 'RESTRAIN';
      const d = U.dist(this.x, this.y, t.x, t.y);
      if (d > 0.85) {
        if (!this.path || !this.pathGoal || U.dist(this.pathGoal[0], this.pathGoal[1], t.x, t.y) > 0.4) this.setPath(t.x, t.y, { force: true });
        const r = this.followPath(dt, 2.8, !aiming, 8);
        if (r === 'blocked' || r === 'nopath') { t.claimedBy = null; this.task = null; this.clearPath(); }
        return true;
      }
      this.clearPath(); this.moving = false;
      this.faceTowards(U.angleTo(this.x, this.y, t.x, t.y), 8, dt);
      this.task.t += dt;
      if (this.task.t > 1.5) {
        this.game.restrain(t, this);
        this.radio(t.faction === 'suspect' ? U.pick(L.restrainSus) : U.pick(L.restrainCiv));
        t.claimedBy = null; this.task = null;
      }
      return true;
    }

    doFollow(dt, aiming) {
      const sq = this.game.squad;
      const p = this.game.player;
      const target = sq.followPoint(this.idx);
      const d = U.dist(this.x, this.y, target[0], target[1]);
      if (d > 0.45) {
        const direct = d < 4 && this.game.map.segmentClear(this.x, this.y, target[0], target[1], this.r);
        const sp = d > 4 ? 4.2 : d > 1.5 ? 3.2 : 2.2;
        if (direct) {
          this.clearPath();
          const dx = target[0] - this.x, dy = target[1] - this.y;
          this.moveVel(dx / d * sp, dy / d * sp, dt);
          if (!aiming) this.faceTowards(U.angleTo(this.x, this.y, target[0], target[1]), 7, dt);
        } else {
          this.followRepath = (this.followRepath || 0) - dt;
          if (!this.path || this.followRepath <= 0) { this.followRepath = 0.5; this.setPath(target[0], target[1], { force: true }); }
          const r = this.followPath(dt, sp, !aiming, 8);
          if (r !== 'moving') this.clearPath();
        }
      } else {
        this.moving = false;
        if (!aiming) {
          // spread the arcs of fire: centre, left, right
          const off = [0, -0.9, 0.9][this.idx] || 0;
          this.faceTowards(p.angle + off, 4, dt);
        }
      }
    }

    onDamaged(src) {
      if (this.hurtT <= 0) { this.hurtT = 4; this.radio(U.pick(L.hit)); }
      if (src && src.faction === 'suspect' && src.alive) { this.threat = src; this.reactT = 0.15; }
    }
    die(src, info) {
      super.die(src, info);
      this.game.radio(null, TR.t('radio.down', this.op.call), true);
    }
  }
  TR.Officer = Officer;

  // ================================================================== Squad manager
  class Squad {
    constructor(game, members) {
      this.game = game; this.members = members;
      this.trail = [];
      this.plan = null;
    }
    get alive() { return this.members.filter((m) => m.alive); }

    update(dt) {
      const p = this.game.player;
      const last = this.trail[this.trail.length - 1];
      if (!last || U.dist(last[0], last[1], p.x, p.y) > 0.3) {
        this.trail.push([p.x, p.y]);
        if (this.trail.length > 80) this.trail.shift();
      }
      if (this.plan) this.updatePlan(dt);
    }
    followPoint(i) {
      const p = this.game.player;
      const want = 1.05 * (i + 1);
      let acc = 0;
      let px = p.x, py = p.y;
      for (let k = this.trail.length - 1; k >= 0; k--) {
        const q = this.trail[k];
        const seg = U.dist(px, py, q[0], q[1]);
        if (acc + seg >= want) {
          const t = (want - acc) / seg;
          return [px + (q[0] - px) * t, py + (q[1] - py) * t];
        }
        acc += seg; px = q[0]; py = q[1];
      }
      // trail too short: extend it behind the player (opposite to his facing), fanned out
      const rest = want - acc;
      const back = p.angle + Math.PI + [0, -0.5, 0.5][i] * (acc < 0.5 ? 1 : 0.3);
      const map = this.game.map;
      let tx = px + Math.cos(back) * rest, ty = py + Math.sin(back) * rest;
      if (!map.circleFree(tx, ty, 0.3) || !map.los(px, py, tx, ty, map.moveBlock)) {
        const q = map.nearestWalkable(tx, ty, 2);
        if (q && map.los(p.x, p.y, q[0], q[1], map.moveBlock)) { tx = q[0]; ty = q[1]; } else { tx = px; ty = py; }
      }
      return [tx, ty];
    }

    ack(text) {
      const m = this.alive[0];
      if (m) m.radio(text || U.pick(L.ack));
    }

    // ---- commands
    command(type, ctx) {
      const alive = this.alive;
      if (!alive.length) { this.game.hint(TR.t('hint.noOfficers')); return; }
      ctx = ctx || {};
      const g = this.game;
      g.stats.commands++;
      switch (type) {
        case 'follow':
          this.plan = null; alive.forEach((m) => { m.order = { type: 'follow' }; m.clearPath(); });
          this.trail = [[g.player.x, g.player.y]];
          this.ack(tq('following')); break;
        case 'hold':
          this.plan = null; alive.forEach((m) => { m.order = { type: 'hold', watch: m.angle }; m.clearPath(); });
          this.ack(tq('holding')); break;
        case 'move': {
          this.plan = null;
          const base = g.map.nearestWalkable(ctx.x, ctx.y, 3);
          if (!base) { g.hint(TR.t('hint.cantMove')); return; }
          const face = U.angleTo(g.player.x, g.player.y, ctx.x, ctx.y);
          const offs = [[0, 0], [-0.9, 0.9], [0.9, 0.9]];
          alive.forEach((m, i) => {
            const ox = offs[i][0] * Math.cos(face + Math.PI / 2) - offs[i][1] * Math.cos(face);
            const oy = offs[i][0] * Math.sin(face + Math.PI / 2) - offs[i][1] * Math.sin(face);
            const p = g.map.nearestWalkable(base[0] + ox, base[1] + oy, 2) || base;
            m.order = { type: 'move', x: p[0], y: p[1], face: face + (i - 1) * 0.6, label: 'MOVE' };
            m.clearPath();
          });
          this.ack(tq('moving')); break;
        }
        case 'cover':
          this.plan = null; alive.forEach((m) => { m.order = { type: 'cover', x: ctx.x, y: ctx.y }; });
          this.ack(tq('covering')); break;
        case 'stack': case 'breach': case 'flashclear': case 'openclear': case 'kickclear': case 'chargeclear': {
          const door = ctx.door;
          if (!door) { g.hint(TR.t('hint.aimDoor')); return; }
          let method = 'open', flash = false;
          if (type === 'breach' || type === 'kickclear') method = 'kick';
          if (type === 'chargeclear') method = 'charge';
          if (type === 'flashclear') flash = true;
          if (type === 'breach' && alive.some((m) => m.charges > 0) && door.locked) method = 'charge';
          const side = door.side(g.player.x, g.player.y);
          const reuse = this.plan && this.plan.door === door && this.plan.phase === 'stacked';
          this.plan = { door, side, method, flash, stackOnly: type === 'stack', phase: 'stack', t: 0, kicks: 0 };
          if (door.isOpen && type !== 'stack') { this.plan.phase = 'entry'; this.plan.entryInit = false; }
          this.assignStack(reuse);
          if (type === 'stack') this.ack(U.pick(L.stack)); else this.ack(flash ? tq('flashCopy') : (method === 'charge' ? tq('breachCopy') : tq('clearCopy')));
          break;
        }
        case 'restrain': {
          const t = ctx.target;
          if (!t) { g.hint(TR.t('hint.aimTarget')); return; }
          let best = null, bd = 1e9;
          alive.forEach((m) => { const d = U.dist(m.x, m.y, t.x, t.y); if (d < bd) { bd = d; best = m; } });
          if (best) { if (t.claimedBy) t.claimedBy.task = null; best.task = { type: 'restrain', target: t, t: 0 }; t.claimedBy = best; best.radio(tq('onit')); }
          break;
        }
      }
    }

    stackSlots(door, side) {
      const map = this.game.map;
      const n = [door.nx * side, door.ny * side], t = [door.tx, door.ty];
      const raw = [
        [door.cx + n[0] * 0.95 + t[0] * 1.0, door.cy + n[1] * 0.95 + t[1] * 1.0],
        [door.cx + n[0] * 0.95 - t[0] * 1.0, door.cy + n[1] * 0.95 - t[1] * 1.0],
        [door.cx + n[0] * 1.9 - t[0] * 1.0, door.cy + n[1] * 1.9 - t[1] * 1.0],
        [door.cx + n[0] * 1.9 + t[0] * 1.0, door.cy + n[1] * 1.9 + t[1] * 1.0]
      ];
      const used = [];
      return raw.map((p) => {
        let q = map.nearestWalkable(p[0], p[1], 2);
        if (q && used.some((u) => U.dist(u[0], u[1], q[0], q[1]) < 0.5)) q = map.nearestWalkable(p[0] + n[0], p[1] + n[1], 2);
        if (q) used.push(q);
        return q || [door.cx + n[0] * 1.5, door.cy + n[1] * 1.5];
      });
    }
    assignStack() {
      const p = this.plan;
      const slots = this.stackSlots(p.door, p.side);
      const face = Math.atan2(-p.door.ny * p.side, -p.door.nx * p.side);
      // breacher takes the slot nearest the door handle
      const ordered = this.orderedMembers();
      ordered.forEach((m, i) => {
        m.task && m.task.target && (m.task.target.claimedBy = null); m.task = null;
        m.order = { type: 'plan', x: slots[i][0], y: slots[i][1], face: U.angleTo(slots[i][0], slots[i][1], p.door.cx, p.door.cy), label: 'STACK' };
        m.clearPath();
      });
      p.faceIn = face;
    }
    orderedMembers() {
      const alive = this.alive;
      const p = this.plan;
      const pref = p && p.method === 'charge' ? ['reed', 'carter', 'grant'] : ['reed', 'carter', 'grant'];
      return alive.slice().sort((a, b) => pref.indexOf(a.op.id) - pref.indexOf(b.op.id));
    }

    updatePlan(dt) {
      const p = this.plan;
      const g = this.game;
      const door = p.door;
      p.t += dt;
      const ms = this.orderedMembers();
      if (!ms.length) { this.plan = null; return; }
      if (p.phase === 'stack') {
        const ready = ms.every((m) => m.order.type === 'plan' && m.order.arrived);
        if (ready || p.t > 8) {
          if (p.stackOnly) { p.phase = 'stacked'; ms.forEach((m) => { m.order = { type: 'hold', watch: m.angle }; }); ms[0].radio(U.pick(L.stack)); return; }
          p.phase = 'breach'; p.t = 0; p.step = 0;
        }
      } else if (p.phase === 'breach') {
        const br = (p.method === 'charge' ? ms.find((m) => m.charges > 0) : null) || ms[0];
        if (door.isOpen) { this.afterOpen(ms); return; }
        if (p.step === 0) {
          if (p.method === 'open') {
            if (door.locked) {
              door.lockKnown = true;
              br.radio(U.pick(L.locked));
              p.method = ms.some((m) => m.charges > 0) ? 'charge' : 'kick';
              p.t = -0.6; return;
            }
            if (p.t > 0.3) { if (door.wedged) br.radio(TR.L.pick('q.wedge')); door.open(br.x, br.y, br); br.faceTowards(p.faceIn, 100, 1); }
          } else if (p.method === 'kick') {
            if (p.t > 0.25) {
              p.step = 1; p.t = 0;
              br.radio(U.pick(L.kick));
            }
          } else if (p.method === 'charge') {
            const cb = ms.find((m) => m.charges > 0);
            if (!cb) { p.method = 'kick'; return; }
            if (p.t > 0.2 && !p.chargePlaced) {
              p.chargePlaced = true; cb.charges--;
              cb.radio(U.pick(L.charge));
              g.addCharge(door, cb, p.side);
            }
          }
        } else if (p.step === 1) { // kicking
          if (p.t > 0.45) {
            p.t = 0; p.kicks++;
            const ok = !door.locked || Math.random() < 0.7 || p.kicks >= 3;
            g.kickDoor(door, br, ok);
          }
        }
      } else if (p.phase === 'flash') {
        if (p.t > 1.5) { p.phase = 'entry'; p.t = 0; p.entryInit = false; }
      } else if (p.phase === 'entry') {
        if (!p.entryInit) this.initEntry(ms);
        const done = ms.every((m) => m.order.type !== 'plan' || m.order.arrived);
        if (done || p.t > 12) {
          const roomId = p.roomId;
          const hostile = g.enemies.some((e) => e.isThreat() && g.map.roomOf[g.map.idx(Math.floor(e.x), Math.floor(e.y))] === roomId);
          ms[0].radio(hostile ? U.pick(L.contact) : U.pick(L.clear));
          if (!hostile) g.onRoomCleared(roomId);
          ms.forEach((m) => { if (m.order.type === 'plan') m.order = { type: 'hold', watch: m.order.face }; });
          this.plan = null;
        }
      }
    }
    afterOpen(ms) {
      const p = this.plan;
      if (p.flash) {
        const thrower = ms.find((m) => m.flash > 0);
        if (thrower) {
          thrower.flash--;
          const n = [-p.door.nx * p.side, -p.door.ny * p.side];
          const tx = p.door.cx + n[0] * 3, ty = p.door.cy + n[1] * 3;
          thrower.angle = U.angleTo(thrower.x, thrower.y, p.door.cx, p.door.cy);
          this.game.throwGrenade(thrower, tx, ty, p.door);
          thrower.radio(U.pick(L.flash));
          p.phase = 'flash'; p.t = 0;
          return;
        }
        ms[0].radio(tq('noFlash'));
      }
      p.phase = 'entry'; p.t = 0; p.entryInit = false;
    }
    initEntry(ms) {
      const p = this.plan;
      const g = this.game, map = g.map;
      p.entryInit = true;
      const door = p.door;
      const inX = door.cx - door.nx * p.side * 1.0, inY = door.cy - door.ny * p.side * 1.0;
      const room = map.roomAt(inX, inY);
      p.roomId = room ? room.id : -1;
      ms[0].radio(U.pick(L.go));
      const pts = room ? this.clearPoints(room, door, p.side, ms.length) : [];
      const order = [ms.find((m) => m.op.id === 'carter'), ms.find((m) => m.op.id === 'reed'), ms.find((m) => m.op.id === 'grant')].filter((m) => m && m.alive);
      order.forEach((m, i) => {
        const pt = pts[i] || [inX, inY];
        m.order = {
          type: 'plan', x: pt[0], y: pt[1], label: 'CLEAR', fast: true, delay: i * 0.35,
          face: room ? U.angleTo(pt[0], pt[1], room.cx, room.cy) : 0, sweep: true,
          lookWhileMoving: room ? U.angleTo(door.cx, door.cy, room.cx, room.cy) : null
        };
        m.clearPath();
      });
    }
    clearPoints(room, door, side, n) {
      const map = this.game.map;
      const m = [-door.nx * side, -door.ny * side], t = [door.tx, door.ty];
      const cells = room.floorCells.map((c) => [(c % map.w) + 0.5, ((c / map.w) | 0) + 0.5])
        .filter(([x, y]) => !map.moveBlock[map.idx(Math.floor(x), Math.floor(y))])
        .map(([x, y]) => ({ x, y, u: (x - door.cx) * t[0] + (y - door.cy) * t[1], v: (x - door.cx) * m[0] + (y - door.cy) * m[1] }))
        .filter((c) => c.v > 0.9);
      if (!cells.length) return [];
      const pick = (score, used) => {
        let best = null, bs = -1e9;
        for (const c of cells) {
          if (used.some((u) => U.dist(u[0], u[1], c.x, c.y) < 1.3)) continue;
          const s = score(c);
          if (s > bs) { bs = s; best = c; }
        }
        return best ? [best.x, best.y] : null;
      };
      const used = [];
      const scorers = [
        (c) => c.u * 1.0 - Math.abs(c.v - 2.2) * 0.9,
        (c) => -c.u * 1.0 - Math.abs(c.v - 2.2) * 0.9,
        (c) => Math.min(c.v, 4.5) - Math.abs(c.u) * 0.5 - Math.max(0, c.v - 4.5)
      ];
      for (let i = 0; i < n; i++) { const q = pick(scorers[i % 3], used); if (q) used.push(q); }
      return used;
    }
  }
  TR.Squad = Squad;
})(window.TR);
