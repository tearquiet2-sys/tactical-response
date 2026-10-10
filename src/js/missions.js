// Mission definitions (the GDD's MissionData). Maps are built with the MapBuilder DSL.
(function (TR) {
  const M = [];

  // ---------------------------------------------------------------- MISSION 01
  M.push({
    id: 1, code: '01', name: 'FIRST RESPONSE', location: 'Oak Street Apartments, 3rd Floor', time: '22:40', weather: 'Light rain',
    playable: true, tutorial: true, reward: 4500, parTime: 600,
    summary: 'Shots fired on the third floor of a residential building. Multiple 911 calls report armed men forcing their way into apartments.',
    intel: [
      '3-5 armed suspects, possibly under the influence.',
      '3-5 residents trapped inside apartments 3A-3C.',
      'Entry points: main hallway (stairwell), fire escape (3A kitchen / 3B bedroom), service door to storage.',
      '3B fire-escape door and the storage service door are reported locked.'
    ],
    enemies: { min: 3, max: 5, types: { nervous: 4, aggressive: 3, tactical: 2, leader: 1 } },
    civilians: { min: 3, max: 5 },
    evidence: 3,
    build() {
      const b = new TR.MapBuilder(46, 29);
      b.wall(0, 0, 45, 28);
      b.room('Fire Escape', 1, 0, 44, 1, 'g', { outside: true });
      b.room('Stairwell', 41, 3, 44, 27, 'o');
      b.door(42, 2);
      // 3A
      b.room('3A Kitchen', 1, 3, 8, 6, 'l');
      b.room('3A Bedroom', 10, 3, 19, 6, 'c');
      b.room('3A Living Room', 1, 8, 19, 11, 'w');
      b.door(5, 7); b.door(14, 7); b.door(6, 2); b.door(10, 12);
      // 3B
      b.room('3B Bedroom', 21, 3, 30, 6, 'c');
      b.room('3B Bathroom', 32, 3, 35, 6, 't');
      b.room('3B Closet', 37, 3, 39, 6, 'o');
      b.room('3B Living Room', 21, 8, 39, 11, 'w');
      b.door(25, 7); b.door(33, 7); b.door(38, 7); b.door(26, 2, { locked: true }); b.door(30, 12);
      // hallway
      b.room('Hallway', 1, 13, 39, 14, 'c');
      b.door(40, 13);
      // 3C
      b.room('3C Living Room', 1, 16, 12, 22, 'w');
      b.room('3C Bedroom', 14, 16, 19, 22, 'c');
      b.room('3C Kitchen', 1, 24, 8, 27, 'l');
      b.room('3C Office', 10, 24, 19, 27, 'c');
      b.door(8, 15); b.door(13, 19); b.door(4, 23); b.door(15, 23);
      // service
      b.room('Laundry', 21, 16, 30, 22, 't');
      b.room('Storage', 32, 16, 39, 27, 'o');
      b.room('Maintenance', 21, 24, 30, 27, 'o');
      b.door(24, 15); b.door(31, 19); b.door(26, 23); b.door(40, 25, { locked: true });
      // furniture
      b.furn(1, 3, 4, 1, 'counter'); b.furn(8, 3, 1, 1, 'fridge'); b.furn(3, 5, 2, 1, 'table');
      b.furn(16, 3, 3, 2, 'bed'); b.furn(10, 3, 2, 1, 'wardrobe');
      b.furn(12, 8, 1, 3, 'sofa'); b.furn(14, 9, 2, 2, 'table'); b.furn(18, 9, 1, 2, 'tv'); b.furn(1, 11, 3, 1, 'shelf'); b.furn(19, 8, 1, 1, 'plant');
      b.furn(21, 3, 2, 3, 'bed'); b.furn(28, 3, 2, 1, 'wardrobe');
      b.furn(32, 3, 2, 1, 'tub'); b.furn(35, 3, 1, 1, 'toilet');
      b.furn(37, 3, 3, 1, 'shelf');
      b.furn(34, 11, 6, 1, 'counter'); b.furn(39, 8, 1, 1, 'fridge'); b.furn(22, 10, 3, 1, 'sofa'); b.furn(26, 9, 2, 1, 'table'); b.furn(22, 8, 3, 1, 'tv');
      b.furn(1, 13, 1, 1, 'plant');
      b.furn(2, 18, 1, 3, 'sofa'); b.furn(4, 19, 2, 1, 'table'); b.furn(1, 22, 3, 1, 'shelf'); b.furn(9, 20, 1, 2, 'tv');
      b.furn(17, 16, 2, 3, 'bed'); b.furn(18, 21, 2, 1, 'wardrobe');
      b.furn(1, 27, 5, 1, 'counter'); b.furn(8, 24, 1, 1, 'fridge'); b.furn(4, 25, 2, 1, 'table');
      b.furn(12, 26, 2, 1, 'desk'); b.furn(17, 26, 2, 1, 'desk'); b.furn(19, 24, 1, 2, 'shelf'); b.furn(10, 24, 1, 1, 'cabinet');
      b.furn(26, 16, 4, 1, 'washer'); b.furn(26, 19, 2, 1, 'table'); b.furn(21, 21, 2, 2, 'boxes');
      b.furn(34, 17, 2, 2, 'crate'); b.furn(37, 21, 2, 2, 'crate'); b.furn(32, 24, 1, 3, 'shelf'); b.furn(35, 25, 2, 1, 'boxes');
      b.furn(21, 24, 1, 3, 'cabinet'); b.furn(28, 26, 2, 2, 'crate'); b.furn(24, 27, 3, 1, 'pallet');
      // spawns
      [[42, 20], [43, 20], [42, 21], [43, 21]].forEach(([x, y]) => b.spawn('player', x, y));
      b.extract(41, 16, 44, 24);
      [[8, 9], [13, 4], [29, 9], [24, 5], [7, 17], [14, 25], [37, 18], [23, 19], [2, 4], [16, 10], [36, 9]].forEach(([x, y]) => b.spawn('enemy', x, y));
      [[18, 6], [34, 5], [15, 17], [6, 26], [29, 21], [3, 14], [36, 9], [23, 25], [5, 10]].forEach(([x, y]) => b.spawn('civ', x, y));
      [[13, 9, 'phone'], [27, 10, 'drugs'], [33, 5, 'drugs'], [13, 25, 'documents'], [38, 19, 'cash'], [7, 26, 'phone'], [24, 3, 'documents']].forEach(([x, y, k]) => b.spawn('evidence', x, y, { kind: k }));
      return b;
    },
    playerFacing: Math.PI
  });

  // ---------------------------------------------------------------- MISSION 02
  M.push({
    id: 2, code: '02', name: 'CLOSED SHOP', location: 'Northside Electronics, Harlan Ave.', time: '02:15', weather: 'Clear, cold',
    playable: true, reward: 5200, parTime: 660,
    summary: 'Armed robbery in progress at an electronics store. The night staff are being held inside. The robbers are stripping the storage room.',
    intel: [
      '3-5 armed robbers, one reported with a rifle.',
      '3-4 employees held as hostages.',
      'Security room overlooks every camera in the building. Seize the recordings.',
      'Entry points: front glass doors, alley side door (storage), loading dock (locked).'
    ],
    enemies: { min: 3, max: 5, types: { nervous: 2, aggressive: 3, tactical: 3, leader: 1 } },
    civilians: { min: 3, max: 4, held: 0.6 },
    evidence: 2,
    terminal: true,
    build() {
      const b = new TR.MapBuilder(42, 30);
      b.wall(0, 0, 41, 29);
      b.room('Sidewalk', 0, 23, 41, 24, 's', { outside: true });
      b.area(0, 25, 41, 29, 'x');
      for (let x = 1; x < 41; x += 3) b.area(x, 27, x, 27, 'y');
      b.area(39, 0, 41, 22, 'x');
      // shop
      b.room('Main Shop', 1, 8, 24, 21, 't');
      b.glass(1, 22, 9, 22); b.glass(14, 22, 24, 22);
      b.door(11, 22, { glass: true }); b.door(12, 22, { glass: true });
      b.room('Office', 1, 1, 8, 6, 'k');
      b.room('Restroom', 10, 1, 13, 6, 't');
      b.room('Security Room', 15, 1, 24, 6, 'k');
      b.door(5, 7); b.door(11, 7); b.door(20, 7);
      b.room('Storage', 26, 8, 37, 21, 'o');
      b.door(25, 12); b.door(25, 19);
      b.room('Loading Area', 26, 1, 37, 6, 'o');
      b.door(31, 7); b.door(38, 3, { locked: true }); b.door(38, 16);
      // furniture
      b.furn(3, 10, 6, 1, 'display'); b.furn(3, 13, 6, 1, 'display'); b.furn(3, 16, 6, 1, 'display');
      b.furn(12, 10, 6, 1, 'display'); b.furn(12, 13, 6, 1, 'lowshelf'); b.furn(12, 16, 6, 1, 'lowshelf');
      b.furn(20, 17, 4, 1, 'cashier'); b.furn(21, 9, 3, 1, 'lowshelf'); b.furn(1, 20, 1, 1, 'plant');
      b.furn(2, 2, 2, 1, 'desk'); b.furn(8, 1, 1, 2, 'cabinet'); b.furn(6, 5, 2, 1, 'sofa');
      b.furn(10, 1, 1, 1, 'toilet'); b.furn(13, 1, 1, 1, 'toilet');
      b.furn(17, 1, 5, 1, 'desk'); b.furn(24, 1, 1, 2, 'server'); b.furn(15, 5, 1, 1, 'cabinet');
      b.furn(28, 2, 3, 2, 'pallet'); b.furn(33, 4, 2, 2, 'crate'); b.furn(36, 1, 2, 1, 'boxes');
      b.furn(28, 9, 1, 5, 'shelf'); b.furn(31, 9, 1, 5, 'shelf'); b.furn(34, 9, 1, 5, 'shelf');
      b.furn(27, 17, 2, 2, 'crate'); b.furn(33, 18, 3, 2, 'boxes');
      b.furn(16, 25, 3, 2, 'car'); b.furn(3, 25, 3, 2, 'car'); b.furn(40, 8, 2, 1, 'dumpster');
      [[12, 24], [13, 24], [11, 24], [14, 24]].forEach(([x, y]) => b.spawn('player', x, y));
      b.extract(6, 23, 20, 25);
      b.spawn('terminal', 19, 2);
      [[7, 12], [15, 12], [20, 15], [10, 19], [4, 4], [21, 4], [30, 15], [36, 11], [30, 5], [26, 14]].forEach(([x, y]) => b.spawn('enemy', x, y));
      [[6, 19], [8, 19], [15, 20], [2, 11], [12, 4], [29, 20], [18, 14]].forEach(([x, y]) => b.spawn('civ', x, y));
      [[6, 3, 'cash'], [22, 19, 'cash'], [33, 12, 'documents'], [12, 3, 'phone'], [30, 14, 'drugs']].forEach(([x, y, k]) => b.spawn('evidence', x, y, { kind: k }));
      return b;
    },
    playerFacing: -Math.PI / 2
  });

  // ---------------------------------------------------------------- MISSION 03
  M.push({
    id: 3, code: '03', name: 'HOSTAGE FLOOR', location: 'Grand Central Office, 14th Floor', time: '16:05', weather: 'Overcast',
    playable: true, reward: 7000, parTime: 780, hostageMission: true,
    summary: 'Armed men have taken the 14th floor of the Grand Central Office tower. The CFO of Varden Holdings is being held in the executive office.',
    intel: [
      '5-7 hostiles, organised, carrying rifles. Possible Black Veil connection.',
      'VIP: CFO Laura Kim, held in the executive office. The hostage taker will execute her if he feels threatened for too long.',
      'Flashbangs or a fast, precise entry are recommended for the executive office.',
      'Entry points: lobby glass doors, west stairwell, service corridor.'
    ],
    enemies: { min: 5, max: 7, types: { nervous: 2, aggressive: 2, tactical: 4, leader: 1 } },
    civilians: { min: 4, max: 6, held: 0.7 },
    evidence: 3,
    build() {
      const b = new TR.MapBuilder(48, 32);
      b.wall(0, 0, 47, 31);
      b.room('Elevator Lobby', 18, 26, 29, 30, 'm');
      b.room('Reception', 14, 19, 33, 24, 'm');
      b.door(23, 25, { glass: true }); b.door(24, 25, { glass: true });
      b.room('West Stairwell', 1, 19, 4, 30, 'o');
      b.room('Service Corridor', 6, 27, 16, 29, 'o');
      b.door(5, 28); b.door(17, 28);
      b.room('West Corridor', 1, 1, 4, 17, 'k');
      b.door(2, 18);
      b.room('Open Office', 6, 7, 33, 17, 'k');
      b.door(16, 18); b.door(30, 18); b.door(5, 10); b.door(5, 15);
      b.room('Conference Room', 6, 1, 15, 5, 'k');
      b.glass(6, 6, 9, 6); b.glass(11, 6, 15, 6);
      b.door(10, 6, { glass: true }); b.door(5, 3);
      b.room('Server Room', 17, 1, 22, 5, 'o');
      b.door(19, 6, { locked: true });
      b.room('Executive Office', 24, 1, 33, 5, 'w');
      b.door(28, 6);
      b.room('Break Room', 35, 1, 46, 9, 'l');
      b.room('East Corridor', 35, 11, 46, 13, 'k');
      b.door(40, 10); b.door(34, 12);
      b.room('IT Storage', 35, 15, 46, 24, 'o');
      b.door(40, 14); b.door(34, 21);
      // furniture
      b.furn(19, 30, 3, 1, 'cabinet'); b.furn(26, 30, 3, 1, 'cabinet');
      b.furn(20, 20, 8, 1, 'counter'); b.furn(15, 23, 3, 1, 'sofa'); b.furn(14, 19, 1, 1, 'plant'); b.furn(33, 19, 1, 1, 'plant'); b.furn(30, 23, 3, 1, 'sofa');
      [8, 12, 20, 24].forEach((x) => [9, 12, 15].forEach((y) => b.furn(x, y, 2, 1, 'desk')));
      b.furn(16, 9, 2, 1, 'desk'); b.furn(16, 15, 2, 1, 'desk'); b.furn(28, 9, 2, 1, 'desk'); b.furn(28, 15, 2, 1, 'desk');
      b.furn(6, 7, 1, 1, 'plant'); b.furn(33, 7, 1, 1, 'plant'); b.furn(31, 11, 1, 3, 'cabinet'); b.furn(6, 12, 1, 2, 'cabinet');
      b.furn(8, 2, 6, 2, 'conftable');
      b.furn(29, 2, 3, 1, 'desk'); b.furn(24, 1, 1, 3, 'shelf'); b.furn(32, 4, 2, 1, 'sofa');
      b.furn(17, 1, 1, 4, 'server'); b.furn(21, 1, 1, 4, 'server');
      b.furn(35, 1, 6, 1, 'counter'); b.furn(46, 1, 1, 1, 'fridge'); b.furn(39, 5, 3, 2, 'table'); b.furn(46, 7, 1, 2, 'vending');
      b.furn(37, 16, 1, 6, 'shelf'); b.furn(41, 16, 1, 6, 'shelf'); b.furn(45, 16, 1, 6, 'shelf'); b.furn(38, 23, 2, 1, 'boxes');
      b.furn(1, 1, 1, 1, 'plant');
      [[23, 28], [24, 28], [23, 29], [24, 29]].forEach(([x, y]) => b.spawn('player', x, y));
      b.extract(18, 26, 29, 29);
      b.spawn('hostage', 27, 3);
      b.spawn('taker', 26, 2);
      [[10, 11], [18, 14], [26, 10], [31, 16], [12, 4], [19, 3], [37, 4], [44, 8], [44, 12], [39, 20], [26, 22], [3, 8], [14, 8]].forEach(([x, y]) => b.spawn('enemy', x, y));
      [[14, 11], [22, 13], [9, 16], [7, 4], [14, 4], [42, 3], [15, 21], [43, 23], [27, 16]].forEach(([x, y]) => b.spawn('civ', x, y));
      [[19, 4, 'drive'], [30, 3, 'documents'], [41, 4, 'phone'], [38, 18, 'laptop'], [11, 14, 'documents']].forEach(([x, y, k]) => b.spawn('evidence', x, y, { kind: k }));
      return b;
    },
    playerFacing: -Math.PI / 2
  });

  // ---------------------------------------------------------------- locked campaign entries (GDD 7)
  const future = [
    [4, 'NIGHT SHIFT', 'Metro Maintenance Facility', 'Darkness, flashlights, generator'],
    [5, 'SAFEHOUSE', 'Old Motel', 'Black Veil safehouse. Evidence system'],
    [6, 'RED LINE', 'Greybridge Metro Station', 'Split team: Alpha / Bravo'],
    [7, 'DEAD DROP', 'Harbor Warehouse', 'Alarm system'],
    [8, 'BLACKOUT', 'Blackridge Hotel', 'Dynamic events'],
    [9, 'THE NETWORK', 'Black Veil Data Center', 'High threat AI'],
    [10, 'ZERO HOUR', 'Greybridge Financial Tower', 'Campaign finale']
  ];
  future.forEach(([id, name, loc, feat]) => M.push({ id, code: (id < 10 ? '0' : '') + id, name, location: loc, playable: false, feature: feat }));

  // lighting per mission (night / late night / day) + weather
  const amb = {
    1: { ambient: { shade: 'rgb(168,172,192)', lamp: '255,205,150', lampA: 0.13, outside: 'rgb(120,130,165)' }, rain: true },
    2: { ambient: { shade: 'rgb(150,158,182)', lamp: '205,228,255', lampA: 0.11, outside: 'rgb(125,135,165)' } },
    3: { ambient: { shade: 'rgb(214,211,204)', lamp: '255,246,228', lampA: 0.07, outside: 'rgb(200,200,200)' } }
  };
  // localized texts come from the language files
  M.forEach((m) => {
    if (amb[m.id]) Object.assign(m, amb[m.id]);
    const def = (k, fn) => Object.defineProperty(m, k, { get: fn, configurable: true });
    if (m.playable) {
      def('location', () => TR.t('m' + m.id + '.loc'));
      def('weather', () => TR.t('m' + m.id + '.weather'));
      def('summary', () => TR.t('m' + m.id + '.sum'));
      def('intel', () => TR.L.raw('m' + m.id + '.intel'));
    } else {
      def('location', () => TR.t('mloc.' + m.id));
      def('feature', () => TR.t('mf.' + m.id));
    }
  });

  TR.Missions = M;
})(window.TR);
