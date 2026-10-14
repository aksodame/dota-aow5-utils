import { Panel } from '@/ui';
import { useApp } from '@/data/AppData';
import {
  attributeBonus,
  type AttrTriple,
  type DerivedKey,
  type HeroStatsEntry,
  type HeroStatsFile,
  type LevelStats,
  type ProgressionLocale,
} from 'aow5-shared/wiki';
import { useWikiStrings } from '../../i18n';
import { CALC } from '../../i18n/calc';
import { DataTable, num } from '../../kit';
import { PANEL_KEYS } from './model';
import styles from '../CalcPage.module.css';

/** Derived rows of the explanation: panel key, decimals, the hero kv field, the node stat that adds to it. */
const DERIVED_ROWS: ReadonlyArray<[key: DerivedKey | 'bonus_movespeed', dec: number, kv: keyof HeroStatsEntry['kv'], node: string]> = [
  ['bonus_health', 0, 'health', 'base_health'],
  ['health_regen', 1, 'healthRegen', 'health_regen'],
  ['bonus_mana', 1, 'mana', 'base_mana'],
  ['mana_regen', 2, 'manaRegen', 'mana_regen'],
  ['bonus_attack_damage', 1, 'attackDamage', 'base_attack_damage'],
  ['attack_speed', 1, 'attackSpeed', 'attack_speed'],
  ['bonus_armor', 1, 'armor', 'base_armor'],
  ['base_magic_resistance', 1, 'magicResistance', 'base_magic_resistance'],
  ['bonus_movespeed', 0, 'movementSpeed', 'base_movespeed'],
];

const ATTR_NODE: Record<keyof AttrTriple, string> = { str: 'base_strength', agi: 'base_agility', int: 'base_intelligence' };

/**
 * "Where the base comes from": every number behind the base column, so a
 * reader can check it against their own hero — attributes from level 1 up,
 * the derived stats from the game's flat values, the trees counted, what the
 * nodes give that the panel does not show, and what is not modelled at all.
 */
export function HeroBase({
  file,
  short,
  level,
  heroName,
  prog,
  base,
}: {
  file: HeroStatsFile;
  short: string;
  level: LevelStats | undefined;
  heroName: string;
  prog: ProgressionLocale | null;
  /** Manual overrides: the total column follows them, as the panel does. */
  base: Record<string, number>;
}) {
  const t = useWikiStrings(CALC);
  const tb = t.base;
  const { lang } = useApp();
  const h = file.heroes[short];
  const n = (v: number, d = 2) => num(v, lang, d);

  if (h === undefined || level === undefined) {
    return (
      <Panel title={tb.title}>
        <p className={styles.hint}>{tb.noData}</p>
      </Panel>
    );
  }

  const trees = [h.tree, ...file.commonTrees];
  const S: Record<string, number> = {};
  for (const id of trees) for (const [k, v] of Object.entries(file.treeStats[id] ?? {})) S[k] = (S[k] ?? 0) + v;
  const T = (k: string) => S[k] ?? 0;
  const L = level.level - 1;
  const nodes = trees.reduce((sum, id) => sum + (file.treeNodes[id] ?? 0), 0);
  const tierGrowth: AttrTriple = { str: 0, agi: 0, int: 0 };
  for (const tier of h.tiers) for (const a of ['str', 'agi', 'int'] as const) tierGrowth[a] += tier.growth[a];
  const triple = (x: AttrTriple, d = 2) => `${n(x.str, d)}/${n(x.agi, d)}/${n(x.int, d)}`;
  const label = (k: string) => (prog?.panel[k] ?? prog?.stats[k] ?? t.statNames[k] ?? k).replace(/^[\s%+]+/, '');
  const bonus = attributeBonus(level.attrs, h.primary, file.attrBonus);

  const attrRows = (['str', 'agi', 'int'] as const).map((a) => {
    const tree = T(ATTR_NODE[a]) + T('base_all_stats');
    const all = T('base_all_stats');
    return [
      t.attr[a],
      n(h.base[a], 1),
      `+${n(L * (h.growth[a] + tierGrowth[a]), 1)}`,
      tierGrowth[a] ? `+${n(tierGrowth[a] * L, 1)}` : '—',
      tree ? `+${n(tree, 0)}${all ? ` ${tb.toAll(n(all, 0))}` : ''}` : '—',
      level.pct[a] ? `+${n(level.pct[a], 0)}%` : '—',
      n(level.attrs[a], 1),
    ];
  });

  const derivedRows = DERIVED_ROWS.map(([key, dec, kv, node]) => {
    const der = key === 'bonus_movespeed' ? undefined : level.derived[key];
    const fromAttrs = der !== undefined && key !== 'bonus_movespeed' ? der.mult * bonus[key] : null;
    const mult = der !== undefined && der.mult !== 1 ? der.mult : key === 'bonus_movespeed' ? 1 + T('bonus_movespeed_pct') / 100 : null;
    const value = base[key] ?? level.totals[key];
    return [
      t.rows[key] ?? key,
      n(h.kv[kv], dec),
      T(node) ? `+${n(T(node), dec)}` : '—',
      fromAttrs !== null ? `+${n(fromAttrs, dec)}` : '—',
      mult !== null ? `×${n(mult, 2)}` : '—',
      n(value, dec),
    ];
  });

  const unused = Object.entries(level.rest)
    .filter(([k, v]) => v !== 0 && !PANEL_KEYS.has(k))
    .sort((a, b) => b[1] - a[1]);

  const s3Only = !h.seasons.includes(file.season);

  return (
    <Panel title={tb.title}>
      <div className={styles.baseBody}>
        <p className={styles.hint}>
          {tb.summary({
            hero: heroName,
            level: level.level,
            base: triple(h.base),
            growth: triple(h.growth),
            tiers: h.tiers.length,
            nodes,
          })}
        </p>
        {h.tiers.length > 0 && (
          <p className={styles.hint}>
            <b>{tb.tiersLead}</b>{' '}
            {h.tiers
              .map((tier) =>
                tb.tier(
                  prog?.tiers[`${h.hero}_tier_${tier.tier}`]?.name ?? `#${tier.tier}`,
                  tier.heroLevel,
                  n(tier.growth.str),
                  n(tier.growth.agi),
                  n(tier.growth.int),
                ),
              )
              .join('; ')}
            .
          </p>
        )}

        <DataTable compact head={tb.attrHead(L)} rows={attrRows} numeric={[1, 2, 3, 4, 5, 6]} />
        <DataTable compact head={tb.derivedHead} rows={derivedRows} numeric={[1, 2, 3, 4, 5]} />

        <div className={styles.sub}>{tb.treesTitle}</div>
        <div className={styles.chips}>
          {trees.map((id) => {
            const stats = Object.entries(file.treeStats[id] ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([k, v]) => `${label(k)} +${n(v)}`)
              .join(', ');
            return (
              <span key={id} className={id === h.tree ? styles.treeOwn : styles.tree} title={stats || tb.treeNoStats}>
                {tb.treeChip(prog?.trees[id] ?? id, id, file.treeNodes[id] ?? 0)}
              </span>
            );
          })}
        </div>

        {unused.length > 0 && (
          <p className={styles.hint}>
            <b>{tb.unusedLead}</b> {unused.map(([k, v]) => `${label(k)} +${n(v)}`).join(', ')}.
          </p>
        )}

        <div className={styles.sub}>{tb.notesTitle}</div>
        <ul className={styles.notes}>
          <li>{h.vanillaTalents.length ? tb.vanilla(h.vanillaTalents.length) : tb.vanillaNone}</li>
          {s3Only && <li>{tb.s3Only(heroName)}</li>}
          <li>{tb.marks}</li>
          <li>{tb.notModelled}</li>
        </ul>
      </div>
    </Panel>
  );
}
