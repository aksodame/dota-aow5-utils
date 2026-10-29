import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  achievementLevelRewards,
  achievementPool,
  achievementTotals,
  type AchievementsFile,
  type AchievementsLocale,
} from './achievements.ts';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'public');
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(PUBLIC, rel), 'utf8')) as T;

const synthetic: AchievementsFile = {
  schema: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  series: [
    {
      id: 'series_a',
      category: 'boss',
      // Out of order on purpose: the level is a stage number, not an index.
      stages: [
        { id: 'a3', stage: 3, condition: '', target: 1, rewards: [{ key: 'base_all_stats', value: 2 }], icon: 'a.png' },
        { id: 'a1', stage: 1, condition: '', target: 1, rewards: [{ key: 'base_health', value: 10 }], icon: 'a.png' },
        { id: 'a2', stage: 2, condition: '', target: 1, rewards: [{ key: 'base_health_pct', value: 10 }], icon: 'a.png' },
      ],
    },
    {
      id: 'series_b',
      category: 'level',
      stages: [
        { id: 'b1', stage: 1, condition: '', target: 1, rewards: [{ key: 'base_all_stats_pct', value: 5 }], icon: 'b.png' },
        { id: 'b2', stage: 2, condition: '', target: 2, rewards: [{ key: 'outgoing_damage_pct', value: 3 }], icon: 'b.png' },
        { id: 'b3', stage: 3, condition: '', target: 3, rewards: [{ key: 'damage_resistance_pct', value: 4 }], icon: 'b.png' },
      ],
    },
  ],
};

test('a level sums every stage up to it', () => {
  const series = synthetic.series[0]!;
  assert.deepEqual(achievementLevelRewards(series, 0).map((r) => r.key), []);
  assert.deepEqual(achievementLevelRewards(series, 1).map((r) => r.key), ['base_health']);
  assert.deepEqual(achievementLevelRewards(series, 2).map((r) => r.key), ['base_health', 'base_health_pct']);
  assert.deepEqual(achievementLevelRewards(series, 3).map((r) => r.key), [
    'base_health',
    'base_health_pct',
    'base_all_stats',
  ]);
});

test('the current bonus sums each key across the selected stages', () => {
  assert.deepEqual(achievementTotals(synthetic.series[0]!, 3), [
    { key: 'base_health', value: 10 },
    { key: 'base_health_pct', value: 10 },
    { key: 'base_all_stats', value: 2 },
  ]);
  assert.deepEqual(achievementTotals(synthetic.series[1]!, 0), []);
});

test('base rewards fold into the panel keys the calculator knows', () => {
  const pool = achievementPool(synthetic, { series_a: 3, series_b: 3 }, {
    health: 100,
    attrs: { str: 10, agi: 20, int: 30 },
  });
  // base_health 10, then 10 % of (100 + 10).
  assert.equal(pool.bonus_health, 21);
  assert.equal(pool.bonus_all_stats, 2);
  // 5 % of each bucket plus the flat all-stats the achievements add.
  const near = (actual: number | undefined, expected: number) =>
    assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
  near(pool.bonus_strength, (10 + 2) * 0.05);
  near(pool.bonus_agility, (20 + 2) * 0.05);
  near(pool.bonus_intelligence, (30 + 2) * 0.05);
  assert.equal(pool.outgoing_damage_pct, 3);
  assert.equal(pool.damage_resistance_pct, 4);
});

test('an unselected series contributes nothing, and a new key passes through', () => {
  assert.deepEqual(achievementPool(synthetic, {}, { health: 100, attrs: { str: 1, agi: 2, int: 3 } }), {});
  const withNew = {
    ...synthetic,
    series: [
      {
        id: 'series_c',
        category: 'boss',
        stages: [{ id: 'c1', stage: 1, condition: '', target: 1, rewards: [{ key: 'crit_damage_pct', value: 7 }], icon: 'c.png' }],
      },
    ],
  } satisfies AchievementsFile;
  assert.deepEqual(achievementPool(withNew, { series_c: 1 }, { health: 0, attrs: { str: 0, agi: 0, int: 0 } }), {
    crit_damage_pct: 7,
  });
});

test('the emitted table and its three locales are complete', () => {
  const file = read<AchievementsFile>('data/wiki/achievements.json');
  assert.equal(file.series.length, 33);
  assert.equal(file.series.reduce((n, s) => n + s.stages.length, 0), 99);
  for (const series of file.series) {
    assert.equal(series.stages.length, 3, `${series.id} has three stages`);
    for (const stage of series.stages) {
      assert.ok(stage.rewards.length > 0, `${stage.id} has a reward`);
      assert.ok(existsSync(join(PUBLIC, 'icons', 'achievements', stage.icon)), `${stage.id} icon exists`);
    }
  }
  for (const lang of ['en', 'ru', 'zh']) {
    const locale = read<AchievementsLocale>(`data/wiki/locale.${lang}.achievements.json`);
    for (const series of file.series) {
      for (const stage of series.stages) {
        const text = locale.series[series.id]?.stages[stage.id];
        assert.ok(text !== undefined && text.name !== '' && text.shortName !== '' && text.description !== '');
      }
    }
  }
});
