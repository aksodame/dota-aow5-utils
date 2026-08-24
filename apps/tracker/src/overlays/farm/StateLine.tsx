import { Map as MapIcon, Trophy } from 'lucide-react';
import { useRooms } from '@/features/rooms/table';
import { useMessages } from '@/i18n';

/**
 * Where you are, on the line the title bar uses while the overlay is clickable.
 *
 * It was a card among the others, which was the wrong shape twice over: a room
 * name is prose where every other card is five characters, and the two things
 * are never wanted at the same moment. While you are playing, the chrome above
 * the readout is invisible and its row is empty — so the room goes there, and
 * gives the cards their width back. Press the hotkey and the title, the badges
 * and the buttons take the row again, which is the moment you stopped looking
 * at which room you are in and started configuring the thing.
 *
 * The run count rides along at the right. It is a number, but a slow one — it
 * moves a handful of times an hour where the cards below move every second —
 * so a whole card of the readout was width spent on something that is really
 * context for the room beside it: this is your fifth of these.
 */
export function StateLine({ room, runs }: { room: string | null; runs: number }) {
  const m = useMessages();
  const rooms = useRooms();

  return (
    <div className="hud-state-line flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-black/25 px-2 py-0.5">
      <MapIcon className="size-3.5 shrink-0 text-muted-foreground" />
      {/* The id on hover, as everywhere else: it is what the drop tables and
          the wiki are keyed by. */}
      <span className="min-w-0 truncate text-[0.6875rem]" title={room ?? undefined}>
        {/* "In hideout" but "At Frozen Tundra": the hideout is a place you are
            inside of, and a room is a place you are at, which is also the
            difference between waiting and farming. Whether a language draws
            that distinction is the catalog's business — see `stateLine`. */}
        <span className="text-muted-foreground">{room === null ? m.stateLine.inHideout : m.stateLine.atRoom}</span>
        <span className="font-semibold">{room === null ? m.stateLine.hideout : rooms.name(room)}</span>
      </span>
      {/* `ms-auto` rather than a spacer: the room takes the width it needs and
          the count sits against the right edge whatever is left. */}
      <span
        className="ms-auto flex shrink-0 items-center gap-1 text-[0.6875rem] tabular-nums"
        title={m.stateLine.runs}
      >
        <Trophy className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-semibold">{runs}</span>
      </span>
    </div>
  );
}
