import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accelerator,
  conflicts,
  DEFAULT_SHORTCUTS,
  readBinding,
  readShortcuts,
  shortcutLabel,
  splitAccelerator,
} from './shortcuts.ts';

/**
 * The reader and the joiner, which are the two halves that have to agree with
 * `globalShortcut.register`. A wrong answer here is silent in the worst way:
 * `register` returns false for a chord it does not like, and the shortcut then
 * does nothing forever with no error anywhere.
 */

test('a fresh profile presses what the app has always pressed', () => {
  // The focus chord is in the pin hint at the bottom of every overlay and in
  // whatever the player has already learned. Changing it is not a default.
  assert.equal(accelerator(DEFAULT_SHORTCUTS, 'focus'), 'Control+Alt+T');
  assert.equal(accelerator(DEFAULT_SHORTCUTS, 'die'), 'Control+E');
});

test('a binding is normalised so one chord has one spelling', () => {
  assert.equal(readBinding('e'), 'E');
  assert.equal(readBinding('ctrl+e'), 'Control+E');
  assert.equal(readBinding('  alt + t '), 'Alt+T');
  // Order comes from the modifier list, not from what was typed — otherwise
  // `conflicts` below would compare two spellings of one key and see none.
  assert.equal(readBinding('T+Alt'), 'Alt+T');
  assert.equal(readBinding('Shift+Control+F5'), 'Control+Shift+F5');
});

test('a binding that could not be registered is refused rather than passed on', () => {
  assert.equal(readBinding('A+B'), null, 'two keys is a typo, not a chord');
  assert.equal(readBinding('Alt'), null, 'a modifier on its own is not a shortcut');
  assert.equal(readBinding(''), null);
  assert.equal(readBinding('F25'), null, 'there is no F25 to register');
  assert.equal(readBinding('Enter'), null, 'not on the list, not spliced into an accelerator');
  assert.equal(readBinding(42), null);
});

test('a broken binding costs that binding and nothing beside it', () => {
  const s = readShortcuts({ actionKey: 'Alt', keys: { focus: 'nonsense!', die: 'q' } });
  assert.equal(s.actionKey, 'Alt');
  assert.equal(s.keys.focus, DEFAULT_SHORTCUTS.keys.focus, 'back to its default, not to nothing');
  assert.equal(s.keys.die, 'Q', 'the one beside it survived');
});

test('an unusable action key is the default, not an unregisterable accelerator', () => {
  assert.equal(readShortcuts({ actionKey: 'Banana' }).actionKey, 'Control');
  assert.equal(readShortcuts({ actionKey: 'alt' }).actionKey, 'Alt', 'case is normalised, not rejected');
});

test('an upgrade keeps pressing the key it was already pressing', () => {
  // The whole point of the legacy path: somebody who moved off `Control+Alt+T`
  // because it clashed must not be moved back onto it by the upgrade.
  const s = readShortcuts(undefined, 'Control+Alt+G');
  assert.equal(accelerator(s, 'focus'), 'Control+Alt+G');
  assert.equal(accelerator(s, 'die'), 'Control+E', 'and gains the new one at its default');
});

test('the old default splits into exactly the new default', () => {
  assert.deepEqual(splitAccelerator('Control+Alt+T'), { actionKey: 'Control', binding: 'Alt+T' });
  assert.deepEqual(splitAccelerator('Ctrl+Alt+T'), { actionKey: 'Control', binding: 'Alt+T' });
  assert.equal(splitAccelerator('T'), null, 'no modifier, nothing to make an action key of');
  assert.equal(splitAccelerator('Control+Alt'), null, 'no key, nothing to bind');
});

test('a legacy hotkey is ignored once there is a shortcuts block to read', () => {
  // Otherwise the config file would carry two answers and the older one would
  // keep winning after every edit in the settings window.
  const s = readShortcuts({ actionKey: 'Alt', keys: { focus: 'T', die: 'E' } }, 'Control+Alt+G');
  assert.equal(accelerator(s, 'focus'), 'Alt+T');
});

test('two actions on one chord are both reported, not just the newer', () => {
  const clash = conflicts({ actionKey: 'Control', keys: { focus: 'E', die: 'E' } });
  assert.deepEqual([...clash].sort(), ['die', 'focus'], 'both rows are wrong, and both say so');
  assert.equal(conflicts(DEFAULT_SHORTCUTS).size, 0);
  // The action key is shared, so it cannot be what separates two bindings —
  // only the binding can, and these differ.
  assert.equal(conflicts({ actionKey: 'Alt', keys: { focus: 'T', die: 'E' } }).size, 0);
});

test('what is shown is what the keyboard says, not what Electron is given', () => {
  assert.equal(shortcutLabel('Control+Alt+T'), 'Ctrl+Alt+T');
  assert.equal(shortcutLabel('Super+E'), 'Win+E');
  assert.equal(shortcutLabel('Alt+T'), 'Alt+T');
});

test('the action key is never doubled onto a binding that already has it', () => {
  // The default focus binding is `Alt+T`, because `Control+Alt+T` is what this
  // app has always pressed. Moving the action key to Alt would otherwise
  // produce `Alt+Alt+T`, which registers as nothing — and the key it would
  // break is the one you need to reach the settings window and undo it.
  const alt = { actionKey: 'Alt', keys: { focus: 'Alt+T', die: 'E' } } as const;
  assert.equal(accelerator(alt, 'focus'), 'Alt+T');
  assert.equal(accelerator(alt, 'die'), 'Alt+E');

  const shift = { actionKey: 'Shift', keys: { focus: 'Alt+T', die: 'E' } } as const;
  assert.equal(accelerator(shift, 'focus'), 'Shift+Alt+T', 'a modifier that is not the action key stays');
});

test('collapsing the action key can bring two shortcuts onto one chord', () => {
  // `Control` + `Control+E` and `Control` + `E` are the same key twice, and the
  // second registration silently fails. It has to be reported as the clash it
  // is rather than as two rows that look different.
  const clash = conflicts({ actionKey: 'Control', keys: { focus: 'Control+E', die: 'E' } });
  assert.deepEqual([...clash].sort(), ['die', 'focus']);
});
