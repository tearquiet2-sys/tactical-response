// Grid map: builder DSL, rooms, collision, line of sight, A* pathfinding and static rendering.
(function (TR) {
  const U = TR.U;
  const TS = 32; // pixels per tile (1 tile = 1 meter)
  TR.TS = TS;

  const T_VOID = 0, T_WALL = 1, T_FLOOR = 2, T_DOOR = 3, T_FURN = 4, T_GLASS = 5;

  // Furniture catalogue: tall = blocks sight & bullets (full cover); otherwise half cover
  const FURN = {
    sofa: { tall: false, color: '#5d4a3c' }, table: { tall: false, color: '#6e5237' }, bed: { tall: false, color: '#8c8b86' },
    counter: { tall: false, color: '#9a9488' }, shelf: { tall: true, color: '#4a4034' }, fridge: { tall: true, color: '#c9ccc9' },
    desk: { tall: false, color: '#5a4b3b' }, wardrobe: { tall: true, color: '#56402c' }, crate: { tall: true, color: '#7a6340' },
    toilet: { tall: false, color: '#d8dad6' }, tub: { tall: false, color: '#d4d8d8' }, tv: { tall: false, color: '#222' },
    car: { tall: false, color: '#3c4a5c' }, server: { tall: true, color: '#23272c' }, cabinet: { tall: true, color: '#6b6d70' },
    plant: { tall: false, color: '#3e6a3a' }, washer: { tall: false, color: '#d6d6d0' }, pallet: { tall: false, color: '#8b6b43' },
    display: { tall: true, color: '#2d3136' }, cashier: { tall: false, color: '#7c7468' }, conftable: { tall: false, color: '#4b3a2c' },
    vending: { tall: true, color: '#8a2e2e' }, dumpster: { tall: true, color: '#2f5a3b' }, lowshelf: { tall: false, color: '#4e5156' },
    boxes: { tall: false, color: '#9b7b4f' }, chair: { tall: false, color: '#333' }
  };
  TR.FURN = FURN;

  class MapBuilder {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.type = new Uint8Array(w * h);
      this.floor = new Array(w * h).fill('o');
      this.furnId = new Int16Array(w * h).fill(-1);
      this.furniture = []; this.doors = []; this.roomDefs = [];
      this.spawns = { player: [], enemy: [], civ: [], evidence: [], extract: [], terminal: [], hostage: [], taker: [], vip: [] };
    }
    idx(x, y) { return y * this.w + x; }
    wall(x1, y1, x2, y2) { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) this.type[this.idx(x, y)] = T_WALL; return this; }
    area(x1, y1, x2, y2, fl) {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) { const i = this.idx(x, y); this.type[i] = T_FLOOR; this.floor[i] = fl || 'o'; }
      return this;
    }
    room(name, x1, y1, x2, y2, fl, opts) {
      this.area(x1, y1, x2, y2, fl);
      this.roomDefs.push({ name, x: x1, y: y1, x2, y2, outside: !!(opts && opts.outside) });
      return this;
    }
    glass(x1, y1, x2, y2) { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) this.type[this.idx(x, y)] = T_GLASS; return this; }
    door(x, y, opts) {
      opts = opts || {};
      this.type[this.idx(x, y)] = T_DOOR;
      // inherit floor from a neighbouring floor cell
      this.doors.push({ x, y, locked: !!opts.locked, open: !!opts.open, glass: !!opts.glass, name: opts.name || '' });
      return this;
    }
    furn(x, y, w, h, kind, opts) {
      const id = this.furniture.length;
      this.furniture.push({ id, x, y, w, h, kind, rot: (opts && opts.rot) || 0, tall: FURN[kind] ? FURN[kind].tall : false, seed: Math.random() * 1000 | 0 });
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const i = this.idx(xx, yy);
        this.type[i] = T_FURN; this.furnId[i] = id;
      }
      return this;
    }
    spawn(kind, x, y, extra) { this.spawns[kind].push(Object.assign({ x: x + 0.5, y: y + 0.5 }, extra || {})); return this; }
    extract(x1, y1, x2, y2) { this.spawns.extract.push({ x1, y1, x2: x2 + 1, y2: y2 + 1 }); return this; }
  }
  TR.MapBuilder = MapBuilder;

  class GameMap {
    constructor(b) {
      this.w = b.w; this.h = b.h;
      this.type = b.type; this.floor = b.floor; this.furnId = b.furnId;
      this.furniture = b.furniture; this.spawns = b.spawns;
      const n = this.w * this.h;
      this.moveBlock = new Uint8Array(n);
      this.sightBlock = new Uint8Array(n);
      this.bulletBlock = new Uint8Array(n);
      this.lowCover = new Uint8Array(n);
      this.roomOf = new Int16Array(n).fill(-1);
      this.doorAt = new Int16Array(n).fill(-1);
      for (let i = 0; i < n; i++) {
        const t = this.type[i];
        if (t === T_VOID || t === T_WALL) { this.moveBlock[i] = 1; this.sightBlock[i] = 1; this.bulletBlock[i] = 1; }
        else if (t === T_GLASS) { this.moveBlock[i] = 1; }
        else if (t === T_FURN) {
          this.moveBlock[i] = 1;
          const f = this.furniture[this.furnId[i]];
          if (f.tall) { this.sightBlock[i] = 1; this.bulletBlock[i] = 1; } else this.lowCover[i] = 1;
        }
      }
      this.staticSight = this.sightBlock.slice();
      this.smoke = new Uint8Array(n);
      // doors
      this.doors = b.doors.map((d, i) => new TR.Door(this, i, d));
      this.doors.forEach((d) => { this.doorAt[this.idx(d.x, d.y)] = d.id; this.floor[this.idx(d.x, d.y)] = this.neighbourFloor(d.x, d.y); d.applyBlocking(); });
      this.buildRooms(b.roomDefs);
    }
    idx(x, y) { return y * this.w + x; }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    cellType(x, y) { return this.inside(x, y) ? this.type[this.idx(x, y)] : T_VOID; }
    isMoveBlocked(x, y) { return !this.inside(x, y) || this.moveBlock[this.idx(x, y)] === 1; }
    isSightBlocked(x, y) { return !this.inside(x, y) || this.sightBlock[this.idx(x, y)] === 1; }
    neighbourFloor(x, y) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) { const t = this.cellType(x + dx, y + dy); if (t === T_FLOOR) return this.floor[this.idx(x + dx, y + dy)]; }
      return 'o';
    }

    buildRooms(defs) {
      this.rooms = [];
      const passable = (i) => { const t = this.type[i]; return t === T_FLOOR || t === T_FURN; };
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        if (!passable(i) || this.roomOf[i] !== -1) continue;
        const id = this.rooms.length;
        const room = { id, name: '', cells: [], minX: x, minY: y, maxX: x, maxY: y, doors: [], outside: false };
        const stack = [i]; this.roomOf[i] = id;
        while (stack.length) {
          const c = stack.pop(); const cx = c % this.w, cy = (c / this.w) | 0;
          room.cells.push(c);
          room.minX = Math.min(room.minX, cx); room.maxX = Math.max(room.maxX, cx);
          room.minY = Math.min(room.minY, cy); room.maxY = Math.max(room.maxY, cy);
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          for (const [dx, dy] of nb) {
            const nx = cx + dx, ny = cy + dy;
            if (!this.inside(nx, ny)) continue;
            const ni = this.idx(nx, ny);
            if (passable(ni) && this.roomOf[ni] === -1) { this.roomOf[ni] = id; stack.push(ni); }
          }
        }
        this.rooms.push(room);
      }
      for (const d of defs) {
        const r = this.rooms[this.roomOf[this.idx(d.x, d.y)]];
        if (r && !r.name) { r.name = d.name; r.outside = d.outside; }
      }
      this.rooms.forEach((r) => {
        if (!r.name) r.name = 'Area';
        let sx = 0, sy = 0, cnt = 0;
        r.cells.forEach((c) => { if (this.type[c] === T_FLOOR) { sx += c % this.w; sy += (c / this.w) | 0; cnt++; } });
        r.cx = sx / Math.max(1, cnt) + 0.5; r.cy = sy / Math.max(1, cnt) + 0.5;
        r.floorCells = r.cells.filter((c) => this.type[c] === T_FLOOR);
      });
      // door <-> room adjacency
      this.doors.forEach((d) => {
        const a = d.horizontal ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        d.rooms = a.map(([dx, dy]) => this.roomOf[this.idx(d.x + dx, d.y + dy)]);
        d.rooms.forEach((rid) => { if (rid >= 0) this.rooms[rid].doors.push(d.id); });
      });
    }
    roomAt(x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (!this.inside(cx, cy)) return null;
      const r = this.roomOf[this.idx(cx, cy)];
      if (r >= 0) return this.rooms[r];
      const d = this.doorAt[this.idx(cx, cy)];
      if (d >= 0) { const dd = this.doors[d]; const rr = dd.rooms.find((q) => q >= 0); return rr != null && rr >= 0 ? this.rooms[rr] : null; }
      return null;
    }
    doorNear(x, y, maxD) {
      let best = null, bd = maxD || 1.3;
      for (const d of this.doors) {
        const dd = U.dist(x, y, d.cx, d.cy);
        if (dd < bd) { bd = dd; best = d; }
      }
      return best;
    }

    // ---------- Raycasting (Amanatides & Woo DDA) ----------
    // mask: arrays to test. Returns distance to first blocking cell.
    raycast(ox, oy, dx, dy, maxD, arr, coverOut) {
      let cx = Math.floor(ox), cy = Math.floor(oy);
      const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
      const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9, tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9;
      let tmx = dx > 0 ? (cx + 1 - ox) * tdx : (ox - cx) * tdx;
      let tmy = dy > 0 ? (cy + 1 - oy) * tdy : (oy - cy) * tdy;
      if (dx === 0) tmx = 1e9; if (dy === 0) tmy = 1e9;
      let t = 0;
      const w = this.w, h = this.h;
      for (let iter = 0; iter < 400; iter++) {
        if (tmx < tmy) { cx += stepX; t = tmx; tmx += tdx; } else { cy += stepY; t = tmy; tmy += tdy; }
        if (t > maxD) return maxD;
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) return t;
        const i = cy * w + cx;
        if (arr[i]) return t;
        if (coverOut && this.lowCover[i]) coverOut.push(t);
      }
      return maxD;
    }
    los(x0, y0, x1, y1, arr) {
      const d = U.dist(x0, y0, x1, y1);
      if (d < 0.001) return true;
      const r = this.raycast(x0, y0, (x1 - x0) / d, (y1 - y0) / d, d, arr || this.sightBlock);
      return r >= d - 0.001;
    }

    // ---------- Collision ----------
    resolveCircle(x, y, r) {
      for (let pass = 0; pass < 3; pass++) {
        const minX = Math.floor(x - r), maxX = Math.floor(x + r), minY = Math.floor(y - r), maxY = Math.floor(y + r);
        let moved = false;
        for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
          if (!this.isMoveBlocked(cx, cy)) continue;
          const px = U.clamp(x, cx, cx + 1), py = U.clamp(y, cy, cy + 1);
          const dx = x - px, dy = y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < r * r) {
            if (d2 < 1e-8) { // center inside a cell: push out along the smallest axis
              const l = x - cx, rr = cx + 1 - x, t = y - cy, b = cy + 1 - y;
              const m = Math.min(l, rr, t, b);
              if (m === l) x = cx - r; else if (m === rr) x = cx + 1 + r; else if (m === t) y = cy - r; else y = cy + 1 + r;
            } else {
              const d = Math.sqrt(d2);
              x = px + (dx / d) * r; y = py + (dy / d) * r;
            }
            moved = true;
          }
        }
        if (!moved) break;
      }
      return [x, y];
    }
    circleFree(x, y, r) {
      const minX = Math.floor(x - r), maxX = Math.floor(x + r), minY = Math.floor(y - r), maxY = Math.floor(y + r);
      for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
        if (!this.isMoveBlocked(cx, cy)) continue;
        const px = U.clamp(x, cx, cx + 1), py = U.clamp(y, cy, cy + 1);
        if (U.dist2(x, y, px, py) < r * r) return false;
      }
      return true;
    }
    // walkable straight segment, doors count as blocked so paths keep a waypoint at every door
    segmentClear(x0, y0, x1, y1, r) {
      const d = U.dist(x0, y0, x1, y1);
      const steps = Math.ceil(d / 0.2);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const minX = Math.floor(x - r), maxX = Math.floor(x + r), minY = Math.floor(y - r), maxY = Math.floor(y + r);
        for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
          if (!this.inside(cx, cy)) return false;
          const i2 = this.idx(cx, cy);
          if (!(this.moveBlock[i2] || this.doorAt[i2] >= 0)) continue;
          const px = U.clamp(x, cx, cx + 1), py = U.clamp(y, cy, cy + 1);
          if (U.dist2(x, y, px, py) < r * r) return false;
        }
      }
      return true;
    }

    // ---------- Pathfinding: A* over the grid (8-way, no corner cutting) ----------
    // smoke grenades temporarily make cells opaque
    addSmoke(i, delta) {
      this.smoke[i] = Math.max(0, this.smoke[i] + delta);
      const di = this.doorAt[i];
      const doorBlock = di >= 0 && !this.doors[di].isOpen && !this.doors[di].glass;
      this.sightBlock[i] = (this.staticSight[i] || doorBlock || this.smoke[i] > 0) ? 1 : 0;
    }
    walkableForPath(i, opts) {
      const di = this.doorAt[i];
      if (di >= 0) {
        const d = this.doors[di];
        if (d.isOpen) return true;
        if (d.wedged && !opts.police) return false;
        if (d.locked && !opts.canUnlock) return false;
        return true;
      }
      return this.moveBlock[i] === 0;
    }
    findPath(sx, sy, tx, ty, opts) {
      opts = opts || {};
      const w = this.w;
      let sxc = Math.floor(sx), syc = Math.floor(sy);
      let txc = Math.floor(tx), tyc = Math.floor(ty);
      if (!this.inside(txc, tyc)) return null;
      let start = this.idx(sxc, syc), goal = this.idx(txc, tyc);
      if (!this.walkableForPath(goal, opts)) {
        const alt = this.nearestWalkable(tx, ty, 3);
        if (!alt) return null;
        txc = Math.floor(alt[0]); tyc = Math.floor(alt[1]); goal = this.idx(txc, tyc);
        tx = alt[0]; ty = alt[1];
      }
      if (!this.walkableForPath(start, opts)) {
        const alt = this.nearestWalkable(sx, sy, 2);
        if (alt) { sxc = Math.floor(alt[0]); syc = Math.floor(alt[1]); start = this.idx(sxc, syc); }
      }
      if (start === goal) return [[tx, ty]];
      const n = w * this.h;
      if (!this._g || this._g.length !== n) { this._g = new Float32Array(n); this._from = new Int32Array(n); this._stamp = new Uint32Array(n); this._closed = new Uint32Array(n); this._stampV = 0; }
      const g = this._g, from = this._from, stamp = this._stamp, closed = this._closed;
      const sv = ++this._stampV;
      const heap = new U.Heap();
      g[start] = 0; stamp[start] = sv; from[start] = -1;
      heap.push(start, 0);
      const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
      let found = false, iters = 0;
      while (heap.size && iters++ < 6000) {
        const cur = heap.pop();
        if (closed[cur] === sv) continue;
        closed[cur] = sv;
        if (cur === goal) { found = true; break; }
        const cx = cur % w, cy = (cur / w) | 0;
        for (const [dx, dy, c] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
          const ni = ny * w + nx;
          if (!this.walkableForPath(ni, opts)) continue;
          if (dx !== 0 && dy !== 0) {
            const a = cy * w + nx, b = ny * w + cx;
            if (this.moveBlock[a] || this.moveBlock[b] || this.doorAt[a] >= 0 || this.doorAt[b] >= 0) continue;
            if (this.doorAt[cur] >= 0 || this.doorAt[ni] >= 0) continue;
          }
          let cost = c;
          if (this.doorAt[ni] >= 0 && !this.doors[this.doorAt[ni]].isOpen) cost += 2.5;
          if (opts.avoid && opts.avoid[ni]) cost += opts.avoid[ni];
          // prefer the middle of corridors
          if (this.moveBlock[ni + 1] || this.moveBlock[ni - 1] || this.moveBlock[ni + w] || this.moveBlock[ni - w]) cost += 0.25;
          const ng = g[cur] + cost;
          if (stamp[ni] !== sv || ng < g[ni]) {
            stamp[ni] = sv; g[ni] = ng; from[ni] = cur;
            const hx = Math.abs(nx - txc), hy = Math.abs(ny - tyc);
            heap.push(ni, ng + Math.max(hx, hy) + 0.414 * Math.min(hx, hy));
          }
        }
      }
      if (!found) return null;
      const cells = [];
      let c = goal;
      while (c !== -1 && c !== start) { cells.push(c); c = from[c]; }
      cells.reverse();
      const pts = cells.map((ci) => [(ci % w) + 0.5, ((ci / w) | 0) + 0.5]);
      pts[pts.length - 1] = [tx, ty];
      return this.addDoorApproach(sx, sy, this.smoothPath(sx, sy, pts, opts.radius || 0.32));
    }
    // go through doorways perpendicular to the door so nobody jams on a door frame corner
    addDoorApproach(sx, sy, path) {
      const out = [];
      let px = sx, py = sy;
      for (let k = 0; k < path.length; k++) {
        const p = path[k];
        const di = this.doorAt[this.idx(Math.floor(p[0]), Math.floor(p[1]))];
        if (di >= 0 && k < path.length) {
          const d = this.doors[di];
          const s = d.side(px, py);
          const pre = [d.cx + d.nx * s * 0.75, d.cy + d.ny * s * 0.75];
          if (U.dist(px, py, d.cx, d.cy) > 0.8 && this.circleFree(pre[0], pre[1], 0.3)) out.push(pre);
          out.push([d.cx, d.cy]);
          const post = [d.cx - d.nx * s * 0.75, d.cy - d.ny * s * 0.75];
          const next = path[k + 1];
          if (next && this.circleFree(post[0], post[1], 0.3)) out.push(post);
          px = d.cx; py = d.cy;
          continue;
        }
        out.push(p); px = p[0]; py = p[1];
      }
      return out;
    }
    smoothPath(sx, sy, pts, r) {
      const out = [];
      let ax = sx, ay = sy, i = 0;
      while (i < pts.length) {
        let j = pts.length - 1;
        // find furthest visible point, never skipping over a door waypoint
        let doorLimit = pts.length - 1;
        for (let k = i; k < pts.length; k++) {
          const ci = this.idx(Math.floor(pts[k][0]), Math.floor(pts[k][1]));
          if (this.doorAt[ci] >= 0) { doorLimit = k; break; }
        }
        j = doorLimit;
        while (j > i && !this.segmentClear(ax, ay, pts[j][0], pts[j][1], r)) j--;
        out.push(pts[j]);
        ax = pts[j][0]; ay = pts[j][1];
        i = j + 1;
      }
      return out;
    }
    nearestWalkable(x, y, maxR) {
      const cx = Math.floor(x), cy = Math.floor(y);
      let best = null, bd = 1e9;
      for (let r = 0; r <= (maxR || 3); r++) {
        for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) {
          if (!this.inside(xx, yy)) continue;
          const i = this.idx(xx, yy);
          if (this.moveBlock[i] || this.doorAt[i] >= 0) continue;
          const d = U.dist2(x, y, xx + 0.5, yy + 0.5);
          if (d < bd) { bd = d; best = [xx + 0.5, yy + 0.5]; }
        }
        if (best) return best;
      }
      return best;
    }

    // ---------- Static rendering ----------
    render() {
      const W = this.w * TS, H = this.h * TS;
      const fc = document.createElement('canvas'); fc.width = W; fc.height = H;
      const g = fc.getContext('2d');
      g.fillStyle = '#07090b'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y), t = this.type[i];
        if (t === T_FLOOR || t === T_FURN || t === T_DOOR || t === T_GLASS) this.drawFloor(g, x, y, this.floor[i]);
      }
      // ambient occlusion along walls
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const t = this.type[this.idx(x, y)];
        if (t === T_WALL || t === T_VOID) continue;
        const px = x * TS, py = y * TS;
        const isW = (xx, yy) => { const tt = this.cellType(xx, yy); return tt === T_WALL; };
        const ao = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
          const gr = g.createLinearGradient(gx0, gy0, gx1, gy1);
          gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        };
        const s = 11;
        if (isW(x, y - 1)) ao(px, py, px + TS, py + s, px, py, px, py + s);
        if (isW(x, y + 1)) ao(px, py + TS - s, px + TS, py + TS, px, py + TS, px, py + TS - s);
        if (isW(x - 1, y)) ao(px, py, px + s, py + TS, px, py, px + s, py);
        if (isW(x + 1, y)) ao(px + TS - s, py, px + TS, py + TS, px + TS, py, px + TS - s, py);
      }
      this.furniture.forEach((f) => this.drawFurniture(g, f));
      this.drawLighting(g, W, H);
      this.floorCanvas = fc;

      // wall layer (drawn above the fog of war)
      const wc = document.createElement('canvas'); wc.width = W; wc.height = H;
      const wg = wc.getContext('2d');
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const t = this.type[this.idx(x, y)];
        const px = x * TS, py = y * TS;
        if (t === T_WALL) {
          wg.fillStyle = '#3a3f46';
          wg.fillRect(px, py, TS, TS);
          const n = U.hash(x, y, 7);
          wg.fillStyle = 'rgba(255,255,255,' + (0.02 + n * 0.025) + ')';
          wg.fillRect(px, py, TS, TS);
        } else if (t === T_GLASS) {
          wg.fillStyle = 'rgba(150,200,220,0.25)';
          wg.fillRect(px + 10, py, 12, TS);
          const horiz = this.cellType(x - 1, y) === T_GLASS || this.cellType(x + 1, y) === T_GLASS || this.cellType(x - 1, y) === T_WALL;
          wg.fillStyle = 'rgba(0,0,0,0)';
          wg.clearRect(px, py, TS, TS);
          wg.fillStyle = 'rgba(170,215,235,0.35)';
          if (horiz) wg.fillRect(px, py + 12, TS, 8); else wg.fillRect(px + 12, py, 8, TS);
          wg.fillStyle = 'rgba(220,245,255,0.6)';
          if (horiz) wg.fillRect(px, py + 13, TS, 1.5); else wg.fillRect(px + 13, py, 1.5, TS);
        }
      }
      // wall edges: lighter rim where a wall meets a floor
      wg.lineWidth = 2;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        if (this.type[this.idx(x, y)] !== T_WALL) continue;
        const px = x * TS, py = y * TS;
        const open = (xx, yy) => { const tt = this.cellType(xx, yy); return tt !== T_WALL && tt !== T_VOID; };
        wg.strokeStyle = '#6d747d';
        wg.beginPath();
        if (open(x, y - 1)) { wg.moveTo(px, py + 1); wg.lineTo(px + TS, py + 1); }
        if (open(x, y + 1)) { wg.moveTo(px, py + TS - 1); wg.lineTo(px + TS, py + TS - 1); }
        if (open(x - 1, y)) { wg.moveTo(px + 1, py); wg.lineTo(px + 1, py + TS); }
        if (open(x + 1, y)) { wg.moveTo(px + TS - 1, py); wg.lineTo(px + TS - 1, py + TS); }
        wg.stroke();
      }
      this.wallCanvas = wc;
    }

    // baked ambient light: darken everything, then add soft ceiling-lamp pools per room
    drawLighting(g, W, H) {
      const amb = this.ambient || { shade: 'rgb(180,184,198)', lamp: '255,214,160', lampA: 0.12, outside: 'rgb(150,160,190)' };
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = amb.shade; g.fillRect(0, 0, W, H);
      this.rooms.forEach((r) => {
        if (!r.outside) return;
        g.fillStyle = amb.outside;
        r.cells.forEach((c) => g.fillRect((c % this.w) * TS, ((c / this.w) | 0) * TS, TS, TS));
      });
      g.globalCompositeOperation = 'lighter';
      this.rooms.forEach((r) => {
        if (r.outside || r.floorCells.length < 3) return;
        const w = r.maxX - r.minX + 1, h = r.maxY - r.minY + 1;
        const nx = Math.max(1, Math.round(w / 6)), ny = Math.max(1, Math.round(h / 6));
        g.save();
        g.beginPath();
        r.cells.forEach((c) => g.rect((c % this.w) * TS, ((c / this.w) | 0) * TS, TS, TS));
        r.doors.forEach((di) => { const d = this.doors[di]; g.rect(d.x * TS, d.y * TS, TS, TS); });
        g.clip();
        for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
          const lx = r.minX + (ix + 0.5) * w / nx, ly = r.minY + (iy + 0.5) * h / ny;
          const ci = this.idx(Math.floor(lx), Math.floor(ly));
          if (this.roomOf[ci] !== r.id) continue;
          const rad = Math.min(5.5, Math.max(2.5, Math.max(w / nx, h / ny) * 0.8)) * TS;
          const gr = g.createRadialGradient(lx * TS, ly * TS, 0, lx * TS, ly * TS, rad);
          gr.addColorStop(0, 'rgba(' + amb.lamp + ',' + amb.lampA + ')'); gr.addColorStop(1, 'rgba(' + amb.lamp + ',0)');
          g.fillStyle = gr;
          g.fillRect(lx * TS - rad, ly * TS - rad, rad * 2, rad * 2);
        }
        g.restore();
      });
      g.restore();
    }

    drawFloor(g, x, y, fl) {
      const px = x * TS, py = y * TS;
      const h = (a, b) => U.hash(x * 7 + a, y * 13 + b, 3);
      switch (fl) {
        case 'w': { // wood planks
          const base = [126, 90, 58];
          for (let r = 0; r < 4; r++) {
            const off = Math.floor(h(r, 1) * 3);
            const k = 0.82 + h(r, off) * 0.3;
            g.fillStyle = 'rgb(' + (base[0] * k | 0) + ',' + (base[1] * k | 0) + ',' + (base[2] * k | 0) + ')';
            g.fillRect(px, py + r * 8, TS, 8);
            g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px, py + r * 8 + 7, TS, 1);
            if (h(r, 9) < 0.45) { g.fillRect(px + Math.floor(h(r, 5) * TS), py + r * 8, 1, 8); }
            g.fillStyle = 'rgba(255,230,190,0.05)'; g.fillRect(px, py + r * 8 + 2, TS, 1);
          }
          break;
        }
        case 'c': case 'k': { // carpet / office carpet tiles
          const col = fl === 'c' ? [96, 92, 104] : [62, 70, 82];
          g.fillStyle = 'rgb(' + col.join(',') + ')'; g.fillRect(px, py, TS, TS);
          for (let i = 0; i < 26; i++) {
            const a = h(i, 2), b = h(i, 3);
            g.fillStyle = 'rgba(' + (a > 0.5 ? '255,255,255,0.04' : '0,0,0,0.08') + ')';
            g.fillRect(px + (a * TS) | 0, py + (b * TS) | 0, 2, 2);
          }
          if (fl === 'k') { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(px, py, TS, 1); g.fillRect(px, py, 1, TS); }
          break;
        }
        case 't': { // bathroom / shop tiles
          g.fillStyle = '#b9bcb8'; g.fillRect(px, py, TS, TS);
          for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
            const k = h(tx + 11, ty + 17) * 0.08;
            g.fillStyle = 'rgba(0,0,0,' + k + ')'; g.fillRect(px + tx * 16 + 1, py + ty * 16 + 1, 15, 15);
          }
          g.fillStyle = 'rgba(80,80,80,0.45)';
          g.fillRect(px, py, TS, 1); g.fillRect(px, py + 16, TS, 1); g.fillRect(px, py, 1, TS); g.fillRect(px + 16, py, 1, TS);
          break;
        }
        case 'l': { // kitchen linoleum checker
          for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
            g.fillStyle = ((tx + ty) % 2 === 0) ? '#cfc6ae' : '#6c6a63';
            g.fillRect(px + tx * 16, py + ty * 16, 16, 16);
          }
          g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(px, py, TS, TS);
          break;
        }
        case 'm': { // marble lobby
          g.fillStyle = '#c8c4bb'; g.fillRect(px, py, TS, TS);
          g.strokeStyle = 'rgba(120,110,100,0.25)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(px, py + h(1, 1) * TS); g.bezierCurveTo(px + 10, py + h(2, 2) * TS, px + 20, py + h(3, 3) * TS, px + TS, py + h(4, 4) * TS); g.stroke();
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(px, py, TS, 1); g.fillRect(px, py, 1, TS);
          break;
        }
        case 'x': { // asphalt
          g.fillStyle = '#2b2d30'; g.fillRect(px, py, TS, TS);
          for (let i = 0; i < 30; i++) { g.fillStyle = h(i, 5) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)'; g.fillRect(px + (h(i, 6) * TS) | 0, py + (h(i, 7) * TS) | 0, 1, 1); }
          break;
        }
        case 's': { // sidewalk slabs
          g.fillStyle = '#6f6e69'; g.fillRect(px, py, TS, TS);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, py, TS, 1); g.fillRect(px, py, 1, TS);
          for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(px + (h(i, 8) * TS) | 0, py + (h(i, 9) * TS) | 0, 2, 2); }
          break;
        }
        case 'g': { // metal grating (fire escape)
          g.fillStyle = '#2f3336'; g.fillRect(px, py, TS, TS);
          g.fillStyle = 'rgba(0,0,0,0.45)';
          for (let i = 0; i < TS; i += 4) { g.fillRect(px + i, py, 1, TS); }
          g.fillStyle = 'rgba(255,255,255,0.05)';
          for (let i = 2; i < TS; i += 8) { g.fillRect(px, py + i, TS, 1); }
          break;
        }
        case 'y': { // yellow-lined road marking tile (asphalt with stripe)
          g.fillStyle = '#2b2d30'; g.fillRect(px, py, TS, TS);
          g.fillStyle = 'rgba(200,170,60,0.55)'; g.fillRect(px + 2, py + 14, TS - 8, 4);
          break;
        }
        default: { // concrete
          g.fillStyle = '#5f615f'; g.fillRect(px, py, TS, TS);
          for (let i = 0; i < 18; i++) { g.fillStyle = h(i, 5) > 0.55 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)'; g.fillRect(px + (h(i, 6) * TS) | 0, py + (h(i, 7) * TS) | 0, 2, 2); }
          if (h(3, 3) < 0.12) { g.fillStyle = 'rgba(40,30,20,0.18)'; g.beginPath(); g.arc(px + 16, py + 16, 10 + h(4, 4) * 8, 0, 7); g.fill(); }
        }
      }
    }

    drawFurniture(g, f) {
      const px = f.x * TS, py = f.y * TS, w = f.w * TS, h = f.h * TS;
      const meta = FURN[f.kind] || { color: '#555' };
      const c = meta.color;
      const rr = (x, y, ww, hh, r, fill, stroke) => {
        g.beginPath();
        g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r);
        g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
      };
      // drop shadow
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(px + 4, py + 5, w - 2, h - 2);
      const horiz = w >= h;
      switch (f.kind) {
        case 'sofa':
          rr(px + 2, py + 2, w - 4, h - 4, 6, c, '#2c2219');
          if (horiz) { rr(px + 2, py + 2, w - 4, 9, 4, U.colorShade(c, -0.25)); for (let i = 1; i < f.w; i++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + i * TS, py + 12, 1, h - 16); } }
          else { rr(px + 2, py + 2, 9, h - 4, 4, U.colorShade(c, -0.25)); }
          break;
        case 'bed':
          rr(px + 2, py + 2, w - 4, h - 4, 4, '#4b3a2a');
          rr(px + 4, py + 4, w - 8, h - 8, 3, '#d8d4c8');
          if (horiz) { rr(px + 5, py + 6, 16, h - 12, 4, '#f0ede4'); g.fillStyle = '#7d8b9c'; g.fillRect(px + w * 0.45, py + 4, w * 0.55 - 4, h - 8); }
          else { rr(px + 6, py + 5, w - 12, 14, 4, '#f0ede4'); g.fillStyle = '#7d8b9c'; g.fillRect(px + 4, py + h * 0.4, w - 8, h * 0.6 - 4); }
          break;
        case 'table': case 'conftable': case 'desk':
          rr(px + 3, py + 3, w - 6, h - 6, 3, c, U.colorShade(c, -0.4));
          g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(px + 5, py + 5, w - 10, 3);
          if (f.kind === 'desk') { // monitor + keyboard
            g.fillStyle = '#15181c'; g.fillRect(px + w / 2 - 9, py + 6, 18, 5);
            g.fillStyle = '#3a4a5a'; g.fillRect(px + w / 2 - 7, py + 7, 14, 3);
            g.fillStyle = '#2a2d31'; g.fillRect(px + w / 2 - 7, py + 14, 14, 4);
          }
          if (f.kind === 'conftable') { g.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < f.w; i++) { g.beginPath(); g.arc(px + i * TS + 16, py - 2, 5, 0, 7); g.arc(px + i * TS + 16, py + h + 2, 5, 0, 7); g.fill(); } }
          break;
        case 'counter': case 'cashier':
          rr(px + 1, py + 1, w - 2, h - 2, 2, c, '#3b3833');
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px + 2, py + 2, w - 4, 2);
          if (f.kind === 'cashier') { g.fillStyle = '#1b1d20'; g.fillRect(px + 8, py + 6, 14, 10); g.fillStyle = '#3e6a52'; g.fillRect(px + 10, py + 8, 10, 5); }
          else if ((f.seed % 3) === 0) { g.fillStyle = '#9aa0a3'; rr(px + w / 2 - 8, py + 5, 16, 12, 3, '#8f969a', '#555'); }
          break;
        case 'shelf': case 'display': case 'lowshelf':
          rr(px + 1, py + 1, w - 2, h - 2, 2, c, '#15120e');
          for (let i = 0; i < Math.max(f.w, f.h) * 3; i++) {
            const hh = U.hash(f.seed, i, 2);
            g.fillStyle = ['#8b5a3c', '#4f6d8a', '#c3b078', '#6c8a52', '#a34a3a', '#d6d6d6'][Math.floor(hh * 6)];
            if (horiz) g.fillRect(px + 3 + i * 10 % (w - 8), py + 4 + (i % 2) * (h / 2 - 3), 7, h / 2 - 6);
            else g.fillRect(px + 4 + (i % 2) * (w / 2 - 3), py + 3 + i * 10 % (h - 8), w / 2 - 6, 7);
          }
          break;
        case 'fridge': case 'washer':
          rr(px + 2, py + 2, w - 4, h - 4, 3, c, '#777');
          g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(px + 4, py + h / 2, w - 8, 1);
          if (f.kind === 'washer') { g.strokeStyle = '#777'; g.lineWidth = 2; g.beginPath(); g.arc(px + w / 2, py + h / 2, 9, 0, 7); g.stroke(); }
          break;
        case 'wardrobe': case 'cabinet':
          rr(px + 1, py + 1, w - 2, h - 2, 2, c, '#222');
          g.fillStyle = 'rgba(0,0,0,0.25)'; if (horiz) g.fillRect(px + w / 2, py + 2, 1, h - 4); else g.fillRect(px + 2, py + h / 2, w - 4, 1);
          break;
        case 'crate': case 'boxes': case 'pallet':
          for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) {
            const bx = px + xx * TS, by = py + yy * TS;
            const k = U.hash(f.seed + xx, yy, 4) * 0.25 - 0.12;
            rr(bx + 2, by + 2, TS - 4, TS - 4, 2, U.colorShade(c, k), '#3a2b18');
            g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(bx + 4, by + 4); g.lineTo(bx + TS - 4, by + TS - 4); g.moveTo(bx + TS - 4, by + 4); g.lineTo(bx + 4, by + TS - 4); g.stroke();
          }
          break;
        case 'toilet':
          rr(px + 8, py + 3, 16, 8, 3, '#e4e6e2', '#888');
          g.fillStyle = '#e4e6e2'; g.beginPath(); g.ellipse(px + 16, py + 20, 8, 10, 0, 0, 7); g.fill(); g.strokeStyle = '#888'; g.stroke();
          break;
        case 'tub':
          rr(px + 2, py + 2, w - 4, h - 4, 8, '#e8ecec', '#8a8f90');
          rr(px + 6, py + 6, w - 12, h - 12, 7, '#b6c6cc');
          break;
        case 'tv':
          g.fillStyle = '#16181b'; g.fillRect(px + 2, py + h / 2 - 5, w - 4, 8);
          g.fillStyle = '#2a3d52'; g.fillRect(px + 4, py + h / 2 - 3, w - 8, 3);
          break;
        case 'car':
          rr(px + 2, py + 4, w - 4, h - 8, 12, c, '#1b2330');
          rr(px + w * 0.28, py + 8, w * 0.44, h - 16, 6, '#1b2530');
          g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(px + 8, py + 8, w - 16, 2);
          g.fillStyle = '#e8d890'; g.fillRect(px + w - 6, py + 8, 3, 6); g.fillRect(px + w - 6, py + h - 14, 3, 6);
          break;
        case 'server':
          rr(px + 1, py + 1, w - 2, h - 2, 2, c, '#0c0d0f');
          for (let i = 0; i < f.w * f.h * 6; i++) {
            const lx = px + 4 + (i * 7) % (w - 8), ly = py + 4 + Math.floor(i * 7 / (w - 8)) * 6;
            if (ly > py + h - 5) break;
            g.fillStyle = U.hash(f.seed, i, 1) > 0.7 ? '#4fd07a' : '#2f7ad0'; g.fillRect(lx, ly, 2, 2);
          }
          break;
        case 'plant':
          g.fillStyle = '#5a4430'; g.beginPath(); g.arc(px + 16, py + 16, 8, 0, 7); g.fill();
          for (let i = 0; i < 7; i++) { const a = i * 0.9; g.fillStyle = i % 2 ? '#3e6a3a' : '#4f8248'; g.beginPath(); g.ellipse(px + 16 + Math.cos(a) * 6, py + 16 + Math.sin(a) * 6, 7, 3.5, a, 0, 7); g.fill(); }
          break;
        case 'vending':
          rr(px + 2, py + 2, w - 4, h - 4, 2, c, '#300');
          g.fillStyle = '#e0e0e0'; g.fillRect(px + 5, py + 5, w - 10, 6);
          break;
        case 'dumpster':
          rr(px + 1, py + 2, w - 2, h - 4, 3, c, '#142a1c');
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + w / 2, py + 3, 1, h - 6);
          break;
        case 'chair':
          g.fillStyle = '#2d2f33'; g.beginPath(); g.arc(px + 16, py + 16, 8, 0, 7); g.fill();
          break;
        default:
          rr(px + 2, py + 2, w - 4, h - 4, 3, c, '#222');
      }
    }
  }
  TR.GameMap = GameMap;
  TR.CELL = { T_VOID, T_WALL, T_FLOOR, T_DOOR, T_FURN, T_GLASS };
})(window.TR);
