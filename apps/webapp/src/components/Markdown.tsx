import { Fragment } from 'react';
import type { Block, Inline } from '@/lib/markdown';

/**
 * Renders the tree `lib/markdown` produced.
 *
 * A plain element mapping, exactly like `RichText` — no HTML string and no
 * runtime sanitizer, because there is no HTML anywhere in the path. A Discord
 * mention pasted into the source (`<@214420303768453120>`, which the report
 * quotes verbatim) is text here and stays text.
 *
 * Headings deliberately carry no `id` and there is no table of contents: a
 * stray `#anchor` on this site follows the visitor to `/builder`, where the
 * fragment is a serialised board and would be reported as a broken link.
 */
export function Markdown({ blocks, videoTitle = 'Video' }: { blocks: Block[]; videoTitle?: string }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block, videoTitle)}</Fragment>
      ))}
    </>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{renderInline(node)}</Fragment>
      ))}
    </>
  );
}

function renderInline(node: Inline) {
  switch (node.kind) {
    case 'text':
      return node.value;
    case 'break':
      return <br />;
    case 'code':
      return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{node.value}</code>;
    case 'strong':
      return (
        <strong className="font-semibold">
          <Inlines nodes={node.children} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case 'mark':
      // A highlight rather than a red alarm: this marks the passage a reader
      // should not skip, not one that accuses anybody.
      return (
        <span className="rounded bg-warning/10 px-1 font-medium text-warning">
          <Inlines nodes={node.children} />
        </span>
      );
    case 'link':
      // Every link in this document points at a Discord message, off-site by
      // definition. `parseMarkdown` has already refused anything that is not
      // http(s).
      return (
        <a
          href={node.href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          <Inlines nodes={node.children} />
        </a>
      );
  }
}

function renderBlock(block: Block, videoTitle: string) {
  switch (block.kind) {
    case 'heading': {
      const children = <Inlines nodes={block.children} />;
      if (block.level <= 1) return <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{children}</h1>;
      if (block.level === 2) return <h2 className="mt-6 text-xl font-semibold tracking-tight">{children}</h2>;
      return <h3 className="mt-4 text-base font-semibold">{children}</h3>;
    }
    case 'paragraph':
      // An urgent paragraph is the one thing on the page that is allowed to
      // shout. Exactly one section uses it; if a second ever does, neither
      // will work any more.
      return (
        <p
          className={
            block.urgent
              ? 'text-base leading-relaxed font-bold text-destructive sm:text-lg'
              : 'leading-relaxed text-foreground/90'
          }
        >
          <Inlines nodes={block.children} />
        </p>
      );
    case 'quote':
      // The tint echoes the `warning` Alert variant. `text-warning-foreground`
      // would be wrong here: it is near-white, meant for a solid fill.
      return (
        <blockquote className="flex flex-col gap-2 border-l-2 border-warning/40 bg-warning/5 py-2 pl-4 text-sm">
          <Markdown blocks={block.children} videoTitle={videoTitle} />
        </blockquote>
      );
    case 'list': {
      const items = block.items.map((item, i) => (
        <li key={i} className="leading-relaxed">
          <Inlines nodes={item} />
        </li>
      ));
      return block.ordered ? (
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-foreground/90">{items}</ol>
      ) : (
        <ul className="flex list-disc flex-col gap-2 pl-6 text-foreground/90">{items}</ul>
      );
    }
    case 'video':
      // A file this site serves gets the browser's own player: no account, no
      // age gate, nothing between the reader and the evidence. `preload` is
      // metadata only — the file is large and most readers will scroll past.
      if (block.source === 'file') {
        return (
          <video
            className="aspect-video w-full max-w-3xl overflow-hidden rounded-xl border bg-black"
            src={`${import.meta.env.BASE_URL}media/${block.ref}`}
            title={videoTitle}
            controls
            preload="metadata"
            playsInline
          />
        );
      }
      // nocookie and lazy, like the tracker's guide. The src is built here from
      // an id the parser validated, so a document cannot point the frame at
      // anything but YouTube.
      return (
        <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-xl border bg-black">
          <iframe
            className="size-full"
            src={`https://www.youtube-nocookie.com/embed/${block.ref}`}
            title={videoTitle}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      );
    case 'rule':
      return <hr className="border-border" />;
  }
}
