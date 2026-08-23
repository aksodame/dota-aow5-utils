CREATE TABLE `builds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`user_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`payload` text NOT NULL,
	`codec_version` integer NOT NULL,
	`hero_id` text,
	`section_count` integer NOT NULL,
	`item_count` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`dislike_count` integer DEFAULT 0 NOT NULL,
	`comment_count` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "builds_slot_range" CHECK("builds"."slot" >= 0 and "builds"."slot" < 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `builds_slug` ON `builds` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `builds_user_slot` ON `builds` (`user_id`,`slot`) WHERE "builds"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `builds_browse` ON `builds` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `builds_user` ON `builds` (`user_id`);--> statement-breakpoint
CREATE INDEX `builds_hero` ON `builds` (`hero_id`,`status`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`build_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_thread` ON `comments` (`build_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_id` text NOT NULL,
	`persona` text NOT NULL,
	`avatar_url` text NOT NULL,
	`profile_url` text NOT NULL,
	`profile_synced_at` integer NOT NULL,
	`steam_created_at` integer,
	`role` text DEFAULT 'user' NOT NULL,
	`banned_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_steam_id` ON `users` (`steam_id`);--> statement-breakpoint
CREATE TABLE `votes` (
	`build_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`build_id`, `user_id`),
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "votes_value" CHECK("votes"."value" in (-1, 1))
);
