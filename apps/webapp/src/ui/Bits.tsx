import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx.ts';
import styles from './Bits.module.css';

/**
 * The small pieces: avatar, badge, tab, spinner, notice, tooltip.
 *
 * One file because each is a dozen lines and they share a stylesheet; splitting
 * them into six modules would be six imports to express the same thing.
 */

interface AvatarProps {
  /** A Steam avatar URL, or '' when they have none. */
  src?: string;
  /** Falls back to their initial, which is at least distinguishable. */
  name: string;
  size?: number;
}

export function Avatar({ src, name, size = 28 }: AvatarProps) {
  const initial = [...name.trim()][0] ?? '?';
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {src !== undefined && src !== '' ? (
        // Steam serves these; `alt` is empty because the name is always
        // rendered next to it and a screen reader should not hear it twice.
        <img src={src} alt="" width={size} height={size} loading="lazy" />
      ) : (
        initial
      )}
    </span>
  );
}

type BadgeTone = 'default' | 'tier' | 'draft';

export function Badge({
  tone = 'default',
  /**
   * For a badge that sits inside a line of text rather than beside it.
   *
   * The "unverified" mark next to a nickname is the case: at the full height it
   * pushes the line apart and reads as the loudest thing in a row it is meant
   * to be a footnote in.
   */
  small = false,
  className,
  ...rest
}: ComponentProps<'span'> & { tone?: BadgeTone; small?: boolean }) {
  return (
    <span
      className={cx(
        styles.badge,
        tone === 'tier' && styles.badgeTier,
        tone === 'draft' && styles.badgeDraft,
        small && styles.badgeSm,
        className,
      )}
      {...rest}
    />
  );
}

export function Tabs({ className, ...rest }: ComponentProps<'nav'>) {
  return <nav className={cx(styles.tabs, className)} {...rest} />;
}

/**
 * One tab. An anchor, because every tab on this site is a route.
 *
 * `aria-current="page"` rather than only a class, so the active tab is
 * announced as such rather than merely looking different.
 */
export function Tab({ active = false, className, ...rest }: ComponentProps<'a'> & { active?: boolean }) {
  return (
    <a
      className={cx(styles.tab, active && styles.tabActive, className)}
      aria-current={active ? 'page' : undefined}
      {...rest}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className={styles.spinner} role="status" aria-label={label ?? 'Loading'} />
  );
}

/** A spinner with room around it, for a panel that has nothing in it yet. */
export function Loading({ label }: { label?: string }) {
  return (
    <div className={styles.centered}>
      <Spinner {...(label !== undefined ? { label } : {})} />
    </div>
  );
}

interface NoticeProps {
  title: ReactNode;
  children?: ReactNode;
  tone?: 'default' | 'error' | 'warn' | 'success';
}

/** What a list says when it is empty, and what a page says when it broke. */
export function Notice({ title, children, tone = 'default' }: NoticeProps) {
  return (
    <div
      className={cx(
        styles.notice,
        tone === 'error' && styles.noticeError,
        tone === 'warn' && styles.noticeWarn,
        tone === 'success' && styles.noticeOk,
      )}
      // Only an error interrupts a screen reader. A warning is something to
      // read when you get to it, which is what the ordinary flow already does.
      role={tone === 'error' ? 'alert' : undefined}
    >
      <p className={styles.noticeTitle}>{title}</p>
      {children !== undefined && <p>{children}</p>}
    </div>
  );
}

interface TooltipProps {
  content: ReactNode;
  /**
   * Called the first time this opens.
   *
   * How the item card asks for the megabyte of stats it needs: nothing is
   * fetched until somebody actually points at something.
   */
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}

/** Distance between the trigger and the card. */
const GAP = 8;
/** Keeps the card off the very edge of the window. */
const MARGIN = 8;
/**
 * How long the pointer has to rest before a card appears, in milliseconds.
 *
 * The build page is a grid of tiles that all have one, and with no delay a
 * single sweep of the cursor across it fires a dozen cards in sequence. Half a
 * second is long enough that crossing a tile on the way somewhere else costs
 * nothing, and short enough that stopping on one still feels like an answer.
 *
 * Keyboard focus is exempt: arriving on a tile by Tab is deliberate in a way
 * that passing over it with a mouse is not, so there is nothing to wait for.
 */
const HOVER_DELAY_MS = 500;

/**
 * A hover card, portalled to `<body>`.
 *
 * It has to leave the tree: every tooltip on this site hangs off a tile inside
 * a Panel, and a Panel hides its overflow to keep its rounded corners — so an
 * absolutely-positioned card is *clipped*, which no amount of z-index fixes.
 *
 * The position is measured rather than declared. It opens above the trigger and
 * flips below when there is no room, and is clamped horizontally so a tile at
 * the edge of the window does not push its card off-screen. That is three
 * numbers computed on hover, which is what a positioning library would have
 * been carried for.
 */
export function Tooltip({ content, onOpen, className, children }: TooltipProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  /** The pending open, so leaving early cancels it rather than flashing a card. */
  const timer = useRef<number | undefined>(undefined);

  /*
   * Set by a click on the trigger, cleared by the next real pointer movement.
   *
   * Clicking a tile opens a picker over it, and closing that picker puts the
   * card straight back — you clicked to *do* something, and the thing you had
   * already read reappears over the result. Two separate causes, both of them
   * the browser being correct:
   *
   *   * `<dialog>` returns focus to whatever opened it, so `onFocus` fires. See
   *     `showOnFocus` for why that one is answered by `:focus-visible` rather
   *     than by this flag.
   *   * the pointer is still resting on the tile the dialog was covering, so
   *     hover is re-evaluated and `mouseenter` fires.
   *
   * Suppressed rather than debounced, because the honest condition is not "too
   * soon" but "the pointer has not moved since you clicked".
   */
  const suppressed = useRef(false);
  /** Where the pointer was when it was suppressed, so a move can be told from a jog. */
  const suppressedAt = useRef({ x: 0, y: 0 });

  const show = useCallback(() => {
    /*
     * Portalled into the nearest open `<dialog>` when there is one, and into
     * `<body>` otherwise.
     *
     * A modal dialog renders in the browser's *top layer*, which sits above
     * everything in the normal document — so a tooltip portalled to body while
     * a picker is open is painted underneath it and simply never appears. No
     * z-index reaches out of the document into the top layer; being inside the
     * dialog is the only way up there.
     */
    const dialog = hostRef.current?.closest('dialog');
    setHost(dialog ?? document.body);
    setOpen(true);
    // Fired with the open rather than with the hover, so a cursor crossing a
    // grid does not kick off the megabyte the item card wants.
    onOpen?.();
  }, [onOpen]);

  const showAfterDelay = useCallback(() => {
    if (suppressed.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(show, HOVER_DELAY_MS);
  }, [show]);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setAt(null);
  }, []);

  /**
   * Closes the card and keeps it closed until the pointer moves.
   *
   * On `mousedown` rather than `click`, so the card is gone before whatever the
   * click opens has a chance to draw over it.
   */
  const suppress = useCallback((event: ReactMouseEvent) => {
    suppressed.current = true;
    suppressedAt.current = { x: event.clientX, y: event.clientY };
    hide();
  }, [hide]);

  /**
   * The keyboard's way in — and only the keyboard's.
   *
   * Focus opens a card with no delay, because somebody who tabbed to a tile has
   * already said which one they mean. But focus also *returns* here when a
   * modal this tile opened is dismissed, and that is not a request to read
   * anything.
   *
   * `:focus-visible` is exactly that distinction, and the browser already
   * maintains it: it matches when focus arrived by keyboard and not when it was
   * restored programmatically. Checking the flag instead would have been a
   * guess at the same question.
   */
  const showOnFocus = useCallback(() => {
    const anchor = hostRef.current?.firstElementChild ?? hostRef.current;
    if (anchor !== null && anchor !== undefined && !anchor.matches(':focus-visible')) return;
    show();
  }, [show]);

  // A tile unmounting mid-wait — a filter changing the list under the cursor —
  // must not leave a timer that opens a card for something that is gone.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  /*
   * Lifting the suppression when the pointer genuinely moves.
   *
   * Not on any `mousemove`: Chrome fires one at the *same coordinates* when the
   * layout under a stationary pointer changes, which is exactly what closing a
   * modal does — so releasing on the event itself put the card straight back.
   * The position is what says whether somebody moved.
   *
   * On the window, because the move that matters is usually away from the tile.
   */
  useEffect(() => {
    const release = (event: MouseEvent) => {
      if (!suppressed.current) return;
      const { x, y } = suppressedAt.current;
      if (event.clientX !== x || event.clientY !== y) suppressed.current = false;
    };
    window.addEventListener('mousemove', release);
    return () => window.removeEventListener('mousemove', release);
  }, []);

  /*
   * A card left open by something that took the pointer away.
   *
   * `mouseleave` is the only thing that closes a hover card, and it does not
   * fire when the element stops being hovered without the mouse moving off it:
   * a click that opens a modal puts a dialog over the tile, and the card stayed
   * up — in the top layer, above the picker — until the pointer happened to
   * cross that spot again. The same shape of bug hides behind a scroll that
   * moves the tile out from under the cursor.
   *
   * Watching the element itself rather than guessing at the causes: while the
   * card is open, if the anchor stops matching `:hover` and holds no focus,
   * there is nothing keeping it open. One rAF loop, only while open, so it
   * costs nothing the rest of the time.
   */
  useEffect(() => {
    if (!open) return;

    let frame = 0;
    const check = () => {
      const anchor = hostRef.current?.firstElementChild ?? hostRef.current;
      if (anchor !== null && anchor !== undefined) {
        const stillWanted = anchor.matches(':hover') || anchor.contains(document.activeElement);
        if (!stillWanted) {
          hide();
          return;
        }
      }
      frame = requestAnimationFrame(check);
    };

    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [open, hide]);

  /*
   * Measured after paint but before the browser shows it: the card is rendered
   * at a provisional position with `visibility: hidden`, measured, then placed.
   * Doing it in an effect rather than on the event is what lets the *card's*
   * own size participate — it is not known until it exists.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const host = hostRef.current;
    const card = cardRef.current;
    if (host === null || card === null) return;

    /*
     * The child, not the host.
     *
     * `.tipHost` is `display: contents` so that it does not resize what it
     * wraps, which means it has no box of its own: its own rect is all zeros
     * and a card measured against it would be placed in the corner of the
     * window. The element inside is the tile the card is about, and is what the
     * card should point at anyway. The fallback is for a trigger that is bare
     * text, which nothing on the site currently is.
     */
    const anchor = (host.firstElementChild ?? host).getBoundingClientRect();
    const box = card.getBoundingClientRect();

    const above = anchor.top - box.height - GAP;
    const below = anchor.bottom + GAP;
    const top = above >= MARGIN ? above : below;

    const centred = anchor.left + anchor.width / 2 - box.width / 2;
    const left = Math.max(MARGIN, Math.min(centred, window.innerWidth - box.width - MARGIN));

    setAt({ left, top });
  }, [open, content]);

  return (
    <span
      ref={hostRef}
      className={cx(styles.tipHost, className)}
      onMouseEnter={showAfterDelay}
      onMouseLeave={hide}
      onMouseDown={suppress}
      onFocus={showOnFocus}
      onBlur={hide}
    >
      {children}
      {open &&
        host !== null &&
        createPortal(
          <span
            ref={cardRef}
            role="tooltip"
            className={styles.tip}
            style={{
              left: at?.left ?? 0,
              top: at?.top ?? 0,
              // Hidden for the one frame between rendering and being measured,
              // so it never flashes in the top-left corner on the way to place.
              visibility: at === null ? 'hidden' : 'visible',
            }}
          >
            {content}
          </span>,
          host,
        )}
    </span>
  );
}
