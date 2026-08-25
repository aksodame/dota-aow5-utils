import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  FolderOpen,
  Images,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Volume2,
  X,
} from 'lucide-react';
import { CARD_IDS, DEFAULT_CARDS, readCards, type CardId } from '@core/cards.ts';
import { iconUrl, qualityColor, type ItemTable } from '@core/items.ts';
import { LOCALES, type LanguageSetting } from '@core/locale.ts';
import { BUILTIN_JACKPOT, DEFAULT_SOUNDS, LIMIT, soundLabel, VOLUME, type SoundSettings } from '@core/sounds.ts';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import type { Pricing } from '@/features/items/prices';
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

          {tracked.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tracked.map((id) => (
                <Badge key={id} variant="secondary" className="gap-1 py-0 ps-1.5 pe-1 text-[0.625rem]">
                  {itemTable.get(id).name}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-label={m.settings.tracked.untrack(itemTable.get(id).name)}
                  >
                    <X className="size-3 hover:text-destructive" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </section>

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
                        {/* The file's name, with the whole path on hover: the
                            rest of it is where you keep your sounds. */}
                        <span className="w-20 shrink-0 truncate text-right text-[0.5rem] text-muted-foreground" title={ref}>
                          {soundLabel(ref)}
                        </span>
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
                          onClick={() => rebind(id)}
                          aria-label={m.settings.sounds.pick(info.name)}
                          title={m.settings.sounds.pickHint}
                        >
                          <FolderOpen className="size-3 text-muted-foreground hover:text-foreground" />
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

          {/*
            Under Optimization with the trim, because the two are the same kind
            of thing: a drawer the app fills on its own, and a way to empty it
            by hand when it has filled with something wrong. Neither is a
            preference — nothing here changes what the tracker does, only what
            it is still holding on to.

            The item art is the only thing in the app fetched rather than
            bundled, so it is the only thing a player can be stuck behind a
            stale answer about — and a bad answer is kept for as long as the
            server asked, which was a month the time it mattered.
          */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-7 shrink-0 text-xs"
              onClick={() => void window.tracker.clearCache()}
            >
              <Images className="size-3.5" /> {m.settings.log.cache}
            </Button>
            <span className="min-w-0 flex-1 text-[0.625rem] text-muted-foreground">
              {m.settings.log.cacheHint}
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
        className="h-6 w-16 shrink-0 text-right text-[0.625rem] tabular-nums"
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
