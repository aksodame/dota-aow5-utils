import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILDER_URL,
  BUTTON_LABEL_MAX,
  TRACKER_URL,
  buildPresence,
  duration,
  presenceButtons,
  samePresence,
  usableUrl,
  wireActivity,
  type PresenceInput,
  type PresenceLabels,
} from './presence.ts';
import type { Rates } from './stats.ts';
import type { RoomInfo } from './rooms.ts';

const LABELS: PresenceLabels = {
  app: 'AOW5 Tools',
  betweenRooms: 'Between rooms',
  tier: (level) => `T${level}`,
  room: (elapsed, gold) => `${elapsed} · ${gold} gold`,
  session: (goldPerHour, elapsed) => `${goldPerHour} gold/h · ${elapsed}`,
  myBuild: 'My build',
  builder: 'Open the builder',
  getTracker: 'Get the tracker',
};

const RATES: Rates = {
  currentRunGold: 120_000,
  currentRunElapsed: 134,
  mapElapsed: 134,
  goldPerHour: 12_400_000,
  itemsPerHour: 47.6,
  valuePerHour: 9_000_000,
  averageClear: 118,
  averageRunGold: 400_000,
  completedRuns: 23,
  abandonedRuns: 2,
  diedRuns: 1,
  activeTime: 6_127,
};

const ROOM: RoomInfo = { id: 'M013', name: 'Shrine of Desire', type: 'normal', level: 8 };
const NOW = 1_800_000_000_000;

const input = (over: Partial<PresenceInput> = {}): PresenceInput => ({
  rates: RATES,
  room: ROOM,
  now: NOW,
  ...over,
});

test('in a room, the lines are where you are and what this room has done', () => {
  const activity = buildPresence(input(), LABELS);
  assert.equal(activity.details, 'Shrine of Desire · T8');
  assert.equal(activity.state, '2:14 · 120k gold');
});

test('a room the table knows no tier for is named without one', () => {
  // Rooms arrive every patch and an unknown one falls back to its id with a
  // level of 0 — which must read as a room, not as "· T0".
  const activity = buildPresence(input({ room: { id: 'M099', name: 'M099', type: 'unknown', level: 0 } }), LABELS);
  assert.equal(activity.details, 'M099');
});

test('between rooms, the session takes over the same two lines', () => {
  const activity = buildPresence(input({ room: null }), LABELS);
  assert.equal(activity.details, 'Between rooms');
  assert.equal(activity.state, '12.4M gold/h · 1:42:07');
});

test('the timer counts from when the thing it times actually began', () => {
  // Derived rather than stored: `Run.start` is the game clock, which is not a
  // wall clock and cannot be handed to Discord.
  const inRoom = buildPresence(input(), LABELS);
  assert.equal(inRoom.startTimestamp, NOW - 134 * 1000);

  const between = buildPresence(input({ room: null }), LABELS);
  assert.equal(between.startTimestamp, NOW - 6_127 * 1000);
});

test('the first button is the build when there is one, and the site when there is not', () => {
  const mine = presenceButtons('https://aow5tools.boardshub.io/builds/PYw8p8kCtB', LABELS);
  assert.equal(mine[0]?.url, 'https://aow5tools.boardshub.io/builds/PYw8p8kCtB');
  assert.equal(mine[0]?.label, 'My build');

  const none = presenceButtons(undefined, LABELS);
  assert.equal(none[0]?.url, BUILDER_URL);
  assert.equal(none[0]?.label, 'Open the builder');
});

test('the second button is always the tracker', () => {
  for (const url of [undefined, '', 'https://example.com/builds/x']) {
    assert.equal(presenceButtons(url, LABELS)[1]?.url, TRACKER_URL);
  }
});

test('a build link somebody pasted wrong costs a button, not the presence', () => {
  // Discord rejects the whole activity over one malformed button URL, so a typo
  // in a setting would take the presence down rather than degrade it.
  for (const bad of ['not a url', 'javascript:alert(1)', 'ftp://host/file', '   ']) {
    assert.equal(usableUrl(bad), null, bad);
    assert.equal(presenceButtons(bad, LABELS)[0]?.url, BUILDER_URL, bad);
  }
});

test('a label longer than Discord allows is cut rather than refused', () => {
  const long = { ...LABELS, getTracker: 'x'.repeat(60) };
  const button = presenceButtons(undefined, long)[1];
  assert.ok(button !== undefined);
  assert.ok(button.label.length <= BUTTON_LABEL_MAX, button.label);
});

test('two activities a second apart are the same activity', () => {
  // The client may send one update per fifteen seconds. Only a *different*
  // presence is worth queueing, and the timestamp changes on every tick by
  // construction — so it is not part of the comparison.
  const a = buildPresence(input(), LABELS);
  const b = buildPresence(input({ now: NOW + 1000 }), LABELS);
  assert.ok(samePresence(a, b));
});

test('a new room is a new activity', () => {
  const a = buildPresence(input(), LABELS);
  const b = buildPresence(input({ room: { ...ROOM, id: 'M001', name: 'Abandoned Quarry', level: 1 } }), LABELS);
  assert.ok(!samePresence(a, b));
});

test('the room picture is the small one, and only when there is a room', () => {
  const withArt = buildPresence(input({ roomImageKey: 'room_M013' }), LABELS);
  assert.equal(withArt.smallImageKey, 'room_M013');
  assert.equal(withArt.smallImageText, 'Shrine of Desire');
  assert.equal(withArt.largeImageText, 'AOW5 Tools');

  const between = buildPresence(input({ room: null, roomImageKey: 'room_M013' }), LABELS);
  assert.equal(between.smallImageKey, undefined);
});

test('a duration grows an hours field only once there are hours', () => {
  // A room is minutes and reads best as `2:14`; an evening is hours and reads
  // as nonsense at `102:07`.
  assert.equal(duration(0), '0:00');
  assert.equal(duration(59), '0:59');
  assert.equal(duration(134), '2:14');
  assert.equal(duration(3_599), '59:59');
  assert.equal(duration(3_600), '1:00:00');
  assert.equal(duration(6_127), '1:42:07');
});

test('the same room a moment later is a different activity', () => {
  // The consequence of putting a running time in the text: it moves, so every
  // window the rate limit opens has something new to send. The timer below is
  // still the live one — this is the coarse label beside it.
  const a = buildPresence(input(), LABELS);
  const b = buildPresence(input({ rates: { ...RATES, currentRunElapsed: 149 } }), LABELS);
  assert.ok(!samePresence(a, b));
});


test('the wire carries both buttons, as objects with a label and a url', () => {
  // The shape is the whole point: over this socket a button is
  // `{ label, url }`, and over the gateway the same field is a list of labels
  // with the URLs elsewhere. Sending the wrong one costs two buttons and says
  // nothing — the activity is accepted, the text appears, and the buttons are
  // simply absent.
  const wire = wireActivity(buildPresence(input({ buildUrl: 'https://example.com/builds/x' }), LABELS));
  assert.deepEqual(wire['buttons'], [
    { label: 'My build', url: 'https://example.com/builds/x' },
    { label: 'Get the tracker', url: TRACKER_URL },
  ]);
});

test('the wire spells every key the way the socket expects', () => {
  const wire = wireActivity(buildPresence(input({ roomImageKey: 'room_M013' }), LABELS));
  assert.equal(wire['details'], 'Shrine of Desire · T8');
  assert.deepEqual(wire['timestamps'], { start: NOW - 134 * 1000 });
  assert.deepEqual(wire['assets'], {
    large_image: 'logo',
    large_text: 'AOW5 Tools',
    small_image: 'room_M013',
    small_text: 'Shrine of Desire',
  });
});

test('an activity with no room picture sends no small image at all', () => {
  // An empty string is a key, and a key that names nothing is how an activity
  // comes back rejected rather than merely plain.
  const wire = wireActivity(buildPresence(input(), LABELS));
  assert.deepEqual(Object.keys(wire['assets'] as object).sort(), ['large_image', 'large_text']);
});
