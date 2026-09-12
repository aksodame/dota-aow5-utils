import { useEffect, useRef } from 'react';
import { buildPresence, samePresence, type PresenceActivity, type PresenceLabels } from '@core/presence.ts';
import type { TrackerConfig } from '@core/ipc.ts';
import type { Session } from '@/features/session/useSession';
import { useRooms } from '@/features/rooms/table';
import { useMessages } from '@/i18n';

/**
 * Publishes the session to Discord, from the window that owns it.
 *
 * Here rather than in main because everything the two lines are made of is
 * here: the session, the room table in the player's language, and the words
 * themselves. Main gets a finished activity and owns only what needs a process
 * — the socket, the rate limit, the reconnect.
 *
 * Only the farm overlay calls this, for the same reason it is the only window
 * that plays a drop sound: a second window publishing the same session would be
 * two clients writing to one profile.
 */
export function usePresence(session: Session, config: TrackerConfig | null): void {
  const m = useMessages();
  const rooms = useRooms();
  /** The last thing handed over, so an unchanged tick costs nothing. */
  const sent = useRef<PresenceActivity | null>(null);

  const { state, rates } = session;

  useEffect(() => {
    const api = window.tracker;
    if (api === undefined) return;

    /*
     * Off, paused, or between sessions: publish nothing.
     *
     * Paused counts as nothing deliberately. Pausing is what somebody does when
     * they stop playing, and a profile that goes on saying "12.4M gold/h" while
     * its owner is at dinner is the feature being wrong in the most visible
     * place it has.
     */
    if (config?.discordPresence !== true || session.paused) {
      if (sent.current !== null) {
        sent.current = null;
        api.setPresence(null);
      }
      return;
    }

    const labels: PresenceLabels = {
      app: m.presence.app,
      betweenRooms: m.presence.betweenRooms,
      tier: m.presence.tier,
      room: m.presence.room,
      session: m.presence.session,
      myBuild: m.presence.myBuild,
      builder: m.presence.builder,
      getTracker: m.presence.getTracker,
    };

    const activity = buildPresence(
      {
        rates,
        room: state.current === null ? null : rooms.get(state.current.room),
        now: Date.now(),
        buildUrl: config.buildUrl,
      },
      labels,
    );

    // Main de-duplicates too — it has to, since it is the one holding the rate
    // limit — but there is no reason to cross a process boundary to be told
    // nothing changed.
    if (samePresence(activity, sent.current)) return;
    sent.current = activity;
    api.setPresence(activity);
  }, [state, rates, config?.discordPresence, config?.buildUrl, session.paused, m, rooms, state.current]);
}
