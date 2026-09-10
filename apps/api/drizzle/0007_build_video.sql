-- A YouTube video for the build, as an id rather than a link.
--
-- The URL somebody pastes is not what gets stored. It is reduced on the way in
-- by `core/builds/video.ts` to the two facts a page needs — which video, and
-- where to start — so nothing downstream ever puts user text into an `iframe`
-- src. Two narrow columns instead of one string that has to be re-parsed and
-- re-trusted on every render.
--
-- `''` is "no video", the same way `''` is "no referral code" and `0` is "no
-- price": one absent state per field, so nothing has to tell a null from an
-- empty one. The id is eleven characters of base64url and is validated against
-- that alphabet before it arrives here.
ALTER TABLE `builds` ADD COLUMN `video_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Seconds. `0` is the beginning, which is also what a link with no timestamp
-- means, so the two need no telling apart.
ALTER TABLE `builds` ADD COLUMN `video_start` integer DEFAULT 0 NOT NULL;
