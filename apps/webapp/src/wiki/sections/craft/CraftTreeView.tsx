import { memo } from 'react';
import { CRAFT_MAX_DEPTH, CRAFT_MAX_NODES, type CraftItem, type CraftNode, type CraftTree } from 'aow5-shared/wiki';
import { Input, cx } from '@/ui';
import { ItemRef, Note, num, setAuctionPrice } from '../../kit';
import { itemHref, nameOf, type CraftContext } from './model';
import styles from './Craft.module.css';

/**
 * The composition tree: one branch per direct component, side by side and
 * scrolling sideways inside their own box; inside a branch, what each part is
 * made of hangs below it on a dashed rule.
 *
 * Every node carries an exchange-price field. Typing in one changes the cost
 * of everything above it, so the whole tree re-renders on each keystroke —
 * which is why nodes are keyed by their path in the recipe (`0.2.1`) rather
 * than rebuilt: React keeps the same `<input>`, and the caret stays where the
 * reader left it.
 */
export function CraftTreeView({ ctx, root, tree, matDepth }: { ctx: CraftContext; root: CraftItem; tree: CraftTree; matDepth: boolean }) {
  const { t, lang, pricing, prices } = ctx;
  const buy = prices[root.id] ?? null;
  const craft = pricing.craftOf(root.id);

  // Cheaper to buy ready-made: the parts do not matter, crafting loses anyway.
  if (buy !== null && craft.value !== null && buy < craft.value) {
    return <Note>{t.cheaperToBuy(num(buy, lang, 0), num(Math.round(craft.value), lang, 0))}</Note>;
  }
  if (root.needs.length === 0) return <Note>{t.noNeeds}</Note>;

  return (
    <>
      <div className={styles.treeScroll}>
        <div className={styles.branches}>
          {tree.branches.map((node) => (
            <div key={node.key} className={styles.branch}>
              <Branch ctx={ctx} node={node} />
            </div>
          ))}
        </div>
      </div>
      {tree.collapsedMats > 0 && !matDepth && <Note>{t.collapsedNote(tree.collapsedMats)}</Note>}
      {tree.truncated && <Note>{t.truncatedNote(CRAFT_MAX_DEPTH, CRAFT_MAX_NODES)}</Note>}
      {craft.unknown && <Note>{t.unknownNote}</Note>}
    </>
  );
}

function Branch({ ctx, node }: { ctx: CraftContext; node: CraftNode }) {
  return (
    <div className={styles.level}>
      <NodeBlock ctx={ctx} node={node} />
      {node.children.length > 0 && (
        <div className={styles.kids}>
          {node.children.map((child) => (
            <Branch key={child.key} ctx={ctx} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeBlock({ ctx, node }: { ctx: CraftContext; node: CraftNode }) {
  const { t, lang, lookup, pricing, prices, byId } = ctx;
  const item = lookup(node.id);
  const known = item !== undefined && byId.has(node.id);

  if (item === undefined) {
    return (
      <div className={cx(styles.node, styles.nodeUnknown)} title={t.unknownTitle(node.id, node.count)}>
        <div className={styles.nodeHead}>
          <code className={styles.nodeCode}>{node.id}</code>
          <span className={styles.nodeCount}>×{node.count}</span>
        </div>
        <div className={styles.nodeSub}>{t.notInData}</div>
      </div>
    );
  }

  const buy = prices[node.id] ?? null;
  const craft = pricing.craftOf(node.id).value;
  const verdict = pricing.verdict(node.id);
  const own = item.cost > 0 ? item.cost : null;
  const fmt = (value: number | null) => (value === null ? null : num(Math.round(value), lang, 0));

  return (
    <div
      className={cx(styles.node, node.collapsed && styles.nodeCollapsed, verdict === 'buy' && styles.isBuy, verdict === 'craft' && styles.isCraft)}
      title={t.nodeTitle({
        name: nameOf(ctx, node.id),
        id: node.id,
        count: node.count,
        own: fmt(own),
        buy: fmt(buy),
        craft: fmt(craft),
        verdict,
        collapsed: node.collapsed,
      })}
    >
      <div className={styles.nodeHead}>
        {known ? <ItemRef id={node.id} size="sm" href={itemHref(ctx, node.id)} /> : <code className={styles.nodeCode}>{node.id}</code>}
        <span className={styles.nodeCount}>×{node.count}</span>
      </div>
      <div className={styles.nodePrices}>
        <span className={styles.nodePrice}>{own === null ? '—' : num(own, lang, 0)}</span>
        <NodePrice id={node.id} value={buy} placeholder={t.exchangePlaceholder} title={t.exchangeTitle} />
        <span className={styles.nodeCost}>{craft === null ? '—' : num(Math.round(craft), lang, 0)}</span>
      </div>
    </div>
  );
}

/**
 * The exchange price inline in a node. Text rather than a number input, so the
 * caret is the browser's to keep; controlled, so the same item's price in two
 * branches is always the same number.
 */
const NodePrice = memo(function NodePrice({ id, value, placeholder, title }: { id: string; value: number | null; placeholder: string; title: string }) {
  return (
    <Input
      className={styles.nodeInput}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      title={title}
      aria-label={title}
      value={value === null ? '' : String(value)}
      onChange={(event) => setAuctionPrice(id, event.target.value)}
    />
  );
});
