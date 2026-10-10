// Civilian AI (GDD 21): CALM -> PANIC -> FLEE -> HIDE -> COMPLIANT -> RESTRAINED.
(function (TR) {
  const U = TR.U, D = TR.D;

  const LINES = new Proxy({}, { get: (_, k) => TR.L.raw('c.' + String(k)) });

  class Civilian extends TR.Character {
    constructor(game, x, y, opts) {
      opts = opts || {};
      const female = Math.random() < 0.5;
      super(game, x, y, { kind: 'civ', faction: 'civilian', hp: 100, clothes: U.pick(D.civilianClothes), skin: U.pick(D.skin), hair: U.pick(D.hair), angle: Math.random() * 6.28, name: opts.name || 'Civilian' });
      this.female = female;
      this.state = 'CALM'; this.stateT = 0;
      this.complyBase = U.rand(0.45, 0.9);
      this.complyCd = 0; this.yellCount = 0;
      this.held = !!opts.held; // hostage held by suspects (kneeling, cannot comply until freed)
      this.vip = !!opts.vip;
      this.heldBy = null;
      this.lookT = U.rand(1, 3); this.lookA = this.angle;
      this.hideSpot = null;
      this.panicLineT = 0;
      if (this.held) { this.state = 'HELD'; this.surrendered = true; }
    }
    get secured() { return this.restrained; }

    setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
    shout(text) {
      this.say(text);
      if (this.visibleToTeam || U.dist(this.x, this.y, this.game.player.x, this.game.player.y) < 9) TR.Voice.say(text, { voice: this.female ? 'female' : 'civ', pitch: this.female ? 1.25 : 1.05, rate: 1.35, vol: 0.75 });
    }
    update(dt) {
      this.baseUpdate(dt);
      if (!this.alive) return;
      this.stateT += dt;
      if (this.complyCd > 0) this.complyCd -= dt;
      if (this.panicLineT > 0) this.panicLineT -= dt;
      if (this.restrained) { this.moving = false; return; }
      if (this.stunT > 0) { this.moving = false; return; }
      switch (this.state) {
        case 'CALM': {
          this.moving = false;
          this.lookT -= dt;
          if (this.lookT <= 0) { this.lookT = U.rand(2, 5); this.lookA = this.angle + U.rand(-1.5, 1.5); }
          this.faceTowards(this.lookA, 1.2, dt);
          // spotting armed police up close is scary
          for (const p of this.game.police) {
            if (p.alive && U.dist(p.x, p.y, this.x, this.y) < 5 && this.game.map.los(p.x, p.y, this.x, this.y)) { this.panic(p.x, p.y); break; }
          }
          break;
        }
        case 'PANIC': case 'FLEE': {
          if (!this.path) {
            const spot = this.findHideSpot();
            if (!spot || !this.setPath(spot[0], spot[1])) { this.setState('HIDE'); break; }
          }
          const r = this.followPath(dt, 3.4, true, 9);
          if (r !== 'moving') { this.clearPath(); this.setState('HIDE'); }
          if (this.panicLineT <= 0 && Math.random() < dt * 0.6) { this.panicLineT = 4; this.shout(U.pick(LINES.panic)); }
          break;
        }
        case 'HIDE': {
          this.moving = false; this.crouch = true;
          this.kneel += (0.7 - this.kneel) * Math.min(1, dt * 4);
          if (this.panicLineT <= 0 && Math.random() < dt * 0.15) { this.panicLineT = 6; this.shout(U.pick(LINES.panic)); }
          // hiding civilians may bolt again when police come close without talking
          if (this.stateT > 3) for (const p of this.game.police) {
            if (p.alive && U.dist(p.x, p.y, this.x, this.y) < 2.2 && Math.random() < dt * 0.25) { this.clearPath(); this.setState('FLEE'); break; }
          }
          break;
        }
        case 'COMPLIANT': case 'HELD': {
          this.moving = false;
          if (this.state === 'HELD' && this.panicLineT <= 0 && this.visibleToTeam && Math.random() < dt * 0.25) { this.panicLineT = 7; this.shout(U.pick(LINES.held)); }
          break;
        }
      }
    }
    findHideSpot() {
      const map = this.game.map;
      const room = map.roomAt(this.x, this.y);
      let best = null, bs = -1e9;
      const cands = [];
      const rooms = [room].concat(room ? room.doors.map((di) => { const d = map.doors[di]; const other = d.rooms.find((r) => r >= 0 && r !== room.id); return other != null ? map.rooms[other] : null; }) : []);
      rooms.forEach((r) => { if (r && !r.outside) for (let i = 0; i < 8; i++) cands.push(U.pick(r.floorCells)); });
      for (const c of cands) {
        if (c == null) continue;
        const x = (c % map.w) + 0.5, y = ((c / map.w) | 0) + 0.5;
        let s = 0;
        if (this.fearX != null) s += U.dist(x, y, this.fearX, this.fearY);
        // corners / near walls are preferred
        let walls = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.isMoveBlocked(Math.floor(x) + dx, Math.floor(y) + dy)) walls++;
        s += walls * 1.2 + Math.random();
        if (s > bs) { bs = s; best = [x, y]; }
      }
      return best;
    }
    panic(fx, fy) {
      if (this.state === 'COMPLIANT' || this.state === 'HELD' || this.restrained) return;
      this.fearX = fx; this.fearY = fy;
      if (this.state === 'CALM' || (this.state === 'HIDE' && Math.random() < 0.3)) {
        this.clearPath();
        this.setState('PANIC');
        if (this.panicLineT <= 0) { this.panicLineT = 3; this.shout(U.pick(LINES.panic)); }
      }
    }
    hear(ev) {
      if (!this.alive || this.restrained) return;
      if (ev.type === 'gunshot' || ev.type === 'bang' || ev.type === 'explosion' || ev.type === 'kick') this.panic(ev.x, ev.y);
    }
    onYell(src) {
      if (!this.alive || this.restrained || this.state === 'COMPLIANT' || this.state === 'HELD') return;
      if (this.complyCd > 0) return;
      this.complyCd = 0.8;
      this.yellCount++;
      let p = this.complyBase + 0.15 * (this.yellCount - 1);
      if (this.state === 'HIDE') p += 0.15;
      if (this.stunT > 0) p += 0.4;
      if (Math.random() < p) {
        this.clearPath(); this.surrendered = true;
        this.setState('COMPLIANT');
        this.shout(U.pick(LINES.comply));
        this.faceTowards(U.angleTo(this.x, this.y, src.x, src.y), 100, 1);
      } else {
        this.shout(U.pick(LINES.refuse));
        if (Math.random() < 0.4) { this.fearX = src.x; this.fearY = src.y; this.clearPath(); this.setState('FLEE'); }
      }
    }
    release() {
      if (!this.alive || !this.held) return;
      this.held = false; this.heldBy = null;
      this.surrendered = true;
      this.setState('COMPLIANT');
      this.shout(U.pick(LINES.rescued));
    }
    onDamaged(src) { this.panic(src ? src.x : this.x, src ? src.y : this.y); }
  }
  TR.Civilian = Civilian;
})(window.TR);
