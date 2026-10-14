import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ItemFull, RollTables } from 'aow5-shared/types';
import {
  applyEffects,
  copyStats,
  heroStatsAtLevel,
  seasonalPatch,
  type EffectsResult,
  type HeroStatsFile,
  type HeroesWikiFile,
  type HeroesWikiLocale,
  type ItemsExtraFile,
  type ProgressionLocale,
  newRollState,
} from 'aow5-shared/wiki';
import { Badge, Button, Panel, Select, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { BlankTile, ItemTile } from '@/components/Tile';
import { RichText } from '@/components/RichText';
import { useWikiStrings } from '../i18n';
import { CALC, type SlotKind } from '../i18n/calc';
import { DataFooter, Note, WikiError, WikiLoading, WikiMissing, day, num, useWikiData, useWikiPageMeta } from '../kit';
import type { SectionProps } from '../WikiPage';
import { CalcPicker } from './calc/CalcPicker';
import { HeroBase } from './calc/HeroBase';
import { ItemStatsEditor } from './calc/ItemStatsEditor';
import { ancestralBase, itemValues, linksOf, plainText, useItemsExtra } from './calc/itemData';
import {
  GROUPS,
  autoBase,
  derivePools,
  digitsFor,
  isOverridden,
  isSeasonKey,
  parseBase,
  rowTotal,
  type CalcInput,
  type RowDef,
} from './calc/model';
import {
  clearHeroOverrides,
  equipped,
  freshState,
  getSlot,
  sameRef,
  setSlot,
  useCalcState,
  type CalcState,
  type Entry,
  type SlotRef,
} from './calc/state';
import styles from './CalcPage.module.css';

/**
 * The stats calculator («Калькулятор», still marked as work in progress by the
 * wiki's author): a hero's panel at level 30 computed from the game, the six
 * slots and the special ones on top, every item rolled the way the reader's
 * copy rolled, and the item passives that move the panel itself.
 *
 * One address, `/wiki/calc`. A build lives in the reader's browser
 * (`localStorage`), not in the URL — it is a scratchpad, not something to link.
 */
export default function CalcPage({ path }: SectionProps) {
  const t = useWikiStrings(CALC);
  const { lang } = useApp();
  const store = useItemDetailsStore();
  const extra = useItemsExtra();
  const [state, update] = useCalcState();
  const [sel, setSel] = useState<SlotRef | null>(null);
  const [pick, setPick] = useState<SlotRef | null>(null);
  const { data, error } = useWikiData<[HeroStatsFile, HeroesWikiFile, HeroesWikiLocale, ProgressionLocale]>([
    'herostats.json',
    'heroes-wiki.json',
    'locale.{lang}.heroes-wiki.json',
    'locale.{lang}.progression.json',
  ]);
  const missing = path.length > 0;
  useWikiPageMeta('calc', path, null, missing);

  useEffect(() => {
    store?.request();
  }, [store]);

  const full = store?.full ?? null;
  const tables = store?.rolls ?? null;
  const file = data?.[0] ?? null;

  const level = useMemo(() => (file !== null ? heroStatsAtLevel(file, state.hero) : undefined), [file, state.hero]);

  const input: CalcInput | null = useMemo(
    () =>
      file === null
        ? null
        : { file, level, primary: file.heroes[state.hero]?.primary ?? 'str', base: state.base, mode: state.mode },
    [file, level, state.hero, state.base, state.mode],
  );

  // The build's pool: every equipped item's rolled stats, then what item effects add.
  const { sums, fx } = useMemo(
    () => buildPool(state, input, full, tables, extra),
    [state, input, full, tables, extra],
  );

  if (missing) return <WikiMissing />;

  const heroes = heroList(data);
  const heroName = heroes.find((h) => h.short === state.hero)?.name ?? state.hero;
  const profession = data?.[1].heroes.find((h) => h.short === state.hero)?.profession ?? state.hero;

  const selected = sel !== null ? getSlot(state, sel) : null;

  const choose = (id: string) => {
    if (pick === null) return;
    const value: Entry = { ...newRollState(), id };
    update((s) => setSlot(s, pick, value));
    setSel(pick);
    setPick(null);
  };

  return (
    <div className={styles.page}>
      <Note>
        <b className={styles.wip}>{t.wipTitle}.</b> {t.wip}
      </Note>
      {error !== null && <WikiError message={error} />}
      {data === null || input === null ? (
        error === null && <WikiLoading />
      ) : (
        <>
          <div className={styles.grid}>
            <StatsPanel
              state={state}
              update={update}
              input={input}
              sums={sums}
              fx={fx}
              heroes={heroes}
              heroName={heroName}
              full={full}
              onReset={() => {
                update(() => freshState());
                setSel(null);
              }}
            />
            <div className={styles.side}>
              <Inventory
                state={state}
                sel={sel}
                onSelect={(ref) => setSel((cur) => (sameRef(cur, ref) ? null : ref))}
                onPick={(ref) => setPick(ref)}
                onRemove={(ref) => {
                  update((s) => setSlot(s, ref, null));
                  if (sameRef(sel, ref)) setSel(null);
                }}
              />
              <Panel>
                {sel === null || selected === null ? (
                  <p className={styles.hint}>{t.editor.empty}</p>
                ) : (
                  <SlotEditor
                    kind={sel.kind}
                    entry={selected}
                    extra={extra}
                    onChange={(next) => update((s) => setSlot(s, sel, next))}
                  />
                )}
              </Panel>
            </div>
          </div>
          <HeroBase file={data[0]} short={state.hero} level={level} heroName={heroName} prog={data[3]} base={state.base} />
          <DataFooter ruleset={data[0].season} built={day(data[0].generatedAt, lang)} />
          <CalcPicker
            kind={pick?.kind ?? null}
            profession={profession}
            heroName={heroName}
            onSelect={choose}
            onClose={() => setPick(null)}
          />
        </>
      )}
    </div>
  );
}

/** The hero select's list: the wiki's hero order, then any the stats file has besides. */
function heroList(data: [HeroStatsFile, HeroesWikiFile, HeroesWikiLocale, ProgressionLocale] | null): Array<{ short: string; name: string }> {
  if (data === null) return [];
  const [file, hw, hwLocale] = data;
  const order = [...hw.heroes.map((h) => h.short), ...Object.keys(file.heroes)].filter((s, i, all) => all.indexOf(s) === i && file.heroes[s] !== undefined);
  return order.map((short) => ({ short, name: hwLocale.heroes[file.heroes[short]!.hero]?.name ?? short }));
}

function buildPool(
  state: CalcState,
  input: CalcInput | null,
  full: Record<string, ItemFull> | null,
  tables: RollTables | null,
  extra: ItemsExtraFile | null,
): { sums: Record<string, number>; fx: EffectsResult } {
  const empty = { sums: {}, fx: { extra: {}, notes: [] } };
  if (full === null || tables === null || input === null) return empty;
  const links = linksOf(full);
  const list = equipped(state)
    .filter((e) => full[e.id] !== undefined)
    .map((e) => {
      const item = full[e.id]!;
      const stoneId = links.fromStone.get(e.id);
      const stone = stoneId !== undefined ? full[stoneId] : undefined;
      return { id: e.id, stats: copyStats(tables, itemValues(item, extra), stone !== undefined ? itemValues(stone, extra) : null, e) };
    });
  const sums: Record<string, number> = {};
  for (const e of list) for (const [k, v] of Object.entries(e.stats)) sums[k] = (sums[k] ?? 0) + v;
  const fx = applyEffects(list, (P) => derivePools(input, P), (id) => ancestralBase(full, id));
  for (const [k, v] of Object.entries(fx.extra)) sums[k] = (sums[k] ?? 0) + v;
  return { sums, fx };
}

// ---------------------------------------------------------------------------
// The panel

function StatsPanel({
  state,
  update,
  input,
  sums,
  fx,
  heroes,
  heroName,
  full,
  onReset,
}: {
  state: CalcState;
  update: (fn: (s: CalcState) => CalcState) => void;
  input: CalcInput;
  sums: Record<string, number>;
  fx: EffectsResult;
  heroes: Array<{ short: string; name: string }>;
  heroName: string;
  full: Record<string, ItemFull> | null;
  onReset: () => void;
}) {
  const t = useWikiStrings(CALC);
  const { lang } = useApp();
  const lvl = input.file.level;
  const h = input.file.heroes[state.hero];
  const overrides = Object.keys(state.base).filter((k) => !isSeasonKey(k)).length;
  const fmt = (v: number, dec: number | undefined) => (v ? num(v, lang, digitsFor(v, dec)) : '0');

  const note = [
    h !== undefined ? t.note.computed(lvl) : t.note.noData,
    input.primary === 'uni' ? t.note.universal : t.note.primary(input.primary),
    overrides ? t.note.overrides(overrides) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const setBase = (key: string, value: number | 'clear') =>
    update((s) => {
      const base = { ...s.base };
      if (value === 'clear') delete base[key];
      else base[key] = value;
      return { ...s, base };
    });

  return (
    <Panel title={t.title} className={styles.statsPanel}>
      <div className={styles.controls}>
        <label className={styles.heroField}>
          <span className={styles.heroLabel}>{t.hero}</span>
          <Select
            value={state.hero}
            onChange={(event) => {
              const hero = event.target.value;
              // A new hero forgets the manual base, but not the season levels — those are the player's.
              update((s) => ({ ...s, hero, base: clearHeroOverrides(s.base) }));
            }}
          >
            {heroes.map((x) => (
              <option key={x.short} value={x.short}>
                {x.name}
              </option>
            ))}
          </Select>
        </label>
        <span className={styles.heroNote}>{note}</span>
      </div>
      <div className={styles.controls}>
        <div className={styles.modes} role="group" aria-label={t.modes.label}>
          <button
            type="button"
            className={cx(styles.mode, state.mode === 'delta' && styles.modeOn)}
            aria-pressed={state.mode === 'delta'}
            title={t.modes.deltaTitle}
            onClick={() => update((s) => ({ ...s, mode: 'delta' }))}
          >
            {t.modes.delta}
          </button>
          <button
            type="button"
            className={cx(styles.mode, state.mode === 'full' && styles.modeOn)}
            aria-pressed={state.mode === 'full'}
            title={t.modes.fullTitle}
            onClick={() => update((s) => ({ ...s, mode: 'full' }))}
          >
            {t.modes.full}
          </button>
        </div>
        <Button size="sm" variant="ghost" title={t.recalcTitle} onClick={() => update((s) => ({ ...s, base: clearHeroOverrides(s.base) }))}>
          {t.recalc}
        </Button>
        <Button size="sm" variant="ghost" title={t.resetAllTitle} onClick={onReset}>
          {t.resetAll}
        </Button>
      </div>
      <p className={styles.hint}>{t.hint}</p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t.head.stat}</th>
              <th className={styles.num}>{t.head.base(lvl)}</th>
              <th className={styles.num}>{t.head.items}</th>
              <th className={styles.num}>{t.head.plus}</th>
              <th className={styles.num}>{t.head.total}</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <Group key={group.id} title={t.groups[group.id]}>
                {group.rows.map((row) => (
                  <StatRow key={row.key} row={row} input={input} sums={sums} heroName={heroName} fmt={fmt} onBase={setBase} />
                ))}
              </Group>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.hint}>{t.formulas(input.file.attrBonus, (v) => num(v, lang, 3))}</p>

      <Effects fx={fx} state={state} full={full} />
    </Panel>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <tr className={styles.group}>
        <td colSpan={5}>{title}</td>
      </tr>
      {children}
    </>
  );
}

function StatRow({
  row,
  input,
  sums,
  heroName,
  fmt,
  onBase,
}: {
  row: RowDef;
  input: CalcInput;
  sums: Record<string, number>;
  heroName: string;
  fmt: (v: number, dec: number | undefined) => string;
  onBase: (key: string, value: number | 'clear') => void;
}) {
  const t = useWikiStrings(CALC);
  const { lang } = useApp();
  const total = rowTotal(input, row, sums);
  const season = row.kind.type === 'season' ? row.kind.max : undefined;
  const over = isOverridden(input, row.key);
  const auto = !over && season === undefined && total.base ? fmt(total.base, row.dec) : '';
  const hasHero = autoBase(input, row.key) !== null;
  const title =
    season !== undefined ? t.cell.seasonRange(season) : over ? t.cell.override : auto !== '' && hasHero ? t.cell.fromHero(heroName, input.file.level) : '';

  const label = t.rows[row.key] ?? row.key;
  const cell = (
    <BaseCell
      value={over ? String(input.base[row.key]) : auto}
      override={over}
      fromHero={!over && auto !== ''}
      title={title}
      label={label}
      seasonMax={season}
      onCommit={(v) => onBase(row.key, v)}
    />
  );

  if (season !== undefined) {
    const pct = 2 * total.base;
    return (
      <tr>
        <td className={styles.name}>{label}</td>
        <td className={styles.num}>{cell}</td>
        <td className={cx(styles.num, styles.zero)}>—</td>
        <td className={cx(styles.num, styles.zero)}>—</td>
        <td className={cx(styles.num, styles.total, styles.wrap)} title={t.cell.seasonTitle}>
          {pct ? t.cell.seasonTotal(num(pct, lang, 0)) : '—'}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className={styles.name}>
        {label}
        {over && (
          <Badge small className={styles.mark}>
            {t.cell.overrideMark}
          </Badge>
        )}
      </td>
      <td className={styles.num}>{cell}</td>
      <td className={cx(styles.num, !total.items && styles.zero)}>{fmt(total.items, row.dec)}</td>
      <td
        className={cx(styles.num, total.fromAttrs ? styles.attr : styles.zero)}
        title={total.pct ? t.cell.pctBonus(`${num(total.pct, lang, 1)}%`) : undefined}
      >
        {total.fromAttrs ? fmt(total.fromAttrs, row.dec) : '—'}
      </td>
      <td className={cx(styles.num, styles.total)}>{fmt(total.sum, row.dec)}</td>
    </tr>
  );
}

/**
 * The editable "Base" cell.
 *
 * While the field has focus it shows what is being typed — `1,` stays `1,` —
 * and every keystroke that parses updates the numbers around it, without
 * redrawing the field or losing the caret. On blur it shows the stored value
 * again (or the computed one, if it was cleared).
 */
function BaseCell({
  value,
  override,
  fromHero,
  title,
  label,
  seasonMax,
  onCommit,
}: {
  value: string;
  override: boolean;
  fromHero: boolean;
  title: string;
  label: string;
  seasonMax: number | undefined;
  onCommit: (value: number | 'clear') => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={cx(styles.input, override && styles.inputOverride, fromHero && styles.inputHero)}
      value={draft ?? value}
      placeholder="0"
      title={title}
      aria-label={label}
      onFocus={() => setDraft(value)}
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const text = event.target.value;
        const parsed = parseBase(text, seasonMax);
        if (parsed === undefined) {
          setDraft(text);
          return;
        }
        // A season level is a whole number with a ceiling: the field shows the clamped value.
        setDraft(seasonMax !== undefined && parsed !== 'clear' && String(parsed) !== text.trim() ? String(parsed) : text);
        onCommit(parsed);
      }}
    />
  );
}

/** Counted effects (already in the "Items" column) and the passives that never reach the panel. */
function Effects({ fx, state, full }: { fx: EffectsResult; state: CalcState; full: Record<string, ItemFull> | null }) {
  const t = useWikiStrings(CALC).effects;
  const { lang, core } = useApp();
  const store = useItemDetailsStore();
  const n = (v: number) => num(v, lang, 1);
  const name = (id: string) => core?.byId.get(id)?.name ?? id;
  const counted = fx.notes.filter((x) => x.facts !== null);
  const modelled = new Set(fx.notes.map((x) => x.itemId));
  const unmodelled =
    full === null
      ? []
      : equipped(state).filter((e) => {
          const desc = store?.detail?.[e.id]?.desc;
          return desc !== undefined && desc.length > 0 && !modelled.has(e.id);
        });

  return (
    <div className={styles.fx}>
      <div className={styles.sub}>{t.title}</div>
      {counted.map((x, i) => (
        <div key={`${x.itemId}:${i}`} className={styles.fxRow}>
          <div className={styles.fxName}>
            {name(x.itemId)}
            {x.conditional && ` ${t.conditional}`}
          </div>
          <div className={styles.fxLine}>{t.line(x.facts!, n)}</div>
        </div>
      ))}
      {unmodelled.length > 0 && (
        <div className={cx(styles.fxRow, styles.fxMuted)}>
          <div className={styles.fxName}>{t.unmodelled}</div>
          {unmodelled.map((e, i) => {
            const heading = (store?.detail?.[e.id]?.desc ?? []).find((node) => node.t === 'el' && node.tag === 'h1');
            const action = heading !== undefined ? plainText([heading]).replace(/:\s*$/, '') : '';
            return (
              <div key={`${e.id}:${i}`} className={styles.fxLine}>
                {name(e.id)}
                {action !== '' && ` — ${action}`}
              </div>
            );
          })}
        </div>
      )}
      {counted.length === 0 && unmodelled.length === 0 && <p className={styles.hint}>{t.none}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The inventory

function Inventory({
  state,
  sel,
  onSelect,
  onPick,
  onRemove,
}: {
  state: CalcState;
  sel: SlotRef | null;
  onSelect: (ref: SlotRef) => void;
  onPick: (ref: SlotRef) => void;
  onRemove: (ref: SlotRef) => void;
}) {
  const t = useWikiStrings(CALC).inv;
  const slot = (ref: SlotRef, label: string) => (
    <Slot key={`${ref.kind}${ref.i}`} id={getSlot(state, ref)?.id ?? null} label={label} active={sameRef(sel, ref)} onOpen={() => onSelect(ref)} onPick={() => onPick(ref)} onRemove={() => onRemove(ref)} />
  );
  const special: Array<Exclude<SlotKind, 'slot' | 'rune'>> = ['neutral', 'pet', 'bag', 'soul'];
  return (
    <Panel title={t.title} action={<span className={styles.heroNote}>{t.note}</span>}>
      <div className={styles.inv}>
        <div className={styles.slots}>{state.slots.map((_, i) => slot({ kind: 'slot', i }, t.slot(i + 1)))}</div>
        <div className={styles.extraSlots}>
          {special.map((kind) => (
            <div key={kind} className={styles.labelled}>
              {slot({ kind, i: 0 }, t.kinds[kind])}
              <span className={styles.slotLabel}>{t.kinds[kind]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.sub}>{t.runes}</div>
      <div className={styles.runes}>{state.runes.map((_, i) => slot({ kind: 'rune', i }, t.rune(i + 1)))}</div>
    </Panel>
  );
}

function Slot({
  id,
  label,
  active,
  onOpen,
  onPick,
  onRemove,
}: {
  id: string | null;
  label: string;
  active: boolean;
  onOpen: () => void;
  onPick: () => void;
  onRemove: () => void;
}) {
  const t = useWikiStrings(CALC).inv;
  const { core } = useApp();
  const item = id !== null ? core?.byId.get(id) : undefined;
  if (id === null || item === undefined) {
    return (
      <span className={styles.slot} title={label}>
        <BlankTile onClick={onPick} label={`${label}: ${t.add}`} />
        <span className={styles.plus} aria-hidden>
          +
        </span>
      </span>
    );
  }
  return (
    <span className={cx(styles.slot, active && styles.slotOn)} title={`${item.name} (${item.id})`}>
      <ItemTile item={item} onClick={onOpen} />
      <button type="button" className={styles.remove} title={t.remove} aria-label={`${t.remove}: ${item.name}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The selected slot

function SlotEditor({
  kind,
  entry,
  extra,
  onChange,
}: {
  kind: SlotKind;
  entry: Entry | { id: string };
  extra: ItemsExtraFile | null;
  onChange: (next: Entry) => void;
}) {
  const t = useWikiStrings(CALC).editor;
  const { core } = useApp();
  const store = useItemDetailsStore();
  const item = core?.byId.get(entry.id);
  const desc = store?.detail?.[entry.id]?.desc;
  const head = item !== undefined && (
    <div className={styles.editorHead}>
      <span className={styles.editorIcon}>
        <ItemTile item={item} />
      </span>
      <span className={styles.editorName}>{item.name}</span>
    </div>
  );

  if (kind === 'rune') {
    const own = extra?.items[entry.id];
    const patch = extra !== null ? seasonalPatch(extra, entry.id, 's2') : undefined;
    const target = own?.gemTarget;
    const targetName = target !== undefined ? (core?.heroes.spells.get(target)?.name ?? target) : null;
    const data = Object.entries(patch?.gemData ?? own?.gemData ?? {});
    return (
      <div className={styles.editor}>
        {head}
        <p className={styles.hint}>{t.rune(targetName)}</p>
        {desc !== undefined && desc.length > 0 && (
          <div className={styles.desc}>
            <RichText nodes={desc} />
          </div>
        )}
        {data.length > 0 && (
          <p className={styles.hint}>
            {t.params} {data.map(([k, v]) => `${k}: ${v}`).join(', ')}
          </p>
        )}
      </div>
    );
  }

  const state: Entry = 'roll' in entry ? entry : { ...newRollState(), id: entry.id };
  return (
    <div className={styles.editor}>
      {head}
      {kind === 'soul' && (
        <>
          <p className={styles.hint}>{t.soul}</p>
          {desc !== undefined && desc.length > 0 && (
            <div className={styles.desc}>
              <RichText nodes={desc} />
            </div>
          )}
        </>
      )}
      <ItemStatsEditor itemId={entry.id} state={state} onChange={(next) => onChange({ ...next, id: entry.id })} />
    </div>
  );
}
