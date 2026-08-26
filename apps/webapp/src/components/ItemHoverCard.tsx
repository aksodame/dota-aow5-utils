import { Coins } from 'lucide-react';
import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import type { ItemSummary } from 'aow5-shared/data';
import { rarityLabel, type Strings } from '@/i18n/strings';
import { affectsOf, behaviorOf, gemRows, hasNamedSkill, statRows, type StatRow } from '@/lib/itemStats';
import { splitDescription } from '@/lib/richDesc';
import { GameBlock, GameCard, GameCardBody, GameCardHeader, GameDescription, GameFact } from './GameTooltip';
import { ItemIcon, qualityColor } from './ItemIcon';

interface Props {
  summary: ItemSummary;
  full: ItemFull | undefined;
  detail: LocaleDetail | undefined;
  /** Every item by id, for naming the parts of a recipe. */
  names: Map<string, ItemSummary>;
  strings: Strings;
  loading: boolean;
}

/**
 * An item as the game itself draws it: a dark card, the stats in a column, and
 * the passive last, under its own heading.
 */
export function ItemHoverCard({ summary, full, detail, names, strings, loading }: Props) {
  const stats = statRows(full, detail);
  const gem = gemRows(full);
  // Only for an item that actually has a skill: see `hasNamedSkill`.
  const named = hasNamedSkill(full, detail);
  const behavior = named ? behaviorOf(full) : null;
  const affects = named ? affectsOf(full) : null;

  const ability = full?.ability;
  const meta: string[] = [];
  if (ability?.cooldown) meta.push(`${strings.cooldown} ${ability.cooldown}`);
  if (ability?.manaCost) meta.push(`${strings.manaCost} ${ability.manaCost}`);
  if (ability?.castRange) meta.push(`${strings.castRange} ${ability.castRange}`);
  if (full?.timeCost) meta.push(`${strings.craftTime} ${full.timeCost}`);

  const sections = splitDescription(detail?.desc);

  return (
    <GameCard>
      <GameCardHeader>
        {/*
          A fixed square that the art fills, rather than an image the box has to
          size itself around: the frame is then the same 54px whatever the
          source aspect ratio is, and nothing about the header's layout can
          stretch it. `fill` drops the image's own width and height, which is
          what lets it reach the frame's inner edge on every side.
        */}
        <div
          className="size-[54px] shrink-0 overflow-hidden rounded border-2 bg-black/40"
          style={{ borderColor: qualityColor(summary.quality) }}
        >
          <ItemIcon icon={summary.icon} alt="" fill fit="cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] leading-tight font-bold tracking-wide text-white uppercase">
              {summary.name}
            </h3>
            <div className="shrink-0 text-right text-[10px] leading-tight text-[#8fa0bb]">
              <div className="whitespace-nowrap">
                {strings.level} {summary.level}
              </div>
              <div className="font-mono">{summary.id}</div>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className="rounded-sm px-1.5 py-px text-[10px] font-semibold text-white uppercase"
              style={{ backgroundColor: qualityColor(summary.quality) }}
            >
              {rarityLabel(strings, summary.quality)}
            </span>
            <span className="rounded-sm bg-white/10 px-1.5 py-px text-[10px] font-medium text-[#c3cddf] uppercase">
              {summary.type}
            </span>
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#f0c14b] tabular-nums">
            <Coins className="size-3.5" aria-hidden />
            {summary.cost}
          </p>
        </div>
      </GameCardHeader>

      <GameCardBody>
        {(behavior || affects) && (
          <div className="space-y-0.5">
            {behavior && <GameFact label={`${strings.skill}${strings.colon}`}>{strings.behavior[behavior]}</GameFact>}
            {affects && (
              <GameFact label={`${strings.affects}${strings.colon}`}>{strings.affectsLabel(affects.team, affects.scope)}</GameFact>
            )}
          </div>
        )}

        {loading && <p className="text-[12px] text-[#7f96b2]">{strings.loadingDetails}</p>}

        {stats.length > 0 && <StatList rows={stats} />}

        {meta.length > 0 && <p className="text-[11px] text-[#7f96b2]">{meta.join(' · ')}</p>}

        {sections.length > 0 && <GameDescription sections={sections} />}

        {gem.length > 0 && (
          <GameBlock title={strings.glyph}>
            <StatList rows={gem} />
          </GameBlock>
        )}

        {full && full.needs.length > 0 && (
          <GameBlock title={strings.recipe}>
            <ul className="grid gap-1">
              {full.needs.map((need) => {
                const ing = names.get(need.id);
                return (
                  <li key={need.id} className="flex items-center gap-2 text-[12px]">
                    {ing && (
                      <ItemIcon icon={ing.icon} alt="" size={20} fit="cover" className="block rounded-sm" />
                    )}
                    <span className="min-w-0 truncate">{ing?.name ?? need.id}</span>
                    {need.count > 1 && <span className="text-[#7f96b2] tabular-nums">×{need.count}</span>}
                  </li>
                );
              })}
            </ul>
          </GameBlock>
        )}

        {full && full.usedBy.length > 0 && (
          <GameBlock title={strings.usedIn(full.usedBy.length)}>
            <p className="text-[11px] text-[#8fa0bb]">
              {full.usedBy
                .slice(0, 6)
                .map((id) => names.get(id)?.name ?? id)
                .join(', ')}
              {full.usedBy.length > 6 ? ' …' : ''}
            </p>
          </GameBlock>
        )}

        {full?.tags && full.tags.length > 0 && (
          <GameBlock title={strings.tags}>
            <div className="flex flex-wrap gap-1">
              {full.tags.map((t) => (
                <span key={t} className="rounded-sm bg-white/10 px-1.5 py-px text-[10px] text-[#a9bdd6]">
                  {t}
                </span>
              ))}
            </div>
          </GameBlock>
        )}

        {detail?.lore && <p className="text-[11px] leading-relaxed text-[#7f96b2] italic">{detail.lore}</p>}
      </GameCardBody>
    </GameCard>
  );
}

function StatList({ rows }: { rows: StatRow[] }) {
  return (
    <ul className="space-y-0.5">
      {rows.map((row) => (
        <li key={row.key} className="flex gap-2 text-[13px] leading-snug">
          <span className="shrink-0 font-semibold text-[#a68bfa] tabular-nums">{row.value}</span>
          <span className="min-w-0 text-[#e0e7f4]">{row.label}</span>
        </li>
      ))}
    </ul>
  );
}
