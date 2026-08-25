import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AlertTriangle, Info, Loader2, RotateCcw } from 'lucide-react';
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
import { CountUp } from '@/components/fx/CountUp';
import { Reveal } from '@/components/fx/Reveal';
import { HeroPicker } from '@/components/HeroPicker';
import { ReferralCode } from '@/components/ReferralCode';
import { ItemPicker } from '@/components/ItemPicker';
import { ItemDetailsProvider } from '@/data/ItemDetailsProvider';
import { Section } from '@/components/Section';
import type { BuildDetail } from 'aow5-api-contract';
import { decodeBuild, encodeBuild } from 'aow5-shared/codec';
import { BuildHeader, type BuildDraft } from '@/builds/BuildHeader';
import { CommentThread } from '@/builds/CommentThread';
import { useMe } from '@/auth/useMe';
import { SaveBuildButton } from '@/builds/SaveBuildButton';
import type { SiteStrings } from '@/i18n/site';
import { PublishDialog } from '@/components/PublishDialog';
import { ShareBar } from '@/components/ShareBar';
import { SpellPicker } from '@/components/SpellPicker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { loadCore, type CoreData } from 'aow5-shared/data';
import type { Lang, Strings } from '@/i18n/strings';
import { getInitialReferral, getOwnReferral, storeReferral, writeReferralToUrl } from '@/lib/referral';
import { ABILITY_SLOTS, type HeroId } from 'aow5-shared/types';

interface Target {
  section: number;
  slot: number;
}

interface SpellTarget {
  section: number;
  /** Index into ABILITY_SLOTS. */
  spell: number;
}

/**
 * The planner, at `/builder`.
 *
 * Language and theme are the shell's — they are site-wide preferences and the
 * switchers live in the site header — so they arrive as props rather than
 * being owned here. Everything below this line is unchanged from when this
 * file was the whole application.
 */
export function PlannerPage({
  lang,
  strings,
  site,
  build,
  onBuildChanged,
}: {
  lang: Lang;
  strings: Strings;
  site: SiteStrings;
  /**
   * A saved build being looked at, rather than a fresh board.
   *
   * The planner is the same either way — editable, with every picker working —
   * because a build you cannot poke at is a screenshot. What changes is where
   * the board came from, whether the URL tracks it, and what "save" means.
   */
  build?: BuildDetail | undefined;
  onBuildChanged?: ((next: BuildDetail) => void) | undefined;
}) {
  const [publishing, setPublishing] = useState(false);
  const me = useMe();
  const signedIn = me.status === 'ready' && me.user !== null;

  /*
   * The saved build's words, while they are being changed.
   *
   * Initialised from the prop rather than synced to it, which is safe because
   * BuildPage keys this component by slug — moving to another build remounts
   * rather than leaving somebody's half-typed title attached to it.
   */
  const [draft, setDraft] = useState<BuildDraft>(() => ({
    title: build?.title ?? '',
    body: build?.body ?? '',
  }));
  /**
   * The code in the field above the roster.
   *
   * Where it starts from depends on whose board this is. A fresh planner uses
   * the visitor's own — the URL's, then this browser's, then the default. A
   * saved build uses the one stored *with the build*, because that is the
   * author's and is the whole reason it is on the page; an author who saved
   * before the field existed gets their own prefilled, so one click puts it on.
   */
  const [referral, setReferral] = useState<string>(() => {
    if (build === undefined) return getInitialReferral();
    if (build.referral !== '') return build.referral;
    // Saved with no code. Yours: your own if you have one, prefilled and one
    // click from being on it — but never the site's default, which would mark
    // your build unsaved until you stamped a stranger's code onto it. Somebody
    // else's: empty, and the card is not drawn at all, because filling a field
    // labelled "author's code" with the *reader's* would be a lie.
    return build.canEdit ? (getOwnReferral() ?? '') : '';
  });
  const [core, setCore] = useState<CoreData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, dispatch] = useReducer(buildReducer, undefined, createEmptyState);
  const [target, setTarget] = useState<Target | null>(null);
  const [spellTarget, setSpellTarget] = useState<SpellTarget | null>(null);
  const [warnings, setWarnings] = useState<DecodeWarning[]>([]);
  const [fatal, setFatal] = useState<{ kind: 'version'; version: number } | { kind: 'malformed' } | null>(null);
  const [banner, setBanner] = useState(true);

  // Put the code in the address bar on arrival too, not just after an edit —
  // otherwise the default would never travel with a link the visitor shares.
  //
  // The planner only. A saved build's address is its slug and its code lives in
  // the database, so `?ref=` there would be a second, staler copy of the same
  // fact — and one that a later visit would read back in preference to it.
  useEffect(() => {
    if (build === undefined && referral !== '') writeReferralToUrl(referral);
  }, [build, referral]);

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

    /*
     * A saved build's board comes from the API, never from the URL.
     *
     * That is what keeps `/builds/<slug>` free of a fragment: the slug is the
     * whole address, and the fragment stays the planner's alone.
     */
    if (build !== undefined) {
      const decoded = decodeBuild(build.payload, table, heroTable ?? undefined);
      if (decoded.ok) {
        dispatch({ type: 'hydrate', state: decoded.state });
        setWarnings(decoded.warnings);
      } else if (decoded.reason === 'unsupported-version') {
        setFatal({ kind: 'version', version: decoded.version ?? 0 });
      } else {
        setFatal({ kind: 'malformed' });
      }
      setHydrated(true);
      return;
    }

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
  // Passing a null table switches the sync off entirely, which is what a saved
  // build wants: its address is its slug, and writing the board into the
  // fragment here would give the same build two URLs that drift apart.
  useUrlSync(state, hydrated && build === undefined ? table : null, heroTable, onExternalChange);
  const shareUrl = useShareUrl(state, table, heroTable, referral);

  /**
   * Whether the code on screen is the viewer's to change.
   *
   * Yours on a blank planner, and yours on a build you may edit. On anybody
   * else's build it is the author's, saved with their build, and is shown
   * rather than offered.
   */
  const referralEditable = build === undefined || build.canEdit;

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
      <div className="mx-auto max-w-md px-4 py-24">
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
      </div>
    );
  }

  if (!core || !table) {
    return (
      <div className="flex min-h-[60svh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {strings.loading}
      </div>
    );
  }

  return (
    /* One loader for every stat block on the page — the picker's pane and the
       hover card on each filled slot. It is mounted here, around the board and
       the dialog both, and stays idle until one of them asks. */
    <ItemDetailsProvider lang={lang} byId={core.byId}>
      <div className="mx-auto max-w-6xl px-4 py-6 pb-16">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          {build === undefined ? (
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight">{strings.title}</h1>
              <p className="max-w-prose text-sm text-muted-foreground">{strings.tagline}</p>
            </div>
          ) : (
            <BuildHeader
              build={build}
              site={site}
              {...(build.canEdit ? { draft, onDraft: setDraft } : {})}
            />
          )}

          {/* Language and theme moved to the site header — they are the site's
              preferences, not this page's. What is left are the two things you
              can do to the board in front of you. */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Yours, or nobody's yet. Reset wipes the board, which is not a
                thing to offer on somebody else's page even though the copy on
                screen is only ever local. */}
            {(build === undefined || build.canEdit) && (
              <Button
                variant="outline"
                disabled={empty}
                onClick={() => {
                  if (window.confirm(strings.resetConfirm)) dispatch({ type: 'clearAll' });
                }}
              >
                <RotateCcw /> {strings.reset}
              </Button>
            )}

            {build !== undefined && table !== null && (
              <SaveBuildButton
                build={build}
                payload={encodeBuild(state, table, heroTable ?? undefined)}
                referral={referral}
                draft={draft}
                site={site}
                {...(onBuildChanged ? { onSaved: onBuildChanged } : {})}
              />
            )}
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

          {/*
            Saving sits beside the share bar rather than inside it. Copying a link
            is instant, needs no account and changes nothing; saving puts your
            name on something searchable and spends one of five slots. One control
            for both would make the cheap act feel like the expensive one.
          */}
          {build === undefined
            ? signedIn &&
              !empty &&
              !publishing && (
                <div className="mt-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setPublishing(true)}>
                    {site.builds.publish}
                  </Button>
                </div>
              )
            : null}

          {publishing && build === undefined && (
            <PublishDialog
              /* Encoded straight from the board rather than sliced back out of
                 the share URL: that string also carries `?ref=`, and reading a
                 payload out of it depended on a `#b=` that an empty board does
                 not have. */
              payload={encodeBuild(state, table, heroTable ?? undefined)}
              referral={referral}
              site={site}
              onClose={() => setPublishing(false)}
            />
          )}
        </div>

        {banner && (fatal || tableMismatch || unknownCount > 0 || unknownSpellCount > 0 || state.heroUnknown !== null) && (
          <Alert variant={fatal ? 'destructive' : 'default'} className="mb-4">
            {fatal ? <AlertTriangle /> : <Info />}
            <AlertTitle>{fatal ? strings.loadFailed : strings.heads_up}</AlertTitle>
            <AlertDescription>
              {fatal?.kind === 'version' && <p>{strings.errUnsupportedVersion}</p>}
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

        {/*
          Hidden only on somebody else's build that carries no code at all — an
          empty read-only field would be a question the page cannot answer.
        */}
        {(referralEditable || referral !== '') && (
          <ReferralCode
            code={referral}
            strings={strings}
            variant={build === undefined ? 'own' : referralEditable ? 'build' : 'author'}
            onChange={(next) => {
              setReferral(next);
              // Still yours even when it is being saved onto a build, so the
              // planner remembers it next time. The URL copy stays a planner
              // thing — see the effect above.
              storeReferral(next);
              if (build === undefined) writeReferralToUrl(next);
            }}
          />
        )}

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

        {/* What the board is drawn from. The attribution and the workshop
            link are the site footer's, on every page rather than this one. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Badge variant="secondary">
              <CountUp value={core.meta.playableCount} /> items
            </Badge>
            <span className="font-mono">
              icons <CountUp value={core.meta.icons.vpk} /> addon / <CountUp value={core.meta.icons.cdn} /> stock
            </span>
          </span>
        </div>

        <ItemPicker
          open={target !== null}
          items={core.items}
          byId={core.byId}
          currentId={currentSlotId}
          slotKind={targetKind}
          slotLabel={targetLabel}
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

        {build !== undefined && <CommentThread slug={build.slug} site={site} />}
      </div>
    </ItemDetailsProvider>
  );
}
