import { memo, useMemo } from 'react';
import type { BuildSummary } from 'aow5-api-contract';
import { goldIconUrl, heroIconUrl, seasonLabel, tierLabel } from 'aow5-shared/data';
import { Avatar, Badge, Icon } from '@/ui';
import { useApp } from '@/data/AppData';
import { buildPath, Link } from '@/router';
import { buildPreview } from '@/lib/preview';
import { formatPrice, formatPriceExact } from '@/lib/price';
import { AuthorName } from './AuthorName';
import { BlankTile, ItemTile, SpellTile } from './Tile';
import styles from './BuildRow.module.css';

/**
 * One row of the browse list: hero portrait, title, the price, the main spell
 * and the gear beside it, and the like count.
 *
 * A whole row is one link. The reference's rows are clickable end to end, and
 * an anchor wrapping the lot is what makes that true for a keyboard and for
 * "open in new tab" as well as for a mouse.
 *
 * **Memoised**, and it has to be. The virtualised list re-renders on every
 * frame of a scroll, and each row carries eight tiles that are each a Tooltip
 * with three pieces of state and a layout effect — so an unmemoised row meant
 * roughly 120 hook-bearing components reconciling per frame, which is what
 * scrolling felt like. `build` comes out of a Map and keeps its identity
 * between renders, so the default shallow compare is enough.
 */
export const BuildRow = memo(function BuildRow({
  build,
  href,
}: {
  build: BuildSummary;
  /**
   * Where the row goes, when it is not the build's own page.
   *
   * My Creations passes the editor: on your own list every row is something you
   * are working on, so the reading page is the detour and the editor is the
   * destination. The row is otherwise identical — same portrait, same preview,
   * same badges — because two different-looking lists of the same thing is how
   * somebody stops recognising their own build.
   */
  href?: string;
}) {
  const { core, tables, strings, lang } = useApp();

  const preview = useMemo(
    () => (core !== null && tables !== null ? buildPreview(build.payload, core, tables, build.mainSpell) : null),
    [build.payload, build.mainSpell, core, tables],
  );

  const hero = build.heroId !== null ? core?.heroes.byHero.get(build.heroId) : undefined;
  const heroName = hero?.names[lang] ?? hero?.short ?? strings.build.noHero;
  /*
   * What it is filed under, then the rooms it names.
   *
   * The tier is always there and the rooms may not be — a guide can cover a
   * whole tier without naming one — so the tier leads and the rooms follow it
   * as detail. Joined with a comma rather than listed, because a row is scanned
   * rather than read.
   */
  const rooms = build.maps
    .map((id) => core?.maps.byId.get(id)?.name)
    .filter((name): name is string => name !== undefined)
    .join(', ');

  return (
    <Link to={{ href: href ?? buildPath(build.slug) }} className={styles.row}>
      {/* Floor to ceiling, faded out on its right rather than cut off. */}
      {hero !== undefined && (
        <img className={styles.portrait} src={heroIconUrl(hero.icon)} alt="" loading="lazy" decoding="async" />
      )}

      <div className={styles.main}>
        <span className={styles.title}>{build.title}</span>
        <div className={styles.meta}>
          {/* The word for Event, as on the filter chip that found this row.
              `T3` needs no translating and `E` is a letter somebody has to be
              taught — so the badge says whichever of the two it is. */}
          {/* The season first: it is the coarser fact, and the one the
              sidebar's first group filters on. */}
          <Badge tone="season" className={styles.metaTier} title={strings.build.season}>
            {seasonLabel(build.season)}
          </Badge>
          {build.tier !== null && (
            <Badge tone="tier" className={styles.metaTier}>
              {tierLabel(build.tier, strings.build.event)}
            </Badge>
          )}
          {rooms !== '' && <span className={styles.metaMap}>{rooms}</span>}
          {build.status === 'draft' && <Badge tone="draft">{strings.build.draft}</Badge>}
          {/* `plain`: the whole row is already an anchor, so the name is text
              here and a link to Steam only on the build's own page. */}
          <span className={styles.author}>
            <Avatar src={build.author.avatar} name={build.author.nickname} size={18} />
            <AuthorName user={build.author} className={styles.authorName} plain />
          </span>
        </div>
      </div>

      {/*
        The price, ahead of the loadout it buys. A row is scanned to answer two
        questions — what is this, and can I afford it — and the second one is
        pointless to ask after looking at the items.

        Absent when the author gave none: `0` is "did not say", and a row of
        zeroes would read as a list of free builds.
      */}
      {build.price > 0 && (
        <div className={styles.price} title={`${formatPriceExact(build.price)} ${strings.build.gold}`}>
          <img className={styles.priceCoin} src={goldIconUrl()} alt="" loading="lazy" decoding="async" />
          <span className={styles.priceValue}>{formatPrice(build.price)}</span>
        </div>
      )}

      <div className={styles.preview} aria-hidden>
        {preview?.spell != null ? (
          <SpellTile spell={preview.spell} className={styles.previewSpell} />
        ) : (
          <BlankTile round className={styles.previewSpell} />
        )}
        {/* All six worn slots, holes included, so the tiles line up row to row. */}
        <div className={styles.previewItems}>
          {preview?.items.map((item, at) =>
            item === null ? (
              <BlankTile key={at} className={styles.previewItem} />
            ) : (
              <ItemTile key={at} item={item} className={styles.previewItem} />
            ),
          )}
        </div>
      </div>

      <div className={styles.likes}>
        <Icon.ThumbUp filled size={20} />
        <span className={styles.likeCount}>{build.likeCount}</span>
      </div>

      {/* The portrait and preview are decorative; this is what a screen reader
          hears instead of "image image image". */}
      <span className="srOnly">
        {heroName}. {strings.browse.by} {build.author.nickname}.{' '}
        {build.price > 0 ? `${formatPriceExact(build.price)} ${strings.build.gold}. ` : ''}
        {build.likeCount} {strings.browse.likes}.
      </span>
    </Link>
  );
});
