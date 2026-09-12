import { abilityIconUrl, type SpellSummary } from 'aow5-shared/data';
import type { AbilityId, AbilitySlotKey } from 'aow5-shared/types';
import { Badge, Button, Dialog, Icon, cx } from '@/ui';
import { useApp } from '@/data/AppData';
import { RichText } from './RichText';
import styles from './SpellPicker.module.css';

/**
 * Picks one ability for one key.
 *
 * Deliberately not the item picker. That one browses sixteen hundred items and
 * needs a search box and a detail pane; this one is a choice between two and
 * four candidates where the *descriptions are the decision* — so every one of
 * them is shown at once, in full, rather than hidden behind a hover on a round
 * icon. A grid of icons briefly replaced this and made the one thing worth
 * reading the one thing you could not see.
 */
interface SpellPickerProps {
  open: boolean;
  /** The key being filled, or null when nothing is being edited. */
  slot: AbilitySlotKey | null;
  /** The hero's abilities for that key. Empty only for a key they cannot fill. */
  candidates: SpellSummary[];
  currentId: AbilityId | null;
  /** True when the slot holds anything at all, including an unresolved index. */
  canClear: boolean;
  heroName: string;
  onSelect: (id: AbilityId) => void;
  onClear: () => void;
  onClose: () => void;
}

export function SpellPicker({
  open,
  slot,
  candidates,
  currentId,
  canClear,
  heroName,
  onSelect,
  onClear,
  onClose,
}: SpellPickerProps) {
  const { strings } = useApp();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        <>
          {strings.editor.pickSpell}
          {slot !== null && <Badge>{slot}</Badge>}
        </>
      }
      footer={
        <Button variant={canClear ? 'danger' : 'ghost'} disabled={!canClear} onClick={onClear}>
          {strings.editor.clearSlot}
        </Button>
      }
    >
      <p className={styles.lead}>{heroName}</p>

      {candidates.length === 0 ? (
        /*
         * Reachable when a slot holds a spell the current hero cannot offer —
         * an unresolved index from a newer deployment. Clearing must still be
         * possible, so this opens with an explanation rather than not at all.
         */
        <p className={styles.empty}>{strings.editor.noSpellsForKey}</p>
      ) : (
        <div className={styles.list}>
          {candidates.map((spell) => {
            const active = spell.id === currentId;
            return (
              <button
                key={spell.id}
                type="button"
                className={cx(styles.choice, active && styles.choiceOn)}
                aria-pressed={active}
                onClick={() => onSelect(spell.id)}
              >
                <img className={styles.icon} src={abilityIconUrl(spell.icon)} alt="" loading="lazy" decoding="async" />
                <span className={styles.body}>
                  <span className={styles.name}>
                    {spell.name}
                    {active && <Icon.Check size={15} className={styles.check} />}
                  </span>
                  {spell.text?.desc !== undefined && (
                    <span className={styles.desc}>
                      <RichText nodes={spell.text.desc} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
