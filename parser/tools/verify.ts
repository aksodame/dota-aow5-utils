import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { idTableHash, loadAbilityTable, loadIdTable, loadMapTable } from './lib/idTable.ts';
import { readPngInfo } from './lib/png.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import type { IconRecord } from './05-icons-vpk.ts';
import {
  ESSENCE_IDS,
  type ItemFull,
  type ItemsIndex,
  type LocaleDetail,
  type Meta,
  type RichNode,
} from '../../packages/aow5-shared/src/types/items.ts';
import { ABILITY_SLOTS, type HeroesData, type LocaleAbilities } from '../../packages/aow5-shared/src/types/heroes.ts';
import type { LocaleMaps, MapsData } from '../../packages/aow5-shared/src/types/maps.ts';

/**
 * Verifies the emitted artifacts. Exits non-zero on any failure.
 *
 * Counts catch wholesale breakage; the golden fixtures catch the subtle kind,
 * where every count still adds up but a value is quietly wrong.
 */

ensureDirs();
const cfg = loadConfig();
step('verify');

const ESSENCE_VALUES = new Set<string>(Object.values(ESSENCE_IDS));

const readJson = <T>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T;
const dataFile = (f: string) => path.join(DIRS.publicData, f);

const meta = readJson<Meta>(dataFile('meta.json'));
const items = readJson<Record<string, ItemFull>>(dataFile('items.full.json'));
const index = readJson<ItemsIndex>(dataFile('items.index.json'));
const iconManifest = readJson<Record<string, IconRecord>>(path.join(DIRS.reports, 'icons.manifest.json'));
const counts = readJson<{ typeHistogram: Record<string, number> }>(path.join(DIRS.reports, 'counts.json'));

// --- items ------------------------------------------------------------------

checkSoft(Object.keys(items).length, cfg.expected.itemCount, 'total items');
for (const [type, expected] of Object.entries(cfg.expected.itemTypeHistogram)) {
  checkSoft(counts.typeHistogram[type] ?? 0, expected, `itemType ${type}`);
}

const playable = Object.values(items).filter((i) => i.flags.playable);
check(playable.length === index.rows.length, `index rows match playable items: ${index.rows.length}`);
check(playable.length === meta.playableCount, `meta.playableCount agrees: ${meta.playableCount}`);
// A tripwire, not a pin: small drift is a content update, a large swing is a
// bug. The baseline is the last accepted run's count rather than a literal, so
// it measures the drift since then instead of slowly rotting until it fires on
// a pak that did nothing unusual. Moving it takes `--accept-drift`; see
// private/ACTUALIZE.md.
const baseline = cfg.expected.playableCount;
const drift = Math.abs(playable.length - baseline);
check(drift <= 25, `playable count ${playable.length} within 25 of the ${baseline} baseline`);

// --- id table ---------------------------------------------------------------

const ids = loadIdTable();
check(ids.length === new Set(ids).size, `id table has no duplicates (${ids.length} entries)`);
check(idTableHash(ids) === meta.idTableHash, 'id table hash matches meta.json');
check(ids.length === meta.idTableLength, `id table length matches meta.json: ${ids.length}`);
const idxMismatch = Object.values(items).filter((i) => ids[i.idx] !== i.id);
check(idxMismatch.length === 0, `every item idx resolves back to its id (${idxMismatch.length} mismatches)`);

// --- crafting graph ---------------------------------------------------------

const knownDangling = new Set(cfg.knownDataIssues.danglingNeedIds);
let asymmetric = 0;
let unexpectedDangling = 0;
for (const item of Object.values(items)) {
  for (const need of item.needs) {
    const target = items[need.id];
    if (!target) {
      if (!knownDangling.has(need.id)) unexpectedDangling++;
      continue;
    }
    if (!target.usedBy.includes(item.id)) asymmetric++;
  }
}
check(unexpectedDangling === 0, `no unexpected dangling recipe references (${unexpectedDangling})`);
check(asymmetric === 0, `usedBy back-links are symmetric with needs (${asymmetric} broken)`);

// --- dismantle --------------------------------------------------------------
// The tracker will count these as loot, so an essence that is not a real item,
// or an equip that yields nothing at all, is a bug rather than a content change.

const dismantleRules: Record<string, number> = {};
let missingDismantle = 0;
let unknownEssence = 0;
for (const item of Object.values(items)) {
  if (!item.dismantle) {
    if (item.type === 'equip' || item.type === 'gem' || item.type === 'stone') missingDismantle++;
    continue;
  }
  dismantleRules[item.dismantle.rule] = (dismantleRules[item.dismantle.rule] ?? 0) + 1;
  for (const o of item.dismantle.outputs) {
    if (!items[o.id]) unknownEssence++;
    if (!ESSENCE_VALUES.has(o.id)) unknownEssence++;
  }
}
check(missingDismantle === 0, `every equip, glyph and fate stone has a dismantle rule (${missingDismantle} without)`);
check(unknownEssence === 0, `every dismantle output is a known essence item (${unknownEssence} bad)`);
for (const [rule, expected] of Object.entries(cfg.expected.dismantleRuleHistogram)) {
  checkSoft(dismantleRules[rule] ?? 0, expected, `dismantle rule ${rule}`);
}

// --- icons ------------------------------------------------------------------

const iconSources: Record<string, number> = {};
for (const item of Object.values(items)) iconSources[item.iconSource] = (iconSources[item.iconSource] ?? 0) + 1;
info(`icon sources: ${Object.entries(iconSources).map(([k, v]) => `${k}=${v}`).join(', ')}`);

const referenced = new Set(Object.values(items).map((i) => i.icon));
let badIcons = 0;
const dimensions: Record<string, number> = {};
for (const file of referenced) {
  const p = file === 'placeholder.png' ? path.join(DIRS.publicIcons, file) : path.join(DIRS.publicIconItems, file);
  if (!fs.existsSync(p)) {
    warn(`missing icon file: ${file}`);
    badIcons++;
    continue;
  }
  const buf = fs.readFileSync(p);
  const png = readPngInfo(buf);
  if (!png || buf.length <= 200) {
    warn(`not a usable PNG: ${file} (${buf.length} bytes)`);
    badIcons++;
    continue;
  }
  const key = `${png.width}x${png.height}`;
  dimensions[key] = (dimensions[key] ?? 0) + 1;
}
check(badIcons === 0, `every referenced icon is a valid PNG (${referenced.size} distinct files)`);

const topDims = Object.entries(dimensions)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([d, n]) => `${d}x${n}`)
  .join(', ');
info(`icon dimensions: ${topDims}`);

const onDisk = fs.readdirSync(DIRS.publicIconItems).filter((f) => f.endsWith('.png'));
const orphans = onDisk.filter((f) => !referenced.has(f));
check(orphans.length === 0, `no orphan icon files (${orphans.length}); ${onDisk.length} on disk`);

const manifestFiles = new Map<string, string>();
let manifestCollisions = 0;
for (const rec of Object.values(iconManifest)) {
  const prev = manifestFiles.get(rec.file);
  if (prev !== undefined && prev !== rec.origin && rec.file !== 'placeholder.png') manifestCollisions++;
  manifestFiles.set(rec.file, rec.origin ?? '');
}
check(manifestCollisions === 0, `no icon filename collisions in the manifest (${manifestCollisions})`);

// --- localization -----------------------------------------------------------

for (const lang of meta.languages) {
  const names = readJson<{ names: Record<string, string> }>(dataFile(`locale.${lang}.names.json`)).names;
  const details = readJson<Record<string, LocaleDetail>>(dataFile(`locale.${lang}.details.json`));
  const covered = playable.filter((i) => names[i.id] !== undefined).length;
  check(covered === playable.length, `${lang}: every playable item has a name (${covered}/${playable.length})`);

  // Unresolved %tokens% are left verbatim rather than guessed at; a handful are
  // values the game computes at runtime, but a jump means substitution broke.
  let leftover = 0;
  const walk = (nodes: RichNode[]): string =>
    nodes.map((n) => (n.t === 's' ? n.v : n.t === 'br' ? '\n' : walk(n.c))).join('');
  for (const detail of Object.values(details)) {
    const text = `${detail.desc ? walk(detail.desc) : ''}${detail.lore ?? ''}`;
    if (/%[A-Za-z0-9_]+%/.test(text)) leftover++;
  }
  const pct = ((leftover / Math.max(1, Object.keys(details).length)) * 100).toFixed(1);
  check(leftover <= 30, `${lang}: ${leftover} record(s) with unresolved placeholders (${pct}%), threshold 30`);

  // A surviving '%%' would mean the percent rule regressed. Unresolved tokens
  // are stripped first: `%unknown_token%%%` legitimately leaves `%unknown_token%`
  // followed by one literal '%', which reads as '%%' but is not a doubling bug.
  let doubled = 0;
  for (const detail of Object.values(details)) {
    if (!detail.desc) continue;
    const withoutTokens = walk(detail.desc).replace(/%[A-Za-z0-9_]+%/g, '');
    if (withoutTokens.includes('%%')) doubled++;
  }
  check(doubled === 0, `${lang}: no doubled '%%' survived substitution (${doubled})`);
}

// --- heroes and abilities ---------------------------------------------------

const heroesPath = dataFile('heroes.json');
if (!fs.existsSync(heroesPath)) {
  check(false, 'public/data/heroes.json exists');
} else {
  const heroes = readJson<HeroesData>(heroesPath);
  const abilityIds = loadAbilityTable();

  checkSoft(heroes.heroes.length, cfg.expected.heroCount, 'hero count');
  checkSoft(Object.keys(heroes.abilities).length, cfg.expected.selectableAbilityCount, 'selectable abilities');
  check(heroes.heroes.length === meta.heroCount, `meta.heroCount agrees: ${meta.heroCount}`);
  check(
    Object.keys(heroes.abilities).length === meta.abilityCount,
    `meta.abilityCount agrees: ${meta.abilityCount}`,
  );

  // The roster order is what a shared guide's hero byte means, so drift here is
  // as damaging as reordering the item id table.
  const rosterMatches =
    heroes.heroes.length === cfg.heroRoster.order.length &&
    heroes.heroes.every((h, i) => h.id === cfg.heroRoster.order[i] && h.idx === i + 1);
  check(rosterMatches, 'hero roster order and indices match the frozen config order');

  check(abilityIds.length === new Set(abilityIds).size, `ability table has no duplicates (${abilityIds.length})`);
  check(idTableHash(abilityIds) === meta.abilityTableHash, 'ability table hash matches meta.json');
  check(abilityIds.length === meta.abilityTableLength, `ability table length matches meta.json: ${abilityIds.length}`);
  const abilityIdxMismatch = Object.values(heroes.abilities).filter((a) => abilityIds[a.idx] !== a.id);
  check(
    abilityIdxMismatch.length === 0,
    `every ability idx resolves back to its id (${abilityIdxMismatch.length} mismatches)`,
  );

  // A hero's slot lists are what the picker offers; a dangling or mis-slotted
  // entry would open a picker on an ability that cannot go there.
  const rosterIds = new Set(heroes.heroes.map((h) => h.id));
  let slotProblems = 0;
  for (const hero of heroes.heroes) {
    for (const slot of ABILITY_SLOTS) {
      for (const id of hero.bySlot[slot] ?? []) {
        const ability = heroes.abilities[id];
        if (!ability || ability.slot !== slot) slotProblems++;
        else if (ability.hero !== null && ability.hero !== hero.id) slotProblems++;
      }
    }
    const flat = ABILITY_SLOTS.flatMap((s) => hero.bySlot[s] ?? []);
    if (flat.length !== hero.abilities.length) slotProblems++;
  }
  check(slotProblems === 0, `hero slot lists agree with their abilities (${slotProblems} problems)`);
  // A null owner is a shared ability every hero is granted, like the `f` heal.
  const orphanAbilities = Object.values(heroes.abilities).filter((a) => a.hero !== null && !rosterIds.has(a.hero));
  check(
    orphanAbilities.length === 0,
    `every ability belongs to a rostered hero or is shared (${orphanAbilities.length} orphans)`,
  );

  // Unfinished abilities must not reach the app: a guide built around
  // "Ability 001" would be advice about a spell that does not exist yet.
  const leaked = Object.keys(heroes.abilities).filter((id) => {
    const name = readJson<{ abilities: Record<string, { name: string }> }>(
      dataFile('locale.en.abilities.json'),
    ).abilities[id]?.name;
    return name !== undefined && /^(?:ability|skill|talent)\s*\d+$/i.test(name.trim());
  });
  check(leaked.length === 0, `no unfinished placeholder ability is offered (${leaked.length})`);

  /*
   * `playable` has to mean what the site relies on it meaning: a hero it offers
   * must have abilities of their own, and one it hides must not.
   *
   * Both directions matter. Offering a hero with nothing but the shared heal
   * gives somebody an empty spell panel; hiding one who *does* have abilities
   * quietly removes a hero from the site the day the addon finishes them.
   */
  const misflagged = heroes.heroes.filter((hero) => {
    const own = hero.abilities.some((id) => heroes.abilities[id]?.hero === hero.id);
    return own !== hero.playable;
  });
  check(
    misflagged.length === 0,
    `playable agrees with having abilities of one's own (${misflagged.map((h) => h.short).join(', ') || 'all 5'})`,
  );
  const offered = heroes.heroes.filter((h) => h.playable);
  check(offered.length > 0, `at least one hero is offered (${offered.length} of ${heroes.heroes.length})`);

  // Icons, same rules as items: real PNGs, nothing orphaned on disk.
  const abilityIcons = new Set(Object.values(heroes.abilities).map((a) => a.icon));
  const heroIcons = new Set(heroes.heroes.map((h) => h.icon));
  let badHeroIcons = 0;
  const iconCheck = (file: string, dir: string) => {
    const p = file === 'placeholder.png' ? path.join(DIRS.publicIcons, file) : path.join(dir, file);
    if (!fs.existsSync(p)) {
      warn(`missing icon file: ${file}`);
      badHeroIcons++;
      return;
    }
    const buf = fs.readFileSync(p);
    if (!readPngInfo(buf) || buf.length <= 200) {
      warn(`not a usable PNG: ${file} (${buf.length} bytes)`);
      badHeroIcons++;
    }
  };
  for (const file of abilityIcons) iconCheck(file, DIRS.publicIconAbilities);
  for (const file of heroIcons) iconCheck(file, DIRS.publicIconHeroes);
  check(
    badHeroIcons === 0,
    `every spell and portrait icon is a valid PNG (${abilityIcons.size} spell, ${heroIcons.size} portrait)`,
  );

  const abilityOnDisk = fs.readdirSync(DIRS.publicIconAbilities).filter((f) => f.endsWith('.png'));
  const heroOnDisk = fs.readdirSync(DIRS.publicIconHeroes).filter((f) => f.endsWith('.png'));
  const abilityOrphans = abilityOnDisk.filter((f) => !abilityIcons.has(f));
  const heroOrphans = heroOnDisk.filter((f) => !heroIcons.has(f));
  check(
    abilityOrphans.length === 0 && heroOrphans.length === 0,
    `no orphan spell or portrait icons (${abilityOrphans.length + heroOrphans.length}); ` +
      `${abilityOnDisk.length} spell, ${heroOnDisk.length} portrait on disk`,
  );

  for (const lang of meta.languages) {
    const file = dataFile(`locale.${lang}.abilities.json`);
    if (!fs.existsSync(file)) {
      check(false, `${lang}: locale.${lang}.abilities.json exists`);
      continue;
    }
    const text = readJson<LocaleAbilities>(file).abilities;
    const named = Object.keys(heroes.abilities).filter((id) => (text[id]?.name ?? '') !== '').length;
    check(
      named === Object.keys(heroes.abilities).length,
      `${lang}: every ability has a name (${named}/${Object.keys(heroes.abilities).length})`,
    );
    const walkAbility = (nodes: RichNode[]): string =>
      nodes.map((n) => (n.t === 's' ? n.v : n.t === 'br' ? '\n' : walkAbility(n.c))).join('');
    /*
     * Tokens the addon itself references but never defines are listed in the
     * config rather than silently tolerated here, so this check keeps failing
     * on a *new* one. See `knownDataIssues.unresolvedAbilityTokens`.
     */
    const known = cfg.knownDataIssues.unresolvedAbilityTokens ?? {};
    const leftover = Object.entries(text).filter(([id, a]) => {
      const found = (a.desc ? walkAbility(a.desc) : '').match(/%([A-Za-z0-9_]+)%/g) ?? [];
      const excused = new Set(known[id] ?? []);
      return found.some((token) => !excused.has(token.slice(1, -1)));
    }).length;
    check(leftover === 0, `${lang}: no ability description has unresolved placeholders (${leftover})`);
  }
}

// --- maps -------------------------------------------------------------------

{
  const file = dataFile('maps.json');
  if (!fs.existsSync(file)) {
    check(false, 'maps.json exists');
  } else {
    const mapsData = readJson<MapsData>(file);
    const maps = mapsData.maps;
    check(maps.length > 0, `map count: ${maps.length}`);
    check(maps.length === meta.mapCount, `meta.mapCount agrees: ${meta.mapCount}`);

    /*
     * The append-only contract, checked the same way the item and ability
     * tables are: every emitted map must resolve to a distinct position, and
     * the table's fingerprint must be the one meta.json published — a build
     * decoded against a different table would silently name the wrong room.
     */
    const table = loadMapTable();
    check(table.length === meta.mapTableLength, `map table length matches meta.json: ${meta.mapTableLength}`);
    check(idTableHash(table) === meta.mapTableHash, 'map table hash matches meta.json');
    check(new Set(table).size === table.length, `map table has no duplicates (${table.length})`);

    // Indices are 1-based, so 0 stays free to mean "no map chosen".
    const misplaced = maps.filter((m) => table[m.idx - 1] !== m.id);
    check(misplaced.length === 0, `every map idx resolves back to its id (${misplaced.length} mismatch(es))`);
    check(
      maps.every((m) => m.idx >= 1),
      'no map claims index 0, which is reserved for "no map chosen"',
    );

    const badTier = maps.filter((m) => !Number.isInteger(m.tier) || m.tier < 1 || m.tier > 20);
    check(badTier.length === 0, `every map has a plausible tier (${badTier.map((m) => m.id).join(', ') || 'all in 1-20'})`);

    /*
     * The three DLC rooms are the only ones whose displayed tier may differ
     * from ak_rooms.txt's Level — see the note on MapInfo.tier. A fourth would
     * mean the addon changed something this pipeline is guessing about.
     */
    const drifted = maps.filter((m) => m.tier !== m.roomLevel);
    check(
      drifted.every((m) => m.isDlc),
      `only DLC rooms show a tier above their KV level (${drifted.map((m) => `${m.id} ${m.roomLevel}->${m.tier}`).join(', ') || 'none'})`,
    );

    /*
     * The portal art. Not every room has it — the Skyfall Realm and the hidden
     * test rooms ship none — so what is checked is that every filename a map
     * *claims* resolves to a real PNG, and that nothing is left on disk that
     * no map points at.
     */
    const mapIconDir = DIRS.publicIconMaps;
    const claimed = new Set(maps.flatMap((m) => (m.image === undefined ? [] : [m.image])));
    const missingArt = [...claimed].filter((file) => !fs.existsSync(path.join(mapIconDir, file)));
    check(missingArt.length === 0, `every map image a map names exists (${missingArt.join(', ') || `${claimed.size} on disk`})`);

    const onDisk = fs.existsSync(mapIconDir) ? fs.readdirSync(mapIconDir).filter((f) => f.endsWith('.png')) : [];
    const orphanArt = onDisk.filter((f) => !claimed.has(f));
    check(orphanArt.length === 0, `no orphan map images (${orphanArt.join(', ') || `${onDisk.length} files`})`);

    for (const file of claimed) {
      const info = readPngInfo(fs.readFileSync(path.join(mapIconDir, file)));
      check(info !== null && info.width > 0 && info.height > 0, `${file} is a valid PNG`);
    }

    /*
     * The site's own chrome, which is not in any emitted table — nothing points
     * at these files but the components that draw them, so an icon quietly
     * failing to extract would show up as a broken image and nowhere else.
     */
    const uiIconDir = DIRS.publicIconUi;
    for (const name of Object.keys(cfg.uiIcons).filter((k) => !k.startsWith('_'))) {
      const file = path.join(uiIconDir, `${name}.png`);
      const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
      const info = bytes === null ? null : readPngInfo(bytes);
      check(info !== null && info.width > 0, `ui icon ${name}.png is a valid PNG`);
    }

    for (const lang of meta.languages) {
      const localeFile = dataFile(`locale.${lang}.maps.json`);
      if (!fs.existsSync(localeFile)) {
        check(false, `${lang}: locale.${lang}.maps.json exists`);
        continue;
      }
      const text = readJson<LocaleMaps>(localeFile).maps;
      const named = maps.filter((m) => (text[m.id]?.name ?? '') !== '').length;
      check(named === maps.length, `${lang}: every map has a name (${named}/${maps.length})`);
    }
  }
}

// --- golden fixtures --------------------------------------------------------

interface GoldenItem {
  name_en?: string;
  type?: string;
  quality?: number;
  level?: number;
  cost?: number;
  playable?: boolean;
  icon?: string;
  iconSource?: string;
  descPlain_en?: string;
  descFirstNode?: { t: string; tag: string; text: string };
  needs?: { id: string; count: number }[];
  gemKind?: string;
  gemValues?: Record<string, number>;
  tags?: string[];
  /** `null` asserts the item has no dismantle rule at all. */
  dismantle?: { rule: string; outputs: { id: string; chance?: number }[] } | null;
}
interface GoldenAbility {
  hero?: string;
  slot?: string;
  texture?: string;
  icon?: string;
  iconSource?: string;
  name_en?: string;
  name_ru?: string;
  descPlain_en?: string;
  valueLabels_en?: Record<string, string>;
}

interface GoldenHero {
  idx?: number;
  profession?: string;
  icon?: string;
  unfinished?: number;
  bySlot?: Record<string, string[]>;
}

const golden = readJson<{
  items: Record<string, GoldenItem>;
  graph: { recipe: string; usedByMustContain: string[] };
  abilities: Record<string, GoldenAbility>;
  heroes: Record<string, GoldenHero>;
}>(path.join(DIRS.tools, 'golden.json'));

const enNames = readJson<{ names: Record<string, string> }>(dataFile('locale.en.names.json')).names;
const enDetails = readJson<Record<string, LocaleDetail>>(dataFile('locale.en.details.json'));

let goldenChecked = 0;
for (const [id, want] of Object.entries(golden.items)) {
  const item = items[id];
  if (!item) {
    check(false, `golden: ${id} exists`);
    continue;
  }
  // Emitted JSON has recursively sorted keys, so compare on a canonical form
  // rather than raw stringify, which would flag pure key-order differences.
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v !== null && typeof v === 'object') {
      const src = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(src).sort().map((k) => [k, canon(src[k])]));
    }
    return v;
  };
  const eq = (actual: unknown, expected: unknown, field: string) => {
    goldenChecked++;
    if (JSON.stringify(canon(actual)) !== JSON.stringify(canon(expected))) {
      check(false, `golden ${id}.${field}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    }
  };

  if (want.type !== undefined) eq(item.type, want.type, 'type');
  if (want.quality !== undefined) eq(item.quality, want.quality, 'quality');
  if (want.level !== undefined) eq(item.level, want.level, 'level');
  if (want.cost !== undefined) eq(item.cost, want.cost, 'cost');
  if (want.playable !== undefined) eq(item.flags.playable, want.playable, 'flags.playable');
  if (want.icon !== undefined) eq(item.icon, want.icon, 'icon');
  if (want.iconSource !== undefined) eq(item.iconSource, want.iconSource, 'iconSource');
  if (want.needs !== undefined) eq(item.needs, want.needs, 'needs');
  if (want.tags !== undefined) eq(item.tags, want.tags, 'tags');
  if (want.gemKind !== undefined) eq(item.gem?.kind, want.gemKind, 'gem.kind');
  if (want.gemValues !== undefined) eq(item.gem?.values, want.gemValues, 'gem.values');
  // `null` in the fixture means the item must have no dismantle rule at all.
  if (want.dismantle !== undefined) eq(item.dismantle ?? null, want.dismantle, 'dismantle');
  if (want.name_en !== undefined) eq(enNames[id], want.name_en, 'name(en)');

  if (want.descPlain_en !== undefined) {
    const walk = (nodes: RichNode[]): string =>
      nodes.map((n) => (n.t === 's' ? n.v : n.t === 'br' ? '\n' : walk(n.c))).join('');
    const desc = enDetails[id]?.desc;
    eq(desc ? walk(desc) : undefined, want.descPlain_en, 'descPlain(en)');
  }
  if (want.descFirstNode !== undefined) {
    const first = enDetails[id]?.desc?.[0];
    const shape =
      first && first.t === 'el'
        ? { t: first.t, tag: first.tag, text: first.c.map((c) => (c.t === 's' ? c.v : '')).join('') }
        : undefined;
    eq(shape, want.descFirstNode, 'desc[0]');
  }
}

const recipe = items[golden.graph.recipe];
if (recipe) {
  for (const ingredientId of golden.graph.usedByMustContain) {
    goldenChecked++;
    const ingredient = items[ingredientId];
    if (!ingredient?.usedBy.includes(golden.graph.recipe)) {
      check(false, `golden graph: ${ingredientId}.usedBy is missing ${golden.graph.recipe}`);
    }
  }
} else {
  check(false, `golden graph: recipe ${golden.graph.recipe} exists`);
}

// --- golden fixtures: heroes and abilities ----------------------------------

let goldenHeroChecked = 0;
if (fs.existsSync(heroesPath)) {
  const heroes = readJson<HeroesData>(heroesPath);
  const abilityText: Record<string, Record<string, { name: string; descPlain?: string; values?: Record<string, string> }>> =
    {};
  for (const lang of meta.languages) {
    const file = dataFile(`locale.${lang}.abilities.json`);
    if (fs.existsSync(file)) abilityText[lang] = readJson<LocaleAbilities>(file).abilities;
  }

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const eqGolden = (actual: unknown, expected: unknown, what: string) => {
    goldenHeroChecked++;
    if (!same(actual, expected)) {
      check(false, `golden ${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    }
  };

  for (const [id, want] of Object.entries(golden.abilities)) {
    if (id.startsWith('_')) continue;
    const ability = heroes.abilities[id];
    if (!ability) {
      check(false, `golden: ability ${id} exists`);
      continue;
    }
    if (want.hero !== undefined) eqGolden(ability.hero, want.hero, `${id}.hero`);
    if (want.slot !== undefined) eqGolden(ability.slot, want.slot, `${id}.slot`);
    if (want.texture !== undefined) eqGolden(ability.texture, want.texture, `${id}.texture`);
    if (want.icon !== undefined) eqGolden(ability.icon, want.icon, `${id}.icon`);
    if (want.iconSource !== undefined) eqGolden(ability.iconSource, want.iconSource, `${id}.iconSource`);
    if (want.name_en !== undefined) eqGolden(abilityText['en']?.[id]?.name, want.name_en, `${id}.name(en)`);
    if (want.name_ru !== undefined) eqGolden(abilityText['ru']?.[id]?.name, want.name_ru, `${id}.name(ru)`);
    if (want.descPlain_en !== undefined) {
      eqGolden(abilityText['en']?.[id]?.descPlain, want.descPlain_en, `${id}.descPlain(en)`);
    }
    if (want.valueLabels_en !== undefined) {
      eqGolden(abilityText['en']?.[id]?.values, want.valueLabels_en, `${id}.valueLabels(en)`);
    }
  }

  for (const [id, want] of Object.entries(golden.heroes)) {
    if (id.startsWith('_')) continue;
    const hero = heroes.heroes.find((h) => h.id === id);
    if (!hero) {
      check(false, `golden: hero ${id} exists`);
      continue;
    }
    if (want.idx !== undefined) eqGolden(hero.idx, want.idx, `${id}.idx`);
    if (want.profession !== undefined) eqGolden(hero.profession, want.profession, `${id}.profession`);
    if (want.icon !== undefined) eqGolden(hero.icon, want.icon, `${id}.icon`);
    if (want.unfinished !== undefined) eqGolden(hero.unfinished, want.unfinished, `${id}.unfinished`);
    if (want.bySlot !== undefined) {
      // Compare slot by slot so a mismatch names the key that moved.
      for (const slot of ABILITY_SLOTS) {
        const expected = want.bySlot[slot];
        if (expected === undefined && (hero.bySlot[slot] ?? []).length === 0) continue;
        eqGolden(hero.bySlot[slot] ?? [], expected ?? [], `${id}.bySlot.${slot}`);
      }
    }
  }
}

ok(
  `golden fixtures: ${goldenChecked} field assertion(s) across ${Object.keys(golden.items).length} items, ` +
    `${goldenHeroChecked} across heroes and abilities`,
);

exitIfFailed();
