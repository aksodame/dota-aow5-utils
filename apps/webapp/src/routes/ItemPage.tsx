import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ascensionCost,
  goldIconUrl,
  iconUrl,
  reforgeCost,
  reforgeCostTotal,
  LATEST_SEASON,
  SEASON_KEYS,
  seasonLabel,
  type ItemSummary,
  type SeasonKey,
  type ReforgeCostRow,
} from 'aow5-shared/data';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
// The two modules this page needs up front, by path rather than through the
// wiki's barrel, which would pull every section's helpers into the main chunk.
import { applySeasonalPatch, seasonalPatch, type ItemsExtraFile } from 'aow5-shared/wiki/items-extra.ts';
import { newRollState, type RollState } from 'aow5-shared/wiki/itemroll.ts';
import { Badge, Button, Icon, Panel, cx } from '@/ui';
import { withLang } from '@/router';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { RichText } from '@/components/RichText';
import { qualityVar } from '@/components/Tile';
import { affectsOf, behaviorOf, gemRows, hasNamedSkill, statRows, type StatRow } from '@/lib/itemStats';
import { splitDescription, type DescSection } from '@/lib/richDesc';
import { rarityLabel } from '@/i18n/strings';
import { itemPath, navigate, Link } from '@/router';
import { dataVersion, factsOfItem, useDocumentMeta } from '@/lib/meta';
import { useWikiData } from '@/wiki/kit/useWikiData';
import { useStatNamer } from '@/wiki/kit';
import { AuctionField } from '@/wiki/kit/Refs';
import type { WikiPanelProps } from '@/wiki/sections/items/ItemWikiPanels';
import styles from './ItemPage.module.css';

/**
 * One item, at `/items/<id>`.
 *
 * The hover card answers "what is this while I am reading a loadout"; this
 * answers "what is this" with nowhere else to be. So it draws what the card
 * deliberately leaves out — an equipment recipe, what dismantling returns, the
 * fate stone a piece upgrades from — and it is linkable, which the card is not.
 *
 * ## Adaptive rather than one layout with holes in it
 *
 * The catalogue is not one kind of thing. A rune is a short list of numbers and
 * a sentence; a piece of equipment is a long stat block whose every value is
 * rolled; a recipe is a pointer at the thing it makes and nothing else; a
 * treasure chest is a name and a paragraph. A single column that reserved room
 * for all of it would be mostly empty on most items, so `sectionsFor` decides
 * what an item's *type* is about and the page draws that — see the note there.
 */
/*
 * The wiki's panels — drops, vendors, unlocks, fate stone, Life Soul — and the
 * roll calculator, each its own lazy component over one shared chunk.
 *
 * The page is in the builder's main bundle; these bring the wiki's data files
 * and three languages of explanation with them, so a reader who only ever
 * hovers items in a build never downloads them. Each draws `null` until its
 * data is in and when it has nothing to say, so the page around them is laid
 * out exactly as it was before they existed.
 */
const panels = () => import('@/wiki/sections/items/ItemWikiPanels');
function panel(name: 'SoulPanel' | 'UnlockPanel' | 'DropsPanel' | 'SourcesPanel' | 'FacetPanel' | 'CodeNote') {
  return lazy(() => panels().then((m) => ({ default: m[name] as ComponentType<WikiPanelProps> })));
}
const SoulPanel = panel('SoulPanel');
const UnlockPanel = panel('UnlockPanel');
const DropsPanel = panel('DropsPanel');
const SourcesPanel = panel('SourcesPanel');
const FacetPanel = panel('FacetPanel');
const CodeNote = panel('CodeNote');
/**
 * The grade from which the game rolls an item's stats, and therefore the grade
 * from which the card draws them as a calculator.
 *
 * The same floor the reforge table uses below — one statement of "this is
 * where a copy starts to differ from the table's numbers", not two.
 */
const ROLL_MIN_QUALITY = 5;

const ItemStatsEditor = lazy(() =>
  import('@/wiki/sections/calc/ItemStatsEditor').then((m) => ({ default: m.ItemStatsEditor })),
);

export function ItemPage({
  itemId,
  /**
   * Drawn inside the catalogue's detail column rather than as a page of its
   * own: the column sets the width and the page already has its padding, so
   * the card drops its own cap, centring and padding rather than nesting
   * margins inside them.
   */
  embedded = false,
}: {
  itemId: string;
  embedded?: boolean;
}) {
  const { core, strings } = useApp();
  const store = useItemDetailsStore();
  const t = strings.itemPage;

  /*
   * The stats are the page, so they are asked for on arrival rather than on
   * first hover the way the card does it. Idempotent — the provider is shared
   * with the picker and every tile, and only fetches once.
   */
  useEffect(() => {
    store?.request();
  }, [store]);

  const item = core?.byId.get(itemId);

  if (core === null) return <p className={styles.state}>{t.loading}</p>;
  if (item === undefined) {
    return (
      <div className={styles.state}>
        <h1 className={styles.missingTitle}>{t.missingTitle}</h1>
        <p className={styles.missingHint}>{t.missingHint}</p>
        <p className={styles.missingId}>{itemId}</p>
        <Button variant="primary" onClick={() => navigate('browse')}>
          {t.browse}
        </Button>
      </div>
    );
  }

  // Keyed, so the season picked and a copy dialled into the calculator belong to one item.
  return <ItemBody key={item.id} item={item} embedded={embedded} />;
}

function ItemBody({ item, embedded = false }: { item: ItemSummary; embedded?: boolean }) {
  const { core, strings, lang } = useApp();
  const store = useItemDetailsStore();
  const t = strings.itemPage;
  const ti = strings.item;

  const baseFull: ItemFull | undefined = store?.full?.[item.id];
  const text: LocaleDetail | undefined = store?.detail?.[item.id];

  /*
   * Which season's numbers the page shows.
   *
   * `items.full.json` is built from the base tables, which are the first
   * season's; a season's own copy of the table changes a few dozen items —
   * stats, a recipe, a soul's cooldown, a glyph's grade. The page opens on the
   * newest season the item is in and offers every season's table beside it,
   * only for the items some season actually changes.
   */
  const extra = useWikiData<[ItemsExtraFile]>(['items-extra.json']).data?.[0] ?? null;
  const patchOf = (s: SeasonKey) => (extra === null || s === 1 ? undefined : seasonalPatch(extra, item.id, `s${s}`));
  const seasonal = SEASON_KEYS.some((s) => patchOf(s) !== undefined);
  // The newest season the item is in: an S2-only item opens on S2's numbers.
  const homeSeason: SeasonKey = (baseFull?.seasons?.at(-1) as SeasonKey | undefined) ?? LATEST_SEASON;
  const [season, setSeason] = useState<SeasonKey>(homeSeason);
  const shownSeason: SeasonKey = seasonal ? season : homeSeason;
  const patch = patchOf(shownSeason);
  const full: ItemFull | undefined = baseFull !== undefined ? applySeasonalPatch(baseFull, patch) : baseFull;
  const quality = full?.quality ?? item.quality;
  const level = full?.level ?? item.level;
  const cost = full?.cost ?? item.cost;

  /* What the stat panel's calculator is dialled to. */
  const [roll, setRoll] = useState<RollState>(newRollState);

  /*
   * This page's own head, because the shell cannot write it: the title is the
   * item's name and the description is its facts, neither of which the router
   * has. The data version rides along so the card's address changes when a pak
   * refresh changes the card — see `itemCardPath`.
   */
  useDocumentMeta(
    {
      kind: 'item',
      item: factsOfItem(item, text, baseFull?.seasons),
      ...(core !== null ? { version: dataVersion(core.meta) } : {}),
    },
    lang,
  );

  const stats = statRows(full, text, 'stats', store?.rolls);
  const gems = gemRows(full);
  const named = hasNamedSkill(full, text);
  const behavior = named ? behaviorOf(full) : null;
  const affects = named ? affectsOf(full) : null;
  const sections = splitDescription(text?.desc);
  const rarity = qualityVar(quality);
  const layout = sectionsFor(item.type);

  /* Facts about using the thing rather than bonuses it grants. */
  const ability = full?.ability;
  const meta: string[] = [];
  if (ability?.cooldown) meta.push(`${ti.cooldown} ${ability.cooldown}`);
  if (ability?.manaCost) meta.push(`${ti.manaCost} ${ability.manaCost}`);
  if (ability?.castRange) meta.push(`${ti.castRange} ${ability.castRange}`);
  /*
   * The craft time is deliberately *not* in that list.
   *
   * It used to be, and it was the only thing on the page that could open a
   * panel headed "What it does" — so a material with no skill at all got an
   * otherwise-empty box saying `Craft time 30`. How long it takes to make is a
   * fact about making it, so it belongs beside the recipe; see `Obtain`.
   */

  const [copied, setCopied] = useState(false);
  const share = useCallback(() => {
    const url = new URL(withLang(itemPath(item.id)), window.location.origin).href;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [item.id]);

  const nameOf = (id: string) => core?.byId.get(id)?.name ?? id;

  /*
   * The reforge table, for the things actually worth reforging.
   *
   * A potion and a recipe are never reforged at all, and the arithmetic would
   * happily price them — `reforgeCost` takes a level and a grade and asks no
   * questions — so that gate is here rather than there.
   *
   * The tier and grade floors are a deliberate hardcode rather than a rule read
   * out of the game: nobody takes a tier-2 uncommon to the forge, and nine rows
   * of prices for one makes the page longer without making it more useful. If
   * the addon ever states a real threshold, this is where it goes.
   */
  const REFORGE_MIN_TIER = 3;
  const REFORGE_MIN_QUALITY = 5;
  const reforgeable =
    (item.type === 'equip' || item.type === 'stone' || full?.isSoul === true) &&
    level >= REFORGE_MIN_TIER &&
    quality >= REFORGE_MIN_QUALITY;
  const reforgeRows = reforgeable ? reforgeCost(store?.rolls, { ...item, level, quality }) : [];
  // What a fate stone would add on top at each of those levels, the same table.
  const ascensionRows = reforgeable ? ascensionCost(store?.rolls, { ...item, level, quality }) : [];
  const hasAbout = sections.length > 0 || meta.length > 0 || behavior !== null || affects !== null;
  // What making it costs in time, drawn with the recipe rather than the skill.
  const craftTime = full?.timeCost !== undefined && full.timeCost > 0 ? full.timeCost : null;
  const hasStats = stats.length > 0 || gems.length > 0;
  /*
   * The calculator is for things that roll: worn equipment, fate stones,
   * souls. A glyph's numbers are fixed and a material has none.
   *
   * And only from `ROLL_MIN_QUALITY` up, which is where the game starts
   * rolling: below it a stat is the number it says, so the block is a plain
   * list and shows no span either — a range over a number that never moves
   * invites a reader to look for a spread that is not there.
   */
  const statName = useStatNamer();
  const rolls = quality >= ROLL_MIN_QUALITY;
  const rollable = rolls && stats.length > 0 && (item.type === 'equip' || item.type === 'stone' || full?.isSoul === true);
  /**
   * What the plain list draws: the namer's label for each stat, and no range
   * when nothing rolls. The namer is the calculator's, so both views call a
   * stat the same thing — the game's own label where it gives one, the wiki's
   * table where it does not.
   */
  const plainStats = useMemo(
    () =>
      (rolls ? stats : stats.map(({ span, ...row }) => row)).map((row) => ({
        ...row,
        label: statName(row.key, item.id).text,
      })),
    [stats, rolls, statName, item.id],
  );
  const wiki: WikiPanelProps = { item, full, season: shownSeason };
  const hasObtain =
    full !== undefined &&
    (full.needs.length > 0 || full.usedBy.length > 0 || full.produces !== undefined || full.upgradesFrom !== undefined);

  return (
    <div className={cx(styles.page, embedded && styles.pageEmbedded)}>
      <header className={styles.head}>
        {/* The same fixed square the card uses, twice the size: the frame stays
            square whatever the source ratio is. */}
        <div className={styles.art} style={{ borderColor: rarity }}>
          <img src={iconUrl(item.icon)} alt="" />
        </div>

        <div className={styles.identity}>
          <h1 className={styles.name}>{item.name}</h1>

          <div className={styles.badges}>
            <span className={styles.rarity} style={{ backgroundColor: rarity }}>
              {rarityLabel(strings, quality)}
            </span>
            {level > 0 && <Badge tone="tier">T{level}</Badge>}
            {/* A soul is typed `equip` in the table; the game calls it a soul. */}
            <span className={styles.type}>
              {full?.isSoul === true ? strings.itemTypes.soul : (strings.itemTypes[item.type] ?? item.type)}
            </span>
            {/* A recipe leaves every drop pool once it has dropped. */}
            {full?.isRecipe === true && <span className={styles.season}>{t.dropsOnce}</span>}
            {/* Only when the pak actually restricts it — most items have no
                season and saying "every season" on all of them is noise. */}
            {full?.seasons !== undefined && full.seasons.length > 0 && (
              <span className={styles.season}>
                {t.seasonOnly(full.seasons.map((s) => seasonLabel(s as SeasonKey)).join(', '))}
              </span>
            )}
            {seasonal && (
              <span className={styles.seasonSwitch} role="group" aria-label={t.seasonValues} title={t.seasonValuesHint}>
                <span className={styles.seasonLabel}>{t.seasonValues}</span>
                {SEASON_KEYS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx(styles.seasonChip, shownSeason === s && styles.seasonChipOn)}
                    aria-pressed={shownSeason === s}
                    onClick={() => setSeason(s)}
                  >
                    {seasonLabel(s)}
                  </button>
                ))}
              </span>
            )}
          </div>

          <div className={styles.facts}>
            {cost > 0 && (
              <span className={styles.cost}>
                <img src={goldIconUrl()} alt="" />
                {cost.toLocaleString()}
              </span>
            )}
            {/* What it sells for on the Exchange, the reader's own figure — the
                wiki's crafting pages weigh buying against crafting with it. */}
            <AuctionField id={item.id} />
            <code className={styles.id}>{item.id}</code>
            {/*
              The card this page would be shared as, in development only.
              
              Beside the id because that is already the line for things a reader
              does not need and somebody working on the page does.
              `import.meta.env.DEV` is replaced with `false` in a production
              build and the branch is dropped, so it costs the bundle nothing.
            */}
            {import.meta.env.DEV && (
              <a
                className={styles.devLink}
                /*
                  `?lang=` so the preview is the card for the page you are
                  looking at. Without it the renderer fell back to
                  `Accept-Language`, so switching the site to Russian still
                  opened the English card — which is the one thing a preview of
                  a localized picture must not do.
                */
                href={`/api/og/items/${item.id}.png?lang=${lang}`}
                target="_blank"
                rel="noreferrer"
              >
                {t.previewCard}
              </a>
            )}
          </div>
        </div>

        {/*
          One control, and it shares *this item*.
          
          It used to be three — a share button borrowing the build page's
          "Share build" label, a link back to the catalogue, and a development
          link to the card. The label was simply wrong, and the other two did
          not belong at the top of the page: the nav's Items tab is the way back
          to the catalogue, and the card link has moved down beside the item id,
          which is where the other developer-facing detail already lives.
        */}
        <div className={styles.headLinks}>
          <Button size="sm" onClick={share}>
            <Icon.Copy size={14} />
            {copied ? t.shared : t.share}
          </Button>
        </div>
      </header>

      {store !== null && store.full === null && store.loading && <p className={styles.loading}>{ti.loadingDetails}</p>}

      <div className={cx(styles.grid, layout.wide && styles.gridWide)}>
        {/*
          Column order follows what the item is about. A rune leads with its
          numbers because they *are* the rune; a recipe leads with the thing it
          makes, because that is the only question anybody opens one to ask.
        */}
        {layout.lead === 'obtain' && hasObtain && (
          <div className={styles.spanAll}>
            <Obtain full={full} nameOf={nameOf} strings={strings} craftTime={craftTime} />
          </div>
        )}

        {hasStats && (
          <div className={styles.spanAll}>
          <Panel title={<PanelTitle icon={<Icon.Crosshair size={15} />} text={t.stats} />}>
            {/*
              The numbers are drawn editable, as the wiki this replaces drew
              them: the item's own values are the calculator's resting state,
              and dialling a particular copy into them is what the block is for.
              There is no read-only view beside it — a second list of the same
              stats was one list too many.

              A glyph's numbers are the exception: they do not roll, and the
              editor has no column for them, so they are listed above it.
            */}
            {gems.length > 0 && (
              <>
                <StatList rows={gems} />
                {rollable && <hr className={styles.rule} />}
              </>
            )}
            {rollable ? (
              <Suspense fallback={<p className={styles.loading}>{ti.loadingDetails}</p>}>
                <ItemStatsEditor itemId={item.id} state={roll} onChange={setRoll} heading={false} />
              </Suspense>
            ) : (
              plainStats.length > 0 && <StatList rows={plainStats} />
            )}
          </Panel>
          </div>
        )}

        {hasAbout && (
          <div className={styles.spanAll}>
          <Panel title={<PanelTitle icon={<Icon.Play size={15} />} text={t.about} />}>
            {(behavior !== null || affects !== null) && (
              <div className={styles.factLines}>
                {behavior !== null && (
                  <p className={styles.fact}>
                    {ti.skill}
                    {ti.colon}
                    <span>{ti.behavior[behavior]}</span>
                  </p>
                )}
                {affects !== null && (
                  <p className={styles.fact}>
                    {ti.affects}
                    {ti.colon}
                    <span>{ti.affectsLabel(affects.team, affects.scope)}</span>
                  </p>
                )}
              </div>
            )}
            {sections.length > 0 && <Description sections={sections} />}
            {meta.length > 0 && <p className={styles.meta}>{meta.join(' · ')}</p>}
            {text?.lore !== undefined && text.lore !== '' && <p className={styles.lore}>{text.lore}</p>}
            <Suspense fallback={null}>
              <CodeNote {...wiki} />
            </Suspense>
          </Panel>
          </div>
        )}

        {/* Facts particular to this kind of item: a soul's transformation, an
            Ancestral item's fate stone. After what it does, before where it comes from. */}
        <Suspense fallback={null}>
          <SoulPanel {...wiki} />
          <FacetPanel {...wiki} />
        </Suspense>

        {layout.lead !== 'obtain' && hasObtain && (
          <Obtain full={full} nameOf={nameOf} strings={strings} craftTime={craftTime} />
        )}

        {/*
          Where it comes from, after what it is for: what unlocks the craft,
          then the drops, then everything else — vendors, the Sky, the paid
          shops. The order the original wiki read in.
        */}
        <Suspense fallback={null}>
          <UnlockPanel {...wiki} />
          <DropsPanel {...wiki} />
          <SourcesPanel {...wiki} />
        </Suspense>

        {/*
          What a reforge costs, level by level.
          
          Only for the things that are actually reforged — the addon's own
          panel refuses anything that is not worn — and only when the tables
          carry the pricing, which is an extraction that is allowed to fail.
        */}
        {full !== undefined && reforgeRows.length > 0 && (
          <Panel title={<PanelTitle icon={<Icon.Hourglass size={15} />} text={t.reforge} />}>
            <ReforgeTable rows={reforgeRows} ascension={ascensionRows} nameOf={nameOf} strings={strings} />
          </Panel>
        )}

        {full?.dismantle !== undefined && full.dismantle.outputs.length > 0 && (
          <Panel title={<PanelTitle icon={<Icon.Trash size={15} />} text={t.dismantle} />}>
            <ul className={styles.links}>
              {full.dismantle.outputs.map((out) => (
                <li key={out.id}>
                  <ItemLink id={out.id} name={nameOf(out.id)} />
                  {out.count !== undefined && <span className={styles.count}>×{out.count}</span>}
                  {out.chance !== undefined && <span className={styles.chance}>{t.chance(out.chance)}</span>}
                </li>
              ))}
            </ul>
            {/* The addon's own name for the rule that matched — which is the
                grade band a dismantle is priced by, and the nearest thing to a
                "dismantling tier" the data actually states. */}
            <p className={styles.meta}>
              {t.dismantleRule}
              {ti.colon}
              <code className={styles.id}>{full.dismantle.rule}</code>
            </p>
            <p className={styles.note}>{t.dismantleNote}</p>
          </Panel>
        )}

        {full?.tags !== undefined && full.tags.length > 0 && (
          <Panel title={<PanelTitle icon={<Icon.Branch size={15} />} text={ti.tags} />}>
            <div className={styles.tags}>
              {full.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/**
 * Which way round to draw an item, by its own category.
 *
 * `lead` is the block that goes first, and `wide` is whether the stat column
 * earns two columns of the grid. Both are statements about the *kind* of thing:
 * a blueprint is a pointer, a rune is a short list, a piece of equipment is a
 * long one. Anything the addon adds that is not named here gets the ordinary
 * shape rather than nothing, which is the failure mode worth having.
 */
function sectionsFor(type: string): { lead: 'stats' | 'obtain'; wide: boolean } {
  switch (type) {
    // What it makes is the whole content of the page.
    case 'blueprint':
      return { lead: 'obtain', wide: false };
    // A material's only interesting property is what it is for.
    case 'material':
      return { lead: 'obtain', wide: false };
    // Long rolled stat blocks earn the room.
    case 'equip':
    case 'stone':
      return { lead: 'stats', wide: true };
    default:
      return { lead: 'stats', wide: false };
  }
}

/** Where an item comes from and what it turns into. */
function Obtain({
  full,
  nameOf,
  strings,
  craftTime,
}: {
  full: ItemFull | undefined;
  nameOf: (id: string) => string;
  strings: ReturnType<typeof useApp>['strings'];
  /** Seconds, or null for anything that is not crafted. */
  craftTime: number | null;
}) {
  const t = strings.itemPage;
  const ti = strings.item;
  if (full === undefined) return null;

  return (
    <Panel title={<PanelTitle icon={<Icon.Branch size={15} />} text={t.obtain} />}>
      {full.produces !== undefined && (
        <Section title={t.produces}>
          <ItemLink id={full.produces} name={nameOf(full.produces)} />
        </Section>
      )}
      {full.upgradesFrom !== undefined && (
        <Section title={t.upgradesFrom}>
          <ItemLink id={full.upgradesFrom} name={nameOf(full.upgradesFrom)} />
        </Section>
      )}
      {/*
        The recipe, *including* on a piece of equipment — which is the one place
        this page deliberately parts company with the hover card. The card hides
        it because it opens constantly while somebody is reading a loadout and
        the ingredient list would push the stats out of view. Here there is no
        loadout to read and the question is the item itself.
      */}
      {full.needs.length > 0 && (
        <Section title={ti.recipe}>
          <ul className={styles.links}>
            {full.needs.map((need) => (
              <li key={need.id}>
                <ItemLink id={need.id} name={nameOf(need.id)} />
                {need.count > 1 && <span className={styles.count}>×{need.count}</span>}
              </li>
            ))}
          </ul>
          {craftTime !== null && (
            <p className={styles.meta}>
              {ti.craftTime} {craftTime}
            </p>
          )}
        </Section>
      )}
      {full.usedBy.length > 0 && (
        <Section title={ti.usedIn(full.usedBy.length)}>
          <ul className={styles.links}>
            {full.usedBy.map((id) => (
              <li key={id}>
                <ItemLink id={id} name={nameOf(id)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Panel>
  );
}

/**
 * A link to another item's page.
 *
 * The whole reason this page is worth having: the catalogue is a graph — a
 * stone upgrades a sword, a sword is made of three materials, a material is
 * used by forty things — and until now none of it was walkable.
 */
function ItemLink({ id, name }: { id: string; name: string }) {
  const { core } = useApp();
  const icon = core?.byId.get(id)?.icon;
  return (
    <Link to={{ href: itemPath(id) }} className={styles.itemLink}>
      {icon !== undefined && <img src={iconUrl(icon)} alt="" loading="lazy" decoding="async" />}
      <span>{name}</span>
    </Link>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

/** Value first, then what it does — the order the game uses. */
function StatList({ rows }: { rows: StatRow[] }) {
  return (
    <ul className={styles.stats}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className={styles.statValue}>{row.value}</span>
          <span className={styles.statLabel}>{row.label}</span>
          {row.span !== undefined && <span className={styles.statSpan}>{row.span}</span>}
        </li>
      ))}
    </ul>
  );
}

function Description({ sections }: { sections: DescSection[] }) {
  return (
    <div className={styles.desc}>
      {sections.map((section, i) =>
        section.heading !== null ? (
          <div key={i} className={styles.descBox}>
            <p className={styles.descHeading}>
              <RichText nodes={section.heading} />
            </p>
            {section.body.length > 0 && (
              <div className={styles.descBody}>
                <RichText nodes={section.body} />
              </div>
            )}
          </div>
        ) : (
          <div key={i} className={styles.descBody}>
            <RichText nodes={section.body} />
          </div>
        ),
      )}
    </div>
  );
}


/**
 * What every reforge level costs, the nine of them added up, and what a fate
 * stone would add on top at each level.
 *
 * A table rather than a list: the interesting reading is down a column — how
 * fast the gold climbs, when the second essence appears, how the stone's
 * surcharge falls away as the item is reforged — and that is what a table is
 * for. The stone's column is a reading at each level, not a step, so the total
 * row has nothing to add up there.
 */
function ReforgeTable({
  rows,
  ascension,
  nameOf,
  strings,
}: {
  rows: readonly ReforgeCostRow[];
  ascension: readonly { level: number; materials: Record<string, number> }[];
  nameOf: (id: string) => string;
  strings: ReturnType<typeof useApp>['strings'];
}) {
  const t = strings.itemPage;
  const total = reforgeCostTotal(rows);
  const stones = new Map(ascension.map((row) => [row.level, row.materials]));

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t.reforgeLevel}</th>
            <th scope="col">{t.reforgeGold}</th>
            <th scope="col">{t.reforgeMaterials}</th>
            <th scope="col">{t.reforgeStone}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const stone = stones.get(row.level) ?? {};
            return (
              <tr key={row.level}>
                <th scope="row" className={styles.level}>
                  +{row.level}
                </th>
                <td className={styles.gold}>{row.gold.toLocaleString()}</td>
                <td>
                  <Materials row={row} nameOf={nameOf} />
                </td>
                <td>
                  {Object.keys(stone).length > 0 ? (
                    <Materials row={{ level: row.level, gold: 0, materials: stone }} nameOf={nameOf} />
                  ) : (
                    <span className={styles.dim}>{t.reforgeFree}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t.reforgeTotal}</th>
            <td className={styles.gold}>{total.gold.toLocaleString()}</td>
            <td>
              <Materials row={total} nameOf={nameOf} />
            </td>
            <td>
              <span className={styles.dim}>{t.reforgeDash}</span>
            </td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.note}>{t.reforgeNote}</p>
      <p className={styles.note}>{t.reforgeStoneNote}</p>
    </>
  );
}


/**
 * A panel heading with a glyph in front of it.
 *
 * The page was five identical grey headings down a column of identical black
 * cards, and nothing told them apart until you read them. A glyph is what the
 * eye lands on first.
 */
export function PanelTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className={styles.panelTitle}>
      <span className={styles.panelIcon} aria-hidden>
        {icon}
      </span>
      {text}
    </span>
  );
}

/**
 * What a reforge level costs, as the essences themselves.
 *
 * Icons and a count rather than `Legendary Equipment Essence ×6, Equipment
 * Essence ×11` — that sentence wrapped to two lines in every row of a
 * nine-row table, which is what made the block twice as tall as it needed to
 * be and impossible to scan down.
 */
function Materials({ row, nameOf }: { row: ReforgeCostRow; nameOf: (id: string) => string }) {
  const { core } = useApp();
  return (
    <span className={styles.materials}>
      {Object.entries(row.materials).map(([id, need]) => {
        const item = core?.byId.get(id);
        return (
          <Link key={id} to={{ href: itemPath(id) }} className={styles.material} title={nameOf(id)}>
            {item !== undefined && (
              <img
                src={iconUrl(item.icon)}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ borderColor: qualityVar(item.quality) }}
              />
            )}
            <span className={styles.count}>×{need}</span>
          </Link>
        );
      })}
    </span>
  );
}


