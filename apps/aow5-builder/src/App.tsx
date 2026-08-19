import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AlertTriangle, ExternalLink, Info, Loader2, RotateCcw } from 'lucide-react';
import {
  MAX_SECTIONS,
  MIN_SECTIONS,
  SLOT_GROUP_AT,
  buildReducer,
  countSpells,
  createEmptyState,
  isEmptyState,
  isSectionEmpty,
  makeIdTable,
  slotAcceptsAt,
  spellDefaults,
  type BuildState,
  type DecodeWarning,
  type HeroTable,
  type IdTable,
} from 'aow5-shared/codec';
import { readInitialFromUrl, useShareUrl, useUrlSync } from '@/build/useUrlSync';
import { AddSectionCard } from '@/components/AddSectionCard';
import { AuroraBackground } from '@/components/fx/AuroraBackground';
import { CountUp } from '@/components/fx/CountUp';
import { Reveal } from '@/components/fx/Reveal';
import { HeroPicker } from '@/components/HeroPicker';
import { ReferralCode } from '@/components/ReferralCode';
import { ItemPicker } from '@/components/ItemPicker';
import { Section } from '@/components/Section';
import { ShareBar } from '@/components/ShareBar';
import { SpellPicker } from '@/components/SpellPicker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { loadCore, type CoreData } from 'aow5-shared/data';
import {
  LANGUAGES,
  STRINGS,
  detectLang,
  storeLang,
  type Lang,
} from '@/i18n/strings';
import { getInitialReferral, storeReferral, writeReferralToUrl } from '@/lib/referral';
import { applyTheme, getInitialTheme, storeTheme, type Theme } from '@/lib/theme';
import { ABILITY_SLOTS, type HeroId } from 'aow5-shared/types';

/** The addon this planner reads its data from. */
const WORKSHOP_URL = 'https://steamcommunity.com/sharedfiles/filedetails?id=2967026351';

interface Target {
  section: number;
  slot: number;
}

interface SpellTarget {
  section: number;
  /** Index into ABILITY_SLOTS. */
  spell: number;
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => detectLang());
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [referral, setReferral] = useState<string>(() => getInitialReferral());
  const [core, setCore] = useState<CoreData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, dispatch] = useReducer(buildReducer, undefined, createEmptyState);
  const [target, setTarget] = useState<Target | null>(null);
  const [spellTarget, setSpellTarget] = useState<SpellTarget | null>(null);
  const [warnings, setWarnings] = useState<DecodeWarning[]>([]);
  const [fatal, setFatal] = useState<{ kind: 'version'; version: number } | { kind: 'malformed' } | null>(null);
  const [banner, setBanner] = useState(true);

  const strings = STRINGS[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = strings.title;
  }, [lang, strings.title]);

  // Put the code in the address bar on arrival too, not just after an edit —
  // otherwise the default would never travel with a link the visitor shares.
  useEffect(() => {
    if (referral !== '') writeReferralToUrl(referral);
  }, [referral]);

  // index.html already applied the stored theme before paint; this keeps the
  // class in step with the toggle afterwards.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load the index and the active language's names.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    loadCore(lang)
      .then((data) => {
        if (!cancelled) setCore(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [lang, reloadKey]);

  const table: IdTable | null = useMemo(
    // Kinds ride along so links from before typed slots existed can be
    // re-homed into the right positions rather than by raw index.
    () => (core ? makeIdTable(core.ids, core.meta.idTableHash, core.kinds) : null),
    [core],
  );

  // The spells segment resolves against its own frozen table, so it is passed
  // alongside the item table rather than folded into it.
  const heroTable: HeroTable | null = useMemo(
    () => (core ? { abilityIds: core.heroes.abilityIds, heroIds: core.heroes.heroIds } : null),
    [core],
  );

  // Hydrate from the URL once the id table is available. Decoding any earlier
  // would mean resolving indices against a table we do not have yet.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!table || hydrated) return;
    const result = readInitialFromUrl(table, heroTable ?? undefined);
    if (result.initial) dispatch({ type: 'hydrate', state: result.initial });
    setWarnings(result.warnings);
    if (result.unsupportedVersion !== null) setFatal({ kind: 'version', version: result.unsupportedVersion });
    else if (result.malformed) setFatal({ kind: 'malformed' });
    setHydrated(true);
  }, [table, heroTable, hydrated]);

  const onExternalChange = useCallback((next: BuildState) => {
    dispatch({ type: 'hydrate', state: next });
  }, []);
  useUrlSync(state, hydrated ? table : null, heroTable, onExternalChange);
  const shareUrl = useShareUrl(state, table, heroTable, referral);

  const empty = isEmptyState(state);
  const unknownCount = state.sections.reduce((n, s) => n + s.slots.filter((v) => v?.k === 'unknown').length, 0);
  const unknownSpellCount = state.sections.reduce(
    (n, s) => n + s.spells.filter((v) => v?.k === 'unknown').length,
    0,
  );
  const tableMismatch = warnings.some((w) => w.k === 'table-mismatch');

  // Whatever is already in the slot being edited, so the picker can open
  // straight onto its stats instead of an empty detail pane.
  const targetSlot = target ? state.sections[target.section]?.slots[target.slot] : null;
  const currentSlotId = targetSlot?.k === 'id' ? targetSlot.id : null;
  const targetKind = target ? slotAcceptsAt(target.slot) : 0;
  const targetGroupKey = target ? SLOT_GROUP_AT[target.slot]?.key : undefined;
  const targetLabel = targetGroupKey ? strings.slotGroup[targetGroupKey] : '';

  // The hero drives both the spell row on every card and the picker's options.
  const hero = core && state.hero ? (core.heroes.byHero.get(state.hero) ?? null) : null;
  const heroName = (id: HeroId) => core?.heroes.byHero.get(id)?.names[lang] ?? id;
  const spellSlotKey = spellTarget ? ABILITY_SLOTS[spellTarget.spell] : undefined;
  const spellCandidates =
    core && hero && spellSlotKey
      ? (hero.bySlot[spellSlotKey] ?? []).flatMap((id) => {
          const spell = core.heroes.spells.get(id);
          return spell ? [spell] : [];
        })
      : [];
  const currentSpell = spellTarget ? state.sections[spellTarget.section]?.spells[spellTarget.spell] : null;
  const currentSpellId = currentSpell?.k === 'id' ? currentSpell.id : null;

  /**
   * Abilities belong to exactly one hero, so switching clears every pick. Ask
   * first when that would actually cost something — a key with one candidate was
   * filled in automatically, so losing it is not a decision being thrown away.
   */
  const deliberateSpells = hero
    ? state.sections.reduce(
        (n, s) =>
          n +
          s.spells.filter((v, i) => {
            if (!v) return false;
            const slot = ABILITY_SLOTS[i];
            return slot === undefined || (hero.bySlot[slot]?.length ?? 0) !== 1;
          }).length,
        0,
      )
    : countSpells(state);

  const chooseHero = (next: HeroId | null) => {
    if (deliberateSpells > 0 && !window.confirm(strings.heroChangeConfirm(deliberateSpells))) return;
    dispatch({ type: 'setHero', hero: next, defaults: spellDefaults(next ? core?.heroes.byHero.get(next) : null) });
  };

  // Every new or cleared section starts with the current hero's forced picks.
  const defaults = spellDefaults(hero);

  // Only sections that hold something are worth copying; an empty one is what
  // the plain "add section" button already gives you.
  const copySources = state.sections.flatMap((section, i) =>
    isSectionEmpty(section) ? [] : [{ index: i, label: section.name ?? strings.defaultSection(i + 1) }],
  );

  if (loadError) {
    return (
      <main className="mx-auto max-w-md px-4 py-24">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{strings.loadFailed}</AlertTitle>
          <AlertDescription>
            <code className="text-xs break-all">{loadError}</code>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setReloadKey((k) => k + 1)}>
              <RotateCcw /> {strings.retry}
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!core || !table) {
    return (
      <main className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {strings.loading}
      </main>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <AuroraBackground />
      <main className="mx-auto max-w-[1500px] px-4 py-6 pb-16">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight">{strings.title}</h1>
            <p className="max-w-prose text-sm text-muted-foreground">{strings.tagline}</p>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher
              languages={LANGUAGES.filter((l) => core.meta.languages.includes(l))}
              active={lang}
              label={strings.language}
              onSelect={(next) => {
                setLang(next);
                storeLang(next);
              }}
            />

            <ThemeToggle
              theme={theme}
              label={strings.theme}
              onToggle={() => {
                const next: Theme = theme === 'dark' ? 'light' : 'dark';
                setTheme(next);
                storeTheme(next);
              }}
            />

            <Button
              variant="outline"
              disabled={empty}
              onClick={() => {
                if (window.confirm(strings.resetConfirm)) dispatch({ type: 'clearAll' });
              }}
            >
              <RotateCcw /> {strings.reset}
            </Button>
          </div>
        </header>

        <div className="mb-4">
          <ShareBar
            url={shareUrl}
            isEmpty={empty}
            state={state}
            strings={strings}
            onImport={(next) => dispatch({ type: 'hydrate', state: next })}
          />
        </div>

        {banner && (fatal || tableMismatch || unknownCount > 0 || unknownSpellCount > 0 || state.heroUnknown !== null) && (
          <Alert variant={fatal ? 'destructive' : 'default'} className="mb-4">
            {fatal ? <AlertTriangle /> : <Info />}
            <AlertTitle>{fatal ? strings.loadFailed : strings.heads_up}</AlertTitle>
            <AlertDescription>
              {fatal?.kind === 'version' && <p>{strings.errUnsupportedVersion(fatal.version)}</p>}
              {fatal?.kind === 'malformed' && <p>{strings.errMalformed}</p>}
              {tableMismatch && <p>{strings.warnTableMismatch}</p>}
              {unknownCount > 0 && <p>{strings.warnUnknownItems(unknownCount)}</p>}
              {state.heroUnknown !== null && <p>{strings.warnUnknownHero}</p>}
              {unknownSpellCount > 0 && <p>{strings.warnUnknownSpells(unknownSpellCount)}</p>}
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setBanner(false)}>
                {strings.dismiss}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ReferralCode
          code={referral}
          strings={strings}
          onChange={(next) => {
            setReferral(next);
            storeReferral(next);
            writeReferralToUrl(next);
          }}
        />

        <HeroPicker
          heroes={core.heroes}
          nameOf={heroName}
          selected={state.hero}
          unknown={state.heroUnknown}
          strings={strings}
          onSelect={chooseHero}
        />

        {/*
          Thirds once there is room for them. A card cannot go below roughly
          250px without its slot grid overflowing — three 54px tiles plus the
          right-hand column and padding — so the ladder stops at two columns
          until `lg`, where a third still leaves each card over 320px.
        */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.sections.map((section, i) => (
            <Reveal key={i} index={i}>
              <Section
                index={i}
                section={section}
                byId={core.byId}
                hero={hero}
                spells={core.heroes.spells}
                strings={strings}
                canRemove={state.sections.length > MIN_SECTIONS}
                onRename={(name) => dispatch({ type: 'renameSection', section: i, name })}
                onDescribe={(description) => dispatch({ type: 'describeSection', section: i, description })}
                onClearSection={() => dispatch({ type: 'clearSection', section: i, defaults })}
                onRemoveSection={() => dispatch({ type: 'removeSection', section: i })}
                onPickSlot={(slot) => setTarget({ section: i, slot })}
                onClearSlot={(slot) => dispatch({ type: 'clearSlot', section: i, slot })}
                onPickSpell={(spell) => setSpellTarget({ section: i, spell })}
                onClearSpell={(spell) => dispatch({ type: 'clearSpell', section: i, spell })}
              />
            </Reveal>
          ))}

          {state.sections.length < MAX_SECTIONS && (
            <Reveal index={state.sections.length}>
              <AddSectionCard
                count={state.sections.length}
                sources={copySources}
                strings={strings}
                onAdd={() => dispatch({ type: 'addSection', defaults })}
                onCopy={(section) => dispatch({ type: 'duplicateSection', section })}
              />
            </Reveal>
          )}
        </div>

        <Separator className="mt-8 mb-4" />

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="max-w-prose">{strings.attribution}</span>
          <a
            href={WORKSHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
          >
            {strings.workshopLink}
            <ExternalLink className="size-3" />
          </a>
          {/* Counts sit at the far right; `ms-auto` eats the space between. */}
          <span className="ms-auto flex items-center gap-2">
            <Badge variant="secondary">
              <CountUp value={core.meta.playableCount} /> items
            </Badge>
            <span className="font-mono">
              icons <CountUp value={core.meta.icons.vpk} /> addon / <CountUp value={core.meta.icons.cdn} /> stock
            </span>
          </span>
        </footer>

        <ItemPicker
          open={target !== null}
          items={core.items}
          byId={core.byId}
          currentId={currentSlotId}
          slotKind={targetKind}
          slotLabel={targetLabel}
          lang={lang}
          strings={strings}
          onSelect={(item) => {
            if (target) dispatch({ type: 'setSlot', ...target, value: { k: 'id', id: item.id } });
            setTarget(null);
          }}
          onClear={() => {
            if (target) dispatch({ type: 'clearSlot', ...target });
            setTarget(null);
          }}
          onClose={() => setTarget(null)}
        />

        <SpellPicker
          open={spellTarget !== null}
          slot={spellSlotKey ?? null}
          candidates={spellCandidates}
          currentId={currentSpellId}
          canClear={currentSpell != null}
          heroName={state.hero ? heroName(state.hero) : ''}
          strings={strings}
          onSelect={(id) => {
            if (spellTarget) dispatch({ type: 'setSpell', ...spellTarget, value: { k: 'id', id } });
            setSpellTarget(null);
          }}
          onClear={() => {
            if (spellTarget) dispatch({ type: 'clearSpell', ...spellTarget });
            setSpellTarget(null);
          }}
          onClose={() => setSpellTarget(null)}
        />

        <Toaster position="bottom-right" />
      </main>
    </TooltipProvider>
  );
}
