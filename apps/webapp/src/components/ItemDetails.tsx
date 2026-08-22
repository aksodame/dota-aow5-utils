import type { ItemFull, LocaleDetail } from 'aow5-shared/types';
import type { ItemSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
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

/** Turns `bonus_attack_damage` into `Bonus attack damage` when the game has no label. */
function prettifyKey(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: number | string): string {
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h4>
      {children}
    </section>
  );
}

function StatList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-px">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-dotted py-1 text-sm">
          <dt className="min-w-0 text-muted-foreground">{label}</dt>
          <dd className="shrink-0 tabular-nums">{value}</dd>
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

  const stats: [string, string][] = full
    ? Object.entries(full.values).map(([key, value]) => [
        detail?.values?.[key] ?? prettifyKey(key),
        formatValue(value),
      ])
    : [];

  const ability = full?.ability;
  const abilityRows: [string, string][] = [];
  if (ability?.cooldown) abilityRows.push([strings.cooldown, String(ability.cooldown)]);
  if (ability?.manaCost) abilityRows.push([strings.manaCost, String(ability.manaCost)]);
  if (ability?.castRange) abilityRows.push([strings.castRange, String(ability.castRange)]);
  if (full?.timeCost) abilityRows.push([strings.craftTime, String(full.timeCost)]);

  const gemRows: [string, string][] = full?.gem
    ? Object.entries(full.gem.values).map(([k, v]) => [prettifyKey(k), formatValue(v)])
    : [];

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
            <Badge variant="outline">
              {strings.quality} {summary.quality}
            </Badge>
            <Badge variant="outline">
              {strings.cost} {summary.cost}
            </Badge>
          </div>
          <code className="block text-[11px] text-muted-foreground">{summary.id}</code>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{strings.loadingDetails}</p>}

      {detail?.desc && detail.desc.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1 text-sm leading-relaxed [&_strong]:mt-2 [&_strong]:block">
            <RichText nodes={detail.desc} />
          </div>
        </>
      )}

      {stats.length > 0 && (
        <Block title={strings.stats}>
          <StatList rows={stats} />
        </Block>
      )}

      {abilityRows.length > 0 && (
        <Block title={strings.ability}>
          <StatList rows={abilityRows} />
        </Block>
      )}

      {gemRows.length > 0 && (
        <Block title={strings.glyph}>
          <StatList rows={gemRows} />
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
