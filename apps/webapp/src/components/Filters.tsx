import { memo, useMemo } from 'react';
import type { BuildSort } from 'aow5-api-contract';
import { Button, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import {
  categoryOfMap,
  listedMaps,
  listedTiers,
  tierLabel,
  type MapSummary,
  type TierKey,
} from 'aow5-shared/data';
import { HeroChoices } from './HeroChoices';
import { MapChoices } from './MapChoices';
import styles from './Filters.module.css';

/**
 * The left sidebar: hero, tier, map, sort.
 *
 * **Tier is not a filter of its own.** A tier is a property of a room — the
 * game says "Lv. 6: Temple Depths", not "this build is tier 6" — so a tier chip
 * here selects every map at that tier rather than querying a separate column.
 * That is why there is one `maps` list in the state and no `tier`: two
 * independent facets over the same fact can disagree, and "tier 8 + Frost Rift"
 * is a query with no answer.
 *
 * **Memoised.** It sits beside a virtualised list that re-renders on every
 * frame of a scroll, and it is thirty-odd components — four portraits, nine
 * tier chips, sixteen map rows with their art. None of that has anything to do
 * with how far down the list somebody is. `value` is the filter state object
 * and `onChange` is a `useState` setter, so both keep their identity and the
 * default shallow compare works.
 */
export interface FilterState {
  hero?: string;
  /**
   * Tiers to include. Empty means every tier.
   *
   * `OR`ed with `maps` rather than intersected — see the note on the chips
   * below, and `BrowseFilters.tiers` on the server, which is the half that has
   * to agree.
   */
  tiers: TierKey[];
  /** Selected rooms. Empty means every room. */
  maps: string[];
  sort: BuildSort;
}

interface FiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

export const Filters = memo(function Filters({ value, onChange }: FiltersProps) {
  const { core, strings } = useApp();

  // The rooms the site offers, ordered as the game's own selection screen is.
  // Shared with the editor so the two cannot disagree about which exist.
  const maps = useMemo(() => listedMaps(core?.maps.maps ?? []), [core]);

  /** The rooms at each tier, for the chips that stand in front of them. */
  const roomsByTier = useMemo(() => {
    const groups = new Map<TierKey, MapSummary[]>();
    for (const map of maps) {
      const key = categoryOfMap(map);
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [map]);
      else group.push(map);
    }
    return groups;
  }, [maps]);

  /**
   * The tiers with rooms behind them.
   *
   * A chip for a tier that names nothing selects nothing and finds nothing,
   * which reads as a broken filter rather than as an empty one — see
   * `listedTiers`.
   */
  const tiers = useMemo(() => listedTiers(core?.maps.maps ?? []), [core]);

  const selected = useMemo(() => new Set(value.maps), [value.maps]);
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  /*
   * Ticking a room, and what that does to the tier above it.
   *
   * The two controls are one thing: a tier stands for its rooms *plus* the
   * guides filed under it that name no room. So ticking a tier ticks its rooms
   * with it, and unticking any one of those rooms releases the tier while
   * leaving the others — the tier is no longer wholly chosen, but the rooms you
   * did choose are still chosen. That is the behaviour asked for, and it is why
   * the two lists are `OR`ed rather than intersected on the way to the server.
   */
  const toggleMap = (id: string) => {
    const next = new Set(selected);
    const removing = next.has(id);
    if (removing) next.delete(id);
    else next.add(id);

    const map = maps.find((m) => m.id === id);
    const key = map === undefined ? undefined : categoryOfMap(map);
    let tiers = value.tiers;
    if (removing && key !== undefined) {
      tiers = tiers.filter((tier) => tier !== key);
    } else if (key !== undefined) {
      // Ticking the last missing room of a tier completes it, which is the
      // mirror of the rule above rather than a separate one.
      const rooms = roomsByTier.get(key) ?? [];
      if (rooms.every((room) => next.has(room.id)) && !tiers.includes(key)) tiers = [...tiers, key];
    }
    set({ maps: [...next], tiers });
  };

  /** Pressing a tier takes its rooms with it, in whichever direction. */
  const toggleTier = (key: TierKey) => {
    const on = value.tiers.includes(key);
    const rooms = roomsByTier.get(key) ?? [];
    const next = new Set(selected);
    for (const room of rooms) {
      if (on) next.delete(room.id);
      else next.add(room.id);
    }
    set({
      tiers: on ? value.tiers.filter((tier) => tier !== key) : [...value.tiers, key],
      maps: [...next],
    });
  };

  const isFiltered = value.hero !== undefined || value.tiers.length > 0 || value.maps.length > 0;

  return (
    <Panel
      className={styles.panel}
      title={strings.filters.heading}
      action={isFiltered ? <span className={styles.count}>{value.maps.length || ''}</span> : undefined}
    >
      <div className={styles.scroll}>
        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{strings.filters.hero}</span>
          </div>
          {/*
            Two per row, so a portrait is big enough to recognise. `clearable`,
            because "any hero" is a real answer here — pressing the chosen one
            releases it, which is what saves a separate "any" tile to aim at.
          */}
          <HeroChoices value={value.hero} onPick={(hero) => set({ hero })} clearable />
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{strings.filters.tier}</span>
          </div>
          {/*
            A tier and its rooms are one control — see `toggleMap`. The middle
            state is real and worth drawing: some of a tier's rooms chosen but
            not the tier itself means "these rooms", where a lit chip means
            "this tier, including the guides that name no room at all".
          */}
          <div className={styles.tiers}>
            {tiers.map((key) => {
              const rooms = roomsByTier.get(key) ?? [];
              const on = value.tiers.includes(key);
              const some = !on && rooms.some((room) => selected.has(room.id));
              return (
                <button
                  key={key}
                  type="button"
                  className={cx(styles.tier, on && styles.tierOn, some && styles.tierSome)}
                  onClick={() => toggleTier(key)}
                  aria-pressed={on}
                  title={key === 'event' ? strings.build.event : `${strings.filters.tier} ${key}`}
                >
                  {/* The word, not the letter: a chip wide enough for
                      "Event" can afford to say it, and "E" is a letter
                      somebody has to be taught. */}
                  {tierLabel(key, strings.build.event)}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{strings.filters.map}</span>
          </div>
          {/*
            Chosen rooms first. The list is taller than the box it sits in, so
            without this a room ticked at the bottom is a tick nobody can see
            from the top — and the sidebar's whole job is saying what the list
            below is currently showing.
          */}
          <MapChoices selected={value.maps} onToggle={toggleMap} label={strings.filters.map} chosenFirst />
        </div>

        <div className={styles.group}>
          <div className={styles.groupHead}>
            <span>{strings.filters.sort}</span>
          </div>
          <div className={styles.sorts} role="radiogroup" aria-label={strings.filters.sort}>
            {(
              [
                ['top', strings.filters.sortTop],
                ['new', strings.filters.sortNew],
                ['discussed', strings.filters.sortDiscussed],
                /*
                 * Price, both ways round, as two sorts rather than a min/max
                 * pair of boxes. "What can I build with what I have" is
                 * answered by putting the cheap ones first far better than by
                 * guessing a number to type in — and a range needs the reader
                 * to already know what a build in this game costs.
                 */
                ['cheap', strings.filters.sortCheap],
                ['costly', strings.filters.sortCostly],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className={cx(styles.sort, value.sort === id && styles.sortActive)}>
                <input type="radio" name="sort" value={id} checked={value.sort === id} onChange={() => set({ sort: id })} />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/*
        Always drawn, disabled when there is nothing to clear.

        It used to appear only once a filter was set, which meant the panel
        changed height as you selected things and the button arrived under the
        cursor that had just moved past where it would be.
      */}
      <div className={styles.footer}>
        <Button
          variant="ghost"
          size="sm"
          block
          disabled={!isFiltered}
          onClick={() => onChange({ tiers: [], maps: [], sort: value.sort })}
        >
          {strings.filters.clear}
        </Button>
      </div>
    </Panel>
  );
});
