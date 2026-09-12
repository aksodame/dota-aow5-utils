/**
 * The three facts the old model never stored, worked out from what it did.
 *
 * A v6 board carried a hero, some items and a name per section. The new one
 * files a build under a **tier** and states a **price**, and refuses to publish
 * without either — so an import has to produce both from text an author wrote
 * for a different purpose. That is guesswork, and this file is where all of it
 * is, so the guessing is reviewable in one place rather than spread through the
 * importer.
 *
 * Both readings are deliberately conservative: when the text does not say,
 * these return null and the importer files that guide as a draft for a human
 * to finish, rather than inventing a tier nobody claimed.
 */

/** The tiers a build may be filed under, matching `TierKey` in the shared data. */
export type Tier = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'event';

/**
 * Folds the Cyrillic `т` onto `t`, and nothing else.
 *
 * Most of these guides are Russian, and `Т8 Хард` is the same heading as
 * `T8 Hard` written with a Cyrillic Т — a different code point that looks
 * identical. Folding it is the difference between reading two thirds of the
 * section names and reading almost all of them.
 *
 * Only that one letter. An earlier version folded the whole lookalike set
 * (`е о а с р`) on the theory that more folding could only help, and it broke
 * the event words below: `небопад` came out as `нeбoпaд` and stopped matching
 * itself, so every Skyfall section was read as having no tier at all. The tier
 * patterns need exactly one letter folded, so exactly one is folded.
 */
function fold(text: string): string {
  return text.toLowerCase().replaceAll('т', 't');
}

/**
 * Words that mean the endless mode rather than a numbered tier.
 *
 * `небопад` is Skyfall, which the site files as event content — see the tier
 * overrides in the shared data, where Skyfall Realm is `event` despite the
 * game calling it tier 9. So these win over a numeral in the same heading:
 * `T9 ONE ENDLESS` is endless content, and the 9 is the author describing
 * where it sits on the ladder rather than which filter should find it.
 */
const EVENT_WORDS = ['endless', 'небопад', 'skyfall', 'бесконечн', '无尽'];

/**
 * The tier a heading is about, or null when it does not say.
 *
 * A heading naming a span — `t4-t5`, `T1-T7 Speedrun`, `Map 1-4` — resolves to
 * the **lowest** tier in it: that is the one a reader needs the build to work
 * at, since the span describes what it carries you through rather than where it
 * ends up.
 */
export function tierFromText(raw: string | null | undefined): Tier | null {
  if (!raw) return null;
  const text = fold(raw);

  if (EVENT_WORDS.some((word) => text.includes(word))) return 'event';

  const found: number[] = [];

  // `t5`, `t 5`, `т8 хард` — the ordinary form, and the one almost every
  // section name uses.
  for (const match of text.matchAll(/\bt\s*([1-9])\b/g)) {
    found.push(Number(match[1]));
  }

  // `Map 1-4 Scenario`. A room in this game belongs to exactly one tier, so an
  // author numbering maps is numbering tiers.
  for (const match of text.matchAll(/\bmaps?\s*([1-9])\s*[-–—]\s*([1-9])\b/g)) {
    found.push(Number(match[1]), Number(match[2]));
  }

  if (found.length === 0) return null;
  return String(Math.min(...found)) as Tier;
}

/**
 * The tier for one section: its own heading first, then the guide's title.
 *
 * The section heading is the better source — a guide called `Фантомка т4-т5-т6`
 * has one section per tier, and reading the title for all three would file them
 * together under 4.
 */
export function tierForSection(sectionName: string | null, buildTitle: string): Tier | null {
  return tierFromText(sectionName) ?? tierFromText(buildTitle);
}

/** What a section's tier was read from, so the import can report its guesses. */
export type TierSource = 'section' | 'title' | 'carried' | 'none';

export interface SectionTier {
  tier: Tier | null;
  source: TierSource;
}

/**
 * Tiers for a whole board, letting a section inherit from the one before it.
 *
 * A multi-section guide is almost always a progression — `t5 хард`, `t6 hard`,
 * `t7 Hard`, `One shot`, `endless 51 wave` — where one heading in the middle
 * describes the *variant* rather than the tier and the reader is expected to
 * still be on the previous one. Carrying the last known tier forward reads
 * those the way a person does.
 *
 * **Forward only, never backward.** Reaching backward would be the same
 * argument and it is wrong: one guide here runs five untitled sections and
 * finishes with `3 небопад 1 раз`, and letting that last heading's `event`
 * flow back would file the whole progression as endless content. A section
 * with nothing before it to inherit keeps `null`, and the importer files it as
 * a draft rather than inventing an answer.
 */
export function tiersForBoard(
  sectionNames: readonly (string | null)[],
  buildTitle: string,
): SectionTier[] {
  const out: SectionTier[] = [];
  let carried: Tier | null = null;

  for (const name of sectionNames) {
    const own = tierFromText(name);
    if (own !== null) {
      carried = own;
      out.push({ tier: own, source: 'section' });
      continue;
    }
    const fromTitle = tierFromText(buildTitle);
    if (fromTitle !== null) {
      carried = fromTitle;
      out.push({ tier: fromTitle, source: 'title' });
      continue;
    }
    out.push(carried === null ? { tier: null, source: 'none' } : { tier: carried, source: 'carried' });
  }

  return out;
}

/**
 * What the gear in a section costs at shop prices.
 *
 * An **under**-estimate, and knowably so: the site's own note on the column
 * says a real build's price is dominated by what its pieces rolled and what
 * those went for, not by base cost. It is still the only figure derivable from
 * the data, it is different for every build, and it orders builds roughly the
 * way their real prices do — which is what the browse page's price sort needs.
 *
 * Slots holding an index this deployment cannot name contribute nothing, since
 * there is no item to read a cost from.
 */
export function priceOfSlots(
  slots: readonly ({ k: 'id'; id: string } | { k: 'unknown'; idx: number } | null)[],
  costOf: (id: string) => number,
): number {
  let total = 0;
  for (const slot of slots) {
    if (slot?.k !== 'id') continue;
    total += costOf(slot.id);
  }
  return total;
}
