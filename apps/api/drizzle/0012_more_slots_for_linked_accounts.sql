-- Five builds an account, plus five for every provider linked to it.
--
-- The cap was never about storage. An account costs nothing to open, so "five
-- builds per account" is really "five builds per free account" — and somebody
-- who wants ten has always been one sign-up away from them. A linked Steam or
-- Discord account is the one scarce thing on this site, which is the same
-- argument the comment queue makes, read the other way: an author who has
-- attached one has already paid the price this cap was collecting.
--
-- The cap is structural rather than a check. Every build takes a numbered slot
-- with a partial unique index over `(user_id, slot)`, so the ceiling lives in a
-- CHECK on that column — and SQLite cannot alter a constraint in place, which
-- is why this rebuilds the table. Fifteen is the base plus both providers; the
-- *effective* limit is computed per account in the service, so linking is what
-- makes a slot reachable rather than this number.
--
-- Everything below the rebuild is recreated exactly as 0009 left it, plus
-- `main_spell` from 0011. A dropped index or a missing FTS trigger fails on the
-- next write rather than here, which is why they are copied rather than
-- remembered.
CREATE TABLE `builds_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`referral` text DEFAULT '' NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`tier` text,
	`main_spell` text,
	`video_id` text DEFAULT '' NOT NULL,
	`video_start` integer DEFAULT 0 NOT NULL,
	`codec_version` integer NOT NULL,
	`hero_id` text,
	`item_count` integer NOT NULL,
	`spell_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `builds_slot_range` CHECK(`slot` >= 0 and `slot` < 15),
	CONSTRAINT `builds_tier` CHECK(`tier` is null or `tier` in ('1','2','3','4','5','6','7','8','9','event')),
	CONSTRAINT `builds_main_spell` CHECK(`main_spell` is null or `main_spell` in ('passive','q','w','e','d','f','r'))
);
--> statement-breakpoint
INSERT INTO `builds_new` (
	`id`, `slug`, `user_id`, `slot`, `title`, `body`, `payload`, `referral`, `price`, `tier`, `main_spell`,
	`video_id`, `video_start`, `codec_version`, `hero_id`, `item_count`, `spell_count`, `status`,
	`like_count`, `comment_count`, `view_count`, `published_at`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
	`id`, `slug`, `user_id`, `slot`, `title`, `body`, `payload`, `referral`, `price`, `tier`, `main_spell`,
	`video_id`, `video_start`, `codec_version`, `hero_id`, `item_count`, `spell_count`, `status`,
	`like_count`, `comment_count`, `view_count`, `published_at`, `created_at`, `updated_at`, `deleted_at`
FROM `builds`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_ai`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_au`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `builds_fts_ad`;
--> statement-breakpoint
DROP TABLE `builds`;
--> statement-breakpoint
ALTER TABLE `builds_new` RENAME TO `builds`;
--> statement-breakpoint
CREATE UNIQUE INDEX `builds_slug` ON `builds` (`slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `builds_user_slot` ON `builds` (`user_id`,`slot`) WHERE `deleted_at` is null;
--> statement-breakpoint
CREATE INDEX `builds_browse` ON `builds` (`status`,`published_at`);
--> statement-breakpoint
CREATE INDEX `builds_user` ON `builds` (`user_id`);
--> statement-breakpoint
CREATE INDEX `builds_hero` ON `builds` (`hero_id`,`status`);
--> statement-breakpoint
CREATE INDEX `builds_tier` ON `builds` (`tier`,`status`);
--> statement-breakpoint
CREATE INDEX `builds_top` ON `builds` (`status`,`like_count`);
--> statement-breakpoint
CREATE INDEX `builds_price` ON `builds` (`status`,`price`);
--> statement-breakpoint
CREATE TRIGGER `builds_fts_ai` AFTER INSERT ON `builds` BEGIN
	INSERT INTO `builds_fts`(`rowid`, `title`, `body`) VALUES (new.`id`, new.`title`, new.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_ad` AFTER DELETE ON `builds` BEGIN
	INSERT INTO `builds_fts`(`builds_fts`, `rowid`, `title`, `body`)
		VALUES ('delete', old.`id`, old.`title`, old.`body`);
END;
--> statement-breakpoint
CREATE TRIGGER `builds_fts_au` AFTER UPDATE ON `builds` BEGIN
	INSERT INTO `builds_fts`(`builds_fts`, `rowid`, `title`, `body`)
		VALUES ('delete', old.`id`, old.`title`, old.`body`);
	INSERT INTO `builds_fts`(`rowid`, `title`, `body`) VALUES (new.`id`, new.`title`, new.`body`);
END;
--> statement-breakpoint
-- Rebuilt rather than assumed: the rows moved into a new table, and a stale
-- index shows search results for builds that are not there.
INSERT INTO `builds_fts`(`builds_fts`) VALUES('rebuild');
