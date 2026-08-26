import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import type { ItemSummary } from 'aow5-shared/data';
import { rarityLabel, type Strings } from '@/i18n/strings';
import { affectsOf, behaviorOf, gemRows, hasNamedSkill, statRows, type StatRow } from '@/lib/itemStats';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ItemIcon, qualityColor } from './ItemIcon';
import { RichText } from './RichText';

interface Props {
  summary: ItemSummary | null;
  full: ItemFull | undefined;
  detail: LocaleDetail | undefined;
  names: Map<string, ItemSummary>;
  strings: Strings;
  loading: boolean;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}

function StatList({ rows }: { rows: StatRow[] }) {
  return (
    <dl className="grid gap-px">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 border-b border-dotted py-1 text-sm">
          <dt className="min-w-0 text-muted-foreground">{row.label}</dt>
          <dd className="shrink-0 tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ItemDetails({ summary, full, detail, names, strings, loading }: Props) {
  if (!summary) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        {strings.detailsHint}
      </div>
    );
  }

  const stats = statRows(full, detail);
  const gem = gemRows(full);
  const named = hasNamedSkill(full, detail);
  const behavior = named ? behaviorOf(full) : null;
  const affects = named ? affectsOf(full) : null;

  const ability = full?.ability;
  const abilityRows: StatRow[] = [];
  if (ability?.cooldown)
    abilityRows.push({ key: 'cooldown', label: strings.cooldown, value: String(ability.cooldown) });
  if (ability?.manaCost)
    abilityRows.push({ key: 'manaCost', label: strings.manaCost, value: String(ability.manaCost) });
  if (ability?.castRange)
    abilityRows.push({ key: 'castRange', label: strings.castRange, value: String(ability.castRange) });
  if (full?.timeCost) abilityRows.push({ key: 'craftTime', label: strings.craftTime, value: String(full.timeCost) });
  // The numbers the description interpolates. Out of the stat block, where
  // they read as extra bonuses, but kept here — this pane is the inspector.
  abilityRows.push(...statRows(full, detail, 'tuning'));

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <ItemIcon icon={summary.icon} alt="" size={56} />
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-base leading-tight font-semibold" style={{ color: qualityColor(summary.quality) }}>
            {summary.name}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{summary.type}</Badge>
            <Badge variant="outline">
              {strings.level} {summary.level}
            </Badge>
            <Badge variant="outline" style={{ color: qualityColor(summary.quality) }}>
              {rarityLabel(strings, summary.quality)}
            </Badge>
            <Badge variant="outline">
              {strings.cost} {summary.cost}
            </Badge>
          </div>
          <code className="block text-[11px] text-muted-foreground">{summary.id}</code>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{strings.loadingDetails}</p>}

      {stats.length > 0 && (
        <Block title={strings.stats}>
          <StatList rows={stats} />
        </Block>
      )}

      {(behavior || affects) && (
        <p className="text-sm text-muted-foreground">
          {behavior && (
            <>
              {strings.skill}
              {strings.colon}
              {strings.behavior[behavior]}
            </>
          )}
          {behavior && affects && ' · '}
          {affects && (
            <>
              {strings.affects}
              {strings.colon}
              {strings.affectsLabel(affects.team, affects.scope)}
            </>
          )}
        </p>
      )}

      {abilityRows.length > 0 && (
        <Block title={strings.ability}>
          <StatList rows={abilityRows} />
        </Block>
      )}

      {/* Last, under its own heading, the way the game prints it. */}
      {detail?.desc && detail.desc.length > 0 && (
        <>
          <Separator />
          <div className="text-sm leading-relaxed [&_[data-rich=h1]]:mt-2">
            <RichText nodes={detail.desc} />
          </div>
        </>
      )}

      {gem.length > 0 && (
        <Block title={strings.glyph}>
          <StatList rows={gem} />
        </Block>
      )}

      {full && full.needs.length > 0 && (
        <Block title={strings.recipe}>
          <ul className="grid gap-1">
            {full.needs.map((need) => {
              const ing = names.get(need.id);
              return (
                <li key={need.id} className="flex items-center gap-2 text-sm">
                  {ing && <ItemIcon icon={ing.icon} alt="" size={22} />}
                  <span className="min-w-0 truncate">{ing?.name ?? need.id}</span>
                  {need.count > 1 && <span className="text-muted-foreground tabular-nums">×{need.count}</span>}
                </li>
              );
            })}
          </ul>
        </Block>
      )}

      {full && full.usedBy.length > 0 && (
        <Block title={strings.usedIn(full.usedBy.length)}>
          <p className="text-xs text-muted-foreground">
            {full.usedBy
              .slice(0, 8)
              .map((id) => names.get(id)?.name ?? id)
              .join(', ')}
            {full.usedBy.length > 8 ? ' …' : ''}
          </p>
        </Block>
      )}

      {full?.tags && full.tags.length > 0 && (
        <Block title={strings.tags}>
          <div className="flex flex-wrap gap-1.5">
            {full.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        </Block>
      )}

      {detail?.lore && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground italic">{detail.lore}</p>
        </>
      )}
    </div>
  );
}
