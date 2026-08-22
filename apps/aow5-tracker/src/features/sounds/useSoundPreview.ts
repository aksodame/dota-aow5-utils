import { useCallback, useEffect, useRef } from 'react';
import type { SoundSettings } from '@core/sounds.ts';
import { createSoundPlayer, type SoundPlayer } from './player';

/**
 * Plays a bound sound on demand, for the button beside it in settings.
 *
 * A binding you cannot hear is a binding you have to test by going and farming
 * the item, which is a long way to find out you picked the wrong file. Its own
 * player, in its own window: the settings window does not watch the feed, so
 * nothing here can ring by itself.
 *
 * Built on the first press rather than on mount — a window opened to change the
 * UI scale should not start an audio context on the way past.
 */
export function useSoundPreview(settings: SoundSettings | null): (ref: string) => void {
  const player = useRef<SoundPlayer | null>(null);

  useEffect(
    () => () => {
      player.current?.stop();
      player.current = null;
    },
    [],
  );

  return useCallback(
    (ref: string) => {
      if (!settings) return;
      player.current ??= createSoundPlayer(settings);
      // The volume slider is right there; a preview should use where it is now,
      // not where it was when the window opened.
      player.current.update(settings);
      player.current.play(ref);
    },
    [settings],
  );
}
