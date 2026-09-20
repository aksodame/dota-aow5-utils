import { useCallback, useEffect, useState } from 'react';
import {
  goldIconUrl,
  iconUrl,
  reforgeCost,
  reforgeCostTotal,
  seasonLabel,
  type ItemSummary,
  type ReforgeCostRow,
} from 'aow5-shared/data';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import { Badge, Button, Icon, Panel, cx } from '@/ui';
import { withLang } from '@/router';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { RichText } from '@/components/RichText';
import { qualityVar } from '@/components/Tile';
import { affectsOf, behaviorOf, gemRows, hasNamedSkill, statRows, type StatRow } from '@/lib/itemStats';
import { splitDescription, type DescSection } from '@/lib/richDesc';
import { rarityLabel } from '@/i18n/strings';
import { itemPath, navigate, pathOf, Link } from '@/router';
import { dataVersion, factsOfItem, useDocumentMeta } from '@/lib/meta';
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
export function ItemPage({ itemId }: { itemId: string }) {
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

  return <ItemBody item={item} />;
}

function ItemBody({ item }: { item: ItemSummary }) {
  const { core, strings, lang } = useApp();
  const store = useItemDetailsStore();
  const t = strings.itemPage;
  const ti = strings.item;

  const full: ItemFull | undefined = store?.full?.[item.id];
  const text: LocaleDetail | undefined = store?.detail?.[item.id];

  /*
   * This page's own head, because the shell cannot write it: the title is the
   * item's name and the description is its facts, neither of which the router
   * has. The data version rides along so the card's address changes when a pak
   * refresh changes the card — see `itemCardPath`.
   */
  useDocumentMeta(
    {
      kind: 'item',
      item: factsOfItem(item, text, full?.seasons),
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
  const rarity = qualityVar(item.quality);
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
    item.level >= REFORGE_MIN_TIER &&
    item.quality >= REFORGE_MIN_QUALITY;
  const reforgeRows = reforgeable ? reforgeCost(store?.rolls, item) : [];
  const hasAbout = sections.length > 0 || meta.length > 0 || behavior !== null || affects !== null;
  // What making it costs in time, drawn with the recipe rather than the skill.
  const craftTime = full?.timeCost !== undefined && full.timeCost > 0 ? full.timeCost : null;
  const hasStats = stats.length > 0 || gems.length > 0;
  const hasObtain =
    full !== undefined &&
    (full.needs.length > 0 || full.usedBy.length > 0 || full.produces !== undefined || full.upgradesFrom !== undefined);

  return (
    <div className={styles.page}>
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
              {rarityLabel(strings, item.quality)}
            </span>
            {item.level > 0 && <Badge tone="tier">T{item.level}</Badge>}
            <span className={styles.type}>{strings.itemTypes[item.type] ?? item.type}</span>
            {/* Only when the pak actually restricts it — most items have no
                season and saying "every season" on all of them is noise. */}
            {full?.seasons !== undefined && full.seasons.length > 0 && (
              <span className={styles.season}>
                {t.seasonOnly(full.seasons.map((s) => seasonLabel(s as 1 | 2)).join(', '))}
              </span>
            )}
          </div>

          <div className={styles.facts}>
            {item.cost > 0 && (
              <span className={styles.cost}>
                <img src={goldIconUrl()} alt="" />
                {item.cost.toLocaleString()}
              </span>
            )}
            <code className={styles.id}>{item.id}</code>
          </div>
        </div>

        <div className={styles.headLinks}>
          {/*
            The page's own address, on the clipboard.
            
            An item page is the one screen here whose whole value is being
            linkable — it is what somebody sends when they are asked "what does
            this do" — and until now the only way to share one was to select the
            address bar. `withLang` carries `?lang=` so a link shared out of the
            Russian site arrives in Russian, exactly as a build's does.
          */}
          <Button size="sm" onClick={share}>
            <Icon.Copy size={14} />
            {copied ? strings.build.copied : strings.build.share}
          </Button>
          {/* The catalogue, which is this page's parent — not the build list,
              which is a different part of the site entirely. */}
          <Link to={{ href: pathOf('items') }} className={styles.back}>
            {t.back}
          </Link>
          {/*
            The social card, in development only.

            It is rendered by the API and never appears in the page, so the only
            way to look at one was to know the URL and paste it.
            `import.meta.env.DEV` is replaced with `false` in a production build
            and the whole branch is dropped, so this costs the shipped bundle
            nothing.
          */}
          {import.meta.env.DEV && (
            <a className={styles.devLink} href={`/api/og/items/${item.id}.png`} target="_blank" rel="noreferrer">
              {t.previewCard}
            </a>
          )}
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
          <Obtain full={full} nameOf={nameOf} strings={strings} craftTime={craftTime} />
        )}

        {hasStats && (
          <Panel title={<PanelTitle icon={<Icon.Crosshair size={15} />} text={t.stats} />}>
            {gems.length > 0 && <StatList rows={gems} />}
            {gems.length > 0 && stats.length > 0 && <hr className={styles.rule} />}
            {stats.length > 0 && <StatList rows={stats} />}
          </Panel>
        )}

        {hasAbout && (
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
          </Panel>
        )}

        {layout.lead !== 'obtain' && hasObtain && (
          <Obtain full={full} nameOf={nameOf} strings={strings} craftTime={craftTime} />
        )}

        {/*
          What a reforge costs, level by level.
          
          Only for the things that are actually reforged — the addon's own
          panel refuses anything that is not worn — and only when the tables
          carry the pricing, which is an extraction that is allowed to fail.
        */}
        {full !== undefined && reforgeRows.length > 0 && (
          <Panel title={<PanelTitle icon={<Icon.Hourglass size={15} />} text={t.reforge} />}>
            <ReforgeTable rows={reforgeRows} nameOf={nameOf} strings={strings} />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
 * What every reforge level costs, and the nine of them added up.
 *
 * A table rather than a list: the interesting reading is down a column — how
 * fast the gold climbs, when the second essence appears — and that is what a
 * table is for.
 */
function ReforgeTable({
  rows,
  nameOf,
  strings,
}: {
  rows: readonly ReforgeCostRow[];
  nameOf: (id: string) => string;
  strings: ReturnType<typeof useApp>['strings'];
}) {
  const t = strings.itemPage;
  const total = reforgeCostTotal(rows);

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t.reforgeLevel}</th>
            <th scope="col">{t.reforgeGold}</th>
            <th scope="col">{t.reforgeMaterials}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.level}>
              <th scope="row" className={styles.level}>
                +{row.level}
              </th>
              <td className={styles.gold}>{row.gold.toLocaleString()}</td>
              <td>
                <Materials row={row} nameOf={nameOf} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{t.reforgeTotal}</th>
            <td className={styles.gold}>{total.gold.toLocaleString()}</td>
            <td>
              <Materials row={total} nameOf={nameOf} />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.note}>{t.reforgeNote}</p>
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
function PanelTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
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
