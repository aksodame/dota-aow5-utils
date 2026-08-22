import { useEffect, useState } from 'react';
import { Check, FolderOpen, Plus, RotateCcw, Scissors, X } from 'lucide-react';
import { iconUrl, qualityColor } from '@core/items.ts';
import { OPACITY, UI_SCALE, type LogTrim, type RoomSummary, type SkippedLine, type TrackerConfig } from '@core/ipc.ts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import type { Pricing } from '@/features/items/prices';
import { itemTable } from '@/features/items/table';
import { roomTable } from '@/features/rooms/table';
import { clock, compact, percent } from '@/lib/format';

/**
 * Everything worth changing, in the window it now has to itself.
 *
 * It was a view inside the farm HUD, which meant configuring the overlay
 * resized the overlay you were configuring — and the price list below wants
 * more height than a panel that sits over a live game should ever take.
 *
 * The session numbers here (per room, unreadable lines) come from main rather
 * than from a fold of its own: this window is opened part-way through an
 * evening, and a window that folded only what arrived after it opened would
 * report the last two minutes as the session.
 */

interface Props {
  config: TrackerConfig | null;
  /** The session so far, as main saw it. Null until the first read comes back. */
  rooms: RoomSummary[];
  skipped: SkippedLine[];
  pricing: Pricing;
  onScale: (next: number) => void;
  onOpacity: (next: number) => void;
  onTransparentBackground: (next: boolean) => void;
}

export function Settings({
  config,
  rooms,
  skipped,
  pricing,
  onScale,
  onOpacity,
  onTransparentBackground,
}: Props) {
  const [query, setQuery] = useState('');
  const [priceQuery, setPriceQuery] = useState('');
  const [trim, setTrim] = useState<LogTrim | null>(null);
  const tracked = config?.tracked ?? [];
  const prices = config?.prices ?? {};
  const transparentBackground = config?.transparentBackground ?? true;
  const results = query.trim() !== '' ? itemTable.search(query, 8) : [];
  const priceResults = priceQuery.trim() !== '' ? itemTable.search(priceQuery, 8) : [];

  const setTracked = (next: string[]) => void window.tracker.setConfig({ tracked: next });
  const toggle = (id: string) => setTracked(tracked.includes(id) ? tracked.filter((t) => t !== id) : [...tracked, id]);

  const setPrices = (next: Record<string, number>) => void window.tracker.setConfig({ prices: next });
  const setPrice = (id: string, gold: number) => setPrices({ ...prices, [id]: gold });
  const clearPrice = (id: string) => {
    const next = { ...prices };
    delete next[id];
    setPrices(next);
  };

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="hud-fade-bottom">
      <div className="space-y-5 pe-2 pb-4 text-xs">
        {/*
          First, because it is the only setting here that changes what the
          numbers *say* — everything below it changes where they are drawn or
          which of them are drawn. The tracked list follows because it is the
          same gesture, find an item and say something about it, and because
          the two together are the whole of "what am I farming for".
        */}
        <section className="space-y-1.5">
          <Label>Item prices</Label>
          <p className="text-[0.625rem] text-muted-foreground">
            The tables carry what an item sells for, which is not always what it is worth to you. Set your own and
            every gold figure follows it: g/hr, the session total, the loot list and the archive alike. Items you say
            nothing about keep the table price.
          </p>
          <CheckboxRow
            label="Trader pays half"
            hint="The trader buys at half the table price, so value every unpriced drop at half. Prices you set below are used exactly as you set them, either way."
            checked={config?.halvePrices ?? false}
            onChange={(next) => void window.tracker.setConfig({ halvePrices: next })}
          />
          <Input
            value={priceQuery}
            onChange={(e) => setPriceQuery(e.target.value)}
            placeholder="Search an item to price…"
            className="h-7 text-xs"
          />

          {priceResults.length > 0 && (
            <ul className="space-y-0.5 rounded-md bg-black/25 p-1">
              {priceResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    // Seeded with the table cost rather than with zero: the
                    // point is almost always "this is worth more than that",
                    // and starting from the number being argued with says so.
                    onClick={() => {
                      setPrice(item.id, pricing.unit(item.id));
                      setPriceQuery('');
                    }}
                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10"
                  >
                    <img src={iconUrl(item.icon)} alt="" className="size-5 rounded-sm object-cover" />
                    <span className="min-w-0 flex-1 truncate" style={{ color: qualityColor(item.quality) }}>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                      {pricing.unit(item.id)}g
                    </span>
                    {prices[item.id] !== undefined ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {Object.keys(prices).length > 0 && (
            <ul className="space-y-0.5">
              {Object.entries(prices).map(([id, gold]) => (
                <PriceRow
                  key={id}
                  id={id}
                  gold={gold}
                  tablePrice={pricing.table(id)}
                  onCommit={(next) => setPrice(id, next)}
                  onClear={() => clearPrice(id)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1.5">
          <Label>Tracked items</Label>
          <p className="text-[0.625rem] text-muted-foreground">
            Pin the items you care about and the expanded readout lists only those, with a session total to match.
            With none pinned, everything picked up is listed. History always records the lot, whatever is pinned here.
          </p>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="h-7 text-xs"
          />

          {results.length > 0 && (
            <ul className="space-y-0.5 rounded-md bg-black/25 p-1">
              {results.map((item) => {
                const on = tracked.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10"
                    >
                      <img src={iconUrl(item.icon)} alt="" className="size-5 rounded-sm object-cover" />
                      <span className="min-w-0 flex-1 truncate" style={{ color: qualityColor(item.quality) }}>
                        {item.name}
                      </span>
                      <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                        {pricing.unit(item.id)}g
                      </span>
                      {on ? (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {tracked.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tracked.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1 py-0 ps-1.5 pe-1 text-[0.625rem]">
                  {itemTable.get(id).name}
                  <button type="button" onClick={() => toggle(id)} aria-label={`Stop tracking ${id}`}>
                    <X className="size-3 hover:text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

        {/*
          Appearance sits under the item list rather than above it: its effect
          is visible the instant a slider moves, so it is the section you can
          find without reading, where the one above is a list you have to.
        */}
        <section className="space-y-1.5">
          <Label>Appearance</Label>

          {/*
            Transparency is the panel's, never the window's — the numbers stay
            at full contrast at every setting. Off, the panel is solid and the
            slider has nothing left to say, so it goes away rather than sitting
            there dead.
          */}
          <CheckboxRow
            label="Transparent background"
            hint="Let the game show through the panel. The readout stays solid either way."
            checked={transparentBackground}
            onChange={onTransparentBackground}
          />

          {transparentBackground && (
            <SliderRow
              label="Background"
              value={config?.opacity ?? OPACITY.default}
              min={OPACITY.min}
              max={OPACITY.max}
              step={OPACITY.step}
              onChange={onOpacity}
              format={percent}
            />
          )}

          <SliderRow
            label="UI scale"
            value={config?.uiScale ?? UI_SCALE.default}
            min={UI_SCALE.min}
            max={UI_SCALE.max}
            step={UI_SCALE.step}
            onChange={onScale}
            format={percent}
          />

          <p className="text-[0.625rem] text-muted-foreground">
            Ctrl +/− also changes the scale, and Ctrl+Alt +/− does it without clicking in first. The chevron collapses
            the panel to its cards, which are as tall as they are — so there the corner drags width only. Expanded, it
            keeps the height you drag it to.
          </p>
        </section>

        {/*
          The log, and no source switch beside it.

          Which feed is running was a developer's question from when the game
          emitted nothing and the mock was the only way to see a number. It
          emits now, so there is one answer, and the only thing a player needs
          to say is *where* — which is a path, and picking a path is what the
          system dialog is for. Typing one by hand means getting a Windows path
          into a Steam install exactly right, and a typo reads as a tracker
          that simply never sees anything.

          The mock is still reachable where it belongs: the source badge in the
          HUD's title bar, in development builds.
        */}
        <section className="space-y-1.5">
          <Label>Console log</Label>
          <p className="text-[0.625rem] text-muted-foreground">
            Dota writes its client console to a file when you launch it with <code>-con_logfile</code>. Point the
            tracker at that file and it reads the game's own tracker lines as they land.
          </p>
          <div className="flex items-center gap-1">
            {/* Truncated with the whole path on hover: it is long, it is
                not something you read, and it is something you check. */}
            <span
              className="min-w-0 flex-1 truncate rounded-md bg-black/25 px-2 py-1 text-[0.625rem] text-muted-foreground"
              title={config?.logFile}
            >
              {config?.logFile ?? 'Not set'}
            </span>
            <Button
              variant="outline"
              className="h-7 shrink-0 text-xs"
              onClick={() => void window.tracker.pickLogFile()}
            >
              <FolderOpen className="size-3.5" /> Choose
            </Button>
          </div>
          <Label>Optimization</Label>
          <CheckboxRow
            label="Keep the log small"
            checked={config?.trimLog ?? true}
            onChange={(next) => void window.tracker.setConfig({ trimLog: next })}
          />
          {/* The button always attempts it — no size floor and no guess about
              whether the game is busy. Whatever comes back is what the
              filesystem actually said, which is the only useful answer. */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-7 shrink-0 text-xs"
              onClick={() => void window.tracker.compactLog().then(setTrim)}
            >
              <Scissors className="size-3.5" /> Trim now
            </Button>
            <span className="min-w-0 flex-1 truncate text-[0.625rem] text-muted-foreground">
              {trim === null ? '' : describeTrim(trim)}
            </span>
          </div>
        </section>

        {rooms.length > 0 && (
          <section className="space-y-1.5">
            <Label>Per room</Label>
            <table className="w-full text-[0.625rem] tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-medium">room</th>
                  <th className="text-right font-medium">runs</th>
                  <th className="text-right font-medium">avg</th>
                  <th className="text-right font-medium">items</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.room}>
                    {/* `max-w-0` so the name is the column that gives way:
                        the three numbers beside it are what the table is for. */}
                    <td className="max-w-0 truncate text-left" title={r.room}>
                      {roomTable.name(r.room)}
                    </td>
                    <td className="text-right">{r.runs}</td>
                    <td className="text-right">{r.averageClear > 0 ? clock(r.averageClear) : '—'}</td>
                    <td className="text-right">{r.totalItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {skipped.length > 0 && (
          <section className="space-y-1">
            <Label>Unreadable lines</Label>
            <p className="text-[0.625rem] text-muted-foreground">
              The game emitted tracker lines this build could not use — most likely a schema change.
            </p>
            <ul className="space-y-0.5 text-[0.625rem] text-destructive">
              {skipped.slice(-5).map((s, i) => (
                <li key={i} className="truncate" title={s.line}>
                  {s.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * What a trim did, in a sentence.
 *
 * `in-use` means the rewrite was attempted and the filesystem refused, which
 * on Windows is what a file another process holds open looks like. The error
 * code rides along because it is the difference between "the game has it",
 * which is expected and harmless, and something else entirely — and the two
 * used to print the same sentence.
 */
function describeTrim(trim: LogTrim): string {
  const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(2)} MB`;
  switch (trim.skipped) {
    case 'in-use':
      return `Dota still has the file open${trim.error ? ` (${trim.error})` : ''} — ${mb(trim.before)} for now.`;
    case 'missing':
      return 'No log there yet. Dota writes it when you launch with -con_logfile.';
    case 'small':
      return 'Nothing in it but tracker lines already.';
    default:
      return `${mb(trim.before)} → ${mb(trim.after)}, ${trim.kept} tracker lines kept.`;
  }
}

/**
 * One priced item: what it is, what you say it is worth, and the way back.
 *
 * The field holds a draft rather than the saved number. Committing on every
 * keystroke would write `4`, `42`, `420` to the config as you typed a price —
 * and each of those is a broadcast that repaints every window with a gold
 * figure in it. Blur and Enter are when a price is finished being typed.
 */
function PriceRow({
  id,
  gold,
  tablePrice,
  onCommit,
  onClear,
}: {
  id: string;
  gold: number;
  /** What it would fetch with no price of its own — the trader's cut already taken. */
  tablePrice: number;
  onCommit: (next: number) => void;
  onClear: () => void;
}) {
  const info = itemTable.get(id);
  const [draft, setDraft] = useState(String(gold));

  // A price changed anywhere else — another window, a reset — replaces the
  // draft. While this field is the thing doing the changing, the value it is
  // told is the value it just sent, so nothing moves under the cursor.
  useEffect(() => setDraft(String(gold)), [gold]);

  const commit = () => {
    const next = Number(draft);
    // Gold is whole, and anything that is not a number at all is a typo rather
    // than an instruction: put the saved price back and say nothing.
    if (Number.isFinite(next) && next >= 0) onCommit(Math.round(next));
    else setDraft(String(gold));
  };

  return (
    <li className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03]">
      <img src={iconUrl(info.icon)} alt="" className="size-5 shrink-0 rounded-sm object-cover" />
      <span className="min-w-0 flex-1 truncate" style={{ color: qualityColor(info.quality) }} title={id}>
        {info.name}
      </span>
      {/* "10k" + "g" reads as kilograms, so the word carries the unit instead. */}
      <span
        className="shrink-0 text-[0.5rem] tabular-nums text-muted-foreground"
        title="What it would fetch without a price of its own"
      >
        table {compact(tablePrice)}
      </span>
      <Input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(String(gold));
        }}
        aria-label={`Price for ${info.name}`}
        className="h-6 w-16 shrink-0 text-right text-[0.625rem] tabular-nums"
      />
      <button type="button" onClick={onClear} aria-label={`Use the table price for ${info.name}`} title="Back to the table price">
        <RotateCcw className="size-3 text-muted-foreground hover:text-foreground" />
      </button>
    </li>
  );
}

/**
 * A labelled slider with its value beside the label.
 *
 * The readout is `tabular-nums` and fixed-width so it does not shuffle the
 * label sideways as the number changes under the drag.
 */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  format: (value: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[0.625rem] text-muted-foreground">
        <span>{label}</span>
        <span className="w-10 text-right tabular-nums text-foreground">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        // Committed on every move, not on release: both settings are things you
        // judge by looking at the result, so the result has to keep up.
        onValueChange={([next]) => next !== undefined && onChange(next)}
      />
    </div>
  );
}

/** A checkbox with its label to the right and, under both, what it does. */
function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-[0.625rem] text-foreground">
        <Checkbox
          checked={checked}
          // Radix reports 'indeterminate' as a third state this never uses.
          onCheckedChange={(next) => onChange(next === true)}
        />
        {label}
      </label>
      {hint !== undefined && <p className="text-[0.625rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
}
