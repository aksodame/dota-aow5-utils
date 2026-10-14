import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DIRS } from './lib/paths.ts';
import { info, ok, step, warn } from './lib/log.ts';
import {
  locFarm,
  type LocationsFile,
  type MinigamesLocale,
  type MonstersFile,
  type MonstersLocale,
  type PoolEntry,
} from '../../packages/aow5-shared/src/wiki/monsters.ts';

/**
 * Golden check for step 08a against the partner wiki's snapshot (game v1.507,
 * ruleset s2, built 2026-10-13): `data/monsters.js`, the monster half of
 * `data/meta.js`, `data/maps.js`, `data/minigames.js`, and `farm.js`'s numbers.
 *
 * Read-only and report-only: every difference is printed with enough context
 * to explain it (pak moved on, partner curated, or our bug). Exits non-zero
 * only when the snapshot or our output cannot be read.
 *
 *   node parser/tools/08a-wiki-monsters.golden.ts [path/to/aow-wiki-site]
 */

const SITE = process.argv[2] ?? path.resolve(import.meta.dirname, '../../../aow-wiki-site'); // a clone beside this repo
const WIKI = path.join(DIRS.publicData, 'wiki');

step('08a golden · monsters vs the partner snapshot');

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ctx: { window: { AOW: Any; AOWFARM?: Any } } = { window: { AOW: {} } };
(ctx.window as Any)['window'] = ctx.window;
for (const f of ['monsters', 'meta', 'maps', 'minigames']) {
  vm.runInNewContext(fs.readFileSync(path.join(SITE, 'data', `${f}.js`), 'utf8'), ctx);
}
vm.runInNewContext(fs.readFileSync(path.join(SITE, 'farm.js'), 'utf8'), ctx);
const P = ctx.window.AOW;
const PF = ctx.window.AOWFARM!;

const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(WIKI, f), 'utf8')) as T;
const ours = read<MonstersFile>('monsters.json');
const loc = read<LocationsFile>('locations.json');
const ru = read<MonstersLocale>('locale.ru.monsters.json');
const ruGames = read<MinigamesLocale>('locale.ru.minigames.json');
const maps = JSON.parse(fs.readFileSync(path.join(DIRS.publicData, 'maps.json'), 'utf8')) as Any;

let diffs = 0;
const show = (label: string, list: string[], cap = 12): void => {
  if (list.length === 0) {
    ok(`${label}: no differences`);
    return;
  }
  diffs += list.length;
  warn(`${label}: ${list.length} difference(s)`);
  for (const line of list.slice(0, cap)) info(`  ${line}`);
  if (list.length > cap) info(`  … and ${list.length - cap} more`);
};

// --- monsters -----------------------------------------------------------------

const byId = new Map(ours.monsters.map((m) => [m.id, m]));
const theirs = new Map<string, Any>((P['monsters'] as Any[]).map((m) => [m['id'], m]));
show(
  'units only we emit',
  [...byId.keys()].filter((id) => !theirs.has(id)).map((id) => `${id} (${byId.get(id)!.type})`),
  20,
);
show('units only the partner has', [...theirs.keys()].filter((id) => !byId.has(id)));

const FIELDS = [
  'level', 'exp', 'gold', 'hp', 'mana', 'damage', 'armor', 'magicResist', 'moveSpeed', 'attackRange',
  'attackRate', 'attackSpeed', 'healthRegen', 'manaRegen', 'stunResist', 'debuffResist', 'critChance',
  'dropRatePct', 'dropMin', 'dropMax', 'consideredHero',
] as const;
const fieldDiffs: string[] = [];
const fieldTally: Record<string, number> = {};
const poolDiffs: string[] = [];
const locDiffs: string[] = [];
const nameDiffs: string[] = [];
const fmt = (pool: PoolEntry[]): string => pool.map(([i, w]) => `${i}:${w}`).sort().join('|');
for (const [id, t] of theirs) {
  const m = byId.get(id);
  if (!m) continue;
  for (const f of FIELDS) {
    const a = (m as Any)[f] ?? null;
    const b = t[f] ?? null;
    // The partner fills absent stats with null; so do we, by omission.
    // A missing DropRate/DropMin/DropMax is "no drops" to both of us; the partner writes null, we write 0.
    const dropZero = (f === 'dropRatePct' || f === 'dropMin' || f === 'dropMax') && a === 0 && b === null;
    if (a !== b && !(b === null && a === undefined) && !dropZero) {
      fieldTally[f] = (fieldTally[f] ?? 0) + 1;
      fieldDiffs.push(`${id}.${f}: ours ${JSON.stringify(a)} partner ${JSON.stringify(b)}`);
    }
  }
  for (const [ourKey, theirKey] of [['pool', 'pool'], ['poolHard', 'poolHard'], ['poolFirst', 'poolFirst']] as const) {
    const a = fmt(m[ourKey]);
    const b = fmt((t[theirKey] as Any[]).map((e) => [e['id'], e['weight']] as PoolEntry));
    if (a !== b) {
      const s1 = m.bySeason?.s1?.[ourKey];
      const note = s1 !== undefined && fmt(s1) === b ? ' — the partner has our S1 copy' : '';
      poolDiffs.push(`${id}.${ourKey}: ours ${m[ourKey].length} rows, partner ${(t[theirKey] as Any[]).length}${note}`);
    }
  }
  const la = [...m.locations].sort().join(',');
  const lb = [...(t['locations'] as string[])].sort().join(',');
  if (la !== lb) {
    const placed = m.locations.filter((r) => !(t['locations'] as string[]).includes(r) && (loc.locations[r]?.spawns[id]?.length ?? 0) > 0);
    locDiffs.push(`${id}: ours [${la}] partner [${lb}]${placed.length ? ` — placed by the map of ${placed.join(', ')}` : ''}`);
  }
  if ((ru.names[id] ?? null) !== t['name']) nameDiffs.push(`${id}: ours ${JSON.stringify(ru.names[id] ?? null)} partner ${JSON.stringify(t['name'])}`);
}
info(`field differences by field: ${JSON.stringify(fieldTally)}`);
show('unit fields', fieldDiffs);
show('pools (s2)', poolDiffs);
show("locations", locDiffs, 30);
show('Russian names', nameDiffs);

// groups and tree guards
{
  const list: string[] = [];
  const pg = P['meta']['monsterGroups'] as Any;
  for (const [id, g] of Object.entries(pg) as [string, Any][]) {
    const o = ours.groups[id];
    const b = (g['monsters'] as Any[]).map((e) => `${e['id']}:${e['weight']}`).join('|');
    const a = o?.monsters.map(([i, w]) => `${i}:${w}`).join('|');
    if (a !== b || o?.note !== g['note']) list.push(`${id}: ours ${a} (${o?.note}) partner ${b} (${g['note']})`);
  }
  for (const [id, t] of theirs) {
    const a = (byId.get(id)?.groups ?? []).join(',');
    const b = ((t['groups'] as string[] | undefined) ?? []).join(',');
    if (a !== b) list.push(`${id}.groups: ours [${a}] partner [${b}]`);
  }
  show('guard groups', list);
}

// difficulties
{
  const list: string[] = [];
  for (const [key, d] of Object.entries(P['meta']['difficulties']) as [string, Any][]) {
    const o = ours.difficulties.find((x) => x.key === key);
    if (!o) list.push(`${key}: missing`);
    else {
      if (o.dropCountBonusPct !== d['dropCountBonusPct']) list.push(`${key}.dropCountBonusPct ${o.dropCountBonusPct} vs ${d['dropCountBonusPct']}`);
      if (o.difficultyBonusPct !== d['difficultyBonusPct']) list.push(`${key}.difficultyBonusPct ${o.difficultyBonusPct} vs ${d['difficultyBonusPct']}`);
    }
    const label = ru.difficulties[key as 'easy'];
    if (label !== d['label']) list.push(`${key} label: ours ${JSON.stringify(label)} partner ${JSON.stringify(d['label'])}`);
  }
  show('difficulties', list);
}

// rooms: the partner's meta.rooms against the builder's maps.json
{
  const list: string[] = [];
  const ourRooms = new Map<string, Any>((maps['maps'] as Any[]).map((m) => [m['id'], m]));
  for (const [id, r] of Object.entries(P['meta']['rooms']) as [string, Any][]) {
    const o = ourRooms.get(id);
    if (!o) {
      list.push(`${id}: not in maps.json (hidden by the builder's roster)`);
      continue;
    }
    if (o['roomLevel'] !== r['level']) list.push(`${id}.level ${o['roomLevel']} vs ${r['level']}`);
    if (o['gold'] !== r['gold']) list.push(`${id}.gold ${o['gold']} vs ${r['gold']}`);
    if (o['isDlc'] !== r['isDLC']) list.push(`${id}.isDLC ${o['isDlc']} vs ${r['isDLC']}`);
    if ((o['bosses'] as string[]).join() !== (r['bosses'] as string[]).join()) list.push(`${id}.bosses ${o['bosses']} vs ${r['bosses']}`);
  }
  show('rooms (maps.json vs meta.rooms)', list, 25);
}

// --- maps ---------------------------------------------------------------------

{
  const list: string[] = [];
  const hunters: string[] = [];
  let compared = 0;
  for (const [room, pm] of Object.entries(P['maps']) as [string, Any][]) {
    const l = loc.locations[room];
    if (!l) {
      list.push(`${room}: no location`);
      continue;
    }
    const b = pm['bounds'] as Any;
    if (JSON.stringify(l.bounds) !== JSON.stringify({ minX: b['minX'], minY: b['minY'], maxX: b['maxX'], maxY: b['maxY'] })) {
      list.push(`${room}.bounds ours ${JSON.stringify(l.bounds)} partner ${JSON.stringify(b)}`);
    }
    const key = (id: string, p: Any): string =>
      `${id}@${p['x']},${p['y']} ${Math.round(p['chance'] * 10) / 10}%×${p['count']} ${p['kind']}${p['via'] ? `/${p['via']}` : ''}`;
    const a = new Map<string, number>();
    for (const [id, pts] of Object.entries(l.spawns)) for (const p of pts) a.set(key(id, p), (a.get(key(id, p)) ?? 0) + 1);
    const c = new Map<string, number>();
    for (const [id, pts] of Object.entries(pm['spawns'] as Record<string, Any[]>)) for (const p of pts) c.set(key(id, p), (c.get(key(id, p)) ?? 0) + 1);
    for (const [k, n] of a) {
      compared += n;
      if ((c.get(k) ?? 0) !== n) list.push(`${room} only ours: ${k}`);
    }
    for (const [k, n] of c) if ((a.get(k) ?? 0) !== n) list.push(`${room} only partner: ${k}`);

    for (const h of pm['hunters'] as Any[]) {
      const o = l.hunters.find((x) => x.id === h['id'] && x.x === h['x'] && x.y === h['y']);
      if (!o) {
        hunters.push(`${room}: partner hunter ${h['id']} @${h['x']},${h['y']} not found`);
        continue;
      }
      const pairs: [string, number | null, number][] = [
        ['waveChance', o.waveChance, h['waveChance']],
        ['minCount', o.minCount, h['minCount']],
        ['maxCount', o.maxCount, h['maxCount']],
        ['startDelay', o.startDelay, h['startDelay']],
      ];
      for (const [f, x, y] of pairs) {
        if (x !== y) hunters.push(`${room} ${h['id']}.${f}: ours ${x} partner ${y}${x === null ? ' (map leaves it to the server default)' : ''}`);
      }
    }
  }
  info(`${compared} spawn point(s) of ours compared`);
  show('spawn points', list, 20);
  show('hunters', hunters, 30);
}

// --- minigames ----------------------------------------------------------------

{
  const list: string[] = [];
  for (const g of P['minigames']['games'] as Any[]) {
    const o = ruGames.games[g['id']];
    if (!o) {
      list.push(`${g['id']}: missing`);
      continue;
    }
    if ((o.name ?? null) !== g['name']) list.push(`${g['id']}.name ${JSON.stringify(o.name)} vs ${JSON.stringify(g['name'])}`);
    if ((o.task ?? null) !== g['task']) list.push(`${g['id']}.task ${JSON.stringify(o.task)} vs ${JSON.stringify(g['task'])}`);
    if ((o.instructor ?? null) !== g['instructor']) list.push(`${g['id']}.instructor ${JSON.stringify(o.instructor)} vs ${JSON.stringify(g['instructor'])}`);
    if ((o.rules ?? null) !== g['rules']) list.push(`${g['id']}.rules differ`);
    for (const h of g['hud'] as Any[]) if (o.hud[h['key']] !== h['text']) list.push(`${g['id']}.hud.${h['key']} differs`);
    for (const h of g['goals'] as Any[]) if (o.goals[h['key']] !== h['text']) list.push(`${g['id']}.goals.${h['key']} differs`);
    if (o.victory.join('|') !== (g['victory'] as string[]).join('|')) list.push(`${g['id']}.victory ${o.victory.join('|')} vs ${(g['victory'] as string[]).join('|')}`);
    const vs = Object.values(o.variants);
    for (const v of g['variants'] as Any[]) if (!vs.includes(v['text'])) list.push(`${g['id']}: partner variant "${v['label']}" text not found`);
  }
  show('minigames (ru)', list);
}

// --- farm numbers -------------------------------------------------------------

{
  const list: string[] = [];
  for (const room of ['M001', 'M002', 'M005', 'M009']) {
    for (const key of ['normal', 'hard'] as const) {
      const d = ours.difficulties.find((x) => x.key === key);
      const a = locFarm(ours.monsters, loc, room, d);
      const b = PF['locFarm'](room, key, false) as Any;
      const ga = Math.round(a.gold * 10) / 10;
      const gb = Math.round(b['gold'] * 10) / 10;
      const ia = a.items.get('item_M001')?.avg ?? 0;
      const ib = (b['items'].get('item_M001')?.avg as number | undefined) ?? 0;
      const line = `${room} ${key}: gold ${ga} vs ${gb}; item_M001 avg ${ia.toFixed(3)} vs ${ib.toFixed(3)}; items ${a.items.size} vs ${b['items'].size}`;
      if (ga !== gb || Math.abs(ia - ib) > 1e-9 || a.items.size !== b['items'].size) list.push(line);
      else info(`  ${line}`);
    }
  }
  show('locFarm', list);
}

info(`${diffs} difference(s) in total`);
