import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseInline, parseMarkdown, type Block, type Inline } from './markdown.ts';

/*
 * The cases here are the shapes the report actually contains, taken from it
 * rather than invented: hard-wrapped paragraphs, quotes carrying an attribution
 * line and a row of numbered permalinks, and a Chinese translation where
 * joining wrapped lines with a space would be a visible defect.
 */

/** Flatten a node tree back to its text, so assertions can stay readable. */
function textOf(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
        case 'code':
          return n.value;
        case 'break':
          return '\n';
        default:
          return textOf(n.children);
      }
    })
    .join('');
}

function only(blocks: Block[], kind: Block['kind']): Block {
  const found = blocks.filter((b) => b.kind === kind);
  assert.equal(found.length, 1, `expected exactly one ${kind}`);
  return found[0]!;
}

test('reads both heading levels', () => {
  const blocks = parseMarkdown('# Title\n\n## Section');
  assert.deepEqual(
    blocks.map((b) => (b.kind === 'heading' ? b.level : b.kind)),
    [1, 2],
  );
});

test('!! marks a paragraph urgent and the marker never reaches the page', () => {
  const [urgent, plain] = parseMarkdown(['!! Обратите внимание не на меня', '', 'обычный абзац'].join('\n'));
  assert.equal(urgent?.kind === 'paragraph' && urgent.urgent, true);
  assert.equal(urgent?.kind === 'paragraph' ? textOf(urgent.children) : '', 'Обратите внимание не на меня');
  assert.equal(plain?.kind === 'paragraph' && plain.urgent, false);
});

test('a single ! or a mid-sentence !! leaves the paragraph alone', () => {
  for (const line of ['! not a heading here', 'careful !! not at the start']) {
    const [p] = parseMarkdown(line);
    assert.equal(p?.kind === 'paragraph' && p.urgent, false, line);
    assert.equal(p?.kind === 'paragraph' ? textOf(p.children) : '', line);
  }
});

test('a leading ! marks the section and never reaches the page', () => {
  const [flagged, plain] = parseMarkdown('## ! Коротко\n\n## 4. Сотня конвертов');
  assert.equal(flagged?.kind === 'heading' && flagged.important, true);
  assert.equal(flagged?.kind === 'heading' ? textOf(flagged.children) : '', 'Коротко');
  assert.equal(plain?.kind === 'heading' && plain.important, false);
});

test('an exclamation mark inside a heading is just text', () => {
  const [heading] = parseMarkdown('## Не трогайте! Правда');
  assert.equal(heading?.kind === 'heading' && heading.important, false);
  assert.equal(heading?.kind === 'heading' ? textOf(heading.children) : '', 'Не трогайте! Правда');
});

test('unwraps a hard-wrapped paragraph into one line', () => {
  const blocks = parseMarkdown('Это письмо не про конкретный баг. Баг вы почините,\nи на этом история закончится.');
  const p = only(blocks, 'paragraph');
  assert.equal(textOf(p.kind === 'paragraph' ? p.children : []), 'Это письмо не про конкретный баг. Баг вы почините, и на этом история закончится.');
});

test('joins wrapped Chinese without inventing a space', () => {
  const blocks = parseMarkdown('问题不在漏洞本身——漏洞你会修复。问题在于：管理团队中\n有人在使用他们自己上报给你的漏洞。');
  const p = only(blocks, 'paragraph');
  assert.equal(
    textOf(p.kind === 'paragraph' ? p.children : []),
    '问题不在漏洞本身——漏洞你会修复。问题在于：管理团队中有人在使用他们自己上报给你的漏洞。',
  );
});

test('still spaces a wrap where only one side is ideographic', () => {
  const blocks = parseMarkdown('the role costs 700₽\n每月');
  const p = only(blocks, 'paragraph');
  assert.equal(textOf(p.kind === 'paragraph' ? p.children : []), 'the role costs 700₽ 每月');
});

test('==highlight== is a run of its own and keeps its markup inside', () => {
  const nodes = parseInline('==**Почему это читаете вы:** молчание — тоже ответ==');
  assert.deepEqual(
    nodes.map((n) => n.kind),
    ['mark'],
  );
  const [mark] = nodes;
  const inner = mark?.kind === 'mark' ? mark.children.map((n) => n.kind) : [];
  assert.deepEqual(inner, ['strong', 'text']);
});

test('a highlight cannot run past a hard break', () => {
  // The letterhead is one paragraph held together by hard breaks, and only one
  // of its lines is marked — a greedy match would colour the rest of the block.
  const blocks = parseMarkdown('==first line==  \nsecond line');
  const p = only(blocks, 'paragraph');
  const kinds = p.kind === 'paragraph' ? p.children.map((n) => n.kind) : [];
  assert.deepEqual(kinds, ['mark', 'break', 'text']);
});

test('a lone = or == in prose is left alone', () => {
  const nodes = parseInline('a == b and c = d');
  assert.deepEqual(nodes, [{ kind: 'text', value: 'a == b and c = d' }]);
});

test('reads bold, italics and inline code', () => {
  const nodes = parseInline('**bold** and *italic* and `code`');
  assert.deepEqual(
    nodes.map((n) => n.kind),
    ['strong', 'text', 'em', 'text', 'code'],
  );
});

test('bold wins over italics on a doubled marker', () => {
  const [first] = parseInline('**Первое.** Участники команды');
  assert.equal(first?.kind, 'strong');
  assert.equal(first?.kind === 'strong' ? textOf(first.children) : '', 'Первое.');
});

test('reads a link and keeps its href', () => {
  const [node] = parseInline('[1](https://discord.com/channels/1/2/3)');
  assert.equal(node?.kind, 'link');
  assert.equal(node?.kind === 'link' ? node.href : '', 'https://discord.com/channels/1/2/3');
  assert.equal(node?.kind === 'link' ? textOf(node.children) : '', '1');
});

test('a quote carries its passage, attribution and every permalink', () => {
  const source = [
    '> **не пофиксил** … **значит разрешил поюзать**',
    '>',
    '> — Rebilion, 02.09.2026 14:11',
    '> [1](https://discord.com/channels/1/2/3)',
    '> · [2](https://discord.com/channels/1/2/4)',
  ].join('\n');

  const quote = only(parseMarkdown(source), 'quote');
  assert.equal(quote.kind, 'quote');
  const inner = quote.kind === 'quote' ? quote.children : [];
  assert.equal(inner.length, 2, 'passage and attribution are separate paragraphs');

  const links: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const n of nodes) {
      if (n.kind === 'link') links.push(n.href);
      else if (n.kind !== 'text' && n.kind !== 'code' && n.kind !== 'break') walk(n.children);
    }
  };
  for (const block of inner) if (block.kind === 'paragraph') walk(block.children);
  assert.deepEqual(links, ['https://discord.com/channels/1/2/3', 'https://discord.com/channels/1/2/4']);
});

test('keeps the line breaks inside a quote, because they separate messages', () => {
  // Three consecutive lines here are three separate Discord messages. Joining
  // them would turn three statements into one sentence nobody wrote.
  const source = ['> **я это нашел**', '> **я это зарепортил**', '> **я это юзаю**'].join('\n');
  const quote = only(parseMarkdown(source), 'quote');
  const inner = quote.kind === 'quote' ? quote.children : [];
  assert.equal(inner.length, 1);
  const first = inner[0]!;
  assert.equal(first.kind === 'paragraph' ? textOf(first.children) : '', 'я это нашел\nя это зарепортил\nя это юзаю');
});

test('bold survives being wrapped across lines inside a quote', () => {
  const source = ['> **Так, я если нахожу в игре баг или какую-то проблему', '> которая может повлиять на баланс - сразу же пишу разрабу**'].join('\n');
  const quote = only(parseMarkdown(source), 'quote');
  const inner = quote.kind === 'quote' ? quote.children : [];
  const para = inner[0]!;
  const kinds = para.kind === 'paragraph' ? para.children.map((n) => n.kind) : [];
  assert.deepEqual(kinds, ['strong'], 'the whole wrapped run is one bold node, not two literal asterisk pairs');
});

test('unwraps outside a quote even though it preserves inside one', () => {
  const blocks = parseMarkdown('обычный абзац переносится\nи склеивается пробелом');
  const p = only(blocks, 'paragraph');
  assert.equal(textOf(p.kind === 'paragraph' ? p.children : []), 'обычный абзац переносится и склеивается пробелом');
});

test('a Discord mention survives as literal text', () => {
  // Quoted verbatim from section 8. Under an HTML renderer this could vanish,
  // which would silently delete evidence.
  const nodes = parseInline('напишите в ЛС <@214420303768453120>');
  assert.equal(textOf(nodes), 'напишите в ЛС <@214420303768453120>');
});

test('only http(s) links become links', () => {
  const nodes = parseInline('[tap](javascript:alert(1))');
  assert.ok(!nodes.some((n) => n.kind === 'link'), 'a javascript: URL must not become a link');
  assert.equal(textOf(nodes), '[tap](javascript:alert(1))', 'and nothing may be dropped');

  const ok = parseInline('[1](https://discord.com/channels/1/2/3)');
  assert.equal(ok[0]?.kind, 'link');
});

test('reads an unordered list, folding continuation lines into their item', () => {
  const source = ['- **`#off-top`** за 17.08–02.09.2026 — 2419 сообщений;', '- **вложения** за эти дни (147 файлов: скриншоты аукциона,', '  инвентаря, переписки).'].join('\n');
  const list = only(parseMarkdown(source), 'list');
  assert.equal(list.kind === 'list' ? list.ordered : true, false);
  assert.equal(list.kind === 'list' ? list.items.length : 0, 2);
  assert.match(list.kind === 'list' ? textOf(list.items[1]!) : '', /147 файлов: скриншоты аукциона, инвентаря, переписки\)\./);
});

test('reads an ordered list', () => {
  const source = ['1. **Проверить логи** по конвертам', '   и оценить объём.', '2. **Решить по откату**.'].join('\n');
  const list = only(parseMarkdown(source), 'list');
  assert.equal(list.kind === 'list' ? list.ordered : false, true);
  assert.equal(list.kind === 'list' ? list.items.length : 0, 2);
});

test('@video on its own line becomes a video block', () => {
  const blocks = parseMarkdown('before\n\n@video ycAzkBW0bEs\n\nafter');
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['paragraph', 'video', 'paragraph'],
  );
  const [, video] = blocks;
  assert.equal(video?.kind === 'video' ? video.source : '', 'youtube');
  assert.equal(video?.kind === 'video' ? video.ref : '', 'ycAzkBW0bEs');
});

test('a file name makes it a self-hosted video instead', () => {
  const [video] = parseMarkdown('@video talk.mp4');
  assert.equal(video?.kind === 'video' ? video.source : '', 'file');
  assert.equal(video?.kind === 'video' ? video.ref : '', 'talk.mp4');
});

test('a malformed @video line is prose, and does not hang the parser', () => {
  // `startsBlock` and the block loop have to agree about what a video line is.
  // If one claims the line and the other declines it, the paragraph loop breaks
  // on it without advancing, and the parse never terminates.
  for (const line of ['@video ../../etc/passwd', '@video talk.exe', '@video a']) {
    const blocks = parseMarkdown(line);
    assert.ok(!blocks.some((b) => b.kind === 'video'), line);
    assert.equal(blocks[0]?.kind, 'paragraph', line);
  }
});

test('anything that is not a bare video id stays text', () => {
  // The renderer builds the embed URL from the id, so a document must not be
  // able to smuggle a whole URL — or anything else — into the frame.
  for (const line of [
    '@video https://youtu.be/ycAzkBW0bEs',
    '@video ../../evil',
    '@video',
    'text @video ycAzkBW0bEs',
  ]) {
    assert.ok(
      !parseMarkdown(line).some((b) => b.kind === 'video'),
      line,
    );
  }
});

test('a horizontal rule is a rule and not a list', () => {
  const blocks = parseMarkdown('above\n\n---\n\nbelow');
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['paragraph', 'rule', 'paragraph'],
  );
});

test('two trailing spaces end the line', () => {
  const blocks = parseMarkdown('**Sent to:** the developer  \n**On:** 2 September 2026');
  const p = only(blocks, 'paragraph');
  const kinds = p.kind === 'paragraph' ? p.children.map((n) => n.kind) : [];
  assert.ok(kinds.includes('break'), 'expected a hard break between the two lines');
});

test('renders nothing executable from an unclosed marker', () => {
  // A stray bracket must not swallow the paragraph, and a lone asterisk is text.
  const nodes = parseInline('a [half link( and a lone * marker');
  assert.deepEqual(nodes, [{ kind: 'text', value: 'a [half link( and a lone * marker' }]);
});
