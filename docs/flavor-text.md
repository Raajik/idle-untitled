# Flavor text map

Every line of authored prose in the game, grouped by the moment it shows up in,
with a `file:line` you can jump straight to. Stat readouts and pure UI labels
("ATK 12 · DEF 4") are left out — this is only text with a voice in it.

Style rules for narration vs. dialogue live in `CLAUDE.md`. The short version:
narration is plain, spoken dialogue from a named character is quoted and wrapped
in `.npc-speech`, and an unidentified voice is quoted inside `<em>`.

Line numbers drift as the files change — trust the quoted text over the number.
This page is a snapshot, not generated at build time: editing prose in the source
will not update it here.


## Opening — waking on the road

Everything before you reach Holtburg. Runs once per character.

**`src/ui/tabs.js`**

- `:134` — `<p>You feel as if you've just woken up from a very long and uncomfortable sleep. Your entire body is sore.</p>`
- `:135` — `<p style="margin-top:8px">A voice you don't know, somewhere above you: <em>"...first time?"</em></p>`
- `:136` — `<p style="margin-top:12px"><em class="npc-speech">"Take your time. What do they call you?"</em></p>`
- `:146` — `<p class="npc-speech">"Have you ever seen a <span class="lifestone-glow">Lifestone</span> before, ${name}?"</p>`
- `:156` — `<p class="npc-speech">"Name's Alcott. That glow behind you is a <span class="lifestone-glow">Lifestone</span>. It won't stop you dying — it'll just stop it being the end of you, and you'll feel every bit of it either way. Bond with enough of them and you can call on one from anywhere."</p>`
- `:157` — `<p style="margin-top:8px">He points toward a distant huddle of rooftops. <span class="npc-speech">"That's Holtburg. Keep your eyes up on the way. Ask for Thorolf when you get there — he'll set you straight."</span></p>`

**`src/game/onboarding.js`**

- `:25` — `addLog(state, ˋAlcott presses a ${gifts} into your hands.ˋ, 'good');`
- `:26` — `addLog(state, ˋHe walks you through ${spells} until you can hold all three. "Every Isparian knows these. Now you do."ˋ, 'good');`
- `:41` — `addLog(state, ˋ"Good, good — one less thing to explain." Alcott waves you toward the road to Holtburg.ˋ, 'dim');`
- `:53` — `addLog(state, ˋAlcott points toward a distant village. "That's Holtburg. Keep your eyes up on the way. Ask for Thorolf when you get there — he'll set you straight."ˋ, 'dim');`

**`src/game/travel.js`**

- `:39` — `addLog(state, ˋYou set out for Holtburg. The road is yours the whole way.ˋ, 'dim');`

**`src/main.js`**

- `:14` — `addLog(state, 'You wake on the road into Holtburg, close enough now to make out the rooftops.', 'dim');`


## Thorolf and the practice rack

The Town Hall's onboarding chain, opened by taking the tour.

**`src/data/quests.js`**

- `:83` — `title: 'Ask for Thorolf',`
- `:84` — `desc: 'Alcott said to ask for him. He keeps the practice rack in the back of the hall, and he would rather lend you all of it than watch you guess.',`
- `:93` — `title: 'Return the rack',`
- `:94` — `desc: 'Carry all eight until one of them stops feeling borrowed. Equip the one you are keeping — Thorolf wants back whatever is still loose in your pack.',`
- `:106` — `prompt: 'Pick one off the shelf',`

**`src/game/quests.js`**

- `:85` — `return ˋ${n} borrowed weapons back in your packˋ;`
- `:255` — `weapons.length ? ˋ${weapons.length} weapons off the rackˋ : null,`

**`src/ui/tabs.js`**

- `:809` — `(rewards.weapons || []).length ? ˋone of every weapon (${(rewards.weapons || []).length})ˋ : null,`
- `:1399` — `${isQuestItem(item) ? '<span class="muted">Lent to you — not yours to break down.</span>' : ˋ<button class="btn" data-action="salvage-item" data-arg="${item.id}">Salvage</button>ˋ}`


## Death and the Lifestone

Alcott's second beat, vitae, and the sanctuary sites.

**`src/game/combat.js`**

- `:438` — `gainVitae(state, 'Death takes something with it.');`
- `:444` — `ˋAlcott is there when the world comes back. "That's the worst of it over with. You'll feel the pull of any stone you've bonded with now — call on it and it'll carry you there."ˋ,`
- `:628` — `addLog(state, 'You awaken at your Lifestone, ready to fight again.', 'dim');`
- `:841` — `addLog(state, ˋYou fall to ${attacker.name}. Your Lifestone shimmers, calling you back...ˋ, 'boss');`

**`src/game/vitae.js`**

- `:67` — `addLog(state, ˋ${reason} Vitae ${v.pct}% — you feel diminished.ˋ, 'boss');`
- `:84` — `addLog(state, 'The last of the vitae burns away. You feel whole.', 'good');`
- `:86` — `addLog(state, ˋSome of the weight lifts. Vitae ${v.pct}%.ˋ, 'good');`

**`src/game/lifestone.js`**

- `:56` — `addLog(state, ˋThe Lifestone's light folds around you — you arrive at ${region.name}.ˋ, 'good');`
- `:82` — `const where = bind.regionId ? getRegion(bind.regionId).name : 'the roadside stone you first woke beside';`
- `:83` — `addLog(state, ˋYou wake at your Lifestone — ${where}. The walk back is yours to make.ˋ, 'dim');`
- `:108` — `ˋSomething here is pulling at you — ${site.name.toLowerCase()}, ${conditionOf(site).blurb}. You'll feel it from anywhere in ${getRegion(regionId).name} now, and you'll wake beside it.ˋ,`
- `:135` — `budding: { start: 0, label: 'budding', blurb: 'unfinished, and still trying' },`
- `:136` — `cracked: { start: 35, label: 'cracked', blurb: 'broken, but most of it is still here' },`
- `:137` — `shattered: { start: 15, label: 'shattered', blurb: 'in pieces, and only just holding together' },`
- `:138` — `dead: { start: 0, label: 'dead', blurb: 'gone out entirely — there is nothing left in it' },`
- `:193` — `addLog(state, ˋThe Lifestone flares awake, full-grown at last. Its light knows you now — you'll wake at ${region.name} from here on.ˋ, 'good');`
- `:202` — `gainVitae(state, 'The stone drinks deep.');`
- `:208` — `addLog(state, ˋYou press your hands to the stone and let it take. It answers with a slow, deepening glow. (${Math.floor(growth)}%)ˋ, 'dim');`

**`src/ui/tabs.js`**

- `:908` — `? ˋ<p>The stone stands waist-high now, steady, its light breathing slow and blue. It knows you. Wherever you go from here, some small part of you keeps facing this way — and when you die, that's the thread you'll follow back.</p>ˋ`
- `:909` — `: ˋ<p>Something is trying to be a <span class="lifestone-glow">Lifestone</span> here. It's the size of your fist and the colour of a held breath, and its light comes and goes like it can't quite remember how. Stand close and you can feel it reaching — not for blood, exactly. For someone to have been here.</p>`
- `:914` — `? ˋ<p class="muted" style="margin-top:8px">This is your Lifestone now — die anywhere and you'll wake at ${esc(region.name)}.</p>ˋ`
- `:917` — `${maxed ? ˋ<span class="muted">There's nothing left of you to give at ${MAX_VITAE_PCT}% vitae.</span>ˋ : ''}`


## Combat log

The line-by-line of a fight. High frequency — these repeat constantly.

**`src/game/combat.js`**

- `:197` — `addLog(state, ˋ${m.name} dodges your attack!ˋ, 'dim');`
- `:208` — `if (crit) addLog(state, ˋCritical hit! ${dmg} damage to ${m.name}.ˋ, 'dim');`
- `:265` — `? ˋCorruption takes hold of ${touched === 1 ? state.monsters[0].name : ˋ${touched} of themˋ}.ˋ`
- `:266` — `: 'Corruption seeps in, but it can hold no deeper.',`
- `:282` — `addLog(state, ˋ${m.name} rots for ${dmg}.ˋ, 'dim');`
- `:309` — `addLog(state, ˋ${m.name} bleeds for ${dmg}.ˋ, 'dim');`
- `:394` — `addLog(state, ˋ${m.name} slain. +${fmt(m.xp)} XP, +${fmt(pyrealsGain)} pyrealsˋ, 'dim');`
- `:397` — `addLog(state, ˋLevel up! Now level ${state.hero.level}.ˋ, 'good');`
- `:412` — `addLog(state, ˋ⚔ Auto-equipped ${drop.name} [${drop.rarity}]ˋ, 'loot-line');`
- `:420` — `addLog(state, ˋ⚙ Broke down ${drop.name} for ${broken.amount} ${material ? material.name : broken.material}.ˋ, 'dim');`
- `:422` — `addLog(state, ˋ⚔ Loot: ${drop.name} [${drop.rarity}]ˋ, 'loot-line');`
- `:672` — `addLog(state, ˋYour shot goes wide of ${m.name}.ˋ, 'dim');`
- `:686` — `addLog(state, ˋThe bolt punches through into ${other.name} for ${through}.ˋ, 'dim');`
- `:728` — `addLog(state, ˋYour ${spell.label} fizzles past ${m.name}.ˋ, 'dim');`
- `:775` — `addLog(state, ˋYou swing and miss ${m.name}.ˋ, 'dim');`
- `:813` — `addLog(state, ˋ${avoidedBy}! You avoid ${attacker.name}'s attack.ˋ, 'dim');`
- `:865` — `addLog(state, ˋYou break away and keep moving, leaving the ${state.monsters[0].name} behind.ˋ, 'dim');`

**`src/ui/tabs.js`**

- `:435` — `const swarm = state.monsters.length > 1 ? ˋ<div class="swarm-warning">Surrounded — ${state.monsters.length} on you.</div>ˋ : '';`


## Waves, clears and gathering

Working a point of interest to the end.

**`src/game/waves.js`**

- `:76` — `{ rank: 10, bonus: 0.15, text: 'You know where to look.' },`
- `:77` — `{ rank: 25, bonus: 0.25, text: 'You stop wasting what you cut.' },`
- `:78` — `{ rank: 50, bonus: 0.35, text: 'You work a site properly now.' },`
- `:79` — `{ rank: 75, bonus: 0.5, text: 'Very little is left behind.' },`
- `:80` — `{ rank: 100, bonus: 0.75, text: 'You take everything worth taking.' },`
- `:119` — `? ˋWave ${p.wave}/${WAVES_PER_POI} — a foe closes in.ˋ`
- `:120` — `: ˋWave ${p.wave}/${WAVES_PER_POI} — ${count} of them close in at once.ˋ,`
- `:157` — `? ˋ${poi.name} cleared! You haul away ${amount} ${name}.ˋ`
- `:158` — `: ˋ${poi.name} cleared ${count} times over. You haul away ${amount} ${name}.ˋ,`
- `:166` — `addLog(state, ˋAmong the spoils: ${gem ? gem.name : reward.materialId} — it rends ${reward.damageType}.ˋ, 'loot-line');`


## Town, shops and quests

Buildings, investment, and what a town asks of you.

**`src/data/buildings.js`**

- `:53` — `blurb: "Holtburg's ledger, its arguments, and the man who decides which of them matter.",`
- `:68` — `blurb: 'A bit of everything and a great deal of nothing in particular.',`
- `:99` — `blurb: 'Nailed-up scraps of paper, most of them asking for the same three things.',`
- `:110` — `blurb: 'Bandages, poultices, and no questions about how you got that.',`
- `:125` — `blurb: 'Hammer, anvil, and a standing opinion about your current blade.',`
- `:134` — `blurb: 'Staves, strings, and fletching done while you wait.',`
- `:145` — `blurb: 'Plate, chain, and shields dented in all the reassuring places.',`
- `:154` — `blurb: 'Light armor cut to move, because not every hit is worth taking.',`
- `:163` — `blurb: 'Wands, orbs, staves, amulets, and unsolicited advice about mana.',`
- `:173` — `blurb: 'Rings that catch the light, and — so they claim — good fortune.',`
- `:183` — `blurb: 'Crates, ledgers, and space to haul more back from every dungeon.',`
- `:191` — `blurb: 'Where Holtburg argues about prices, loudly, on your behalf.',`

**`src/game/buildings.js`**

- `:36` — `'The clerk walks you round the ledger. Every trade in Holtburg is somebody\'s business, he says, and a business only grows when somebody puts money into it. "That includes you, now."';`
- `:121` — `if (!firstRoll && !quiet) addLog(state, ˋThe ${def.name} has restocked.ˋ, 'dim');`
- `:219` — `addLog(state, ˋThe ${getBuilding(def.unlocksOnService).name} opens its doors to you.ˋ, 'good');`
- `:237` — `addLog(state, ˋThe ${def.name} won't deal with you yet — ${reputationRequired(def)} reputation in ${def.regionId} would change that.ˋ, 'dim');`
- `:244` — `addLog(state, ˋYou put up the money and the ${def.name} opens its doors${perk ? ˋ — ${perk}ˋ : ''}.ˋ, 'good');`
- `:260` — `addLog(state, ˋYour investment takes — the ${def.name} is a level ${entry.level} business now${perk ? ˋ, ${perk}ˋ : ''}.ˋ, 'good');`

**`src/game/shop.js`**

- `:111` — `addLog(state, ˋThe Physician tends your wounds for ${cost} pyreals. You feel whole again.ˋ, 'good');`

**`src/data/quests.js`**

- `:58` — `title: 'Ask how the town works',`
- `:59` — `desc: 'The clerk has time for you, and the General Store will not trade with a stranger.',`
- `:67` — `title: 'Stock the larder',`
- `:68` — `desc: 'The store will take twenty-five raw meat off your hands, and start dealing in food once it has them.',`

**`src/game/quests.js`**

- `:258` — `addLog(state, ˋ"${def.title}" — done. ${paid.join(' · ')}.ˋ, 'good');`

**`src/game/bounties.js`**

- `:137` — `ˋBounty claimed: ${bounty.title}. +${bounty.reputation} reputation, ${bounty.xp} XP, ${bounty.pyreals} pyreals.ˋ,`


## Items, trophies and consumables

Descriptions attached to things you carry.

**`src/data/trophies.js`**

- `:15` — `desc: 'Stringy, and going off already. Someone in Holtburg will want it anyway.',`
- `:20` — `desc: 'Proof of a rat, more or less. They are counted by the handful.',`
- `:25` — `desc: 'Unusually long, unusually intact. Worth more than a handful of the ordinary sort.',`

**`src/data/consumables.js`**

- `:24` — `desc: 'Bandages, a needle, and a paste that smells worse than the wound. Lets you patch yourself up mid-fight, at the cost of the breath you were using to swing.',`
- `:39` — `desc: 'Bitter, green, and faintly fizzing. Drinking one teaches you more about alchemy than any book would.',`
- `:54` — `desc: 'Cooked meat and something green. +1 Health regeneration for 30 minutes.',`

**`src/data/weaponTraits.js`**

- `:23` — `sword: { hitPct: 6, text: 'Precise — +6% chance to hit.' },`
- `:25` — `axe: { critDmgMult: 1.5, text: 'Rending — critical hits do half again as much.' },`
- `:29` — `spear: { alwaysBleed: true, text: 'Impaling — every hit bleeds, not just the heaviest swing.' },`
- `:36` — `text: 'Flurry — 25% faster and cheaper to throw, 15% less damage.',`
- `:42` — `bow: { speedMult: 0.8, dmgMult: 0.9, text: 'Rapid — 20% faster to loose, 10% less damage.' },`
- `:49` — `text: 'Punching — 25% slower, 35% harder, and the bolt carries through one more.',`

**`src/data/achievements.js`**

- `:14` — `desc: 'Carry the full 40% — whether you spent it at a Lifestone or earned it the hard way.',`

**`src/game/consumables.js`**

- `:51` — `addLog(state, ˋYou drink the ${def.name}. ${def.buff.name} takes hold.ˋ, 'good');`
- `:123` — `? ˋYou patch yourself up: +${healed} HP for ${healed * STAMINA_PER_HP} stamina. (${left} left)ˋ`
- `:124` — `: ˋYou use the last of the Healing Kit: +${healed} HP.ˋ,`

**`src/game/rending.js`**

- `:71` — `if (!damageType) return 'That is not a rending gem.';`
- `:72` — `if (!weapon) return 'You have no weapon to work it into.';`
- `:76` — `? ˋA casting device can't channel ${damageLabel(damageType)}.ˋ`
- `:77` — `: ˋA ${weapon.baseType} deals ${damageLabel(weaponPhysicalType(weapon))} damage — ${damageLabel(damageType)} has nothing to bite on.ˋ;`
- `:82` — `return ˋ${weapon.name} already rends ${damageLabel(existing.damageType)}.ˋ;`
- `:84` — `if (existing && existing.level >= MAX_RENDING_LEVEL) return ˋ${weapon.name} rends as deeply as it can.ˋ;`
- `:106` — `addLog(state, ˋYou work the ${(getMaterial(materialId) || {}).name} into ${weapon.name}. ${rendingName(damageType, weapon.imbue.level)}.ˋ, 'good');`

**`src/game/tinkering.js`**

- `:139` — `addLog(state, ˋYou work ${cost} ${material.name} into ${item.name}: ${resultLabel}.ˋ, 'good');`

**`src/game/spellwords.js`**

- `:62` — `addLog(state, ˋ${monster.name} shouts, "${spell.words}!" — words you already know.ˋ, 'dim');`
- `:71` — `ˋYou watch what it does, and repeat the words: "${spell.words}..." You've learned ${learned.name}. [${effectText(spell.id, level)}]ˋ,`


## Empty states and UI asides

What a panel says when there is nothing in it.

**`src/ui/tabs.js`**

- `:344` — `: '<span class="muted">Spent by auto-healing</span>';`
- `:346` — `<div><b class="${c.buff ? vitalTextClass(c.buff.effect) : ˋrarity-${c.rarity}ˋ}">${esc(c.name)}</b> ${status}${held}<div class="desc">${esc(c.desc)}${c.buff && !left && auto ? ' · Nothing left to drink.' : ''}</div></div>`
- `:359` — `: 'Needs a Healing Kit — nothing left to spend.';`
- `:542` — `? ˋ<span class="quest-mark" title="${esc(poi.quest || 'Something here wants doing')}">!</span>ˋ`
- `:577` — `if (!tiers.length) return '<p class="muted">Nothing mapped here yet.</p>';`
- `:648` — `if (!shown.length) return '<p class="muted">Nothing of that sort on the shelves today.</p>';`
- `:665` — `if (!sellable.length) return '<p class="muted">Nothing in your inventory to sell.</p>';`
- `:690` — `if (!entry.sells.length) return '<p class="muted">Nothing behind the counter today. Check back after the next delivery.</p>';`
- `:705` — `if (!entry.exchange.length) return '<p class="muted">No trade in raw goods here.</p>';`
- `:722` — `${left !== null ? ˋ<div class="desc">${soldOut ? 'Sold out until the next delivery.' : ˋ${fmt(left)} in stockˋ}</div>ˋ : ''}`
- `:728` — `return ˋ<p class="muted" style="margin-bottom:6px">What came in on the last cart. Rates and stock both turn over with the shelves.</p>${rows}ˋ;`
- `:773` — `const opening = building.stock ? 'Stocks gear that turns over on its own clock.' : null;`
- `:788` — `<div><b>Invest in the business</b><div class="desc">${esc([nextPerk, building.stock ? 'more stock, better stock, sooner' : null].filter(Boolean).join(' \u00b7 ')) || 'Grows the business'}</div></div>`
- `:791` — `: ˋ<p class="muted">Grown as far as it goes.</p>ˋ;`
- `:858` — `boardPanel = ˋ<div class="muted" style="margin:10px 0 4px">Posted here — rerolls with the shelves</div>${rows}ˋ;`
- `:932` — `return ˋ<div class="panel"><h2>${esc(poi.name)}</h2><p class="muted">There's nothing to do here yet.</p></div>ˋ;`
- `:992` — `ˋ${here ? '' : '<p class="muted" style="margin-bottom:6px">Pick a point of interest to start hunting.</p>'}${poiTiersHtml(state, region, travel, jumpTargets)}ˋ,`
- `:1012` — `: ˋ<span class="sub">Not open yet</span>ˋ;`
- `:1026` — `{ summary: ˋ${open} of ${total} open for businessˋ }`
- `:1195` — `body: ˋ<div class="panel"><p class="muted">Whichever weapon you have equipped (or bare fists) trains its own skill and governs how often your attacks connect, from even odds untrained up to 95% at rank 100.</p></div>${offenseSections}ˋ,`
- `:1345` — `<div class="panel"><h2>Equipped Gear</h2>${slotRows || '<p class="muted">Nothing equipped yet.</p>'}</div>`
- `:1348` — `<div class="panel"><h2>Materials</h2>${heldMaterials || '<p class="muted">None gathered or salvaged yet.</p>'}</div>ˋ;`
- `:1460` — `if (!id) return '<p class="muted">Select an item to see what it does.</p>';`
- `:1463` — `if (!item) return '<p class="muted">Select an item to see what it does.</p>';`
- `:1484` — `<button class="btn" data-action="salvage-shown" ${breakable.length ? '' : 'disabled'} title="Each item is broken down in turn, so Salvaging ranks up partway through the pile and the last of it is worth more than the first.">`
- `:1487` — `<button class="btn${setting === AUTO_SALVAGE_OFF ? '' : ' active'}" data-action="cycle-auto-salvage" data-arg="${cycle}" title="Drops at or below this rarity are broken down as they land. Never touches anything auto-equip wanted.">`
- `:1510` — `? '<p class="muted">No loot yet. Monsters drop equipment as you fight.</p>'`
- `:1512` — `? '<p class="muted">No items match the current filters.</p>'`
- `:1542` — `<div class="panel"><h2>Materials</h2>${heldMaterials || '<p class="muted">None gathered or salvaged yet.</p>'}</div>`
- `:1545` — `${heldTrophies || '<p class="muted">Nothing worth keeping yet.</p>'}`
- `:1546` — `${heldTrophies ? '<p class="muted" style="margin-top:6px">Kept for quest and turn-in rewards.</p>' : ''}`

**`src/ui/sidebarMap.js`**

- `:74` — `ˋ<span class="k">Sanctuary:</span><span class="v">${isGrown(state, poi.id) ? 'restored' : 'nothing to fight here'}</span>ˋ`
- `:106` — `? ˋ<div class="hc-note"><span class="quest-mark static">!</span>${esc(poi.quest || 'Something here wants doing')}</div>ˋ`
- `:142` — `${asking.map((b) => ˋ<div class="hc-note"><span class="quest-mark static">!</span>${esc(b.name)} has work for you</div>ˋ).join('')}`


## Toasts and system messages

Unlock notifications, save/load, and settings warnings.

**`src/ui/unlocks.js`**

- `:31` — `{ id: 'attributes', kind: 'tab', parent: 'hero', label: 'Attributes', when: (s) => s.hero.level >= 2, toast: '🧙 Attributes — you have points to spend.' },`
- `:32` — `{ id: 'skills', kind: 'tab', parent: 'hero', label: 'Skills', when: (s) => s.progress.visitedPois.length > 0 || s.travel !== null || s.progress.unlockedRegions.length > 0, toast: '🏃 Skills — Athletics has been training since your first step.' },`
- `:33` — `{ id: 'inventory', kind: 'tab', parent: 'hero', label: 'Inventory', when: (s) => ownsAnyGear(s), toast: '🎒 Inventory — everything you are carrying, in one place.' },`
- `:40` — `toast: '🔧 Tinkering — materials from clears and salvage can be worked into your gear.',`
- `:47` — `toast: '🪦 Lifestone Recall — call on any stone you have bonded with and it will carry you there.',`
- `:50` — `{ id: 'training', kind: 'tab', label: '💰 Training', when: (s) => s.progress.totalPyrealsEarned >= 200, toast: '💰 Training — pyreals buy the kind of improvement that outlasts a run.' },`
- `:51` — `{ id: 'enlightenment', kind: 'tab', label: '✦ Enlightenment', when: (s) => s.progress.totalClears >= 1, toast: '✦ Enlightenment — there is a way to end a run and keep something from it.', teaser: (s) => !canEnlighten(s) },`
- `:52` — `{ id: 'overview', kind: 'tab', label: '📊 Overview', when: (s) => s.enlightenment.count >= 1, toast: '📊 Overview — the whole of it on one screen.' },`

**`src/ui/render.js`**

- `:561` — `await navigator.clipboard.writeText(text);`
- `:570` — `return await navigator.clipboard.readText();`
- `:580` — `toast('Save imported.');`
- `:582` — `toast('Import failed — invalid save data.');`
- `:631` — `if (summary.ranksGained > 0) toast(ˋSalvaging +${summary.ranksGained} while you worked.ˋ);`
- `:655` — `addLog(state, on ? 'You resolve to keep everything up.' : 'You let your upkeep lapse.', 'muted');`
- `:755` — `toast(ok ? 'Save copied to the clipboard.' : 'Save exported to the Settings box.')`
- `:777` — `toast('Paste your save into the box, then press Import.');`
- `:786` — `toast('Hold Shift and click to wipe all progress.');`

**`src/game/enlightenment.js`**

- `:40` — `addLog(state, ˋ✦ Enlightenment #${state.enlightenment.count}! Gained ${plural(souls, 'Hero Soul')}.ˋ, 'boss');`

**`src/game/achievements.js`**

- `:15` — `addLog(state, ˋ★ ${achievement.name} — ${achievement.reward}.ˋ, 'good');`

**`src/save.js`**

- `:330` — `ˋYou kept swinging while you were gone. Away ${hours < 1 ? Math.round(elapsedSec / 60) + 'm' : hours.toFixed(1) + 'h'}: ${fmt(kills)} kills, +${fmt(pyrealsGain)} pyreals${summary.levelsGained ? ˋ, +${summary.levelsGained} levelsˋ : ''}${clears ? ˋ, ${fmt(clears)} full clearsˋ : ''}.ˋ,`

**`src/game/travel.js`**

- `:55` — `addLog(state, goingHome ? ˋYou head back to ${region.name}...ˋ : ˋYou set out for ${region.name}...ˋ, 'dim');`
- `:80` — `addLog(state, ˋYou arrive at ${region.name}.ˋ, 'good');`
- `:91` — `addLog(state, ˋYou arrive at ${poi.name}.ˋ, 'good');`

**`src/game/shortcuts.js`**

- `:47` — `addLog(state, ˋYou take the ${shortcut.name} and arrive at ${destPoi.name} in a heartbeat.ˋ, 'good');`


---

180 lines catalogued.
