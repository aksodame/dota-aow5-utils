import { useEffect, useMemo, useState } from 'react';
import type { ItemSummary } from 'aow5-shared/data';
import {
  CURRENT_RULESET,
  CRAFT_GROUPS,
  CRAFT_LIST_CAP,
  craftEconomy,
  craftGroupOf,
  craftInSeason,
  craftItemOf,
  craftPageFacts,
  craftPricing,
  craftTree,
  dropSourceIndex,
  seasonalPatch,
  isCraftable,
  isFreeCraft,
  type CraftFile,
  type CraftGroup,
  type CraftItem,
  type ItemsExtraFile,
  type ItemsExtraLocale,
  type LocationsFile,
  type MonstersFile,
  type ProgressionFile,
  type ProgressionLocale,
} from 'aow5-shared/wiki';
import { ESSENCE_IDS } from 'aow5-shared/types';
import { Input, Panel } from '@/ui';
import { BASE } from '@/lib/routes';
import { wikiPath } from '@/router';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { ItemTile } from '@/components/Tile';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import { CRAFT } from '../i18n/craft';
import {
  AuctionField,
  Check,
  Chip,
  DataFooter,
  DetailHeader,
  FilterGroup,
  Tag,
  WikiDetail,
  WikiEmpty,
  WikiError,
  WikiList,
  WikiLoading,
  WikiMissing,
  WikiRow,
  WikiShell,
  WikiSidebar,
  collate,
  num,
  useAuctionPrices,
  useWikiData,
  useWikiPageMeta,
  RowTile,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import { CraftSummary } from './craft/CraftSummary';
import { CraftTreeView } from './craft/CraftTreeView';
import { itemHref, type CraftContext } from './craft/model';
import styles from './craft/Craft.module.css';

/**
 * Crafting: a planner for making one item.
 *
 * The list of everything craftable on the left; for the chosen item, its
 * composition tree with an exchange price on every node, and beside it what
 * the craft costs against buying it, the materials summed over the tree with
 * where each drops, what selling or dismantling it fetches, and where to farm.
 *
 * `/wiki/craft/<itemId>` names the item. Only an item the game will actually
 * craft — one with a `Needs` list, not merely a recipe or a talent — has a
 * page. Every number is the current season's: the season's patch is laid over the item table
 * before anything reads it, and dismantle yields are the server's own rule
 * (`ItemFull.dismantle`), which differs from the partner wiki's for about a
 * hundred items.
 */

const ESSENCE_KEY = 'aow5.wiki.craft.essence';
const ESSENCE_DEFAULT = 8000;

function readEssence(): number {
  try {
    const raw = window.localStorage.getItem(ESSENCE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : ESSENCE_DEFAULT;
  } catch {
    return ESSENCE_DEFAULT;
  }
}

function writeEssence(value: number): void {
  try {
    window.localStorage.setItem(ESSENCE_KEY, String(value));
  } catch {
    // Not persisted; still used for this visit.
  }
}

interface Row {
  id: string;
  item: CraftItem;
  summary: ItemSummary;
  group: CraftGroup | undefined;
  unlock: 'talent' | 'recipe' | 'free';
}

export default function CraftPage({ path }: SectionProps) {
  const { lang, core } = useApp();
  const t = useWikiStrings(CRAFT);
  const common = useWikiStrings(COMMON);
  const store = useItemDetailsStore();

  useEffect(() => {
    store?.request();
  }, [store]);

  const { data, error } = useWikiData<[CraftFile, ItemsExtraFile, ItemsExtraLocale, ProgressionLocale]>([
    'craft.json',
    'items-extra.json',
    'locale.{lang}.items-extra.json',
    'locale.{lang}.progression.json',
  ]);
  // The heavy tables only the side panels need, fetched alongside rather than
  // ahead of the list: the talent icons, and the monsters for "where it drops".
  const { data: progression } = useWikiData<[ProgressionFile]>(['progression.json']);
  const { data: farmData } = useWikiData<[MonstersFile, LocationsFile]>(['monsters.json', 'locations.json']);

  const full = store?.full ?? null;
  const prices = useAuctionPrices();

  const [q, setQ] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const [group, setGroup] = useState<CraftGroup | null>(null);
  const [profSell, setProfSell] = useState(false);
  const [profDis, setProfDis] = useState(false);
  const [matDepth, setMatDepth] = useState(false);
  const [ignoreLevel, setIgnoreLevel] = useState(false);
  const [essence, setEssence] = useState(readEssence);

  const changeEssence = (value: number) => {
    setEssence(value);
    writeEssence(value);
  };

  // Every item as the wiki season sees it.
  const view = useMemo(() => {
    if (full === null || data === null) return null;
    const extra = data[1];
    const map = new Map<string, CraftItem>();
    for (const item of Object.values(full)) map.set(item.id, craftItemOf(item, seasonalPatch(extra, item.id)));
    return map;
  }, [full, data]);

  const lookup = useMemo(() => (view === null ? null : (id: string) => view.get(id)), [view]);

  const rows = useMemo<Row[] | null>(() => {
    if (data === null || view === null || core === null) return null;
    const out: Row[] = [];
    for (const [id, entry] of Object.entries(data[0].items)) {
      const item = view.get(id);
      const summary = core.byId.get(id);
      // Only what the game crafts (it checks `Needs`), and only what is in the game.
      if (!isCraftable(item) || summary === undefined) continue;
      const unlock = craftInSeason(entry);
      out.push({
        id,
        item,
        summary,
        group: craftGroupOf(item.type),
        unlock: (unlock.talents?.length ?? 0) > 0 ? 'talent' : isFreeCraft(entry) ? 'free' : 'recipe',
      });
    }
    const byName = collate(lang);
    return out.sort((a, b) => a.item.level - b.item.level || byName(a.summary.name, b.summary.name));
  }, [data, view, core, lang]);

  const essencePrice = useMemo(() => {
    return (id: string) => (id === ESSENCE_IDS.LEGENDARY ? essence : (view?.get(id)?.cost ?? 0));
  }, [essence, view]);

  const economies = useMemo(() => {
    const out = new Map<string, ReturnType<typeof craftEconomy>>();
    if (rows === null || lookup === null) return out;
    for (const row of rows) out.set(row.id, craftEconomy(row.item, lookup, essencePrice));
    return out;
  }, [rows, lookup, essencePrice]);

  const levels = useMemo(() => [...new Set((rows ?? []).map((r) => r.item.level))].sort((a, b) => a - b), [rows]);

  const filtered = useMemo(() => {
    if (rows === null) return [];
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (level !== null && row.item.level !== level) return false;
      if (group !== null && row.group !== group) return false;
      if (needle !== '' && !row.summary.search.includes(needle)) return false;
      const eco = economies.get(row.id);
      if (profSell && eco?.profSell !== true) return false;
      if (profDis && eco?.profDis !== true) return false;
      return true;
    });
  }, [rows, q, level, group, profSell, profDis, economies]);

  const byRow = useMemo(() => new Map((rows ?? []).map((row) => [row.id, row])), [rows]);

  const pathId = path[0];
  const fromPath = pathId === undefined ? undefined : byRow.get(pathId);
  const missing = rows !== null && (path.length > 1 || (pathId !== undefined && fromPath === undefined));
  // The card shows the chosen item whatever the filters say — a node of the
  // tree can lead to a component the current search hides. With nothing
  // chosen, the first row of the list, as the partner wiki did.
  const selected = pathId === undefined ? filtered[0] : fromPath;

  const pricing = useMemo(() => (lookup === null ? null : craftPricing(lookup, (id) => prices[id] ?? null)), [lookup, prices]);
  // The page's sentence is the server's: game prices only.
  const basePricing = useMemo(() => (lookup === null ? null : craftPricing(lookup, () => null)), [lookup]);

  const talent = useMemo(() => {
    if (selected === undefined || data === null) return null;
    const node = craftInSeason(data[0].items[selected.id] ?? {}).talents?.[0];
    if (node === undefined) return null;
    const locale = data[3];
    const icon = progression?.[0].trees[node.tree]?.nodes.find((n) => n.id === node.node)?.icon;
    return {
      ...node,
      name: locale.nodes[node.node]?.name ?? node.node,
      treeName: locale.trees[node.tree] ?? node.tree,
      icon: icon === undefined ? undefined : `${BASE}icons/talents/${icon}`,
    };
  }, [selected, data, progression]);

  const recipeId = selected === undefined || data === null ? undefined : craftInSeason(data[0].items[selected.id] ?? {}).recipes?.[0];

  const facts = useMemo(() => {
    if (fromPath === undefined || data === null || basePricing === null) return null;
    const recipeName = recipeId === undefined ? undefined : (core?.byId.get(recipeId)?.name ?? recipeId);
    return craftPageFacts(
      {
        name: fromPath.summary.name,
        level: fromPath.item.level,
        qualityName: data[2].qualities[String(fromPath.item.quality)],
        components: fromPath.item.needs.length,
        craftCost: basePricing.craftOf(fromPath.id).value,
        unlock:
          talent !== null ? { kind: 'talent', name: talent.name } : recipeName !== undefined ? { kind: 'recipe', name: recipeName } : null,
      },
      lang,
    );
  }, [fromPath, data, basePricing, recipeId, talent, core, lang]);
  useWikiPageMeta('craft', path, facts, missing);

  const tree = useMemo(
    () => (selected === undefined || lookup === null ? null : craftTree(selected.item, lookup, matDepth)),
    [selected, lookup, matDepth],
  );

  const drops = useMemo(() => {
    if (farmData === null) return null;
    const [monsters, locations] = farmData;
    return dropSourceIndex(
      monsters.monsters,
      locations,
      monsters.difficulties.find((d) => d.key === 'hard'),
    );
  }, [farmData]);

  if (error !== null) {
    return (
      <WikiShell columns="single">
        <WikiError message={error} />
      </WikiShell>
    );
  }
  if (rows === null || data === null || lookup === null || pricing === null || core === null) {
    return (
      <WikiShell columns="single">
        {store?.error ? <WikiError message={store.error} /> : <WikiLoading />}
      </WikiShell>
    );
  }

  const [, extra, extraLocale] = data;
  const ctx: CraftContext = { lang, t, lookup, pricing, prices, byId: core.byId, extra, goldUnit: common.gold };

  const reset = () => {
    setQ('');
    setLevel(null);
    setGroup(null);
    setProfSell(false);
    setProfDis(false);
    setMatDepth(false);
    setIgnoreLevel(false);
    changeEssence(ESSENCE_DEFAULT);
  };
  const pristine =
    q === '' && level === null && group === null && !profSell && !profDis && !matDepth && !ignoreLevel && essence === ESSENCE_DEFAULT;

  const shown = filtered.slice(0, CRAFT_LIST_CAP);
  const groups = Object.keys(CRAFT_GROUPS) as CraftGroup[];

  return (
    <WikiShell columns="listWide">
      <WikiSidebar
        title={t.title}
        search={{ value: q, onChange: setQ, placeholder: t.searchPlaceholder }}
        filters={
          <>
            <FilterGroup label={t.level}>
              <Chip on={level === null} onClick={() => setLevel(null)}>
                {common.all}
              </Chip>
              {levels.map((l) => (
                <Chip key={l} on={level === l} onClick={() => setLevel(l)} title={t.levelChip(l)}>
                  {l}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label={t.group}>
              <Chip on={group === null} onClick={() => setGroup(null)}>
                {common.all}
              </Chip>
              {groups.map((g) => (
                <Chip key={g} on={group === g} onClick={() => setGroup(group === g ? null : g)}>
                  {t.groups[g]}
                </Chip>
              ))}
            </FilterGroup>
            <label className={styles.essence} title={t.essencePriceTitle}>
              <span className={styles.essenceLabel}>{t.essencePrice}</span>
              <Input
                type="number"
                min={0}
                step={500}
                value={essence}
                onChange={(event) => changeEssence(Math.max(0, Number(event.target.value) || 0))}
              />
            </label>
            <div className={styles.toggles}>
              <Chip on={profSell} onClick={() => setProfSell(!profSell)} title={t.profSellTitle}>
                {t.profSell}
              </Chip>
              <Chip on={profDis} onClick={() => setProfDis(!profDis)} title={t.profDisTitle}>
                {t.profDis}
              </Chip>
            </div>
          </>
        }
        count={
          <>
            {filtered.length > 0 ? t.count(filtered.length) : t.countNone}
            {filtered.length > shown.length && <> · {common.capped(shown.length, filtered.length)}</>}
          </>
        }
        onReset={reset}
        resetDisabled={pristine}
      >
        {shown.length === 0 ? (
          <p className={styles.hint}>{t.emptyList}</p>
        ) : (
          <WikiList>
            {shown.map((row) => (
              <WikiRow
                key={row.id}
                href={wikiPath('craft', row.id)}
                active={selected?.id === row.id}
                icon={<RowTile item={row.summary} />}
                title={row.summary.name}
                meta={[
                  common.levelShort(row.item.level),
                  ...(row.item.cost > 0 ? [`${num(row.item.cost, lang, 0)} ${common.gold}`] : []),
                  ...(row.unlock === 'talent' ? [t.rowTalent] : row.unlock === 'recipe' ? [t.rowRecipe] : []),
                ].join(' · ')}
              />
            ))}
          </WikiList>
        )}
      </WikiSidebar>

      <WikiDetail className={missing || selected === undefined || tree === null ? undefined : styles.detailFit}>
        {missing ? (
          <WikiMissing />
        ) : selected === undefined || tree === null ? (
          <WikiEmpty>{t.pick}</WikiEmpty>
        ) : (
          <>
            <DetailHeader
              icon={<ItemTile item={selected.summary} />}
              title={selected.summary.name}
              code={selected.id}
              tags={
                <>
                  {extraLocale.qualities[String(selected.item.quality)] !== undefined && (
                    <Tag>
                      {selected.item.quality} · {extraLocale.qualities[String(selected.item.quality)]}
                    </Tag>
                  )}
                  <Tag>{t.qualityLevel(selected.item.level)}</Tag>
                  <Tag>{selected.item.cost > 0 ? t.ownPrice(num(selected.item.cost, lang, 0)) : t.noPrice}</Tag>
                  {talent !== null ? (
                    <Tag
                      tone="accent"
                      href={wikiPath('progression', talent.tree, talent.node)}
                      title={t.talentTitle(
                        talent.name,
                        talent.node,
                        talent.treeName,
                        recipeId === undefined ? null : `${core.byId.get(recipeId)?.name ?? recipeId} (${recipeId})`,
                      )}
                    >
                      {talent.icon !== undefined && <img className={styles.talentIcon} src={talent.icon} alt="" loading="lazy" />}
                      {t.talent(talent.name)}
                    </Tag>
                  ) : recipeId !== undefined ? (
                    <Tag tone="accent" href={itemHref(ctx, recipeId)} title={t.recipeTitle(core.byId.get(recipeId)?.name ?? recipeId, recipeId)}>
                      {t.recipe(core.byId.get(recipeId)?.name ?? recipeId)}
                    </Tag>
                  ) : (
                    <Tag tone="warn" title={t.noFormulaTitle}>
                      {t.noFormula}
                    </Tag>
                  )}
                  {/* Beside the price, as the partner wiki drew it; not in the header actions, which crowd the title on a phone. */}
                  <AuctionField id={selected.id} />
                </>
              }
            />

            <div className={styles.work}>
              <Panel
                className={styles.treePanel}
                fill
                title={t.tree}
                action={
                  <Check checked={matDepth} onChange={setMatDepth} title={t.matDepthTitle}>
                    {t.matDepth}
                  </Check>
                }
              >
                <div className={styles.treeBody}>
                  <div className={styles.legend} aria-hidden="true">
                    <span>{t.colPrice}</span>
                    <span>{t.colExchange}</span>
                    <span>{t.colCraft}</span>
                  </div>
                  <CraftTreeView ctx={ctx} root={selected.item} tree={tree} matDepth={matDepth} />
                </div>
              </Panel>

              <CraftSummary
                ctx={ctx}
                root={selected.item}
                economy={economies.get(selected.id) ?? craftEconomy(selected.item, lookup, essencePrice)}
                matDepth={matDepth}
                ignoreLevel={ignoreLevel}
                onIgnoreLevel={setIgnoreLevel}
                drops={drops}
                maps={core.maps.byId}
              />
            </div>
          </>
        )}
        <DataFooter ruleset={CURRENT_RULESET.toUpperCase()} built={data[0].generatedAt.slice(0, 10)} />
      </WikiDetail>
    </WikiShell>
  );
}

