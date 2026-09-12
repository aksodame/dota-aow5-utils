-- Steam sign-in is back, dislikes are gone, and a build is one loadout on one map.
--
-- Three changes that all land at once because they all destroy the same rows.
--
-- **Accounts.** 0003 replaced Steam with local nicknames and passwords; this
-- reverses it, for the reason 0003's own comment gave in the other direction —
-- a password cannot become a SteamID, so there is nothing to migrate and
-- leaving the rows would mean accounts nobody can ever sign into again.
--
-- **Builds.** Every stored payload is codec v1-v6, which encoded a board of up
-- to nine sections. v7 encodes one loadout and refuses the older versions
-- outright, because nine loadouts do not become one and picking the first would
-- silently discard eight. So the existing builds are not merely orphaned by the
-- account change — they are unreadable by the code that would render them, and
-- keeping them would mean rows that 404 on their own page.
--
-- **Votes.** A downvote on a guide collects "I did not read this"
-- indistinguishably from "this is wrong", so the site keeps the signal it can
-- act on. The table is rebuilt as `likes` rather than filtered in place: with
-- no value column there is no way to represent a dislike at all, which is a
-- stronger guarantee than a CHECK.
--
-- `infra/deploy.sh` snapshots the database before every deploy, which is what
-- makes this undoable. Take one anyway before running it.
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
-- one inside DROP TABLE is not guaranteed to.
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
DROP INDEX IF EXISTS `users_nickname_key`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
-- Recreated immediately. `sessions`, `builds`, `likes` and `comments` all carry
-- REFERENCES `users`(`id`), and SQLite resolves those by name at run time, so
-- the table has to be back before anything touches them. Nothing may be
-- inserted between this statement and the one above.
--
-- `steam_id` is text, not an integer: a 64-bit SteamID is past 2^53, so storing
-- it as a number would round distinct accounts onto each other.
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_id` text NOT NULL,
	`persona` text NOT NULL,
	`avatar` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`banned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "users_role" CHECK("users"."role" in ('user', 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_steam_id` ON `users` (`steam_id`);
--> statement-breakpoint
-- Likes, with no value column, replacing votes.
DROP TABLE `votes`;
--> statement-breakpoint
CREATE TABLE `likes` (
	`build_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`build_id`, `user_id`),
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `builds` DROP COLUMN `dislike_count`;
--> statement-breakpoint
-- `section_count` was how many decks a board carried. A build has one loadout,
-- so the column has nothing left to say.
ALTER TABLE `builds` DROP COLUMN `section_count`;
--> statement-breakpoint
-- The map a build is for, and the tier that map sits at.
--
-- Nullable, like `hero_id`, because a build may name a room this deployment
-- cannot resolve. `tier` is a copy of the map's own tier rather than a join:
-- it is the browse page's primary filter, and joining eighteen rows to sort a
-- hundred is work for nothing. A room whose tier the addon changes therefore
-- needs a backfill — a rare migration, rather than a query that is slow always.
ALTER TABLE `builds` ADD COLUMN `map_id` text;
--> statement-breakpoint
ALTER TABLE `builds` ADD COLUMN `tier` integer;
--> statement-breakpoint
ALTER TABLE `builds` ADD COLUMN `spell_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `builds_tier` ON `builds` (`tier`,`status`);
--> statement-breakpoint
CREATE INDEX `builds_map` ON `builds` (`map_id`,`status`);
--> statement-breakpoint
CREATE INDEX `builds_top` ON `builds` (`status`,`like_count`);
