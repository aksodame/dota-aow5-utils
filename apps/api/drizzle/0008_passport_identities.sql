-- Three ways in: a password here, Steam, or Discord.
--
-- This table has now been Steam-only (0000), local-only (0003) and Steam-only
-- again (0005), and each of those swaps was a destructive migration for the
-- same structural reason: the proof of identity was welded to the person. A
-- SteamID cannot become a password, so 0003 deleted every account; a password
-- cannot become a SteamID, so 0005 deleted them again.
--
-- This one separates the two for good. `users` is the person — their name,
-- their avatar, their role, their builds. `identities` is one row per external
-- account that vouches for them. Local credentials stay on `users` because a
-- password is not an account elsewhere: there is no external id to key it by,
-- and the lockout counters belong to the person being attacked.
--
-- **Nothing is deleted this time.** Every existing account keeps its id, and so
-- keeps its builds, its comments and its likes: the Steam column becomes an
-- `identities` row pointing at the same user. That is the whole argument for
-- the shape, demonstrated on the first migration that uses it.
--
-- Hand-written, like every migration here. Drizzle's migrator wraps all pending
-- statements in one transaction, where `PRAGMA foreign_keys` is a documented
-- no-op — so the table rebuild below must not rely on it being off. It does
-- not: `sessions`, `builds`, `likes` and `comments` reference `users(id)` by
-- name, ids are preserved exactly, and the new table is in place before
-- anything can look for it.

-- The external accounts, before anything moves.
CREATE TABLE `identities` (
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `provider_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `identities_provider` CHECK(`provider` in ('steam', 'discord'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identities_user_provider` ON `identities` (`user_id`,`provider`);
--> statement-breakpoint

-- Every Steam account there is, moved rather than dropped. `persona` becomes
-- the identity's label; the user keeps it as their display name below.
INSERT INTO `identities` (`provider`, `provider_id`, `user_id`, `label`, `created_at`, `updated_at`)
SELECT 'steam', `steam_id`, `id`, `persona`, `created_at`, `updated_at` FROM `users`;
--> statement-breakpoint

-- SQLite cannot drop a column that a unique index covers, so `users` is
-- rebuilt. The new row is the old one with `steam_id` gone, `persona` renamed
-- to `nickname`, and the local-credential columns added as NULL — which is
-- exactly what "this account has no password yet" means.
CREATE TABLE `users_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nickname` text NOT NULL,
	`nickname_key` text,
	`password_hash` text,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`avatar` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`banned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `users_role` CHECK(`role` in ('user', 'admin')),
	-- A password with no name to sign in under, or a name with no password, is
	-- an account nobody can use. They are written together; this makes that
	-- structural rather than remembered.
	CONSTRAINT `users_local_pair` CHECK((`nickname_key` is null) = (`password_hash` is null))
);
--> statement-breakpoint
INSERT INTO `users_new` (`id`, `nickname`, `avatar`, `role`, `banned_at`, `created_at`, `updated_at`)
SELECT `id`, `persona`, `avatar`, `role`, `banned_at`, `created_at`, `updated_at` FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint

-- Partial, so the accounts with no local credentials do not collide on a shared
-- NULL. SQLite already treats NULLs as distinct here; the predicate says why
-- the column is nullable rather than leaving the next reader to work it out.
CREATE UNIQUE INDEX `users_nickname_key` ON `users` (`nickname_key`) WHERE `nickname_key` is not null;
