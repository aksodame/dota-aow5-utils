import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { purge } from '../../core/db/purge.ts';
import type { Db } from '../../core/db/open.ts';
import { DB } from './tokens.ts';

/**
 * Sweeping up what was soft-deleted, on a timer inside the process.
 *
 * A timer rather than a cron entry on the host, because this is the only
 * scheduled work the API has and one more moving part on the VPS would need
 * installing, documenting and remembering. It is also idempotent and cheap
 * enough that a missed run costs nothing.
 *
 * Runs once shortly after boot so a fresh deploy tidies up, then daily. Not
 * *at* boot: a container that crash-loops would otherwise purge on every
 * restart, and the point of the delay is that it never happens during a
 * deployment's first seconds.
 */
const START_DELAY_MS = 5 * 60 * 1000;
const INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PurgeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('purge');
  private timers: NodeJS.Timeout[] = [];

  constructor(@Inject(DB) private readonly db: Db) {}

  onApplicationBootstrap(): void {
    const first = setTimeout(() => {
      this.run();
      const repeat = setInterval(() => this.run(), INTERVAL_MS);
      // Neither timer may hold the process open: a shutdown should not wait a
      // day for the next sweep.
      repeat.unref();
      this.timers.push(repeat);
    }, START_DELAY_MS);
    first.unref();
    this.timers.push(first);
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  run(): void {
    try {
      const result = purge(this.db, Math.floor(Date.now() / 1000));
      if (result.builds + result.comments + result.sessions > 0) {
        this.logger.log(
          `purged ${result.builds} builds, ${result.comments} comments, ${result.sessions} sessions`,
        );
      }
    } catch (error) {
      // Housekeeping failing is not a reason to take the API down with it.
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }
}
