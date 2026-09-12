import { useCallback, useEffect, useState } from 'react';
import type { BuildSummary } from 'aow5-api-contract';
import { Button, Icon, Loading, Notice, Panel, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { myBuilds } from '@/builds/api';
import { BuildRow } from '@/components/BuildRow';
import { BuildRowSkeleton } from '@/components/BuildRowSkeleton';
import { editPath, navigate, navigateTo } from '@/router';
import styles from './MyCreationsPage.module.css';

/**
 * The author's own five.
 *
 * Drafts and published builds together, because the cap counts both — somebody
 * with five drafts has used their five, and a page that showed only the
 * published ones would make that limit look like a bug.
 *
 * **The same page as browse, with a different list in it.** Sidebar on the
 * left, rows on the right, and the rows are literally `BuildRow` — this used to
 * be its own stripe of title-and-buttons, which meant your own build looked
 * like a different object here than it did in the list everybody else reads.
 * What is on the left is what this page has instead of filters: how many slots
 * are gone, and the button that spends the next one.
 *
 * **Every row opens the editor.** On your own list a build is something you are
 * working on, so the reading page is the detour. Deleting lives in the editor
 * for the same reason: it is the screen where you can see what you would be
 * throwing away.
 *
 * **Signed out, this page does not exist.** It used to render a panel inviting
 * you to sign in, which is a page about an empty list of your own builds when
 * you have no account to have builds in. The top bar hides the tab for the same
 * reason; this redirect is what covers a typed URL or an old bookmark.
 */
export function MyCreationsPage() {
  const { strings, me, core } = useApp();
  const [builds, setBuilds] = useState<BuildSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(() => {
    const controller = new AbortController();
    myBuilds(controller.signal)
      .then(setBuilds)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // Nothing to fetch while signed out, and `/me/builds` would 401.
    if (me == null) {
      setBuilds([]);
      return;
    }
    return reload();
  }, [me, reload]);

  /*
   * `replace`, so Back goes wherever they came from rather than bouncing off
   * this route again. In an effect rather than during render because it is a
   * navigation, and `me === undefined` is still "not known yet" — redirecting
   * on that would throw out every visitor while `/me` was in flight.
   */
  useEffect(() => {
    if (me === null) navigate('browse', { replace: true });
  }, [me]);

  if (me == null) return <Loading label={strings.common.loading} />;

  const atLimit = me.buildCount >= me.buildLimit;
  const loading = builds === null || core === null;

  /*
   * How full the slots are, as a colour.
   *
   * Red when there are more builds than slots, which the migration made real:
   * an account with no provider linked has five slots, and several were brought
   * across holding six or eight. Amber from 80% full — 4/5, 8/10 — because that
   * is the point where "make the next one count" starts to matter, and green
   * below it while there is still room. The threshold is a ratio rather than a
   * fixed gap so it means the same thing at every limit, 5 through 15.
   */
  const over = me.buildCount > me.buildLimit;
  const near = !over && me.buildLimit > 0 && me.buildCount / me.buildLimit >= 0.8;
  const tone = over ? styles.over : near ? styles.near : styles.ok;

  /*
   * The hint only helps if linking would actually raise the cap, and it names
   * the door still to open: with Steam already attached it asks for Discord and
   * vice versa, and with neither it offers both. Both attached is the ceiling —
   * no advice to give, so the alert is gone and only the counter's colour
   * remains.
   */
  const hasSteam = me.providers.includes('steam');
  const hasDiscord = me.providers.includes('discord');
  const canLinkMore = !(hasSteam && hasDiscord);
  const showHint = (over || near) && canLinkMore;
  const hintText = hasSteam
    ? strings.mine.slotsHintDiscord
    : hasDiscord
      ? strings.mine.slotsHintSteam
      : strings.mine.slotsHint;

  return (
    <div className={styles.page}>
      {/*
        Where the browse page keeps its filters. There is nothing to filter in a
        list of five, so this holds the count and the one action the page is
        for — and the count rides in the header opposite the title, which is the
        same slot the filter panel puts its own tally in.
      */}
      <Panel
        title={strings.mine.heading}
        action={
          <span className={cx(styles.count, tone)} title={strings.mine.slotsUsed}>
            {me.buildCount}/{me.buildLimit}
          </span>
        }
      >
        {/*
          The alert takes the same tone class as the count above it, so its
          border, tint, text and icon are all one `currentColor` — red when the
          account is over its slots, amber when it is near — matching the number
          in the header. It sits between the heading and the create button
          because that is the path: you read why the cap is what it is, then act.
        */}
        {showHint && (
          <div className={cx(styles.alert, tone)}>
            <Icon.Warning size={16} aria-hidden />
            <span>{hintText}</span>
          </div>
        )}
        <div className={styles.act}>
          <Button
            variant="primary"
            block
            disabled={atLimit}
            title={atLimit ? strings.editor.limitReached : undefined}
            onClick={() => navigateTo(editPath())}
          >
            <Icon.Plus size={16} />
            {strings.mine.create}
          </Button>
        </div>
      </Panel>

      <div className={styles.column}>
        {failed && <Notice tone="error" title={strings.browse.failed} />}

        <Panel flush>
          {loading ? (
            /* The same shape the browse list draws while it waits, so the
               panel does not resize when the rows land. Five, because that is
               the most this list can ever hold. */
            <div className={styles.list} aria-busy>
              {Array.from({ length: Math.max(me.buildCount, 1) }, (_, i) => (
                <BuildRowSkeleton key={i} />
              ))}
            </div>
          ) : builds.length === 0 ? (
            <Notice title={strings.mine.empty}>{strings.mine.emptyHint}</Notice>
          ) : (
            <div className={styles.list}>
              {builds.map((build) => (
                <BuildRow key={build.slug} build={build} href={editPath(build.slug)} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
