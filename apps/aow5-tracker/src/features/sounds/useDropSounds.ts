import { useEffect, useRef } from 'react';
import type { TrackerEvent } from '@core/events.ts';
import { DEFAULT_SOUNDS, type SoundSettings } from '@core/sounds.ts';
import { createSoundPlayer, type SoundPlayer } from './player';

/**
 * Rings the bound sound when a bound item drops.
 *
 * Subscribes to the event feed directly rather than going through
 * `useSession`: this wants the stream, not the folded state — a total that
 * changed tells you nothing about *when*, and "when" is the whole point of a
 * notification. Only the farm overlay calls this, so nothing double-plays.
 *
 * One sound per drop event. A pickup of four Crimson Hearts is one event and
 * one ring: the sound means "that dropped", not "that many dropped", and four
 * restarts in a row would say neither.
 */
export function useDropSounds(settings: SoundSettings | null): void {
  const live = useRef<SoundSettings | null>(settings);
  const player = useRef<SoundPlayer | null>(null);

  useEffect(() => {
    const created = createSoundPlayer(live.current ?? DEFAULT_SOUNDS);
    player.current = created;

    const off = window.tracker.onEvent((event: TrackerEvent) => {
      const now = live.current;
      if (!now?.enabled || event.e !== 'drop') return;

      // Two ids in one pickup can be bound to the same file; it should ring
      // once, not fight itself.
      const rung = new Set<string>();
      for (const [id] of event.items) {
        const ref = now.bindings[id];
        if (ref === undefined || rung.has(ref)) continue;
        rung.add(ref);
        created.play(ref);
      }
    });

    return () => {
      off();
      created.stop();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    live.current = settings;
    if (settings) player.current?.update(settings);
  }, [settings]);
}
