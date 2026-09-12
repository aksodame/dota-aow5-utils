import { goldIconUrl, iconUrl, type ItemSummary } from 'aow5-shared/data';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { affectsOf, behaviorOf, gemRows, hasNamedSkill, statRows, type StatRow } from '@/lib/itemStats';
import { splitDescription, type DescSection } from '@/lib/richDesc';
import { rarityLabel } from '@/i18n/strings';
import { RichText } from './RichText';
import { qualityVar } from './Tile';
import styles from './ItemCard.module.css';

/**
 * An item as the game itself draws it.
 *
 * The rewrite briefly reduced this to a name, an id and a list of stats, which
 * threw away most of what the extraction pipeline had gone to the trouble of
 * getting: the rarity grade, the shop cost, whether the skill is passive or
 * active, the craft time, the recipe, and what the item is itself an
 * ingredient for. None of that needed new data — it was all already in
 * `items.full.json`. This is the old card back, in CSS modules.
 *
 * The short version — name, id, level, cost, rarity — comes from the index,
 * which is already loaded. Everything below the header lives in
 * `items.full.json` and `locale.<lang>.details.json`, over a megabyte together
 * and fetched only once somebody actually points at something. Until they
 * arrive the card shows the header rather than a spinner, so a hover is never
 * a blank box.
 */
export function ItemCard({ item }: { item: ItemSummary }) {
  const { strings, core } = useApp();
  const store = useItemDetailsStore();
  const full: ItemFull | undefined = store?.full?.[item.id];
  const text: LocaleDetail | undefined = store?.detail?.[item.id];
  const t = strings.item;

  /*
   * With the span each stat can roll to, where the tables have arrived.
   *
   * Every equipment stat in this game is rolled, so the number in the item
   * table is the middle of a range rather than the value on any particular
   * copy — and a card that prints it alone is the reason somebody buys the
   * wrong sword. The tables ride with the same fetch as the stats themselves.
   */
  const stats = statRows(full, text, 'stats', store?.rolls);
  const gems = gemRows(full);
  // Only for an item that actually has one: see `hasNamedSkill`.
  const named = hasNamedSkill(full, text);
  const behavior = named ? behaviorOf(full) : null;
  const affects = named ? affectsOf(full) : null;

  /*
   * The numbers that are facts about using the thing rather than bonuses it
   * grants, so they read as one dim line instead of joining the stat list.
   */
  const ability = full?.ability;
  const meta: string[] = [];
  if (ability?.cooldown) meta.push(`${t.cooldown} ${ability.cooldown}`);
  if (ability?.manaCost) meta.push(`${t.manaCost} ${ability.manaCost}`);
  if (ability?.castRange) meta.push(`${t.castRange} ${ability.castRange}`);
  if (full?.timeCost) meta.push(`${t.craftTime} ${full.timeCost}`);

  const sections = splitDescription(text?.desc);
  const rarity = qualityVar(item.quality);

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        {/*
          A fixed square the art fills, rather than an image the box sizes
          itself around: the frame is then the same 54px whatever the source
          ratio is, and nothing in the header can stretch it.
        */}
        <div className={styles.art} style={{ borderColor: rarity }}>
          <img src={iconUrl(item.icon)} alt="" />
        </div>

        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <h3 className={styles.name}>{item.name}</h3>
            <div className={styles.ids}>
              <div>
                {t.level} {item.level}
              </div>
              <div className={styles.id}>{item.id}</div>
            </div>
          </div>

          <div className={styles.badges}>
            <span className={styles.rarity} style={{ backgroundColor: rarity }}>
              {rarityLabel(strings, item.quality)}
            </span>
            <span className={styles.type}>{item.type}</span>
          </div>

          {item.cost > 0 && (
            <p className={styles.cost}>
              {/* The game's own coin, the same one a build's price uses. */}
              <img src={goldIconUrl()} alt="" />
              {item.cost.toLocaleString()}
            </p>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {(behavior !== null || affects !== null) && (
          <div>
            {behavior !== null && (
              <p className={styles.fact}>
                {t.skill}
                {t.colon}
                <span>{t.behavior[behavior]}</span>
              </p>
            )}
            {affects !== null && (
              <p className={styles.fact}>
                {t.affects}
                {t.colon}
                <span>{t.affectsLabel(affects.team, affects.scope)}</span>
              </p>
            )}
          </div>
        )}

        {store !== null && store.full === null && store.loading && <p className={styles.loading}>{t.loadingDetails}</p>}

        {/*
          A rune's numbers before its prose, not after.

          This block used to sit below the description, which is where a
          *secondary* fact belongs — but for a gem these are the item's whole
          point, and the description is the sentence explaining them. A rune's
          card opened with a paragraph and made you scroll past it to find what
          the rune actually does.
        */}
        {gems.length > 0 && (
          <Block title={t.glyph}>
            <StatList rows={gems} />
          </Block>
        )}

        {stats.length > 0 && <StatList rows={stats} />}

        {meta.length > 0 && <p className={styles.meta}>{meta.join(' · ')}</p>}

        {sections.length > 0 && <Description sections={sections} />}

        {/*
          No recipe on a piece of gear.

          Equipment is bought, dropped or crafted long before it reaches a
          build, and its ingredient list is the longest block on the card — so
          on the one card people open constantly, while reading a loadout, it
          pushed the stats and the passive out of view to answer a question
          nobody was asking. Materials and consumables keep theirs: for those
          the recipe *is* the item.
        */}
        {full !== undefined && full.type !== 'equip' && full.needs.length > 0 && (
          <Block title={t.recipe}>
            <ul className={styles.needs}>
              {full.needs.map((need) => {
                const ingredient = core?.byId.get(need.id);
                return (
                  <li key={need.id}>
                    {ingredient !== undefined && <img src={iconUrl(ingredient.icon)} alt="" />}
                    <span className={styles.needName}>{ingredient?.name ?? need.id}</span>
                    {need.count > 1 && <span className={styles.needCount}>×{need.count}</span>}
                  </li>
                );
              })}
            </ul>
          </Block>
        )}

        {full !== undefined && full.usedBy.length > 0 && (
          <Block title={t.usedIn(full.usedBy.length)}>
            {/* Six, then an ellipsis: a few components is useful, twenty is a
                wall of names in a box that is already tall. */}
            <p className={styles.usedBy}>
              {full.usedBy
                .slice(0, 6)
                .map((id) => core?.byId.get(id)?.name ?? id)
                .join(', ')}
              {full.usedBy.length > 6 ? ' …' : ''}
            </p>
          </Block>
        )}

        {full?.tags !== undefined && full.tags.length > 0 && (
          <Block title={t.tags}>
            <div className={styles.tags}>
              {full.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </Block>
        )}

        {text?.lore !== undefined && text.lore !== '' && <p className={styles.lore}>{text.lore}</p>}
      </div>
    </div>
  );
}

/**
 * The stat list: the number first, then what it does.
 *
 * Value-then-label, which is the order the game uses and the one that lets the
 * eye run down a column of numbers. Labels come from `statRows`, which falls
 * back to humanising the raw key — only 38 of the 879 items with stats carry a
 * full set of localized labels, so filtering on "has a label" showed nothing
 * for the other 841.
 */
function StatList({ rows }: { rows: StatRow[] }) {
  return (
    <ul className={styles.stats}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className={styles.statValue}>{row.value}</span>
          <span className={styles.statLabel}>{row.label}</span>
          {/* What another copy of the same item could have rolled instead. */}
          {row.span !== undefined && <span className={styles.statSpan}>{row.span}</span>}
        </li>
      ))}
    </ul>
  );
}

/** One of the card's own sections — recipe, glyph, tags. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <h4 className={styles.blockTitle}>{title}</h4>
      {children}
    </section>
  );
}

/**
 * The description, in the blocks the game draws it as.
 *
 * Text under a heading is boxed with the heading on a bar above it, the way an
 * item's passive is drawn. Text arriving before any heading — a plain
 * description, a flavour line — is left unboxed, because a box around the only
 * paragraph is just a second border.
 */
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
