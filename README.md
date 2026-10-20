<div align="center">

# TACTICAL RESPONSE

### A 2D top-down tactical police shooter

**Plan the entry. Control the scene. Bring everyone home.**

![Version](https://img.shields.io/badge/version-0.6.0-c8a24a)
![Platform](https://img.shields.io/badge/platform-Windows%20x64-2b2f36)
![Engine](https://img.shields.io/badge/engine-HTML5%20Canvas%20%2B%20Electron-47848f)
![Languages](https://img.shields.io/badge/languages-EN%20%C2%B7%20TR%20%C2%B7%20DE%20%C2%B7%20ES-555)

[**Download the latest release**](https://github.com/tearquiet2-sys/tactical-response/releases/latest)

</div>

---

## About

You lead **Alpha Team** of the **Greybridge Response Unit (GRU)**, the special police unit called in when a situation in Greybridge City turns violent.

Killing isn't the goal here. You win by **taking control of the scene**: protect civilians, take suspects alive whenever you can, secure the evidence and get your team out. Every door raises the same questions. Do you shout or shoot? Mirror first or kick it in? Flashbang, or go in quiet?

The campaign follows **Black Veil**, a crime network running drugs, weapons and people through the city. It starts with a routine apartment call and ends at the top floor of the Greybridge Financial Tower.

> Every operation asks the same question: **what should I do?** Not "how do I kill faster?"

## Features

- **Room clearing with fog of war.** Line of sight is raycast in real time, so you only see what your operators can see. Check under doors with the mirror before you commit.
- **Squad command wheel.** Order your team to follow, hold, move, stack up, open & clear, flash & clear, cover or restrain. Time slows down while the wheel is open.
- **Compliance-based AI.** Suspects can be nervous, aggressive, tactical, a leader, or a hostage taker. They hear gunshots, investigate, take cover, flee, fake a surrender or grab a hostage. Shout and they may comply.
- **Civilians with their own behavior.** Civilians panic, run, hide and surrender, and you have to restrain and escort them. Telling a threat from a frightened bystander is part of the job.
- **Doors and breaching.** Open, kick, wedge, pick the lock or blow the door with a C2 breach charge. Doors block both sight and sound.
- **Rules of engagement scoring.** You score for arrests, rescues and evidence. You lose points for unauthorized force, civilian casualties and anything you leave behind.
- **Loadouts and progression.** Earn credits and XP, then unlock weapons, attachments, armor, grenades, a shield, a taser, a beanbag shotgun and a recon drone in the Armory.
- **Operation modes.** Replay any mission under different rules, from Lone Wolf to Escalation, plus a new Daily Operation every day.
- **Four languages:** English, Türkçe, Deutsch, Español.

## Campaign

| # | Operation | Location | Status |
|---|---|---|---|
| 01 | **First Response** | Oak Street Apartments | Playable |
| 02 | **Closed Shop** | Northside Electronics | Playable |
| 03 | **Hostage Floor** | Grand Central Office | Playable |
| 04 | Night Shift | Metro Maintenance Facility | Classified |
| 05 | Safehouse | Old Motel | Classified |
| 06 | Red Line | Greybridge Metro Station | Classified |
| 07 | Dead Drop | Harbor Warehouse | Classified |
| 08 | Blackout | Blackridge Hotel | Classified |
| 09 | The Network | Black Veil Data Center | Classified |
| 10 | Zero Hour | Greybridge Financial Tower | Classified |

## Game Modes

Complete a mission once to unlock its alternate modes. Each mode has its own best score and pays out more.

| Mode | Rules | Score |
|---|---|---|
| **Standard** | The full operation with your squad. | ×1.0 |
| **Lone Wolf** | No squad. Every door and every arrest is on you. | ×1.4 |
| **Time Critical** | Contain the scene within half the par time, or the operation fails. | ×1.3 |
| **Hardcore** | Suspects react faster, aim better and surrender less. You take 80% more damage, carry no medkits and lose ghost markers. | ×1.6 |
| **Escalation** | Armed reinforcements storm the building in 3 waves until the scene is contained. | ×1.5 |
| **Daily Operation** | One seeded operation per day: the same mission, suspect layout and rule set for everyone. Resets at midnight. | base +0.25 |

## Controls

<table>
<tr><th>Movement & Combat</th><th>Tactical</th><th>Team Commands</th></tr>
<tr valign="top"><td>

| Key | Action |
|---|---|
| `W A S D` | Move |
| `Mouse` | Aim |
| `LMB` | Fire |
| `RMB` | Aim down sights |
| `Shift` | Sprint (loud) |
| `Ctrl` | Walk silently |
| `R` | Reload |
| `1` `2` `3` | Primary / Secondary / Taser |
| `Wheel` | Zoom |
| `M` | Tactical map |
| `Esc` | Pause |

</td><td>

| Key | Action |
|---|---|
| `Space` | Shout commands |
| `E` | Use / restrain / collect |
| `Q` | Mirror under door |
| `F` | Kick door |
| `B` | Place breach charge |
| `G` / `C` | Throw grenade |
| `V` | Wedge door |
| `T` | Drone |
| `H` | Medkit |

</td><td>

| Key | Action |
|---|---|
| `Tab` / `MMB` | Command wheel |
| `F1` / `Z` | Follow |
| `F2` / `X` | Hold |
| `F3` | Move to cursor |
| `F4` | Stack up |
| `F5` | Flash & Clear |
| `F6` | Open & Clear |
| `F7` | Cover area |
| `F8` | Restrain target |

</td></tr>
</table>

## Getting Started

### Play (Windows)

1. Download `TacticalResponse-v0.6.0-win64.zip` from [Releases](https://github.com/tearquiet2-sys/tactical-response/releases/latest).
2. Extract it anywhere.
3. Run **`Tactical Response.exe`**.

> Windows SmartScreen may warn you because the build isn't code-signed. Click **More info → Run anyway**.

### Run from source

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/tearquiet2-sys/tactical-response.git
cd tactical-response
npm install
npm start
```

### Build the executable

```bash
npm run package
```

The build goes to `dist/Tactical Response-win32-x64/`.

## Project Structure

```
src/
├── index.html, style.css
└── js/
    ├── data.js          Weapon / equipment / operator / enemy data
    ├── missions.js      Mission data and map layouts
    ├── modes.js         Operation modes and the seeded Daily Operation
    ├── map.js, door.js  Grid, rooms, collision, LOS raycasts, A* pathfinding, doors
    ├── character.js     Shared character logic
    ├── player.js        Player controller, weapons, interaction
    ├── ai_enemy.js      Suspect state machine (idle → patrol → investigate → combat → surrender / flee)
    ├── ai_civilian.js   Civilian state machine (calm → panic → flee → hide → compliant)
    ├── ai_squad.js      Squad commands and formations
    ├── combat.js        Hitscan, cover, shield, less-lethal
    ├── effects.js       Flashbangs, breach charges, particles
    ├── vision.js        Field of view, fog of war, camera
    ├── game.js          Mission flow, objectives, ROE scoring
    ├── hud.js, ui.js    HUD and menus
    ├── audio.js         Procedural sound
    ├── save.js          Save system
    └── i18n.js          Localization (EN / TR / DE / ES)
```

## Roadmap

- [x] Player controller, weapons, doors, fog of war
- [x] Suspect and civilian AI, surrender and arrest
- [x] Squad commands and breaching
- [x] Missions 01–03, scoring, armory and progression
- [x] Operation modes: Lone Wolf, Time Critical, Hardcore, Escalation, Daily Operation
- [ ] Missions 04–10 (darkness, evidence, split team, alarms, dynamic events)
- [ ] More maps, weapons and enemy types
- [ ] Audio, animation and VFX polish
- [ ] Co-op (2–4 players)

## License

© Tactical Response. All rights reserved.
