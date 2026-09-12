import { useState } from 'react';
import type { BuildVideo } from 'aow5-api-contract';
import { Icon, Panel } from '@/ui';
import { useApp } from '@/data/AppData';
import styles from './VideoPanel.module.css';

/**
 * The build's video, under the gear it explains.
 *
 * **Nothing is loaded from YouTube until somebody presses play.** The panel is
 * a still and a button; the `iframe` is mounted by the click. That is not a
 * micro-optimisation — YouTube's player is well over a megabyte and sets
 * cookies, and this whole site is a 30 kB bundle whose argument is being small.
 * A reader who came for the item list should not pay for a video they did not
 * watch, and should not be counted by a third party for scrolling past it.
 *
 * `youtube-nocookie` once it does mount, which is the host the site's
 * `frame-src` names — see the Caddyfile. The thumbnail comes from `i.ytimg.com`
 * and is the only other host in play; both are spelled out in the policy rather
 * than being reachable by accident.
 */
export function VideoPanel({ video, title }: { video: BuildVideo; title: string }) {
  const { strings } = useApp();
  const [playing, setPlaying] = useState(false);

  const start = video.start > 0 ? `&start=${video.start}` : '';
  const watchAt = video.start > 0 ? `&t=${video.start}` : '';

  return (
    <Panel
      title={strings.build.video}
      action={
        <a
          className={styles.watch}
          href={`https://www.youtube.com/watch?v=${video.id}${watchAt}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {strings.build.watchOnYoutube}
        </a>
      }
    >
      <div className={styles.frame}>
        {playing ? (
          <iframe
            className={styles.player}
            /*
             * `autoplay=1` because the click that mounted this *was* the play
             * button. Without it the reader presses play twice, the second time
             * on a control that only just appeared under their cursor.
             */
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1${start}`}
            title={title}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <button type="button" className={styles.poster} onClick={() => setPlaying(true)}>
            {/*
              `hqdefault` rather than `maxresdefault`: every video has one, and
              a missing maxres is a 404 that renders as a broken image. At this
              width 480x360 is already more than enough.
            */}
            <img
              className={styles.still}
              src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span className={styles.play}>
              <Icon.Play size={22} />
            </span>
            <span className="srOnly">{strings.build.playVideo}</span>
          </button>
        )}
      </div>
    </Panel>
  );
}
