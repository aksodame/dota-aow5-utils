import type { ReactNode } from 'react';
import { Badge, Button, Icon, Input, Loading, Notice, Panel, cx } from '@/ui';
import { Link } from '@/router';
import { useWikiStrings } from '../i18n';
import { COMMON } from '../i18n/common';
import styles from './Layout.module.css';

/**
 * The pieces every section of the wiki is drawn from.
 *
 * **The catalogue's layout, extended.** A section is the same kind of screen as
 * the item catalogue and the browse list — a sticky filter panel on the left,
 * the content on the right — so it is built from the same panel, the same chips
 * and the same search bar, and somebody who has used one page of the site has
 * used them all. What the wiki adds is the third shape the original had: a list
 * *and* a detail beside it, for sections where you page through records rather
 * than open them one at a time.
 */

type Columns = 'list' | 'three' | 'single';

/**
 * The page grid.
 *
 * `list`: a 300px sidebar and the rest. `three`: sidebar, a second list, and
 * the detail — the monsters section, where the middle column is the items the
 * left one drops. `single`: one wide column, for sections that are a document.
 */
export function WikiShell({ columns = 'list', children }: { columns?: Columns; children: ReactNode }) {
  return <div className={cx(styles.page, COLUMNS[columns])}>{children}</div>;
}

const COLUMNS: Record<Columns, string | undefined> = {
  list: styles.colsList,
  three: styles.colsThree,
  single: styles.colsSingle,
};

interface SidebarProps {
  title?: ReactNode;
  /** The search box at the top of the panel. */
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string };
  /** Filter groups, above the list. */
  filters?: ReactNode;
  /** The count line under the filters: `12 of 340`. */
  count?: ReactNode;
  /** Draws the panel's reset button; disabled when there is nothing to reset. */
  onReset?: () => void;
  resetDisabled?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * The left-hand panel: search, filters, a count, and a list that scrolls on its
 * own so the filters never scroll away from the results they shape.
 */
export function WikiSidebar({ title, search, filters, count, onReset, resetDisabled, children, className }: SidebarProps) {
  const t = useWikiStrings(COMMON);
  return (
    <Panel fill title={title} className={cx(styles.sidebar, className)}>
      {search !== undefined && (
        <form className={styles.search} role="search" onSubmit={(event) => event.preventDefault()}>
          <Icon.Search size={16} className={styles.searchIcon} />
          <Input
            className={styles.searchInput}
            type="search"
            value={search.value}
            placeholder={search.placeholder ?? t.search}
            aria-label={search.label ?? search.placeholder ?? t.search}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => search.onChange(event.target.value)}
          />
        </form>
      )}
      {filters !== undefined && <div className={styles.filters}>{filters}</div>}
      {count !== undefined && <p className={styles.count}>{count}</p>}
      <div className={styles.scroll}>{children}</div>
      {onReset !== undefined && (
        <div className={styles.footer}>
          <Button variant="ghost" size="sm" block disabled={resetDisabled === true} onClick={onReset}>
            {t.reset}
          </Button>
        </div>
      )}
    </Panel>
  );
}

/** A labelled row of filter chips, as the catalogue's sidebar draws them. */
export function FilterGroup({ label, children, action }: { label: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <span>{label}</span>
        {action}
      </div>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}

/** One chip: a toggle, lit in the accent when on. */
export function Chip({
  on,
  onClick,
  children,
  title,
  color,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  /** A colour of its own when lit — the rarity chips use the grade's. */
  color?: string;
}) {
  return (
    <button
      type="button"
      className={cx(styles.chip, on && styles.chipOn)}
      style={on && color !== undefined ? { backgroundColor: color, borderColor: color } : undefined}
      onClick={onClick}
      aria-pressed={on}
      title={title}
    >
      {children}
    </button>
  );
}

/** A labelled checkbox inside a filter panel. */
export function Check({ checked, onChange, children, title }: { checked: boolean; onChange: (next: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className={styles.check} title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** The list inside a sidebar. */
export function WikiList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

interface RowProps {
  /** A real address, so a row can be opened in a new tab. */
  href: string;
  active?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  /** Replaces navigation, for a row that toggles something instead. */
  onClick?: () => void;
  tone?: 'default' | 'boss' | 'elite' | 'dim';
}

/** One record in a sidebar list: its icon, its name, a line of facts and a badge. */
export function WikiRow({ href, active = false, icon, title, meta, badge, onClick, tone = 'default' }: RowProps) {
  return (
    <li className={styles.rowItem}>
      <Link
        to={{ href }}
        className={cx(styles.row, active && styles.rowActive, tone !== 'default' && styles[`tone_${tone}`])}
        aria-current={active ? 'page' : undefined}
        onClick={
          onClick === undefined
            ? undefined
            : (event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onClick();
              }
        }
      >
        {icon !== undefined && <span className={styles.rowIcon}>{icon}</span>}
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{title}</span>
          {meta !== undefined && <span className={styles.rowMeta}>{meta}</span>}
        </span>
        {badge !== undefined && <span className={styles.rowBadge}>{badge}</span>}
      </Link>
    </li>
  );
}

/** The right-hand column: a stack of panels. */
export function WikiDetail({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.detail, className)}>{children}</div>;
}

/** The detail's heading: art, name, the id in small type, and a row of tags. */
export function DetailHeader({
  icon,
  title,
  code,
  tags,
  actions,
}: {
  icon?: ReactNode;
  title: ReactNode;
  code?: string;
  tags?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Panel className={styles.header}>
      <div className={styles.headerRow}>
        {icon !== undefined && <span className={styles.headerIcon}>{icon}</span>}
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>{title}</h1>
          {code !== undefined && <code className={styles.code}>{code}</code>}
          {tags !== undefined && <div className={styles.tags}>{tags}</div>}
        </div>
        {actions !== undefined && <div className={styles.headerActions}>{actions}</div>}
      </div>
    </Panel>
  );
}

/** A small fact chip; a link when it goes somewhere. */
export function Tag({ children, href, title, tone = 'default' }: { children: ReactNode; href?: string; title?: string; tone?: 'default' | 'accent' | 'warn' }) {
  const className = cx(styles.tag, tone !== 'default' && styles[`tag_${tone}`], href !== undefined && styles.tagLink);
  if (href === undefined) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }
  return (
    <Link to={{ href }} className={className} title={title}>
      {children}
    </Link>
  );
}

/** Tabs inside a section — the Sky's tiers, a vendor's two counters. Real links. */
export function WikiSubTabs({
  items,
  active,
  label,
}: {
  items: ReadonlyArray<{ key: string; label: ReactNode; href: string; badge?: ReactNode }>;
  active: string;
  label?: string;
}) {
  return (
    <nav className={styles.subtabs} aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.key}
          to={{ href: item.href }}
          className={cx(styles.subtab, item.key === active && styles.subtabOn)}
          aria-current={item.key === active ? 'page' : undefined}
        >
          {item.label}
          {item.badge !== undefined && (
            <Badge small className={styles.subtabBadge}>
              {item.badge}
            </Badge>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** A two-column table of facts: label on the left, value on the right. */
export function FactGrid({ rows }: { rows: ReadonlyArray<readonly [ReactNode, ReactNode]> }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value], index) => (
        <div key={index} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A plain data table in the site's style. `numeric` columns align right. */
export function DataTable({
  head,
  rows,
  numeric = [],
  compact = false,
}: {
  head: readonly ReactNode[];
  rows: ReadonlyArray<readonly ReactNode[]>;
  numeric?: readonly number[];
  compact?: boolean;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={cx(styles.table, compact && styles.tableCompact)}>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index} className={numeric.includes(index) ? styles.num : undefined}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, index) => (
                <td key={index} className={numeric.includes(index) ? styles.num : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A paragraph of the author's explanation, set apart from the data. */
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

/** The section's own loading and failure states, inside its layout. */
export function WikiLoading() {
  return <Loading />;
}

export function WikiError({ message }: { message: string }) {
  const t = useWikiStrings(COMMON);
  return (
    <Notice tone="error" title={t.failed}>
      {message}
    </Notice>
  );
}

/** For an address whose record is not in the data. */
export function WikiMissing() {
  const t = useWikiStrings(COMMON);
  return (
    <Panel>
      <div className={styles.empty}>
        <strong>{t.missing}</strong>
        <span>{t.missingBody}</span>
      </div>
    </Panel>
  );
}

/** The placeholder in an empty detail column. */
export function WikiEmpty({ children }: { children?: ReactNode }) {
  const t = useWikiStrings(COMMON);
  return (
    <Panel>
      <div className={styles.empty}>{children ?? t.pickOne}</div>
    </Panel>
  );
}

/** The line under a section: which season's rules, and when the data was read. */
export function DataFooter({ ruleset, built }: { ruleset: string; built: string }) {
  const t = useWikiStrings(COMMON);
  return <p className={styles.dataFooter}>{t.footer(ruleset, built)}</p>;
}
