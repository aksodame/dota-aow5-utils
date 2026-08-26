import { BUILTIN_PREFIX, isBuiltin, type SoundSettings } from '@core/sounds.ts';
import { BUILTIN_URLS } from './builtins';

/**
 * Plays a short sound when something drops, and stops it playing over itself.
 *
 * Web Audio rather than an `<audio>` element, for two things an element cannot
 * do precisely: fade a voice out over a set number of milliseconds, and stop a
 * long sound at a set second. Both are scheduled on the audio clock, so neither
 * depends on a timer firing while the renderer is busy drawing a run.
 *
 * One voice per bound sound. A second Crimson Heart while the first is still
 * ringing ramps the first to silence and starts the new one — a hard cut clicks,
 * and two copies of the same sample overlapping is mud. Different items ringing
 * together are left alone: that is two things happening, and it should sound
 * like two things happening.
 */

/** `data:audio/mpeg;base64,…` to the bytes it stands for. No request, no origin, no CSP. */
function decodeDataUrl(url: string): ArrayBuffer | null {
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** How long a cancelled voice takes to get out of the way. Short enough to read as "instead", long enough not to click. */
const CANCEL_FADE = 0.12;

/** How long the fade is when a sound is cut at the limit. Longer, because nothing is replacing it. */
const LIMIT_FADE = 0.2;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export interface SoundPlayer {
  /** Plays the sound bound to this reference, cancelling its own previous voice. */
  play: (ref: string) => void;
  /** New volume and cut length. Applies to the next voice, not the one ringing. */
  update: (settings: SoundSettings) => void;
  stop: () => void;
}

export function createSoundPlayer(initial: SoundSettings): SoundPlayer {
  let settings = initial;
  let context: AudioContext | null = null;
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const voices = new Map<string, Voice>();

  /*
   * Built on first use, not on mount.
   *
   * An overlay that is click-through has never been interacted with, and a
   * context created in that state can start suspended — so it is created at the
   * moment there is something to play, and resumed if the policy suspended it
   * anyway. Electron's default autoplay policy does not require a gesture, so
   * this is belt to that brace rather than the mechanism.
   */
  const audio = (): AudioContext => {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  };

  const bytes = async (ref: string): Promise<ArrayBuffer | null> => {
    if (isBuiltin(ref)) {
      const url = BUILTIN_URLS[ref.slice(BUILTIN_PREFIX.length)];
      if (url === undefined) return null;
      return decodeDataUrl(url);
    }
    // A file the player chose, which the renderer cannot open itself: main
    // reads it and hands over the bytes. No URL, so no CSP exception.
    const file = await window.tracker.readSound(ref);
    if (file === null) return null;
    // Copied into an ArrayBuffer of its own: what comes over IPC is a view onto
    // a buffer this side does not own, and `decodeAudioData` detaches what it
    // is given.
    const bytes = new Uint8Array(file.byteLength);
    bytes.set(file);
    return bytes.buffer;
  };

  /** Decoded once per reference and kept, since the same drop happens all evening. */
  const load = (ref: string): Promise<AudioBuffer | null> => {
    const existing = buffers.get(ref);
    if (existing) return existing;

    const decoding = bytes(ref)
      .then((raw) => (raw === null ? null : audio().decodeAudioData(raw)))
      .catch((cause: unknown) => {
        /*
         * Said out loud, because the alternative is silence — and silence is
         * also what a correctly-bound sound sounds like before it plays. A
         * missing file, a format Chromium will not decode, a path on a drive
         * that is not plugged in: all of them land here, and none of them are
         * worth taking the overlay down for.
         */
        console.warn(`[sounds] could not load ${ref}`, cause);
        return null;
      });
    buffers.set(ref, decoding);
    return decoding;
  };

  const cancel = (ref: string, at: number): void => {
    const voice = voices.get(ref);
    if (!voice) return;
    voices.delete(ref);
    const { gain, source } = voice;
    gain.gain.cancelScheduledValues(at);
    gain.gain.setValueAtTime(gain.gain.value, at);
    gain.gain.linearRampToValueAtTime(0, at + CANCEL_FADE);
    source.stop(at + CANCEL_FADE);
  };

  return {
    play(ref) {
      if (!settings.enabled) return;
      /*
       * The context is built here, in the call, and not inside the `then`
       * below. Creating or resuming one is the part a browser ties to a user
       * gesture, and by the time a file has been read the gesture is over — so
       * a preview button would arm a context that stays suspended and a sound
       * that never arrives.
       */
      audio();
      void load(ref)
        .then((buffer) => {
        // Settings can change while a file is being read for the first time.
        if (buffer === null || !settings.enabled) return;

        const ctx = audio();
        const now = ctx.currentTime;
        cancel(ref, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(settings.volume, now);
        gain.connect(ctx.destination);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);

        source.onended = () => {
          if (voices.get(ref)?.source === source) voices.delete(ref);
          gain.disconnect();
        };

        /*
         * Started before anything is scheduled to stop it.
         *
         * `stop()` on a source that has not started yet throws
         * `InvalidStateError` — and inside a promise with nothing to catch it,
         * that is a sound that simply never arrives and never says why. The
         * order here is the fix and the reason for it.
         */
        source.start(now);

        const limit = settings.limitSeconds;
        if (limit !== null && buffer.duration > limit) {
          // Faded rather than cut: a sample stopped mid-waveform is a click.
          gain.gain.setValueAtTime(settings.volume, now + Math.max(0, limit - LIMIT_FADE));
          gain.gain.linearRampToValueAtTime(0, now + limit);
          source.stop(now + limit);
        }
        voices.set(ref, { source, gain });
        })
        .catch((cause: unknown) => {
          // Scheduling errors land here rather than in an unhandled rejection.
          console.warn(`[sounds] could not play ${ref}`, cause);
        });
    },

    update(next) {
      // Nothing to invalidate: buffers are keyed by the reference, so a binding
      // repointed at a different file is simply a different key. A voice that
      // is already ringing keeps the volume it started at, which is a fade the
      // player did not ask for if it were changed underneath them.
      settings = next;
    },

    stop() {
      const ctx = context;
      if (!ctx) return;
      for (const ref of [...voices.keys()]) cancel(ref, ctx.currentTime);
      void ctx.close();
      context = null;
      buffers.clear();
    },
  };
}
