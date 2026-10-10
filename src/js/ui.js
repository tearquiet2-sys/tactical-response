// Menus (GDD 31-36): main menu, campaign/briefing, loadout, operators, armory, training, settings, pause, results.
(function (TR) {
  const U = TR.U, D = TR.D, S = TR.Save, t = (...a) => TR.t(...a);

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const LOGO = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 L56 12 L54 36 Q50 52 32 60 Q14 52 10 36 L8 12 Z" fill="#1c232c" stroke="#e8b04a" stroke-width="3"/><circle cx="32" cy="31" r="11" fill="none" stroke="#d9dcdf" stroke-width="3"/><path d="M32 13v10M32 39v10M14 31h10M40 31h10" stroke="#d9dcdf" stroke-width="3"/><circle cx="32" cy="31" r="2.6" fill="#d9544a"/></svg>';

  const UI = {
    root: null, current: null, selMission: 1,
    init(app) {
      this.app = app;
      this.root = document.getElementById('ui');
      this.root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-a]');
        if (!el || el.classList.contains('disabled')) return;
        TR.Audio.ensure();
        TR.Audio.play('ui');
        this.action(el.dataset.a, el.dataset.v, el);
      });
      this.root.addEventListener('mouseover', (e) => {
        const el = e.target.closest('[data-a]');
        if (el && el !== this._hover) { this._hover = el; if (TR.Audio.ctx) TR.Audio.play('uiHover'); }
      });
      this.root.addEventListener('input', (e) => {
        const el = e.target;
        if (el.dataset.set) {
          S.data.settings[el.dataset.set] = parseFloat(el.value);
          TR.Audio.settings = S.data.settings; TR.Audio.applySettings(); S.save();
          const out = el.parentElement.querySelector('output'); if (out) out.textContent = Math.round(el.value * 100) + '%';
        }
      });
    },
    hide() { this.root.innerHTML = ''; this.root.style.display = 'none'; this.current = null; },
    show(name, arg) {
      this.root.style.display = 'flex';
      const same = this.current === name;
      this.current = name;
      this.root.innerHTML = this.screens[name].call(this, arg);
      if (!same) { this.root.classList.remove('fade'); void this.root.offsetWidth; this.root.classList.add('fade'); this.root.scrollTop = 0; }
      if (name === 'campaign') this.drawPreview();
    },
    profileBox() {
      const d = S.data, lvl = D.levelFromXP(d.xp);
      const a = D.xpForLevel(lvl), b = D.xpForLevel(lvl + 1);
      const k = (d.xp - a) / Math.max(1, b - a);
      return `<div class="profile">
        <div class="pf-name">DANIEL CROSS <span>ALPHA-1</span></div>
        <div class="pf-rank">${D.rankName(lvl)} · ${t('menu.level')} ${lvl}</div>
        <div class="xpbar"><i style="width:${(k * 100).toFixed(1)}%"></i></div>
        <div class="pf-row"><span>${U.fmtNum(d.xp)} XP</span><span class="credits">$${U.fmtNum(d.credits)}</span></div>
      </div>`;
    },
    langPicker() {
      return `<div class="langs">${TR.L.langs.map((l) => `<button class="lang ${TR.L.lang === l.id ? 'on' : ''}" data-a="lang" data-v="${l.id}">${l.name}</button>`).join('')}</div>`;
    },

    action(a, v) {
      const app = this.app;
      switch (a) {
        case 'nav': this.show(v); break;
        case 'lang': S.data.settings.lang = v; TR.L.set(v); S.save(); TR.Voice.refresh && TR.Voice.refresh(); this.show(this.current, this.lastArg); break;
        case 'resumeOp': app.resumeMission(); break;
        case 'continue': {
          const next = TR.Missions.find((m) => m.playable && !S.data.completed[m.id] && S.unlockedMission(m.id)) || TR.Missions[0];
          this.selMission = next.id; this.show('campaign'); break;
        }
        case 'mission': this.selMission = +v; this.show('campaign'); break;
        case 'toLoadout': this.show('loadout'); break;
        case 'slot': {
          const [slot, id] = v.split(':');
          if (!S.owns(id)) { this.flash(t('flash.lockedItem')); return; }
          S.data.loadout[slot] = id; S.save(); this.show('loadout'); break;
        }
        case 'mod': {
          const [wid, mod] = v.split(':');
          if (!S.owns(mod)) { this.flash(t('flash.lockedMod')); return; }
          const m = S.data.loadout.mods[wid] = S.data.loadout.mods[wid] || {};
          m[mod] = !m[mod]; S.save(); this.show('loadout'); break;
        }
        case 'deploy': app.startMission(this.selMission); break;
        case 'buy': {
          const [id, price] = v.split(':');
          if (S.buy(id, +price)) { TR.Audio.play('uiConfirm'); this.show('armory'); }
          else this.flash(t('flash.credits'));
          break;
        }
        case 'toggle': {
          S.data.settings[v] = !S.data.settings[v]; S.save();
          if (v === 'fullscreen') app.setFullscreen(S.data.settings.fullscreen);
          this.show(this.current, this.lastArg); break;
        }
        case 'resetSave': if (confirm(t('set.resetQ'))) { S.reset(); S.data.settings.lang = TR.L.lang; S.save(); this.show('main'); } break;
        case 'exit': app.autosave(); if (window.desktop) window.desktop.quit(); else window.close(); break;
        case 'resume': app.resume(); break;
        case 'restart': app.startMission(app.game.mission.id); break;
        case 'abort': app.abort(); break;
        case 'saveQuit': app.saveAndQuit(); break;
        case 'pauseControls': this.show('training', { fromPause: true }); break;
        case 'backPause': this.show('pause'); break;
        case 'resultContinue': app.toMenu('campaign'); break;
        case 'resultRetry': app.startMission(this.lastResult.mission.id); break;
      }
    },
    flash(msg) {
      let el = document.getElementById('ui-flash');
      if (!el) { el = document.createElement('div'); el.id = 'ui-flash'; document.body.appendChild(el); }
      el.textContent = msg; el.classList.add('on');
      clearTimeout(this._ft); this._ft = setTimeout(() => el.classList.remove('on'), 1800);
    },

    drawPreview() {
      const cv = document.getElementById('preview');
      const m = TR.Missions.find((q) => q.id === this.selMission);
      if (!cv || !m || !m.playable) return;
      if (!this._prevCache) this._prevCache = {};
      let gm = this._prevCache[m.id];
      if (!gm) {
        const saved = TR.game; TR.game = null;
        gm = new TR.GameMap(m.build()); gm.ambient = m.ambient; gm.render();
        TR.game = saved;
        this._prevCache[m.id] = gm;
      }
      const g = cv.getContext('2d');
      const W = cv.width, H = cv.height;
      const s = Math.min(W / gm.floorCanvas.width, H / gm.floorCanvas.height);
      const w = gm.floorCanvas.width * s, h = gm.floorCanvas.height * s;
      g.fillStyle = '#07090b'; g.fillRect(0, 0, W, H);
      g.drawImage(gm.floorCanvas, (W - w) / 2, (H - h) / 2, w, h);
      g.fillStyle = 'rgba(5,8,12,0.2)'; g.fillRect((W - w) / 2, (H - h) / 2, w, h);
      g.drawImage(gm.wallCanvas, (W - w) / 2, (H - h) / 2, w, h);
      const ts = TR.TS * s;
      const ox = (W - w) / 2, oy = (H - h) / 2;
      g.fillStyle = '#5fa8e8';
      gm.spawns.player.slice(0, 1).forEach((p) => { g.beginPath(); g.arc(ox + p.x * ts, oy + p.y * ts, 6, 0, 7); g.fill(); });
      const ez = gm.spawns.extract[0];
      if (ez) { g.strokeStyle = 'rgba(127,201,138,0.8)'; g.setLineDash([4, 3]); g.strokeRect(ox + ez.x1 * ts, oy + ez.y1 * ts, (ez.x2 - ez.x1) * ts, (ez.y2 - ez.y1) * ts); g.setLineDash([]); }
      g.font = '600 10px Bahnschrift, sans-serif'; g.textAlign = 'center';
      gm.rooms.forEach((r) => {
        if (r.floorCells.length < 6 || r.name === 'Area') return;
        const nm = TR.L.room(r.name).toUpperCase();
        g.fillStyle = 'rgba(0,0,0,0.55)';
        const tw = g.measureText(nm).width + 6;
        g.fillRect(ox + r.cx * ts - tw / 2, oy + r.cy * ts - 8, tw, 12);
        g.fillStyle = '#c9ced3'; g.fillText(nm, ox + r.cx * ts, oy + r.cy * ts + 2);
      });
      gm.doors.forEach((d) => { if (d.locked) { g.fillStyle = '#d9544a'; g.beginPath(); g.arc(ox + d.cx * ts, oy + d.cy * ts, 3, 0, 7); g.fill(); } });
    },

    statBars(def) {
      if (def.isShield) return `<div class="wstats"><div>${t('lo.shieldDesc')}</div></div>`;
      const row = (label, k) => `<div class="srow"><span>${label}</span><div class="sbar"><i style="width:${Math.round(U.clamp(k, 0.05, 1) * 100)}%"></i></div></div>`;
      const dmg = def.damage * (def.pellets || 1);
      return `<div class="wstats">
        ${row(t('stat.damage'), def.lessLethal ? 0.15 : dmg / 120)}
        ${row(t('stat.rate'), def.rpm / 1100)}
        ${row(t('stat.acc'), 1 - (def.ads + def.spread) / 10)}
        ${row(t('stat.control'), 1 - def.recoil / 4.5)}
        ${row(t('stat.mag'), def.mag / 32)}
      </div>`;
    },

    screens: {
      main() {
        const hasProgress = Object.keys(S.data.completed).length > 0;
        const r = S.resume;
        const rm = r && TR.Missions.find((m) => m.id === r.mission);
        return `<div class="menu-main">
          <div class="title-block">
            <div class="kicker">${LOGO}${t('menu.kicker')}</div>
            <h1>TACTICAL<br>RESPONSE</h1>
            <div class="sub">${t('menu.sub')}</div>
          </div>
          <nav class="main-nav">
            ${rm ? `<button class="resume" data-a="resumeOp">${t('menu.resume')}<small>${t('menu.resumeSub', rm.code + ' ' + rm.name, U.fmtTime(r.time))}</small></button>` : ''}
            <button data-a="continue">${hasProgress ? t('menu.continue') : t('menu.start')}</button>
            <button data-a="nav" data-v="campaign">${t('menu.campaign')}</button>
            <button data-a="nav" data-v="operators">${t('menu.operators')}</button>
            <button data-a="nav" data-v="armory">${t('menu.armory')}</button>
            <button data-a="nav" data-v="training">${t('menu.training')}</button>
            <button data-a="nav" data-v="settings">${t('menu.settings')}</button>
            <button data-a="exit">${t('menu.exit')}</button>
          </nav>
          <div class="menu-lang"><div class="lbl">${t('menu.lang')}</div>${this.langPicker()}</div>
          ${this.profileBox()}
          <div class="foot">${t('menu.foot')}</div>
        </div>`;
      },

      campaign() {
        const m = TR.Missions.find((q) => q.id === this.selMission) || TR.Missions[0];
        const list = TR.Missions.map((q) => {
          const done = S.data.completed[q.id];
          const unlocked = q.playable && S.unlockedMission(q.id);
          const cls = ['mrow', q.id === m.id ? 'sel' : '', !q.playable ? 'future' : !unlocked ? 'locked' : ''].join(' ');
          return `<div class="${cls}" data-a="mission" data-v="${q.id}">
            <span class="mcode">${q.code}</span><span class="mname">${q.name}</span>
            <span class="mstate">${done ? '<b class="grade g-' + done.grade + '">' + done.grade + '</b>' : !q.playable ? t('camp.classified') : !unlocked ? t('camp.locked') : ''}</span>
          </div>`;
        }).join('');
        let right;
        if (!m.playable) {
          right = `<div class="brief classified"><div class="bcode">${t('camp.mission')} ${m.code}</div><h2>${m.name}</h2>
            <div class="bloc">${esc(m.location)}</div>
            <div class="stamp">${t('camp.classified')}</div>
            <p>${t('camp.classText')}</p>
            <p class="dim">${t('camp.feature')}: ${esc(m.feature)}</p></div>`;
        } else {
          const unlocked = S.unlockedMission(m.id);
          const best = S.data.completed[m.id];
          right = `<div class="brief">
            <div class="bhead"><div><div class="bcode">${t('camp.mission')} ${m.code}</div><h2>${m.name}</h2>
            <div class="bloc">${esc(m.location)} · ${m.time} · ${esc(m.weather)}</div></div>
            ${best ? `<div class="best">${t('camp.best')} <b class="grade g-${best.grade}">${best.grade}</b><span>${U.fmtNum(best.score)}</span></div>` : ''}</div>
            <p class="summary">${esc(m.summary)}</p>
            <canvas id="preview" width="640" height="360"></canvas>
            <div class="intel"><div class="lbl">${t('camp.intel')}</div><ul>${m.intel.map((i) => '<li>' + esc(i) + '</li>').join('')}</ul></div>
            <div class="roe">${t('camp.roe')}</div>
            <div class="brow">
              <span class="dim">${t('camp.reward')} $${U.fmtNum(m.reward)} · ${t('camp.par')} ${U.fmtTime(m.parTime)}</span>
              <button class="primary ${unlocked ? '' : 'disabled'}" data-a="toLoadout">${unlocked ? t('camp.toLoadout') : t('camp.needPrev')}</button>
            </div>
          </div>`;
        }
        return `<div class="screen two">
          <div class="col-left"><div class="shead"><button class="back" data-a="nav" data-v="main">${t('back')}</button><h3>${t('camp.title')}</h3></div>
          <div class="mlist">${list}</div></div>
          <div class="col-right">${right}</div>
        </div>`;
      },

      loadout() {
        const L = S.data.loadout;
        const m = TR.Missions.find((q) => q.id === this.selMission);
        const opt = (slot, id, name, sub) => {
          const own = S.owns(id);
          return `<div class="opt ${L[slot] === id ? 'sel' : ''} ${own ? '' : 'locked'}" data-a="slot" data-v="${slot}:${id}">
            <div class="oname">${esc(name)}</div><div class="osub">${own ? esc(sub || '') : t('lo.locked')}</div></div>`;
        };
        const wsub = (w) => w.cal ? w.cal + ' · ' + w.mag + ' ' + t('lo.rds') : t('lo.shield');
        const prim = D.primaryOptions.map((id) => { const w = D.weapons[id]; return opt('primary', id, w.name, wsub(w)); }).join('');
        const sec = D.secondaryOptions.map((id) => { const w = D.weapons[id]; return opt('secondary', id, w.name, wsub(w)); }).join('');
        const group = (slot, obj, sub) => Object.values(obj).map((a) => opt(slot, a.id, a.name, sub ? a.desc : '')).join('');
        const pw = D.weapons[L.primary] || D.weapons.ar15;
        const modRow = (w, list) => list.map((id) => {
          const md = D.mods[id];
          if (id === 'suppressor' && !w.suppressible) return '';
          const on = L.mods[w.id] && L.mods[w.id][id];
          return `<div class="mod ${on ? 'on' : ''} ${S.owns(id) ? '' : 'locked'}" data-a="mod" data-v="${w.id}:${id}"><b>${md.name}</b><span>${S.owns(id) ? md.desc : t('lo.locked')}</span></div>`;
        }).join('');
        const mods = pw && !pw.isShield ? modRow(pw, ['suppressor', 'optic', 'extmag', 'laser']) : '';
        const sw = D.weapons[L.secondary] || D.weapons.px9;
        const smods = modRow(sw, ['suppressor', 'laser']);
        const tacSel = D.tactical[L.tactical], gadSel = D.gadget[L.gadget] || D.gadget.lockpick, headSel = D.headgear[L.headgear] || D.headgear.helmet;
        return `<div class="screen loadout">
          <div class="shead"><button class="back" data-a="nav" data-v="campaign">${t('briefing')}</button><h3>${t('lo.title')} · ${t('camp.mission')} ${m.code} ${m.name}</h3><span class="credits big">$${U.fmtNum(S.data.credits)}</span></div>
          <div class="lgrid">
            <section><div class="lbl">${t('lo.primary')}</div><div class="opts">${prim}</div>
              <div class="wdetail"><div class="wname">${esc(pw.name)}</div><div class="dim">${esc(pw.desc)}</div>${this.statBars(pw)}<div class="mods">${mods}</div></div></section>
            <section><div class="lbl">${t('lo.secondary')}</div><div class="opts">${sec}</div>
              <div class="wdetail"><div class="wname">${esc(sw.name)}</div><div class="dim">${esc(sw.desc)}</div>${this.statBars(sw)}<div class="mods">${smods}</div></div>
              <div class="lbl">${t('lo.special')}</div><div class="opts"><div class="opt sel fixed"><div class="oname">Taser X2</div><div class="osub">${t('lo.taserSub')}</div></div></div>
              <div class="lbl">${t('lo.headgear')}</div><div class="opts">${group('headgear', D.headgear)}</div>
              <div class="dim small">${esc(headSel.desc)}</div>
            </section>
            <section><div class="lbl">${t('lo.armor')}</div><div class="opts col">${group('armor', D.armor, true)}</div>
              <div class="lbl">${t('lo.tactical')}</div><div class="opts">${group('tactical', D.tactical)}</div>
              <div class="dim small">${tacSel ? esc(tacSel.desc) : ''}</div>
              <div class="lbl">${t('lo.utility')}</div><div class="opts">${group('utility', D.utility)}</div>
              <div class="lbl">${t('lo.gadget')}</div><div class="opts">${group('gadget', D.gadget)}</div>
              <div class="dim small">${esc(gadSel.desc)}</div></section>
          </div>
          <div class="deploybar"><div class="dim">${t('lo.team')}</div>
          <button class="primary big" data-a="deploy">${t('lo.deploy')}</button></div>
        </div>`;
      },

      operators() {
        const d = S.data, lvl = D.levelFromXP(d.xp);
        const bar = (k) => '█'.repeat(k) + '░'.repeat(10 - k);
        const cards = [`<div class="opcard lead"><div class="opcall" style="color:#5fa8e8">ALPHA-1</div><h4>Daniel Cross</h4><div class="oprole">${t('op.leadRole')}</div>
            <div class="opstats"><div>${t('op.rank')} <b>${D.rankName(lvl)}</b></div><div>${t('op.level')} <b>${lvl}</b></div><div>${t('op.missions')} <b>${d.stats.missions}</b></div><div>${t('op.arrests')} <b>${d.stats.arrests}</b></div><div>${t('op.rescued')} <b>${d.stats.rescued}</b></div></div>
            <p class="dim">${t('op.leadBio')}</p></div>`]
          .concat(D.operators.map((o) => `<div class="opcard" style="border-top-color:${o.color}"><div class="opcall" style="color:${o.color}">${o.call.toUpperCase()}</div><h4>${o.name}</h4><div class="oprole">${t('role.' + o.role)}</div>
            <pre class="opbars">${Object.entries(o.stats).map(([k, v]) => t('opstat.' + k).padEnd(12) + ' ' + bar(v)).join('\n')}</pre>
            <div class="dim">${t('op.weapon')}: ${D.weapons[o.weapon].name}${o.charges ? ' · C2 ×' + o.charges : ''}${o.flash ? ' · Flash ×' + o.flash : ''}</div>
            <p class="dim">${t('bio.' + o.id)}</p></div>`)).join('');
        return `<div class="screen"><div class="shead"><button class="back" data-a="nav" data-v="main">${t('back')}</button><h3>${t('op.title')}</h3></div>
          <div class="opgrid">${cards}</div></div>`;
      },

      armory() {
        const item = (id, name, cat, price, desc) => {
          const own = S.owns(id);
          const can = S.data.credits >= price;
          return `<div class="aitem ${own ? 'owned' : ''}"><div class="acat">${t('cat.' + cat)}</div><div class="aname">${esc(name)}</div><div class="dim">${esc(desc || '')}</div>
            <div class="abuy">${own ? '<span class="ok">' + t('arm.owned') + '</span>' : `<button class="${can ? '' : 'disabled'}" data-a="buy" data-v="${id}:${price}">${t('arm.buy')} $${U.fmtNum(price)}</button>`}</div></div>`;
        };
        const ws = Object.values(D.weapons).filter((w) => w.price != null && !w.id.startsWith('e_')).sort((a, b) => a.price - b.price)
          .map((w) => item(w.id, w.name, w.slot === 'secondary' ? 'SIDEARM' : w.isShield ? 'SHIELD' : w.cat.toUpperCase(), w.price, w.desc));
        const grp = (obj, cat) => Object.values(obj).map((a) => item(a.id, a.name, cat, a.price, a.desc));
        const all = ws.concat(grp(D.mods, 'ATTACHMENT'), grp(D.armor, 'ARMOR'), grp(D.headgear, 'HEADGEAR'), grp(D.tactical, 'TACTICAL'), grp(D.utility, 'UTILITY'), grp(D.gadget, 'GADGET'));
        return `<div class="screen"><div class="shead"><button class="back" data-a="nav" data-v="main">${t('back')}</button><h3>${t('arm.title')}</h3><span class="credits big">$${U.fmtNum(S.data.credits)}</span></div>
          <div class="agrid">${all.join('')}</div></div>`;
      },

      training(arg) {
        this.lastArg = arg;
        const k = (key, what) => `<div class="krow"><kbd>${key}</kbd><span>${t(what)}</span></div>`;
        return `<div class="screen"><div class="shead">${arg && arg.fromPause ? '<button class="back" data-a="backPause">' + t('back') + '</button>' : '<button class="back" data-a="nav" data-v="main">' + t('back') + '</button>'}<h3>${t('tr.title')}</h3></div>
          <div class="tgrid">
            <section><div class="lbl">${t('tr.move')}</div>
              ${k('W A S D', 'k.move')}${k('MOUSE', 'k.aim')}${k('LMB', 'k.fire')}${k('RMB', 'k.ads')}${k('SHIFT', 'k.sprint')}${k('CTRL', 'k.walk')}${k('R', 'k.reload')}${k('1 / 2 / 3', 'k.slots')}${k('WHEEL', 'k.zoom')}${k('M', 'k.map')}${k('ESC', 'k.pause')}
            </section>
            <section><div class="lbl">${t('tr.tac')}</div>
              ${k('SPACE', 'k.yell')}${k('E', 'k.use')}${k('Q', 'k.mirror')}${k('F', 'k.kick')}${k('B', 'k.charge')}${k('G / C', 'k.grenade')}${k('V', 'k.wedge')}${k('T', 'k.drone')}${k('H', 'k.medkit')}
            </section>
            <section><div class="lbl">${t('tr.team')}</div>
              ${k('TAB / MMB', 'k.wheel')}${k('F1 / Z', 'k.follow')}${k('F2 / X', 'k.hold')}${k('F3', 'k.moveTo')}${k('F4', 'k.stack')}${k('F5', 'k.flashclear')}${k('F6', 'k.openclear')}${k('F7', 'k.cover')}${k('F8', 'k.restrain')}
            </section>
            <section class="wide"><div class="lbl">${t('tr.roe')}</div>
              <p>${t('tr.p1')}</p>
              <ul>${TR.L.raw('tr.roeList').map((li) => '<li>' + li + '</li>').join('')}</ul>
            </section>
          </div></div>`;
      },

      settings() {
        const s = S.data.settings;
        const slider = (id, label) => `<div class="setrow"><span>${t(label)}</span><input type="range" min="0" max="1" step="0.05" value="${s[id]}" data-set="${id}"><output>${Math.round(s[id] * 100)}%</output></div>`;
        const tog = (id, label) => `<div class="setrow"><span>${t(label)}</span><button class="tog ${s[id] ? 'on' : ''}" data-a="toggle" data-v="${id}">${s[id] ? t('on') : t('off')}</button></div>`;
        return `<div class="screen narrow"><div class="shead"><button class="back" data-a="nav" data-v="${this.app.game && this.app.paused ? 'pause' : 'main'}">${t('back')}</button><h3>${t('set.title')}</h3></div>
          <div class="setbox">
            <div class="lbl">${t('set.language')}</div><div class="setrow langrow">${this.langPicker()}</div>
            <div class="lbl">${t('set.audio')}</div>${slider('master', 'set.master')}${slider('sfx', 'set.sfx')}${slider('voice', 'set.voice')}${slider('ambience', 'set.amb')}
            <div class="lbl">${t('set.gameplay')}</div>${tog('hints', 'set.hints')}${tog('shake', 'set.shake')}
            <div class="lbl">${t('set.display')}</div>${tog('fullscreen', 'set.fullscreen')}${tog('vignette', 'set.vignette')}
            <div class="lbl">${t('set.data')}</div><div class="setrow"><span>${t('set.progress')}</span><button data-a="resetSave">${t('set.reset')}</button></div>
          </div></div>`;
      },

      pause() {
        const g = this.app.game;
        return `<div class="pausebox"><div class="kicker">${t('pause.kicker')}</div><h2>${g.mission.name}</h2>
          <button data-a="resume">${t('pause.resume')}</button><button data-a="restart">${t('pause.restart')}</button>
          <button data-a="pauseControls">${t('pause.controls')}</button><button data-a="nav" data-v="settings">${t('pause.settings')}</button>
          <button data-a="saveQuit">${t('pause.quit')}</button>
          <button class="danger" data-a="abort">${t('pause.abort')}</button></div>`;
      },

      deploy(arg) {
        const m = arg.m || arg;
        return `<div class="deploy"><div class="kicker">${arg.resume ? t('deploy.resume') : t('deploy.kicker')}</div><h1>${m.name}</h1><div class="bloc">${esc(m.location)} · ${m.time}</div><div class="loadbar"><i></i></div></div>`;
      },

      result(r) {
        this.lastResult = r;
        const tb = r.table;
        const lines = r.lines.map((l) => `<div class="rline ${l.penalty ? 'pen' : ''}"><span>${esc(l.label)}</span><b>${l.value > 0 ? '+' : ''}${U.fmtNum(l.value)}</b></div>`).join('');
        return `<div class="screen result">
          <div class="rhead ${r.success ? 'ok' : 'fail'}"><div class="kicker">${t('camp.mission')} ${r.mission.code} · ${r.mission.name}</div>
            <h1>${r.success ? t('res.complete') : t('res.failed')}</h1><div class="dim">${esc(r.reason || '')}</div></div>
          <div class="rgrid">
            <section><div class="lbl">${t('res.objectives')}</div>
              ${tb.vip ? `<div class="rrow"><span>${t('res.vip')}</span><b>${tb.vip === 'Rescued' ? t('res.rescued') : t('res.lost')}</b></div>` : ''}
              <div class="rrow"><span>${t('res.civ')}</span><b>${tb.civilians}</b></div>
              <div class="rrow"><span>${t('res.sus')}</span><b>${tb.suspects}</b></div>
              <div class="rrow sub"><span>${t('res.arrNeu')}</span><b>${tb.arrested} / ${tb.neutralized}</b></div>
              <div class="rrow"><span>${t('res.ev')}</span><b>${tb.evidence}</b></div>
              <div class="lbl">${t('res.casualties')}</div>
              <div class="rrow"><span>${t('res.civilians')}</span><b class="${tb.civDead ? 'bad' : ''}">${tb.civDead}</b></div>
              <div class="rrow"><span>${t('res.team')}</span><b class="${tb.teamDown ? 'bad' : ''}">${tb.teamDown}</b></div>
              <div class="lbl">${t('res.perf')}</div>
              <div class="rrow"><span>${t('res.time')}</span><b>${U.fmtTime(r.time)}</b></div>
              <div class="rrow"><span>${t('res.acc')}</span><b>${tb.accuracy}</b></div>
            </section>
            <section><div class="lbl">${t('res.breakdown')}</div><div class="rlines">${lines}</div></section>
            <section class="rsum"><div class="grade big g-${r.grade}">${r.grade}</div>
              <div class="lbl">${t('res.score')}</div><div class="rbig">${U.fmtNum(r.score)}</div>
              <div class="lbl">${t('res.xp')}</div><div class="rmid">+${U.fmtNum(r.xp)}</div>
              <div class="lbl">${t('res.credits')}</div><div class="rmid credits">+$${U.fmtNum(r.credits)}</div>
              <div class="dim small">${t('res.reward')} $${U.fmtNum(r.reward)} · ${t('res.bonus')} $${U.fmtNum(r.bonus)}</div>
            </section>
          </div>
          <div class="deploybar"><button data-a="resultRetry">${t('res.retry')}</button><button class="primary big" data-a="resultContinue">${t('res.continue')}</button></div>
        </div>`;
      }
    }
  };
  TR.UI = UI;
})(window.TR);
