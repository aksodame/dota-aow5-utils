import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FolderOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CARD_IDS, DEFAULT_CARDS, readCards, type CardId } from '@core/cards.ts';
import { iconUrl, qualityColor, type ItemInfo, type ItemTable } from '@core/items.ts';
import { LOCALES, type LanguageSetting } from '@core/locale.ts';
import { importedSoundId, IMPORTED_PACK, packRef, type SoundPack } from '@core/packs.ts';
import {
  accelerator,
  ACTION_KEYS,
  conflicts,
  DEFAULT_SHORTCUTS,
  readBinding,
  SHORTCUT_IDS,
  shortcutLabel,
  type ShortcutId,
  type Shortcuts,
} from '@core/shortcuts.ts';
import {
  BUILTIN_JACKPOT,
  DEFAULT_SOUNDS,
  GOLD,
  LEVELS,
  LIMIT,
  QUALITIES,
  soundLabel,
  VOLUME,
  type SoundSettings,
} from '@core/sounds.ts';
import { DEFAULT_STYLE, TRACKER_STYLES, type TrackerStyle } from '@core/style.ts';
import {
  OPACITY,
  UI_SCALE,
  type LogTrim,
  type RoomSummary,
  type SkippedLine,
  type TrackerConfig,
  type TrackerStatus,
  type UpdateState,
} from '@core/ipc.ts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import type { SoundHit } from 'aow5-api-contract';
import type { Pricing } from '@/features/items/prices';
import { BUILTIN_REFS } from '@/features/sounds/builtins';
import { useSoundPreview } from '@/features/sounds/useSoundPreview';
import { useItems } from '@/features/items/table';
import { useRooms } from '@/features/rooms/table';
import { useMessages, type Messages } from '@/i18n';
import { clock, compact, percent } from '@/lib/format';
import { cn } from '@/lib/utils';

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
  /** What the feed is doing. Null until the first status arrives. */
  status: TrackerStatus | null;
  /** The session so far, as main saw it. Null until the first read comes back. */
  rooms: RoomSummary[];
  skipped: SkippedLine[];
  /** Where the updater is. Null until main says, which is as the window loads. */
  update: UpdateState | null;
  pricing: Pricing;
  onScale: (next: number) => void;
  onOpacity: (next: number) => void;
  onTransparentBackground: (next: boolean) => void;
  onStyle: (next: TrackerStyle) => void;
}

export function Settings({
  config,
  status,
  rooms,
  skipped,
  update,
  pricing,
  onScale,
  onOpacity,
  onTransparentBackground,
  onStyle,
}: Props) {
  const m = useMessages();
  const itemTable = useItems();
  const roomTable = useRooms();
  const [query, setQuery] = useState('');
  const [priceQuery, setPriceQuery] = useState('');
  const [trim, setTrim] = useState<LogTrim | null>(null);
  const [soundQuery, setSoundQuery] = useState('');
  /**
   * Chords another application already owns, as main last found them.
   *
   * Pushed rather than asked for, and re-sent after every rebinding: whether a
   * key registered is only knowable at the moment of registering it, and by
   * then the window that asked has already drawn the field.
   */
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  useEffect(() => window.tracker.onUnavailable((chords) => setUnavailable(new Set(chords))), []);
  const tracked = config?.tracked ?? [];
  const prices = config?.prices ?? {};
  const transparentBackground = config?.transparentBackground ?? true;
  const results = query.trim() !== '' ? itemTable.search(query, 8) : [];
  const priceResults = priceQuery.trim() !== '' ? itemTable.search(priceQuery, 8) : [];

  const setTracked = (next: string[]) => void window.tracker.setConfig({ tracked: next });
  const toggle = (id: string) => setTracked(tracked.includes(id) ? tracked.filter((t) => t !== id) : [...tracked, id]);

  const sounds = config?.sounds ?? DEFAULT_SOUNDS;
  const soundResults = soundQuery.trim() !== '' ? itemTable.search(soundQuery, 8) : [];
  const preview = useSoundPreview(config?.sounds ?? null);
  const soundChoices = useSoundChoices(config?.soundPacks, m);

  const setSounds = (patch: Partial<SoundSettings>) =>
    void window.tracker.setConfig({ sounds: { ...sounds, ...patch } });
  const bind = (id: string, ref: string) => setSounds({ bindings: { ...sounds.bindings, [id]: ref } });
  const unbind = (id: string) => {
    const next = { ...sounds.bindings };
    delete next[id];
    setSounds({ bindings: next });
  };
  /** The dialog, then the binding — cancelling it leaves the old sound in place. */
  const rebind = (id: string) =>
    void window.tracker.pickSound().then((file) => {
      if (file !== null) bind(id, file);
    });

  /*
   * The two rule maps, edited through one pair of helpers.
   *
   * Keyed by the grade as a string because that is what survives a round trip
   * through the config file — `{ 6: 'x' }` comes back as `{ '6': 'x' }`, and a
   * lookup written against the number would miss it on the second launch and
   * on no other.
   */
  type RuleMap = 'byQuality' | 'byLevel';
  const setRule = (map: RuleMap, grade: number, ref: string) =>
    setSounds({ [map]: { ...sounds[map], [grade]: ref } });
  const clearRule = (map: RuleMap, grade: number) => {
    const next = { ...sounds[map] };
    delete next[String(grade)];
    setSounds({ [map]: next });
  };
  const pickRule = (map: RuleMap, grade: number) =>
    void window.tracker.pickSound().then((file) => {
      if (file !== null) setRule(map, grade, file);
    });

  /*
   * The mute list, as a Set for the browse rows and an array in the config.
   *
   * The browse list draws up to `MUTE_PAGE` rows and every one of them asks
   * whether it is muted; against the array that is a scan per row, and the
   * whole point of the list is that it grows.
   */
  const muted = useMemo(() => new Set(sounds.muted), [sounds.muted]);
  const toggleMute = (id: string) =>
    setSounds({ muted: muted.has(id) ? sounds.muted.filter((m) => m !== id) : [...sounds.muted, id] });

  /**
   * Why a bound item will not ring, or null if it will.
   *
   * The one place in this window where two things the player set disagree: the
   * binding row says `jackpot`, and the mute list or the floor under it means
   * that file is never going to play. Silence with a cause is a setting; silence
   * without one is a bug report, and the difference is this sentence.
   */
  const silenced = (id: string): 'muted' | 'floor' | null => {
    if (muted.has(id)) return 'muted';
    // The player's own price, the same figure the floor is compared against
    // when the drop actually lands. See `useDropSounds`.
    if (sounds.minGold !== null && pricing.unit(id) < sounds.minGold) return 'floor';
    return null;
  };

  /*
   * The floor of one is enforced here and again in `readCards`, deliberately.
   * This is the half that explains itself — a disabled box with a reason — and
   * that one is the half that holds whatever a hand-edited file or an older
   * build produces. Neither is enough alone: a UI rule cannot police the file,
   * and a silent fallback cannot tell the player why the click did nothing.
   */
  const cards = config?.cards ?? DEFAULT_CARDS;
  const last = cards.length === 1;
  const toggleCard = (id: CardId, next: boolean) => {
    if (!next && last) return;
    const wanted = next ? [...cards, id] : cards.filter((c) => c !== id);
    void window.tracker.setConfig({ cards: readCards(wanted) });
  };

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
          Above everything, and it is the one section whose position is not
          about farming.

          It is the setting that changes every other setting's own words, so a
          player who cannot read this panel has to be able to find it without
          reading it — and its four buttons are the only controls here that are
          legible whatever language the panel is currently in, because each
          language is named in itself. Anywhere further down and finding it
          would mean scrolling through a page of prose you cannot read.
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.language.title}</Label>
          <p className="text-[0.625rem] text-muted-foreground">{m.settings.language.blurb}</p>
          <div className="flex gap-1">
            <Choice
              active={(config?.language ?? 'auto') === 'auto'}
              onClick={() => void window.tracker.setConfig({ language: 'auto' })}
            >
              {m.settings.language.auto}
            </Choice>
            {LOCALES.map((locale) => (
              <Choice
                key={locale}
                active={config?.language === locale}
                onClick={() => void window.tracker.setConfig({ language: locale satisfies LanguageSetting })}
              >
                {m.settings.language[locale]}
              </Choice>
            ))}
          </div>
        </section>

        {/*
          First of the farming settings, because it is the only one that changes
          what the numbers *say* — everything below it changes where they are
          drawn or which of them are drawn. The tracked list follows because it
          is the same gesture, find an item and say something about it, and
          because the two together are the whole of "what am I farming for".
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.prices.title}</Label>
          <p className="text-[0.625rem] text-muted-foreground">{m.settings.prices.blurb}</p>
          <CheckboxRow
            label={m.settings.prices.halve}
            hint={m.settings.prices.halveHint}
            checked={config?.halvePrices ?? false}
            onChange={(next) => void window.tracker.setConfig({ halvePrices: next })}
          />
          <Input
            value={priceQuery}
            onChange={(e) => setPriceQuery(e.target.value)}
            placeholder={m.settings.prices.search}
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
                  items={itemTable}
                  m={m}
                  onCommit={(next) => setPrice(id, next)}
                  onClear={() => clearPrice(id)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-1.5">
          <Label>{m.settings.tracked.title}</Label>
          <p className="text-[0.625rem] text-muted-foreground">{m.settings.tracked.blurb}</p>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.settings.tracked.search}
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

          {/*
            Rows, like the repriced items above, and not the chips this used to
            be. Both lists answer the same kind of question — which items have I
            said something about — and they were answering it in two different
            shapes a few pixels apart. Rows also carry what a chip could not: the
            icon you actually recognise an item by, its rarity in the colour the
            rest of the app uses, and what it is worth, which is most of why it
            got pinned. A name alone in a pill made a list of twelve into a wall
            of text you had to read rather than scan.
          */}
          {tracked.length > 0 && (
            <ul className="space-y-0.5">
              {tracked.map((id) => {
                const info = itemTable.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03]">
                    <img src={iconUrl(info.icon)} alt="" className="size-5 shrink-0 rounded-sm object-cover" />
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{ color: qualityColor(info.quality) }}
                      title={id}
                    >
                      {info.name}
                    </span>
                    {/* What it is worth *now* — through `prices`, so an override
                        set in the section above shows here rather than the two
                        lists quietly disagreeing about the same item. */}
                    <span className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                      {pricing.unit(id)}g
                    </span>
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-label={m.settings.tracked.untrack(info.name)}
                      title={m.settings.tracked.untrackHint}
                    >
                      <X className="size-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/*
          The keys, above the sounds and below the lists.

          It is the section a player goes looking for after the first evening
          where `Ctrl+Alt+T` turned out to belong to something else — which is
          a thing that happens before they have opinions about drop sounds, and
          which leaves the overlay unconfigurable until it is fixed.
        */}
        <ShortcutSettings
          shortcuts={config?.shortcuts ?? DEFAULT_SHORTCUTS}
          unavailable={unavailable}
          m={m}
          onChange={(next) => void window.tracker.setConfig({ shortcuts: next })}
        />

        {/*
          The third thing you say about an item, after what it is worth and
          whether you are watching for it: what it should sound like when it
          lands. A drop sound is for the item you are farming *for* — the one
          worth looking up from the fight for — so it is a binding rather than
          a blanket setting.
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.sounds.title}</Label>
          <CheckboxRow
            label={m.settings.sounds.enabled}
            hint={m.settings.sounds.enabledHint}
            checked={sounds.enabled}
            onChange={(next) => setSounds({ enabled: next })}
          />

          {sounds.enabled && (
            <>
              <SliderRow
                label={m.settings.sounds.volume}
                value={sounds.volume}
                min={VOLUME.min}
                max={VOLUME.max}
                step={VOLUME.step}
                onChange={(next) => setSounds({ volume: next })}
                format={percent}
              />

              {/* A notification that outlasts the moment it is about becomes
                  something to sit through, so it is capped by default. */}
              <CheckboxRow
                label={m.settings.sounds.limit}
                hint={m.settings.sounds.limitHint}
                checked={sounds.limitSeconds !== null}
                onChange={(next) => setSounds({ limitSeconds: next ? LIMIT.default : null })}
              />
              {sounds.limitSeconds !== null && (
                <SliderRow
                  label={m.settings.sounds.limitAfter}
                  value={sounds.limitSeconds}
                  min={LIMIT.min}
                  max={LIMIT.max}
                  step={LIMIT.step}
                  onChange={(next) => setSounds({ limitSeconds: next })}
                  format={m.settings.sounds.seconds}
                />
              )}


              {/*
                The per-item list, and it leads the section now rather than
                trailing the grids.

                The grids went on top when they arrived, on the argument that
                they are the answer for almost everybody — which is true, and is
                also the reason they belong underneath. A grid is set once and
                left alone; the bindings are the part somebody opens this window
                to change, and the part that grows. Reading order should follow
                where the hands go, not where the reasoning started.
              */}
              <div className="space-y-1.5 rounded-md bg-black/25 p-1.5">
                <div className="text-[0.625rem] font-medium">{m.settings.sounds.perItem}</div>
                <p className="text-[0.5rem] leading-snug text-muted-foreground">{m.settings.sounds.perItemHint}</p>

                {/*
                  The catalogue search, off for now.

                  Commented rather than gated, deliberately. It was already off
                  by default — `soundSearchUrl` ships empty — but a default only
                  governs a profile that has never been written to, and any
                  config saved while the field had a value still carries it and
                  would still draw this. Taking the element out is the version
                  that is true of every profile.

                  A sound therefore comes from one of two places: the ones in
                  the box, and a file on this machine. Both are offered by the
                  menu behind every binding and every grade chip.

                  To bring it back: uncomment this, and put the deployment's
                  origin in `soundSearchUrl` (see `electron/config.ts`). Nothing
                  else was removed — `SoundSearch` below, the IPC either side of
                  it, and `apps/api/src/sounds/` are all still here and still
                  tested.

                <SoundSearch
                  packs={config?.soundPacks}
                  m={m}
                  onPlay={preview}
                  enabled={(config?.soundSearchUrl ?? '').trim() !== ''}
                />
                */}

                <Input
                  value={soundQuery}
                  onChange={(e) => setSoundQuery(e.target.value)}
                  placeholder={m.settings.sounds.search}
                  className="h-7 text-xs"
                />

                {soundResults.length > 0 && (
                  <ul className="space-y-0.5 rounded-md bg-black/25 p-1">
                    {soundResults.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          // Bound to the sound in the box, not to a file dialog:
                          // one click gets you something audible, and the row
                          // that appears is where you change it to your own.
                          onClick={() => {
                            bind(item.id, BUILTIN_JACKPOT);
                            setSoundQuery('');
                          }}
                          className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10"
                        >
                          <img src={iconUrl(item.icon)} alt="" className="size-5 rounded-sm object-cover" />
                          <span className="min-w-0 flex-1 truncate" style={{ color: qualityColor(item.quality) }}>
                            {item.name}
                          </span>
                          {sounds.bindings[item.id] !== undefined ? (
                            <Check className="size-3.5 shrink-0 text-primary" />
                          ) : (
                            <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {Object.keys(sounds.bindings).length > 0 && (
                  <ul className="space-y-0.5">
                    {Object.entries(sounds.bindings).map(([id, ref]) => {
                      const info = itemTable.get(id);
                      const why = silenced(id);
                      return (
                        <li key={id} className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03]">
                          <img src={iconUrl(info.icon)} alt="" className="size-5 shrink-0 rounded-sm object-cover" />
                          <span
                            className={cn('min-w-0 flex-1 truncate', why !== null && 'line-through opacity-60')}
                            style={{ color: qualityColor(info.quality) }}
                            title={id}
                          >
                            {info.name}
                          </span>
                          {/* Not a button: the fix is in the box below, and a
                              control here would be a second place to undo one
                              of two settings that already have their own. */}
                          {why !== null && (
                            <span
                              className="shrink-0"
                              title={m.settings.sounds[why === 'muted' ? 'silencedMuted' : 'silencedFloor']}
                              aria-label={m.settings.sounds[why === 'muted' ? 'silencedMuted' : 'silencedFloor']}
                            >
                              <VolumeX className="size-3 text-destructive" />
                            </span>
                          )}
                          {/* The file's name, with the whole path on hover: the
                              rest of it is where you keep your sounds. It is the
                              menu too — there are several sounds in the box now,
                              and a folder button could only ever offer the one
                              answer that needs a file dialog. */}
                          <SoundMenu
                            sound={ref}
                            choices={soundChoices}
                            m={m}
                            onPick={(next) => bind(id, next)}
                            onChoose={() => rebind(id)}
                            onClear={() => unbind(id)}
                            onPlay={() => preview(ref)}
                          >
                            <button
                              type="button"
                              className="w-20 shrink-0 truncate rounded text-right text-[0.5rem] text-muted-foreground hover:text-foreground"
                              title={ref}
                              aria-label={m.settings.sounds.pick(info.name)}
                            >
                              {soundLabel(ref)}
                            </button>
                          </SoundMenu>
                          <button
                            type="button"
                            onClick={() => preview(ref)}
                            aria-label={m.settings.sounds.play(soundLabel(ref))}
                            title={m.settings.sounds.playHint}
                          >
                            <Play className="size-3 text-muted-foreground hover:text-foreground" />
                          </button>
                          <button
                            type="button"
                            onClick={() => unbind(id)}
                            aria-label={m.settings.sounds.unbind(info.name)}
                            title={m.settings.sounds.unbindHint}
                          >
                            <X className="size-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/*
                The grades. Still the answer for almost everybody — what a
                player reacts to is "something Mythic dropped", and saying that
                by hand meant binding 239 items one at a time — but a rule set
                once and left alone reads below the list that is edited, not
                above it.
              */}
              <div className="space-y-1.5 rounded-md bg-black/25 p-1.5">
                <div className="text-[0.625rem] font-medium">{m.settings.sounds.rules}</div>
                <p className="text-[0.5rem] leading-snug text-muted-foreground">{m.settings.sounds.rulesHint}</p>

                <RuleGrid
                  label={m.settings.sounds.byQuality}
                  grades={QUALITIES}
                  rules={sounds.byQuality}
                  name={(grade) => m.settings.sounds.rarity[grade] ?? String(grade)}
                  choices={soundChoices}
                  // The same tint the item lists use, so a tier reads as the
                  // colour the player already associates with it.
                  tint={qualityColor}
                  m={m}
                  onPick={(grade, ref) => setRule('byQuality', grade, ref)}
                  onChoose={(grade) => pickRule('byQuality', grade)}
                  onClear={(grade) => clearRule('byQuality', grade)}
                  onPlay={preview}
                />

                <RuleGrid
                  label={m.settings.sounds.byLevel}
                  grades={LEVELS}
                  rules={sounds.byLevel}
                  name={(grade) => m.settings.sounds.level(grade)}
                  choices={soundChoices}
                  m={m}
                  onPick={(grade, ref) => setRule('byLevel', grade, ref)}
                  onChoose={(grade) => pickRule('byLevel', grade)}
                  onClear={(grade) => clearRule('byLevel', grade)}
                  onPlay={preview}
                />
              </div>

              {/*
                The two settings that say *no*, last and together.

                They are what makes a tier rule survive an evening of farming:
                quality 6 is 239 items and a handful of them arrive by the
                fistful, so the grid above is either paired with something that
                silences those or it is a feature people switch off. One number
                covers the cheap end of every tier at once, including the items
                a pak adds next month; the list beside it handles the expensive
                thing that is simply too frequent to be news.

                Both outrank a binding — see `resolveSound`, which is where that
                order lives and is held to it.
              */}
              <div className="space-y-1.5 rounded-md bg-black/25 p-1.5">
                <CheckboxRow
                  label={m.settings.sounds.floor}
                  hint={m.settings.sounds.floorHint}
                  checked={sounds.minGold !== null}
                  onChange={(next) => setSounds({ minGold: next ? GOLD.default : null })}
                />
                {sounds.minGold !== null && (
                  <GoldRow
                    gold={sounds.minGold}
                    label={m.settings.sounds.floorField}
                    onCommit={(next) => setSounds({ minGold: next })}
                  />
                )}

                <MutedItems
                  items={itemTable}
                  muted={muted}
                  order={sounds.muted}
                  pricing={pricing}
                  m={m}
                  onToggle={toggleMute}
                />
              </div>
            </>
          )}
        </section>

        {/*
          The clock the session is measured by, before the cards that report
          it. One setting, and it earns a section of its own rather than a
          corner of the next one: it is the difference between an evening
          measured and an evening of zeros.
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.session.title}</Label>
          <CheckboxRow
            label={m.settings.session.autoResume}
            hint={m.settings.session.autoResumeHint}
            checked={config?.autoResume ?? true}
            onChange={(next) => void window.tracker.setConfig({ autoResume: next })}
          />
        </section>

        {/*
          Which cards, before how they look: this is the section that decides
          what the HUD is *for*, and it is the one a player goes looking for
          after a session or two of reading past a number they do not use.
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.cards.title}</Label>
          <p className="text-[0.625rem] text-muted-foreground">{m.settings.cards.blurb}</p>
          {CARD_IDS.map((id) => {
            const hint = m.settings.cards.hint[id];
            const on = cards.includes(id);
            return (
              <CheckboxRow
                key={id}
                label={m.settings.cards.name[id]}
                // The last one on says why it cannot be turned off, rather than
                // being a checkbox that silently ignores the click.
                hint={on && last ? m.settings.cards.lastOne(hint) : hint}
                checked={on}
                disabled={on && last}
                onChange={(next) => toggleCard(id, next)}
              />
            );
          })}
        </section>

        {/*
          Appearance sits under the item list rather than above it: its effect
          is visible the instant a slider moves, so it is the section you can
          find without reading, where the one above is a list you have to.
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.appearance.title}</Label>

          {/*
            The style leads the section, because it is the control that decides
            what the two below are adjusting. Transparency and scale are knobs
            on a panel; this one chooses which panel.
          */}
          <div className="space-y-1">
            <div className="flex gap-1">
              {TRACKER_STYLES.map((option) => (
                <Choice
                  key={option}
                  active={(config?.style ?? DEFAULT_STYLE) === option}
                  onClick={() => onStyle(option)}
                  title={m.settings.style[option === 'minimal' ? 'minimalHint' : 'torchlightHint']}
                >
                  {m.settings.style[option]}
                </Choice>
              ))}
            </div>
            <p className="text-[0.625rem] text-muted-foreground">{m.settings.style.blurb}</p>
          </div>

          {/*
            Transparency is the panel's, never the window's — the numbers stay
            at full contrast at every setting. Off, the panel is solid and the
            slider has nothing left to say, so it goes away rather than sitting
            there dead.
          */}
          <CheckboxRow
            label={m.settings.appearance.transparent}
            hint={m.settings.appearance.transparentHint}
            checked={transparentBackground}
            onChange={onTransparentBackground}
          />

          {transparentBackground && (
            <SliderRow
              label={m.settings.appearance.background}
              value={config?.opacity ?? OPACITY.default}
              min={OPACITY.min}
              max={OPACITY.max}
              step={OPACITY.step}
              onChange={onOpacity}
              format={percent}
            />
          )}

          <SliderRow
            label={m.settings.appearance.scale}
            value={config?.uiScale ?? UI_SCALE.default}
            min={UI_SCALE.min}
            max={UI_SCALE.max}
            step={UI_SCALE.step}
            onChange={onScale}
            format={percent}
          />

          <p className="text-[0.625rem] text-muted-foreground">{m.settings.appearance.blurb}</p>
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
          <Label>{m.settings.log.title}</Label>
          <p className="text-[0.625rem] text-muted-foreground">{m.settings.log.blurb}</p>
          <div className="flex items-center gap-1">
            {/* What the tail is doing with that path. An overlay showing zeros
              looks identical to a broken one, and this is the sentence that
              tells them apart — red when the file is not there to read. */}
          {status !== null && (
            <p className={cn('text-[0.625rem]', status.error ? 'text-destructive' : 'text-muted-foreground')}>
              {status.detail}
            </p>
          )}
          {/* Truncated with the whole path on hover: it is long, it is
                not something you read, and it is something you check. */}
            <span
              className="min-w-0 flex-1 truncate rounded-md bg-black/25 px-2 py-1 text-[0.625rem] text-muted-foreground"
              title={config?.logFile}
            >
              {config?.logFile ?? m.common.notSet}
            </span>
            <Button
              variant="outline"
              className="h-7 shrink-0 text-xs"
              onClick={() => void window.tracker.pickLogFile()}
            >
              <FolderOpen className="size-3.5" /> {m.common.choose}
            </Button>
          </div>
          <Label>{m.settings.log.optimization}</Label>
          <CheckboxRow
            label={m.settings.log.trim}
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
              <Scissors className="size-3.5" /> {m.settings.log.trimNow}
            </Button>
            <span className="min-w-0 flex-1 truncate text-[0.625rem] text-muted-foreground">
              {trim === null ? '' : m.trim(trim, megabytes)}
            </span>
          </div>
        </section>

        {rooms.length > 0 && (
          <section className="space-y-1.5">
            <Label>{m.settings.rooms.title}</Label>
            <table className="w-full text-[0.625rem] tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-medium">{m.settings.rooms.room}</th>
                  <th className="text-right font-medium">{m.settings.rooms.runs}</th>
                  <th className="text-right font-medium">{m.settings.rooms.average}</th>
                  <th className="text-right font-medium">{m.settings.rooms.items}</th>
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
                    <td className="text-right">{r.averageClear > 0 ? clock(r.averageClear) : m.common.none}</td>
                    <td className="text-right">{r.totalItems}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {skipped.length > 0 && (
          <section className="space-y-1">
            <Label>{m.settings.skipped.title}</Label>
            <p className="text-[0.625rem] text-muted-foreground">{m.settings.skipped.blurb}</p>
            <ul className="space-y-0.5 text-[0.625rem] text-destructive">
              {skipped.slice(-5).map((s, i) => (
                <li key={i} className="truncate" title={s.line}>
                  {s.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
          Last, because it is the only section that is not about farming — and
          because "what version am I on" is something you come looking for
          rather than something you notice on the way past.
        */}
        <section className="space-y-1.5">
          <Label>{m.settings.about.title}</Label>
          <p className="text-[0.625rem] text-muted-foreground">
            {m.settings.about.app}{' '}
            <span className="tabular-nums text-foreground">{update?.current ?? m.common.none}</span>
          </p>
          <UpdateRow state={update} m={m} />
        </section>
      </div>
    </ScrollArea>
  );
}

/**
 * The update button, and the sentence beside it.
 *
 * One button whose job changes with the state rather than a row of three, two
 * of which would be dead at any moment: there is exactly one thing worth doing
 * next, and which one it is *is* the state. The sentence beside it carries
 * everything the button cannot — the version on offer, why a check failed, how
 * far a download has got.
 *
 * The restart is the only press that costs anything, and it is not confirmed
 * here: main answers it with a real dialog, because a modal drawn inside a
 * frameless transparent overlay would have nothing to sit on.
 */
function UpdateRow({ state, m }: { state: UpdateState | null; m: Messages }) {
  // Before the first message from main. A button that might be about to
  // disable itself is worse than a beat of nothing.
  if (state === null) return null;

  if (state.status === 'unsupported') {
    return <p className="text-[0.625rem] text-muted-foreground">{m.update.unsupportedBlurb}</p>;
  }

  const busy = state.status === 'checking' || state.status === 'downloading';

  const press = () => {
    if (state.status === 'available') return void window.tracker.downloadUpdate();
    if (state.status === 'ready') return void window.tracker.installUpdate();
    return void window.tracker.checkUpdate();
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" className="h-7 shrink-0 text-xs" disabled={busy} onClick={press}>
        {state.status === 'available' ? (
          <>
            <Download className="size-3.5" /> {m.update.download}
          </>
        ) : state.status === 'ready' ? (
          <>
            <RotateCw className="size-3.5" /> {m.update.restart}
          </>
        ) : (
          <>
            <RefreshCw className={cn('size-3.5', state.status === 'checking' && 'animate-spin')} />{' '}
            {m.update.check}
          </>
        )}
      </Button>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[0.625rem]',
          state.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
        title={describe(state, m)}
      >
        {describe(state, m)}
      </span>
    </div>
  );
}

/**
 * Where the updater is, in a sentence.
 *
 * The sentences themselves live in the catalogs; what stays here is the one
 * thing that is not a translation — cutting GitHub's release notes down to
 * something that fits on a row before handing them over. Doing that inside each
 * catalog would be the same regex written three times.
 */
function describe(state: UpdateState, m: Messages): string {
  const notes = state.status === 'available' && state.notes !== null ? firstLine(state.notes) : null;
  return m.update.describe(state, notes);
}

/**
 * The first line of the release notes, as plain text.
 *
 * GitHub's are markdown and can be a page long; this is a caption on one row of
 * a settings panel, and the release page is where the rest of them live.
 */
function firstLine(notes: string): string {
  const line = notes
    .replace(/<[^>]*>/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^[#>*\-\s]+/, '').trim())
    .find((l) => l !== '');
  return line === undefined ? '' : line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/**
 * Bytes as megabytes, for the sentence a trim produces.
 *
 * Handed to the catalog rather than written in it, so all three report the same
 * number in the same unit and only the words around it differ — see `m.trim`,
 * which is where the sentences went.
 */
const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(2)} MB`;

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
  items,
  m,
  onCommit,
  onClear,
}: {
  id: string;
  gold: number;
  /** What it would fetch with no price of its own — the trader's cut already taken. */
  tablePrice: number;
  items: ItemTable;
  m: Messages;
  onCommit: (next: number) => void;
  onClear: () => void;
}) {
  const info = items.get(id);
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
      <span className="shrink-0 text-[0.5rem] tabular-nums text-muted-foreground" title={m.settings.prices.tableHint}>
        {m.settings.prices.table(compact(tablePrice))}
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
        aria-label={m.settings.prices.field(info.name)}
        // Wider and a size down from the row's text: six figures is an ordinary
        // price here, and at 0.625rem in 4rem of field the end of one scrolled
        // out of sight while it was being typed.
        className="h-6 w-[4.75rem] shrink-0 text-right text-[0.5625rem] tabular-nums"
      />
      {/* An X, because this removes the row. It was a `RotateCcw`, which is the
          icon every other application uses for "refresh" — so the one control
          here that throws a number away looked like the one that would fetch a
          new one. Red on hover, like the X that unpins a tracked item: both
          take something the player put there. */}
      <button
        type="button"
        onClick={onClear}
        aria-label={m.settings.prices.clear(info.name)}
        title={m.settings.prices.clearHint}
      >
        <X className="size-3 text-muted-foreground hover:text-destructive" />
      </button>
    </li>
  );
}

/**
 * The keys, and the one modifier they all hang off.
 *
 * A capture field rather than a text box, for each of them. A text box would
 * mean typing the word `Control` correctly and knowing that Electron spells it
 * that way and not `Ctrl`; a capture field means pressing the key you want,
 * which is the same gesture you will use afterwards. It is also the only input
 * that cannot produce a chord `globalShortcut.register` refuses, because it can
 * only ever produce a key that exists.
 */
function ShortcutSettings({
  shortcuts,
  unavailable,
  m,
  onChange,
}: {
  shortcuts: Shortcuts;
  /** Chords another application already owns, as main last found them. */
  unavailable: Set<string>;
  m: Messages;
  onChange: (next: Shortcuts) => void;
}) {
  const clashing = conflicts(shortcuts);

  const setKey = (id: ShortcutId, binding: string) =>
    onChange({ ...shortcuts, keys: { ...shortcuts.keys, [id]: binding } });

  return (
    <section className="space-y-1.5">
      <Label>{m.settings.shortcuts.title}</Label>
      <p className="text-[0.625rem] text-muted-foreground">{m.settings.shortcuts.blurb}</p>

      {/*
        The action key leads, because it is the control that decides what the
        rows below are. The same reason the tracker style leads Appearance: one
        of these chooses, the rest adjust.
      */}
      <div className="space-y-1">
        <div className="flex gap-1">
          {ACTION_KEYS.map((option) => (
            <Choice
              key={option}
              active={shortcuts.actionKey === option}
              onClick={() => onChange({ ...shortcuts, actionKey: option })}
            >
              {shortcutLabel(option)}
            </Choice>
          ))}
        </div>
        <p className="text-[0.625rem] text-muted-foreground">{m.settings.shortcuts.actionKeyHint}</p>
      </div>

      {SHORTCUT_IDS.map((id) => (
        <ShortcutRow
          key={id}
          id={id}
          binding={shortcuts.keys[id]}
          chord={accelerator(shortcuts, id)}
          // Two different failures, and they read differently: a clash is
          // something the player just did and can undo, where a taken key is
          // another application's and can only be worked around.
          clash={clashing.has(id)}
          taken={unavailable.has(accelerator(shortcuts, id))}
          m={m}
          onBind={(next) => setKey(id, next)}
          onReset={() => setKey(id, DEFAULT_SHORTCUTS.keys[id])}
        />
      ))}
    </section>
  );
}

/** One action, the chord it answers to, and whatever is wrong with it. */
function ShortcutRow({
  id,
  binding,
  chord,
  clash,
  taken,
  m,
  onBind,
  onReset,
}: {
  id: ShortcutId;
  binding: string;
  /** The whole accelerator, action key included — what is actually registered. */
  chord: string;
  clash: boolean;
  taken: boolean;
  m: Messages;
  onBind: (binding: string) => void;
  onReset: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const name = m.settings.shortcuts.name[id] ?? id;

  /*
   * The capture.
   *
   * On `keydown` and on the button itself rather than on the window, so it can
   * only fire while this row is the one being recorded — a listener on the
   * window would catch the Escape that closes something else.
   *
   * A modifier on its own is ignored rather than refused: reaching `Alt+T`
   * means pressing Alt first, and a capture that took the first key down would
   * be impossible to give a chord to.
   */
  const capture = (event: React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;

    const parts: string[] = [];
    if (event.altKey) parts.push('Alt');
    // The action key is added back by `accelerator`, so a player who holds it
    // out of habit while recording would otherwise bind it twice — and
    // `Control+Control+E` is not an accelerator.
    if (event.ctrlKey) parts.push('Control');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');
    parts.push(event.key);

    const next = readBinding(parts.join('+'));
    // A key with no accelerator name — dead keys, IME composition, the media
    // keys on some boards. Nothing registers it, so nothing accepts it either,
    // and the field stays open for another try rather than closing on a
    // shortcut that would never fire.
    if (next === null) return;
    onBind(next);
    setRecording(false);
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-xs">{name}</span>
        <button
          type="button"
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={recording ? capture : undefined}
          aria-label={m.settings.shortcuts.rebind(name)}
          title={m.settings.shortcuts.recordHint}
          className={cn(
            'h-6 w-[7.5rem] shrink-0 rounded-md border px-2 text-[0.625rem] tabular-nums transition-colors',
            recording
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-white/10 text-foreground hover:border-white/25',
            // The chord is wrong in a way that will not announce itself at the
            // moment it fails, so the field says so before it is pressed.
            !recording && (clash || taken) && 'border-destructive/60 text-destructive',
          )}
        >
          {recording ? m.settings.shortcuts.record : shortcutLabel(chord)}
        </button>
        <button
          type="button"
          onClick={onReset}
          aria-label={m.settings.shortcuts.reset}
          title={m.settings.shortcuts.resetHint}
          // Hidden rather than disabled while it is already the default: a
          // control that cannot do anything is one more thing to read past on a
          // row that is already a label, a field and a button.
          className={cn(
            'shrink-0 text-muted-foreground hover:text-foreground',
            binding === DEFAULT_SHORTCUTS.keys[id] && 'invisible',
          )}
        >
          <RotateCw className="size-3" />
        </button>
      </div>
      <p className="text-[0.5rem] leading-snug text-muted-foreground">{m.settings.shortcuts.hint[id]}</p>
      {clash && <p className="text-[0.5rem] leading-snug text-destructive">{m.settings.shortcuts.clash}</p>}
      {!clash && taken && <p className="text-[0.5rem] leading-snug text-destructive">{m.settings.shortcuts.taken}</p>}
    </div>
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
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** For a box that is on and may not be turned off. The hint says why. */
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label
        className={cn(
          'flex items-center gap-2 text-[0.625rem] text-foreground',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          // Radix reports 'indeterminate' as a third state this never uses.
          onCheckedChange={(next) => onChange(next === true)}
        />
        {label}
      </label>
      {hint !== undefined && <p className="text-[0.625rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * One of a short row of mutually exclusive options.
 *
 * A row of buttons rather than a `<select>`, and the same shape the recipe
 * picker uses for its two modes. Both settings that need this — the language
 * and the style — have three or four answers, all of them a word long, and a
 * dropdown would hide them behind a click for no width saved. It also keeps the
 * language buttons visible without being read, which is the whole reason that
 * section sits where it does.
 */
function Choice({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** What this option means, for the ones a word cannot say on its own. */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded px-1.5 py-1 text-[0.625rem]',
        active ? 'bg-primary/25 text-primary' : 'bg-white/5 text-muted-foreground hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">{children}</div>;
}

/**
 * One ladder of grades, each a chip that carries the sound it plays.
 *
 * The layout is the game's own: `Pickup Quality` and `Pickup Level` in the pet
 * panel are a row of tinted chips, and this is the same question asked about
 * sound — so it is worth looking like the thing it is next to. A chip with no
 * sound is an outline; one with a sound wears the grade's colour and says what
 * it will play, because a grid of identical chips answers "which of these did I
 * set?" only by being clicked through one at a time.
 */
function RuleGrid({
  label,
  grades,
  rules,
  name,
  tint,
  choices,
  m,
  onPick,
  onChoose,
  onClear,
  onPlay,
}: {
  label: string;
  grades: readonly number[];
  rules: Record<string, string>;
  name: (grade: number) => string;
  /** Passed straight through to every chip's menu. See `useSoundChoices`. */
  choices: SoundChoice[];
  /** The grade's colour, where it has one. Levels do not: the game gives them no palette. */
  tint?: (grade: number) => string;
  m: Messages;
  onPick: (grade: number, ref: string) => void;
  onChoose: (grade: number) => void;
  onClear: (grade: number) => void;
  onPlay: (ref: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[0.5rem] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="flex flex-wrap gap-1">
        {grades.map((grade) => {
          const sound = rules[String(grade)];
          const color = tint?.(grade);
          return (
            <SoundMenu
              key={grade}
              sound={sound}
              choices={choices}
              m={m}
              onPick={(ref) => onPick(grade, ref)}
              onChoose={() => onChoose(grade)}
              onClear={() => onClear(grade)}
              onPlay={() => sound !== undefined && onPlay(sound)}
            >
              <button
                type="button"
                aria-label={m.settings.sounds.rule(name(grade))}
                className={cn(
                  'flex min-w-0 flex-col items-start rounded-md border px-1.5 py-0.5 text-[0.625rem] leading-tight transition-colors',
                  sound === undefined && 'border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground',
                  // Set, and no palette to wear: the levels. Explicit rather
                  // than left to `border`'s default of `currentColor`, which
                  // would make the chip's edge whatever its text happens to be.
                  sound !== undefined && 'bg-white/[0.04]',
                  sound !== undefined && color === undefined && 'border-primary/60 text-foreground',
                )}
                // Inline, because the tint is a CSS variable per grade rather
                // than a class: `qualityColor` is the same function the item
                // lists colour their names with.
                style={sound === undefined ? undefined : { color, borderColor: color }}
              >
                <span>{name(grade)}</span>
                {sound !== undefined && (
                  <span className="max-w-[4.5rem] truncate text-[0.5rem] text-muted-foreground">
                    {soundLabel(sound)}
                  </span>
                )}
              </button>
            </SoundMenu>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The gold floor's field.
 *
 * A field and not a `SliderRow`, unlike every other number in this section.
 * Item prices run 0 to 300,000 and the part anybody sets is the bottom tenth of
 * that, so a linear track would spend nine tenths of its travel on numbers
 * nobody wants and arrive at 5,000 by luck. A threshold is a figure you have in
 * mind before you reach for the control; typing it is the shorter path.
 *
 * Committed on blur and on Enter, never per keystroke — the same shape as
 * `PriceRow`, and for the same reason: "1" on the way to "10000" is a floor
 * that lets everything through, and writing it to the config on the way past
 * means a config file that briefly said something nobody meant.
 */
function GoldRow({ gold, label, onCommit }: { gold: number; label: string; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState(String(gold));

  // A change from anywhere else — another window, the checkbox re-ticking with
  // the default — replaces the draft. While this field is what is doing the
  // changing, the value it is handed is the value it just sent, so nothing
  // moves under the cursor.
  useEffect(() => setDraft(String(gold)), [gold]);

  const commit = () => {
    const next = Number(draft);
    // Anything that is not a number at all is a typo rather than an
    // instruction: put the saved figure back and say nothing.
    if (Number.isFinite(next) && next >= GOLD.min) onCommit(Math.round(Math.min(next, GOLD.max)));
    else setDraft(String(gold));
  };

  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 text-[0.625rem] text-muted-foreground">{label}</span>
      <Input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setDraft(String(gold));
        }}
        aria-label={label}
        className="h-6 w-[4.75rem] shrink-0 text-right text-[0.5625rem] tabular-nums"
      />
      <span className="shrink-0 text-[0.5rem] text-muted-foreground">g</span>
    </div>
  );
}

/**
 * How many browse rows are drawn before the list stops and says so.
 *
 * Legendary with no level chosen is 641 items, which is not a list anybody
 * reads — it is a scrollbar with a haystack behind it. The cap is what turns
 * "scroll until you give up" into "pick a level as well", and the line under
 * the list is what makes that a suggestion rather than a mystery. Silently
 * showing the first sixty would read as a tier with sixty items in it.
 */
const MUTE_PAGE = 60;

/** No rarity or no level chosen: the filter is off rather than set to something. */
const ANY = null;

/**
 * The list of items that never ring, and the two ways of finding one.
 *
 * Browsing is the primary one and search is the fallback, which is the reverse
 * of every other item picker in this window. Those are all reached with a name
 * already in mind — a thing you are farming for, a thing you want priced. This
 * one is reached with an *experience* in mind: the tier rule is on and the last
 * hour had three sounds too many in it. The player knows the grade, not the
 * name, so the grade is what the controls offer first.
 *
 * Cheapest first inside a grade, against the house style of every other list
 * here, because the drops that make a rule unliveable are the frequent cheap
 * ones — see `ItemTable.grade`, which is where that order lives.
 */
function MutedItems({
  items,
  muted,
  order,
  pricing,
  m,
  onToggle,
}: {
  items: ItemTable;
  /** For the row toggles: a scan per row over an array that is meant to grow. */
  muted: Set<string>;
  /** The config's own order, so the list below does not reshuffle as it is edited. */
  order: string[];
  pricing: Pricing;
  m: Messages;
  onToggle: (id: string) => void;
}) {
  const [quality, setQuality] = useState<number | null>(ANY);
  const [level, setLevel] = useState<number | null>(ANY);
  const [query, setQuery] = useState('');

  /*
   * A search wins over the filters rather than narrowing them.
   *
   * Somebody typing a name has stopped browsing, and an unnoticed rarity chip
   * left on from a minute ago would answer with nothing and look like an item
   * the tables do not have. The chips stay visibly set, so the way back to the
   * tier is to clear the box.
   */
  const searching = query.trim() !== '';
  const matches = useMemo(() => {
    if (searching) return items.search(query, MUTE_PAGE + 1);
    if (quality === ANY && level === ANY) return [];
    return items.grade(quality, level);
  }, [items, searching, query, quality, level]);

  const shown = matches.slice(0, MUTE_PAGE);
  const hidden = matches.length - shown.length;

  return (
    <div className="space-y-1">
      <div className="text-[0.5rem] tracking-wide text-muted-foreground uppercase">{m.settings.sounds.muted}</div>
      <p className="text-[0.5rem] leading-snug text-muted-foreground">{m.settings.sounds.mutedHint}</p>

      {/* Two ladders of chips, the same shape as the rule grids above: this is
          the same pair of questions about the same pair of grades, and asking
          it in a different control would read as a different question. */}
      <GradeChips
        label={m.settings.sounds.byQuality}
        grades={QUALITIES}
        active={quality}
        name={(grade) => m.settings.sounds.rarity[grade] ?? String(grade)}
        tint={qualityColor}
        anyLabel={m.settings.sounds.mutedAny}
        onPick={setQuality}
      />
      <GradeChips
        label={m.settings.sounds.byLevel}
        grades={LEVELS}
        active={level}
        name={(grade) => m.settings.sounds.level(grade)}
        anyLabel={m.settings.sounds.mutedAny}
        onPick={setLevel}
      />

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={m.settings.sounds.mutedSearch}
        className="h-7 text-xs"
      />

      {/* Only once something has been asked. With no chip set and no search,
          this is 1,703 rows of nothing anybody looked for. */}
      {(searching || quality !== ANY || level !== ANY) &&
        (shown.length === 0 ? (
          <p className="px-1 text-[0.5rem] text-muted-foreground">{m.settings.sounds.mutedNone}</p>
        ) : (
          <>
            <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md bg-black/25 p-1">
              {shown.map((item) => (
                <li key={item.id}>
                  <MuteRow item={item} on={muted.has(item.id)} gold={pricing.unit(item.id)} m={m} onToggle={onToggle} />
                </li>
              ))}
            </ul>
            {hidden > 0 && (
              <p className="px-1 text-[0.5rem] text-muted-foreground">{m.settings.sounds.mutedMore(hidden)}</p>
            )}
          </>
        ))}

      {/*
        What is muted right now, always drawn and never behind a filter.

        This is the half that answers "why did that not ring", and an answer you
        have to go looking for under the right rarity chip is not one. In the
        config's own order rather than sorted, so a row does not jump somewhere
        else in the list the moment its price changes.
      */}
      {order.length === 0 ? (
        <p className="px-1 text-[0.5rem] text-muted-foreground">{m.settings.sounds.mutedEmpty}</p>
      ) : (
        <ul className="space-y-0.5">
          {order.map((id) => {
            const info = items.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03]">
                <img src={iconUrl(info.icon)} alt="" className="size-5 shrink-0 rounded-sm object-cover" />
                <span className="min-w-0 flex-1 truncate" style={{ color: qualityColor(info.quality) }} title={id}>
                  {info.name}
                </span>
                <span className="shrink-0 text-[0.5rem] tabular-nums text-muted-foreground">
                  {compact(pricing.unit(id))}
                </span>
                <button
                  type="button"
                  onClick={() => onToggle(id)}
                  aria-label={m.settings.sounds.unmute(info.name)}
                  title={m.settings.sounds.unmuteHint}
                >
                  <X className="size-3 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * One browse row: the item, what it is worth, and whether it is muted.
 *
 * The price is on the row because the two settings in this box are about the
 * same judgement — this is the number the floor above is compared against, and
 * seeing it next to the name is often enough to close the list and raise the
 * floor instead of ticking twelve items.
 */
function MuteRow({
  item,
  on,
  gold,
  m,
  onToggle,
}: {
  item: ItemInfo;
  on: boolean;
  gold: number;
  m: Messages;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      aria-pressed={on}
      aria-label={on ? m.settings.sounds.unmute(item.name) : m.settings.sounds.mute(item.name)}
      title={on ? m.settings.sounds.unmuteHint : m.settings.sounds.muteHint}
      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10"
    >
      <img src={iconUrl(item.icon)} alt="" className="size-5 shrink-0 rounded-sm object-cover" />
      <span
        className={cn('min-w-0 flex-1 truncate', on && 'line-through opacity-60')}
        style={{ color: qualityColor(item.quality) }}
      >
        {item.name}
      </span>
      <span className="shrink-0 text-[0.5rem] tabular-nums text-muted-foreground">{compact(gold)}</span>
      {/* A crossed-out speaker when it is muted, an outline of one when it is
          not: the row says what it *is*, and clicking it is what changes that.
          A checkbox would have said the same thing in a vocabulary that has
          nothing to do with sound. */}
      {on ? (
        <VolumeX className="size-3.5 shrink-0 text-destructive" />
      ) : (
        <Volume2 className="size-3.5 shrink-0 text-muted-foreground/40" />
      )}
    </button>
  );
}

/**
 * A ladder of grades where exactly one may be chosen, or none.
 *
 * Deliberately not `RuleGrid`, which is the same ladder next door. That one is
 * a set of independent bindings — every chip carries its own sound and any
 * number of them can be set. This is a filter: one answer at a time, and an
 * "Any" that is a real position rather than the absence of one. Sharing a
 * component would have meant a `mode` prop and two behaviours reading through
 * each other.
 */
function GradeChips({
  label,
  grades,
  active,
  name,
  tint,
  anyLabel,
  onPick,
}: {
  label: string;
  grades: readonly number[];
  active: number | null;
  name: (grade: number) => string;
  /** The grade's colour, where it has one. Levels do not: the game gives them no palette. */
  tint?: (grade: number) => string;
  anyLabel: string;
  onPick: (grade: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-10 shrink-0 text-[0.5rem] tracking-wide text-muted-foreground uppercase">{label}</span>
      <Chip active={active === ANY} onClick={() => onPick(ANY)}>
        {anyLabel}
      </Chip>
      {grades.map((grade) => {
        const on = active === grade;
        const color = tint?.(grade);
        return (
          <Chip
            key={grade}
            active={on}
            // Clicking the chosen one again clears it, so the way back to "Any"
            // is the control you are already looking at.
            onClick={() => onPick(on ? ANY : grade)}
            color={color}
          >
            {name(grade)}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded border px-1 py-px text-[0.5rem] leading-tight transition-colors',
        active ? 'bg-white/[0.06]' : 'border-white/10 text-muted-foreground hover:border-white/25 hover:text-foreground',
        // Set, and no palette to wear: the levels and the "Any" chip. Explicit
        // rather than left to `border`'s default of `currentColor`.
        active && color === undefined && 'border-primary/60 text-foreground',
      )}
      // Inline, because the tint is a CSS variable per grade rather than a
      // class — the same `qualityColor` the item lists colour their names with.
      style={active && color !== undefined ? { color, borderColor: color } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * Search a catalogue of sounds, and keep the ones you want.
 *
 * The one place in this app that goes and looks something up, which is why it
 * says so: a line of text under the box naming where the results come from and
 * what licence they carry. A player who does not want that can empty
 * `soundSearchUrl` in the config and this disappears — every other sound
 * setting works exactly as before.
 *
 * Adding is one button rather than an audition-then-add pair, and that is a
 * consequence of where the audio can be played. The renderer's CSP allows no
 * connection but its own, so nothing can be heard until main has fetched it —
 * and once main has fetched it, it is on disk and there is nothing left to
 * decide. So adding plays it: you hear what you added, immediately, and the
 * sound is now in every picker in this window.
 *
 * Searching is on Enter and on the button, never per keystroke. The catalogue
 * is behind a shared daily quota, and a search-as-you-type box would spend a
 * server's whole day on one person exploring.
 */
// Exported only so that commenting out its one use above does not make it an
// unused local — `noUnusedLocals` is on, and deleting the component to satisfy
// the compiler would be deleting the feature rather than switching it off.
export function SoundSearch({
  packs,
  m,
  onPlay,
  enabled,
}: {
  packs: Record<string, SoundPack> | undefined;
  m: Messages;
  onPlay: (ref: string) => void;
  /** False when no server is configured, which hides this entirely. */
  enabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SoundHit[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** Ids added this session, so a row can say so before the config round-trips. */
  const [adding, setAdding] = useState<number | null>(null);

  const imported = packs?.[IMPORTED_PACK]?.sounds ?? {};

  const run = () => {
    const asked = query.trim();
    if (asked === '' || busy) return;
    setBusy(true);
    setProblem(null);
    void window.tracker
      .searchSounds(asked, 1)
      .then((answer) => {
        if ('error' in answer) {
          setHits(null);
          setProblem(m.settings.sounds.searchFail[answer.error]);
          return;
        }
        setHits(answer.hits);
        // An empty list is an answer, not a failure — and it needs saying, or
        // the panel looks like it is still thinking.
        setProblem(answer.hits.length === 0 ? m.settings.sounds.noHits : null);
      })
      .finally(() => setBusy(false));
  };

  const add = (hit: SoundHit) => {
    setAdding(hit.id);
    void window.tracker
      .importSound(hit)
      .then((result) => {
        if ('error' in result) {
          setProblem(m.settings.sounds.addFail);
          return;
        }
        // Played straight away: it is the only audition there is, and hearing
        // it is how you find out whether to keep it.
        onPlay(result.ref);
      })
      .finally(() => setAdding(null));
  };

  if (!enabled) return null;

  return (
    <div className="space-y-1.5 rounded-md bg-black/25 p-1.5">
      <div className="text-[0.625rem] font-medium">{m.settings.sounds.find}</div>
      <p className="text-[0.5rem] leading-snug text-muted-foreground">{m.settings.sounds.findHint}</p>

      <div className="flex gap-1">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') run();
          }}
          placeholder={m.settings.sounds.findPlaceholder}
          className="h-7 flex-1 text-xs"
        />
        <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-[0.625rem]" onClick={run} disabled={busy}>
          {busy ? <RotateCw className="size-3 animate-spin" /> : <Search className="size-3" />}
        </Button>
      </div>

      {problem !== null && <p className="text-[0.5rem] text-muted-foreground">{problem}</p>}

      {hits !== null && hits.length > 0 && (
        <ul className="space-y-0.5">
          {hits.map((hit) => {
            const here = imported[importedSoundId(hit.name, hit.id)] !== undefined;
            return (
              <li key={hit.id} className="flex items-center gap-2 rounded px-1 py-0.5 odd:bg-white/[0.03]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.625rem]" title={hit.name}>
                    {hit.name}
                  </div>
                  {/* The author and the licence on the row, not behind a
                      tooltip: most of this catalogue is CC-BY, and a credit you
                      have to go looking for is a credit nobody gives. */}
                  <div className="truncate text-[0.5rem] text-muted-foreground" title={hit.license}>
                    {m.settings.sounds.by(hit.username)} · {m.settings.sounds.seconds(Math.round(hit.duration))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (here ? onPlay(packRef(IMPORTED_PACK, importedSoundId(hit.name, hit.id))) : add(hit))}
                  disabled={adding === hit.id}
                  aria-label={here ? m.settings.sounds.play(hit.name) : m.settings.sounds.add(hit.name)}
                  title={here ? m.settings.sounds.playHint : m.settings.sounds.addHint}
                  className="shrink-0"
                >
                  {adding === hit.id ? (
                    <RotateCw className="size-3.5 animate-spin text-muted-foreground" />
                  ) : here ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    <Plus className="size-3.5 text-muted-foreground hover:text-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One sound that can be bound: what to call it, and which list it came from. */
interface SoundChoice {
  ref: string;
  label: string;
  /** The heading it sits under — the box, or the pack it arrived with. */
  group: string;
}

/**
 * Everything bindable, in the order the menu should offer it.
 *
 * The sounds in the box first, then each installed pack, because the built-ins
 * are the ones that are certainly there — a pack whose files are still being
 * fetched is a heading with names under it that will not play yet, and that is
 * a better thing to meet second than first.
 *
 * Memoised on the packs themselves rather than rebuilt per menu: there is one
 * of these menus per grade chip and per bound item, which is upwards of twenty
 * on a settings window that has been used for a while.
 */
function useSoundChoices(packs: Record<string, SoundPack> | undefined, m: Messages): SoundChoice[] {
  return useMemo(
    () => [
      ...BUILTIN_REFS.map((ref) => ({ ref, label: soundLabel(ref), group: m.settings.sounds.builtins })),
      ...Object.values(packs ?? {}).flatMap((pack) =>
        Object.keys(pack.sounds)
          .sort((a, b) => a.localeCompare(b))
          // The sound's id is its name here. A pack writes those to be read —
          // `vine-boom`, not a filename with a hash in it — so there is nothing
          // to prettify, and prettifying would hide the half of the reference
          // somebody has to type into a shared config.
          .map((id) => ({ ref: packRef(pack.id, id), label: id, group: pack.name })),
      ),
    ],
    [packs, m],
  );
}

/**
 * Longer than this and the list is one you search rather than read.
 *
 * The box ships one sound, so this is really a threshold about packs: a menu
 * that grows a filter field the moment it needs one, and does not carry an
 * empty search box around before then.
 */
const FILTER_AT = 8;

/**
 * The menu behind anything that has a sound: the grade chips and the bound
 * items alike.
 *
 * One control rather than a row of icon buttons, because the answer is a
 * choice from a list — the sounds in the box, one out of a pack, or a file of
 * your own — and a list is what a menu is for. Play sits at the top of it: the
 * reason to open this at all is usually to hear what is already there.
 */
function SoundMenu({
  sound,
  choices,
  m,
  onPick,
  onChoose,
  onClear,
  onPlay,
  children,
}: {
  /** The sound now, or undefined for a grade nothing has been set on. */
  sound: string | undefined;
  /** Everything it could be instead. See `useSoundChoices`. */
  choices: SoundChoice[];
  m: Messages;
  onPick: (ref: string) => void;
  onChoose: () => void;
  onClear: () => void;
  onPlay: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const searchable = choices.length > FILTER_AT;

  /*
   * Puts the cursor in the filter field, once the menu has finished opening.
   *
   * Radix focuses the menu itself on open — right for a list you arrow through,
   * wrong for one that starts with a text box — and its `onOpenAutoFocus` is
   * not exposed on a dropdown's content, so this cannot be done by preventing
   * it. A frame later is after the content has mounted and taken focus, which
   * is the only ordering that is actually guaranteed here.
   */
  useEffect(() => {
    if (!open || !searchable) return;
    const frame = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, searchable]);

  const needle = filter.trim().toLowerCase();
  // The pack's name matches too, so "jackpots" narrows to a pack rather than
  // finding nothing — the name is how people refer to a set of sounds, and a
  // filter that only knows the leaves cannot answer "show me those".
  const matches =
    needle === ''
      ? choices
      : choices.filter((c) => c.label.toLowerCase().includes(needle) || c.group.toLowerCase().includes(needle));

  // Grouped in encounter order rather than sorted, so the headings stay where
  // `useSoundChoices` put them however the filter thins them out.
  const groups: [string, SoundChoice[]][] = [];
  for (const choice of matches) {
    const last = groups[groups.length - 1];
    if (last && last[0] === choice.group) last[1].push(choice);
    else groups.push([choice.group, [choice]]);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // A filter left over from last time would open the menu on a list that
        // is already narrowed, with the reason offscreen above it.
        if (!next) setFilter('');
      }}
    >
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {sound !== undefined && (
          <>
            <DropdownMenuItem onSelect={onPlay}>
              <Play /> {m.settings.sounds.playHint}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {searchable && (
          // Sticky, because the content is its own scroll container: a filter
          // that scrolls away is one you cannot correct without going back up.
          <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 bg-popover px-1 pt-1 pb-1">
            <Input
              ref={field}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              /*
               * Held back from the menu, with one exception.
               *
               * A menu reads plain keypresses as typeahead and jumps focus to
               * the item they match, which in a text field means every letter
               * typed lands somewhere else. Escape is let through on purpose:
               * it is handled on the document by the dismissable layer, so
               * stopping it here would leave the menu with no way to close from
               * the field it opens focused in.
               */
              onKeyDown={(e) => {
                if (e.key !== 'Escape') e.stopPropagation();
              }}
              placeholder={m.settings.sounds.filter}
              aria-label={m.settings.sounds.filter}
              className="h-6 text-[0.625rem]"
            />
          </div>
        )}

        {groups.map(([group, entries]) => (
          <div key={group}>
            <DropdownMenuLabel>{group}</DropdownMenuLabel>
            {entries.map((choice) => (
              <DropdownMenuItem key={choice.ref} onSelect={() => onPick(choice.ref)}>
                {choice.ref === sound ? (
                  <Check className="text-primary" />
                ) : (
                  <Volume2 className="text-muted-foreground" />
                )}
                {choice.label}
              </DropdownMenuItem>
            ))}
          </div>
        ))}

        {/* Said rather than shown as an empty menu: nothing under a filter box
            looks exactly like a menu that failed to load. */}
        {groups.length === 0 && (
          <div className="px-2 py-1.5 text-[0.625rem] text-muted-foreground">{m.settings.sounds.noMatch}</div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onChoose}>
          <FolderOpen className="text-muted-foreground" /> {m.settings.sounds.choose}
        </DropdownMenuItem>
        {sound !== undefined && (
          <DropdownMenuItem variant="destructive" onSelect={onClear}>
            <X /> {m.settings.sounds.remove}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
