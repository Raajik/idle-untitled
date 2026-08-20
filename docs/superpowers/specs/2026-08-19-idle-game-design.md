# Idle Untitled — Design Document

**Date:** 2026-08-19
**Status:** Approved
**Inspiration:** Incremental Epic Hero 2 (structure and systems inspiration only — all content original)

## Vision

A text-based browser idle RPG that scratches the IEH2 itch — idle combat, loot chase, prestige loops — while rejecting its annoyances: no gated quality-of-life, no energy/token systems, no premium currency, and an interface that respects the player.

## Anti-Annoyance Charter

- No energy, tokens, keys, or any content-gating consumables. Bosses are always freely enterable.
- All QoL features (auto-loot, auto-equip) are free and available from the start.
- No ads, no premium currency, no paywalls of any kind.
- Complexity is revealed through play, never sold.

## Platform & Deployment

- **Stack:** vanilla JS ES modules, zero dependencies, no build step.
- **Hosting:** GitHub Pages on `main` branch, root folder. Live at `https://raajik.github.io/idle-untitled/`.
- **Local dev:** any static server (`npx serve .` / `python -m http.server`). ES modules do not load from `file://`.
- **Tests:** Node's built-in test runner (`node --test`) against pure game-logic modules.

## Vertical Slice Scope

### Core Loop

Hero auto-battles monsters in a zone → kills grant XP, gold, loot → level up, allocate stats, equip gear → kill N monsters to unlock next zone → zone boss gates progress → when stalled, Rebirth for permanent multipliers → repeat faster.

### Combat

- Tick-based auto-battle at 4 ticks/sec.
- Hero stats: HP, ATK, DEF, SPD (attacks/sec).
- Damage ≈ ATK − DEF, floored at 1. SPD = attacks per second.
- Scrolling combat log.

### Zones (6)

Slime Meadow → Goblin Camp → Whispering Woods → Ember Caves → Frost Peak → Shadow Keep.
Each: 3–4 monster types, level-scaled stats, kill-requirement to advance, zone boss. Higher zones yield better loot/gold with tankier enemies.

### Leveling

XP curve per level; each level grants stat points allocated into STR (attack), VIT (health), AGI (speed/crit).

### Equipment

- 4 slots: Weapon, Armor, Trinket, Charm.
- 5 rarities: Common → Uncommon → Rare → Epic → Legendary.
- Drops roll zone-scaled base power + 0–3 affixes (+ATK%, +HP, +gold find, +XP, +crit).
- One-click equip with better/worse comparison.
- Auto-loot and auto-equip toggles free from the start (charter).

### Training (Gold Sink)

Percentage-scaling upgrades (e.g., +X% ATK per rank) with exponentially growing costs. Never flat stats — gold stays meaningful deep into a run.

### Rebirth (Prestige)

Reset level, gold, gear, zone progress → earn **Hero Souls** (based on highest zone reached + total levels). Souls buy a small permanent upgrade tree (5–6 nodes: +XP%, +gold%, +ATK%, +loot rarity, +starting stats, +offline efficiency).

### Offline Progress

Full, uncapped. On load, compute elapsed time and apply an analytical approximation from current clear rate (avg kills/sec × time away → XP/gold + expected loot rolls). Fast; bounded by math, not walls.

### Saves

JSON in localStorage, autosave every 10s + on tab hide/close. Export/import as copy-paste string. Versioned save format from day one for future migrations.

## Progressive UI

Interface grows with the player (A Dark Room school). Declarative unlocks table in `src/ui/unlocks.js`: `{ id, kind: 'tab' | 'tile' | 'panel', when: (state) => bool, teaser?: bool }`.

Milestone chain:

1. **Start:** single panel — current monster, HP bar, short combat log. No tabs.
2. First level-up → sidebar + **Hero** tab (stats, allocation).
3. First item drop → **Equipment** tab + inventory.
4. ~50 gold earned → **Training** tab.
5. First zone boss kill → **Rebirth** tab (teaser state until affordable).
6. First rebirth → **Overview dashboard**: simultaneous tiles (combat log, hero summary, loot feed, training).
7. Future systems (town, quests, classes) = new rows in the unlocks table, new dashboard tiles.

Unlock moments fire a toast ("⚔ Equipment unlocked"). Unlock state is derived from game state (never stored flags) so saves can't desync. Settings tab always available (save/export/import/reset).

## Architecture

```
idle-untitled/
├── index.html
├── styles.css
├── src/
│   ├── main.js             # bootstrap: load save → build state → start loop → render
│   ├── engine/
│   │   ├── loop.js         # fixed-timestep ticker (4 t/s) + autosave timer
│   │   └── rng.js          # random helpers
│   ├── data/
│   │   ├── zones.js        # zone/monster definitions (data-driven)
│   │   ├── items.js        # slots, rarities, affix tables, name generation
│   │   └── rebirth.js      # soul formula + upgrade tree definitions
│   ├── game/
│   │   ├── state.js        # single source of truth
│   │   ├── hero.js         # stats, XP/leveling, allocation, derived stats
│   │   ├── combat.js       # pure tick-based battle resolution
│   │   ├── loot.js         # drop rolls, item generation, rewards
│   │   ├── training.js     # gold → %-scaling upgrades
│   │   └── prestige.js     # rebirth logic, soul spending
│   ├── save.js             # localStorage, export/import, offline simulation
│   └── ui/
│       ├── render.js       # re-render active tab (no framework)
│       ├── tabs.js         # Battle / Hero / Equipment / Training / Rebirth / Overview / Settings
│       └── unlocks.js      # progressive UI table
└── test/                   # node --test unit tests for pure logic
```

**Key decisions:**

- Unidirectional data flow: `loop tick → game logic mutates state → render active tab`. Rendering is dumb; logic lives in pure testable functions.
- Data-driven content: zones, monsters, affixes, rebirth tree are data tables. New content never touches engine code.
- Deterministic-ish offline sim: analytical approximation, not thousands of simulated ticks.
- Versioned saves.

## Explicitly Out of Scope (architecture-ready for later)

Multiple classes, town buildings, quests/titles, crafting, expeditions, enchanting, pets, graphics.

## Implementation Phases

0. Repo & scaffold → push → enable Pages.
1. Core engine & combat.
2. Progression (XP, stats, Training, zone/boss progression).
3. Loot.
4. Rebirth & offline.
5. Progressive UI layer.
6. Polish & balance; verify live.
