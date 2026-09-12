import { iconUrl, type ItemSummary } from 'aow5-shared/data';
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
 * The room the session is in, and the one these materials drop in.
 *
 * A real id, so the name comes out of the same map table the rest of the site
 * reads and is the same string the overlay's own room line would print — see
 * `apps/tracker/data/rooms.json`, where `G001` is the same three names.
 */
const ROOM_ID = 'G001';

/** What the focus chord is on a fresh profile — `DEFAULT_SHORTCUTS`, spelled the way the overlay spells it. */
const HOTKEY = 'Ctrl+Alt+T';

/**
 * The evening this is a picture of.
 *
 * `finished` is what the twelve rooms behind you gave; `room` is what the one
 * you are standing in has dropped so far. Every figure on the panel is then
 * arithmetic off this table rather than a number typed in to look right: the
 * session is the two columns added, the room is the second, and the average is
 * the first divided by the rooms it came from.
 *
 * The ids and the prices are the game's — the names, the rarity tints, the art
 * and the unit costs all come out of `items.index.json` at the reader's
 * language. Only the quantities are invented, and they are what an evening in
 * Skyfall Realm looks like.
 */
const LOOT: { id: string; finished: number; room: number }[] = [
  { id: 'item_0588', finished: 17, room: 3 }, // Skyfall Crystal, 2,500g
  { id: 'item_0587', finished: 41, room: 11 }, // Skyfall Fragment, 800g
  { id: 'item_G001_2', finished: 7, room: 2 }, // Glyph: Assault II, 600g
  { id: 'item_P001', finished: 32, room: 6 }, // Health Potion, 120g
];

/** Rooms finished, which is the trophy on the room line and the average's denominator. */
const RUNS = 12;

/** Seconds since the session started, hideout included. */
const SESSION_SECONDS = 42 * 60 + 8;

/** Seconds in the room you are standing in. */
const ROOM_SECONDS = 72;

/*
 * The overlay's two formatters, re-created for the same reason the layout is.
 *
 * Not `formatGold` from `aow5-shared/format`, which is the site's: that one
 * truncates and writes a lowercase `m`, because a price is a number somebody
 * is deciding whether they can afford and rounding it up tells them a build is
 * cheaper to reach than it is. The overlay rounds and writes `M`, because a
 * gold-per-hour readout is a rate rather than a claim about a wallet. A picture
 * of the overlay has to abbreviate the way the overlay does, or the figures in
 * it are figures the app would never print.
 */
const compact = (n: number): string => {
  const scaled = (by: number, suffix: string) => `${(n / by).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  if (Math.abs(n) >= 1_000_000) return scaled(1_000_000, 'M');
  if (Math.abs(n) >= 1_000) return scaled(1_000, 'k');
  return n.toFixed(0);
};

/** Seconds as `mm:ss`, growing to `h:mm:ss` only when there are hours to show. */
const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return h > 0
    ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

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

/** One row of the loot list, priced and named. */
interface Row {
  item: ItemSummary;
  qty: number;
  unit: number;
  total: number;
}

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

  const room = core.maps.byId.get(ROOM_ID)?.name ?? '';

  const priced = LOOT.map(({ id, finished, room: inRoom }) => {
    const item = core.byId.get(id);
    return item === undefined ? null : { item, finished, inRoom };
  }).filter((entry): entry is { item: ItemSummary; finished: number; inRoom: number } => entry !== null);

  // Total descending, which is the sort the readout opens on.
  const rows: Row[] = priced
    .map(({ item, inRoom }) => ({ item, qty: inRoom, unit: item.cost, total: item.cost * inRoom }))
    .filter((row) => row.qty > 0)
    .sort((a, b) => b.total - a.total);

  const roomGold = rows.reduce((n, row) => n + row.total, 0);
  const finishedGold = priced.reduce((n, { item, finished }) => n + item.cost * finished, 0);
  const sessionGold = finishedGold + roomGold;

  // The single item that carried the evening, by what the pile is worth rather
  // than how big it is — which is the figure the headline is built around.
  const best = priced
    .map(({ item, finished, inRoom }) => ({ item, qty: finished + inRoom, total: item.cost * (finished + inRoom) }))
    .reduce((top, pile) => (top === null || pile.total > top.total ? pile : top), null as
      | { item: ItemSummary; qty: number; total: number }
      | null);

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

            <Readout t={t} best={best} sessionGold={sessionGold} roomGold={roomGold} average={finishedGold / RUNS} />

            <Loot t={t} rows={rows} roomGold={roomGold} />

            {/* The one line that may end up drawn straight onto the game, so
                it is outlined rather than trusted to the slab behind it. It
                answers whichever question is live: the panel is clickable, and
                nothing else on screen says how to give the mouse back. */}
            <footer className={styles.hint}>{t.pinHint(HOTKEY)}</footer>
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
                <span className={styles.runsCount}>{RUNS}</span>
              </span>
            </div>

            <Readout t={t} best={best} sessionGold={sessionGold} roomGold={roomGold} average={finishedGold / RUNS} />
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
function Readout({
  t,
  best,
  sessionGold,
  roomGold,
  average,
}: {
  t: PreviewStrings;
  best: { item: ItemSummary; qty: number; total: number } | null;
  sessionGold: number;
  roomGold: number;
  average: number;
}) {
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
          <Pair label={t.cards.session} value={clock(SESSION_SECONDS)} />
          <Pair label={t.cards.sessionGold} value={compact(sessionGold)} />
        </div>
      </div>

      {/* Equal widths, because none of the three outranks the others. */}
      <div className={styles.band}>
        <Cell label={t.cards.mapTime} value={clock(ROOM_SECONDS)} first />
        <Cell label={t.cards.mapGold} value={compact(roomGold)} />
        <Cell label={t.cards.mapGoldAverage} value={compact(average)} />
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
function Loot({ t, rows, roomGold }: { t: PreviewStrings; rows: Row[]; roomGold: number }) {
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
