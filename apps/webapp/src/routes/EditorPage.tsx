import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { BuildPriority } from 'aow5-api-contract';
import {
  MAX_BODY,
  MAX_PRICE,
  MAX_REFERRAL,
  MAX_TITLE as MAX_TITLE_API,
  MAX_VIDEO_ID,
  type MainSpellKey,
} from 'aow5-api-contract';
import {
  buildReducer,
  createEmptyState,
  decodeBuild,
  encodeBuild,
  groupsInPanel,
  slotAcceptsAt,
  spellDefaults,
  type BuildState,
  type SlotGroup,
} from 'aow5-shared/codec';
import { ABILITY_SLOTS } from 'aow5-shared/types';
import { Button, Field, Fieldset, Icon, Input, Loading, Panel, Select, Textarea, cx } from '@/ui';
import { ItemPicker } from '@/components/ItemPicker';
import { PriorityPanel } from '@/components/PriorityPanel';
import { useApp } from '@/data/AppData';
import { createBuild, deleteBuild, getBuild, updateBuild } from '@/builds/api';
import { ApiFailure } from '@/lib/api';
import { formatPrice, formatPriceExact } from '@/lib/price';
import { normalizeReferral } from '@/lib/referral';
import { forSaving, prioritySlots } from '@/lib/priority';
import { BlankTile, ItemTile, SpellTile } from '@/components/Tile';
import { SpellPicker } from '@/components/SpellPicker';
import { HeroChoices } from '@/components/HeroChoices';
import { MapChoices } from '@/components/MapChoices';
import { categoryOfMap, listedTiers, tierLabel, type TierKey } from 'aow5-shared/data';
import { mainSpellKey, spellsInDisplayOrder } from '@/lib/preview';
import { carriesBuildPayload, editPath, navigate, toBuild, useSearch, viewPath, withLang } from '@/router';
import styles from './EditorPage.module.css';

/**
 * Making a build.
 *
 * The loadout lives in the URL fragment while it is being edited, exactly as
 * the old planner's board did — which is what lets somebody who does not want
 * an account still build something and share the link. Saving is the extra
 * step that needs Steam, not the building.
 */

/**
 * The id out of whatever was typed or pasted.
 *
 * The field is eleven characters wide, and people paste addresses into fields
 * regardless — so a pasted `watch?v=…&t=30` or `youtu.be/…?si=…` gives up its
 * id rather than becoming a validation error. `v=` wins where it is present,
 * because that is the one shape where the id is not the last path segment;
 * everything else is the segment after the final slash, with the query cut off
 * first. What is left is filtered to YouTube's own alphabet, which is what
 * makes a half-typed id on its way to eleven characters still legal to hold.
 */
function idOf(value: string): string {
  const raw = value.trim();
  const fromQuery = /[?&]v=([A-Za-z0-9_-]+)/.exec(raw);
  const source = fromQuery?.[1] ?? raw.split(/[?#]/)[0]?.split('/').pop() ?? '';
  return source.replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_VIDEO_ID);
}

/** What is being edited: a new build, or one the author already owns. */
type Picking =
  | { kind: 'none' }
  | { kind: 'item'; slot: number }
  | { kind: 'spell'; index: number };

export function EditorPage() {
  const { strings, core, tables, me, refreshMe, lang } = useApp();
  const search = useSearch();
  const slug = new URLSearchParams(search).get('slug') ?? undefined;

  const [state, dispatch] = useReducer(buildReducer, undefined, () => createEmptyState());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [referral, setReferral] = useState('');
  /*
   * Kept as the typed text rather than as a number.
   *
   * A number input's value is a string anyway, and holding it as one is what
   * lets an emptied box mean "no price" instead of collapsing to `0` under the
   * cursor while somebody is retyping it.
   */
  const [price, setPrice] = useState('');
  /*
   * The tier this guide is for, and the room within it.
   *
   * The tier is the build's own field rather than something read off the map:
   * several tiers have two rooms, and advice that holds for both should not
   * have to pick one. So the tier is required to publish and the map is
   * optional — and when a map *is* chosen it has to be one of that tier's,
   * which is why changing the tier clears it.
   */
  const [tier, setTier] = useState<TierKey | undefined>(undefined);
  /**
   * The ability the guide is about, as a slot key. `''` is "not chosen".
   *
   * Stored on the build rather than in the payload: the codec is a loadout and
   * this is an opinion about one, and adding a field to the codec would be a
   * version bump every old link had to survive for the sake of a browse row.
   */
  const [mainSpell, setMainSpell] = useState<MainSpellKey | ''>('');
  /*
   * The pasted link, exactly as typed.
   *
   * Not parsed here. The server reduces it to an id and an offset, and the
   * field's job is to hold what somebody pasted until they save — a box that
   * rewrote a URL under the cursor while it was half-typed would be worse than
   * one that waits.
   */
  const [video, setVideo] = useState('');
  /*
   * Per-field complaints the *server* made, keyed by field name.
   *
   * The API answers a validation failure with `fields`, and until now those
   * were flattened into "could not save" at the bottom of the page. A bad
   * YouTube link is the first field whose rule is too involved to restate in
   * the browser, so it is the first one that needs the server's own sentence
   * shown where the mistake is.
   */
  /**
   * What the author wants out of each piece of gear.
   *
   * Held beside the loadout rather than inside it, because it is not part of
   * one: the codec carries a board, and this is advice about the *copies* of
   * the items on it — which stat should be fixed, which roll is worth stopping
   * at, how far to reforge. It saves with the build and does not travel in a
   * shared link, exactly as the notes do.
   */
  const [priority, setPriority] = useState<BuildPriority>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const videoError = fieldErrors['video'];
  const [picking, setPicking] = useState<Picking>({ kind: 'none' });
  const [status, setStatus] = useState<{ tone: 'idle' | 'busy' | 'error' | 'ok'; text?: string }>({ tone: 'idle' });
  /**
   * Whether the build being edited is already public.
   *
   * What the second button is *for*: on a draft it publishes, on a published
   * build it takes it back down. A new board is a draft until somebody says
   * otherwise, so this starts false.
   */
  const [published, setPublished] = useState(false);
  const [loadedSlug, setLoadedSlug] = useState<string | undefined>(undefined);

  /*
   * Hydration, in one of two ways and never both.
   *
   * With a slug, the build comes from the API — that is the author's own copy,
   * including its title and notes. Without one, the fragment is the only source
   * there is, which is what an anonymous share link is.
   */
  useEffect(() => {
    if (tables === null) return;

    if (slug !== undefined) {
      if (loadedSlug === slug) return;
      const controller = new AbortController();
      getBuild(slug, controller.signal)
        .then((detail) => {
          const decoded = decodeBuild(detail.payload, tables.items, tables.heroes);
          if (decoded.ok) dispatch({ type: 'hydrate', state: decoded.state });
          setTitle(detail.title);
          setBody(detail.body);
          setReferral(detail.referral);
          // `0` is "not given", so the box opens empty rather than showing a
          // zero the author would have to delete before typing.
          setPrice(detail.price > 0 ? String(detail.price) : '');
          setTier(detail.tier ?? undefined);
          setMainSpell(detail.mainSpell ?? '');
          // Rebuilt from the stored id: the URL the author originally pasted
          // was never kept, and this is the canonical form of the same link.
          setVideo(
            // The id alone. The offset the build may already have is left on
            // the row — see the note in `BuildsService.update`.
            detail.video?.id ?? '',
          );
          setPriority(detail.priority);
          setPublished(detail.status === 'published');
          setLoadedSlug(slug);
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus({ tone: 'error', text: strings.build.missing });
        });
      return () => controller.abort();
    }

    const fragment = window.location.hash.replace(/^#/, '').replace(/^b=/, '');
    if (fragment === '') return;
    const decoded = decodeBuild(fragment, tables.items, tables.heroes);
    if (decoded.ok) {
      dispatch({ type: 'hydrate', state: decoded.state });
      if (decoded.state.title !== null) setTitle(decoded.state.title);
    }
    // Deliberately runs once per (slug, tables): re-reading the fragment on
    // every keystroke would fight the editor for control of the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tables]);

  const payload = useMemo(
    () => (tables === null ? '' : encodeBuild({ ...state, title: title.trim() === '' ? null : title.trim() }, tables.items, tables.heroes)),
    [state, title, tables],
  );

  /*
   * The price, as a number and as the two ways it will be read back.
   *
   * `0` is what an empty box sends, which is the same thing the column means by
   * it — so "cleared the field" and "never filled it in" cannot become two
   * states. The cap is checked here as well as on the server so a nine-digit
   * typo is caught under the field rather than by a failed save.
   */
  /**
   * The categories that have a room behind them — the same list the filter
   * offers, so a build cannot be filed under a tier nobody can filter for.
   */
  const tiers = useMemo(() => listedTiers(core?.maps.maps ?? []), [core]);

  const priceValue = price === '' ? 0 : Number(price);
  const priceError = priceValue > MAX_PRICE ? strings.editor.priceTooBig : fieldErrors['price'];
  const tierError = fieldErrors['tier'];
  const priceHint =
    priceValue > 0
      ? `${formatPriceExact(priceValue)} ${strings.build.gold} · ${formatPrice(priceValue)}`
      : strings.editor.priceHint;

  /*
   * The fragment follows the loadout, so the URL is always shareable and a
   * reload never loses work. `replaceState` rather than push, or every click on
   * a slot would be a back-button step.
   *
   * **It must not run before the incoming fragment has been read.** Hydration
   * waits for the id tables to arrive over the network; this does not, so on a
   * cold load of a shared `#b=` link it fired first with an empty board and
   * replaced the URL with a bare `/edit` — erasing the very payload the page
   * was opened to show. Both guards below are that bug: nothing is written
   * while the tables are missing, and an empty board never overwrites a
   * fragment that still carries one.
   */
  useEffect(() => {
    if (tables === null) return;
    if (payload === '' && carriesBuildPayload(window.location.hash)) return;

    const base = editPath(slug);
    /*
     * `withLang`, because this writes the address bar directly rather than
     * going through `navigateTo` — and a rewrite that dropped `?lang=` put the
     * site back into English the moment somebody touched a slot.
     */
    const next = withLang(payload === '' ? base : `${base}#b=${payload}`);
    window.history.replaceState(null, '', next);
  }, [payload, slug, tables]);

  /** The key the spell picker is filling, and what it already holds. */
  const pickingKey = picking.kind === 'spell' ? (ABILITY_SLOTS[picking.index] ?? null) : null;
  const currentSpellId = useMemo(() => {
    if (picking.kind !== 'spell') return null;
    const value = state.spells[picking.index];
    return value?.k === 'id' ? value.id : null;
  }, [picking, state.spells]);

  /** What the slot being edited already holds, so the picker opens on it. */
  const currentItemId = useMemo(() => {
    if (picking.kind !== 'item') return null;
    const value = state.slots[picking.slot];
    return value?.k === 'id' ? value.id : null;
  }, [picking, state.slots]);

  const hero = state.hero !== null ? core?.heroes.byHero.get(state.hero) : undefined;

  const spellChoices = useMemo(() => {
    if (picking.kind !== 'spell' || hero === undefined || core === null) return [];
    const key = ABILITY_SLOTS[picking.index];
    if (key === undefined) return [];
    return (hero.bySlot[key] ?? []).flatMap((id) => {
      const spell = core.heroes.spells.get(id);
      return spell === undefined ? [] : [spell];
    });
  }, [picking, hero, core]);

  const save = useCallback(
    async (status: 'draft' | 'published') => {
      if (title.trim() === '') {
        setStatus({ tone: 'error', text: strings.editor.needTitle });
        return;
      }
      if (status === 'published' && state.slots.every((s) => s === null)) {
        setStatus({ tone: 'error', text: strings.editor.needItems });
        return;
      }
      if (priceValue > MAX_PRICE) {
        setStatus({ tone: 'error', text: strings.editor.priceTooBig });
        return;
      }
      /*
       * Only a *published* build needs these. A draft is somebody's working
       * copy and may be as unfinished as they like, which is also why Save
       * stays available beside Publish the whole time.
       */
      if (status === 'published') {
        if (tier === undefined) {
          setStatus({ tone: 'error', text: strings.editor.tierRequired });
          return;
        }
        if (priceValue <= 0) {
          setStatus({ tone: 'error', text: strings.editor.priceRequired });
          return;
        }
      }

      setStatus({ tone: 'busy', text: strings.editor.saving });
      setFieldErrors({});
      try {
        const body_ = {
          title: title.trim(),
          body,
          payload,
          referral,
          price: priceValue,
          ...(tier !== undefined ? { tier } : {}),
          // `null` clears it back to the kit order, which is what the empty
          // option means — so it is sent rather than omitted.
          mainSpell: mainSpell === '' ? null : mainSpell,
          // Only the cards that say something, about slots that still hold
          // something — see `forSaving`. An author who swaps an item and saves
          // is the case this exists for.
          priority: forSaving(priority, prioritySlots(state)),
          video,
          status,
        } as const;
        const saved = slug === undefined ? await createBuild(body_) : await updateBuild(slug, body_);
        refreshMe();
        setStatus({ tone: 'ok', text: strings.editor.saved });
        toBuild(saved.slug);
      } catch (error) {
        if (error instanceof ApiFailure && error.fields !== undefined) setFieldErrors(error.fields);
        const text =
          error instanceof ApiFailure && error.code === 'BUILD_LIMIT_REACHED'
            ? strings.editor.limitReached
            : error instanceof ApiFailure && error.code === 'UNAUTHENTICATED'
              ? strings.auth.required
              : // A field said what was wrong with it; the banner should not
                // also claim the whole request failed for unknown reasons.
                error instanceof ApiFailure && error.fields !== undefined
                ? error.message
                : strings.browse.failed;
        setStatus({ tone: 'error', text });
      }
    },
    [title, body, payload, referral, priceValue, tier, mainSpell, priority, video, slug, state, strings, refreshMe],
  );

  /*
   * Deleting, from the one screen that shows what would be lost.
   *
   * It used to be a small red button in a row of five on the My Creations list,
   * one badly-aimed click away from the Edit button beside it. Here it is on
   * the build itself, and it leaves for the list rather than for the build's
   * own page — which is about to be a 410.
   */
  const remove = useCallback(() => {
    if (slug === undefined) return;
    if (!window.confirm(strings.mine.removeConfirm)) return;

    setStatus({ tone: 'busy', text: strings.editor.saving });
    void deleteBuild(slug)
      .then(() => {
        refreshMe();
        navigate('mine');
      })
      .catch(() => setStatus({ tone: 'error', text: strings.browse.failed }));
  }, [slug, strings, refreshMe]);

  if (core === null || tables === null) return <Loading label={strings.common.loading} />;

  const slots = (group: SlotGroup) =>
    Array.from({ length: group.count }, (_, i) => {
      const index = group.start + i;
      const value = state.slots[index] ?? null;
      // The picker keeps its own search across openings — filling six slots is
      // usually six variations on one query.
      const open = () => setPicking({ kind: 'item', slot: index });
      if (value === null) return <BlankTile key={index} onClick={open} label={strings.editor.pickItem} />;
      if (value.k === 'unknown') return <BlankTile key={index} unknown onClick={open} label={strings.editor.pickItem} />;
      const item = core.byId.get(value.id);
      return item === undefined ? (
        <BlankTile key={index} unknown onClick={open} label={strings.editor.pickItem} />
      ) : (
        <ItemTile key={index} item={item} onClick={open} />
      );
    });

  const spells = spellsInDisplayOrder(state.spells, core);
  /*
   * The slots that actually hold something, named.
   *
   * An unknown index has no name to offer, so it is left out: a build can still
   * name it as its headline through the API, but there is nothing to put in an
   * option's label here.
   */
  const mainKey = mainSpellKey(state.spells, core, mainSpell === '' ? null : mainSpell);
  const filledSpells = spells
    .filter((entry): entry is typeof entry & { spell: NonNullable<typeof entry.spell> } => entry.spell !== null)
    .map((entry) => ({ key: entry.key as MainSpellKey, name: entry.spell.name }));
  const gearGroups = groupsInPanel('gear').filter((g) => g.hidden !== true);

  /*
   * Neutral or backpack. Read twice — once as the caption and once as its
   * `title`, which is what keeps the full word reachable when the caption is
   * too wide for the slot and gets clipped.
   */
  const carryLabel = (key: string) => (key === 'neutral' ? strings.build.neutral : strings.build.backpack);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.heading}>{slug === undefined ? strings.editor.newBuild : strings.editor.heading}</h1>
        <div className={styles.actions}>
          <span className={status.tone === 'error' ? styles.statusError : status.tone === 'ok' ? styles.statusOk : styles.status}>
            {status.text}
          </span>
          {/*
            The reader's link, not this one.
            
            What goes on the clipboard is `/view#b=…`: the same loadout with the
            controls taken away. Handing somebody `/edit` handed them a screen
            of buttons for a build they had not made — and it needs no account
            at either end, which is why this button is outside the block below.
          */}
          <Button
            onClick={() => {
              // The price and the code travel with it — see `viewPath`. The
              // notes and the video do not, which the fields below say.
              const url = viewPath(payload, {
                price: priceValue,
                referral: normalizeReferral(referral),
                ...(tier !== undefined ? { tier } : {}),
                ...(mainSpell !== '' ? { mainSpell } : {}),
                ...(video !== '' ? { video } : {}),
              });
              // In the language it was built in, like every other link on the
              // site — the reader can still switch, and arriving in a language
              // nobody chose is the worse default of the two.
              void navigator.clipboard?.writeText(new URL(withLang(url), window.location.origin).href);
              setStatus({ tone: 'ok', text: strings.build.copied });
            }}
            disabled={payload === ''}
            title={strings.editor.shareHint}
          >
            {strings.editor.shareAnonymously}
          </Button>
          {/*
            Nothing at all while signed out. Sharing needs no account and the
            button above already works; a line saying "sign in to do that"
            beside a control that just did it reads as a refusal of the thing
            that happened. The way in is the button in the top bar.
          */}
          {me == null ? null : (
            <>
              {/*
                Save keeps the build where it already is. It used to save as a
                draft whatever the build was, which meant the safe-looking
                button on a published guide quietly took it off the site.
              */}
              <Button
                onClick={() => void save(published ? 'published' : 'draft')}
                disabled={status.tone === 'busy'}
              >
                {strings.editor.save}
              </Button>
              {/*
                One button for the state it is not in. "Publish" next to an
                already-published build is an action with nothing to do, and
                the way back down had no control at all — so this is the toggle:
                Publish while it is a draft, Make draft once it is public.
              */}
              <Button
                variant={published ? 'solid' : 'primary'}
                onClick={() => void save(published ? 'draft' : 'published')}
                disabled={status.tone === 'busy'}
                title={published ? strings.editor.makeDraftHint : undefined}
              >
                {published ? strings.editor.makeDraft : strings.editor.publish}
              </Button>
              {/* Only for a build that exists. On a new one there is nothing
                  to delete, and a disabled red button would still read as a
                  threat. Set apart from Save and Publish by its colour and by
                  being last, because it is the one action here that cannot be
                  undone. */}
              {slug !== undefined && (
                <Button
                  variant="danger"
                  onClick={remove}
                  disabled={status.tone === 'busy'}
                  title={strings.mine.remove}
                >
                  <Icon.Trash size={14} />
                  {strings.mine.remove}
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      <div className={styles.grid}>
        {/*
          Two columns: what the character carries on the left — consumables,
          gear, runes — and what the guide says about it on the right, with the
          spells inside the form under the hero that has them. Every tile is the
          same tile the build page draws; the only difference is that these are
          buttons.
        */}
        <div className={cx(styles.column, styles.loadout)}>
          <Panel title={strings.build.consumables}>
            <div className={styles.consumables}>{groupsInPanel('consumable').flatMap((group) => slots(group))}</div>
          </Panel>

          <Panel title={strings.build.gear}>
            <div className={styles.gearRow}>
              {/*
                Labelled like the two beside it, as on the build page. The worn
                six were the only unnamed block here, which read as though
                Neutral and Backpack were annotations on *them* rather than
                slots of their own.
              */}
              <div>
                <span className={styles.slotLabel}>{strings.build.main}</span>
                <div className={styles.gear}>{gearGroups.flatMap((group) => slots(group))}</div>
              </div>
              <div className={styles.carry}>
                {groupsInPanel('carry')
                  .filter((g) => g.hidden !== true)
                  .map((group) => (
                    <div key={group.key} className={styles.carrySlot}>
                      <span className={styles.slotLabel} title={carryLabel(group.key)}>
                        {carryLabel(group.key)}
                      </span>
                      {slots(group)}
                    </div>
                  ))}
              </div>
            </div>
          </Panel>

          {/*
            Runes under the gear, because they are worn rather than cast: the
            left column is everything the character carries, and the right one
            is what the guide says about it.
          */}
          <Panel title={strings.build.runes}>
            <div className={styles.strip}>{groupsInPanel('rune').flatMap((group) => slots(group))}</div>
          </Panel>
        </div>

        <div className={styles.column}>
          <Panel title={strings.editor.heading}>
            <div className={styles.fields}>
              {/*
                Said once, at the head of the form, rather than twice under the
                two fields it applies to. It is not a refusal — the board, the
                price and the code all work signed out, and the link above
                shares them — so it is a line of prose rather than a warning.
              */}
              {me == null && <p className={styles.signedOut}>{strings.editor.signedOutNotice}</p>}
              <Field label={strings.editor.title} hint={strings.editor.titleHint} value={title} max={MAX_TITLE_API}>
                {({ id }) => (
                  <Input id={id} value={title} maxLength={MAX_TITLE_API} onChange={(e) => setTitle(e.target.value)} />
                )}
              </Field>

              {/*
                The roster inline, exactly the control the browse filter uses.
                It was a modal, which made choosing a hero — the first decision
                a build makes, and the one that governs which spells exist —
                the only thing on this page you could not see the state of
                without opening something.
              */}
              <Fieldset
                label={strings.editor.hero}
                {...(hero !== undefined ? { hint: strings.editor.changeHeroWarning } : {})}
              >
                <HeroChoices
                  value={state.hero ?? undefined}
                  onPick={(id) => {
                    const choice = id === undefined ? undefined : core.heroes.byHero.get(id);
                    if (choice === undefined) return;
                    dispatch({ type: 'setHero', hero: choice.id, defaults: spellDefaults(choice) });
                  }}
                />
              </Fieldset>

              {/*
                The kit, immediately under the hero it belongs to.
                
                Nothing here exists until a hero does — the seven keys are that
                hero's — so this appears with the choice that creates it, the
                same way the room list appears with the tier. It used to be a
                panel of its own below the whole form, which put six fields
                between picking a hero and seeing what picking it had done.
              */}
              {hero !== undefined && (
                <Fieldset label={strings.build.spells}>
                  <div className={styles.strip}>
                    {spells.map(({ key, spell, unknown }, i) => {
                      const index = ABILITY_SLOTS.indexOf(key as (typeof ABILITY_SLOTS)[number]);
                      const open = () => setPicking({ kind: 'spell', index });
                      /*
                       * Which one the build currently leads with — the answer
                       * the select below is about, drawn on the tiles above it.
                       * "Automatic" is not "none": it means the kit order picks
                       * one, and this is that one.
                       */
                      const main = mainKey === key;
                      return (
                        <div
                          key={key ?? i}
                          className={cx(styles.spellCell, main && styles.spellCellMain)}
                          title={main ? strings.build.mainSpell : undefined}
                        >
                          {spell !== null ? (
                            <SpellTile spell={spell} onClick={open} />
                          ) : (
                            <BlankTile round unknown={unknown} onClick={open} label={strings.editor.pickSpell} />
                          )}
                          <span className={cx(styles.spellKey, main && styles.spellKeyMain)}>{key}</span>
                        </div>
                      );
                    })}
                  </div>
                </Fieldset>
              )}

              {/*
                Which of those seven the guide is about.
                
                Under the spells because it is a question about them, and a
                `<select>` rather than a second row of tiles: the tiles are
                above, and picking one of seven named things is what a select
                is for. Only filled slots are offered — the server refuses a
                headline the build does not have.
              */}
              {hero !== undefined && filledSpells.length > 0 && (
                <Field label={strings.build.mainSpell} hint={strings.build.mainSpellHint}>
                  {({ id }) => (
                    <Select
                      id={id}
                      value={mainSpell}
                      onChange={(event) => setMainSpell(event.target.value as MainSpellKey | '')}
                    >
                      <option value="">{strings.build.mainSpellAuto}</option>
                      {filledSpells.map(({ key, name }) => (
                        <option key={key} value={key}>
                          {key.toUpperCase()} — {name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}

              {/*
                Tier first, then the room inside it. That is the order the
                decision is made in — a guide is for a difficulty, and a room is
                a detail of which of that tier's rooms you had in mind.
              */}
              <Fieldset label={strings.editor.tier} hint={tierError ?? strings.editor.tierHint}>
                <div className={styles.tiers}>
                  {tiers.map((option) => {
                    const on = tier === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        className={cx(styles.tier, on && styles.tierOn)}
                        aria-pressed={on}
                        onClick={() => {
                          setTier(option);
                          /*
                           * Rooms that belonged to the old tier go with it.
                           * Keeping one would be a pair the server refuses on
                           * save, reported far from the click that caused it —
                           * and the map list below is about to stop offering
                           * it anyway.
                           */
                          const kept = state.maps.filter((id) => {
                            const map = core.maps.byId.get(id);
                            return map !== undefined && categoryOfMap(map) === option;
                          });
                          if (kept.length !== state.maps.length) dispatch({ type: 'setMaps', maps: kept });
                        }}
                      >
                        {/* The same chips as the browse filter, wording
                            included — Event is a word there and here. */}
                        {tierLabel(option, strings.build.event)}
                      </button>
                    );
                  })}
                </div>
              </Fieldset>

              {/*
                The same control the browse filter uses, narrowed to the chosen
                tier. It was a `<select>` of names, which made picking a room
                here and recognising one in the filter two different acts — and
                only one of them showed you the place.
              */}
              {tier !== undefined && (
                <Fieldset label={strings.editor.map} hint={strings.editor.mapHint}>
                  <MapChoices
                    selected={state.maps}
                    tier={tier}
                    label={strings.editor.map}
                    onToggle={(id) => dispatch({ type: 'toggleMap', map: id })}
                  />
                </Fieldset>
              )}

              {/*
                Left out signed out rather than shown shut.

                Notes ride on a saved build and nowhere else, so without an
                account the box has nowhere to put what you type. A disabled
                field still reads as part of the form and still takes up the
                room; the notice at the head of the form says where it went.
              */}
              {me != null && (
                <>
                  <Field label={strings.editor.notes} hint={strings.editor.notesHint} value={body} max={MAX_BODY}>
                    {({ id }) => (
                      <Textarea id={id} value={body} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} />
                    )}
                  </Field>
                  {/* The board travels in a link; the writing about it does not. */}
                  <p className={styles.disclaimer}>{strings.editor.notShared}</p>
                </>
              )}

              <Field label={strings.editor.referral} hint={strings.editor.referralHint} value={referral} max={MAX_REFERRAL}>
                {({ id }) => (
                  <Input id={id} value={referral} maxLength={MAX_REFERRAL} onChange={(e) => setReferral(e.target.value)} />
                )}
              </Field>

              {/*
                `inputMode="numeric"` on a text input rather than `type="number"`:
                a number input brings spinner arrows nobody wants on a nine-digit
                figure, and scroll-wheel edits that change a price while you are
                scrolling past it. The digits are filtered on the way in instead.
              */}
              <Field
                label={strings.editor.price}
                hint={priceHint}
                {...(priceError !== undefined ? { error: priceError } : {})}
              >
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    autoComplete="off"
                    invalid={invalid}
                    value={price}
                    placeholder={strings.build.noPrice}
                    // Digits only, filtered on the way in rather than validated
                    // on the way out: a price has no separator, no sign and no
                    // decimal point, so there is nothing to let through.
                    onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, '').slice(0, 13))}
                  />
                )}
              </Field>

              {/*
                Under the field rather than in its hint, which is already busy
                saying what the number reads as. This is about what the number
                *means*: a price in this game is quoted for the opening of a
                season and drifts down once a league is busy, so nobody should
                take the figure as one they will pay.
              */}
              <p className={styles.disclaimer}>{strings.editor.priceDisclaimer}</p>

              {/*
                The id, with the address around it drawn rather than typed.
                
                It was a box for a whole URL, which is a box people paste a
                playlist and three tracking parameters into — and a link does
                not fit in a share URL's query, where eleven characters of
                base64url do. The prefix is a label so the field is still
                obviously a YouTube link; the server accepts a bare id and
                every URL shape besides, so anything pasted here still works
                once the address is trimmed off it.
              */}
              <Field label={strings.editor.video} hint={strings.editor.videoHint} {...(videoError !== undefined ? { error: videoError } : {})}>
                {({ id, invalid }) => (
                  <div className={styles.videoField}>
                    <span className={styles.videoPrefix}>youtu.be/</span>
                    <Input
                      id={id}
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      invalid={invalid}
                      value={video}
                      maxLength={MAX_VIDEO_ID}
                      placeholder="dQw4w9WgXcQ"
                      // The id's own alphabet, filtered on the way in: a
                      // pasted address leaves its tail behind rather than
                      // being refused on save.
                      onChange={(e) => {
                        setVideo(idOf(e.target.value));
                        if (videoError !== undefined) setFieldErrors(({ video: _, ...rest }) => rest);
                      }}
                    />
                  </div>
                )}
              </Field>
            </div>
          </Panel>

          {/*
            Under the form rather than inside it.

            The fields above are about the guide — its title, its tier, what it
            costs. This is about the six items on the board beside it, one card
            each, and it is the only part of the editor whose shape is decided
            by the loadout rather than by the form. It saves with the build and
            travels in no link, which is what the notice under the notes says —
            so, like the notes, it is absent signed out rather than shown with
            its controls dead.
          */}
          {me != null && <PriorityPanel slots={prioritySlots(state)} value={priority} onChange={setPriority} />}
        </div>
      </div>

      <ItemPicker
        open={picking.kind === 'item'}
        accepts={picking.kind === 'item' ? slotAcceptsAt(picking.slot) : 0}
        currentId={picking.kind === 'item' ? currentItemId : null}
        onSelect={(item) => {
          if (picking.kind !== 'item') return;
          dispatch({ type: 'setSlot', slot: picking.slot, value: { k: 'id', id: item.id } });
          setPicking({ kind: 'none' });
        }}
        onClear={() => {
          if (picking.kind !== 'item') return;
          dispatch({ type: 'clearSlot', slot: picking.slot });
          setPicking({ kind: 'none' });
        }}
        onClose={() => setPicking({ kind: 'none' })}
      />

      <SpellPicker
        open={picking.kind === 'spell'}
        slot={pickingKey}
        candidates={spellChoices}
        currentId={currentSpellId}
        canClear={picking.kind === 'spell' && state.spells[picking.index] != null}
        heroName={hero?.names[lang] ?? ''}
        onSelect={(id) => {
          if (picking.kind !== 'spell') return;
          dispatch({ type: 'setSpell', spell: picking.index, value: { k: 'id', id } });
          setPicking({ kind: 'none' });
        }}
        onClear={() => {
          if (picking.kind !== 'spell') return;
          dispatch({ type: 'clearSpell', spell: picking.index });
          setPicking({ kind: 'none' });
        }}
        onClose={() => setPicking({ kind: 'none' })}
      />

    </div>
  );
}

/** Keeps the reducer's type visible to readers of this file. */
export type { BuildState };
