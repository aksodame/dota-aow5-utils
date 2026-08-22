import type { CSSProperties, ReactNode } from 'react';
import { iconUrl } from 'aow5-shared/data';
import { qualityColor } from '@/components/ItemIcon';
import { PREVIEW_LOOT } from '@/data/showcase';
import type { Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { cn } from '@/lib/utils';
import {
  ChevronUpGlyph,
  ClockGlyph,
  CloseGlyph,
  CoinGlyph,
  GripGlyph,
  HistoryGlyph,
  HourglassGlyph,
  MapGlyph,
  RestartGlyph,
  SettingsGlyph,
  TrophyGlyph,
} from './glyphs';

/**
 * The farm overlay, as it actually draws itself.
 *
 * The tracker is a separate app and this one may not import from it — that is
 * the workspace rule, and it is the rule that keeps `aow5-shared` honest about
 * what is genuinely shared. So this is a re-creation, and the way it stays
 * truthful is by being built from the same specifics rather than from memory:
 *
 * - the panel is `hud-panel` — the card colour at 82%, a hairline border and a
 *   deep shadow. The real one also blurs what is behind it; this one does not,
 *   because a `backdrop-filter` recomposites on every scroll frame and there
 *   is no game behind this copy for it to reveal;
 * - the palette is the overlay's own dark set, pinned below, because the
 *   overlay has no light mode: it sits over Dota, not over a page;
 * - the header is grip, title, chrome — and while the window is click-through
 *   that row is given to the state line instead, which is where the room name
 *   and the run count live;
 * - the readout is three cards, not five. Run clock, gold per hour, and time
 *   actually spent inside rooms — the denominator of the rate between them.
 *
 * If the overlay changes, this goes stale. That is the honest cost of showing
 * one app inside another, and it is cheaper than the alternative, which is a
 * screenshot that is stale *and* untranslated *and* wrong in one of the themes.
 */

/** The tracker's `:root`, verbatim. Scoped here rather than global. */
const OVERLAY_PALETTE: CSSProperties = {
  '--card': 'oklch(0.19 0.014 260)',
  '--fg': 'oklch(0.97 0.003 260)',
  '--muted-fg': 'oklch(0.72 0.02 260)',
  '--line': 'oklch(1 0 0 / 12%)',
  '--accent-gold': 'oklch(0.82 0.14 85)',
} as CSSProperties;

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function StatCard({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md bg-black/25 px-2 py-1">
      <span className="truncate text-[0.625rem] tracking-wide uppercase" style={{ color: 'var(--muted-fg)' }}>
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0" style={{ color: 'var(--muted-fg)' }}>
          {icon}
        </span>
        <span className="min-w-0 truncate font-semibold tabular-nums" style={{ color: 'var(--accent-gold)' }}>
          {value}
        </span>
      </span>
    </div>
  );
}

/** The three cards, which are the whole panel when it is collapsed. */
function Cards({ site }: { site: SiteStrings }) {
  const t = site.preview;
  return (
    <div className="flex gap-1.5">
      <StatCard icon={<ClockGlyph />} value="1:12" label={t.run} />
      <StatCard icon={<CoinGlyph />} value={compact(38400)} label={t.goldPerHour} />
      <StatCard icon={<HourglassGlyph />} value="42:08" label={t.session} />
    </div>
  );
}

/** Where you are, on the row the chrome leaves empty while you are playing. */
function StateLine({ site }: { site: SiteStrings }) {
  const t = site.preview;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-black/25 px-2 py-0.5">
      <MapGlyph className="text-[color:var(--muted-fg)]" />
      <span className="min-w-0 truncate text-[0.6875rem]">
        <span style={{ color: 'var(--muted-fg)' }}>{t.at} </span>
        <span className="font-semibold">{t.room}</span>
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-1 text-[0.6875rem] tabular-nums">
        <TrophyGlyph className="text-[color:var(--muted-fg)]" />
        <span className="font-semibold">14</span>
      </span>
    </div>
  );
}

const COL_QTY = 'w-7 shrink-0 text-right';
const COL_EACH = 'w-9 shrink-0 text-right';
const COL_TOTAL = 'w-12 shrink-0 text-right';

function Loot({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const t = site.preview;
  const rows = PREVIEW_LOOT.map((row) => ({ ...row, total: row.item.cost * row.qty }));

  return (
    <>
      <div className="pe-2 text-[0.625rem] tracking-wide uppercase" style={{ color: 'var(--muted-fg)' }}>
        <div className="flex items-center gap-2 border-b px-1 pb-1" style={{ borderColor: 'var(--line)' }}>
          <span className="min-w-0 flex-1">{t.colItem}</span>
          <span className="flex shrink-0 items-center gap-1">
            <span className={COL_QTY} />
            <span className={COL_EACH}>{t.colValue}</span>
            <span className={COL_TOTAL}>{t.colTotal}</span>
          </span>
        </div>
      </div>

      <ul className="pe-2">
        {rows.map((row) => (
          <li key={row.item.id} className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03]">
            <img
              src={iconUrl(row.item.icon)}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-6 shrink-0 rounded-sm object-cover"
            />
            <span
              className="min-w-0 flex-1 truncate text-xs font-semibold"
              style={{ color: qualityColor(row.item.quality) }}
            >
              {row.item.name[lang]}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className={cn(COL_QTY, 'text-[0.5rem] font-medium tabular-nums')}>×{row.qty}</span>
              <span className={cn(COL_EACH, 'text-[0.5rem] tabular-nums')} style={{ color: 'var(--muted-fg)' }}>
                {compact(row.item.cost)}
              </span>
              <span
                className={cn(COL_TOTAL, 'text-xs font-semibold tabular-nums')}
                style={{ color: 'var(--accent-gold)' }}
              >
                {compact(row.total)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Panel({
  site,
  lang,
  collapsed,
  className,
}: {
  site: SiteStrings;
  lang: Lang;
  collapsed: boolean;
  className?: string;
}) {
  return (
    <div
      style={{
        ...OVERLAY_PALETTE,
        background: 'color-mix(in oklab, var(--card) 82%, transparent)',
        color: 'var(--fg)',
        borderColor: 'var(--line)',
      }}
      className={cn(
        'flex flex-col gap-2 rounded-[0.625rem] border p-2 text-sm shadow-[0_8px_28px_oklch(0_0_0/45%)]',
        collapsed && 'gap-0 py-1',
        className,
      )}
    >
      {collapsed ? (
        // Collapsed is the state the overlay spends the evening in: the state
        // line and the three cards, and nothing that needs a click.
        <>
          <div className="flex items-center gap-1 pb-1">
            <StateLine site={site} />
          </div>
          <Cards site={site} />
        </>
      ) : (
        <>
          {/* Expanded and interactive: the chrome takes the row back. */}
          <header className="flex shrink-0 items-center gap-1">
            <GripGlyph className="text-[color:var(--muted-fg)]" />
            <span className="min-w-0 flex-1 truncate text-[0.6875rem]">farm</span>
            <div className="flex shrink-0 items-center gap-0.5" style={{ color: 'var(--muted-fg)' }}>
              <ChevronUpGlyph />
              <RestartGlyph />
              <HistoryGlyph />
              <SettingsGlyph />
              <CloseGlyph />
            </div>
          </header>

          <Cards site={site} />
          <Loot site={site} lang={lang} />

          <footer
            className="flex shrink-0 items-center gap-1 text-[0.625rem]"
            style={{ color: 'var(--muted-fg)' }}
          >
            {site.preview.hotkeyHint}
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * Both states, over a stand-in for the game.
 *
 * The backdrop is an abstract wash rather than a screenshot: the point it has
 * to make is that the panel is translucent and floats, and borrowing Valve's
 * art to make it would be taking more than this page needs.
 */
export function HudPreview({ site, lang, className }: { site: SiteStrings; lang: Lang; className?: string }) {
  return (
    <figure aria-hidden="true" className={cn('w-full max-w-md select-none', className)}>
      <div className="relative overflow-hidden rounded-xl border bg-[radial-gradient(120%_120%_at_20%_0%,oklch(0.32_0.06_255),oklch(0.14_0.02_265)_60%,oklch(0.1_0.015_270))] p-4 shadow-lg">
        <div className="flex flex-col items-end gap-3">
          <Panel site={site} lang={lang} collapsed={false} className="w-full max-w-[19rem]" />
          <Panel site={site} lang={lang} collapsed className="w-full max-w-[19rem]" />
        </div>
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">{site.preview.trackerCaption}</figcaption>
    </figure>
  );
}
