-- Steam sign-in is gone. Accounts are local now: a nickname and a password.
--
-- Every account is dropped and the table is rebuilt. That is a decision rather
-- than a step — a SteamID cannot become a password, so there is nothing to
-- migrate, and leaving the rows would mean accounts nobody can ever sign into.
-- Builds, comments and votes go with their authors. `infra/deploy.sh` snapshots
-- the database before every deploy precisely so that this is undoable.
--
-- Hand-written, and it has to stay hand-written. Drizzle's migrator wraps all
-- pending migrations in a single BEGIN...COMMIT, and `PRAGMA foreign_keys` is a
-- documented no-op inside a transaction — so the `PRAGMA foreign_keys=OFF` that
-- drizzle-kit puts above a generated table recreate does nothing at all, and the
-- DROP TABLE beneath it runs with cascades live. Here that is exactly what is
-- wanted. Anywhere else it would be a silent catastrophe.
--
-- The child rows are deleted explicitly, in order, rather than left to the
-- cascade: `builds_fts` is an external-content FTS5 index kept in step by AFTER
-- DELETE triggers on `builds`, and a real DELETE fires them where the implicit
-- one inside DROP TABLE is not guaranteed to. The rebuild below makes the
-- question moot either way, for the price of one statement.
DELETE FROM `comments`;
--> statement-breakpoint
DELETE FROM `votes`;
--> statement-breakpoint
DELETE FROM `builds`;
--> statement-breakpoint
DELETE FROM `sessions`;
--> statement-breakpoint
DELETE FROM `users`;
--> statement-breakpoint
-- Belt and braces: the triggers above should have emptied the index already.
-- This guarantees it instead of assuming it, and a stale FTS index would show
-- up as search results for builds that no longer exist.
INSERT INTO `builds_fts`(`builds_fts`) VALUES('rebuild');
--> statement-breakpoint
DROP INDEX IF EXISTS `users_steam_id`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
-- Recreated immediately. `sessions`, `builds`, `votes` and `comments` all still
-- carry REFERENCES `users`(`id`), and SQLite resolves those by name at run time,
-- so the table has to be back before anything touches them. Nothing may be
-- inserted between this statement and the one above.
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`nickname_key` text NOT NULL,
	`password_hash` text NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`role` text DEFAULT 'user' NOT NULL,
	`banned_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "users_role" CHECK("users"."role" in ('user', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_nickname_key` ON `users` (`nickname_key`);
