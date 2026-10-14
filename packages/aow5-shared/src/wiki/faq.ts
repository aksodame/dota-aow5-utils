/**
 * The FAQ — the wiki author's explanations of how the game works, one JSON
 * document per language (`content/faq.<lang>.json`).
 *
 * Authored prose rather than extracted data, so it has no emitter: it is
 * written by hand in Russian and translated. What lives here is its shape and
 * the little logic both readers of it need — the webapp's page and the API's
 * prerenderer — so the two agree on which address names what and on the
 * sentence a page's preview says about itself.
 */

/** The FAQ, as the wiki's author structured it. */
export interface FaqDoc {
  sections: FaqSection[];
}

/**
 * One topic. A topic either has blocks of its own or is a collection of
 * sub-topics shown as tabs (`subs`) — the author merged related short topics
 * so a page does not run on forever.
 */
export interface FaqSection {
  key: string;
  title: string;
  blocks?: FaqBlock[];
  subs?: FaqSub[];
}

export interface FaqSub {
  key: string;
  title: string;
  blocks: FaqBlock[];
}

/** Strings in blocks carry the wiki's markup (`**b**`, `` `c` ``, `[[item:id|x]]`, …). */
export type FaqBlock =
  | { type: 'text'; text: string }
  | { type: 'note'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  /** Several small tables side by side. */
  | { type: 'columns'; cols: Array<{ head: string[]; rows: string[][] }> }
  | { type: 'kv'; items: Array<{ k: string; v: string }> }
  /** Drop pools, drawn from the game data; `use` says what each pool is for. */
  | { type: 'pools'; pools: Array<{ id: string; use: string }> };

/** What one address of the FAQ shows. */
export interface FaqPage {
  section: FaqSection;
  /** The sub-topic on screen: the one the address names, else the first. */
  sub: FaqSub | null;
  blocks: FaqBlock[];
}

/**
 * The page at `<section>[/<sub>]`, or undefined for an address that names
 * nothing — an unknown topic, an unknown sub-topic, a sub-topic on a topic
 * that has none, or anything deeper.
 *
 * An empty path is the first topic, which is what the FAQ opens on.
 */
export function faqPage(doc: FaqDoc, path: readonly string[]): FaqPage | undefined {
  if (path.length > 2) return undefined;
  const [sectionKey, subKey] = path;
  const section = sectionKey === undefined ? doc.sections[0] : doc.sections.find((s) => s.key === sectionKey);
  if (section === undefined) return undefined;
  const subs = section.subs ?? [];
  if (subKey !== undefined) {
    const sub = subs.find((s) => s.key === subKey);
    return sub === undefined ? undefined : { section, sub, blocks: sub.blocks };
  }
  const first = subs[0] ?? null;
  return { section, sub: first, blocks: first?.blocks ?? section.blocks ?? [] };
}

/** Every block in a topic, its own and its sub-topics'. */
export function faqAllBlocks(section: FaqSection): FaqBlock[] {
  return [...(section.blocks ?? []), ...(section.subs ?? []).flatMap((sub) => sub.blocks)];
}

/**
 * Every string in a topic — its title, its sub-topics' titles and every cell
 * of every block — joined and lower-cased, for the topic search.
 *
 * The original searched the topic serialised as JSON, which also matched the
 * block types' own names (`text`, `rows`); this collects only the values.
 */
export function faqSearchText(section: FaqSection): string {
  const out: string[] = [section.title];
  const walk = (value: unknown, key?: string): void => {
    if (typeof value === 'string') {
      if (key !== 'type' && key !== 'key') out.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(section.blocks ?? []);
  walk(section.subs ?? []);
  return out.join('\n').toLowerCase();
}

/** The author's markup reduced to its words: `**b**` → b, `[[item:x|Label]]` → Label. */
export function faqPlain(text: string): string {
  return text
    .replace(/\[\[[a-z]+:[^|\]]+\|([^\]]*)\]\]/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a page of the FAQ says about itself: the topic's title as its name,
 * the sub-topic (or, on a topic's own address, the list of its sub-topics) as
 * its facts, and the first paragraph on screen as its description.
 *
 * Undefined for an address that names nothing, exactly as `faqPage`.
 */
export function faqPageFacts(
  doc: FaqDoc,
  path: readonly string[],
): { name: string; facts: string; description: string } | undefined {
  const page = faqPage(doc, path);
  if (page === undefined) return undefined;
  const named = path.length >= 2;
  const facts = named && page.sub !== null ? page.sub.title : (page.section.subs ?? []).map((sub) => sub.title).join(' · ');
  const text = page.blocks.find((block) => block.type === 'text');
  return {
    name: page.section.title,
    facts,
    description: text === undefined ? '' : faqPlain(text.text),
  };
}

/** Every address in the FAQ: each topic, and each of its sub-topics. */
export function faqPaths(doc: FaqDoc): string[][] {
  const out: string[][] = [];
  for (const section of doc.sections) {
    out.push([section.key]);
    for (const sub of section.subs ?? []) out.push([section.key, sub.key]);
  }
  return out;
}
