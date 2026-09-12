/**
 * What Discord shows about a farming session, as a plain object.
 *
 * Pure, and in `core/` for the same reason `stats.ts` is: this is where the
 * decisions live — which of two layouts is on screen, what each line says, when
 * the timer started, which two buttons — and every one of them is a thing worth
 * testing without a Discord client, an Electron window or a socket in the way.
 * The half that cannot be tested that way is the IPC connection, and it stays in
 * main where the other process-level things are.
 *
 * ## Two layouts, and the state decides which
 *
 * In a room, the top line is the room and the bottom line is the rates — the
 * two questions somebody glancing at a friend's profile can actually answer
 * ("where are they, and is it going well"). Between rooms there is no room to
 * name, so the session takes over: how many runs, and what the evening averages.
 *
 * Nothing here reports loot item by item. A presence is read in passing by
 * people not playing the game, and a list of drops is for the overlay.
 *
 * ## The timer is derived, not stored
 *
 * `Run.start` is the *game* clock, which is not wall-clock time and cannot be
 * handed to Discord. `now - elapsed` is, and elapsed is already computed for
 * the HUD — so the timer agrees with the number the player is looking at rather
 * than with a second clock that could drift from it.
 */

import type { PresenceActivity, PresenceButton } from './ipc.ts';
import type { Rates } from './stats.ts';
import type { RoomInfo } from './rooms.ts';

export type { PresenceActivity, PresenceButton };

/**
 * The site, named once.
 *
 * The tracker has otherwise never needed to know where the site is — its icons
 * ship with the app precisely so it does not. These are links a *person*
 * follows out of a Discord profile, which is a different thing from a resource
 * the app fetches, and they are the only reason this constant exists.
 */
/**
 * The application this presence belongs to, from the Discord Developer Portal.
 *
 * Public by design: an id is what a Discord client is told to attribute an
 * activity to, it grants nothing, and it is baked in rather than configured
 * because a tracker whose presence points at somebody else's application is not
 * a thing anybody wants. The secret beside it in the portal is for OAuth, which
 * this never uses.
 */
export const DISCORD_APP_ID = '1547678578584330332';

export const SITE = 'https://aow5tools.boardshub.io';
export const BUILDER_URL = SITE;
export const TRACKER_URL = `${SITE}/tracker`;

/** Discord's own limits, which a label or a URL has to fit inside. */
export const BUTTON_LABEL_MAX = 32;
/** One update per fifteen seconds. The client queues the rest and sends the last. */
export const UPDATE_INTERVAL_MS = 15_000;

/**
 * The words, supplied by whoever knows the player's language.
 *
 * Functions rather than format strings because two of these are counts, and a
 * count in Russian needs three forms of its noun — a `{n} runs` template can
 * only be right in English. Core has no translation table and is not getting
 * one; `src/i18n` passes these in, exactly as `ValueOf` is passed to the stats.
 */
export interface PresenceLabels {
  /** The tooltip on the big picture. The app's own name. */
  app: string;
  /** Top line when no run is open. */
  betweenRooms: string;
  /** `T3`, or whatever a tier reads as. Given the room's level. */
  tier: (level: number) => string;
  /** Bottom line in a room: how long this room has taken, and what it has given. */
  room: (elapsed: string, gold: string) => string;
  /** Bottom line between rooms: the session's rate and how long it has been going. */
  session: (goldPerHour: string, elapsed: string) => string;
  /** The button that leads to the player's own published build. */
  myBuild: string;
  /** The button that leads to the site, when no build is configured. */
  builder: string;
  /** The button that leads to the tracker's own page. */
  getTracker: string;
}

export interface PresenceInput {
  /**
   * Everything the session line says, and it is the HUD's own object.
   *
   * `completedRuns` and `activeTime` are read straight off it rather than
   * passed in beside it: a presence that counted its own runs would sooner or
   * later disagree with the panel the player is looking at, and the disagreement
   * would be invisible to both of us.
   */
  rates: Rates;
  /** The room the open run is in, or null between rooms. */
  room: RoomInfo | null;
  /** Wall clock, in milliseconds. Passed in so the result is a function of its input. */
  now: number;
  /** The player's own build, from the tracker's settings. Empty or absent means none. */
  buildUrl?: string | undefined;
  /** An image key or URL for the room, when there is art for it. Optional throughout. */
  roomImageKey?: string | undefined;
  /** The key of the app's own picture, uploaded once to the Developer Portal. */
  logoKey?: string;
}

/** `12.4M`, `840k`, `0` — the same shape the HUD prints, without importing its formatter. */
function compact(amount: number): string {
  const value = Math.max(0, Math.floor(amount));
  if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trim(value / 1_000)}k`;
  return String(value);
}

function trim(value: number): string {
  // One decimal, and not a trailing `.0`: `12.4M` and `12M`, never `12.0M`.
  return value.toFixed(1).replace(/\.0$/, '');
}

/**
 * `2:14`, and `1:42:07` once there is an hour of it.
 *
 * Hours appear only when there are any, which is the difference between a room
 * and a session: a room is minutes and reads best as `2:14`, an evening is
 * hours and reads as nonsense at `102:07`.
 */
export function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * A URL a button may point at, or null.
 *
 * Discord refuses a button whose URL is not http(s), and refuses the *whole*
 * activity with it — so a build link somebody pasted wrong would silently cost
 * them their presence rather than one button. Checked here, where the answer
 * can be "use the site instead".
 */
export function usableUrl(value: string | undefined | null): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Cut to Discord's limit rather than let it reject the activity. */
function label(text: string): string {
  return text.length <= BUTTON_LABEL_MAX ? text : `${text.slice(0, BUTTON_LABEL_MAX - 1)}…`;
}

/**
 * The two buttons, in the order they are drawn.
 *
 * The first is the player's own build when they have named one and the site
 * otherwise — a profile that says "here is what I am farming" is worth more
 * than one that says "here is a website", and when there is no build to point
 * at the website is the honest second best. The second is always the tracker,
 * because the question a friend asks after "what is that" is "where do I get
 * it".
 */
export function presenceButtons(buildUrl: string | undefined, labels: PresenceLabels): PresenceButton[] {
  const own = usableUrl(buildUrl);
  return [
    own === null
      ? { label: label(labels.builder), url: BUILDER_URL }
      : { label: label(labels.myBuild), url: own },
    { label: label(labels.getTracker), url: TRACKER_URL },
  ];
}

/**
 * The activity for a moment of a session.
 *
 * In a room: the room and its tier, then the rates, timed from the run's start.
 * Between rooms: the session's count and average, timed from its start.
 */
export function buildPresence(input: PresenceInput, labels: PresenceLabels): PresenceActivity {
  const { rates, room, now } = input;
  const inRoom = room !== null;

  const details = inRoom
    ? room.level > 0
      ? `${room.name} · ${labels.tier(room.level)}`
      : room.name
    : labels.betweenRooms;

  /*
   * In a room, the two numbers that are about *this* room: how long it has
   * taken and what it has paid. Between rooms neither exists, so the line
   * switches to what the evening has been worth and how long it has been going.
   *
   * Both carry a time that the timer below also counts. That is deliberate
   * redundancy rather than an oversight: the timer ticks every second on the
   * reader's own machine, while this text may only be rewritten once every
   * fifteen seconds — so the text is the coarse label and the timer is the live
   * one. It does mean an update goes out on every window it is allowed to,
   * because the time in it has always moved.
   */
  const state = inRoom
    ? labels.room(duration(rates.currentRunElapsed), compact(rates.currentRunGold))
    : labels.session(compact(rates.goldPerHour), duration(rates.activeTime));

  // Seconds back from now, so the timer Discord counts up agrees with the one
  // on the HUD instead of being a second clock started at connection time.
  const elapsed = inRoom ? rates.currentRunElapsed : rates.activeTime;
  const startTimestamp = now - Math.max(0, Math.round(elapsed)) * 1000;

  const activity: PresenceActivity = {
    details,
    state,
    startTimestamp,
    largeImageKey: input.logoKey ?? 'logo',
    largeImageText: labels.app,
    buttons: presenceButtons(input.buildUrl, labels),
  };

  // The room's picture is the small one: the big slot is the app, which is what
  // makes a profile recognisable as this tracker at a glance.
  if (inRoom && input.roomImageKey !== undefined && input.roomImageKey !== '') {
    activity.smallImageKey = input.roomImageKey;
    activity.smallImageText = room.name;
  }

  return activity;
}

/**
 * Whether two activities would look identical.
 *
 * The client may send one update every fifteen seconds, and the rates move on
 * every drop — so the thing to send is "the newest activity, if it differs".
 * The timestamp is excluded on purpose: it is derived from `now`, so it changes
 * on every tick by definition, and comparing it would make every activity new.
 */
export function samePresence(a: PresenceActivity | null, b: PresenceActivity | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.details === b.details &&
    a.state === b.state &&
    a.largeImageKey === b.largeImageKey &&
    a.smallImageKey === b.smallImageKey &&
    a.buttons.length === b.buttons.length &&
    a.buttons.every((button, index) => button.url === b.buttons[index]?.url && button.label === b.buttons[index]?.label)
  );
}

/**
 * The activity in the shape the socket takes: snake_case, assets nested.
 *
 * Here rather than beside the socket because it is pure, and because it is the
 * one part of Rich Presence that is silently wrong rather than broken — a
 * misspelled key does not fail, it produces an activity with a piece missing
 * and no way to tell from the app's side. The buttons are the piece most worth
 * pinning: over this socket they are `[{ label, url }]`, which is *not* the
 * shape the gateway takes for the same field, and the difference is a pair of
 * buttons nobody ever sees.
 */
export function wireActivity(activity: PresenceActivity): Record<string, unknown> {
  const assets: Record<string, string> = {
    large_image: activity.largeImageKey,
    large_text: activity.largeImageText,
  };
  if (activity.smallImageKey !== undefined) assets['small_image'] = activity.smallImageKey;
  if (activity.smallImageText !== undefined) assets['small_text'] = activity.smallImageText;

  return {
    details: activity.details,
    state: activity.state,
    timestamps: { start: activity.startTimestamp },
    assets,
    buttons: activity.buttons.map((button) => ({ label: button.label, url: button.url })),
  };
}
