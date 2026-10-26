import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ItemSummary } from 'aow5-shared/data';
import {
  CURRENT_RULESET,
  PARTNER_ANCIENT_FIXED,
  PARTNER_ANCIENT_RULES,
  PARTNER_EXCHANGE,
  PARTNER_GUILD_LEVELS,
  PARTNER_GUILD_REWARDS,
  PARTNER_GUILD_RULES,
  PARTNER_GUILD_RUNE_TASKS,
  PARTNER_NPC,
  PARTNER_REGULAR_FIXED,
  PARTNER_REGULAR_PRICE,
  PARTNER_REGULAR_RULES,
  ancientPrice,
  exchangePoints,
  guildOrderRows,
  isConsumable,
  refreshSeconds,
  regularPoolAt,
  regularPrice,
  vendorAddress,
  vendorPageFacts,
  type GuildOrdersFile,
  type GuildTab,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type TalentEffect,
  type VendorRefresh,
  type VendorsFile,
  type VendorsLocale,
} from 'aow5-shared/wiki';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { wikiPath } from '@/router';
import { Input, Notice, Panel, cx } from '@/ui';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import { VENDORS, type VendorsStrings } from '../i18n/vendors';
import {
  Check,
  Chip,
  DataFooter,
  DataTable,
  DetailHeader,
  ItemRef,
  Note,
  Tag,
  WikiDetail,
  WikiError,
  WikiLoading,
  WikiMissing,
  WikiShell,
  WikiSubTabs,
  day,
  duration,
  num,
  pctOf,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './VendorsPage.module.css';

/**
 * The three in-town vendors: what each one can put on its shelf, at what
 * price, how often it restocks, and which talents change that.
 *
 * One page per merchant — `/wiki/vendors/regular`, `/ancient`, and the guild
 * merchant's two counters, `/guild/tasks` and `/guild/exchange` — so each can
 * be linked. The filters (search, quality, "hide blueprints", the shop and
 * order levels) are shared by every list on the page and kept when switching
 * merchants, as the original did; they are view state, not addresses.
 *
 * What the pak states — stock lists, refresh timers, exchange stock, the
 * talents — comes from `vendors.json`. What only the encrypted server code
 * knows — prices, fixed slots, order rules, the guild's order lists — is not
 * in the files, and every such figure carries a `*` that says so.
 */
export default function VendorsPage({ path }: SectionProps) {
  const t = useWikiStrings(VENDORS);
  const { core, lang } = useApp();
  const address = vendorAddress(path);

  const { data, error } = useWikiData<[VendorsFile, VendorsLocale, ItemsExtraFile, ItemsExtraLocale]>([
    'vendors.json',
    'locale.{lang}.vendors.json',
    'items-extra.json',
    'locale.{lang}.items-extra.json',
  ]);
  // The talent trees only name the tags at the bottom, so the page does not
  // wait for them.
  const progression = useWikiData<[ProgressionLite, ProgressionLocaleLite]>(['progression.json', 'locale.{lang}.progression.json']);

  const facts = data !== null && address !== undefined && path.length > 0 ? vendorPageFacts(data[0], data[1], address, lang) : null;
  useWikiPageMeta('vendors', path, facts, address === undefined);

  // Shared by every list on the page, across merchants.
  const [filters, setFilters] = useState<Filters>({ q: '', quality: null, noRecipes: false });
  const [shopLevel, setShopLevel] = useState(1);
  const [orderLevel, setOrderLevel] = useState<number | null>(null);

  // Precious is a subclass only the full item records carry.
  const store = useItemDetailsStore();
  useEffect(() => store?.request(), [store]);

  const ctx = useMemo<Ctx | null>(() => {
    if (data === null || core === null) return null;
    const [file, locale, extra, extraLocale] = data;
    const preciousFallback = new Set(file.regular.precious);
    return {
      t,
      lang,
      file,
      locale,
      extraLocale,
      item: (id) => core.byId.get(id),
      name: (id) => core.byId.get(id)?.name ?? id,
      precious: (id) => (store?.full?.[id]?.subclass ?? null) === 'precious' || preciousFallback.has(id),
      consumable: (id) => isConsumable(extra, id, core.byId.get(id)?.type),
      filters,
      setFilters,
      talents: progression.data === null ? null : talentIndex(progression.data[0], progression.data[1]),
      talentsFailed: progression.error !== null,
    };
  }, [data, core, t, lang, store?.full, filters, progression.data, progression.error]);

  const tabs = [
    { key: 'regular', label: t.tabs.regular, href: wikiPath('vendors', 'regular') },
    { key: 'ancient', label: t.tabs.ancient, href: wikiPath('vendors', 'ancient') },
    { key: 'guild', label: t.tabs.guild, href: wikiPath('vendors', 'guild') },
  ];

  return (
    <WikiShell columns="wide">
      <WikiDetail>
        <Notice tone="warn" title={t.wipTitle}>
          {t.wipBody}
        </Notice>
        <WikiSubTabs items={tabs} active={address?.vendor ?? ''} label={t.title} />
        {address === undefined ? (
          <WikiMissing />
        ) : error !== null ? (
          <WikiError message={error} />
        ) : ctx === null ? (
          <WikiLoading />
        ) : (
          <>
            {address.vendor === 'regular' && <Regular ctx={ctx} shopLevel={shopLevel} setShopLevel={setShopLevel} />}
            {address.vendor === 'ancient' && <Ancient ctx={ctx} />}
            {address.vendor === 'guild' && (
              <Guild ctx={ctx} tab={address.guild ?? 'tasks'} orderLevel={orderLevel} setOrderLevel={setOrderLevel} />
            )}
            <DataFooter ruleset={CURRENT_RULESET} built={day(ctx.file.generatedAt, lang)} />
          </>
        )}
      </WikiDetail>
    </WikiShell>
  );
}

// --- shared state -------------------------------------------------------------

interface Filters {
  q: string;
  quality: number | null;
  noRecipes: boolean;
}

/** Everything a merchant's panel reads, resolved once per render of the page. */
interface Ctx {
  t: VendorsStrings;
  lang: ReturnType<typeof useApp>['lang'];
  file: VendorsFile;
  locale: VendorsLocale;
  extraLocale: ItemsExtraLocale;
  item: (id: string) => ItemSummary | undefined;
  name: (id: string) => string;
  precious: (id: string) => boolean;
  consumable: (id: string) => boolean;
  filters: Filters;
  setFilters: (next: Filters) => void;
  /** Null until the talent trees arrive. */
  talents: TalentIndex | null;
  /** The talent trees could not be loaded: the tags show bare ids. */
  talentsFailed: boolean;
}

/** Order levels 1-4 take the rarity hues 2-5, so a level reads like a grade. */
const toneOf = (level: number) => `var(--q${Math.min(6, level + 1)})`;

/** The `*` on a figure the pak does not state: the game keeps it server-side. */
function Star() {
  const t = useWikiStrings(VENDORS);
  return (
    <abbr className={styles.star} title={t.serverMark}>
      *
    </abbr>
  );
}

// --- the item list: filter bar and cells --------------------------------------

interface Cell {
  key: string;
  id: string;
  /** Facts after the level and quality: `×20`, `in stock: 3`. */
  meta?: string[];
  tail?: { text: string; title?: string; coin?: boolean };
  /** Why this item is here, or when it shows up. */
  hint?: string;
  /** A tint, for the order level a row belongs to. */
  tone?: string;
}

function matches(ctx: Ctx, id: string): boolean {
  const { q, quality, noRecipes } = ctx.filters;
  const item = ctx.item(id);
  if (quality !== null && item?.quality !== quality) return false;
  if (noRecipes && item?.type === 'blueprint') return false;
  const needle = q.trim().toLowerCase();
  if (needle !== '' && !(item?.search ?? id.toLowerCase()).includes(needle)) return false;
  return true;
}

/** Search, quality and "hide blueprints" — over every list of items. */
function FilterBar({ ctx, ids }: { ctx: Ctx; ids: readonly string[] }) {
  const { t, filters, setFilters } = ctx;
  const common = useWikiStrings(COMMON);
  const recipes = useMemo(() => ids.filter((id) => ctx.item(id)?.type === 'blueprint').length, [ids, ctx]);
  return (
    <div className={styles.filters}>
      <Input
        className={styles.search}
        type="search"
        value={filters.q}
        placeholder={t.searchPlaceholder}
        aria-label={t.searchPlaceholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setFilters({ ...filters, q: event.target.value })}
      />
      <div className={styles.chips} role="group" aria-label={t.qualityLabel}>
        <Chip on={filters.quality === null} onClick={() => setFilters({ ...filters, quality: null })} title={t.qualityAny}>
          {common.all}
        </Chip>
        {[1, 2, 3, 4, 5, 6].map((q) => (
          <Chip
            key={q}
            on={filters.quality === q}
            color={`var(--q${q})`}
            onClick={() => setFilters({ ...filters, quality: q })}
            title={t.qualityTitle(q, ctx.extraLocale.qualities[String(q)] ?? '')}
          >
            {q}
          </Chip>
        ))}
      </div>
      <Check checked={filters.noRecipes} onChange={(next) => setFilters({ ...filters, noRecipes: next })} title={t.hideRecipesTitle}>
        {t.hideRecipes(recipes)}
      </Check>
    </div>
  );
}

/** The whole list at once, as the original drew it — the longest is under 300. */
function CellGrid({ ctx, cells }: { ctx: Ctx; cells: readonly Cell[] }) {
  if (cells.length === 0) return <p className={styles.nothing}>{ctx.t.nothing}</p>;
  return (
    <div className={styles.grid}>
      {cells.map((cell) => (
        <ItemCell key={cell.key} ctx={ctx} cell={cell} />
      ))}
    </div>
  );
}

function ItemCell({ ctx, cell }: { ctx: Ctx; cell: Cell }) {
  const { t, lang } = ctx;
  const common = useWikiStrings(COMMON);
  const item = ctx.item(cell.id);
  const bits: string[] = [];
  if (item !== undefined) bits.push(common.levelShort(item.level), t.qualityShort(item.quality));
  if (ctx.precious(cell.id)) bits.push(t.precious);
  if (cell.meta !== undefined) bits.push(...cell.meta);

  const title = [
    `${ctx.name(cell.id)} (${cell.id})`,
    item !== undefined && item.cost > 0 ? t.itemCost(num(item.cost, lang)) : null,
    cell.hint ?? null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return (
    <div
      className={cx(styles.cell, cell.tone !== undefined && styles.toned)}
      style={cell.tone === undefined ? undefined : ({ '--tone': cell.tone } as CSSProperties)}
      title={title}
    >
      <ItemRef
        id={cell.id}
        href={ctx.consumable(cell.id) ? wikiPath('consumables', cell.id) : undefined}
        extra={bits.join(' · ')}
      />
      {cell.tail !== undefined && (
        <span className={cx(styles.tail, cell.tail.coin === true && styles.coin)} title={cell.tail.title}>
          {cell.tail.text}
        </span>
      )}
    </div>
  );
}

/** A list with its heading, its filter bar and its cells. */
function ItemList({
  ctx,
  title,
  ids,
  cell,
  before,
}: {
  ctx: Ctx;
  title: (count: number) => ReactNode;
  /** Every row before the filters — what the blueprint count is of. `key` must be unique. */
  ids: readonly { key: string; id: string }[];
  cell: (row: { key: string; id: string }) => Cell;
  before?: ReactNode;
}) {
  const shown = useMemo(() => ids.filter((row) => matches(ctx, row.id)), [ids, ctx]);
  const plain = useMemo(() => ids.map((row) => row.id), [ids]);
  return (
    <Panel title={title(shown.length)}>
      <div className={styles.body}>
        {before}
        <FilterBar ctx={ctx} ids={plain} />
        <CellGrid ctx={ctx} cells={shown.map(cell)} />
      </div>
    </Panel>
  );
}

// --- headers ------------------------------------------------------------------

function RefreshTag({ ctx, refresh }: { ctx: Ctx; refresh: VendorRefresh }) {
  const { t, lang } = ctx;
  const units = useWikiStrings(COMMON).units;
  const base = duration(refreshSeconds(refresh, 0), lang, units);
  const fastest = duration(refreshSeconds(refresh, refresh.maxReductionPct), lang, units);
  return <Tag title={t.refreshTitle(base, fastest)}>{t.refreshTag(base, refresh.maxReductionPct)}</Tag>;
}

// --- regular merchant -----------------------------------------------------------

function Regular({ ctx, shopLevel, setShopLevel }: { ctx: Ctx; shopLevel: number; setShopLevel: (level: number) => void }) {
  const { t, file, locale, lang } = ctx;
  const R = file.regular;
  const gold = locale.currencies.gold ?? t.goldUnit;
  const levels = useMemo(() => Object.keys(R.byLevel).map(Number).sort((a, b) => a - b), [R]);
  const total = useMemo(() => regularPoolAt(R, Math.max(...levels)).length, [R, levels]);
  const eligible = useMemo(() => regularPoolAt(R, shopLevel).map((id) => ({ key: id, id })), [R, shopLevel]);
  const fmtMul = (value: number) => num(value, lang, 1);

  return (
    <>
      <DetailHeader
        title={locale.vendors.regular ?? t.tabs.regular}
        code={t.code(PARTNER_NPC.regular, gold)}
        tags={
          <>
            <RefreshTag ctx={ctx} refresh={R.refresh} />
            <Tag title={t.clientDefault}>{t.manualRefresh(ctx.name(R.refresh.manualItem), R.refresh.manualLimit)}</Tag>
            <Tag title={t.serverMark}>
              {t.formulaSlots(PARTNER_REGULAR_RULES.formulaSlots)}
              <Star />
            </Tag>
          </>
        }
      />
      <Note>{t.regularRule}</Note>

      <Panel
        title={
          <>
            {t.fixedTitle(PARTNER_REGULAR_FIXED.length)}
            <Star />
          </>
        }
      >
        <CellGrid
          ctx={ctx}
          cells={PARTNER_REGULAR_FIXED.map(([id, count]) => ({
            key: id,
            id,
            tail: { text: `×${count}`, title: t.fixedTail },
            hint: t.fixedTail,
          }))}
        />
      </Panel>

      <Panel title={t.shopLevel}>
        <div className={styles.body}>
          <div className={styles.chips}>
            {levels.map((level) => {
              const count = regularPoolAt(R, level).length;
              return (
                <Chip key={level} on={shopLevel === level} onClick={() => setShopLevel(level)} title={t.shopLevelTitle(level, count)}>
                  {level}
                  <span className={styles.chipCount}>{num(count, lang)}</span>
                </Chip>
              );
            })}
          </div>
          <Note>
            {t.regularPoolNote(shopLevel, eligible.length, total, fmtMul(PARTNER_REGULAR_PRICE.minMul), fmtMul(PARTNER_REGULAR_PRICE.maxMul), true)}{' '}
            {t.chanceNote(PARTNER_REGULAR_RULES.formulaSlots)}
            <Star />
          </Note>
        </div>
      </Panel>

      <ItemList
        ctx={ctx}
        title={t.stockTitle}
        ids={eligible}
        cell={({ key, id }) => {
          const item = ctx.item(id);
          const precious = ctx.precious(id);
          const price = item === undefined || item.cost <= 0 ? null : regularPrice(item.cost, precious);
          return {
            key,
            id,
            tail:
              price === null
                ? undefined
                : {
                    text: `${num(price.min, lang)}–${num(price.max, lang)} ${t.goldUnit}`,
                    title: [t.priceTitle, price.precious === undefined ? null : t.preciousTitle(num(price.precious, lang))]
                      .filter(Boolean)
                      .join('\n'),
                  },
            hint: item?.type === 'equip' ? t.equipHint : t.unlockHint,
          };
        }}
      />

      <Note>{t.countRule}</Note>
      <Talents ctx={ctx} talents={R.talents} />
    </>
  );
}

// --- ancient merchant -----------------------------------------------------------

function Ancient({ ctx }: { ctx: Ctx }) {
  const { t, file, locale, lang } = ctx;
  const A = file.ancient;
  const coins = locale.currencies.ancientCoins ?? ctx.name(A.currencyItem);
  const formula = `min(${PARTNER_ANCIENT_RULES.slotsCap}, ${PARTNER_ANCIENT_RULES.slotsBase} + ancient_shop_count)`;
  const pool = useMemo(() => A.accepts.map((id) => ({ key: id, id })), [A]);
  const fmtMul = (value: number) => num(value, lang, 1);

  return (
    <>
      <DetailHeader
        title={locale.vendors.ancient ?? t.tabs.ancient}
        code={t.code(PARTNER_NPC.ancient, `${coins} (${A.currencyItem})`)}
        tags={
          <>
            <RefreshTag ctx={ctx} refresh={A.refresh} />
            <Tag title={t.clientDefault}>{t.manualRefresh(ctx.name(A.refresh.manualItem), A.refresh.manualLimit)}</Tag>
            <Tag title={t.serverMark}>
              {t.totalSlots(formula)}
              <Star />
            </Tag>
          </>
        }
      />
      <Note>{t.ancientRule}</Note>

      <Panel
        title={
          <>
            {t.fixedTitle(PARTNER_ANCIENT_FIXED.length)}
            <Star />
          </>
        }
      >
        <CellGrid
          ctx={ctx}
          cells={PARTNER_ANCIENT_FIXED.map((slot) => {
            const tailTitle =
              slot.gold === true
                ? t.forGoldTitle(fmtMul(PARTNER_REGULAR_PRICE.minMul), fmtMul(PARTNER_REGULAR_PRICE.maxMul))
                : t.coinsTitle(num(slot.price, lang));
            return {
              key: slot.id,
              id: slot.id,
              meta: [`×${num(slot.count, lang)}`, t.needsLevel(slot.requiredLevel)],
              tail: { text: slot.gold === true ? t.forGold : t.coins(num(slot.price, lang)), title: tailTitle, coin: slot.gold !== true },
              hint: tailTitle,
            };
          })}
        />
      </Panel>
      <Note>
        {t.priceRank}
        <Star />
      </Note>

      <ItemList
        ctx={ctx}
        title={t.stockTitle}
        ids={pool}
        before={
          <Note>
            {t.ancientPoolNote(formula)}
            <Star />
          </Note>
        }
        cell={({ key, id }) => {
          const item = ctx.item(id);
          const price = item === undefined || item.cost <= 0 ? null : ancientPrice(item.cost);
          return {
            key,
            id,
            tail:
              price === null
                ? undefined
                : { text: t.coins(`${num(price.coinMin, lang)}–${num(price.coinMax, lang)}`), title: t.coinRangeTitle, coin: true },
            hint: t.ancientHint,
          };
        }}
      />
      <Note>
        {t.sellBack}
        <Star />
      </Note>
      <Talents ctx={ctx} talents={A.talents} />
    </>
  );
}

// --- guild merchant -------------------------------------------------------------

function Guild({
  ctx,
  tab,
  orderLevel,
  setOrderLevel,
}: {
  ctx: Ctx;
  tab: GuildTab;
  orderLevel: number | null;
  setOrderLevel: (level: number | null) => void;
}) {
  const { t, file, locale } = ctx;
  const charter = ctx.name(file.guild.tasks.refresh.item);
  return (
    <>
      <DetailHeader
        title={locale.vendors.guild ?? t.tabs.guild}
        code={`${PARTNER_NPC.guild} · ${t.guildCurrency}`}
        tags={
          <>
            <Tag title={t.serverMark}>
              {t.orderRefresh(charter, PARTNER_GUILD_RULES.manualCost)}
              <Star />
            </Tag>
            <Tag title={t.serverMark}>
              {t.taskReset(PARTNER_GUILD_RULES.taskResetCost)}
              <Star />
            </Tag>
            <Tag title={t.serverMark}>
              {t.refreshLimit(PARTNER_GUILD_RULES.manualLimit)}
              <Star />
            </Tag>
          </>
        }
      />
      <Note>{t.guildRule}</Note>
      <WikiSubTabs
        items={[
          { key: 'tasks', label: t.guildTabs.tasks, href: wikiPath('vendors', 'guild', 'tasks') },
          { key: 'exchange', label: t.guildTabs.exchange, href: wikiPath('vendors', 'guild', 'exchange') },
        ]}
        active={tab}
        label={t.tabs.guild}
      />
      {tab === 'tasks' ? <GuildTasks ctx={ctx} orderLevel={orderLevel} setOrderLevel={setOrderLevel} /> : <GuildExchange ctx={ctx} />}
      <Talents ctx={ctx} talents={file.guild.talents} />
    </>
  );
}

/** The partner's order lists, a chunk of their own, fetched when the orders tab opens. */
const ORDER_FILES = import.meta.glob<{ default: GuildOrdersFile }>('../../../../../packages/aow5-shared/content/guild-orders.json');

function useGuildOrders(): { data: GuildOrdersFile | null; error: string | null } {
  const [state, setState] = useState<{ data: GuildOrdersFile | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    const load = Object.values(ORDER_FILES)[0];
    if (load === undefined) {
      setState({ data: null, error: 'guild-orders.json is missing' });
      return;
    }
    load().then(
      (mod) => live && setState({ data: mod.default, error: null }),
      (error: unknown) => live && setState({ data: null, error: String(error) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function GuildTasks({ ctx, orderLevel, setOrderLevel }: { ctx: Ctx; orderLevel: number | null; setOrderLevel: (level: number | null) => void }) {
  const { t, file, locale, lang } = ctx;
  const T = file.guild.tasks;
  const orders = useGuildOrders();
  const levelName = (level: number) => locale.orderLevels[String(level)] ?? t.levelName(level);

  const rows = useMemo(
    () =>
      orders.data === null
        ? []
        : guildOrderRows(orders.data, orderLevel ?? undefined).map((row) => ({ ...row, key: `${row.level}:${row.id}` })),
    [orders.data, orderLevel],
  );
  const byKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);

  return (
    <>
      <div className={styles.tags}>
        <Tag>{t.slotsTag(T.slotStart, T.slotMax)}</Tag>
        <Tag>{t.dailyTag(T.dailyLimit)}</Tag>
        <Tag>{t.targetTag(T.targetCount, T.rewardPoints)}</Tag>
      </div>

      <Panel
        title={
          <>
            {t.rewardsTitle}
            <Star />
          </>
        }
      >
        <DataTable
          head={[t.rewardsHead.level, t.rewardsHead.value, t.rewardsHead.slots, t.rewardsHead.points, t.rewardsHead.chest]}
          numeric={[1, 2, 3]}
          rows={PARTNER_GUILD_REWARDS.map((reward) => {
            const level = PARTNER_GUILD_LEVELS.find((l) => l.level === reward.level);
            return [
              <span className={styles.level} style={{ '--tone': toneOf(reward.level) } as CSSProperties}>
                {levelName(reward.level)}
              </span>,
              level === undefined ? '—' : `${num(level.valueMin, lang)}–${num(level.valueMax, lang)}`,
              level?.slots ?? '—',
              `${reward.pointsMin}–${reward.pointsMax}`,
              <ItemRef id={reward.chest} size="sm" count={1} />,
            ];
          })}
        />
      </Panel>

      <Panel
        title={
          <>
            {t.runesTitle}
            <Star />
          </>
        }
      >
        <DataTable
          head={[t.difficultyHead, t.runeNeed, t.runeChance, t.runeReward]}
          numeric={[2]}
          rows={PARTNER_GUILD_RUNE_TASKS.map((task) => [
            t.difficulty(task.difficulty),
            <ItemRef id={task.itemId} size="sm" count={`${task.needMin}–${task.needMax}`} />,
            pctOf(task.chancePct, lang, 0),
            <span className={styles.refs}>
              {task.rewards.map((id) => (
                <ItemRef key={id} id={id} size="sm" href={ctx.consumable(id) ? wikiPath('consumables', id) : undefined} />
              ))}
            </span>,
          ])}
        />
      </Panel>

      {orders.error !== null ? (
        <WikiError message={orders.error} />
      ) : orders.data === null ? (
        <WikiLoading />
      ) : (
        <ItemList
          ctx={ctx}
          title={() => (
            <>
              {t.acceptsTitle}
              <Star />
            </>
          )}
          ids={rows}
          before={
            <>
              <div className={styles.chips}>
                <Chip on={orderLevel === null} onClick={() => setOrderLevel(null)}>
                  {t.orderAll}
                </Chip>
                {[1, 2, 3, 4].map((level) => (
                  <Chip key={level} on={orderLevel === level} color={toneOf(level)} onClick={() => setOrderLevel(level)}>
                    {levelName(level)}
                  </Chip>
                ))}
              </div>
              <Note>{t.ordersNote}</Note>
            </>
          }
          cell={({ key, id }) => {
            const row = byKey.get(key);
            const level = row?.level ?? 1;
            const name = levelName(level);
            const min = row?.needMin ?? 0;
            const max = row?.needMax ?? 0;
            return {
              key,
              id,
              tail: { text: min === max ? `×${min}` : `×${min}–${max}`, title: t.needTitle(min, max, name) },
              hint: t.orderLevelTitle(name),
              tone: toneOf(level),
            };
          }}
        />
      )}
    </>
  );
}

function GuildExchange({ ctx }: { ctx: Ctx }) {
  const { t, file, lang } = ctx;
  const E = PARTNER_EXCHANGE;
  const offers = file.guild.exchange.offers;
  const stock = useMemo(() => new Map(offers), [offers]);
  const ids = useMemo(() => offers.map(([id]) => ({ key: id, id })), [offers]);
  const refreshes = file.guild.exchange.refresh.dailyLimit;
  const manual = Object.entries(E.manual)
    .map(([id, price]) => t.manualNote(ctx.name(id), price))
    .join('; ');

  return (
    <>
      <div className={styles.tags}>
        <Tag title={t.serverMark}>
          {t.dailyExchanges(E.dailyBase, E.dailyMax, E.perSlot)}
          <Star />
        </Tag>
        <Tag title={t.clientDefault}>{t.refreshes(refreshes)}</Tag>
      </div>
      <Note>
        {t.exchangeRule(E.divisor, E.baseCost, E.qualityFloor, E.priceCap, E.dailyBase, E.dailyMax, E.perSlot, refreshes)}
        <Star />
      </Note>

      <ItemList
        ctx={ctx}
        title={t.offersTitle}
        ids={ids}
        before={<Note>{t.offersNote(offers.length, E.priceCap, manual === '' ? null : manual)}</Note>}
        cell={({ key, id }) => {
          const item = ctx.item(id);
          const cost = item?.cost ?? 0;
          const quality = item?.quality ?? 0;
          const isManual = E.manual[id] !== undefined;
          return {
            key,
            id,
            meta: [t.inStock(stock.get(id) ?? 0)],
            tail: {
              text: `${num(exchangePoints(id, cost, quality), lang)} ${t.pointsUnit}`,
              title:
                t.formulaTitle(num(cost, lang), E.divisor, E.baseCost, quality, E.qualityFloor) +
                (isManual ? `\n${t.manualTitle}` : ''),
            },
          };
        }}
      />
    </>
  );
}

// --- talents ----------------------------------------------------------------------

/** The two fields of `progression.json` this page reads; the full type is the progression section's. */
interface ProgressionLite {
  trees: Record<string, { id: string; nodes: { id: string }[] }>;
}
interface ProgressionLocaleLite {
  trees: Record<string, string>;
  nodes: Record<string, { name: string }>;
}
interface TalentIndex {
  /** Node id → its tree id, the node's name and the tree's. */
  get(node: string): { tree: string; name: string; treeName: string } | undefined;
}

function talentIndex(file: ProgressionLite, locale: ProgressionLocaleLite): TalentIndex {
  const map = new Map<string, { tree: string; name: string; treeName: string }>();
  for (const tree of Object.values(file.trees)) {
    for (const node of tree.nodes) {
      map.set(node.id, { tree: tree.id, name: locale.nodes[node.id]?.name ?? node.id, treeName: locale.trees[tree.id] ?? tree.id });
    }
  }
  return map;
}

/**
 * "What progression gives": one tag per talent node that touches this
 * merchant, linking to the node in its tree, with what it changes in the
 * tooltip.
 */
function Talents({ ctx, talents }: { ctx: Ctx; talents: readonly TalentEffect[] }) {
  const { t } = ctx;
  const nodes = useMemo(() => {
    const out = new Map<string, TalentEffect[]>();
    for (const effect of talents) {
      const list = out.get(effect[0]) ?? [];
      list.push(effect);
      out.set(effect[0], list);
    }
    return [...out.entries()];
  }, [talents]);
  if (nodes.length === 0) return null;

  return (
    <Panel title={t.talentsTitle}>
      <div className={styles.body}>
        <div className={styles.tags}>
          {nodes.map(([id, effects]) => {
            const ref = ctx.talents?.get(id);
            const lines = effects.map(([, key, value]) => t.effects[key]?.(value) ?? `${key} ${value}`);
            if (ref === undefined) {
              return (
                <Tag key={id} title={lines.join('\n')}>
                  {t.talentTag(id)}
                </Tag>
              );
            }
            return (
              <Tag
                key={id}
                tone="accent"
                href={wikiPath('progression', ref.tree, id)}
                title={[t.talentTitle(ref.name, id, ref.treeName), ...lines, '', t.talentOpen].join('\n')}
              >
                {t.talentTag(ref.name)}
              </Tag>
            );
          })}
        </div>
        {ctx.talentsFailed && <p className={styles.snapshot}>{t.talentUnknown}</p>}
      </div>
    </Panel>
  );
}
