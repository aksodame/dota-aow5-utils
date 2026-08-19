import { Fragment } from 'react';
import type { RichNode } from 'aow5-shared/types';

/**
 * Renders the description tree the extraction pipeline produced.
 *
 * The markup was parsed and allowlisted at build time, so this is a plain
 * element mapping — no HTML string and no runtime sanitizer involved.
 */
export function RichText({ nodes }: { nodes: RichNode[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <Fragment key={i}>{renderNode(node)}</Fragment>
      ))}
    </>
  );
}

function renderNode(node: RichNode) {
  if (node.t === 's') return node.v;
  if (node.t === 'br') return <br />;

  const children = <RichText nodes={node.c} />;
  switch (node.tag) {
    case 'h1':
      return <strong className="mt-2 block font-semibold">{children}</strong>;
    case 'b':
      return <strong className="font-semibold">{children}</strong>;
    case 'i':
      return <em>{children}</em>;
    case 'font':
    case 'span':
      return <span style={node.color ? { color: node.color } : undefined}>{children}</span>;
    default:
      return children;
  }
}
