import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuildDetail } from 'aow5-api-contract';
import { ApiFailure } from '@/lib/api';
import { decodeBuild } from 'aow5-shared/codec';
import { BUILD_VERSION_PARAM, buildShareUrl } from '@/lib/links';
import { groupsInPanel, type SlotGroup } from 'aow5-shared/codec';
import { goldIconUrl, heroIconUrl } from 'aow5-shared/data';
import { Avatar, Badge, Button, Icon, Loading, Notice, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { getBuild, setLike } from '@/builds/api';
import { BlankTile, ItemTile, SpellTile } from '@/components/Tile';
import { AuthorName } from '@/components/AuthorName';
import { Comments } from '@/components/Comments';
import { PriorityPanel } from '@/components/PriorityPanel';
import { VideoPanel } from '@/components/VideoPanel';
import { mainSpellKey, spellsInDisplayOrder } from '@/lib/preview';
import { factsOfBuild, useDocumentMeta } from '@/lib/meta';
import { prioritySlots } from '@/lib/priority';
import { formatDay, wasRevised } from '@/lib/dates';
import { formatPrice, formatPriceExact } from '@/lib/price';
import { referralOnBuild } from '@/lib/referral';
import { Link, openInEditor, pathOf } from '@/router';
import styles from './BuildPage.module.css';

/**
 * One build: who made it, what it costs, and what is in it.
 *
 * The back link stays even though the top bar is above it now. They answer
 * different questions — the bar is "where else is there", the link is "back to
 * the list I came from", and somebody who arrived on a shared link is served by
 * exactly one of those.
 */
export function BuildPage({ slug }: { slug: string }) {
  const { strings, core, tables, me, lang } = useApp();
  const [build, setBuild] = useState<BuildDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'gone' | 'failed'>('loading');
  /** Which of the two copy buttons was just pressed, if either. */
  const [copied, setCopied] = useState<'link' | 'referral' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setBuild(null);
    getBuild(slug, controller.signal)
      .then((detail) => {
        setBuild(detail);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // 410 is a build its author deleted, and it deserves a different
        // sentence from "no such build" — a shared link that used to work is
        // not the same as one that never did.
        if (error instanceof ApiFailure && error.code === 'GONE') setStatus('gone');
        else if (error instanceof ApiFailure && error.code === 'NOT_FOUND') setStatus('missing');
        else setStatus('failed');
      });
    return () => controller.abort();
  }, [slug]);

  const decoded = useMemo(() => {
    if (build === null || tables === null) return null;
    const result = decodeBuild(build.payload, tables.items, tables.heroes);
    return result.ok ? result.state : null;
  }, [build, tables]);

  /*
   * The tab, the description and the social tags for this build.
   *
   * Null while the request is in flight, so the tab keeps whatever it said
   * rather than flashing the site name for the length of a round trip. A build
   * that is gone or was never there gets the `missing` shape, which keeps its
   * own URL as the canonical and asks not to be indexed — a shared link to a
   * deleted build should stop being indexed, not start pointing at the front
   * page.
   */
  const meta = useMemo(() => {
    if (status === 'loading') return null;
    if (build === null || core === null) return { kind: 'missing' as const, slug };
    return { kind: 'build' as const, build: factsOfBuild(build, core, decoded, lang) };
  }, [status, build, core, decoded, lang, slug]);
  useDocumentMeta(meta, lang);

  /*
   * The version, into the address bar.
   *
   * So that copying the URL out of the browser — which is what most people do
   * instead of pressing the button below — carries it too. `replaceState`
   * rather than a navigation, for the same reason `setLang` uses it: this is
   * not a different page and Back should not have to step through it. Written
   * directly rather than through the router, which would announce a navigation
   * that has not happened.
   *
   * `?lang=` survives because the whole query is edited rather than replaced.
   */
  useEffect(() => {
    if (build === null) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get(BUILD_VERSION_PARAM) === String(build.updatedAt)) return;
      url.searchParams.set(BUILD_VERSION_PARAM, String(build.updatedAt));
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // An address this browser will not parse is not worth failing a page over.
    }
  }, [build]);

  const copy = useCallback((what: 'link' | 'referral', text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied((prev) => (prev === what ? null : prev)), 1600);
  }, []);

  const toggleLike = useCallback(() => {
    if (build === null || me == null) return;
    const next = !build.liked;
    // Optimistic, and reverted on failure. A like is one row and the request
    // almost always succeeds; making somebody wait for a round trip to see a
    // button they pressed change is worse than the rare correction.
    setBuild((prev) => (prev === null ? prev : { ...prev, liked: next, likeCount: prev.likeCount + (next ? 1 : -1) }));
    setLike(build.slug, next)
      .then((response) =>
        setBuild((prev) => (prev === null ? prev : { ...prev, liked: response.liked, likeCount: response.likeCount })),
      )
      .catch(() =>
        setBuild((prev) =>
          prev === null ? prev : { ...prev, liked: !next, likeCount: prev.likeCount + (next ? -1 : 1) },
        ),
      );
  }, [build, me]);

  if (status === 'loading' || core === null) return <Loading label={strings.common.loading} />;
  if (status === 'gone') return <Notice title={strings.build.deleted}>{strings.build.deletedHint}</Notice>;
  if (status === 'missing' || status === 'failed' || build === null) {
    return (
      <Notice tone="error" title={strings.build.missing}>
        {strings.build.missingHint}
      </Notice>
    );
  }

  const hero = build.heroId !== null ? core.heroes.byHero.get(build.heroId) : undefined;
  const heroName = hero?.names[lang] ?? strings.build.noHero;
  const rooms = build.maps
    .map((id) => core.maps.byId.get(id)?.name)
    .filter((name): name is string => name !== undefined);
  const spells = decoded !== null ? spellsInDisplayOrder(decoded.spells, core) : [];
  const mainKey = decoded !== null ? mainSpellKey(decoded.spells, core, build.mainSpell) : null;
  const isAuthor = me != null && me.id === build.author.id;
  /*
   * When it appeared, and whether it has been touched since.
   *
   * Two dates rather than one, because they answer different questions: the
   * publication date is what settles which of two similar guides said a thing
   * first, and the edit date is whether the one in front of you has been
   * revised since the patch you are playing. A draft has only ever been
   * touched, so it shows the second alone.
   */
  const publishedOn = formatDay(build.publishedAt, lang);
  const updatedOn = wasRevised(build.publishedAt, build.updatedAt) ? formatDay(build.updatedAt, lang) : null;
  // The author's, or the site's when they gave none — the page always shows one.
  const referral = referralOnBuild(build.referral);

  /** Whether any slot in these groups holds something. An empty block is hidden. */
  const anyFilled = (groups: SlotGroup[]) =>
    groups.some((group) =>
      Array.from({ length: group.count }, (_, i) => decoded?.slots[group.start + i] ?? null).some(
        (value) => value !== null,
      ),
    );

  const slots = (group: SlotGroup) =>
    Array.from({ length: group.count }, (_, i) => {
      const index = group.start + i;
      const value = decoded?.slots[index] ?? null;
      if (value === null) return <BlankTile key={index} />;
      if (value.k === 'unknown') return <BlankTile key={index} unknown />;
      const item = core.byId.get(value.id);
      return item === undefined ? <BlankTile key={index} unknown /> : <ItemTile key={index} item={item} />;
    });

  const gearGroups = groupsInPanel('gear').filter((g) => g.hidden !== true);
  const runeGroups = groupsInPanel('rune');
  const consumableGroups = groupsInPanel('consumable');
  // The pet slot lives here and is still hidden; it keeps its wire position so
  // no existing link shifts.
  const carryGroups = groupsInPanel('carry').filter((g) => g.hidden !== true);

  /*
   * Neutral or backpack. Read twice — once as the caption and once as its
   * `title`, which is what keeps the full word reachable when the caption is
   * too wide for the slot and gets clipped.
   */
  const carryLabel = (key: string) => (key === 'neutral' ? strings.build.neutral : strings.build.backpack);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div className={styles.portrait}>
          {hero !== undefined ? <img src={heroIconUrl(hero.icon)} alt={heroName} /> : null}
        </div>

        <div className={styles.identity}>
          <h1 className={styles.title} title={build.title}>
            {build.title}
          </h1>
          <div className={styles.subtitle}>
            {build.tier !== null && (
              <Badge tone="tier">
                {build.tier === 'event' ? strings.build.event : `${strings.build.tier} ${build.tier}`}
              </Badge>
            )}
            {/* Every room it names, or a word saying it names none. */}
            <span>{rooms.length > 0 ? rooms.join(', ') : strings.build.noMap}</span>
            <span>·</span>
            <span>{heroName}</span>
            {build.price > 0 && (
              <>
                <span>·</span>
                {/*
                  Beside the tier and the room rather than in the action row:
                  the price is a fact about the build, and the row beneath is
                  for things you do to it. The exact figure is on the element
                  itself, because `1.5b` is a summary and somebody deciding
                  whether they can afford it may want the digits.
                */}
                <span
                  className={styles.price}
                  title={`${formatPriceExact(build.price)} ${strings.build.gold}`}
                >
                  <img className={styles.priceCoin} src={goldIconUrl()} alt="" />
                  {formatPrice(build.price)}
                </span>
              </>
            )}
            {build.status === 'draft' && <Badge tone="draft">{strings.build.draft}</Badge>}
            {publishedOn !== null && (
              <>
                <span>·</span>
                <span>{`${strings.build.published} ${publishedOn}`}</span>
              </>
            )}
            {updatedOn !== null && (
              <>
                <span>·</span>
                <span className={styles.revised}>{`${strings.build.updated} ${updatedOn}`}</span>
              </>
            )}
            <span>·</span>
            <span className={styles.author}>
              <Avatar src={build.author.avatar} name={build.author.nickname} size={20} />
              <AuthorName user={build.author} />
            </span>
          </div>

          <div className={styles.actions}>
            <Button
              className={cx(build.liked && styles.likeOn)}
              onClick={toggleLike}
              disabled={me == null || isAuthor}
              title={me == null ? strings.build.signInToLike : isAuthor ? strings.build.selfLike : undefined}
            >
              <Icon.ThumbUp filled={build.liked} size={16} />
              {build.liked ? strings.build.liked : strings.build.like} · {build.likeCount}
            </Button>

            <Button onClick={() => copy('link', buildShareUrl(window.location.href, build.updatedAt))}>
              <Icon.Copy size={16} />
              {copied === 'link' ? strings.build.copied : strings.build.share}
            </Button>

            {/*
              Always a clone: the payload with no slug, so saving it writes a
              new build rather than editing this one. The author's own route
              back into this build is the Edit button beside it, and having one
              button that meant "edit" for the author and "copy" for everybody
              else was two actions wearing one label.
            */}
            <Button onClick={() => openInEditor(build.payload)}>
              <Icon.Branch size={16} />
              {strings.build.openInEditor}
            </Button>

            {build.canEdit && (
              <Link to={{ href: `${pathOf('edit')}?slug=${encodeURIComponent(build.slug)}` }}>
                <Button variant="ghost">
                  <Icon.Pencil size={16} />
                  {strings.mine.edit}
                </Button>
              </Link>
            )}
          </div>

          {/*
            The referral code, on a line of its own under the action row.

            It is not one of the things you do to this build — liking, sharing
            and cloning are — and standing in that row it read as a fourth
            button of the same kind. A line below keeps it on the page, where a
            reader who wants a code will find it, without putting it among the
            three that act on the build.

            Always drawn, because `referralOnBuild` always has one to draw: the
            author's, or the site's when they left the field empty. It used to
            be conditional, and a build saved without a code left the reader
            looking for something that was not on the page.
          */}
          <div className={styles.referral}>
            {/*
              One control, no caption beside it.

              The prefix went inside the button and got quieter: a full
              "Referral code" label outside was a second thing to read at the
              same weight as the three buttons before it, for a field most
              readers glance at rather than act on. Dim and small, `code:` says
              what the string is without competing with it — and the button
              still carries the full wording for a screen reader and on hover.
            */}
            <Button
              aria-label={strings.build.copyReferral}
              title={copied === 'referral' ? strings.build.copied : strings.build.copyReferral}
              onClick={() => copy('referral', referral)}
            >
              <span className={styles.referralLabel}>{strings.build.referralPrefix}</span>
              <code className={styles.referralCode}>{referral}</code>
              {copied === 'referral' ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
            </Button>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        {/*
          Consumables above, then gear with the two carried slots beside it.
          That is the order the game's own panel reads in, and it puts the block
          you change between runs above the one you rarely touch.
        */}
        <div className={cx(styles.column, styles.loadout)}>
          {/*
            Only when there is something in it.

            Gear is the build, so an empty slot there is a fact worth drawing —
            a hole in the six says "nothing here yet". A potion belt nobody
            filled says nothing at all, and three empty squares under a heading
            read as a loading state rather than as a choice.
          */}
          {anyFilled(consumableGroups) && (
            <Panel title={strings.build.consumables}>
              <div className={styles.consumables}>{consumableGroups.flatMap((group) => slots(group))}</div>
            </Panel>
          )}

          <Panel title={strings.build.gear}>
            <div className={styles.gearRow}>
              {/*
                Labelled like the two beside it. The worn six were the only
                unnamed block on the page, which read as though Neutral and
                Backpack were annotations on *them* rather than slots of their
                own.
              */}
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
            </div>
          </Panel>

          {/*
            Runes under the gear, because they are worn rather than cast: this
            column is everything the character carries, and the one beside it is
            what the guide says about it. The editor stacks them the same way,
            so reading a build and editing one are one mental map.
          */}
          <Panel title={strings.build.runes}>
            <div className={styles.strip}>{runeGroups.flatMap((group) => slots(group))}</div>
          </Panel>

          {/*
            Under the gear it explains. A build's video is a walkthrough of the
            loadout above it, so it belongs at the foot of that column rather
            than among the panels on the right, which are the written half.
          */}
          {build.video !== null && <VideoPanel video={build.video} title={build.title} />}
        </div>

        <div className={styles.column}>
          <Panel title={strings.build.spells}>
            <div className={styles.strip}>
              {spells.map(({ key, spell, unknown }) => {
                // The one the build leads with, wherever it appears: the
                // author's choice when they made one, and the kit order when
                // they did not — see `mainSpellKey`. Marked either way, because
                // the browse row is leading with it either way.
                const main = mainKey === key;
                return (
                  <div
                    key={key}
                    className={cx(styles.spellCell, main && styles.spellCellMain)}
                    title={main ? strings.build.mainSpell : undefined}
                  >
                    {spell !== null ? <SpellTile spell={spell} /> : <BlankTile round unknown={unknown} />}
                    <span className={cx(styles.spellKey, main && styles.spellKeyMain)}>{key}</span>
                  </div>
                );
              })}
            </div>
          </Panel>


          {/*
            Between the kit and the notes, which is where it belongs: the spells
            above are what the build casts, this is what its gear has to roll,
            and the notes below are everything neither of them can say. Draws
            nothing at all when the author wrote no per-item advice.
          */}
          {decoded !== null && <PriorityPanel slots={prioritySlots(decoded)} value={build.priority} />}

          {build.body.trim() !== '' && (
            <Panel title={strings.build.notes}>
              <p className={styles.notes}>{build.body}</p>
            </Panel>
          )}

          {/*
            No thread on a draft.
            
            A draft is visible to its author and nobody else, so there is nobody
            to have the conversation with — and the API says as much: commenting
            needs a *published* build, so the panel's own fetch answered 404 and
            drew "could not load the comments" on a page that was working
            perfectly. The thread appears when the build does.
          */}
          {build.status === 'published' && <Comments slug={build.slug} count={build.commentCount} />}
        </div>
      </div>
    </div>
  );
}
