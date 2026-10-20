// Operation modes: rule sets layered on top of any playable mission, plus the seeded Daily Operation.
(function (TR) {
  const S = () => TR.Save;

  // mult: score multiplier (also scales the mission reward). Extra fields are read by Game.
  const MODES = {
    standard: { id: 'standard', mult: 1 },
    lonewolf: { id: 'lonewolf', mult: 1.4, noSquad: true },
    timecrit: { id: 'timecrit', mult: 1.3, timeFactor: 0.5 },
    hardcore: { id: 'hardcore', mult: 1.6, dmgTaken: 1.8, noMedkits: true, noGhosts: true, enemy: { accuracy: 0.72, comply: -0.08, reaction: 0.8 } },
    escalation: { id: 'escalation', mult: 1.5, waves: [{ t: 60, n: 2 }, { t: 130, n: 3 }, { t: 200, n: 3 }] }
  };
  const ORDER = ['standard', 'lonewolf', 'timecrit', 'hardcore', 'escalation'];
  const DAILY_BASES = ['lonewolf', 'timecrit', 'hardcore', 'escalation'];

  // small deterministic PRNG for the daily seed
  const mulberry32 = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const Modes = {
    ORDER, defs: MODES, mulberry32,
    dayKey(d) { d = d || new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); },
    // today's operation: mission + rule set + spawn seed are the same for the whole day
    daily() {
      const key = this.dayKey();
      const rng = mulberry32(key * 7919);
      const pool = TR.Missions.filter((m) => m.playable && S().unlockedMission(m.id));
      const mission = pool[Math.floor(rng() * pool.length)] || TR.Missions[0];
      const base = DAILY_BASES[Math.floor(rng() * DAILY_BASES.length)];
      return { key, mission, base, seed: key };
    },
    // a mode is unlocked once the mission has been completed (any mode); daily is always open
    unlocked(id, missionId) { return id === 'standard' || id === 'daily' || !!S().data.completed[missionId]; },
    // resolved rule set handed to the Game
    resolve(id, mission) {
      if (id === 'daily') {
        const dl = this.daily();
        const b = MODES[dl.base];
        return Object.assign({}, b, { id: 'daily', base: dl.base, seed: dl.seed, dayKey: dl.key, mult: +(b.mult + 0.25).toFixed(2), timeLimit: b.timeFactor ? Math.round(mission.parTime * b.timeFactor) : 0 });
      }
      const m = MODES[id] || MODES.standard;
      return Object.assign({}, m, { timeLimit: m.timeFactor ? Math.round(mission.parTime * m.timeFactor) : 0 });
    },
    name(id) { return TR.t('mode.' + id); },
    label(mode) { return mode.id === 'daily' ? this.name('daily') + ' · ' + this.name(mode.base) : this.name(mode.id); },
    bestKey(missionId, id) { return missionId + ':' + id; },
    best(missionId, id) { const mb = S().data.modeBest || {}; return mb[this.bestKey(missionId, id)] || null; }
  };
  TR.Modes = Modes;

  // ------------------------------------------------------------------ texts (merged into the language files)
  const T = {
    en: {
      'mode.title': 'OPERATION MODE', 'mode.locked': 'Complete this mission once to unlock', 'mode.mult': 'Score ×{0}', 'mode.best': 'Best',
      'mode.standard': 'STANDARD', 'mode.d.standard': 'The full operation with your squad. The baseline experience.',
      'mode.lonewolf': 'LONE WOLF', 'mode.d.lonewolf': 'No squad. Every door, every arrest and every mistake is on you.',
      'mode.timecrit': 'TIME CRITICAL', 'mode.d.timecrit': 'Contain the scene (all mandatory objectives) in {0} or the operation fails.',
      'mode.hardcore': 'HARDCORE', 'mode.d.hardcore': 'Suspects react faster, aim better and surrender less. You take more damage, carry no medkits and lose ghost markers.',
      'mode.escalation': 'ESCALATION', 'mode.d.escalation': 'Armed reinforcements storm the building in 3 waves until the scene is contained.',
      'mode.daily': 'DAILY OP', 'mode.d.daily': 'Today\'s fixed operation: same mission, same suspect layout, same rule set ({0}). Resets at midnight.',
      'menu.daily': 'DAILY OPERATION', 'menu.dailySub': '{0} · {1}', 'menu.dailyBest': 'best {0}',
      'hud.timeLeft': 'TIME LEFT', 'hud.wave': 'WAVE {0}/{1}', 'hud.nextWave': 'next in {0}', 'hud.wavesDone': 'NO MORE REINFORCEMENTS', 'hud.contained': 'SCENE CONTAINED', 'hud.solo': 'LONE WOLF · NO SQUAD',
      'radio.wave': 'Reinforcements entering the building! Wave {0} of {1}.', 'radio.time60': 'One minute left to contain the scene!', 'radio.time30': 'Thirty seconds!',
      'radio.contained': 'Scene contained in time. Good work.',
      'reason.time': 'Time ran out before the scene was contained.',
      'sl.mode': 'Mode bonus · {0} ×{1}'
    },
    tr: {
      'mode.title': 'OPERASYON MODU', 'mode.locked': 'Açmak için görevi bir kez tamamla', 'mode.mult': 'Skor ×{0}', 'mode.best': 'En iyi',
      'mode.standard': 'STANDART', 'mode.d.standard': 'Ekibinle tam operasyon. Temel deneyim.',
      'mode.lonewolf': 'YALNIZ KURT', 'mode.d.lonewolf': 'Ekip yok. Her kapı, her gözaltı ve her hata senin üzerinde.',
      'mode.timecrit': 'ZAMANA KARŞI', 'mode.d.timecrit': 'Olayı {0} içinde kontrol altına al (tüm zorunlu hedefler), yoksa operasyon başarısız olur.',
      'mode.hardcore': 'ZORLU', 'mode.d.hardcore': 'Şüpheliler daha hızlı tepki verir, daha iyi nişan alır ve daha zor teslim olur. Daha fazla hasar alırsın, ilk yardım çantası yok, hayalet işaretler kapalı.',
      'mode.escalation': 'TIRMANMA', 'mode.d.escalation': 'Olay kontrol altına alınana kadar silahlı takviyeler 3 dalga hâlinde binaya girer.',
      'mode.daily': 'GÜNLÜK OP', 'mode.d.daily': 'Bugünün sabit operasyonu: aynı görev, aynı şüpheli yerleşimi, aynı kural ({0}). Gece yarısı yenilenir.',
      'menu.daily': 'GÜNLÜK OPERASYON', 'menu.dailySub': '{0} · {1}', 'menu.dailyBest': 'en iyi {0}',
      'hud.timeLeft': 'KALAN SÜRE', 'hud.wave': 'DALGA {0}/{1}', 'hud.nextWave': 'sonraki {0}', 'hud.wavesDone': 'TAKVİYE KALMADI', 'hud.contained': 'OLAY KONTROL ALTINDA', 'hud.solo': 'YALNIZ KURT · EKİP YOK',
      'radio.wave': 'Binaya takviye giriyor! Dalga {0}/{1}.', 'radio.time60': 'Olayı kontrol altına almak için bir dakika kaldı!', 'radio.time30': 'Otuz saniye!',
      'radio.contained': 'Olay zamanında kontrol altına alındı. İyi iş.',
      'reason.time': 'Olay kontrol altına alınamadan süre doldu.',
      'sl.mode': 'Mod bonusu · {0} ×{1}'
    },
    de: {
      'mode.title': 'EINSATZMODUS', 'mode.locked': 'Schließe die Mission einmal ab, um freizuschalten', 'mode.mult': 'Punkte ×{0}', 'mode.best': 'Bestwert',
      'mode.standard': 'STANDARD', 'mode.d.standard': 'Der vollständige Einsatz mit deinem Team. Das Grunderlebnis.',
      'mode.lonewolf': 'EINZELGÄNGER', 'mode.d.lonewolf': 'Kein Team. Jede Tür, jede Festnahme und jeder Fehler liegt bei dir.',
      'mode.timecrit': 'ZEITKRITISCH', 'mode.d.timecrit': 'Bring die Lage in {0} unter Kontrolle (alle Pflichtziele), sonst scheitert der Einsatz.',
      'mode.hardcore': 'HARDCORE', 'mode.d.hardcore': 'Verdächtige reagieren schneller, zielen besser und ergeben sich seltener. Du nimmst mehr Schaden, hast keine Medikits und keine Geistermarker.',
      'mode.escalation': 'ESKALATION', 'mode.d.escalation': 'Bewaffnete Verstärkung stürmt in 3 Wellen das Gebäude, bis die Lage unter Kontrolle ist.',
      'mode.daily': 'TAGES-OP', 'mode.d.daily': 'Der feste Einsatz von heute: gleiche Mission, gleiche Verdächtige, gleiche Regeln ({0}). Neu um Mitternacht.',
      'menu.daily': 'TAGESEINSATZ', 'menu.dailySub': '{0} · {1}', 'menu.dailyBest': 'Bestwert {0}',
      'hud.timeLeft': 'RESTZEIT', 'hud.wave': 'WELLE {0}/{1}', 'hud.nextWave': 'nächste in {0}', 'hud.wavesDone': 'KEINE VERSTÄRKUNG MEHR', 'hud.contained': 'LAGE UNTER KONTROLLE', 'hud.solo': 'EINZELGÄNGER · KEIN TEAM',
      'radio.wave': 'Verstärkung dringt ins Gebäude ein! Welle {0} von {1}.', 'radio.time60': 'Noch eine Minute, um die Lage zu kontrollieren!', 'radio.time30': 'Dreißig Sekunden!',
      'radio.contained': 'Lage rechtzeitig unter Kontrolle. Gute Arbeit.',
      'reason.time': 'Die Zeit lief ab, bevor die Lage unter Kontrolle war.',
      'sl.mode': 'Modusbonus · {0} ×{1}'
    },
    es: {
      'mode.title': 'MODO DE OPERACIÓN', 'mode.locked': 'Completa la misión una vez para desbloquear', 'mode.mult': 'Puntos ×{0}', 'mode.best': 'Récord',
      'mode.standard': 'ESTÁNDAR', 'mode.d.standard': 'La operación completa con tu equipo. La experiencia base.',
      'mode.lonewolf': 'LOBO SOLITARIO', 'mode.d.lonewolf': 'Sin equipo. Cada puerta, cada arresto y cada error dependen de ti.',
      'mode.timecrit': 'CONTRARRELOJ', 'mode.d.timecrit': 'Controla la escena en {0} (todos los objetivos obligatorios) o la operación fracasa.',
      'mode.hardcore': 'EXTREMO', 'mode.d.hardcore': 'Los sospechosos reaccionan antes, apuntan mejor y se rinden menos. Recibes más daño, sin botiquines ni marcadores fantasma.',
      'mode.escalation': 'ESCALADA', 'mode.d.escalation': 'Refuerzos armados asaltan el edificio en 3 oleadas hasta que la escena esté controlada.',
      'mode.daily': 'OP DIARIA', 'mode.d.daily': 'La operación fija de hoy: misma misión, mismos sospechosos, mismas reglas ({0}). Se renueva a medianoche.',
      'menu.daily': 'OPERACIÓN DIARIA', 'menu.dailySub': '{0} · {1}', 'menu.dailyBest': 'récord {0}',
      'hud.timeLeft': 'TIEMPO', 'hud.wave': 'OLEADA {0}/{1}', 'hud.nextWave': 'siguiente en {0}', 'hud.wavesDone': 'SIN MÁS REFUERZOS', 'hud.contained': 'ESCENA CONTROLADA', 'hud.solo': 'LOBO SOLITARIO · SIN EQUIPO',
      'radio.wave': '¡Entran refuerzos en el edificio! Oleada {0} de {1}.', 'radio.time60': '¡Queda un minuto para controlar la escena!', 'radio.time30': '¡Treinta segundos!',
      'radio.contained': 'Escena controlada a tiempo. Buen trabajo.',
      'reason.time': 'Se acabó el tiempo antes de controlar la escena.',
      'sl.mode': 'Bonus de modo · {0} ×{1}'
    }
  };
  for (const l in T) if (TR.L.dict[l]) Object.assign(TR.L.dict[l], T[l]);
})(window.TR);
