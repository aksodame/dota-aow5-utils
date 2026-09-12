import { iconUrl } from 'aow5-shared/data';
import {
  PREVIEW_HOTKEY,
  PREVIEW_ROOM,
  PREVIEW_ROOM_SECONDS,
  PREVIEW_RUNS,
  PREVIEW_SESSION_SECONDS,
  clock,
  compact,
  previewReadout,
  type PreviewReadout,
  type PreviewRow,
} from 'aow5-shared/overlay';
import { Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import type { Strings } from '@/i18n/strings';
import * as G from './HudGlyphs';
import styles from './HudPreview.module.css';

/**
 * The farm overlay, as it actually draws itself.
 *
 * The tracker is a separate app in a separate workspace package and this one
 * may not import from it — that is the rule the root README states, and it is
 * the rule that keeps `aow5-shared` honest about what is genuinely shared. So
 * this is a re-creation, and the way it stays truthful is by being built from
 * the same specifics rather than from memory:
 *
 * - the skin is **Torchlight**, which is `apps/tracker/src/overlays/farm/
 *   layouts/TorchlightHud.tsx` plus the `:root[data-style='torchlight']` token
 *   block in that app's `styles.css`. Both are transcribed here — the palette
 *   into `HudPreview.module.css`, the arrangement into the JSX below;
 * - the cards are the six a fresh profile has on (`DEFAULT_CARDS`), slotted the
 *   way `arrange()` slots them: the session's best drop takes the headline, the
 *   session clock and the session's gold become the two pairs beside it, and
 *   the room's time, the room's gold and the average room fill the band;
 * - the chrome is the shell's, current as of the second row of buttons — the
 *   title line while the panel is clickable, the room line while it is not;
 * - the palette is pinned rather than themed, rarity included, because the
 *   overlay has no light mode. It sits over Dota, not over a page.
 *
 * **Two panels, because the overlay has two states and only one of them is what
 * you see while playing.** The top one is the panel with the hotkey pressed:
 * expanded, ringed, its chrome taking the title row. The bottom one is the
 * evening — collapsed, click-through, the room line where the buttons were. One
 * picture of either alone answers half the question.
 *
 * If the overlay changes, this goes stale. That is the honest cost of showing
 * one app inside another, and it is cheaper than the alternative, which is a
 * screenshot that is stale *and* untranslated *and* wrong in one of the themes.
 */

/**
 * The rarity tint, off the overlay's own ramp rather than the page's.
 *
 * `qualityVar` in `Tile.tsx` resolves `--q4` against the site, which is right
 * for everything the site draws and wrong here: the tracker carries its own
 * eight values and is always dark, so a purple in this figure is the purple a
 * player sees over the game. The two ramps are close but not equal, and the
 * one this figure is a picture of is the tracker's.
 */
const hudQualityVar = (quality: number): string => {
  const q = Number.isInteger(quality) && quality >= 1 && quality <= 7 ? quality : 1;
  return `var(--hud-q${q})`;
};

export function HudPreview() {
  const { strings, core } = useApp();
  const t = strings.tracker.preview;

  /*
   * Nothing to draw until the item table is in.
   *
   * The names, the art and the prices are all the extracted data's, and the
   * alternative to waiting is a panel of placeholder rows — which is a picture
   * of an overlay that does not exist. `AppData` has this within a fetch of the
   * page opening, and the rail beside it is what somebody reads first anyway.
   */
  if (core === null) return null;

  const room = core.maps.byId.get(PREVIEW_ROOM)?.name ?? '';
  /*
   * Every figure comes off the shared session, which is also what the API draws
   * this page's `og:image` card from — see `aow5-shared/overlay`. That is the
   * whole reason the loot table is not a constant in this file: the card is the
   * promise and this page is what is delivered, and the two quoting different
   * gold would be the card lying about a screenshot.
   */
  const readout = previewReadout((id) => core.byId.get(id));

  return (
    <Panel title={t.title}>
      <figure className={styles.figure}>
        {/*
          A stand-in for the game rather than a screenshot of it. The point this
          backdrop has to make is that the panel is translucent and floats, and
          borrowing Valve's art to make it would be taking more than this page
          needs.

          Hidden from screen readers: it is a picture, and every word in it is
          the overlay's own furniture repeated. The caption below is not hidden,
          because that is the part that says what is being shown.
        */}
        <div className={styles.stage} aria-hidden="true">
          {/* Expanded, and with the hotkey pressed: the ring is the overlay
              saying it has the mouse, and the chrome has the title row. */}
          <div className={cx(styles.panel, styles.focused)}>
            <header className={styles.chrome}>
              <div className={styles.titleRow}>
                <G.Grip className={styles.glyph} />
                <span className={styles.title}>
                  {t.brand} <span className={styles.titleDim}>{t.window}</span>
                </span>
              </div>
              {/*
                Seven buttons on a row of their own, under the title rather than
                crowded against it — the shell moved them down when the skull
                arrived, because seven icons and a window name do not fit side
                by side and a mis-aimed click on the cross costs the session.
              */}
              <div className={styles.buttons}>
                <G.ChevronUp className={styles.glyph} />
                <G.Pause className={styles.glyph} />
                <G.Restart className={styles.glyph} />
                <G.Skull className={styles.glyph} />
                <G.History className={styles.glyph} />
                <G.Settings className={styles.glyph} />
                <G.Close className={styles.glyph} />
              </div>
            </header>

            <Readout t={t} readout={readout} />

            <Loot t={t} rows={readout.rows} roomGold={readout.roomGold} />

            {/* The one line that may end up drawn straight onto the game, so
                it is outlined rather than trusted to the slab behind it. It
                answers whichever question is live: the panel is clickable, and
                nothing else on screen says how to give the mouse back. */}
            <footer className={styles.hint}>{t.pinHint(PREVIEW_HOTKEY)}</footer>
          </div>

          {/* Collapsed and click-through, which is the state it spends the
              evening in: the room line where the buttons were, the same
              readout, and nothing that needs a click. */}
          <div className={cx(styles.panel, styles.collapsedPanel)}>
            <div className={styles.stateLine}>
              <G.MapPin className={styles.glyph} />
              <span className={styles.room}>
                <span className={styles.roomAt}>{t.at}</span>
                <span className={styles.roomName}>{room}</span>
              </span>
              <span className={styles.runs}>
                <G.Trophy className={styles.glyph} />
                <span className={styles.runsCount}>{PREVIEW_RUNS}</span>
              </span>
            </div>

            <Readout t={t} readout={readout} />
          </div>
        </div>

        <figcaption className={styles.caption}>{t.caption}</figcaption>
      </figure>
    </Panel>
  );
}

type PreviewStrings = Strings['tracker']['preview'];

/**
 * The readout, which is the whole panel when it is collapsed.
 *
 * One frame with every division inside it a hairline, and no gaps at all: that
 * is the single thing about this layout a row of cards cannot imitate, and it
 * is what makes the block read as one instrument with several dials rather than
 * as five widgets that happen to be adjacent.
 */
function Readout({ t, readout }: { t: PreviewStrings; readout: PreviewReadout }) {
  const { best, sessionGold, roomGold, averageRunGold } = readout;
  return (
    <div className={styles.grid}>
      <div className={styles.top}>
        <div className={styles.headlineCell}>
          <div className={styles.headlineHead}>
            {/* The dot earns its pixel: it marks which of the labels on the
                panel belongs to the headline, in a skin where every label is
                the same size. */}
            <span className={styles.heading}>
              <span className={styles.dot} />
              {t.cards.sessionBest}
            </span>
            {/* The item, on the heading's line rather than under the number: a
                third line here would make this cell taller than the band below
                it, and the point of the arrangement is that it is short. */}
            {best !== null && (
              <span className={styles.headlineItem} style={{ color: hudQualityVar(best.item.quality) }}>
                {best.item.name}
              </span>
            )}
          </div>
          <div className={styles.headlineRow}>
            {/* Three times a card's icon, and for the best drop it is the
                item's own art — at this size it is the fastest thing on the
                panel to read. You know what dropped before the number beside
                it. */}
            <span className={styles.headlineIcon}>
              {best !== null && <img src={iconUrl(best.item.icon)} alt="" loading="lazy" decoding="async" />}
            </span>
            <span className={styles.headline}>{best === null ? '—' : compact(best.total)}</span>
            {best !== null && <span className={styles.trailing}>{`(×${best.qty})`}</span>}
          </div>
        </div>

        {/* Label left, value right, on one line — the opposite of every other
            figure here, which stacks them. These two sit in a column narrow
            enough that stacking would make the block taller than the headline
            it is meant to sit quietly beside. */}
        <div className={styles.pairs}>
          <Pair label={t.cards.session} value={clock(PREVIEW_SESSION_SECONDS)} />
          <Pair label={t.cards.sessionGold} value={compact(sessionGold)} />
        </div>
      </div>

      {/* Equal widths, because none of the three outranks the others. */}
      <div className={styles.band}>
        <Cell label={t.cards.mapTime} value={clock(PREVIEW_ROOM_SECONDS)} first />
        <Cell label={t.cards.mapGold} value={compact(roomGold)} />
        <Cell label={t.cards.mapGoldAverage} value={compact(averageRunGold)} />
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <span className={styles.pair}>
      <span className={styles.label}>{label}</span>
      <span className={styles.pairValue}>{value}</span>
    </span>
  );
}

function Cell({ label, value, first = false }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={cx(styles.cell, !first && styles.ruleStart)}>
      <span className={styles.label}>{label}</span>
      <span className={styles.cellValue}>{value}</span>
    </div>
  );
}

/**
 * What you picked up in the room you are standing in.
 *
 * The room's worth sits against the heading rather than across the row from it:
 * the figure belongs *to* the word — it is what this list adds up to — and
 * parked at the far end it reads as a fourth column of the table instead.
 *
 * The three columns sort in the real panel, and the arrow marks the one in
 * force. Total descending is where it opens, so that is the column wearing it
 * here.
 */
function Loot({ t, rows, roomGold }: { t: PreviewStrings; rows: readonly PreviewRow[]; roomGold: number }) {
  return (
    <div className={styles.loot}>
      <div className={styles.lootHead}>
        <span className={styles.lootName}>{t.columns.name}</span>
        <span className={styles.lootTotal}>{compact(roomGold)}</span>
        <span className={styles.spacer} />
        <span className={styles.numbers}>
          <span className={styles.colQty} />
          <span className={styles.colUnit}>{t.columns.unit}</span>
          <span className={cx(styles.colTotal, styles.sorted)}>
            {t.columns.total}
            <G.ChevronDown className={styles.sortArrow} />
          </span>
        </span>
      </div>

      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.item.id} className={styles.row}>
            <img className={styles.rowArt} src={iconUrl(row.item.icon)} alt="" loading="lazy" decoding="async" />
            <span className={styles.rowName} style={{ color: hudQualityVar(row.item.quality) }}>
              {row.item.name}
            </span>
            <span className={styles.numbers}>
              <span className={cx(styles.colQty, styles.qty)}>×{row.qty}</span>
              <span className={cx(styles.colUnit, styles.unit)}>{compact(row.unit)}</span>
              <span className={cx(styles.colTotal, styles.total)}>{compact(row.total)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
