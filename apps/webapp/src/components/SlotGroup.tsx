import type { BuildSection, SlotGroup as SlotGroupDef } from 'aow5-shared/codec';
import type { ItemSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import { Slot } from './Slot';
import { SlotRowLabel } from './SlotRowLabel';

interface Props {
  group: SlotGroupDef;
  section: BuildSection;
  sectionName: string;
  byId: Map<string, ItemSummary>;
  strings: Strings;
  onPickSlot: (slot: number) => void;
  onClearSlot: (slot: number) => void;
}

/**
 * One typed run of slots inside a section — the potion row, the equipment
 * block, the single pet slot, and so on. Each carries a small label so the
 * restriction is visible before you click.
 */
export function SlotGroup({ group, section, sectionName, byId, strings, onPickSlot, onClearSlot }: Props) {
  const label = strings.slotGroup[group.key];

  return (
    <div className="space-y-0.5">
      <SlotRowLabel>{label}</SlotRowLabel>
      {/* Fixed-width columns: tiles keep their size whatever the card does. */}
      <div
        className="grid w-fit gap-1.5"
        style={{ gridTemplateColumns: `repeat(${group.columns}, var(--slot-size))` }}
      >
        {Array.from({ length: group.count }, (_, i) => {
          const slot = group.start + i;
          const value = section.slots[slot] ?? null;
          return (
            <Slot
              key={slot}
              value={value}
              item={value?.k === 'id' ? byId.get(value.id) : undefined}
              sectionName={sectionName}
              slotLabel={group.count > 1 ? `${label} ${i + 1}` : label}
              strings={strings}
              onPick={() => onPickSlot(slot)}
              onClear={() => onClearSlot(slot)}
            />
          );
        })}
      </div>
    </div>
  );
}
