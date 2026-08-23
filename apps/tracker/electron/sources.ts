import fs from 'node:fs';
import type { TrackerEvent } from '../core/events.ts';
import type { TrackerConfig } from '../core/ipc.ts';
import { startConsoleSource, type ConsoleSourceHandle } from '../core/sources/console.ts';
import { startMockSource, type MockHandle } from '../core/sources/mock.ts';

/**
 * The one event feed, and the only part of main that knows a source exists.
 *
 * Whatever is running is stopped before anything else starts, so switching
 * source in settings can never leave two feeds writing into the same session.
 * Every overlay gets the same events — the recipe panel counts drops from
 * exactly the stream the HUD does, not from a second tail of the same file.
 */

/** How events and health reach the renderers. */
export type Deliver = (channel: string, payload: unknown) => void;

export class SourceFeed {
  private handle: MockHandle | ConsoleSourceHandle | null = null;
  private readonly deliver: Deliver;

  constructor(deliver: Deliver) {
    this.deliver = deliver;
  }

  /**
   * Starts the source the config asks for.
   *
   * Status is broadcast even when everything is fine: a silent overlay showing
   * zeros is indistinguishable from a broken one, so the renderer always has
   * something to put in the header.
   */
  start(config: TrackerConfig): void {
    this.stop();

    if (config.source === 'mock') {
      this.handle = startMockSource((event: TrackerEvent) => this.deliver('tracker:event', event), {
        speed: config.mockSpeed,
        loop: true,
      });
      this.deliver('tracker:status', { source: 'mock', detail: `mock @ ${config.mockSpeed}x` });
      return;
    }

    const exists = fs.existsSync(config.logFile);
    this.handle = startConsoleSource(config.logFile, (event) => this.deliver('tracker:event', event), {
      onSkipped: (skipped) => this.deliver('tracker:skipped', skipped),
      onError: (err) => this.deliver('tracker:status', { source: 'console', detail: err.message, error: true }),
    });
    this.deliver('tracker:status', {
      source: 'console',
      detail: exists ? `tailing ${config.logFile}` : `waiting for ${config.logFile}`,
      error: !exists,
    });
  }

  stop(): void {
    this.handle?.stop();
    this.handle = null;
  }

  /**
   * Resynchronise a console tail after something rewrote the file underneath it.
   *
   * Only the console source has a file to be rewritten; for the mock this is
   * nothing at all, which is why the check is a property test rather than a
   * flag on the class.
   */
  skipToEnd(): void {
    const handle = this.handle;
    if (handle && 'skipToEnd' in handle) handle.skipToEnd();
  }
}
