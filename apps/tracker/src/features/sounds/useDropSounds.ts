import { useEffect, useRef } from 'react';
import type { TrackerEvent } from '@core/events.ts';
import type { ItemTable } from '@core/items.ts';
import { DEFAULT_SOUNDS, resolveSound, type SoundSettings } from '@core/sounds.ts';
import { useItems } from '@/features/items/table';
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
 *
 * What a drop *should* sound like is `resolveSound`'s question, not this hook's:
 * the item's own binding, then its rarity, then its level. All this end knows is
 * that a pickup carries ids, and that an id has to become a grade before a rule
 * can match it — which is what the table is for.
 */
export function useDropSounds(settings: SoundSettings | null): void {
  const live = useRef<SoundSettings | null>(settings);
  const player = useRef<SoundPlayer | null>(null);

  // Through a ref because the feed is subscribed to once, on mount. The table
  // only changes when the language does, and quality and level are the same row
  // in every language — but a stale closure is a stale closure, and this costs
  // an assignment.
  const items = useItems();
  const table = useRef<ItemTable>(items);
  table.current = items;

  useEffect(() => {
    const created = createSoundPlayer(live.current ?? DEFAULT_SOUNDS);
    player.current = created;

    const off = window.tracker.onEvent((event: TrackerEvent) => {
      const now = live.current;
      if (!now?.enabled || event.e !== 'drop') return;

      // Two ids in one pickup can resolve to the same file — easily, now that
      // a rule covers a whole tier; it should ring once, not fight itself.
      const rung = new Set<string>();
      for (const [id] of event.items) {
        const ref = resolveSound(now, table.current.get(id));
        if (ref === null || rung.has(ref)) continue;
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
