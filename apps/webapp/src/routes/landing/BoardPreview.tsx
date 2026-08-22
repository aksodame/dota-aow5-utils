import type { ReactNode } from 'react';
import { ItemIcon, qualityColor } from '@/components/ItemIcon';
import { SlotRowLabel } from '@/components/SlotRowLabel';
import { ABILITY_KEYS, PREVIEW_BOARD, type ShowcaseItem } from '@/data/showcase';
import type { Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { cn } from '@/lib/utils';

/**
 * One planner section, drawn with the planner's own parts.
 *
 * `ItemIcon`, `qualityColor`, `SlotRowLabel` and `--slot-size` are the real
 * ones, imported from the components the board itself uses — so the tile size,
 * the rarity border and the row captions cannot drift away from what a visitor
 * sees one click later. Since these now live in the same app, this is a
 * preview of the actual UI rather than a picture of it.
 *
 * What it does *not* reuse is `Slot`. That is a control: it takes an `onPick`,
 * it reveals a clear button on hover, and it is a `<button>` in the tab order.
 * A preview that offered to clear a slot it does not own would be lying about
 * what it is, so the tile below is the same markup with no behaviour.
 *
 * `aria-hidden` for the same reason: the copy beside it says what the planner
 * does, and a screen reader walking fifteen decorative tiles learns nothing.
 */

function PreviewSlot({ item, lang }: { item: ShowcaseItem | null; lang: Lang }) {
  if (!item) {
    return (
      <div
        className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-background/40"
        style={{ width: 'var(--slot-size)' }}
      />
    );
  }
  return (
    <div
      className="aspect-square overflow-hidden rounded-md border-2 bg-background"
      style={{ width: 'var(--slot-size)', borderColor: qualityColor(item.quality) }}
      title={`${item.name[lang]} · ${item.cost}`}
    >
      <ItemIcon icon={item.icon} alt="" fill fit="cover" />
    </div>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <SlotRowLabel>{label}</SlotRowLabel>
      <div className="flex gap-1.5">{children}</div>
    </div>
  );
}

export function BoardPreview({ site, lang, className }: { site: SiteStrings; lang: Lang; className?: string }) {
  const t = site.preview;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'w-fit rounded-xl border bg-card p-4 text-card-foreground shadow-sm select-none',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-6 border-b pb-2">
        <span className="truncate text-sm font-medium">{t.section}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] text-secondary-foreground">1 / 9</span>
      </div>

      <div className="flex flex-col gap-2.5">
        <Row label={t.spells}>
          {ABILITY_KEYS.map((key) => (
            <span
              key={key}
              className="grid aspect-square place-items-center rounded-md border border-primary/30 bg-primary/10 text-xs font-semibold text-primary"
              style={{ width: 'calc(var(--slot-size) * 0.72)' }}
            >
              {key}
            </span>
          ))}
        </Row>

        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
          <div className="flex flex-col gap-2.5">
            <Row label={t.potions}>
              {PREVIEW_BOARD.potions.map((it, i) => (
                <PreviewSlot key={i} item={it} lang={lang} />
              ))}
            </Row>

            {/* Six equipment slots in two rows of three, as the planner lays
                them out — the group's own column count, not a guess. */}
            <div className="space-y-0.5">
              <SlotRowLabel>{t.equipment}</SlotRowLabel>
              <div
                className="grid w-fit gap-1.5"
                style={{ gridTemplateColumns: 'repeat(3, var(--slot-size))' }}
              >
                {PREVIEW_BOARD.equipment.map((it, i) => (
                  <PreviewSlot key={i} item={it} lang={lang} />
                ))}
              </div>
            </div>

            <Row label={t.runes}>
              {PREVIEW_BOARD.runes.map((it, i) => (
                <PreviewSlot key={i} item={it} lang={lang} />
              ))}
            </Row>
          </div>

          <div className="flex flex-col gap-2.5">
            <Row label={t.neutral}>
              <PreviewSlot item={PREVIEW_BOARD.neutral} lang={lang} />
            </Row>
            <Row label={t.backpack}>
              <PreviewSlot item={PREVIEW_BOARD.backpack} lang={lang} />
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}
