import { memo, useMemo } from 'react';
import { heroIconUrl } from 'aow5-shared/data';
import { cx } from '@/ui';
import { useApp } from '@/data/AppData';
import styles from './HeroChoices.module.css';

/**
 * The playable roster, as a wrapping row of portraits with one of them chosen.
 *
 * One component for the browse filter and the editor, because they are the same
 * control and were drifting: the editor's was a modal with a different tile
 * size and a different highlight, so picking a hero looked like a different
 * operation depending on which page you were on. It is not — it is "which of
 * these four" both times.
 *
 * Only heroes the addon has finished. Crystal Maiden occupies a roster slot
 * with nothing but the shared heal, so offering her hands somebody an empty
 * spell panel — see `HeroInfo.playable`. Her index in the frozen table stays
 * either way.
 */
export const HeroChoices = memo(function HeroChoices({
  value,
  onPick,
  clearable = false,
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
}) {
  const { core, lang } = useApp();
  const heroes = useMemo(() => (core?.heroes.heroes ?? []).filter((h) => h.playable), [core]);

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
            <img src={heroIconUrl(hero.icon)} alt={name} loading="lazy" />
          </button>
        );
      })}
    </div>
  );
});
