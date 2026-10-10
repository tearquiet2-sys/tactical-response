// Data definitions (the JS equivalent of the GDD's ScriptableObjects: WeaponData, EquipmentData, OperatorData, EnemyData).
(function (TR) {
  const D = {};

  // spread values are in degrees (half-angle), recoil = bloom added per shot (deg)
  D.weapons = {
    px9: { id: 'px9', name: 'PX-9', cal: '9mm', cat: 'pistol', slot: 'secondary', damage: 35, mag: 17, mags: 4, rpm: 420, auto: false, reload: 1.5, spread: 2.2, ads: 0.9, recoil: 1.6, recover: 14, range: 30, noise: 20, heavy: 0.75, len: 9, price: 0, suppressible: true, desc: 'Reliable 9mm service pistol. Low recoil, high accuracy.' },
    vektor: { id: 'vektor', name: 'Vektor .45', cal: '.45 ACP', cat: 'pistol', slot: 'secondary', damage: 45, mag: 12, mags: 4, rpm: 360, auto: false, reload: 1.6, spread: 2.6, ads: 1.1, recoil: 2.8, recover: 12, range: 30, noise: 22, heavy: 0.85, len: 9, price: 2500, suppressible: true, desc: 'Heavy .45 sidearm. More stopping power, more kick.' },
    m10: { id: 'm10', name: 'M10', cal: '9mm', cat: 'pistol', slot: 'secondary', damage: 32, mag: 20, mags: 4, rpm: 900, auto: true, reload: 1.5, spread: 3.2, ads: 1.6, recoil: 1.5, recover: 12, range: 24, noise: 20, heavy: 0.75, len: 10, price: 3000, suppressible: true, desc: 'Machine pistol. Very high fire rate, hard to control.' },
    mp5k: { id: 'mp5k', name: 'MP-5K', cal: '9mm', cat: 'smg', slot: 'primary', damage: 30, mag: 30, mags: 5, rpm: 800, auto: true, reload: 2.0, spread: 2.6, ads: 1.0, recoil: 0.8, recover: 13, range: 32, noise: 22, heavy: 0.85, len: 13, price: 0, suppressible: true, desc: 'Compact SMG. Low recoil, ideal for tight rooms.' },
    v9: { id: 'v9', name: 'V9', cal: '9mm', cat: 'smg', slot: 'primary', damage: 28, mag: 32, mags: 5, rpm: 1100, auto: true, reload: 2.0, spread: 2.8, ads: 1.1, recoil: 0.7, recover: 13, range: 30, noise: 22, heavy: 0.85, len: 14, price: 4500, suppressible: true, desc: 'Delayed-blowback SMG with an extreme rate of fire.' },
    ar15: { id: 'ar15', name: 'AR-15 Tactical', cal: '5.56', cat: 'rifle', slot: 'primary', damage: 40, mag: 30, mags: 4, rpm: 720, auto: true, reload: 2.1, spread: 2.2, ads: 0.6, recoil: 1.1, recover: 11, range: 45, noise: 30, heavy: 1.15, len: 17, price: 0, suppressible: true, desc: 'Accurate carbine. The unit\'s standard issue.' },
    mk17: { id: 'mk17', name: 'MK-17', cal: '7.62', cat: 'rifle', slot: 'primary', damage: 48, mag: 30, mags: 4, rpm: 600, auto: true, reload: 2.4, spread: 2.4, ads: 0.6, recoil: 2.0, recover: 10, range: 50, noise: 34, heavy: 1.35, len: 18, price: 6000, suppressible: true, desc: 'Battle rifle. Hits hard, recoils harder.' },
    m4sg: { id: 'm4sg', name: 'M4 Tactical Shotgun', cal: '12ga', cat: 'shotgun', slot: 'primary', damage: 15, pellets: 8, mag: 8, mags: 4, shellReload: true, rpm: 170, auto: false, reload: 0.45, spread: 5.5, ads: 4.5, recoil: 3, recover: 9, range: 20, noise: 32, heavy: 1.3, len: 16, price: 0, suppressible: false, desc: 'Semi-auto 12 gauge. Devastating up close.' },
    beanbag: { id: 'beanbag', name: 'Beanbag Shotgun', cal: '12ga LL', cat: 'less', slot: 'primary', damage: 6, stun: 2.2, morale: 0.35, mag: 5, mags: 5, shellReload: true, rpm: 90, auto: false, reload: 0.5, spread: 1.5, ads: 0.8, recoil: 3, recover: 9, range: 18, noise: 18, heavy: 1.0, len: 16, price: 3500, suppressible: false, lessLethal: true, desc: 'Less-lethal. Knocks suspects down and breaks their will.' },
    taser: { id: 'taser', name: 'Taser X2', cal: 'Probe', cat: 'less', slot: 'special', damage: 0, stun: 5.5, mag: 1, mags: 4, rpm: 60, auto: false, reload: 1.8, spread: 1.2, ads: 0.7, recoil: 0, recover: 10, range: 7, noise: 6, heavy: 0.5, len: 7, price: 0, suppressible: false, lessLethal: true, taser: true, desc: 'Electroshock. Range 7m. Instantly incapacitates.' },
    shield: { id: 'shield', name: 'Tactical Shield', cat: 'shield', slot: 'primary', price: 5000, isShield: true, desc: 'Ballistic shield. Blocks frontal fire. Pistol only, slower movement.' },
    r357: { id: 'r357', name: 'R-357 Magnum', cal: '.357', cat: 'pistol', slot: 'secondary', damage: 62, mag: 6, mags: 5, rpm: 150, auto: false, reload: 2.4, spread: 2.0, ads: 0.7, recoil: 4.2, recover: 9, range: 34, noise: 26, heavy: 1.0, len: 10, price: 2200, suppressible: false },
    u45: { id: 'u45', name: 'U-45', cal: '.45 ACP', cat: 'smg', slot: 'primary', damage: 38, mag: 25, mags: 5, rpm: 600, auto: true, reload: 2.2, spread: 2.4, ads: 0.9, recoil: 1.1, recover: 13, range: 30, noise: 22, heavy: 0.95, len: 14, price: 3200, suppressible: true },
    g3c: { id: 'g3c', name: 'G3C Compact', cal: '5.56', cat: 'rifle', slot: 'primary', damage: 38, mag: 30, mags: 4, rpm: 760, auto: true, reload: 1.9, spread: 2.0, ads: 0.55, recoil: 0.85, recover: 12, range: 42, noise: 30, heavy: 1.1, len: 15, price: 5200, suppressible: true },
    sps12: { id: 'sps12', name: 'SPS-12 Pump', cal: '12ga', cat: 'shotgun', slot: 'primary', damage: 16, pellets: 9, mag: 6, mags: 5, shellReload: true, rpm: 75, auto: false, reload: 0.5, spread: 4.8, ads: 3.8, recoil: 3.5, recover: 8, range: 22, noise: 32, heavy: 1.35, len: 17, price: 2800, suppressible: false, pump: true },
    pepper: { id: 'pepper', name: 'PB-4 Pepperball', cal: 'PAVA', cat: 'less', slot: 'primary', damage: 3, stun: 0.9, morale: 0.12, gas: true, mag: 20, mags: 5, rpm: 420, auto: false, reload: 2.0, spread: 1.8, ads: 0.9, recoil: 0.6, recover: 12, range: 22, noise: 10, heavy: 0.55, len: 15, price: 4000, suppressible: false, lessLethal: true },
    // enemy weapons
    e_pistol: { id: 'e_pistol', name: 'Pistol', cat: 'pistol', damage: 24, mag: 15, rpm: 300, auto: false, reload: 1.8, spread: 4.0, recoil: 2.5, recover: 10, range: 26, noise: 20, heavy: 0.75, len: 8 },
    e_revolver: { id: 'e_revolver', name: 'Revolver', cat: 'pistol', damage: 36, mag: 6, rpm: 170, auto: false, reload: 2.6, spread: 4.0, recoil: 3.5, recover: 9, range: 26, noise: 22, heavy: 0.9, len: 9 },
    e_smg: { id: 'e_smg', name: 'Mac SMG', cat: 'smg', damage: 20, mag: 30, rpm: 700, auto: true, reload: 2.2, spread: 6.0, recoil: 1.8, recover: 8, range: 22, noise: 22, heavy: 0.8, len: 11 },
    e_shotgun: { id: 'e_shotgun', name: 'Sawed-off', cat: 'shotgun', damage: 12, pellets: 7, mag: 2, rpm: 200, auto: false, reload: 2.4, spread: 7, recoil: 4, recover: 8, range: 14, noise: 30, heavy: 1.3, len: 12 },
    e_rifle: { id: 'e_rifle', name: 'AK Rifle', cat: 'rifle', damage: 30, mag: 30, rpm: 600, auto: true, reload: 2.5, spread: 4.5, recoil: 1.6, recover: 8, range: 40, noise: 32, heavy: 1.3, len: 17 }
  };

  D.primaryOptions = ['ar15', 'g3c', 'mk17', 'mp5k', 'u45', 'v9', 'm4sg', 'sps12', 'beanbag', 'pepper', 'shield'];
  D.secondaryOptions = ['px9', 'vektor', 'm10', 'r357'];
  // descriptions come from the language files ('d.<id>')
  Object.values(D.weapons).forEach((w) => { Object.defineProperty(w, 'desc', { get() { return TR.t('d.' + w.id); }, configurable: true }); });

  const named = (o) => { Object.values(o).forEach((x) => { Object.defineProperty(x, 'name', { get() { return TR.t('n.' + x.id); }, configurable: true }); Object.defineProperty(x, 'desc', { get() { return TR.t('d.' + (x.descKey || x.id)); }, configurable: true }); }); return o; };

  D.mods = named({
    suppressor: { id: 'suppressor', price: 2000 },
    optic: { id: 'optic', price: 1500 },
    extmag: { id: 'extmag', price: 1800 },
    laser: { id: 'laser', price: 1200 }
  });

  D.armor = named({
    light: { id: 'light', armor: 50, speed: 1.06, price: 0 },
    tactical: { id: 'tactical', armor: 100, speed: 1.0, price: 0 },
    heavy: { id: 'heavy', armor: 160, speed: 0.88, price: 4000 }
  });

  // grenades: G throws the first remaining one in the list
  D.tactical = named({
    flash2: { id: 'flash2', gren: [['flash', 2]], price: 0, descKey: 'flash' },
    flash1: { id: 'flash1', gren: [['flash', 1]], price: 0, descKey: 'flash' },
    flash3: { id: 'flash3', gren: [['flash', 3]], price: 1200, descKey: 'flash' },
    stinger2: { id: 'stinger2', gren: [['stinger', 2]], price: 2500, descKey: 'stinger' },
    cs2: { id: 'cs2', gren: [['cs', 2]], price: 2000, descKey: 'cs' },
    smoke2: { id: 'smoke2', gren: [['smoke', 2]], price: 1000, descKey: 'smoke' },
    mixed: { id: 'mixed', gren: [['flash', 1], ['cs', 1]], price: 2400, descKey: 'cs' }
  });
  D.utility = named({
    charge1: { id: 'charge1', charges: 1, medkits: 0, price: 0, descKey: 'nogadget' },
    medkit: { id: 'medkit', charges: 0, medkits: 2, price: 0, descKey: 'nogadget' },
    charge2: { id: 'charge2', charges: 2, medkits: 0, price: 2200, descKey: 'nogadget' },
    combo: { id: 'combo', charges: 1, medkits: 1, price: 3000, descKey: 'nogadget' }
  });
  D.gadget = named({
    nogadget: { id: 'nogadget', price: 0 },
    lockpick: { id: 'lockpick', price: 0 },
    wedge3: { id: 'wedge3', price: 1500, descKey: 'wedge' },
    drone: { id: 'drone', price: 6000 }
  });
  D.headgear = named({
    helmet: { id: 'helmet', dmg: 1, price: 0 },
    ballistic: { id: 'ballistic', dmg: 0.85, price: 2500 },
    gasmask: { id: 'gasmask', dmg: 1, gasImmune: true, flashMul: 0.7, price: 1800 }
  });

  D.operators = [
    { id: 'reed', call: 'Alpha-2', name: 'Mason Reed', role: 'BREACHER', color: '#d9893b', weapon: 'm4sg', flash: 0, charges: 2, stats: { Breaching: 8, Accuracy: 6, Speed: 7, Leadership: 4 }, bio: 'Ex-SWAT entry specialist. Nine years kicking doors in Greybridge South.' },
    { id: 'grant', call: 'Alpha-3', name: 'Elias Grant', role: 'SUPPORT', color: '#3fb5a5', weapon: 'ar15', flash: 3, charges: 0, stats: { Breaching: 4, Accuracy: 8, Speed: 6, Leadership: 6 }, bio: 'Tactical equipment specialist. Carries the team\'s flashbangs.' },
    { id: 'carter', call: 'Alpha-4', name: 'Noah Carter', role: 'POINTMAN', color: '#9a7de0', weapon: 'mp5k', flash: 1, charges: 0, stats: { Breaching: 5, Accuracy: 7, Speed: 8, Leadership: 5 }, bio: 'Former Army MP. First through the door, last to leave.' }
  ];

  D.enemyTypes = {
    nervous: { label: 'Nervous', hp: 90, reaction: [0.75, 1.2], accuracy: 1.35, comply: 0.55, turn: 4.0, fleeHp: 55, fakeSurrender: 0, weapons: ['e_pistol', 'e_revolver'], clothes: ['#6b5a45', '#4f5b3a', '#6d4b4b'], speed: 3.0 },
    aggressive: { label: 'Aggressive', hp: 110, reaction: [0.45, 0.8], accuracy: 1.0, comply: 0.12, turn: 6.0, fleeHp: 0, fakeSurrender: 0.25, weapons: ['e_smg', 'e_shotgun', 'e_pistol'], clothes: ['#7a2f2a', '#3b3b3b', '#5a2a3f'], speed: 3.4 },
    tactical: { label: 'Tactical', hp: 110, reaction: [0.5, 0.85], accuracy: 0.85, comply: 0.25, turn: 5.0, fleeHp: 30, fakeSurrender: 0.1, weapons: ['e_rifle', 'e_smg'], clothes: ['#353a33', '#2e3238', '#453c30'], speed: 3.2 },
    leader: { label: 'Leader', hp: 130, reaction: [0.5, 0.8], accuracy: 0.8, comply: 0.18, turn: 5.0, fleeHp: 35, fakeSurrender: 0.2, weapons: ['e_rifle', 'e_revolver'], clothes: ['#1e1e22', '#2a2320'], speed: 3.2 },
    hostageTaker: { label: 'Hostage Taker', hp: 110, reaction: [0.4, 0.6], accuracy: 0.9, comply: 0.3, turn: 5.0, fleeHp: 0, fakeSurrender: 0, weapons: ['e_pistol', 'e_revolver'], clothes: ['#50302a', '#3d3326'], speed: 3.0 }
  };

  D.civilianClothes = ['#b8b2a2', '#6f8fa8', '#a6754f', '#8a9b6e', '#c9a86a', '#7c6a8c', '#b57c7c', '#5c7a85', '#d0d0cc'];
  D.skin = ['#e0b896', '#c99a73', '#a8764f', '#7a5236', '#edc9a8', '#5e3d27'];
  D.hair = ['#1b1612', '#3a2a1c', '#6a4a2a', '#8a8074', '#b89560', '#222222'];

  // XP / penalties (GDD sections 27-28)
  D.xp = { complete: 500, civilian: 100, arrest: 150, neutralized: 40, evidence: 75, hostage: 250, noDamage: 300 };
  D.penalty = { civilianShot: -500, unauthorized: -200, hostageDeath: -1000, officerDown: -300, evidenceLeft: -50, civilianInjured: -150 };

  D.levelFromXP = (xp) => Math.floor(Math.sqrt(xp / 600)) + 1;
  D.xpForLevel = (lvl) => (lvl - 1) * (lvl - 1) * 600;
  D.rankName = (lvl) => TR.L.raw('rank')[Math.min(8, lvl - 1)];

  TR.D = D;
})(window.TR);
