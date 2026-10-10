// Developer test harness (only loaded with ?dev in the URL). Drives the simulation deterministically.
(function () {
  window.step = (sec, fn) => {
    const A = TR.App; const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) { if (fn) fn(i); if (A.state === 'game' && A.game && !A.paused) A.game.update(1 / 60); TR.Input.endFrame(); }
    if (A.game) { A.game.render(A.g, A.W, A.H, A.dpr); A.g.setTransform(A.dpr, 0, 0, A.dpr, 0, 0); TR.HUD.draw(A.g, A.game, A.W, A.H); }
    return A.game ? +A.game.time.toFixed(2) : 0;
  };
  window.mouse = (x, y) => { TR.Input.mouse.x = x; TR.Input.mouse.y = y; };
  window.aimWorld = (wx, wy) => { const s = TR.game.camera.toScreen(wx, wy); mouse(s[0], s[1]); };
  window.walkTo = (wx, wy, maxSec) => {
    const g = TR.game, p = g.player, I = TR.Input; let t = 0;
    while (t < (maxSec || 6)) {
      const dx = wx - p.x, dy = wy - p.y; if (Math.hypot(dx, dy) < 0.3) break;
      I.down.KeyW = dy < -0.15; I.down.KeyS = dy > 0.15; I.down.KeyA = dx < -0.15; I.down.KeyD = dx > 0.15;
      g.update(1 / 60); I.endFrame(); t += 1 / 60;
    }
    I.down = {}; return [+p.x.toFixed(2), +p.y.toFixed(2)];
  };
  window.cmd = (key, wx, wy) => { aimWorld(wx, wy); TR.Input.pressed[key] = true; step(1 / 60); };
  window.npcInfo = () => TR.game.npcs.map((n) => (n.kind === 'enemy' ? n.type : 'civ') + ':' + n.state + (n.alive ? '' : '(dead)') + (n.restrained ? '(R)' : '') + '@' + n.x.toFixed(0) + ',' + n.y.toFixed(0));
  window.watch = (sec, every) => {
    const g = TR.game, out = [];
    for (let t = 0; t < sec; t += every || 0.5) {
      step(every || 0.5);
      const pl = g.squad.plan;
      out.push(g.time.toFixed(1) + ' ' + (pl ? pl.phase : '-') + ' ' + g.officers.map((o) => o.status + (o.threat ? '!' : '') + '@' + o.x.toFixed(1) + ',' + o.y.toFixed(1)).join(' '));
    }
    return out;
  };
  window.dev = true;
})();
