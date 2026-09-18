import { memo, useMemo } from 'react';
import { SEASON_KEYS, heroIconUrl, seasonHeroes, type SeasonKey } from 'aow5-shared/data';
import { Icon, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import styles from './HeroChoices.module.css';

/**
 * The playable roster, as portrait tiles with one of them chosen.
 *
 * Three across, each a third of the container at the portrait's own 16:9, so a
 * season's three heroes are one row. At a third of the sidebar a tile has no
 * room for a name, so the name is the tooltip and the image's `alt`; the tick on the
 * chosen one is the same as `MapChoices` draws.
 *
 * One component for the browse filter and the editor, because they are the same
 * control and were drifting: the editor's was a modal with a different tile
 * size and a different highlight, so picking a hero looked like a different
 * operation depending on which page you were on. It is not — it is "which of
 * these three" both times.
 *
 * Only heroes the addon has finished. Crystal Maiden occupies a roster slot
 * with nothing but the shared heal, so offering her hands somebody an empty
 * spell panel — see `HeroInfo.playable`. Her index in the frozen table stays
 * either way.
 *
 * And only heroes some season offers — the one chosen, or any of them when none
 * is. Seasons have their own pools (`seasons.ts` in `aow5-shared`), and a hero
 * offered here that the season does not have is a filter that finds nothing or
 * a build the server refuses to save.
 */
export const HeroChoices = memo(function HeroChoices({
  value,
  onPick,
  clearable = false,
  season,
}: {
  /** The chosen hero, or undefined for none. */
  value: string | undefined;
  onPick: (heroId: string | undefined) => void;
  /**
   * Whether pressing the chosen one clears it.
   *
   * True in the filter, where "any hero" is a real answer and the control is
   * its own undo. False in the editor, where a build with no hero is a build
   * with no spells — the way out of a hero there is choosing another one.
   */
  clearable?: boolean;
  /** The season whose pool to offer, in its own order. Undefined offers every season's, in roster order. */
  season?: SeasonKey | undefined;
}) {
  const { core, lang } = useApp();
  const heroes = useMemo(() => {
    const playable = (core?.heroes.heroes ?? []).filter((h) => h.playable);
    if (season !== undefined) {
      const byId = new Map(playable.map((h) => [h.id, h]));
      return seasonHeroes(season).flatMap((id) => byId.get(id) ?? []);
    }
    const offered = new Set(SEASON_KEYS.flatMap((key) => seasonHeroes(key)));
    return playable.filter((h) => offered.has(h.id));
  }, [core, season]);

  return (
    <div className={styles.heroes}>
      {heroes.map((hero) => {
        const active = value === hero.id;
        const name = hero.names[lang] ?? hero.short;
        return (
          <button
            key={hero.id}
            type="button"
            className={cx(styles.hero, active && styles.heroOn)}
            onClick={() => onPick(active && clearable ? undefined : hero.id)}
            aria-pressed={active}
            title={name}
          >
            <img className={styles.heroArt} src={heroIconUrl(hero.icon)} alt={name} loading="lazy" />
            {active && <Icon.Check size={13} className={styles.heroCheck} />}
          </button>
        );
      })}
    </div>
  );
});
