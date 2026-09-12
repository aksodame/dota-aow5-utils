import { useId } from 'react';
import { LANGS, LANG_LABEL, type Lang } from '@/i18n/strings';
import { cx } from '@/ui';
import styles from './LanguageSwitcher.module.css';

/**
 * All three languages side by side rather than behind a dropdown.
 *
 * With three options a menu costs an extra click just to see what is available,
 * and the flags are recognisable at a glance in a way a `<select>` showing one
 * language name is not.
 *
 * The flags are decorative, so each button carries the language name as its
 * accessible name and `aria-pressed` conveys the active one — the outline alone
 * would say nothing to a screen reader.
 */
export function LanguageSwitcher({ active, onSelect, label }: { active: Lang; onSelect: (lang: Lang) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          className={cx(styles.button, lang === active && styles.active)}
          onClick={() => onSelect(lang)}
          aria-pressed={lang === active}
          aria-label={LANG_LABEL[lang]}
          title={LANG_LABEL[lang]}
        >
          <LanguageFlag lang={lang} />
        </button>
      ))}
    </div>
  );
}

/**
 * Flags as inline SVG rather than emoji.
 *
 * Windows ships no glyphs for regional-indicator pairs — Segoe UI Emoji simply
 * has no flags — so `🇬🇧` renders there as the letters "GB". Drawing them
 * avoids depending on the platform's emoji font at all, for a few hundred bytes
 * and no network request.
 */
function LanguageFlag({ lang }: { lang: Lang }) {
  if (lang === 'ru') return <RussiaFlag />;
  if (lang === 'zh') return <ChinaFlag />;
  return <UnionJack />;
}

function RussiaFlag() {
  return (
    <svg viewBox="0 0 9 6" className={styles.flag} aria-hidden focusable="false">
      <rect width="9" height="6" fill="#fff" />
      <rect y="2" width="9" height="4" fill="#0039a6" />
      <rect y="4" width="9" height="2" fill="#d52b1e" />
    </svg>
  );
}

function ChinaFlag() {
  // One big star and four small ones, each tilted to point at it. At 20px wide
  // the tilt is invisible, but a flag drawn without it looks wrong the moment
  // somebody zooms — so the points are computed rather than eyeballed.
  const star = (cx: number, cy: number, r: number, angle: number) => {
    const points: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      // Every second point of a five-pointed star sits on an inner circle;
      // stepping by 4/5 of a turn walks the outer points in drawing order.
      const outer = angle + (i * 4 * Math.PI) / 5;
      points.push(`${cx + r * Math.sin(outer)},${cy - r * Math.cos(outer)}`);
    }
    return points.join(' ');
  };

  return (
    <svg viewBox="0 0 30 20" className={styles.flag} aria-hidden focusable="false">
      <rect width="30" height="20" fill="#de2910" />
      <g fill="#ffde00">
        <polygon points={star(5, 5, 3, 0)} />
        <polygon points={star(10, 2, 1, 0.35)} />
        <polygon points={star(12, 4, 1, 0.75)} />
        <polygon points={star(12, 7, 1, 1.05)} />
        <polygon points={star(10, 9, 1, 1.4)} />
      </g>
    </svg>
  );
}

function UnionJack() {
  // The clip keeps the red diagonals counterchanged; the id must be unique per
  // instance or a second flag on the page reuses the first one's clip path.
  const clipId = useId();
  return (
    <svg viewBox="0 0 60 30" className={styles.flag} aria-hidden focusable="false">
      <clipPath id={clipId}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clipId})`} stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  );
}
