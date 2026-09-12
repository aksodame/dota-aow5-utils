import type { CSSProperties, ReactNode } from 'react';
import { abilityIconUrl, heroIconUrl, iconUrl, type ItemSummary, type SpellSummary } from 'aow5-shared/data';
import type { HeroInfo } from 'aow5-shared/types';
import { Tooltip, cx } from '@/ui';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { ItemCard } from './ItemCard';
import { SpellCard } from './SpellCard';
import styles from './Tile.module.css';

/**
 * The square that holds an item, a spell or a hero portrait.
 *
 * One component for all three because the reference draws them the same way,
 * and because the alternative — three near-identical files — is how the
 * previous site ended up with `Slot`, `SlotGroup`, `SpellSlot`, `SpellRow` and
 * `ItemIcon` all describing the same 48-pixel box.
 */

/** The addon's 1-7 quality scale. 0 is the one item whose quality is a string. */
export function qualityVar(quality: number): string {
  const q = Number.isInteger(quality) && quality >= 1 && quality <= 7 ? quality : 1;
  return `var(--q${q})`;
}

interface TileShellProps {
  className?: string;
  style?: CSSProperties;
  round?: boolean;
  /** Renders as a button. Omit for a build page, where nothing is clickable. */
  onClick?: () => void;
  label?: string;
  children: ReactNode;
}

function TileShell({ className, style, round = false, onClick, label, children }: TileShellProps) {
  const classes = cx(styles.tile, round && styles.round, onClick !== undefined && styles.interactive, className);
  if (onClick === undefined) {
    return (
      <div className={classes} style={style}>
        {children}
      </div>
    );
  }
  return (
    <button type="button" className={classes} style={style} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

interface ItemTileProps {
  item: ItemSummary;
  onClick?: () => void;
  className?: string;
}

export function ItemTile({ item, onClick, className }: ItemTileProps) {
  // Null outside a provider, which is a real answer: the tile still renders and
  // its card falls back to what the index already knows.
  const store = useItemDetailsStore();

  return (
    <Tooltip
      content={<ItemCard item={item} />}
      // The megabyte of stats and descriptions is fetched on the first hover
      // and never before. Idempotent, so pointing at a second tile costs
      // nothing.
      {...(store !== null ? { onOpen: store.request } : {})}
    >
      <TileShell
        className={cx(styles.rarity, className)}
        // The ring reads its colour from here, so the rarity scale lives in one
        // place rather than as a class per quality.
        style={{ ['--tile-rarity' as string]: qualityVar(item.quality) }}
        {...(onClick !== undefined ? { onClick, label: item.name } : {})}
      >
        <img src={iconUrl(item.icon)} alt="" loading="lazy" decoding="async" />
      </TileShell>
    </Tooltip>
  );
}

interface SpellTileProps {
  spell: SpellSummary;
  onClick?: () => void;
  className?: string;
}

export function SpellTile({ spell, onClick, className }: SpellTileProps) {
  return (
    <Tooltip content={<SpellCard ability={spell} />}>
      <TileShell round className={className} {...(onClick !== undefined ? { onClick, label: spell.name } : {})}>
        <img src={abilityIconUrl(spell.icon)} alt="" loading="lazy" decoding="async" />
      </TileShell>
    </Tooltip>
  );
}

export function HeroTile({ hero, name, className, onClick }: { hero: HeroInfo; name: string; className?: string; onClick?: () => void }) {
  return (
    <TileShell className={className} {...(onClick !== undefined ? { onClick, label: name } : {})}>
      <img src={heroIconUrl(hero.icon)} alt="" loading="lazy" decoding="async" />
    </TileShell>
  );
}

/** An empty slot, or one holding an index this deployment cannot name. */
export function BlankTile({
  unknown = false,
  round = false,
  onClick,
  label,
  className,
}: {
  unknown?: boolean;
  round?: boolean;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <TileShell
      round={round}
      className={cx(styles.empty, className)}
      {...(onClick !== undefined ? { onClick, label: label ?? '' } : {})}
    >
      {unknown && <span className={styles.unknown}>?</span>}
    </TileShell>
  );
}
