import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PARTNER_CHEST_REWARD,
  PARTNER_DEEP,
  PARTNER_NORMAL_COIN_AMOUNT,
  SKY_SUBTABS,
  eliteComboRange,
  endlessBossWaves,
  endlessDrops,
  endlessFloorStats,
  endlessSpanFloors,
  expectedRun,
  isSkySubtab,
  skyPageFacts,
  skySubtabTier,
  spawnShares,
  tierFloorStats,
  tierMonsters,
  type Combo,
  type PoolsFile,
  type PoolsLocale,
  type SkyFile,
  type SkyLocale,
  type SkySubtab,
  type SpawnPool,
  type StatPair,
} from 'aow5-shared/wiki';
import { Panel, cx } from '@/ui';
import { Link, useSearch, wikiPath } from '@/router';
import { useApp } from '@/data/AppData';
import type { Lang } from '@/i18n/strings';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import { SKY, type SkyStrings } from '../i18n/sky';
import {
  Chip,
  DataFooter,
  DataTable,
  DetailHeader,
  FactGrid,
  FilterGroup,
  ItemGrid,
  ItemRef,
  Note,
  Tag,
  WikiDetail,
  WikiError,
  WikiLoading,
  WikiMissing,
  WikiShell,
  WikiSubTabs,
  collate,
  day,
  num,
  pct,
  pctOf,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './SkyPage.module.css';

/**
 * The Skyfall Realm — the addon's Greed Cave, room `G001`.
 *
 * One page per sub-tab, `/wiki/sky/<tier1|tier2|tier3|endless|spawns|combos|scaling>`;
 * the bare section shows the first tier. The partner's tabs were buttons that
 * left the address alone, so a page could not be linked; here each is a link
 * and has its own card.
 *
 * A monster clicked on a tier or wave page goes to the spawn pools with
 * `?m=<monsterId>`, which scrolls to its rows and lights them — what the
 * partner did, because "which pool is it in" is what a player wants there.
 * Rows inside the pools go to the monster's own page.
 *
 * Numbers the pak does not carry (the end-of-run chest, a normal monster's
 * base crystal, the deep-floor growth) are the `PARTNER_*` constants of
 * `aow5-shared/wiki`, and each is marked with an asterisk that a footnote
 * explains.
 */

/** The parts of `monsters.json` this page reads — names, kind, level, rooms. */
interface MonsterLite {
  id: string;
  type: string;
  level?: number;
  locations: string[];
}
interface MonstersLite {
  monsters: MonsterLite[];
}
interface MonstersLocaleLite {
  names: Record<string, string>;
  types?: Record<string, string>;
}

type Data = [SkyFile, SkyLocale, PoolsFile, PoolsLocale, MonstersLite, MonstersLocaleLite];

interface Ctx {
  sky: SkyFile;
  skyLocale: SkyLocale;
  pools: PoolsFile;
  poolsLocale: PoolsLocale;
  monsters: Map<string, MonsterLite>;
  monsterName: (id: string) => string;
  monsterType: (type: string) => string;
  t: SkyStrings;
  lang: Lang;
}

export default function SkyPage({ path }: SectionProps) {
  const { lang } = useApp();
  const t = useWikiStrings(SKY);
  const { data, error } = useWikiData<Data>([
    'sky.json',
    'locale.{lang}.sky.json',
    'pools.json',
    'locale.{lang}.pools.json',
    'monsters.json',
    'locale.{lang}.monsters.json',
  ]);

  const key: SkySubtab | null = path.length === 0 ? 'tier1' : path.length === 1 && isSkySubtab(path[0]) ? path[0] : null;
  const missing = key === null;

  const ctx = useMemo<Ctx | null>(() => {
    if (data === null) return null;
    const [sky, skyLocale, pools, poolsLocale, monstersFile, monstersLocale] = data;
    const monsters = new Map(monstersFile.monsters.map((m) => [m.id, m]));
    return {
      sky,
      skyLocale,
      pools,
      poolsLocale,
      monsters,
      // A monster the locale does not name keeps its id, as the partner did.
      monsterName: (id) => monstersLocale.names[id] ?? id,
      monsterType: (type) => monstersLocale.types?.[type] ?? t.unitType[type] ?? type,
      t,
      lang,
    };
  }, [data, t, lang]);

  const facts = useMemo(
    () => (ctx === null || key === null || path.length === 0 ? null : (skyPageFacts(ctx.sky, ctx.skyLocale, ctx.pools, path, lang) ?? null)),
    [ctx, key, path, lang],
  );
  useWikiPageMeta('sky', path, facts, missing);

  const tabs = SKY_SUBTABS.map((k) => {
    const tier = skySubtabTier(k);
    const label = tier !== null ? t.tab.tier(tier) : t.tab[k as 'endless' | 'spawns' | 'combos' | 'scaling'];
    return { key: k, label, href: wikiPath('sky', k) };
  });

  return (
    /*
     * The full window: this section is drop tables, spawn pools and monster
     * cards, and the reading cap left the grids in a column three fifths of the
     * screen wide with nothing on either side. The prose inside the panels caps
     * itself, so the width goes to the data.
     */
    <WikiShell columns="wide">
      <WikiDetail>
        <DetailHeader title={t.title} tags={<span className={styles.lead}>{t.lead}</span>} />
        <WikiSubTabs items={tabs} active={key ?? ''} label={t.tabsLabel} />
        {missing && <WikiMissing />}
        {error !== null && <WikiError message={error} />}
        {!missing && ctx === null && error === null && <WikiLoading />}
        {!missing && ctx !== null && key !== null && <SubPage ctx={ctx} tab={key} />}
        {ctx !== null && <DataFooter ruleset={ctx.sky.ruleset.toUpperCase()} built={day(ctx.sky.generatedAt, lang)} />}
      </WikiDetail>
    </WikiShell>
  );
}

function SubPage({ ctx, tab }: { ctx: Ctx; tab: SkySubtab }) {
  const tier = skySubtabTier(tab);
  if (tier !== null) return <TierPage ctx={ctx} tier={tier} />;
  if (tab === 'endless') return <EndlessPage ctx={ctx} />;
  if (tab === 'spawns') return <SpawnsPage ctx={ctx} />;
  if (tab === 'combos') return <CombosPage ctx={ctx} />;
  return <ScalingPage ctx={ctx} />;
}

// --- shared bits ---------------------------------------------------------------

/** The asterisk on a number the partner wiki states and the pak does not. */
function Partner({ t }: { t: SkyStrings }) {
  return (
    <sup className={styles.mark} title={t.partnerNote}>
      {t.partnerMark}
    </sup>
  );
}

function PartnerFootnote({ t }: { t: SkyStrings }) {
  return <p className={styles.footnote}>{t.partnerNote}</p>;
}

function Head({ title, code, tags }: { title: string; code: string; tags?: ReactNode }) {
  return (
    <div className={styles.head}>
      <h2 className={styles.title}>{title}</h2>
      <code className={styles.code}>{code}</code>
      {tags !== undefined && <div className={styles.headTags}>{tags}</div>}
    </div>
  );
}

const spawnsHref = (monsterId: string) => `${wikiPath('sky', 'spawns')}?m=${encodeURIComponent(monsterId)}`;

/** `x` for a multiplier, in the reader's digits: `1.25`, `1,25`. */
const times = (value: number, lang: Lang) => num(value, lang, 2);

// --- a tier ---------------------------------------------------------------------

function TierPage({ ctx, tier }: { ctx: Ctx; tier: 1 | 2 | 3 }) {
  const { sky, pools, poolsLocale, t, lang } = ctx;
  const { core } = useApp();
  const common = useWikiStrings(COMMON);
  const tierData = sky.tiers.find((x) => x.tier === tier);
  const monsters = useMemo(() => tierMonsters(sky, tier), [sky, tier]);
  const run = useMemo(() => expectedRun(sky, tier), [sky, tier]);
  if (tierData === undefined) return <WikiMissing />;

  const cr = PARTNER_CHEST_REWARD;
  const poolId = cr.poolByTier[tier];
  const pool = pools.pools[poolId];
  const entries = pool?.entries ?? [];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const poolName = poolsLocale.names[poolId] ?? null;

  const levels = cr.rewardTiers
    .map((rt, i, all) =>
      t.rewardLevel(
        rt.tier,
        rt.minCoins > 0 ? num(rt.minCoins, lang) : null,
        rt.minCoins > 0 ? null : num(all[i + 1]?.minCoins ?? 0, lang),
        rt.extraDraw,
        times(rt.multMin, lang),
        times(rt.multMax, lang),
      ),
    )
    .join('; ');

  const c = sky.coins;
  const ancientTalents = sky.talents
    .filter(([, k]) => k === 'greed_cave_ancient_coin_gain_pct')
    .map(([id, , v]) => `${id} (+${pctOf(v, lang, 0)})`)
    .join(', ');
  const ancientName = core?.byId.get(cr.ancientItemId)?.name ?? ctx.skyLocale.names.ancientCoins ?? cr.ancientItemId;
  const roomName = (id: string) => core?.maps.byId.get(id)?.name ?? id;
  const a = tierData.attr;

  return (
    <>
      <Panel>
        <Head title={ctx.skyLocale.names.tierTitle?.replace('{tier}', String(tier)) ?? t.tab.tier(tier)} code={t.tierCode(tier)} />
        <FactGrid
          rows={[
            [t.facts.floors, num(tierData.maxFloor, lang)],
            [t.facts.invitation, <ItemRef key="c" id={tierData.compassItem} size="sm" />],
            [t.facts.daily, num(sky.dailyLimit, lang)],
            [t.facts.revives, num(sky.reviveCount, lang)],
            [t.facts.mult, `×${times(a.mult, lang)}`],
            [t.facts.move, `+${pctOf(a.move, lang, 0)}`],
            [t.facts.aspd, `+${pctOf(a.aspd, lang, 0)}`],
            [t.facts.armor, num(a.armor, lang)],
            [t.facts.mr, pctOf(a.mr, lang, 0)],
          ]}
        />
      </Panel>

      <Panel
        title={
          <>
            {t.chestTitle(poolId, poolName)}
            <Partner t={t} />
          </>
        }
      >
        <div className={styles.stack}>
          {/* The rules read at their own width; the draws below take the rest. */}
          <div className={styles.prose}>
            <p className={styles.text}>{t.chestText(num(cr.coinsPerDraw, lang), poolId, levels)}</p>
            <Note>
              {t.coinsNote({
                normal: num(PARTNER_NORMAL_COIN_AMOUNT, lang) + '*',
                luckyPct: num(c.normal.luckyPct, lang),
                lucky: num(c.normal.lucky, lang),
                bonusPct: num(c.normal.bonusPct, lang),
                bonus: num(c.normal.bonus, lang),
                elite: num(c.elite.amount, lang),
                eliteLuckyPct: num(c.elite.luckyPct, lang),
                eliteLucky: num(c.elite.lucky, lang),
                boss: num(c.boss.amount, lang),
                retain: pct(c.deathRetain, lang),
                coinsPerDraw: num(cr.coinsPerDraw, lang) + '*',
              })}
            </Note>
            <Note>
              {t.expectedNote(run.floors, num(Math.round(run.crystals), lang), run.level, num(run.draws, lang), num(run.coins, lang))}
            </Note>
            <Note>{t.ancientNote(ancientName, cr.ancientItemId, num(cr.ancientPerCoin, lang) + '*', ancientTalents)}</Note>
          </div>
          <ItemGrid>
            {sorted.map(([id, weight], i) => (
              <div key={`${id}:${i}`} className={styles.dropCell} title={`${id}\n${t.share}: ${pct(total > 0 ? weight / total : 0, lang)}`}>
                <ItemRef id={id} extra={poolId} />
                <span className={styles.chance}>{pct(total > 0 ? weight / total : 0, lang)}</span>
              </div>
            ))}
          </ItemGrid>
        </div>
      </Panel>

      <Panel title={t.monstersTitle(monsters.length)}>
        <div className={styles.stack}>
          <div className={styles.prose}>
            <Note>{t.monstersNote}</Note>
          </div>
          <div className={styles.cards}>
            {monsters.map((m) => {
              const mon = ctx.monsters.get(m.id);
              const rooms = (mon?.locations ?? []).map(roomName);
              const type = mon !== undefined ? ctx.monsterType(mon.type) : null;
              const bits = [
                mon?.level !== undefined ? common.levelShort(mon.level) : null,
                // The unit's own type is in the tooltip: beside the role it plays
                // here ("boss", "elite") it mostly repeated it.
                m.kinds.map((k) => t.kind[k]).join(' / '),
                t.floorsShort(m.floors.join(', ')),
                m.nested ? t.nested : null,
              ].filter((x): x is string => x !== null && x !== '');
              const tip = [`${ctx.monsterName(m.id)} (${m.id})`, type, rooms.join(', '), '', t.showSpawns].filter((x) => x !== null).join('\n');
              return (
                <div key={m.id} className={cx(styles.card, m.kinds[0] === 'boss' && styles.cardBoss, m.kinds[0] === 'elite' && styles.cardElite)}>
                  <Link to={{ href: spawnsHref(m.id) }} className={styles.cardMain} title={tip}>
                    <span className={styles.cardName}>{ctx.monsterName(m.id)}</span>
                    <span className={styles.cardMeta}>{bits.join(' · ')}</span>
                  </Link>
                  <Tag href={wikiPath('monsters', m.id)} title={t.monsterPage}>
                    ↗
                  </Tag>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
      <PartnerFootnote t={t} />
    </>
  );
}

// --- endless --------------------------------------------------------------------

function EndlessPage({ ctx }: { ctx: Ctx }) {
  const { sky, t, lang } = ctx;
  const { core } = useApp();
  const [kind, setKind] = useState<'' | 'equipment' | 'stones'>('');
  const [wave, setWave] = useState<number | null>(null);

  const waves = useMemo(() => endlessBossWaves(sky), [sky]);
  const all = useMemo(() => endlessDrops(sky), [sky]);

  const list = useMemo(() => {
    const byName = collate(lang);
    const name = (id: string) => core?.byId.get(id)?.name ?? id;
    let out = all.filter((r) => kind === '' || r.kind === kind);
    if (wave !== null) {
      out = out
        .map((r) => ({ ...r, waves: r.waves.filter((w) => w.wave === wave) }))
        .filter((r) => r.waves.length > 0)
        .map((r) => ({ ...r, best: r.waves[0]?.chance ?? 0 }));
    }
    return [...out].sort((a, b) => b.best - a.best || byName(name(a.id), name(b.id)));
  }, [all, kind, wave, lang, core]);

  const last = waves.at(-1);
  // A pool is named by the floors its boss actually stands on — 12, 15, 18, 21 — not by
  // the range between two switches: a range names floors no boss ever spawns on, and the
  // pool that opens on wave 24 is dealt on 27 too. The deepest pool never ends, so it reads
  // `48+`. The filter still keys on the wave the pool opens on.
  const floors = (wave: number, to: number | null) => endlessSpanFloors(wave, to).join(', ') + (to === null ? '+' : '');
  const waveFloors = wave === null ? null : waves.filter((w) => w.wave === wave).map((w) => floors(w.wave, w.to)).join(', ');
  const groupName = (g: string) => (g === 'equipment' ? t.kindLabel.equipment : g === 'stone' ? t.kindLabel.stones : g);

  return (
    <>
      <Panel>
        <Head
          title={ctx.skyLocale.names.endless ?? t.tab.endless}
          code={t.endlessCode}
          tags={
            <>
              {(['', 'stones', 'equipment'] as const).map((k) => (
                <Chip key={k} on={kind === k} onClick={() => setKind(k)}>
                  {k === '' ? t.kindAll : t.kindLabel[k]}
                </Chip>
              ))}
            </>
          }
        />
        <div className={styles.chips}>
          <Chip on={wave === null} onClick={() => setWave(null)}>
            {t.waveAll}
          </Chip>
          {waves.map((w) => (
            <Chip key={w.wave} on={wave === w.wave} onClick={() => setWave(w.wave)}>
              {floors(w.wave, w.to)}
            </Chip>
          ))}
        </div>
      </Panel>

      <Panel title={waveFloors === null ? t.dropTitle(list.length) : t.waveDropTitle(waveFloors, list.length)}>
        <ItemGrid>
          {list.map((r) => {
            const bosses = r.waves.map((w) => w.boss).join(', ');
            const nums = r.waves.map((w) => floors(w.wave, w.to)).join(', ');
            const tip = [
              t.dropTooltip,
              ...r.waves.map((w) => t.dropTooltipLine(w.boss, floors(w.wave, w.to), pct(w.chance, lang))),
            ].join('\n');
            return (
              <div key={r.id} className={styles.dropCell} title={tip}>
                <ItemRef id={r.id} extra={t.bossLine(bosses, nums, r.waves.length > 1, r.waves.length > 1)} />
                <span className={styles.chance}>{pct(r.best, lang)}</span>
              </div>
            );
          })}
        </ItemGrid>
      </Panel>

      <Panel title={t.wavesTitle(waves.length)}>
        <div className={styles.waveGrid}>
          {waves.map((w) => {
            const active = wave === w.wave;
            const split = w.groups.map(([g, p]) => `${groupName(g)} ${pctOf(p, lang, 0)}`).join(' / ');
            return (
              <button
                key={w.wave}
                type="button"
                className={cx(styles.waveCell, active && styles.waveCellOn)}
                aria-pressed={active}
                onClick={() => setWave(active ? null : w.wave)}
                title={`${w.poolId}\n${t.waveSplit(split)}\n\n${active ? t.waveClear : t.waveSet}`}
              >
                <span className={styles.waveNum}>{floors(w.wave, w.to)}</span>
                <span className={styles.waveText}>
                  <span className={styles.cardName}>{t.boss(w.boss)}</span>
                  <span className={styles.cardMeta}>{t.waveMeta(w.poolId, w.equipment.length, w.stones.length)}</span>
                  <span className={styles.cardMeta}>{t.waveSplit(split)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className={styles.prose}>
        <Note>{t.endlessNoteChance}</Note>
        {last !== undefined && (
          <Note>
            {t.endlessNoteDeep(
              waves.map((w) => w.wave).join(' · '),
              last.wave,
              last.poolId,
              last.level,
            )}
            <Partner t={t} />
          </Note>
        )}
        <Note>{t.endlessNoteTeam}</Note>
      </div>
      <PartnerFootnote t={t} />
    </>
  );
}

// --- spawn pools ----------------------------------------------------------------

function SpawnsPage({ ctx }: { ctx: Ctx }) {
  const { sky, t, lang } = ctx;
  const search = useSearch();
  const focus = new URLSearchParams(search).get('m') ?? '';
  const focusRef = useRef<HTMLElement | null>(null);

  // After the page's own scroll-to-top, which runs in a parent's effect after
  // this one — hence the frame.
  useEffect(() => {
    if (focus === '') return;
    const id = requestAnimationFrame(() => focusRef.current?.scrollIntoView({ block: 'center' }));
    return () => cancelAnimationFrame(id);
  }, [focus]);

  const groups: { key: string; title: (n: number) => string; pools: SpawnPool[] }[] = [
    ...([1, 2, 3] as const).map((tier) => ({
      key: `t${tier}`,
      title: (n: number) => t.tierGroup(tier, n),
      pools: sky.spawnPools.filter((p) => p.tier === tier && !p.endless),
    })),
    { key: 'endless', title: t.endlessGroup, pools: sky.spawnPools.filter((p) => p.endless) },
  ];
  const found = focus !== '' && sky.spawnPools.some((p) => p.entries.some(([id]) => id === focus));
  let focusAssigned = false;

  const jump = (poolId: string) => document.getElementById(`pool-${poolId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  return (
    <>
      <Panel>
        <Head title={t.spawnsTitle} code={t.poolsCount(sky.spawnPools.length)} />
        {focus !== '' && (
          <p className={styles.text}>
            <strong>{ctx.monsterName(focus)}</strong> <code className={styles.code}>{focus}</code>
            {!found && <> — {t.focusMissing}</>}
          </p>
        )}
      </Panel>
      {groups
        .filter((g) => g.pools.length > 0)
        .map((g) => (
          <Panel key={g.key} title={g.title(g.pools.length)}>
            <div className={styles.poolGrid}>
              {g.pools.map((p) => (
                <div key={p.id} id={`pool-${p.id}`} className={styles.poolCell} title={p.id}>
                  <div className={styles.poolHead}>
                    <span className={styles.poolId}>{p.id}</span>
                    <span className={styles.poolMeta}>{t.poolMeta(p.level, p.entries.length)}</span>
                  </div>
                  {spawnShares(p).map((m, i) => {
                    const share = pctOf(m.share, lang, 1);
                    if (m.pool) {
                      return (
                        <button key={`${m.id}:${i}`} type="button" className={cx(styles.poolLine, styles.poolRef)} onClick={() => jump(m.id)} title={t.jumpPool}>
                          <span className={styles.poolName}>↳ {m.id}</span>
                          <span className={styles.poolShare}>{share}</span>
                        </button>
                      );
                    }
                    const on = m.id === focus;
                    const first = on && !focusAssigned;
                    if (first) focusAssigned = true;
                    return (
                      <Link
                        key={`${m.id}:${i}`}
                        to={{ href: wikiPath('monsters', m.id) }}
                        className={cx(styles.poolLine, on && styles.poolFocus)}
                        title={`${m.id} — ${t.openMonster}`}
                        ref={first ? (el: HTMLAnchorElement | null) => void (focusRef.current = el) : undefined}
                      >
                        <span className={styles.poolName}>{ctx.monsterName(m.id)}</span>
                        <span className={styles.poolShare}>{share}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      <div className={styles.prose}>
        <Note>{t.spawnsNote}</Note>
      </div>
    </>
  );
}

// --- combos ---------------------------------------------------------------------

function CombosPage({ ctx }: { ctx: Ctx }) {
  const { sky, t, lang } = ctx;
  const [cTier, setTier] = useState<number | null>(null);
  const [cFloor, setFloor] = useState<number | null>(null);
  const [cKind, setKind] = useState<Combo['kind'] | null>(null);

  const tiers = useMemo(() => [...new Set(sky.combos.map((c) => c.tier))].sort((a, b) => a - b), [sky]);
  const floors = useMemo(() => [...new Set(sky.combos.map((c) => c.floor))].sort((a, b) => a - b), [sky]);
  const list = useMemo(
    () =>
      sky.combos.filter(
        (c) => (cTier === null || c.tier === cTier) && (cFloor === null || c.floor === cFloor) && (cKind === null || c.kind === cKind),
      ),
    [sky, cTier, cFloor, cKind],
  );

  // The data's tier 4 is the endless run's (its pools' `Level` is 4 too).
  const tierLabel = (tier: number) => (tier <= 3 ? t.tierChip(tier) : t.endlessChip);
  const kindLabel = (kind: Combo['kind']) => (kind === 'boss' ? t.kind.boss : t.kind.elite);

  return (
    <>
      <Panel>
        <Head title={t.combosTitle} code={t.combosCount(sky.combos.length)} />
        <div className={styles.filters}>
          <FilterGroup label={t.filterTier}>
            <Chip on={cTier === null} onClick={() => setTier(null)}>
              {t.allTiers}
            </Chip>
            {tiers.map((x) => (
              <Chip key={x} on={cTier === x} onClick={() => setTier(x)}>
                {tierLabel(x)}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label={t.filterFloor}>
            <Chip on={cFloor === null} onClick={() => setFloor(null)}>
              {t.allFloors}
            </Chip>
            {floors.map((x) => (
              <Chip key={x} on={cFloor === x} onClick={() => setFloor(x)}>
                {t.floorChip(x)}
              </Chip>
            ))}
          </FilterGroup>
          <FilterGroup label={t.filterKind}>
            <Chip on={cKind === null} onClick={() => setKind(null)}>
              {t.allKinds}
            </Chip>
            {(['boss', 'elite'] as const).map((k) => (
              <Chip key={k} on={cKind === k} onClick={() => setKind(k)}>
                {kindLabel(k)}
              </Chip>
            ))}
          </FilterGroup>
        </div>
      </Panel>

      <Panel title={t.combosList(list.length)}>
        <div className={styles.poolGrid}>
          {list.map((c) => (
            <div key={c.id} className={styles.poolCell}>
              <div className={styles.poolHead}>
                <span className={styles.poolId}>{c.id}</span>
                <span className={styles.poolMeta}>{t.comboMeta(tierLabel(c.tier), c.floor, kindLabel(c.kind), num(c.weight, lang))}</span>
              </div>
              {c.members.map(([id, x, y, , role], i) => {
                const roleText = role === null ? t.roleDefault : t.role[role];
                return (
                  <Link key={`${id}:${i}`} to={{ href: spawnsHref(id) }} className={styles.poolLine} title={t.memberTitle(id, roleText, x, y)}>
                    <span className={styles.poolName}>
                      {ctx.monsterName(id)}
                      {role !== null && <span className={styles.role}> ({t.role[role]})</span>}
                    </span>
                    <span className={styles.poolShare} title={t.offset}>
                      {x}, {y}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
      <div className={styles.prose}>
        <Note>{t.combosNote}</Note>
      </div>
    </>
  );
}

// --- scaling --------------------------------------------------------------------

function ScalingPage({ ctx }: { ctx: Ctx }) {
  const { sky, t, lang } = ctx;
  const s = sky.scaling;
  const wc = sky.waveCounts;
  const range = useMemo(() => eliteComboRange(sky), [sky]);
  const floorsN = PARTNER_DEEP.tableFloors;
  const endless = useMemo(() => Array.from({ length: floorsN }, (_, i) => endlessFloorStats(sky, i + 1)), [sky, floorsN]);
  const pair = (p: StatPair) => t.hpAtk(num(p.hp, lang, 0), num(p.atk, lang, 0));

  return (
    <>
      <Panel>
        <Head title={t.scalingTitle} code={t.scalingCode(floorsN)} />
        <div className={styles.prose}>
          <p className={styles.text}>{t.scalingIntro}</p>
          <Note>{t.scalingPlayers}</Note>
          <Note>{t.waveCounts(wc.normalTotal, wc.maxAlive, range.min, range.max, wc.eliteTotal, pctOf(wc.bossFollowupPct * 100, lang, 0))}</Note>
        </div>
      </Panel>

      <Panel title={t.tiersTitle}>
        <div className={styles.stack}>
          <p className={styles.text}>{t.tiersText(s.tierScale.anchor, times(s.tierScale.growth, lang))}</p>
          <div className={styles.tierGrid}>
            {sky.tiers.map((tier) => {
              const first = tierFloorStats(sky, tier.tier, 1);
              const lastF = tierFloorStats(sky, tier.tier, tier.maxFloor);
              return (
                <div key={tier.tier} className={styles.tierCell} title={t.tierCellTitle(times(s.tierScale.growth, lang))}>
                  <div className={styles.cardName}>{t.tierCell(tier.tier)}</div>
                  <div className={styles.cardMeta}>
                    {t.tierCellMeta(tier.maxFloor, times(tier.attr.mult, lang), pctOf(tier.attr.move, lang, 0), pctOf(tier.attr.aspd, lang, 0))}
                  </div>
                  {[first, lastF].map((f) => (
                    <div key={f.floor} className={styles.statBlock}>
                      <div className={styles.statFloor}>{t.atFloor(f.floor)}</div>
                      {(['normal', 'elite', 'boss'] as const).map((k) => (
                        <div key={k} className={styles.statLine}>
                          <span className={styles.statLabel}>{t.kind[k]}</span>
                          <span>{pair(f[k])}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title={t.endlessTitle(floorsN)}>
        <DataTable
          compact
          numeric={[0, 1, 2, 3, 4, 5]}
          head={[t.col.floor, t.col.normal, t.col.elite, t.col.boss, t.col.armor, t.col.mr]}
          rows={endless.map((f) => [
            f.floor,
            pair(f.normal),
            pair(f.elite),
            pair(f.boss),
            num(f.armor, lang),
            pctOf(f.mr, lang, 0),
          ])}
        />
      </Panel>

      <Panel title={t.growthTitle}>
        <div className={styles.prose}>
          <p className={styles.text}>
            {t.growthText(
              s.endless.softStart - 1,
              s.endless.curveTier,
              times(s.endless.hpGrowth, lang),
              times(s.endless.atkGrowth, lang),
              s.endless.armorPer3,
              s.endless.mrPer3,
              s.endless.mrCap,
            )}
          </p>
          <p className={styles.text}>
            {t.deepText(PARTNER_DEEP.deepFrom, PARTNER_DEEP.deepDmg, PARTNER_DEEP.deepResist, PARTNER_DEEP.stunBase)}
            <Partner t={t} />
          </p>
        </div>
      </Panel>
      <PartnerFootnote t={t} />
    </>
  );
}
