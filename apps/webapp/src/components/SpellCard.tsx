import type { ReactNode } from 'react';
import { abilityIconUrl, type SpellSummary } from 'aow5-shared/data';
import { useApp } from '@/data/AppData';
import { affectsFrom, behaviorFromFlags } from '@/lib/itemStats';
import { splitDescription } from '@/lib/richDesc';
import { Icon } from '@/ui';
import { RichText } from './RichText';
import styles from './ItemCard.module.css';
import spell from './SpellCard.module.css';

/**
 * An ability, drawn the way the game draws it. Sibling of `ItemCard`.
 *
 * Shares that card's stylesheet for everything the two have in common — the
 * header band, the run-in facts, the boxed description — because they *are*
 * the same card with a different middle, and two copies of those rules is how
 * they drift apart. Only the parts unique to an ability live in this file's own
 * module: the slot chip and the cooldown/mana/range row.
 *
 * Everything here is already in `heroes.json`, which is loaded before the first
 * paint. Unlike an item, an ability needs no second fetch — so this card is
 * never in a loading state.
 */
export function SpellCard({ ability }: { ability: SpellSummary }) {
  const { strings } = useApp();
  const t = strings.item;

  const behavior = behaviorFromFlags(ability.behavior);
  const affects = affectsFrom(ability.targetTeam, ability.targetType);
  const sections = splitDescription(ability.text?.desc);
  const reach = reachOf(ability);

  /*
   * The three numbers, as a list, so the row is drawn only when it has
   * something in it.
   *
   * Tested one by one before, against `!== undefined` — but the data carries an
   * explicit `0` for an ability that costs nothing, so a passive passed the
   * outer check and then failed all three inner ones. The result was an empty
   * `.costs` div: no numbers, and the rule above them left hanging under the
   * description like a section that had lost its contents.
   */
  const costs: Array<{ key: string; icon: ReactNode; label: string; value: number }> = [];
  if (ability.cooldown !== undefined && ability.cooldown > 0) {
    costs.push({ key: 'cd', icon: <Icon.Hourglass size={14} className={spell.cooldownIcon} />, label: t.cooldown, value: ability.cooldown });
  }
  if (ability.manaCost !== undefined && ability.manaCost > 0) {
    costs.push({ key: 'mana', icon: <Icon.Droplet size={14} className={spell.manaIcon} />, label: t.manaCost, value: ability.manaCost });
  }
  if (reach !== null) {
    costs.push({ key: 'range', icon: <Icon.Crosshair size={14} className={spell.rangeIcon} />, label: t.castRange, value: reach });
  }

  /*
   * The game's own line is the tag list — "Active / Damage" — and falls back to
   * what the behaviour flags say for an ability the data left untagged.
   */
  const kind =
    ability.tags !== undefined && ability.tags.length > 0
      ? ability.tags.map(capitalise).join(' / ')
      : behavior !== null
        ? t.behavior[behavior]
        : null;

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <div className={spell.art}>
          <img src={abilityIconUrl(ability.icon)} alt="" loading="lazy" decoding="async" />
        </div>

        <div className={styles.identity}>
          <div className={styles.titleRow}>
            <h3 className={styles.name}>{ability.name}</h3>
            <span className={styles.id}>{ability.id}</span>
          </div>
          {/* The key it is bound to, which is the one thing a build page knows
              about an ability that the ability itself does not. */}
          <span className={spell.slot}>{ability.slot}</span>
        </div>
      </header>

      <div className={styles.body}>
        {(kind !== null || affects !== null) && (
          <div>
            {kind !== null && (
              <p className={styles.fact}>
                {t.skill}
                {t.colon}
                <span>{kind}</span>
              </p>
            )}
            {affects !== null && (
              <p className={styles.fact}>
                {t.affects}
                {t.colon}
                <span>{t.affectsLabel(affects.team, affects.scope)}</span>
              </p>
            )}
          </div>
        )}

        {sections.length > 0 && (
          <div className={styles.desc}>
            {sections.map((section, i) =>
              section.heading !== null ? (
                <div key={i} className={styles.descBox}>
                  <p className={styles.descHeading}>
                    <RichText nodes={section.heading} />
                  </p>
                  {section.body.length > 0 && (
                    <div className={styles.descBody}>
                      <RichText nodes={section.body} />
                    </div>
                  )}
                </div>
              ) : (
                <div key={i} className={styles.descBody}>
                  <RichText nodes={section.body} />
                </div>
              ),
            )}
          </div>
        )}

        {/*
          The numbers a player checks before pressing the key, as icons rather
          than labels: they are the same few on every ability, so the shape is
          recognised faster than the words are read. The words are on the
          `title`, for anyone who does not recognise them.
        */}
        {costs.length > 0 && (
          <div className={spell.costs}>
            {costs.map((cost) => (
              <span key={cost.key} title={cost.label}>
                {cost.icon}
                {cost.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The distance an ability works over.
 *
 * Its cast range when it has one, and otherwise a radius out of its own values:
 * Stifling Dagger throws at everything within 750 units and declares no range
 * at all, and the game shows that radius in the place a targeted spell shows
 * its range.
 */
function reachOf(ability: SpellSummary): number | null {
  if (ability.castRange !== undefined && ability.castRange > 0) return ability.castRange;
  for (const key of ['search_radius', 'ability_radius', 'radius']) {
    const value = ability.values?.[key];
    if (typeof value === 'number' && value > 0) return value;
  }
  return null;
}
