/**
 * Whether a click on a `<dialog>` was a click on its backdrop.
 *
 * The obvious test — `event.target === dialog` — is the one every tutorial
 * gives and it is wrong in two ordinary cases, both of which closed the item
 * picker out from under somebody mid-edit:
 *
 *   * **A drag that ends on the dialog.** Select the text in the search box by
 *     dragging, let go a few pixels past the edge of the input, and the `click`
 *     is dispatched at their nearest common ancestor, which is the dialog. The
 *     press was inside; only the release was not.
 *   * **A native popup over the dialog.** A `<select>`'s list, and the context
 *     menu a right-click opens, are drawn by the browser outside the page.
 *     Dismissing one sends a click whose coordinates land *inside* the dialog's
 *     box but whose target is the dialog element, because nothing of ours is
 *     under the pointer.
 *
 * So the question is asked geometrically instead: the pointer has to be outside
 * the dialog's own rectangle. The element check stays as a cheap first pass —
 * anything that hits a child is not a backdrop click whatever its coordinates.
 *
 * `Dialog` pairs this with the press: a backdrop click is one that both started
 * and ended out here.
 */

/** The parts of a mouse event this needs. Keeps the tests free of the DOM. */
export interface ClickAt {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}

/** The parts of a `DOMRect` this needs. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function isBackdropClick(dialog: EventTarget | null, box: Box, event: ClickAt): boolean {
  if (dialog === null || event.target !== dialog) return false;

  /*
   * Enter or Space on a focused button dispatches a click with no position —
   * every browser reports (0, 0) — and (0, 0) is outside the box of a centred
   * dialog, so without this a keyboard press on a control inside would read as
   * a click on the backdrop. The case is reachable: the picker's footer buttons
   * are operated by keyboard.
   */
  if (event.clientX === 0 && event.clientY === 0) return false;

  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}
