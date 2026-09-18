/**
 * Marks whatever is scrolling with `data-scrolling`, and unmarks it once it
 * stops — the attribute `styles.css` shows a scrollbar for.
 *
 * One listener on the document rather than a hook per scroller: `scroll` does
 * not bubble, but it does pass through the capture phase, so this sees every
 * box on the page, including ones a component adds later.
 */

/** How long a bar stays after the last scroll event, in milliseconds. */
const LINGER_MS = 800;

export function revealScrollbarsWhileScrolling(): void {
  const timers = new WeakMap<Element, number>();

  document.addEventListener(
    'scroll',
    (event) => {
      const target = event.target === document ? document.scrollingElement : event.target;
      if (!(target instanceof Element)) return;

      const pending = timers.get(target);
      if (pending === undefined) target.setAttribute('data-scrolling', '');
      else window.clearTimeout(pending);

      timers.set(
        target,
        window.setTimeout(() => {
          target.removeAttribute('data-scrolling');
          timers.delete(target);
        }, LINGER_MS),
      );
    },
    { capture: true, passive: true },
  );
}
