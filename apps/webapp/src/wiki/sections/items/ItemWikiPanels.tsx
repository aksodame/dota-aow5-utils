import { useMemo, useState, type ReactNode } from 'react';
import { statSpan, type ItemSummary } from 'aow5-shared/data';
import type { ItemFull } from 'aow5-shared/types';
import {
  applySeasonalPatch,
  containersOf,
  craftUnlockOf,
  endlessAppearances,
  endlessBossSpans,
  endlessMerchantSpans,
  endlessSpanLabel,
  gachaByItem,
  itemDropIndex,
  mallByItem,
  rewardChestTiers,
  seasonalPatch,
  soulCooldownAt,
  soulMultiplier,
  soulMultiplierRules,
  stoneLinks,
  vendorOffersOf,
  type CraftFile,
  type EndlessSpan,
  type EndlessStage,
  type ItemDropRow,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type Monster,
  type MonstersFile,
  type MonstersLocale,
  type PoolsFile,
  type ProgressionLocale,
  type SkyFile,
  type SourcesFile,
  type SourcesLocale,
  type VendorOffer,
  type VendorsFile,
} from 'aow5-shared/wiki';
import { Button, Icon, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { rarityLabel } from '@/i18n/strings';
import { formatSpan, isTuningKey, statLabel } from '@/lib/itemStats';
import { itemPath, Link, wikiPath } from '@/router';
import { PanelTitle, Section } from '@/routes/ItemPage';
import page from '@/routes/ItemPage.module.css';
import { ItemRef, Tag, num, pct, useWikiData } from '../../kit';
import { useWikiStrings } from '../../i18n';
import { ITEMS, joinList } from '../../i18n/items';
import styles from './ItemWikiPanels.module.css';

/**
 * The item page's wiki panels — everything the partner wiki's item tab showed
 * that the catalogue's own page did not: where an item drops and with what
 * chance, who sells it, what unlocks its craft, its fate stone, a Life Soul's
 * transformation, the paid sources.
 *
 * A chunk of its own, loaded by `ItemPage` with `lazy`: the page is in the
 * builder's main bundle, and these panels bring the wiki's data files and
 * three languages of prose with them. Each panel fetches the files it needs
 * (the loader shares them across panels and pages) and draws nothing until
 * they have arrived, so the page never shows an empty box.
 *
 * Every panel takes the same props and draws `null` when it has nothing to
 * say about this item, so `ItemPage` places them by its layout and never has
 * to know which apply.
 */
export interface WikiPanelProps {
  item: ItemSummary;
  /** The record as the page shows it — already the selected season's copy. */
  full: ItemFull | undefined;
  /** The season the page shows numbers for. */
  season: 1 | 2;
}

type Data<T extends unknown[]> = T | null;

function useFiles<T extends unknown[]>(files: readonly string[]): Data<T> {
  return useWikiData<T>(files).data;
}

/** Every full record, for the inversions over the whole table. */
function useAllItems(): ItemFull[] | null {
  const store = useItemDetailsStore();
  const full = store?.full ?? null;
  return useMemo(
    () => (full === null ? null : Object.values(full).filter((i): i is ItemFull => i !== null && typeof i === 'object' && typeof i.id === 'string')),
    [full],
  );
}

// --- "From the code" ------------------------------------------------------------

/** The partner's hand-written note on a mechanic the tooltip leaves out, for the five items that have one. */
export function CodeNote({ item }: WikiPanelProps) {
  const t = useWikiStrings(ITEMS);
  const note = t.codeNotes[item.id];
  if (note === undefined) return null;
  return (
    <p className={styles.codeNote}>
      <strong>{t.codeNoteLabel}:</strong> {note}
    </p>
  );
}

// --- Life Soul --------------------------------------------------------------------

export function SoulPanel({ full }: WikiPanelProps) {
  const { lang, strings } = useApp();
  const t = useWikiStrings(ITEMS).soul;
  const data = useFiles<[ItemsExtraFile, ItemsExtraLocale, MonstersLocale]>([
    'items-extra.json',
    'locale.{lang}.items-extra.json',
    'locale.{lang}.monsters.json',
  ]);
  const all = useAllItems();
  const rules = useMemo(() => (all === null ? [] : soulMultiplierRules(all)), [all]);

  if (full?.isSoul !== true) return null;
  const mult = soulMultiplier(full);
  const ruleText =
    rules.length > 0
      ? rules.map(([q, m]) => t.rule(rarityLabel(strings, q), num(m, lang))).join(', ')
      : '—';

  const soul = data?.[0].items[full.id]?.soul;
  const skill = soul !== undefined ? data?.[0].soulSkills[soul.source] : undefined;
  const skillText = skill !== undefined ? data?.[1].soulSkills[skill.id] : undefined;
  const bossName = skill !== undefined ? (data?.[2].names[skill.bossUnit] ?? skill.bossUnit) : '';
  const s = (v: number) => t.seconds(num(v, lang, 2));

  return (
    <Panel title={<PanelTitle icon={<Icon.Droplet size={15} />} text={t.title} />}>
      <p className={styles.line}>{t.note(mult !== undefined ? num(mult, lang) : null, ruleText)}</p>

      {soul !== undefined && skill !== undefined && (
        <Section title={skillText?.name ?? t.skill}>
          {/* The skill's own tooltip is the item's description, already drawn under "What it does". */}
          <table className={page.table}>
            <tbody>
              <Row label={t.transform}>
                <Link to={{ href: wikiPath('monsters', skill.bossUnit) }}>{bossName}</Link>
              </Row>
              {skill.window > 0 && <Row label={t.window}>{t.windowValue(num(skill.window, lang))}</Row>}
              {skill.segments > 0 && <Row label={t.segments}>{t.segmentsValue(skill.segments)}</Row>}
              <Row label={t.aim}>
                {skill.aim === 'point'
                  ? t.aims.point(skill.pointRange ? num(skill.pointRange, lang) : '')
                  : skill.aim === 'direction'
                    ? t.aims.direction
                    : skill.aim === 'self'
                      ? t.aims.self
                      : skill.aim}
              </Row>
              {skill.cast > 0 && <Row label={t.cast}>{s(skill.cast)}</Row>}
              {soul.cooldown > 0 && (
                <Row label={t.cooldown}>
                  {t.cooldownValue(
                    num(soul.cooldown, lang),
                    soul.maxUpgrade > 0 ? num(soulCooldownAt(soul, soul.maxUpgrade), lang, 0) : null,
                    soul.maxUpgrade,
                  )}
                </Row>
              )}
            </tbody>
          </table>
          <p className={page.note}>
            {t.longNote(skill.window > 0 ? num(skill.window, lang) : null, bossName, num(soul.cdrPct, lang))}
          </p>
        </Section>
      )}
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row" className={styles.rowLabel}>
        {label}
      </th>
      <td>{children}</td>
    </tr>
  );
}

// --- what unlocks the craft ---------------------------------------------------------

export function UnlockPanel({ full }: WikiPanelProps) {
  const t = useWikiStrings(ITEMS).unlock;
  const data = useFiles<[CraftFile, ProgressionLocale]>(['craft.json', 'locale.{lang}.progression.json']);
  if (data === null || full === undefined) return null;
  const [craft, prog] = data;
  const unlock = craftUnlockOf(craft, full);
  const free = unlock.talents.length === 0 && unlock.recipes.length === 0 && full.needs.length > 0 && full.isRecipe !== true;
  if (unlock.talents.length === 0 && unlock.recipes.length === 0 && !free) return null;

  return (
    <Panel title={<PanelTitle icon={<Icon.Branch size={15} />} text={t.title} />}>
      {unlock.talents.map((talent) => {
        const node = prog.nodes[talent.node];
        const tree = prog.trees[talent.tree] ?? talent.tree;
        return (
          <div key={`${talent.tree}/${talent.node}`} className={styles.unlockRow}>
            <Link
              to={{ href: wikiPath('progression', talent.tree, talent.node) }}
              className={styles.talent}
              title={[node?.name ?? talent.node, node?.desc, t.talentTip].filter(Boolean).join('\n')}
            >
              <span className={styles.talentGlyph} aria-hidden>
                <Icon.Branch size={16} />
              </span>
              <span className={styles.talentText}>
                <span className={styles.talentName}>{node?.name ?? talent.node}</span>
                <span className={styles.sub}>
                  {talent.node} · {t.talent(tree)}
                </span>
              </span>
            </Link>
            {unlock.via !== undefined && (
              <>
                <span className={styles.arrow} aria-hidden>
                  →
                </span>
                <ItemRef id={unlock.via} size="sm" />
              </>
            )}
          </div>
        );
      })}
      {unlock.recipes.length > 0 && (
        <Section title={t.recipes}>
          <div className={styles.refs}>
            {unlock.recipes.map((id) => (
              <ItemRef key={id} id={id} size="sm" />
            ))}
          </div>
        </Section>
      )}
      {free && <p className={page.note}>{t.free}</p>}
    </Panel>
  );
}

// --- drops: monsters, first drop, containers ------------------------------------------

/** The partner's cap: a common material drops from hundreds of units, and the first sixty make the point. */
const DROP_CAP = 60;

const TYPE_TONE: Record<string, string | undefined> = {
  monster_elite: styles.elite,
  monster_miniboss: styles.miniboss,
  monster_boss: styles.boss,
  building: styles.building,
  destructible: styles.container,
};

export function DropsPanel({ item, full }: WikiPanelProps) {
  const { core, lang } = useApp();
  const tAll = useWikiStrings(ITEMS);
  const t = tAll.drops;
  const monsters = useFiles<[MonstersFile, MonstersLocale]>(['monsters.json', 'locale.{lang}.monsters.json']);
  const boxes = useFiles<[ItemsExtraFile, PoolsFile]>(['items-extra.json', 'pools.json']);
  const store = useItemDetailsStore();
  const fullTable = store?.full ?? null;

  const index = useMemo(() => {
    if (monsters === null) return null;
    // A recipe item: the table's own flag, or the catalogue's type.
    const isRecipe = (id: string) => fullTable?.[id]?.isRecipe === true || core?.byId.get(id)?.type === 'blueprint';
    return itemDropIndex(monsters[0], isRecipe);
  }, [monsters, fullTable, core]);
  const byId = useMemo(
    () => (monsters === null ? null : new Map<string, Monster>(monsters[0].monsters.map((m) => [m.id, m]))),
    [monsters],
  );
  const containers = useMemo(
    () => (boxes === null ? [] : containersOf(boxes[0], boxes[1], item.id)),
    [boxes, item.id],
  );

  if (index === null || byId === null || monsters === null) return null;
  const locale = monsters[1];
  const recipe = full?.isRecipe === true || item.type === 'blueprint';
  const rows = (recipe ? index.recipes : index.drops).get(item.id) ?? [];
  const first = index.first.get(item.id) ?? [];
  const noneAtAll = recipe && rows.length === 0 && first.length === 0;
  if (rows.length === 0 && first.length === 0 && containers.length === 0 && !noneAtAll) return null;

  const name = (id: string) => locale.names[id] ?? id;
  const typeLabel = (type: string) => locale.types[type] ?? tAll.monsterTypes[type] ?? type;
  const rooms = (m: Monster) =>
    m.locations.map((room) => core?.maps.byId.get(room)?.label ?? room).join(', ');

  return (
    <Panel
      title={
        <PanelTitle
          icon={<Icon.Crosshair size={15} />}
          text={rows.length > 0 ? t.title(rows.length) : t.titleBare}
        />
      }
    >
      {rows.length > 0 && (
        <>
          <ul className={styles.dropGrid}>
            {rows.slice(0, DROP_CAP).map((row) => (
              <DropCell key={row.monster} row={row} monster={byId.get(row.monster)} name={name} typeLabel={typeLabel} rooms={rooms} />
            ))}
          </ul>
          {rows.length > DROP_CAP && <p className={page.note}>{t.capped(DROP_CAP, rows.length)}</p>}
          <p className={page.note}>{recipe ? t.noteRecipe : t.note}</p>
        </>
      )}
      {noneAtAll && <p className={page.note}>{t.recipeNone}</p>}

      {first.length > 0 && (
        <Section title={t.firstTitle}>
          <p className={styles.line}>
            {t.firstLead}{' '}
            {first.map((row, n) => (
              <span key={row.monster}>
                {n > 0 && ', '}
                <Link to={{ href: wikiPath('monsters', row.monster) }} title={t.firstTip(name(row.monster))}>
                  {name(row.monster)}
                </Link>{' '}
                — {pct(row.chance, lang)}
              </span>
            ))}{' '}
            <span className={styles.dim}>{t.firstTail}</span>
          </p>
        </Section>
      )}

      {containers.length > 0 && (
        <Section title={tAll.containers.title(containers.length)}>
          <div className={styles.refs}>
            {containers.map((c) => (
              <span key={c.box} title={tAll.containers.tip(core?.byId.get(c.box)?.name ?? c.box, pct(c.chance, lang), c.pool)}>
                <ItemRef id={c.box} size="sm" href={wikiPath('consumables', c.box)} extra={pct(c.chance, lang)} />
              </span>
            ))}
          </div>
          <p className={page.note}>{tAll.containers.note}</p>
        </Section>
      )}
    </Panel>
  );
}

function DropCell({
  row,
  monster,
  name,
  typeLabel,
  rooms,
}: {
  row: ItemDropRow;
  monster: Monster | undefined;
  name: (id: string) => string;
  typeLabel: (type: string) => string;
  rooms: (m: Monster) => string;
}) {
  const { lang } = useApp();
  const t = useWikiStrings(ITEMS).drops;
  const type = monster?.type ?? '';
  const where = monster !== undefined ? rooms(monster) : '';
  const chance = pct(row.chance, lang);
  return (
    <li>
      <Link
        to={{ href: wikiPath('monsters', row.monster) }}
        className={cx(styles.dropCell, TYPE_TONE[type])}
        title={t.tip(name(row.monster), typeLabel(type), where, chance)}
      >
        <span className={styles.dropText}>
          <span className={styles.dropName}>{name(row.monster)}</span>
          <span className={styles.sub}>
            {typeLabel(type)}
            {where !== '' && ` · ${where}`}
          </span>
        </span>
        <span className={styles.dropChance}>{chance}</span>
      </Link>
    </li>
  );
}

// --- vendors, the Sky, paid sources ---------------------------------------------------

export function SourcesPanel({ item, full }: WikiPanelProps) {
  const { lang } = useApp();
  const tAll = useWikiStrings(ITEMS);
  const data = useFiles<[VendorsFile, PoolsFile, SourcesFile, SourcesLocale, SkyFile]>([
    'vendors.json',
    'pools.json',
    'sources.json',
    'locale.{lang}.sources.json',
    'sky.json',
  ]);

  const paid = useMemo(() => {
    if (data === null) return null;
    const [, pools, sources, locale] = data;
    return {
      mall: mallByItem(sources, (pack) => locale.packs[pack.id] ?? pack.id),
      gacha: gachaByItem(sources, pools),
    };
  }, [data]);

  if (data === null || paid === null || full === undefined) return null;
  const [vendors, pools, , sourcesLocale, sky] = data;

  const offers = vendorOffersOf(vendors, { id: item.id, type: full.type, cost: full.cost, quality: full.quality });
  // A fate stone's endless waves are drawn by its own panel, with the item it upgrades.
  const endless = full.type === 'stone' ? { bosses: [], merchants: [] } : endlessAppearances(full.sources);
  const chests = rewardChestTiers(pools, item.id);
  const mall = paid.mall[item.id] ?? [];
  const gacha = paid.gacha[item.id] ?? [];

  const hasSky = endless.bosses.length > 0 || endless.merchants.length > 0 || chests.length > 0;
  if (offers.length === 0 && !hasSky && mall.length === 0 && gacha.length === 0) return null;

  const t = tAll;
  const list = (xs: number[]) => joinList(lang, xs.map((x) => num(x, lang)));
  // A pool is drawn on a span of waves, not on one: wave 24 is the pool that
  // also covers 25–29, so a drop on 27 is that same list. The spans come from
  // the endless ladder, the item only knows the pool it sits in.
  const spans = (xs: EndlessStage[], byLevel: Map<number, EndlessSpan>) =>
    joinList(
      lang,
      xs.map((x) => {
        const span = byLevel.get(x.stage);
        return span ? endlessSpanLabel(span.from, span.to) : num(x.wave, lang);
      }),
    );
  const bossSpans = new Map(endlessBossSpans(sky).map((s) => [s.level, s]));
  const merchantSpans = new Map(endlessMerchantSpans(sky).map((s) => [s.level, s]));
  const skyParts: string[] = [];
  if (endless.bosses.length > 0) {
    skyParts.push(t.sky.bosses(list(endless.bosses.map((b) => b.stage)), spans(endless.bosses, bossSpans)));
  }
  if (endless.merchants.length > 0) {
    skyParts.push(t.sky.merchants(list(endless.merchants.map((b) => b.stage)), spans(endless.merchants, merchantSpans)));
  }

  // One pack can sell an item in several portions: one chip per pack.
  const packs = new Map<string, typeof mall>();
  for (const m of mall) packs.set(m.pack, [...(packs.get(m.pack) ?? []), m]);

  return (
    <Panel title={<PanelTitle icon={<Icon.Download size={15} />} text={t.sourcesTitle} />}>
      {offers.length > 0 && (
        <Section title={t.vendors.title}>
          <ul className={styles.offers}>
            {offers.map((offer) => (
              <Offer key={offer.vendor} offer={offer} />
            ))}
          </ul>
        </Section>
      )}

      {hasSky && (
        <Section title={t.sky.title}>
          {skyParts.length > 0 && (
            <p className={styles.line}>
              <Link to={{ href: wikiPath('sky', 'endless') }} title={t.sky.endlessTip}>
                {t.sky.endless}
              </Link>
              : {skyParts.join('; ')}.
            </p>
          )}
          {chests.length > 0 && (
            <p className={styles.line}>
              {t.sky.chestLead}{' '}
              {chests.map((c, n) => (
                <span key={c.tier}>
                  {n > 0 && ', '}
                  <Link to={{ href: wikiPath('sky', `tier${c.tier}`) }} title={t.sky.chestTip(c.tier)}>
                    {t.sky.chest(c.tier)}
                  </Link>{' '}
                  <span className={styles.dim}>
                    ({c.pool}, {pct(c.share, lang)})
                  </span>
                </span>
              ))}
            </p>
          )}
        </Section>
      )}

      {(gacha.length > 0 || packs.size > 0) && (
        <Section title={t.paid.title}>
          <div className={styles.tags}>
            {gacha.map((g) => {
              const chest = sourcesLocale.chests[g.chest] ?? g.chest;
              return (
                <Tag key={g.chest} tone="accent" title={t.paid.gachaTip(chest, g.pools.join(', '))}>
                  {t.paid.gacha(chest)}
                </Tag>
              );
            })}
            {[...packs].map(([pack, rows]) => (
              <Tag
                key={pack}
                tone="warn"
                title={`${pack}:\n${rows.map((r) => t.paid.mallLine(r.count, num(r.price, lang), r.packed)).join('\n')}`}
              >
                {t.paid.mall(pack)}
              </Tag>
            ))}
          </div>
          <p className={page.note}>{t.paid.note}</p>
        </Section>
      )}
    </Panel>
  );
}

function Offer({ offer }: { offer: VendorOffer }) {
  const { lang } = useApp();
  const t = useWikiStrings(ITEMS).vendors;
  const href =
    offer.vendor === 'guild' ? wikiPath('vendors', 'guild', 'exchange') : wikiPath('vendors', offer.vendor);
  const n = (v: number) => num(v, lang, 0);
  const price =
    offer.gold !== undefined
      ? t.gold(n(offer.gold.min), n(offer.gold.max))
      : offer.coins !== undefined
        ? t.coins(n(offer.coins.min), n(offer.coins.max))
        : offer.points !== undefined
          ? t.points(n(offer.points))
          : null;
  const notes: string[] = [];
  if (offer.shopLevel !== undefined) notes.push(t.shopLevel(offer.shopLevel));
  if (offer.unlockDrops !== undefined) notes.push(t.unlockDrops(offer.unlockDrops));
  if (offer.gold?.precious !== undefined) notes.push(t.precious(t.gold(n(offer.gold.min), n(offer.gold.precious))));
  if (offer.stock !== undefined) notes.push(t.stock(offer.stock));

  return (
    <li className={styles.offer}>
      <Link to={{ href }} className={styles.offerName} title={t.openTip}>
        {t.names[offer.vendor]}
      </Link>
      {price !== null && <span className={styles.offerPrice}>{price}</span>}
      {notes.length > 0 && <span className={styles.sub}>{notes.join(' · ')}</span>}
    </li>
  );
}

// --- the fate stone ---------------------------------------------------------------------

export function FacetPanel({ item, full, season }: WikiPanelProps) {
  const { core, lang } = useApp();
  const t = useWikiStrings(ITEMS).facet;
  const store = useItemDetailsStore();
  const all = useAllItems();
  const links = useMemo(() => (all === null ? null : stoneLinks(all)), [all]);
  const extra = useFiles<[ItemsExtraFile, SkyFile]>(['items-extra.json', 'sky.json']);
  const [compare, setCompare] = useState(false);

  if (links === null || full === undefined || store?.full == null) return null;
  const table = store.full;

  /** A record as the page's season sees it, so the comparison agrees with the stats above. */
  const view = (id: string | undefined): ItemFull | undefined => {
    if (id === undefined) return undefined;
    const base = table[id];
    if (base === undefined) return undefined;
    return season === 2 && extra !== null ? applySeasonalPatch(base, seasonalPatch(extra[0], id)) : base;
  };

  let mode: 'ancestral' | 'base' | 'stone';
  let stone: ItemFull | undefined;
  if (full.type === 'stone') {
    mode = 'stone';
    stone = full;
  } else if (links.fromStone.has(item.id)) {
    mode = 'ancestral';
    stone = view(links.fromStone.get(item.id));
  } else if (links.upgradedBy.has(item.id)) {
    mode = 'base';
    stone = view(links.upgradedBy.get(item.id));
  } else {
    return null;
  }
  if (stone === undefined) return null;

  // The pool a boss stage belongs to is drawn on a span of waves (see the sources panel).
  const bosses = endlessAppearances(stone.sources).bosses;
  const bossSpans = extra === null ? null : new Map(endlessBossSpans(extra[1]).map((s) => [s.level, s]));
  const waves = bosses.map((w) => {
    const span = bossSpans?.get(w.stage);
    return span ? endlessSpanLabel(span.from, span.to) : num(w.wave, lang);
  });
  const base = view(stone.upgradesFrom);
  const made = stone.produces;

  return (
    <Panel title={<PanelTitle icon={<Icon.Branch size={15} />} text={t.title} />}>
      {/* On a stone the Usage panel already names both ends; here only where it drops. */}
      {mode !== 'stone' && (
        <Section title={mode === 'ancestral' ? t.fromFacet : t.upgradedBy}>
          <div className={styles.unlockRow}>
            <ItemRef id={stone.id} size="sm" />
            {mode === 'ancestral' && base !== undefined && (
              <span className={styles.sub}>
                {t.improves} <ItemLinkInline id={base.id} />
              </span>
            )}
            {mode === 'base' && made !== undefined && (
              <>
                <span className={styles.arrow} aria-hidden>
                  →
                </span>
                <ItemRef id={made} size="sm" />
              </>
            )}
          </div>
        </Section>
      )}
      <p className={styles.line}>
        {waves.length > 0
          ? t.waves(joinList(lang, waves), joinList(lang, bosses.map((b) => num(b.stage, lang))))
          : t.noWaves}{' '}
        {waves.length > 0 && (
          <Link to={{ href: wikiPath('sky', 'endless') }} className={styles.dim}>
            ↗
          </Link>
        )}
      </p>
      <p className={page.note}>{t.mergeNote}</p>

      {mode === 'ancestral' && base !== undefined && (
        <Section title={t.compareTitle}>
          <Button size="sm" onClick={() => setCompare((on) => !on)} aria-pressed={compare}>
            {compare ? t.compareHide : t.compareShow(core?.byId.get(base.id)?.name ?? base.id)}
          </Button>
          {compare && <Compare ancestral={full} base={base} stone={stone} />}
        </Section>
      )}
    </Panel>
  );
}

function ItemLinkInline({ id }: { id: string }) {
  const { core } = useApp();
  return <Link to={{ href: itemPath(id) }}>{core?.byId.get(id)?.name ?? id}</Link>;
}

/**
 * The partner's comparison: the regular item, the fate stone, and the Ancestral
 * item as the game builds it — its own stats plus the stone's, each over its
 * own roll range — with the difference at the middle of the ranges.
 */
function Compare({ ancestral, base, stone }: { ancestral: ItemFull; base: ItemFull; stone: ItemFull }) {
  const { lang } = useApp();
  const t = useWikiStrings(ITEMS).facet;
  const store = useItemDetailsStore();
  const tables = store?.rolls ?? null;
  const detail = store?.detail ?? null;

  const range = (it: ItemFull, key: string): { min: number; max: number } | null => {
    const v = it.values[key];
    if (typeof v !== 'number') return null;
    return (tables !== null ? statSpan(tables, key, v) : null) ?? { min: v, max: v };
  };
  const text = (key: string, r: { min: number; max: number } | null) => (r === null ? '—' : formatSpan(key, r.min, r.max));
  const mid = (r: { min: number; max: number }) => (r.min + r.max) / 2;

  const keys = [...new Set([...Object.keys(base.values), ...Object.keys(stone.values), ...Object.keys(ancestral.values)])].filter(
    (key) => !isTuningKey(key),
  );

  return (
    <div className={styles.scroll}>
      <table className={cx(page.table, styles.compare)}>
        <thead>
          <tr>
            <th scope="col">{t.cols.stat}</th>
            <th scope="col">{t.cols.regular}</th>
            <th scope="col">{t.cols.facet}</th>
            <th scope="col">{t.cols.ancestral}</th>
            <th scope="col">{t.cols.diff}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const own = range(ancestral, key);
            const facet = range(stone, key);
            const regular = range(base, key);
            const sum =
              own === null && facet === null
                ? null
                : { min: (own?.min ?? 0) + (facet?.min ?? 0), max: (own?.max ?? 0) + (facet?.max ?? 0) };
            let delta = '—';
            if (regular !== null && sum !== null && mid(regular) !== 0) {
              const d = ((mid(sum) - mid(regular)) / Math.abs(mid(regular))) * 100;
              delta = `${d >= 0 ? '+' : ''}${num(Math.round(d), lang, 0)}%`;
            }
            // The regular item's text names more of the shared stats; the ancestor's covers the rest.
            const label = statLabel(key, detail?.[base.id]?.values?.[key] !== undefined ? detail[base.id] : detail?.[ancestral.id]);
            return (
              <tr key={key}>
                <th scope="row">
                  {label}
                  <span className={styles.key}>{key}</span>
                </th>
                <td className={page.num}>{text(key, regular)}</td>
                <td className={page.num}>{text(key, facet)}</td>
                <td className={cx(page.num, styles.strong)} title={facet !== null ? t.ownTip(text(key, own), text(key, facet)) : undefined}>
                  {text(key, sum)}
                </td>
                <td className={cx(page.num, styles.delta)}>{delta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={page.note}>{t.compareNote}</p>
    </div>
  );
}
