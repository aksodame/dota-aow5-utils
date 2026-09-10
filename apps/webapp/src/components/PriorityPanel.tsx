import { Fragment, useEffect, useMemo, useState } from 'react';
import type { BuildItemPriority, BuildPriority } from 'aow5-api-contract';
import { MAX_PRIORITY_NOTE } from 'aow5-api-contract';
import { canBeDivine, iconUrl, statOutcomes, type StatOutcome } from 'aow5-shared/data';
import type { ItemFull, LocaleDetail, RollTables } from 'aow5-shared/types';
import { Icon, Panel, Select, Textarea, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { formatSpan, formatValue, statLabel } from '@/lib/itemStats';
import {
  affixable,
  entryAt,
  moveStat,
  rankedKeys,
  reconcile,
  setAffix,
  setTarget,
  splitByKind,
  withEntry,
} from '@/lib/priority';
import { qualityVar } from './Tile';
import styles from './PriorityPanel.module.css';

/**
 * What to look for in each piece of gear.
 *
 * The loadout says *which* items a build uses, and for this game that is about
 * half the advice. Every equipment stat is rolled: two copies of one sword
 * differ by how each stat landed, by which stat carries the permanent +30%, and
 * by how far the sword has been reforged. A reader holding the same six items
 * as the author can still be holding six of the wrong ones.
 *
 * So this panel is per item, and it records four things: the stats worth
 * rerolling for *in order*, the roll worth stopping at, which stat the author
 * wants fixed or enhanced, and a line of prose for the part no control covers —
 * usually which half of a passive matters. The maths behind the numbers is in
 * `aow5-shared/data`'s `rolls.ts`, read out of the addon itself; the two facts
 * that shape the whole panel are that a roll has five or six possible outcomes
 * rather than a continuum, and that reforging raises the *floor* rather than
 * the ceiling.
 *
 * One component for reading and for editing, because they are one layout with
 * the controls turned off — the build page and the editor drawing a card two
 * different ways is how they end up disagreeing about what a plan means.
 */

interface PriorityPanelProps {
  /** The gear this build holds, from `prioritySlots`. */
  slots: readonly { slot: number; id: string }[];
  value: BuildPriority;
  /** Absent for a reader: the panel draws the same cards without controls. */
  onChange?: (next: BuildPriority) => void;
}

export function PriorityPanel({ slots, value, onChange }: PriorityPanelProps) {
  const { strings, core } = useApp();
  const store = useItemDetailsStore();
  const editing = onChange !== undefined;

  /*
   * Open where it is being written, shut where it is being read.
   *
   * For a reader this is the most detailed thing on the page and a *second*
   * read: somebody opens a build to see what is in it and comes back to this
   * when they are actually hunting the pieces, so it should not push the notes
   * and the comments a screen and a half down for everybody.
   *
   * For an author it is one of the things they came to fill in, and a panel
   * that hid the work behind a click every time they opened their own build
   * would be hiding it from the one person it belongs to.
   */
  const [open, setOpen] = useState(editing);

  /*
   * The heavy files, asked for when the panel is opened.
   *
   * Everything below needs an item's own `values`, which live in the megabyte
   * the site otherwise defers — so unlike a tooltip, this panel cannot draw
   * anything at all until they arrive. Deferring the fetch to the first open
   * is what keeps a folded panel genuinely free: a build page that nobody
   * expands costs exactly what it did before this existed.
   */
  const request = store?.request;
  const wanted = open && (editing ? slots.length > 0 : value.length > 0);
  useEffect(() => {
    if (wanted) request?.();
  }, [wanted, request]);

  /**
   * The cards, with everything joined on.
   *
   * A reader sees only the slots the author wrote about — a card with no advice
   * on it is a heading over nothing — while the editor sees every piece of gear
   * on the board, because an empty card is the invitation to fill it in.
   */
  const cards = useMemo(() => {
    if (store?.full == null || store.rolls == null) return [];
    const rolls = store.rolls;
    return slots.flatMap(({ slot, id }) => {
      const full = store.full?.[id];
      if (full === undefined) return [];
      const entry = reconcile(rolls, full.values, entryAt(value, slot));
      if (!editing && !value.some((stored) => stored.slot === slot)) return [];
      return [{ slot, id, full, entry, detail: store.detail?.[id] }];
    });
  }, [slots, value, store?.full, store?.detail, store?.rolls, editing]);

  if (slots.length === 0 && editing) {
    return (
      <Panel title={strings.priority.heading} collapsible open={open} onOpenChange={setOpen}>
        <p className={styles.lead}>{strings.priority.empty}</p>
      </Panel>
    );
  }
  /*
   * Nothing written, nothing to read.
   *
   * Judged on the stored priority rather than on the cards: the cards are empty
   * until the item data has been fetched, and that only happens once somebody
   * opens the panel — deciding from them would hide the very heading you have
   * to click to fill them in.
   */
  if (!editing && value.length === 0) return null;

  const rolls = store?.rolls ?? null;
  const loading = rolls === null || store?.full == null;
  /*
   * The count is drawn from the board while the panel is shut, because that is
   * when it does its work: a folded heading reading "Reforge priority · 6
   * items" is what tells somebody there is anything behind it. Once open, the
   * cards themselves say it.
   */
  const count = open ? cards.length : editing ? slots.length : value.length;

  return (
    <Panel
      title={strings.priority.heading}
      collapsible
      open={open}
      onOpenChange={setOpen}
      action={
        count > 0 ? (
          <span className={styles.count}>
            {count} {strings.priority.items}
          </span>
        ) : undefined
      }
    >
      <p className={styles.lead}>{editing ? strings.priority.lead : strings.priority.leadReading}</p>

      {loading ? (
        <p className={styles.lead}>{strings.common.loading}</p>
      ) : (
        <div className={styles.cards}>
          {cards.map(({ slot, id, full, entry, detail }) => (
            <ItemPriorityCard
              key={slot}
              name={core?.byId.get(id)?.name ?? id}
              icon={core?.byId.get(id)?.icon ?? full.icon}
              quality={full.quality}
              full={full}
              detail={detail}
              rolls={rolls}
              entry={entry}
              {...(onChange !== undefined
                ? { onChange: (next: BuildItemPriority) => onChange(withEntry(value, next)) }
                : {})}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

interface CardProps {
  name: string;
  icon: string;
  quality: number;
  full: ItemFull;
  detail: LocaleDetail | undefined;
  rolls: RollTables;
  entry: BuildItemPriority;
  onChange?: (next: BuildItemPriority) => void;
}

function ItemPriorityCard({ name, icon, quality, full, detail, rolls, entry, onChange }: CardProps) {
  const { strings } = useApp();
  const keys = rankedKeys(rolls, full.values, entry);
  const editing = onChange !== undefined;

  const levels = Array.from({ length: rolls.maxReforgeLevel + 1 }, (_, level) => level);

  /*
   * The item's stats, then its passive's own numbers.
   *
   * Two thirds of this game's equipment carries a passive, and the figures
   * inside its sentence roll within a band exactly as the stats above do — up
   * to five of them on one item — so a plan that could not name them was
   * leaving half of some items unsaid. Headings appear only when there is
   * something on both sides of the line to tell apart.
   */
  const { base: baseKeys, passive: passiveKeys } = splitByKind(keys);
  const both = baseKeys.length > 0 && passiveKeys.length > 0;
  const groups = [
    { kind: 'base' as const, label: strings.priority.groupBase, keys: baseKeys },
    { kind: 'passive' as const, label: strings.priority.groupPassive, keys: passiveKeys },
  ];

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span className={styles.art} style={{ ['--tile-rarity' as string]: qualityVar(quality) }}>
          <img src={iconUrl(icon)} alt="" loading="lazy" decoding="async" />
        </span>
        <span className={styles.name} title={name}>
          {name}
        </span>

        {/*
          The divine forge, on the card rather than on a row.

          It is one roll made on the whole item when it drops — a fraction of
          high-quality items carry it, and from then on it multiplies every stat
          it reaches — so a box per stat would have been offering a choice the
          game does not. Ticking it re-quotes every figure below for a forged
          copy, which is the whole of what it does here.
        */}
        {editing ? (
          <label className={styles.divine} title={divineTitle(strings, rolls)}>
            <input
              type="checkbox"
              checked={entry.divine}
              onChange={(event) => onChange({ ...entry, divine: event.target.checked })}
            />
            {strings.priority.divineShort}
          </label>
        ) : (
          entry.divine && (
            <span
              className={cx(styles.mark, styles.markRead, styles.markDivine)}
              title={divineTitle(strings, rolls)}
            >
              {strings.priority.divineShort}
            </span>
          )
        )}

        {/*
          The reforge level the advice assumes, per item rather than per build.
          Nobody reforges six pieces equally: the plan is usually one piece to
          nine and the rest to whatever was cheap.
        */}
        <label className={styles.reforge}>
          <span className={styles.reforgeLabel}>{strings.priority.reforge}</span>
          {editing ? (
            <Select
              className={styles.level}
              value={String(entry.reforge)}
              aria-label={strings.priority.reforge}
              onChange={(event) => onChange({ ...entry, reforge: Number(event.target.value) })}
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          ) : (
            <span className={styles.levelRead}>{entry.reforge}</span>
          )}
        </label>
      </header>

      {keys.length === 0 ? (
        <p className={styles.none}>{strings.priority.nothingRolls}</p>
      ) : (
        /*
         * One list, two groups, one grid.
         *
         * The groups are two different kinds of decision — a stat can be
         * rerolled towards, a passive number is drawn once when the item drops
         * — but they share a grid so their columns line up down the whole card.
         * A heading is a row spanning every track rather than a second list,
         * which is what keeps that true.
         */
        <ol className={cx(styles.stats, !editing && styles.statsRead)}>
          {groups.map(({ label, keys: groupKeys, kind }) =>
            groupKeys.length === 0 ? null : (
              <Fragment key={kind}>
                {both && (
                  <li className={styles.groupRow}>
                    <span className={styles.groupLabel}>{label}</span>
                  </li>
                )}
                {groupKeys.map((key, index) => (
                  <StatRow
                    key={key}
                    rank={index + 1}
                    statKey={key}
                    base={Number(full.values[key] ?? 0)}
                    label={statLabel(key, detail)}
                    rolls={rolls}
                    entry={entry}
                    first={index === 0}
                    last={index === groupKeys.length - 1}
                    {...(onChange !== undefined ? { onChange } : {})}
                  />
                ))}
              </Fragment>
            ),
          )}
        </ol>
      )}

      {/*
        The half a set of controls cannot express.

        An item's interesting number is often inside its passive — "the shield
        part matters, the damage does not", "anything over 40% is enough" — and
        those are sentences rather than fields. Short on purpose: the long
        version is the build's own notes.
      */}
      {editing ? (
        <Textarea
          className={styles.note}
          value={entry.note}
          rows={2}
          maxLength={MAX_PRIORITY_NOTE}
          placeholder={strings.priority.noteHint}
          aria-label={strings.priority.note}
          onChange={(event) => onChange({ ...entry, note: event.target.value })}
        />
      ) : (
        entry.note.trim() !== '' && <p className={styles.noteRead}>{entry.note}</p>
      )}
    </article>
  );
}

interface StatRowProps {
  rank: number;
  statKey: string;
  base: number;
  label: string;
  rolls: RollTables;
  entry: BuildItemPriority;
  first: boolean;
  last: boolean;
  onChange?: (next: BuildItemPriority) => void;
}

function StatRow({ rank, statKey, base, label, rolls, entry, first, last, onChange }: StatRowProps) {
  const { strings } = useApp();
  const editing = onChange !== undefined;
  const isFixed = entry.fixed === statKey;
  const isEnhanced = entry.enhanced === statKey;

  /*
   * What this stat can come out as, best first — and it depends on both marks
   * above it: a fixed stat is drawn once, at the seed's own iteration count,
   * and carries 30% on top for good. So marking one changes the numbers in the
   * list beside it, which is the point of showing them here rather than in a
   * table somewhere.
   */
  /*
   * The card's forge, applied where the forge reaches.
   *
   * It is the item that is forged, not the stat — but it skips the `ability_*`
   * bookkeeping, so a card with the box ticked still has rows whose numbers do
   * not move. `canBeDivine` is the addon's own rule for which.
   */
  const isDivine = entry.divine && canBeDivine(statKey);
  const canAffix = affixable(rolls, statKey);

  const { outcomes } = statOutcomes(rolls, statKey, base, entry.reforge, { fixed: isFixed, divine: isDivine });
  const stored = entry.stats.find((stat) => stat.key === statKey)?.target ?? null;
  // A rank the current level cannot reach — the level was lowered under it, or
  // the marks changed the set. Clamped for display; saved as it is read.
  const target = stored === null ? null : Math.min(stored, outcomes.length - 1);
  const chosen = target === null ? undefined : outcomes[target];

  const range = describeRange(statKey, outcomes);

  return (
    <li className={cx(styles.row, isFixed && styles.rowFixed)}>
      <span className={styles.rank}>{rank}</span>

      <span className={styles.statName} title={label}>
        {label}
      </span>

      <span className={styles.range} title={strings.priority.rangeHint}>
        {range}
      </span>

      {editing ? (
        <Select
          className={styles.target}
          // The chosen figure wears its own grade, so a card can be read for
          // its colours before it is read for its numbers.
          style={target === null ? undefined : { color: gradeColour(target, outcomes.length) }}
          value={target === null ? '' : String(target)}
          aria-label={`${label} — ${strings.priority.target}`}
          onChange={(event) =>
            onChange({
              ...setTarget(entry, statKey, event.target.value === '' ? null : Number(event.target.value)),
            })
          }
        >
          {/*
            Explicitly the ordinary colour.

            A `<select>` paints its options in its own colour unless they carry
            one, and this one is painted by whichever roll is selected — so
            without this, choosing the best roll turned "any roll" gold too, and
            the list read as though nothing had been chosen at all.
          */}
          <option value="" style={{ color: 'var(--text)' }}>
            {strings.priority.anyRoll}
          </option>
          {outcomes.map((outcome, index) => (
            <option key={outcome.roll} value={index} style={{ color: gradeColour(index, outcomes.length) }}>
              {/* "at least", because a roll better than the one you were
                  holding out for is not a failure. */}
              {`≥ ${formatValue(statKey, outcome.value)}`}
            </option>
          ))}
        </Select>
      ) : (
        <span
          className={cx(styles.target, styles.targetRead)}
          style={chosen === undefined ? undefined : { color: gradeColour(target ?? 0, outcomes.length) }}
        >
          {/*
            Blank where no roll was asked for, rather than "any roll" eight
            times down a card. Most stats on most items are worth having and not
            worth chasing, so the ordinary case should be the quiet one — and
            what a reader is looking for is the two rows that *do* carry a
            number.
          */}
          {chosen === undefined ? '' : `≥ ${formatValue(statKey, chosen.value)}`}
        </span>
      )}

      <span className={styles.marks}>
        {/*
          Only where the game could put one.

          No affix lands on a passive's numbers — the fixed stat and the
          enhancement are drawn from the item's *stat* pool — so those rows carry
          no marks rather than two that would never be true. Spelled out rather
          than initialled: "F" and "E" are legible only to somebody who already
          knows what the panel does, and they are not even letters from the
          right word in Russian or Chinese.
        */}
        {canAffix && (
          <>
        <Mark
          on={isFixed}
          tone="fixed"
          label={strings.priority.fixed}
          title={`${strings.priority.fixed} — ${strings.priority.fixedHint}`}
          {...(onChange !== undefined ? { onClick: () => onChange(setAffix(entry, 'fixed', statKey)) } : {})}
        />
        <Mark
          on={isEnhanced}
          tone="enhanced"
          label={strings.priority.enhanced}
          title={`${strings.priority.enhanced} — ${strings.priority.enhancedHint} +${rolls.enhancedBonusPct[0]}–${rolls.enhancedBonusPct[1]}%, ${strings.priority.fromLevel} ${rolls.enhancedLevel[0]}–${rolls.enhancedLevel[1]}.`}
          {...(onChange !== undefined ? { onClick: () => onChange(setAffix(entry, 'enhanced', statKey)) } : {})}
        />
          </>
        )}
      </span>

      {editing && (
        <span className={styles.move}>
          <button
            type="button"
            className={styles.moveButton}
            disabled={first}
            title={strings.priority.moveUp}
            aria-label={`${label} — ${strings.priority.moveUp}`}
            onClick={() => onChange(moveStat(entry, statKey, -1))}
          >
            <Icon.ChevronUp size={14} />
          </button>
          <button
            type="button"
            className={styles.moveButton}
            disabled={last}
            title={strings.priority.moveDown}
            aria-label={`${label} — ${strings.priority.moveDown}`}
            onClick={() => onChange(moveStat(entry, statKey, 1))}
          >
            <Icon.ChevronDown size={14} />
          </button>
        </span>
      )}

    </li>
  );
}

/**
 * One of an item's two affixes, as a badge or as a button.
 *
 * `tone` is what separates them: the enhancement wears the site's primary
 * accent and the fixed stat a second one, so a card says which is which before
 * anybody reads either word — and a row that carries both does not look like a
 * row that carries one twice.
 */
function Mark({
  on,
  tone,
  label,
  title,
  onClick,
}: {
  on: boolean;
  tone: 'fixed' | 'enhanced';
  label: string;
  title: string;
  onClick?: () => void;
}) {
  const toned = tone === 'fixed' ? styles.markFixed : styles.markEnhanced;
  if (onClick === undefined) {
    /*
     * A reader's badge, not a button.
     *
     * Its own class rather than the pressed one: on a build page nothing here
     * can be clicked, and a badge wearing a hand cursor is a promise the page
     * does not keep. Drawn only where it means something, so a card being read
     * is not a row of empty boxes.
     */
    return on ? (
      <span className={cx(styles.mark, styles.markRead, toned)} title={title}>
        {label}
      </span>
    ) : null;
  }
  return (
    <button
      type="button"
      className={cx(styles.mark, styles.markButton, on && styles.markOn, on && toned)}
      aria-pressed={on}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/**
 * What the divine box means, spelled out where there is room for a sentence.
 *
 * The numbers in it are the addon's, so they follow the pak rather than this
 * file: a rebalance moves them and the tooltip moves with them.
 */
function divineTitle(strings: { priority: { divine: string; divineHint: string; fromLevel: string } }, rolls: RollTables): string {
  const { bonusPct, abilityBonusPct, minQuality, level, chancePct } = rolls.divine;
  return (
    `${strings.priority.divine} — ${strings.priority.divineHint} ` +
    `+${bonusPct}% / +${abilityBonusPct}%, q${minQuality}+, ${chancePct}%, ` +
    `${strings.priority.fromLevel} ${level[0]}–${level[1]}.`
  );
}

/**
 * A roll's grade, on the game's own rarity ramp.
 *
 * The reachable rolls are a short ladder — five or six rungs — and which rung
 * a target sits on is the whole content of the choice. Painting it with the
 * same 1-7 scale the game paints item quality with means the ladder reads at a
 * glance and needs no legend: those colours already mean "better" to anybody
 * who has watched an item drop.
 */
function gradeColour(index: number, count: number): string {
  if (count <= 1) return qualityVar(7);
  // `index` counts down from the best roll, so invert it before scaling.
  const best = count - 1 - index;
  return qualityVar(1 + Math.round((best / (count - 1)) * 6));
}

/**
 * The stat's whole reachable span, as one string.
 *
 * Shown beside every row whether or not a target is set, because the target is
 * only meaningful against it — "≥ 145" says nothing until you know the item
 * runs 96 to 145. A stat that cannot move at all prints as one number rather
 * than as a range of one.
 */
function describeRange(key: string, outcomes: StatOutcome[]): string {
  const values = outcomes.map((outcome) => outcome.value);
  return formatSpan(key, Math.min(...values), Math.max(...values));
}
