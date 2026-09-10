import { useState } from 'react';
import { Button, ButtonLink, Icon, Panel } from '@/ui';
import { useApp } from '@/data/AppData';
// The real file, straight off disk and into the bundle, so the page and the
// thing it tells people to save can never drift apart.
import autoexecCfg from '@/data/autoexec.cfg?raw';
import { oldTrackerUrl, RELEASES_URL, WORKSHOP_URL } from '@/lib/links';
import { formatDate, megabytes, useLatestRelease } from '@/lib/release';
import styles from './TrackerPage.module.css';

/**
 * The tracker's download page — currently a single line saying it is not here
 * yet, and where it still is.
 *
 * The tracker is a desktop app in a different workspace package, so this page
 * cannot *be* it — what it can do is hand over the download and the one piece
 * of setup the app cannot do for itself: Dota has to be told to publish game
 * state, which is a file the player saves by hand.
 *
 * **Everything but the notice is switched off, not deleted.** `REBUILDING` is
 * the whole of it: below the early return, the download panel and the setup
 * steps are intact and still type-checked, so finishing this page is flipping
 * one line rather than writing it again. A notice sitting on top of a page that
 * still worked was the worse of the two states — it told people to go
 * elsewhere while showing them a download right underneath it.
 *
 * Typed `boolean` rather than left as a literal so the compiler keeps checking
 * the code under it instead of calling it unreachable.
 */
const REBUILDING: boolean = true;
export function TrackerPage() {
  const { strings, lang } = useApp();
  const release = useLatestRelease();
  const [copied, setCopied] = useState(false);

  const ready = release.status === 'ready' ? release.release : null;
  const asset = ready?.asset ?? null;
  const published = ready?.publishedAt != null ? formatDate(ready.publishedAt, lang) : null;

  /*
   * Under construction, and honest about it.
   *
   * No panel, no tinted box and no page heading over it: the whole page is this
   * one message, and dressing a single sentence as a warning inside a card is
   * three frames around one line. The way out is a button rather than small
   * print, because "not ready" and "no use to you" are different things only if
   * somebody can act on it.
   */
  if (REBUILDING) {
    return (
      <div className={styles.page}>
        <section className={styles.building}>
          <h1 className={styles.buildingTitle}>{strings.tracker.building}</h1>
          <p className={styles.buildingBody}>{strings.tracker.buildingHint}</p>
          {/* In the reader's own language: the old site takes the same
              `?lang=` this one does. */}
          <ButtonLink href={oldTrackerUrl(lang)} target="_blank" rel="noreferrer noopener" variant="primary">
            {strings.tracker.openOldSite}
            <Icon.External size={14} />
          </ButtonLink>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>{strings.tracker.heading}</h1>

      <p className={styles.lead}>
        An always-on-top overlay that counts what drops while you farm. It reads Dota's own game-state feed, so it needs
        no injection and touches nothing in the game.
      </p>

      <div className={styles.panels}>
        <Panel title="Download">
          <div className={styles.download}>
            {/*
              Every state here is a working link. Only when an asset is actually
              found does this become a direct download — which is also the only
              moment it can honestly claim a version and a size.
            */}
            {asset !== null ? (
              <ButtonLink href={asset.url} variant="primary" size="lg">
                <Icon.Download size={18} />
                Windows installer
              </ButtonLink>
            ) : (
              <ButtonLink href={RELEASES_URL} target="_blank" rel="noreferrer noopener" size="lg">
                <Icon.Download size={18} />
                All releases
              </ButtonLink>
            )}

            <span className={styles.releaseMeta}>
              {release.status === 'loading' && strings.common.loading}
              {release.status === 'none' && 'No release published yet.'}
              {release.status === 'error' && 'Could not reach GitHub. The link still works.'}
              {asset !== null && (
                <>
                  {ready?.tag} · {megabytes(asset.sizeBytes)} MB
                  {published !== null && ` · ${published}`}
                </>
              )}
            </span>
          </div>
        </Panel>

        <Panel title="Let Dota publish its game state">
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>1</span>
              <span>
                Save the file below as <code className={styles.path}>gamestate_integration_aow5.cfg</code> in{' '}
                <code className={styles.path}>
                  …\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\
                </code>
                . Create the last folder if it is not there.
              </span>
            </li>
            <li>
              <span className={styles.stepNumber}>2</span>
              <span>Restart Dota. The tracker picks the feed up on its own.</span>
            </li>
            <li>
              <span className={styles.stepNumber}>3</span>
              <span>
                Play <a href={WORKSHOP_URL} target="_blank" rel="noreferrer noopener">Age of Weapons 5</a>. The overlay
                starts counting when the match does.
              </span>
            </li>
          </ol>

          <div className={styles.config}>
            <Button
              className={styles.copy}
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(autoexecCfg);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? strings.build.copied : strings.build.copyLink}
            </Button>
            <code className={styles.configCode}>{autoexecCfg}</code>
          </div>
        </Panel>
      </div>
    </div>
  );
}
