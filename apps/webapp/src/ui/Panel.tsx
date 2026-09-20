import { useState, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx.ts';
import * as Icon from './Icon.tsx';
import styles from './Panel.module.css';

/**
 * A titled black card.
 *
 * The reference's whole vocabulary is this shape repeated — Main Skill, Pact,
 * Hero Trait, Filter — so it is one component with a slot for whatever
 * sits opposite the title (a search affordance, a count, nothing).
 */
/*
 * `title` is omitted from the element's own props before being redeclared: the
 * DOM's `title` is the tooltip attribute and is a string, and a panel heading
 * is a node. Widening it in place is what TypeScript refuses, and rightly.
 */
interface PanelProps extends Omit<ComponentProps<'section'>, 'title'> {
  /**
   * The body takes what is left of a constrained panel, instead of the panel
   * growing to fit the body.
   *
   * For a panel with a `max-height` whose content is meant to scroll inside it.
   * A flex child's `min-height` is `auto`, so without this the body stays as
   * tall as its content, the panel clips the difference — it hides its own
   * overflow to keep its rounded corners — and the scroller inside never has
   * anything to scroll. That is how the filter sidebar lost every control below
   * the fold on a short window.
   */
  fill?: boolean;

  title?: ReactNode;
  /** Rendered at the far end of the header row. */
  action?: ReactNode;
  /** Drops the body padding, for a panel whose content is a grid of tiles. */
  flush?: boolean;
  /**
   * Turns the heading into a toggle and hides the body when it is shut.
   *
   * For a panel that is worth having on the page but not worth the height it
   * takes by default. The heading is the button's own label, so it needs no
   * second one; `action` stays outside it and keeps working while shut.
   */
  collapsible?: boolean;
  /** Controlled open state. Leave it out to let the panel keep its own. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Panel({
  title,
  action,
  flush = false,
  fill = false,
  collapsible = false,
  open,
  defaultOpen = true,
  onOpenChange,
  className,
  children,
  ...rest
}: PanelProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const isOpen = !collapsible || (open ?? ownOpen);

  const toggle = () => {
    const next = !isOpen;
    // Uncontrolled panels keep their own state; a controlled one is told and
    // does as it likes, so the two cannot both believe they are in charge.
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section className={cx(styles.panel, flush && styles.flush, fill && styles.fill, className)} {...rest}>
      {(title !== undefined || action !== undefined) && (
        <header className={styles.header}>
          {collapsible ? (
            <button type="button" className={styles.toggle} aria-expanded={isOpen} onClick={toggle}>
              <Icon.ChevronDown size={16} className={cx(styles.chevron, isOpen && styles.chevronOpen)} />
              <h2 className={styles.title}>{title}</h2>
            </button>
          ) : title !== undefined ? (
            <h2 className={styles.title}>{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </header>
      )}
      {isOpen && <div className={cx(styles.body, fill && styles.fillBody)}>{children}</div>}
    </section>
  );
}
