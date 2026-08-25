import type { RichNode } from 'aow5-shared/types';

/** A run of description text under one of the game's own headings. */
export interface DescSection {
  /** The heading's nodes, or null for text that arrives before any heading. */
  heading: RichNode[] | null;
  body: RichNode[];
}

function isBlank(node: RichNode): boolean {
  return node.t === 'br' || (node.t === 's' && node.v.trim() === '');
}

/** Drops the line breaks that pad a heading away from the text under it. */
function trim(nodes: RichNode[]): RichNode[] {
  let start = 0;
  let end = nodes.length;
  while (start < end && isBlank(nodes[start] as RichNode)) start++;
  while (end > start && isBlank(nodes[end - 1] as RichNode)) end--;
  return nodes.slice(start, end);
}

/**
 * Cuts a description into the blocks the game draws it as.
 *
 * Item and ability text is one flat node list with `h1` headings in it —
 * "Passive: Soul Scatter", "Stifling Dagger: Quick Hands" — and the game puts
 * each of those on a bar above the paragraph it introduces. Splitting on them
 * is what lets a card do the same instead of running the heading into the text.
 */
export function splitDescription(nodes: RichNode[] | undefined): DescSection[] {
  if (!nodes || nodes.length === 0) return [];

  const sections: DescSection[] = [];
  let current: DescSection = { heading: null, body: [] };

  for (const node of nodes) {
    if (node.t === 'el' && node.tag === 'h1') {
      if (current.heading || current.body.length > 0) sections.push(current);
      current = { heading: node.c, body: [] };
    } else {
      current.body.push(node);
    }
  }
  if (current.heading || current.body.length > 0) sections.push(current);

  return sections
    .map((s) => ({ heading: s.heading, body: trim(s.body) }))
    .filter((s) => s.heading !== null || s.body.length > 0);
}
