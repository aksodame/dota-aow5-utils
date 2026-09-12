import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVideoLink, videoWatchUrl } from './video.ts';

const ID = 'dQw4w9WgXcQ';

/** The parse succeeded and named this video. Keeps the assertions readable. */
function video(input: unknown) {
  const result = parseVideoLink(input);
  assert.equal(result.ok, true, `refused: ${JSON.stringify(input)}`);
  return result.ok ? result.video : null;
}

test('every shape a person actually pastes names the same video', () => {
  const shapes = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    // No scheme: what the address bar shows, and therefore what gets copied.
    `www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `youtu.be/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/v/${ID}`,
    // The eleven characters on their own.
    ID,
    // Whitespace from a sloppy copy.
    `  https://youtu.be/${ID}  `,
  ];
  for (const shape of shapes) {
    assert.deepEqual(video(shape), { id: ID, start: 0 }, shape);
  }
});

test('the share dialog’s parameters survive, and the rest are dropped', () => {
  // A real share link: a playlist, an index, and two tracking parameters.
  assert.deepEqual(
    video(`https://www.youtube.com/watch?v=${ID}&list=PL123&index=4&pp=ygUF&si=abcd`),
    { id: ID, start: 0 },
    'only the id is kept',
  );

  // Both timestamp grammars YouTube produces.
  assert.deepEqual(video(`https://youtu.be/${ID}?t=90`), { id: ID, start: 90 });
  assert.deepEqual(video(`https://www.youtube.com/watch?v=${ID}&t=90s`), { id: ID, start: 90 });
  assert.deepEqual(video(`https://www.youtube.com/watch?v=${ID}&t=1m30s`), { id: ID, start: 90 });
  assert.deepEqual(video(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`), { id: ID, start: 3723 });
  // `start` is what an embed URL carries rather than a share link.
  assert.deepEqual(video(`https://www.youtube-nocookie.com/embed/${ID}?start=45`), { id: ID, start: 45 });
});

test('a nonsensical timestamp is no timestamp, not a failure', () => {
  // The video is still the thing being linked; refusing the whole paste over a
  // parameter nobody typed by hand would be the wrong trade.
  assert.deepEqual(video(`https://youtu.be/${ID}?t=soon`), { id: ID, start: 0 });
  assert.deepEqual(video(`https://youtu.be/${ID}?t=`), { id: ID, start: 0 });
  // Capped at a day, because a start past the end is the same as no start.
  assert.deepEqual(video(`https://youtu.be/${ID}?t=999999`), { id: ID, start: 86_400 });
});

test('absence is not a failure, in each shape a client can send it', () => {
  for (const empty of [undefined, null, '', '   ']) {
    assert.deepEqual(video(empty), null, JSON.stringify(empty));
  }
});

test('anything that is not a YouTube video is refused with a reason', () => {
  const bad = [
    'https://vimeo.com/12345',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    // The host has to match exactly: a lookalike domain must not pass.
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
    // Right host, no video.
    'https://www.youtube.com/',
    'https://www.youtube.com/results?search_query=aow5',
    'https://www.youtube.com/@somechannel',
    // Right shape, wrong length.
    'https://youtu.be/tooshort',
    'https://www.youtube.com/watch?v=waytoolongtobeanid',
    // Not a link at all.
    'javascript:alert(1)',
    'not a url',
    42,
    {},
  ];
  for (const input of bad) {
    const result = parseVideoLink(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    if (!result.ok) assert.ok(result.errors['video'], `${JSON.stringify(input)} says why`);
  }
});

test('the watch link is rebuilt from what was stored', () => {
  assert.equal(videoWatchUrl({ id: ID, start: 0 }), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(videoWatchUrl({ id: ID, start: 90 }), `https://www.youtube.com/watch?v=${ID}&t=90`);
});

test('a stored id round-trips through its own watch link', () => {
  // The property that matters: what this produces, it accepts.
  const parsed = video(videoWatchUrl({ id: ID, start: 125 }));
  assert.deepEqual(parsed, { id: ID, start: 125 });
});

test('a bare id is what the editor now sends, and it survives untouched', () => {
  /*
   * The field is an id rather than a link: eleven characters of base64url fit
   * in a share URL's query, where a pasted address with a playlist and three
   * tracking parameters does not. The URL shapes above stay accepted because
   * people paste them anyway — the site trims one down to this before it ever
   * reaches here.
   */
  assert.deepEqual(parseVideoLink('dQw4w9WgXcQ'), { ok: true, video: { id: 'dQw4w9WgXcQ', start: 0 } });
  assert.deepEqual(parseVideoLink('  dQw4w9WgXcQ  '), { ok: true, video: { id: 'dQw4w9WgXcQ', start: 0 } });

  // Ten characters is not an id, and neither is twelve. A near-miss is a typo
  // rather than a video, and guessing which one would embed the wrong thing.
  assert.equal(parseVideoLink('dQw4w9WgXc').ok, false);
  assert.equal(parseVideoLink('dQw4w9WgXcQ1').ok, false);
});
