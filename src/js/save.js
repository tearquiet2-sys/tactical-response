// Save system (GDD 42): profile (XP, credits, unlocks, scores, settings) + a mid-mission resume slot.
// Desktop build: JSON files in the user data folder (atomic writes). Browser fallback: localStorage.
(function (TR) {
  const KEY = 'tactical_response_save_v1', RKEY = 'tactical_response_resume_v1';
  const defaults = () => ({
    version: 1, xp: 0, credits: 1500, savedAt: 0,
    completed: {}, // id -> { score, grade, time }
    owned: ['ar15', 'mp5k', 'm4sg', 'px9', 'taser', 'light', 'tactical', 'flash1', 'flash2', 'charge1', 'medkit', 'nogadget', 'lockpick', 'helmet'],
    loadout: { primary: 'ar15', secondary: 'px9', armor: 'tactical', tactical: 'flash2', utility: 'charge1', gadget: 'lockpick', headgear: 'helmet', mods: {} },
    settings: { master: 0.8, sfx: 0.9, voice: 0.8, ambience: 0.5, shake: true, hints: true, fullscreen: false, vignette: true, lang: null },
    stats: { missions: 0, arrests: 0, rescued: 0 }
  });
  const desk = () => window.desktop && window.desktop.readSave;
  const readRaw = (name, key) => {
    let a = null, b = null;
    try { if (desk()) a = JSON.parse(window.desktop.readSave(name)); } catch (e) { a = null; }
    try { b = JSON.parse(localStorage.getItem(key)); } catch (e) { b = null; }
    if (a && b) return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
    return a || b;
  };
  const writeRaw = (name, key, obj) => {
    const text = obj == null ? null : JSON.stringify(obj);
    try { if (desk()) window.desktop.writeSave(name, text); } catch (e) { /* ignore */ }
    try { if (text == null) localStorage.removeItem(key); else localStorage.setItem(key, text); } catch (e) { /* ignore */ }
  };

  const Save = {
    data: null, resume: null,
    load() {
      let d = readRaw('profile', KEY);
      const def = defaults();
      if (!d || d.version !== 1) d = def;
      else {
        d.settings = Object.assign(def.settings, d.settings || {});
        d.loadout = Object.assign(def.loadout, d.loadout || {});
        d.owned = Array.from(new Set(def.owned.concat(d.owned || [])));
        d.stats = Object.assign(def.stats, d.stats || {});
      }
      // one-time v0.5 bonus so existing players can try the new gear
      if (!d.bonus05) { d.bonus05 = true; if (d.xp > 0 || Object.keys(d.completed).length) d.credits += 5000; }
      this.data = d;
      this.resume = readRaw('resume', RKEY);
      if (this.resume && (!this.resume.v || !this.resume.mission)) this.resume = null;
      return d;
    },
    save() { this.data.savedAt = Date.now(); writeRaw('profile', KEY, this.data); },
    saveResume(snap) { this.resume = snap; if (snap) snap.savedAt = Date.now(); writeRaw('resume', RKEY, snap); },
    clearResume() { this.resume = null; writeRaw('resume', RKEY, null); },
    reset() { this.data = defaults(); this.save(); this.clearResume(); },
    owns(id) { return this.data.owned.includes(id); },
    buy(id, price) {
      if (this.owns(id) || this.data.credits < price) return false;
      this.data.credits -= price; this.data.owned.push(id); this.save(); return true;
    },
    unlockedMission(id) { return id === 1 || !!this.data.completed[id - 1]; }
  };
  TR.Save = Save;
})(window.TR);
