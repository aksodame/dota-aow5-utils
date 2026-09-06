/**
 * Point the report's citations at the archive rather than at Discord.
 *
 * The documents are written with real Discord permalinks, and they have to
 * stay that way: they are also exported to .docx and read by people who do
 * have access to those channels, and a link to a mirror would be worth less
 * to them than a link to the message itself.
 *
 * But the channels are staff-only. A player who follows a permalink sees an
 * empty Discord, concludes the quote was invented, and stops reading — which
 * is the opposite of what a citation is for. So on the site every permalink is
 * rewritten to open the same message inside the published export, where anyone
 * can read it in context; the archive then offers the Discord link onward, for
 * whoever can use it.
 *
 * The rewrite is mechanical — a permalink already contains the channel and
 * message ids the archive keys on — so there is no lookup table to fall out of
 * step with the export.
 */
// Relative, not `@/`: `node --test` runs this file directly and does not know
// the alias — the same reason `routes.ts` imports the way it does.
import type { Block, Inline } from './markdown.ts';
import { ARCHIVE_URL } from './links.ts';

const PERMALINK = /^https?:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)\b/i;

/**
 * Channels any player can already open, which keep their Discord links.
 *
 * `╠📃│rules` is public, and section 10 turns on that fact — it invites the
 * reader to go and check the server's own rules against what the same people
 * were doing. Sending that link to a mirror would throw away the only citation
 * in the document a reader can verify at the source. The export still holds a
 * copy, in case the posts are edited later.
 */
const PUBLIC_CHANNELS = new Set(['1506616783111716986']);

/** The archive URL for a Discord permalink, or null if it should stay as it is. */
export function toArchive(href: string): string | null {
  const m = PERMALINK.exec(href);
  if (m === null) return null;
  const channel = m[2];
  if (channel === undefined || PUBLIC_CHANNELS.has(channel)) return null;
  return `${ARCHIVE_URL}/view#${channel}/${m[3]}`;
}

function rewriteInline(nodes: Inline[]): Inline[] {
  return nodes.map((node) => {
    if (node.kind === 'link') {
      const archived = toArchive(node.href);
      return { ...node, href: archived ?? node.href, children: rewriteInline(node.children) };
    }
    if (node.kind === 'strong' || node.kind === 'em' || node.kind === 'mark') {
      return { ...node, children: rewriteInline(node.children) };
    }
    return node;
  });
}

export function rewriteCitations(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        return { ...block, children: rewriteInline(block.children) };
      case 'quote':
        return { ...block, children: rewriteCitations(block.children) };
      case 'list':
        return { ...block, items: block.items.map(rewriteInline) };
      case 'video':
      case 'rule':
        return block;
    }
  });
}
