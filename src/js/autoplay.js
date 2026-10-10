// Autopilot: plays the current mission in real time by driving the same inputs a human would.
(function () {
  const U = TR.U, I = TR.Input;
  const AP = {
    on: false, goal: null, path: null, pi: 0, holdE: 0, waitT: 0, yellT: 0, log: [], lastRoomCmd: -99, stuck: 0,
    // play missions back to back, showing briefing -> loadout -> mission -> results like a player would
    async campaign(first) {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let id = first; id <= 3; id++) {
        TR.UI.selMission = id; TR.UI.show('campaign'); await wait(4000);
        TR.UI.show('loadout'); await wait(3000);
        TR.App.startMission(id); await wait(2200);
        this.start();
        while (TR.App.state !== 'result') await wait(500);
        this.stop();
        await wait(9000);
        if (!TR.UI.lastResult.success) id--; // retry a failed mission
      }
      TR.App.toMenu('main');
    },
    start() { this.on = true; this.visited = new Set(); this.doorsDone = new Set(); this.tick = setInterval(() => this.step(), 16); },
    stop() { this.on = false; clearInterval(this.tick); I.down = {}; I.mouse.down = [false, false, false]; },
    say(t) { this.log.push(t); if (this.log.length > 30) this.log.shift(); },
    aim(x, y) { const s = TR.game.camera.toScreen(x, y); I.mouse.x = s[0]; I.mouse.y = s[1]; },
    moveTo(x, y) {
      const g = TR.game, p = g.player;
      if (!this.path || !this.goal || U.dist(this.goal[0], this.goal[1], x, y) > 0.4 || this.repath <= 0) {
        this.goal = [x, y]; this.path = g.map.findPath(p.x, p.y, x, y, { radius: 0.3 }); this.pi = 0; this.repath = 1.5;
      }
      this.repath -= 0.016;
      I.down.KeyW = I.down.KeyS = I.down.KeyA = I.down.KeyD = false;
      if (!this.path || this.pi >= this.path.length) return U.dist(p.x, p.y, x, y) < 0.6;
      const wp = this.path[this.pi];
      // open closed doors on the way
      const d = g.map.doorNear(p.x, p.y, 1.2);
      if (d && !d.isOpen && U.dist(wp[0], wp[1], d.cx, d.cy) < 1.2) {
        if (d.locked) { I.pressed.KeyF = true; } else { I.pressed.KeyE = true; }
      }
      const dx = wp[0] - p.x, dy = wp[1] - p.y;
      if (Math.hypot(dx, dy) < 0.25) { this.pi++; return false; }
      I.down.KeyW = dy < -0.12; I.down.KeyS = dy > 0.12; I.down.KeyA = dx < -0.12; I.down.KeyD = dx > 0.12;
      return false;
    },
    stopMove() { I.down.KeyW = I.down.KeyS = I.down.KeyA = I.down.KeyD = false; },
    step() {
      const A = TR.App, g = TR.game;
      if (!this.on || A.state !== 'game' || !g || g.over || A.paused) return;
      const p = g.player;
      if (!p.alive) return;
      I.mouse.down[0] = false;
      if (this.waitT > 0) { this.waitT -= 0.016; }
      // 1) threats
      let threat = null, td = 1e9;
      for (const e of g.enemies) {
        if (!e.alive || !e.visibleToTeam || !e.isThreat()) continue;
        if (!g.map.los(p.x, p.y, e.x, e.y)) continue;
        const d = U.dist(p.x, p.y, e.x, e.y); if (d < td && d < 18) { td = d; threat = e; }
      }
      if (threat) {
        this.stopMove();
        this.aim(threat.x, threat.y);
        const hostile = threat.state === 'COMBAT' || threat.muzzleT > 0 || threat.state === 'HIDE' || (threat.state === 'HOSTAGE' && threat.executeT < 2.5);
        I.mouse.down[2] = true;
        this.yellT -= 0.016;
        if (!hostile && this.yellT <= 0) { I.pressed.Space = true; this.yellT = 1.0; this.say('Yell at ' + threat.T.label); }
        const aimed = Math.abs(U.angleDiff(p.angle, U.angleTo(p.x, p.y, threat.x, threat.y))) < 0.06;
        if (hostile && aimed) { I.mouse.down[0] = true; if (!p.weapon.def.auto) I.mouse.pressed[0] = true; }
        if (p.weapon.ammo === 0) I.pressed.KeyR = true;
        return;
      }
      I.mouse.down[2] = false;
      // non-compliant visible civilians: yell
      const civ = g.civilians.find((c) => c.alive && c.visibleToTeam && !c.surrendered && c.state !== 'HELD' && U.dist(p.x, p.y, c.x, c.y) < 9);
      if (civ && this.yellT <= 0) { this.aim(civ.x, civ.y); I.pressed.Space = true; this.yellT = 1.2; }
      this.yellT -= 0.016;
      if (p.hp < 45 && p.medkits > 0 && !p.action) { I.pressed.KeyH = true; return; }
      if (p.action) { if (p.action.key) I.down[p.action.key] = true; this.stopMove(); return; }
      I.down.KeyE = false;
      // 2) restrain compliant people close by
      const rest = g.npcs.filter((n) => n.alive && !n.restrained && n.everSeen && ((n.kind === 'enemy' && (n.surrendered || n.stunT > 0)) || (n.kind === 'civ' && n.state === 'COMPLIANT')) && !n.claimedBy)
        .sort((a, b) => U.dist(p.x, p.y, a.x, a.y) - U.dist(p.x, p.y, b.x, b.y))[0];
      if (rest && U.dist(p.x, p.y, rest.x, rest.y) < 10) {
        this.aim(rest.x, rest.y);
        if (U.dist(p.x, p.y, rest.x, rest.y) < 1.0) { this.stopMove(); I.pressed.KeyE = true; I.down.KeyE = true; }
        else this.moveTo(rest.x, rest.y);
        return;
      }
      // 3) evidence
      const ev = g.items.filter((i) => i.discovered && !i.collected).sort((a, b) => U.dist(p.x, p.y, a.x, a.y) - U.dist(p.x, p.y, b.x, b.y))[0];
      if (ev && U.dist(p.x, p.y, ev.x, ev.y) < 12) {
        this.aim(ev.x, ev.y);
        if (U.dist(p.x, p.y, ev.x, ev.y) < 0.9) { this.stopMove(); I.pressed.KeyE = true; I.down.KeyE = true; }
        else this.moveTo(ev.x, ev.y);
        return;
      }
      // 4) extraction
      if (g.extractReady) {
        const z = g.extractZone; const cx = (z.x1 + z.x2) / 2, cy = (z.y1 + z.y2) / 2;
        this.aim(cx, cy);
        if (this.moveTo(cx, cy) || (p.x > z.x1 && p.x < z.x2 && p.y > z.y1 && p.y < z.y2)) { this.stopMove(); I.pressed.KeyE = true; }
        return;
      }
      // 5) wait for the team while it clears a room
      if (g.squad.plan) { this.stopMove(); const d = g.squad.plan.door; this.aim(d.cx, d.cy); return; }
      if (this.waitT > 0) { this.stopMove(); return; }
      // 6) next room: pick the closest door leading to an unvisited room
      const map = g.map;
      const pr = map.roomAt(p.x, p.y);
      if (pr) this.visited.add(pr.id);
      let best = null, bs = 1e9;
      for (const d of map.doors) {
        if (this.doorsDone.has(d.id)) continue;
        const unvisited = d.rooms.some((r) => r >= 0 && !this.visited.has(r) && !map.rooms[r].outside && !g.clearedRooms.has(r));
        const reachable = d.rooms.some((r) => r >= 0 && (this.visited.has(r) || g.clearedRooms.has(r)));
        if (!unvisited || !reachable) continue;
        const s = U.dist(p.x, p.y, d.cx, d.cy);
        if (s < bs) { bs = s; best = d; }
      }
      if (!best) {
        // everything visited: sweep rooms that still contain unresolved people
        const left = g.npcs.find((n) => n.alive && !n.restrained);
        if (left) { this.aim(left.x, left.y); this.moveTo(left.x, left.y); }
        return;
      }
      const knownSide = best.rooms.find((r) => r >= 0 && (this.visited.has(r) || g.clearedRooms.has(r)));
      const room = map.rooms[knownSide];
      // stand 2m from the door on the known side
      const s = best.side(room.cx, room.cy);
      const sx = best.cx + best.nx * s * 2.2, sy = best.cy + best.ny * s * 2.2;
      const spot = map.nearestWalkable(sx, sy, 2) || [sx, sy];
      this.aim(best.cx, best.cy);
      if (this.moveTo(spot[0], spot[1]) || U.dist(p.x, p.y, spot[0], spot[1]) < 0.7) {
        this.stopMove();
        this.aim(best.cx, best.cy);
        const flash = g.officers.some((o) => o.alive && o.flash > 0) && best.rooms.some((r) => r >= 0 && g.npcs.some((n) => n.alive && !n.restrained && map.roomOf[map.idx(Math.floor(n.x), Math.floor(n.y))] === r && n.everSeen));
        setTimeout(() => { I.pressed[flash || Math.random() < 0.4 ? 'F5' : 'F6'] = true; }, 0);
        this.doorsDone.add(best.id);
        const other = best.rooms.find((r) => r !== knownSide);
        if (other >= 0) this.visited.add(other);
        this.say('Clear ' + (other >= 0 ? map.rooms[other].name : '?'));
        this.waitT = 1.2;
        // follow the team afterwards
        setTimeout(() => { if (!g.squad.plan) I.pressed.F1 = true; }, 9000);
      }
    }
  };
  window.AP = AP;
})();
