import { useState } from 'react';
import { Button, ButtonLink, Icon, Panel } from '@/ui';
import { useApp } from '@/data/AppData';
// The real file, straight off disk and into the bundle, so the page and the
// thing it tells people to save can never drift apart.
import autoexecCfg from '@/data/autoexec.cfg?raw';
import { RELEASES_URL } from '@/lib/links';
import { formatDate, megabytes, useLatestRelease } from '@/lib/release';
import styles from './TrackerPage.module.css';

/**
 * The tracker's page.
 *
 * The tracker is a desktop app in a different workspace package, so this page
 * cannot *be* it. What it can do is answer, in this order, the three questions
 * somebody arrives with: what is it, do I want it, and how do I get it working.
 *
 * That order is why the setup is near the bottom rather than under the download
 * button. Five steps involving Steam launch options are the price of the thing,
 * and a page that opens with the price of something nobody has decided they
 * want yet is a page people leave. The download sits at the top for the people
 * who already know, and the steps wait for the ones who read on.
 *
 * **The video is under the written steps, not above them.** It was the other way
 * round on the old site, on the reasoning that most people would rather watch.
 * They would — but a video cannot be copied from, and every one of these steps
 * ends in pasting an exact path. The text is the thing you follow with a hand on
 * the keyboard; the video is for checking you understood it.
 */

/** The setup walkthrough on YouTube. Not a translated string — one video. */
const GUIDE_VIDEO_ID = 'ycAzkBW0bEs';

/** A path or a launch option, with the button that puts it on the clipboard. */
function CopyLine({ label, value }: { label: string; value: string }) {
  const { strings } = useApp();
  const [copied, setCopied] = useState(false);

  return (
    <div className={styles.copyLine}>
      <span className={styles.copyLabel}>{label}</span>
      <div className={styles.copyRow}>
        <code className={styles.copyValue}>{value}</code>
        {/*
          The glyph alone, and the glyph is the feedback.

          A label beside it would be the third thing on a row that is already a
          path and a button — and the word for this action is the picture on it.
          What the label was carrying is the *result*, so the tick carries that
          instead: pressed, it swaps for 1.6 seconds and swaps back. The
          accessible name says the same in words, and changes with it.
        */}
        <Button
          size="sm"
          icon
          aria-label={copied ? strings.build.copied : strings.common.copy}
          title={copied ? strings.build.copied : strings.common.copy}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
        </Button>
      </div>
    </div>
  );
}

export function TrackerPage() {
  const { strings, lang } = useApp();
  const t = strings.tracker;
  const release = useLatestRelease();
  const [copiedCfg, setCopiedCfg] = useState(false);

  const ready = release.status === 'ready' ? release.release : null;
  const asset = ready?.asset ?? null;
  const published = ready?.publishedAt != null ? formatDate(ready.publishedAt, lang) : null;

  return (
    <div className={styles.page}>
      {/*
        The rail is the browse page's filter panel, holding a different kind of
        list.

        Same width, same sticky behaviour, same panel — because it is the same
        *role*: the column you glance down while the column beside it is the one
        you are actually here for. A second two-column shape on a four-route site
        would be a second thing to keep in step for no reason.

        Everything that describes the app rather than installing it lives here
        now. The two panels this replaced — what it puts on screen, fitting it
        over the game — were prose in the main column answering "what is this
        like to use" beside a column answering "how do I set it up", which is a
        page having two conversations at once.
      */}
      <Panel
        fill
        className={styles.rail}
        title={t.heading}
        /*
         * The version rides on the title's line, where a version belongs: it
         * names the thing above it rather than the button below it, and the
         * button's own line is for what the download costs.
         */
        action={ready?.tag != null ? <span className={styles.version}>{ready.tag}</span> : undefined}
      >
        <div className={styles.railScroll}>
          <div className={styles.download}>
            {/*
              Every state here is a working link. Only when an asset is actually
              found does this become a direct download — which is also the only
              moment it can honestly claim a version and a size.
            */}
            {asset !== null ? (
              <ButtonLink href={asset.url} variant="primary" block>
                <Icon.Download size={16} />
                {t.download.installer}
              </ButtonLink>
            ) : (
              <ButtonLink href={RELEASES_URL} target="_blank" rel="noreferrer noopener" block>
                <Icon.Download size={16} />
                {t.download.allReleases}
              </ButtonLink>
            )}

            {/*
              What the download costs, in one line under the button that starts
              it: the size, when it was published, and what it runs on.

              One element rather than three, and joined here rather than laid out
              in CSS — these are facts of the same kind, and three boxes with
              gaps between them read as three statements about three things.
            */}
            <span className={styles.releaseMeta}>
              {release.status === 'loading' && strings.common.loading}
              {release.status === 'none' && t.download.none}
              {release.status === 'error' && t.download.failed}
              {[asset !== null ? `${megabytes(asset.sizeBytes)} MB` : null, asset !== null ? published : null]
                .filter((part): part is string => part !== null && part !== '')
                .join(' · ')}
            </span>
          </div>

          {/*
            The three lists, drawn by one loop over one shape.
            
            They were three shapes and two loops when the bullets carried
            explanations — the features had an icon, the screens had none, and
            the third had both an icon and a clause. An icon and a noun phrase is
            all any of them needed, and saying so once is what collapsed the
            special cases.
          */}
          {[t.features, t.windows, t.fitting].map((group) => (
            <section key={group.title} className={styles.group}>
              <h3 className={styles.groupHead}>{group.title}</h3>
              <ul className={styles.bullets}>
                {group.items.map((item) => (
                  <li key={item.name} className={styles.bullet}>
                    <span className={styles.bulletEmoji} aria-hidden>
                      {item.emoji}
                    </span>
                    <span className={styles.bulletName}>{item.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>

      {/* The column that is read rather than scanned. */}
      <div className={styles.main}>
      {/*
        The walkthrough, folded.

        Same shape as the build page's reforge priority: a heading you press
        when you want it. Closed by default because it is the second answer —
        the steps beside it are the first, and they are what somebody with a
        hand on the keyboard actually follows. A video cannot be copied from,
        and every step ends in pasting an exact path.

        `Panel` renders nothing while it is shut, so the player is not created —
        and the page costs nothing to a reader who never opens it. That is the
        whole reason the `loading="lazy"` below is belt and braces rather than
        the mechanism.
      */}
      <Panel collapsible defaultOpen={false} title={t.setup.videoTitle}>
        <div className={styles.video}>
          <iframe
            className={styles.videoFrame}
            src={`https://www.youtube-nocookie.com/embed/${GUIDE_VIDEO_ID}`}
            title={t.setup.videoTitle}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </Panel>

      <Panel title={t.setup.title}>
        <div className={styles.copyBlock}>
          <CopyLine label={t.setup.fileLabel} value={t.setup.logPath} />
          <CopyLine label={t.setup.optionLabel} value={t.setup.launchOption} />
        </div>

        <p className={styles.fineprint}>{t.setup.pathWarning}</p>

        <ol className={styles.steps}>
          {t.setup.steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{index + 1}</span>
              <div className={styles.stepBody}>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        {/*
          The optional file, after the steps that are not optional. It changes
          nothing on screen and deleting it undoes it, so it has no business
          competing with the five things that actually have to be done.
        */}
        <div className={styles.config}>
          <div className={styles.copyLine}>
            <span className={styles.copyLabel}>{t.setup.cfgLabel}</span>
            <div className={styles.copyRow}>
              <code className={styles.copyValue}>{t.setup.cfgPath}</code>
              {/* The file itself, not the path beside it — see `CopyLine`. */}
              <Button
                size="sm"
                icon
                aria-label={copiedCfg ? strings.build.copied : strings.common.copy}
                title={copiedCfg ? strings.build.copied : strings.common.copy}
                onClick={() => {
                  void navigator.clipboard?.writeText(autoexecCfg);
                  setCopiedCfg(true);
                  window.setTimeout(() => setCopiedCfg(false), 1600);
                }}
              >
                {copiedCfg ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
              </Button>
            </div>
          </div>
          <code className={styles.configCode}>{autoexecCfg}</code>
        </div>
      </Panel>

      </div>
    </div>
  );
}
