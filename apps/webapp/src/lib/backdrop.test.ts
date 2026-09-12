import assert from 'node:assert/strict';
import test from 'node:test';
import { isBackdropClick, type Box } from './backdrop.ts';

const DIALOG = { id: 'dialog' } as unknown as EventTarget;
const CHILD = { id: 'child' } as unknown as EventTarget;
/** A 400×300 dialog, centred-ish in a 1000×800 window. */
const BOX: Box = { left: 300, right: 700, top: 250, bottom: 550 };

test('a click beyond every edge is a backdrop click', () => {
  const outside: Array<[number, number]> = [
    [100, 400],
    [900, 400],
    [500, 100],
    [500, 700],
  ];
  for (const [x, y] of outside) {
    assert.ok(isBackdropClick(DIALOG, BOX, { target: DIALOG, clientX: x, clientY: y }), `${x},${y}`);
  }
});

test('a click inside the dialog is not, whatever it landed on', () => {
  // The `<select>` case: the browser draws its list outside the page, so the
  // click that dismisses it has the dialog as its target — at coordinates that
  // are over the dialog itself.
  assert.ok(!isBackdropClick(DIALOG, BOX, { target: DIALOG, clientX: 500, clientY: 400 }));
});

test('anything that hits a child is not, even out at the edge', () => {
  assert.ok(!isBackdropClick(DIALOG, BOX, { target: CHILD, clientX: 10, clientY: 10 }));
});

test('a keyboard press on a button inside is not a click on the backdrop', () => {
  // Enter and Space report (0, 0), which is outside every centred dialog.
  assert.ok(!isBackdropClick(DIALOG, BOX, { target: DIALOG, clientX: 0, clientY: 0 }));
});

test('the edges themselves belong to the dialog', () => {
  assert.ok(!isBackdropClick(DIALOG, BOX, { target: DIALOG, clientX: 300, clientY: 250 }));
  assert.ok(!isBackdropClick(DIALOG, BOX, { target: DIALOG, clientX: 700, clientY: 550 }));
});

test('no dialog, no backdrop', () => {
  assert.ok(!isBackdropClick(null, BOX, { target: DIALOG, clientX: 10, clientY: 10 }));
});
