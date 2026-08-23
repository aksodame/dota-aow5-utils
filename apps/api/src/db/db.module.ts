/**
 * The database, as one shared connection.
 *
 * better-sqlite3 is synchronous and single-connection by design — there is no
 * pool to size and no await to forget. Migrations run here, at boot, so the
 * container that serves the code is the container that migrated the schema.
 */
import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { migrationsFolder } from '../../core/db/migrations.ts';
import { openDb, runMigrations, type Db, type Sqlite } from '../../core/db/open.ts';
import { loadConfig } from '../config.ts';
import { PurgeService } from './purge.service.ts';
import { DB, SQLITE } from './tokens.ts';

// Re-exported so `DbModule` is still the one name a reader looks for, while the
// declarations themselves live in a leaf file that cannot be part of a cycle.
export { DB, SQLITE };

const connection = {
  provide: SQLITE,
  useFactory: (): { db: Db; sqlite: Sqlite } => {
    const logger = new Logger('db');
    const config = loadConfig();
    const opened = openDb({ path: config.databasePath });
    runMigrations(opened.db, migrationsFolder(), config.databasePath);
    logger.log(`opened ${config.databasePath}, schema up to date`);
    return opened;
  },
};

@Global()
@Module({
  providers: [
    connection,
    { provide: DB, useFactory: (opened: { db: Db }) => opened.db, inject: [SQLITE] },
    PurgeService,
  ],
  exports: [DB, SQLITE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(SQLITE) private readonly opened: { sqlite: Sqlite }) {}

  /**
   * Closes the file cleanly so the -wal is checkpointed back into the database
   * rather than left for the next process to recover.
   */
  onApplicationShutdown(): void {
    this.opened.sqlite.close();
  }
}
