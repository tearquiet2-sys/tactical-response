# TACTICAL RESPONSE — v0.4 Vertical Slice

2D top-down tactical police shooter (GRU — Greybridge Response Unit).
Built with JavaScript/Canvas + Electron (Unity license was not active on this machine).

## Run
- Desktop shortcut: **Tactical Response**
- Or: `dist/Tactical Response-win32-x64/Tactical Response.exe`
- Dev: `npm start` (Electron) — rebuild exe: see `package` command below

## Rebuild the exe
```
npx electron-packager . "Tactical Response" --platform=win32 --arch=x64 --out=dist --overwrite --icon=build/icon.ico --ignore="^/dist" --ignore="^/\.claude" --ignore="make_icon\.py" --ignore="devtest\.js"
```

## Code map (src/js) — mirrors the GDD script architecture
| File | GDD system |
|---|---|
| data.js | WeaponData / EquipmentData / OperatorData / EnemyData |
| missions.js | MissionData + map layouts (3 playable, 7 classified) |
| map.js, door.js | Grid, rooms, collision, LOS raycast, A* pathfinding, doors |
| character.js, player.js | Player controller, weapons, interaction |
| ai_enemy.js | Suspect FSM: IDLE→PATROL→SUSPICIOUS→INVESTIGATE→ALERT→COMBAT→SEARCH→SURRENDER/FLEE, hostage taker, fake surrender |
| ai_civilian.js | CALM→PANIC→FLEE→HIDE→COMPLIANT→RESTRAINED |
| ai_squad.js | Follow / Hold / Move / Stack / Breach & Clear / Cover / Restrain |
| combat.js, effects.js | Hitscan, cover, shield, less-lethal, flashbang, C2 |
| vision.js | FOV / fog of war, camera |
| game.js | Mission flow, objectives, ROE scoring, tutorial |
| hud.js, ui.js, save.js | HUD, menus, save system |
