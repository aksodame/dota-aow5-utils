import { Icon, cx } from '@/ui';
import { THEMES, type Theme } from '@/lib/theme';
import styles from './ThemeSwitcher.module.css';

/**
 * Both palettes side by side, the way `LanguageSwitcher` shows all three flags.
 *
 * Not a checkbox labelled "Dark mode". A switch has an implied off state, and
 * "off" for a theme is somebody else's default rather than a thing on the
 * screen — with two named buttons the page says what it is in now and what the
 * other one is called, which is the whole question being asked here.
 *
 * The labels are drawn rather than left to the icons, because a sun and a moon
 * are only obvious to somebody who already knows this control exists; the icon
 * is what makes the right one findable at a glance once they do.
 */
export function ThemeSwitcher({
  active,
  onSelect,
  label,
  labels,
}: {
  active: Theme;
  onSelect: (theme: Theme) => void;
  label: string;
  labels: Record<Theme, string>;
}) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          className={cx(styles.button, theme === active && styles.active)}
          onClick={() => onSelect(theme)}
          aria-pressed={theme === active}
        >
          {theme === 'dark' ? <Icon.Moon size={16} /> : <Icon.Sun size={16} />}
          {labels[theme]}
        </button>
      ))}
    </div>
  );
}
