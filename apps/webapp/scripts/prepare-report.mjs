/**
 * Install the report documents into the web app.
 *
 *   node apps/webapp/scripts/prepare-report.mjs
 *   node apps/webapp/scripts/prepare-report.mjs --check
 *
 * The documents are written in `private/`, which is gitignored, and the site
 * needs them in `apps/webapp/src/content/`, which is not. That is the whole
 * job: a copy, with the line endings normalised.
 *
 * This script used to rewrite the letterhead, the closing line and the archive
 * link, because the letter was addressed to the developer and pointed at an
 * archive that lived somewhere else. The documents are now written for players
 * and their links point into the chat dump this site serves itself, so there is
 * nothing left to rewrite — and a copy that changes nothing is much easier to
 * trust than one that changes things.
 *
 * `--check` reports what it would write and writes nothing.
 *
 * Keep editing the originals in `private/`. Editing the copies under
 * `src/content/` means the next run overwrites you.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OUT = path.join(REPO, 'apps/webapp/src/content');

const DOCUMENTS = [
  { lang: 'ru', source: 'private/notfair_discord_admins.md' },
  { lang: 'en', source: 'private/notfair_discord_admins.en.md' },
  { lang: 'zh', source: 'private/notfair_discord_admins.zh.md' },
];

/** Anything left of a fill-me-in marker is a bug, not a document. */
const PLACEHOLDERS = [/ЗАМЕНИТЬ_НА_[A-ZА-Я_]+/, /<GOOGLE DOCS LINK>/i, /TODO:/];

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    fs
      .readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('*/')[0]
      .replace(/^\/\*\*\n?/, '')
      .replace(/^ \* ?/gm, ''),
  );
  process.exit(0);
}

const check = process.argv.includes('--check');
let wrote = 0;

for (const doc of DOCUMENTS) {
  const from = path.join(REPO, doc.source);
  if (!fs.existsSync(from)) {
    console.error(`missing source: ${doc.source}`);
    process.exit(1);
  }

  const text = fs.readFileSync(from, 'utf8').replace(/\r\n/g, '\n');
  const label = path.basename(doc.source);

  for (const marker of PLACEHOLDERS) {
    const hit = text.match(marker);
    if (hit !== null) {
      console.error(`\n${label}: unfilled placeholder in the text: ${hit[0]}`);
      process.exit(1);
    }
  }

  const to = path.join(OUT, `report.${doc.lang}.md`);
  const heading = text.split('\n')[0];
  if (check) {
    console.log(`${doc.lang}: would write ${path.relative(REPO, to)} (${text.length} chars) — ${heading}`);
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(to, text, 'utf8');
    console.log(`${doc.lang}: wrote ${path.relative(REPO, to)} (${text.length} chars) — ${heading}`);
    wrote += 1;
  }
}

if (!check) {
  console.log(`\n${wrote} documents installed.`);
  console.log('Read them once before deploying — they are now public text.');
}
