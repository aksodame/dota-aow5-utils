import { useEffect, useMemo, useState } from 'react';
import { iconUrl, type ItemSummary } from 'aow5-shared/data';
import type { ItemFull } from 'aow5-shared/types';
import { Button, Dialog, Icon, Input, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { ItemCard } from '@/components/ItemCard';
import { qualityVar } from '@/components/Tile';
// The builder's picker, drawn the same: a list on the left, the card on the right.
import styles from '@/components/ItemPicker.module.css';
import { useWikiStrings } from '../../i18n';
import { CALC, type SlotKind } from '../../i18n/calc';
import { collate } from '../../kit';
import { useBagIds } from './itemData';

/** As many rows as the partner drew, and the builder: a slot of hundreds is searched, not scrolled. */
const CAP = 200;

/**
 * Which items a slot of a kind takes — the partner wiki's rules.
 *
 * Runes only for the chosen hero's profession; souls, pets and neutral items
 * only in their own slots; bags only in the bag slot, and nothing of those in
 * the six main ones.
 */
export function slotFilter(kind: SlotKind, profession: string, bags: ReadonlySet<string>): (i: ItemFull) => boolean {
  const isPet = (i: ItemFull) => i.id.startsWith('item_pet_') && i.type === 'equip';
  switch (kind) {
    case 'rune':
      return (i) => i.type === 'gem' && (i.professions?.allowed === undefined || i.professions.allowed.includes(profession));
    case 'pet':
      return isPet;
    case 'bag':
      return (i) => i.type === 'equip' && bags.has(i.id);
    case 'soul':
      return (i) => i.isSoul === true;
    case 'neutral':
      return (i) => i.type === 'equip' && i.isNeutral === true;
    case 'slot':
      return (i) => i.flags.inGame === 1 && i.type === 'equip' && i.isSoul !== true && !isPet(i) && i.isNeutral !== true && !bags.has(i.id);
  }
}

export function CalcPicker({
  kind,
  profession,
  heroName,
  onSelect,
  onClose,
}: {
  /** Null keeps the dialog closed. */
  kind: SlotKind | null;
  profession: string;
  heroName: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const t = useWikiStrings(CALC).picker;
  const { core, lang } = useApp();
  const store = useItemDetailsStore();
  const bags = useBagIds();
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== null) store?.request();
    setQuery('');
    setFocusId(null);
  }, [kind, store]);

  const full = store?.full ?? null;

  // Items the index knows (so they have a name and an icon), filtered by the
  // slot, sorted by level, quality and name as the partner did.
  const { shown, total } = useMemo(() => {
    if (kind === null || full === null || core === null || bags === null) return { shown: [] as ItemSummary[], total: 0 };
    const fits = slotFilter(kind, profession, bags);
    const needle = query.trim().toLowerCase();
    const byName = collate(lang);
    const all = Object.values(full)
      .filter(fits)
      .map((i) => core.byId.get(i.id))
      .filter((s): s is ItemSummary => s !== undefined)
      .filter((s) => needle === '' || s.search.includes(needle))
      .sort((a, b) => a.level - b.level || a.quality - b.quality || byName(a.name, b.name));
    return { shown: all.slice(0, CAP), total: all.length };
  }, [kind, full, core, bags, profession, query, lang]);

  const focused = focusId === null ? undefined : core?.byId.get(focusId);
  const ready = full !== null && bags !== null;

  return (
    <Dialog
      wide
      open={kind !== null}
      onClose={onClose}
      title={kind === 'rune' ? t.runeFor(heroName) : kind !== null ? t.titles[kind] : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.close}
          </Button>
          <Button variant="primary" disabled={focused === undefined} onClick={() => focused && onSelect(focused.id)}>
            {t.choose}
          </Button>
        </>
      }
    >
      <div className={styles.shell}>
        <div className={styles.list}>
          <div className={styles.search}>
            <Icon.Search size={15} className={styles.searchIcon} />
            <Input
              className={styles.searchInput}
              type="search"
              value={query}
              placeholder={t.search}
              aria-label={t.search}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <p className={styles.count}>
            {!ready ? t.loading : total === 0 ? t.nothing : total > shown.length ? `${shown.length} / ${total}` : String(total)}
          </p>
          <div className={styles.rows}>
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cx(styles.row, item.id === focusId && styles.rowOn)}
                onClick={() => setFocusId(item.id)}
                onFocus={() => setFocusId(item.id)}
                onDoubleClick={() => onSelect(item.id)}
              >
                <img className={styles.rowIcon} src={iconUrl(item.icon)} alt="" loading="lazy" />
                <span className={styles.rowText}>
                  <span className={styles.rowName} style={{ color: qualityVar(item.quality) }}>
                    {item.name}
                  </span>
                  <span className={styles.rowMeta}>{t.meta(item.id, item.level, item.quality)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className={styles.pane}>
          {focused === undefined ? (
            <p className={styles.empty}>{kind !== null ? t.titles[kind] : ''}</p>
          ) : (
            <div className={styles.paneCard}>
              <ItemCard item={focused} />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
