import type { ReactNode } from 'react';
import { MONSTER_TYPE_NAMES, monsterTypeGroup, type Hunter, type Monster } from 'aow5-shared/wiki';
import { useApp } from '@/data/AppData';
import { ItemTile } from '@/components/Tile';
import { Icon, cx } from '@/ui';
import { itemPath, Link } from '@/router';
import type { Lang } from '@/i18n/strings';
import type { MonstersStrings } from '../../i18n/monsters';
import { num, pctOf } from '../../kit';
import type { Model } from './model';
import styles from '../MonstersPage.module.css';

/** What every piece of the section is handed: the data, the reader's words, the item filter. */
export interface Ctx {
  model: Model;
  t: MonstersStrings;
  lang: Lang;
  picked: readonly string[];
  togglePick: (id: string) => void;
  /** A section address that keeps the difficulty the reader chose. */
  href: (...segments: string[]) => string;
}

/** The unit's type, coloured by its group — the badge on a row, a chip and the card. */
export function TypeBadge({ m, lang }: { m: Monster; lang: Lang }) {
  const group = monsterTypeGroup(m.type);
  return (
    <span className={cx(styles.badge, group !== undefined && styles[`badge_${group}`])}>
      {group === undefined ? m.type : MONSTER_TYPE_NAMES[lang][group]}
    </span>
  );
}

/** An item's name in the reader's language, or its id for the few pool ids that are not items. */
export function useItemName(): (id: string) => string {
  const { core } = useApp();
  return (id) => core?.byId.get(id)?.name ?? id;
}

/**
 * One item in a drop table: a button that toggles it into the item filter, as
 * the original did on every drop cell — and beside it a link to the item's
 * own page, because ours carry everything else about it.
 *
 * The name gets a row of its own; the id and the level sit under it on the
 * left, and the value — a chance, a share, a count of sources — under it on
 * the right. Sharing one narrow line between the name and the value was what
 * truncated the names; a name that spans its own column does not.
 */
export function ItemCell({
  id,
  ctx,
  value,
  title,
  sub,
  compact = false,
}: {
  id: string;
  ctx: Ctx;
  value?: ReactNode;
  title?: string;
  /** The line under the name; the id by default. */
  sub?: ReactNode;
  compact?: boolean;
}) {
  const { core } = useApp();
  const item = core?.byId.get(id);
  const picked = ctx.picked.includes(id);
  const hint = picked ? ctx.t.pickedHint : ctx.t.pickHint;
  return (
    <div className={cx(styles.cell, picked && styles.cellPicked, compact && styles.cellCompact, item === undefined && styles.cellUnknown)}>
      <button
        type="button"
        className={styles.cellMain}
        onClick={() => ctx.togglePick(id)}
        aria-pressed={picked}
        title={title === undefined ? hint : `${title}\n\n${hint}`}
      >
        <span className={styles.cellArt}>{item !== undefined && <ItemTile item={item} />}</span>
        <span className={styles.cellText}>
          <span className={styles.cellName}>{item?.name ?? id}</span>
          {compact ? (
            value !== undefined && <span className={styles.cellValue}>{value}</span>
          ) : (
            <span className={styles.cellRow}>
              <span className={styles.cellSub}>{sub ?? id}</span>
              {value !== undefined && <span className={styles.cellValue}>{value}</span>}
            </span>
          )}
        </span>
      </button>
      {item !== undefined && (
        <Link to={{ href: itemPath(id) }} className={styles.cellLink} title={ctx.t.openItem} aria-label={ctx.t.openItem}>
          <Icon.External size={14} />
        </Link>
      )}
    </div>
  );
}

/** A hunter's wave in words, from whatever the map sets — every field may be left to the server. */
export function waveText(t: MonstersStrings, h: Hunter, lang: Lang): string {
  if (h.minCount === null && h.maxCount === null && h.waveChance === null && h.startDelay === null) return t.waveDefaults;
  const bits = [t.wave(h.minCount, h.maxCount)];
  if (h.waveChance !== null) bits.push(t.waveChance(pctOf(h.waveChance, lang, 0)));
  if (h.startDelay !== null) bits.push(t.waveDelay(num(h.startDelay / 60, lang, 1)));
  return bits.join(', ');
}
