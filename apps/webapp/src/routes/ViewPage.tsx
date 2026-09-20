import { useCallback, useMemo, useState } from 'react';
import { MAX_PRICE } from 'aow5-api-contract';
import { decodeBuild, groupsInPanel, visibleGroups, type SlotGroup } from 'aow5-shared/codec';
import { categoryOfMap, goldIconUrl, heroIconUrl, isTierKey, tierLabel } from 'aow5-shared/data';
import { ABILITY_SLOTS } from 'aow5-shared/types';
import { Badge, Button, Icon, Loading, Notice, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { BlankTile, ItemTile, SpellTile } from '@/components/Tile';
import { VideoPanel } from '@/components/VideoPanel';
import { mainSpellKey, spellsInDisplayOrder } from '@/lib/preview';
import { formatPrice } from '@/lib/price';
import { normalizeReferral } from '@/lib/referral';
import { openInEditor, useHash, useSearch } from '@/router';
import styles from './ViewPage.module.css';

/**
 * A loadout somebody shared as a link, read rather than edited.
 *
 * **The reader's half of `#b=`.** A board in a URL used to have exactly one
 * shape — `/edit#b=…` — so handing somebody your build handed them your editor:
 * a screen of controls for a thing they had not made, with Save and Publish on
 * it and every tile a button. This is the same fragment with the controls taken
 * away, plus the one thing a reader might want next.
 *
 * Nothing here is fetched. The payload is the page: no author, no likes and no
 * comments, because there is no record to hang them on — which is also why the
 * codec line is worth drawing. It is the only place the site says what a link
 * actually contains.
 */
export function ViewPage() {
  const { strings, core, tables } = useApp();
  const hash = useHash();
  const search = useSearch();
  const [copied, setCopied] = useState(false);

  /*
   * What the link says *about* the board, as opposed to what is in it.
   *
   * Everything here arrives from a URL a stranger may have typed, so each one
   * is checked rather than trusted: a price that is not a whole number of gold
   * inside the cap is no price, a tier that is not one of the ten is no tier,
   * and the code goes through the same normaliser the editor's field uses.
   */
  const extras = useMemo(() => {
    const params = new URLSearchParams(search);

    const rawPrice = Number(params.get('price'));
    const price = Number.isSafeInteger(rawPrice) && rawPrice > 0 && rawPrice <= MAX_PRICE ? rawPrice : 0;

    const rawTier = params.get('tier');
    const tier = rawTier !== null && isTierKey(rawTier) ? rawTier : null;

    const rawSpell = params.get('spell');
    const mainSpell =
      rawSpell !== null && (ABILITY_SLOTS as readonly string[]).includes(rawSpell) ? rawSpell : null;

    // Eleven characters of base64url, or nothing. It goes into an embed URL,
    // so anything else is dropped rather than passed along and hoped about.
    const rawVideo = params.get('video') ?? '';
    const video = /^[A-Za-z0-9_-]{6,15}$/.test(rawVideo) ? rawVideo : null;

    return { price, tier, mainSpell, video, referral: normalizeReferral(params.get('ref') ?? '') };
  }, [search]);

  const copyReferral = useCallback((code: string) => {
    void navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, []);

  const payload = useMemo(() => hash.replace(/^#/, '').replace(/^b=/, '').trim(), [hash]);

  const decoded = useMemo(
    () => (tables === null || payload === '' ? null : decodeBuild(payload, tables.items, tables.heroes)),
    [payload, tables],
  );

  if (payload === '') {
    return (
      <div className={styles.page}>
        <Notice title={strings.view.empty}>{strings.view.emptyHint}</Notice>
      </div>
    );
  }

  if (core === null || tables === null || decoded === null) return <Loading label={strings.common.loading} />;

  if (!decoded.ok) {
    return (
      <div className={styles.page}>
        <Notice tone="warn" title={strings.view.unreadable}>
          {strings.view.unreadableHint}
        </Notice>
      </div>
    );
  }

  const state = decoded.state;
  const hero = state.hero !== null ? core.heroes.byHero.get(state.hero) : undefined;
  const spells = spellsInDisplayOrder(state.spells, core, state.slots);
  const mainKey = mainSpellKey(state.spells, core, extras.mainSpell);
  const itemCount = state.slots.filter((slot) => slot !== null).length;
  // The version the payload declares, which is the part in front of the first
  // dot — the decoded state does not carry it, and does not need to.
  const version = payload.slice(0, Math.max(payload.indexOf('.'), 0));
  const spellCount = state.spells.filter((spell) => spell !== null).length;

  const slots = (group: SlotGroup) =>
    Array.from({ length: group.count }, (_, i) => {
      const index = group.start + i;
      const value = state.slots[index] ?? null;
      if (value === null) return <BlankTile key={index} />;
      if (value.k === 'unknown') return <BlankTile key={index} unknown />;
      const item = core.byId.get(value.id);
      return item === undefined ? <BlankTile key={index} unknown /> : <ItemTile key={index} item={item} />;
    });

  /*
   * The rooms the board itself names — v8 put a list of them in the payload, so
   * a shared link has always carried this much. The tier follows from them
   * where there is one, and from `?tier=` where the guide named no room.
   */
  const title = state.title ?? strings.view.heading;
  const rooms = state.maps
    .map((id) => core.maps.byId.get(id))
    .filter((map): map is NonNullable<typeof map> => map !== undefined);
  const tier = rooms[0] !== undefined ? categoryOfMap(rooms[0]) : extras.tier;

  const gearGroups = groupsInPanel('gear').filter((group) => group.hidden !== true);
  const carryGroups = visibleGroups('carry', state.slots);
  const soulGroups = visibleGroups('soul', state.slots);
  const carryLabel = (key: string) => (key === 'neutral' ? strings.build.neutral : strings.build.backpack);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        {/* The hero at the head, as the build page has it — a shared board is
            still about somebody, even when it is about nobody's account. */}
        {hero !== undefined && (
          <div className={styles.portrait}>
            <img src={heroIconUrl(hero.icon)} alt="" />
          </div>
        )}
        <div className={styles.identity}>
          {/*
            The author's own title when the link carries one — the codec has
            had a title segment since v7, so a board shared out of the editor
            arrives already named. "Shared loadout" is what a board with no
            title is called, not a heading stamped over one that has a name.
          */}
          <h1 className={styles.title} title={state.title ?? undefined}>
            {title}
          </h1>
          {/*
            What the link holds, in the terms the link is written in. This is
            the one screen where the codec is a fact about the thing being
            shown rather than an implementation detail behind it.
          */}
          {/*
            What the link holds, in the terms the link is written in: the rooms
            and the tier out of the payload, the price out of the query, and the
            codec that carried them. This is the one screen where the codec is a
            fact about the thing being shown rather than plumbing behind it.
          */}
          <div className={styles.facts}>
            {tier !== null && tier !== undefined && (
              <Badge tone="tier">{tierLabel(tier, strings.build.event)}</Badge>
            )}
            {rooms.length > 0 && <span>{rooms.map((room) => room.name).join(', ')}</span>}
            {extras.price > 0 && (
              <span className={styles.price} title={`${extras.price} ${strings.build.gold}`}>
                <img className={styles.priceCoin} src={goldIconUrl()} alt="" />
                {formatPrice(extras.price)}
              </span>
            )}
          </div>
          <p className={styles.codec}>
            {strings.view.codec} v{version} · {itemCount} {strings.view.items} · {spellCount} {strings.view.spells}
          </p>
        </div>
        <Button variant="primary" onClick={() => openInEditor(payload)}>
          <Icon.Branch size={14} />
          {strings.build.openInEditor}
        </Button>
      </header>

      {/*
        The sender's code, when they had one — directly under the heading,
        above the paragraph explaining what this page is. It is the one thing
        here somebody might act on, and the sentence below it is the one thing
        they only need to read once.

        It rides in `?ref=` exactly as it does on every other shared link here —
        see `lib/referral.ts` — and is drawn only when the link carried one: a
        shared board is somebody else's, and filling the gap with the site's own
        code would put words in their mouth.
      */}
      {extras.referral !== '' && (
        <div className={styles.referral}>
          <Button
            aria-label={strings.build.copyReferral}
            title={copied ? strings.build.copied : strings.build.copyReferral}
            onClick={() => copyReferral(extras.referral)}
          >
            <span className={styles.referralLabel}>{strings.build.referralPrefix}</span>
            <code className={styles.referralCode}>{extras.referral}</code>
            {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
          </Button>
        </div>
      )}

      <p className={styles.lead}>{strings.view.lead}</p>


      <div className={styles.grid}>
        {/* The build page's own two columns, in its own order: what the
            character carries on the left, what it does on the right. */}
        <div className={styles.column}>
          <Panel title={strings.build.consumables}>
            <div className={styles.consumables}>{groupsInPanel('consumable').flatMap((group) => slots(group))}</div>
          </Panel>

          <Panel title={strings.build.gear}>
            <div className={styles.gearRow}>
              <div>
                <span className={styles.slotLabel}>{strings.build.main}</span>
                <div className={styles.gear}>{gearGroups.flatMap((group) => slots(group))}</div>
              </div>
              <div className={styles.carry}>
                {carryGroups.map((group) => (
                  <div key={group.key} className={styles.carrySlot}>
                    <span className={styles.slotLabel} title={carryLabel(group.key)}>
                      {carryLabel(group.key)}
                    </span>
                    {slots(group)}
                  </div>
                ))}
              </div>
              {soulGroups.length > 0 && (
                /*
                  The Life Soul. A `#b=` link carries no season, so
                  `visibleGroups` is given none and draws this only when the
                  loadout actually holds one — the same rule that keeps a hidden
                  slot visible rather than letting a link's contents vanish.
                */
                <div className={styles.soul}>
                  {soulGroups.map((group) => (
                    <div key={group.key} className={styles.carrySlot}>
                      <span className={styles.slotLabel} title={strings.build.soul}>
                        {strings.build.soul}
                      </span>
                      {slots(group)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>

          <Panel title={strings.build.runes}>
            <div className={styles.strip}>{groupsInPanel('rune').flatMap((group) => slots(group))}</div>
          </Panel>
        </div>

        <div className={styles.column}>
          <Panel title={strings.build.spells}>
            <div className={styles.strip}>
              {spells.map(({ key, spell, unknown, soul }) => {
                // Marked exactly as the build page marks it: the sender's
                // choice out of `?spell=` when the link carried one, and the
                // kit order when it did not — a board always leads with
                // something, so something is always ringed.
                const main = mainKey === key;
                return (
                  <div
                    key={key}
                    className={cx(styles.spellCell, main && styles.spellCellMain)}
                    title={main ? strings.build.mainSpell : undefined}
                  >
                    {/* A worn Life Soul is what `f` does — see `equippedSoul`. */}
                    {soul !== null ? (
                      <ItemTile item={soul} round />
                    ) : spell !== null ? (
                      <SpellTile spell={spell} />
                    ) : (
                      <BlankTile round unknown={unknown} />
                    )}
                    <span className={cx(styles.spellKey, main && styles.spellKeyMain)}>{key}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/*
            The walkthrough, under the kit it walks through. `start` is zero
            because a share URL names the video and nothing about where to
            begin — the editor's field is an id now, and a build that wants an
            offset has one on its saved row.
          */}
          {extras.video !== null && <VideoPanel video={{ id: extras.video, start: 0 }} title={title} />}
        </div>
      </div>
    </div>
  );
}
