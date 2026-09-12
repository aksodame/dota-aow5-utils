-- Comments from unverified accounts wait for a moderator.
--
-- "Verified" here means one thing: the account has a Steam or Discord identity
-- linked to it. That is not a claim about the person — it is a claim about the
-- cost of becoming a *second* person, which is the whole of what moderation at
-- this size is defending against. A local nickname and password can be minted
-- in a second; a second Steam account cannot.
--
-- Held rather than hidden. `approved_at` is null while a comment waits, and the
-- listing shows it to its author the entire time, so nobody is left wondering
-- whether their comment posted. Everybody else sees the thread without it.
--
-- Every comment that already exists is approved: this rule is new, and applying
-- it backwards would silently retract things people have already read.
ALTER TABLE `comments` ADD COLUMN `approved_at` integer;
--> statement-breakpoint
UPDATE `comments` SET `approved_at` = `created_at`;
--> statement-breakpoint
-- The moderation queue's own query: everything still waiting, oldest first.
CREATE INDEX `comments_pending` ON `comments` (`approved_at`, `created_at`);
