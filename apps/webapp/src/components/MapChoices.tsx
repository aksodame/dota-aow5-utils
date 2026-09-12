import { memo, useMemo } from 'react';
import {
  categoryOfMap,
  listedMaps,
  mapImageUrl,
  tierShort,
  type MapSummary,
  type TierKey,
} from 'aow5-shared/data';
import { Icon, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import styles from './MapChoices.module.css';

/**
 * The rooms, as the portal's own art with a name over it.
 *
 * One component for the browse sidebar and the editor, for the same reason
 * `HeroChoices` is one: they are the same control. The editor used to offer a
 * `<select>` of names, which meant picking a room there and recognising one in
 * the filter were two different acts — and only one of them showed you the
 * place.
 *
 * The two differ in exactly one way, which is the prop: the filter selects any
 * number of rooms, a build names at most one. Both are handled by `selected`
 * being a set and `onToggle` deciding what a press means, so this file has no
 * opinion about which it is.
 */
export const MapChoices = memo(function MapChoices({
  selected,
  onToggle,
  tier,
  chosenFirst = false,
  label,
}: {
  /** Room ids currently chosen. A build passes at most one. */
  selected: readonly string[];
  onToggle: (mapId: string) => void;
  /**
   * Show only the rooms at this tier, or every room when undefined.
   *
   * The editor narrows to the chosen tier: a guide's room has to be one of that
   * tier's, and offering the other fifteen is offering a mistake the server
   * will refuse. The filter passes nothing and lists them all.
   */
  tier?: TierKey;
  /**
   * Float the chosen rooms to the top.
   *
   * The filter does; the editor does not. In the filter the list is longer than
   * the box it scrolls in, so a room ticked near the bottom is invisible from
   * the top — and the sidebar exists to say what the list below is showing. In
   * the editor there are at most a handful of rooms at one tier, all on screen,
   * and a tile that jumped to the top as you pressed it would move the next one
   * you were aiming at.
   */
  chosenFirst?: boolean;
  label?: string;
}) {
  const { core } = useApp();

  const chosen = useMemo(() => new Set(selected), [selected]);

  const maps = useMemo(() => {
    const all = listedMaps(core?.maps.maps ?? []);
    const offered = tier === undefined ? all : all.filter((map) => categoryOfMap(map) === tier);
    if (!chosenFirst) return offered;

    // A stable partition rather than a sort: the two halves keep the order the
    // game's own selection screen puts them in, so the list does not reshuffle
    // beyond the room that was just ticked moving up.
    return [...offered.filter((map) => chosen.has(map.id)), ...offered.filter((map) => !chosen.has(map.id))];
  }, [core, tier, chosenFirst, chosen]);

  return (
    <div className={styles.maps} role="group" aria-label={label}>
      {maps.map((map: MapSummary) => {
        const on = chosen.has(map.id);
        return (
          <button
            key={map.id}
            type="button"
            className={cx(styles.map, on && styles.mapOn)}
            onClick={() => onToggle(map.id)}
            aria-pressed={on}
          >
            {/* The portal's own painting. Rooms the addon ships no art for
                simply have none, and the row still reads. */}
            {map.image !== undefined && (
              <img className={styles.mapArt} src={mapImageUrl(map.image)} alt="" loading="lazy" />
            )}
            <span className={styles.mapScrim} />
            <span className={styles.mapBody}>
              <span className={styles.mapTier}>{tierShort(categoryOfMap(map))}</span>
              <span className={styles.mapName}>{map.name}</span>
            </span>
            {on && <Icon.Check size={15} className={styles.mapCheck} />}
          </button>
        );
      })}
    </div>
  );
});
