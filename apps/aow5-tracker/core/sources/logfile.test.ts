import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatLine } from '../events.ts';
import { compactLog } from './logfile.ts';

/**
 * The compactor rewrites a file the game may be writing to, so what is tested
 * here is mostly when it refuses: a wrong call costs the session's events, and
 * the failure looks like a tracker that has simply gone quiet.
 */

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aow5-log-')), 'console.log');

/** A log with `spam` junk lines around a handful of ours, big enough to be worth compacting. */
function writeLog(file: string, spam = 40_000): string[] {
  const ours = [
    `08/22 14:15:05 [PanoramaScript] ${formatLine({ v: 1, e: 'room_enter', t: 1, room: 'M009' })}`,
    `08/22 14:15:11 [PanoramaScript] ${formatLine({ v: 1, e: 'drop', t: 2, items: [['item_2021', 1]] })}`,
  ];
  const junk = Array.from(
    { length: spam },
    () => '08/22 14:15:06 Attack speed is <= 0 in GetAttackSpeed()! Check for uninitialized modifier values.',
  );
  fs.writeFileSync(file, [ours[0], ...junk, ours[1], ''].join('\n'));
  return ours;
}

/** Backdates the file past the idle guard, standing in for "Dota is closed". */
const cool = (file: string) => {
  const old = new Date(Date.now() - 10 * 60_000);
  fs.utimesSync(file, old, old);
};

test('the tracker lines survive and the rest of the console does not', () => {
  const file = tmp();
  const ours = writeLog(file);
  cool(file);

  const result = compactLog(file);

  assert.equal(result.skipped, null);
  assert.equal(result.kept, 2);
  assert.ok(result.after < result.before / 100, 'a log this shape is ~99% not ours');
  assert.deepEqual(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean), ours);
});

test('a log the game is still writing to is left alone', () => {
  // The mtime is the tell: a live Dota touches its log several times a second.
  const file = tmp();
  writeLog(file);

  const result = compactLog(file);

  assert.equal(result.skipped, 'in-use');
  assert.equal(result.after, result.before, 'nothing was rewritten');
  assert.ok(fs.readFileSync(file, 'utf8').includes('GetAttackSpeed'), 'and nothing was lost');
});

test('asking waives the idle guess, and the rename still decides', () => {
  // The file was written a moment ago, which the automatic pass reads as "the
  // game has it". Pressing the button says otherwise — and it is right,
  // because the game has in fact closed and the rename goes through.
  const file = tmp();
  const ours = writeLog(file);

  assert.equal(compactLog(file).skipped, 'in-use', 'the automatic pass still refuses');

  const asked = compactLog(file, { minBytes: 0, idleMs: 0 });

  assert.equal(asked.skipped, null);
  assert.equal(asked.kept, 2);
  assert.deepEqual(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean), ours);
});

test('asking waives the size floor as well', () => {
  const file = tmp();
  const ours = writeLog(file, 2);

  assert.equal(compactLog(file, { idleMs: 0 }).skipped, 'small', 'too small to bother with on its own');

  const asked = compactLog(file, { minBytes: 0, idleMs: 0 });

  assert.equal(asked.skipped, null);
  assert.deepEqual(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean), ours);
});

test('a small log is not worth touching', () => {
  const file = tmp();
  writeLog(file, 5);
  cool(file);

  assert.equal(compactLog(file).skipped, 'small');
});

test('a log that is not there yet is not a failure', () => {
  const file = path.join(os.tmpdir(), `aow5-missing-${process.pid}.log`);
  assert.equal(compactLog(file).skipped, 'missing');
});

test('nothing is left behind under the staging name', () => {
  const file = tmp();
  writeLog(file);
  cool(file);

  compactLog(file);

  assert.equal(fs.existsSync(`${file}.compacting`), false);
});
