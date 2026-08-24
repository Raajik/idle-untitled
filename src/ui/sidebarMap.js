// The sidebar map: everywhere you can go, always on screen.
//
// This replaces both the old region shortcuts and the Battle tab's Regions and
// Points of Interest sections. The trade it makes is the one the mockup argued
// for: a ROW is a summary (band colour, level, travel time, marker) and the
// HOVER CARD is the detail (everything a location card used to carry). Nothing
// from the card grid is lost — it stops competing for permanent space.
//
// Bands you aren't working collapse to a single line, so a fifteen-POI region is
// a handful of rows rather than a wall.
//
// Rows are <button data-action="travel-poi|travel-region">, exactly the same
// actions the card grid used, so travel behaviour is unchanged. Every id here is
// map- prefixed: the Battle tab's grid can be unfolded at the same time, and two
// elements sharing an id leaves one of them frozen.

import { REGIONS, getRegion, getPoiById, isSite, poiLevelRange, tiersForRegion, poisInTier } from '../data/regions.js';
import { weaknessesOf, speciesOf } from '../data/species.js';
import { damageGlyph, damageLabel } from '../data/elements.js';
import { getMaterial } from '../data/materials.js';
import { modifiedWalkTime } from '../game/skills.js';
import { formatClock, formatDuration, fmt } from '../engine/format.js';
import { clearYield } from '../game/waves.js';
import { hasOpenQuest, isGrown, poiDisplayName, lifestoneSiteIn } from '../game/lifestone.js';
import { buildingsForRegion } from '../data/buildings.js';
import { buildingHasQuest } from '../game/buildings.js';
import { bountiesAt } from '../game/bounties.js';
import { objectiveHave, objectiveText, reputation } from '../game/quests.js';
import { creatureArt } from './creatureArt.js';
import { kindOf } from '../data/bestiary.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// How many rows a band shows before it collapses to a "N more" line. Enough to
// see the shape of a band without the sidebar becoming the whole screen.
export const ROWS_PER_BAND = 5;

// --- The travel time on a row -------------------------------------------

function walkParts(state, baseSeconds) {
  const actual = modifiedWalkTime(baseSeconds, state.hero.skills.athletics.rank);
  const delta = actual - baseSeconds;
  const tone = Math.abs(delta) < 0.05 ? 'even' : delta < 0 ? 'faster' : 'slower';
  return { actual, base: baseSeconds, delta, tone };
}

// --- The hover card ------------------------------------------------------

// Everything a location card carried. Sized to its contents and never wrapped:
// a tooltip that folds a monster's name onto two lines is harder to read than a
// wide one, and there's room to spend.
export function poiCardHtml(state, poi, regionId) {
  const region = getRegion(regionId);
  const range = poiLevelRange(poi);
  const site = isSite(poi);
  const walk = walkParts(state, poi.walkSeconds);
  const material = poi.gather ? getMaterial(poi.gather.material) : null;
  const clears = state.progress.poiClears[poi.id] || 0;
  const bounties = bountiesAt(state, poi, regionId);

  const facts = [
    `<span class="k">Travel:</span><span class="v"><span class="walk-${walk.tone}">${formatClock(walk.actual)}</span>${
      Math.abs(walk.delta) >= 0.05 ? ` <span class="muted">(base ${formatClock(walk.base)})</span>` : ''
    }</span>`,
  ];
  if (material) {
    facts.push(
      `<span class="k">Resources:</span><span class="v">${fmt(clearYield(state, poi.gather.skill))} ${esc(material.name)} per clear</span>`
    );
    facts.push(`<span class="k">Clears:</span><span class="v">${fmt(clears)}</span>`);
  } else if (site) {
    facts.push(
      `<span class="k">Sanctuary:</span><span class="v">${isGrown(state, poi.id) ? 'restored' : 'nothing to fight here'}</span>`
    );
  }

  // Inhabitants and what each is soft to, side by side. A place can hold three
  // different species, so one shared "weaknesses" line would read as though all
  // of them worked on everything.
  let table = '';
  if ((poi.monsters || []).length) {
    const rows = poi.monsters
      .map((m) => {
        const [primary, ...rest] = weaknessesOf(m.name);
        return `<span>${esc(m.name)}</span><span class="lv">Lv ${m.level}</span><span><span class="el-${primary.damageType}" style="color:var(--el)">${damageGlyph(
          primary.damageType
        )} ${esc(damageLabel(primary.damageType))}</span> <span class="muted">· ${rest.map((w) => esc(w.damageType)).join(' · ')}</span></span>`;
      })
      .join('');
    table = `<div class="hc-table">
      <span class="th">Inhabitants:</span><span class="th"></span><span class="th">Weaknesses:</span>
      ${rows}
    </div>`;
  }

  const notes = bounties
    .map(
      (b) =>
        `<div class="hc-note"><span class="mana-text">¤ Bounty</span> — ${esc(b.title)} · ${fmt(
          Math.min(objectiveHave(state, b.objective), b.objective.count)
        )} / ${fmt(b.objective.count)}</div>`
    )
    .join('');
  const questNote = hasOpenQuest(state, poi.id)
    ? `<div class="hc-note"><span class="quest-mark static">!</span>${esc(poi.quest || 'Something here wants doing')}</div>`
    : '';

  const kind = (poi.monsters || [])[0] ? kindOf(poi.monsters[0].name) : null;
  return `<div class="hovercard">
    <div class="hc-head">
      ${kind ? creatureArt(poi.monsters[0].name, { className: `kind-${kind} tiny` }) : '<span class="hc-art">◈</span>'}
      <span class="hc-name">${esc(poiDisplayName(state, poi))}</span>
      <span class="hc-sub">${range ? `Lv ${range.min}–${range.max}` : 'Site'}${
        poi.gather ? ` · ${esc(poi.gather.skill[0].toUpperCase() + poi.gather.skill.slice(1))}` : ''
      }</span>
    </div>
    <div class="hc-facts">${facts.join('')}</div>
    ${table}
    ${questNote}
    ${notes}
  </div>`;
}

function townCardHtml(state, region) {
  const shops = buildingsForRegion(region.id);
  const open = shops.filter((b) => (state.buildings[b.id] || {}).level > 0);
  const asking = shops.filter((b) => buildingHasQuest(state, b.id));
  const currentPoi = state.location.poiId ? (getRegion(region.id).pois.find((p) => p.id === state.location.poiId) || null) : null;
  const walk = walkParts(state, currentPoi ? currentPoi.walkSeconds : 0);
  return `<div class="hovercard">
    <div class="hc-head">
      <span class="hc-art">&#127968;</span>
      <span class="hc-name">${esc(region.name)}</span>
      <span class="hc-sub">Hub</span>
    </div>
    <div class="hc-facts">
      <span class="k">Travel:</span><span class="v"><span class="walk-${walk.tone}">${formatClock(walk.actual)}</span></span>
      <span class="k">Open:</span><span class="v">${open.length} of ${shops.length} businesses</span>
      <span class="k">Reputation:</span><span class="v">${fmt(reputation(state, region.id))}</span>
    </div>
    ${asking.map((b) => `<div class="hc-note"><span class="quest-mark static">!</span>${esc(b.name)} has work for you</div>`).join('')}
  </div>`;
}

// Resolves the `data-card` key a row carries into the card itself. Returns ''
// for a row that has none (an unvisited region has nothing to say yet).
export function hoverCardHtml(state, key) {
  const [kind, a, b] = String(key || '').split(':');
  if (kind === 'town') {
    const region = getRegion(a);
    return region ? townCardHtml(state, region) : '';
  }
  if (kind === 'poi') {
    const poi = getPoiById(b);
    return poi ? poiCardHtml(state, poi, a) : '';
  }
  return '';
}

// --- Rows ----------------------------------------------------------------

// A row names its card rather than carrying it. The map scrolls, and a scroll
// container clips on BOTH axes whatever `overflow-x` says — so a card anchored
// inside one and drawn to its right was clipped away to nothing. The card is now
// built on demand into a layer outside the sidebar (see ui/render.js), which
// also stops every render rebuilding ten cards nobody is looking at.
function rowHtml({ action, arg, id, cls = '', tone = null, lv, name, time, mark = '', card = '' }) {
  const classes = ['place-row', ...cls.split(' ').filter(Boolean)].join(' ');
  const style = tone ? ` style="--tier-edge:var(--tone-${tone})"` : '';
  const cardAttr = card ? ` data-card="${card}"` : '';
  return `<button class="${classes}" id="${id}"${style} data-action="${action}" data-arg="${arg}"${cardAttr}>
      <span class="lv">${lv}</span>
      <span class="nm">${esc(name)}</span>
      <span class="t ${time.cls}">${time.text}</span>
      ${mark}
    </button>`;
}

function poiRow(state, poi, regionId, travel, tone) {
  const here = state.location.poiId === poi.id;
  const travelling = travel && travel.kind === 'poi' && travel.id === poi.id;
  const walk = walkParts(state, poi.walkSeconds);
  const range = poiLevelRange(poi);
  const bounties = bountiesAt(state, poi, regionId);

  const time = travelling
    ? { cls: 'travelling', text: `<span id="map-poi-timer-${poi.id}">${formatDuration(travel.remaining)}</span>` }
    : here
    ? { cls: 'here', text: 'here' }
    : { cls: walk.tone, text: formatClock(walk.actual) };

  const mark = hasOpenQuest(state, poi.id)
    ? '<span class="mk">!</span>'
    : bounties.length
    ? '<span class="mk bounty">¤</span>'
    : '';

  return rowHtml({
    action: 'travel-poi',
    arg: poi.id,
    id: `map-poi-${poi.id}`,
    cls: `${here ? 'here' : ''} ${travelling ? 'travelling' : ''}`,
    tone,
    lv: range ? range.min : '◈',
    name: poiDisplayName(state, poi),
    time,
    mark,
    card: `poi:${regionId}:${poi.id}`,
  });
}

function townRow(state, region, travel) {
  const here = !state.location.poiId && state.location.regionId === region.id && !travel;
  const travelling = travel && travel.kind === 'region' && travel.id === region.id;
  const currentPoi = state.location.poiId ? region.pois.find((p) => p.id === state.location.poiId) : null;
  const walk = walkParts(state, currentPoi ? currentPoi.walkSeconds : 0);
  const asking = buildingsForRegion(region.id).some((b) => buildingHasQuest(state, b.id));

  const time = travelling
    ? { cls: 'travelling', text: `<span id="map-town-timer-${region.id}">${formatDuration(travel.remaining)}</span>` }
    : here
    ? { cls: 'here', text: 'here' }
    : { cls: walk.tone, text: formatClock(walk.actual) };

  return rowHtml({
    action: 'travel-region',
    arg: region.id,
    id: `map-town-${region.id}`,
    cls: `town ${here ? 'here' : ''} ${travelling ? 'travelling' : ''}`,
    lv: '⌂',
    name: region.name,
    time,
    mark: asking ? '<span class="mk">!</span>' : '',
    card: `town:${region.id}`,
  });
}

// --- The whole map -------------------------------------------------------

export function sidebarMapHtml(state) {
  const travel = state.travel;
  const reached = REGIONS.filter((r) => state.progress.unlockedRegions.includes(r.id));

  const groups = reached.map((region) => {
    const tiers = tiersForRegion(region);
    const site = lifestoneSiteIn(region.id);

    // The town and this region's Lifestone lead, then each level band.
    const head = `<div class="place-head"><span>${esc(region.name)}</span><span class="rep">rep ${fmt(reputation(state, region.id))}</span></div>`;
    let body = townRow(state, region, travel);
    if (site) body += poiRow(state, site, region.id, travel, 'site');

    const bands = tiers
      .filter((t) => t.id !== 'sites')
      .map((tier) => {
        const pois = poisInTier(region, tier.id);
        if (!pois.length) return '';
        const key = `${region.id}:${tier.id}`;
        const expanded = state.ui.expandedBands[key];
        // The band you're standing in is open whether or not you asked.
        const holdsYou = pois.some((p) => p.id === state.location.poiId);
        // Three states in one field: absent means "open if it holds you", true
        // means open to ROWS_PER_BAND, 'all' means every row. A twelve-place
        // band would otherwise be most of the sidebar.
        const open = expanded === undefined ? holdsYou : !!expanded;
        const showAll = expanded === 'all';
        const shown = !open ? [] : showAll ? pois : pois.slice(0, ROWS_PER_BAND);
        const rows = shown.map((p) => poiRow(state, p, region.id, travel, tier.tone)).join('');
        const hidden = open ? pois.length - shown.length : 0;
        const more = hidden
          ? `<button class="more-row" data-action="expand-band" data-arg="${key}">▸ ${hidden} more in this band</button>`
          : '';
        const toggle = `<button class="band-head" data-action="toggle-band" data-arg="${key}">
            <span class="caret">${open ? '▾' : '▸'}</span>${tier.label}<span class="n">${pois.length}</span>
          </button>`;
        return `<div class="place-group">${toggle}${rows}${more}</div>`;
      })
      .join('');

    return `<div class="place-group">${head}${body}</div>${bands}`;
  });

  // Somewhere you haven't been yet is one row, not a band.
  const unreached = REGIONS.filter((r) => !state.progress.unlockedRegions.includes(r.id))
    .map((region) => {
      const walk = walkParts(state, region.walkSeconds);
      const travelling = travel && travel.kind === 'region' && travel.id === region.id;
      const time = travelling
        ? { cls: 'travelling', text: `<span id="map-region-timer-${region.id}">${formatDuration(travel.remaining)}</span>` }
        : { cls: walk.tone, text: formatClock(walk.actual) };
      return `<div class="place-group">
        <div class="place-head"><span>${esc(region.name)}</span><span class="muted">unvisited</span></div>
        ${rowHtml({
          action: 'travel-region',
          arg: region.id,
          id: `map-region-${region.id}`,
          cls: 'unvisited',
          lv: '→',
          name: 'Travel there',
          time,
          mark: '',
          card: '',
        })}
      </div>`;
    })
    .join('');

  return groups.join('') + unreached;
}
