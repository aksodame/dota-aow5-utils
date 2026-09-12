-- What the build costs to assemble, in gold.
--
-- Authored rather than derived. The site knows every item's shop cost, so a
-- sum is tempting — but a real build's cost is dominated by what its pieces
-- rolled and what they were bought for, and a number computed from base costs
-- would be confidently wrong in the one direction that matters to somebody
-- deciding whether they can afford it. The author knows what they spent.
--
-- Not folded into `payload`, for the same reason `referral` is not: the payload
-- is the shared-link codec and is never rewritten once stored, so a price
-- inside it could not be corrected without minting a new link.
--
-- The cap is four billion, enforced in application code rather than by a CHECK
-- so the number can be raised without a migration. SQLite integers are 64-bit,
-- so nothing here is near a storage limit; four billion is a limit on what is
-- *believable*, and it happens to sit just under the 4,294,967,295 an unsigned
-- 32-bit column elsewhere could hold, which keeps the door open.
--
-- NOT NULL with a default, so every existing row reads as "no price given"
-- rather than as a null nobody downstream expects. Zero is that absence: a
-- build that genuinely costs nothing does not exist in this game.
ALTER TABLE `builds` ADD COLUMN `price` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Sorting by price, cheapest or dearest first. Status leads for the same reason
-- it leads in `builds_top`: every browse query filters on it first.
CREATE INDEX `builds_price` ON `builds` (`status`,`price`);
