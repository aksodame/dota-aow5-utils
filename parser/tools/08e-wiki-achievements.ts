import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { findChild, parseKv } from './lib/kv.ts';
import { achievementIconName } from './lib/achievementIcon.ts';
import { writeJson } from './lib/writeJson.ts';
import { check, checkSoft, exitIfFailed, info, ok, step, warn } from './lib/log.ts';
import type {
  AchievementReward,
  AchievementSeries,
  AchievementStage,
  AchievementsFile,
  AchievementsLocale,
} from '../../packages/aow5-shared/src/wiki/achievements.ts';

/**
 * Step 08e — the wiki's achievements.
 *
 * Emits, under `public/data/wiki/`:
 *
 *   achievements.json                every series and its three stages, with
 *                                    the stat rewards a claimed stage grants
 *   locale.<lang>.achievements.json  the stage names and descriptions
 *
 * Sources, both already on disk from earlier steps:
 *
 *   - `cache/raw/ak_achievement.txt` — the addon's plain KV table (step 02);
 *   - `cache/tokens.<lang>.json` — the flattened locale files (step 03), whose
 *     keys are lowercased: `achievement_achievement_0001_name`.
 *
 * The calculator reads the rewards as panel buffs; `achievements.ts` in the
 * shared package says how the four `base_*` keys fold into the panel rows.
 */

ensureDirs();
const cfg = loadConfig();
step('08e · wiki: achievements');

const OUT = path.join(DIRS.publicData, 'wiki');
const rawFile = path.join(DIRS.cacheRaw, path.basename(cfg.achievementsPath));
if (!fs.existsSync(rawFile)) {
  warn(`missing ${path.relative(DIRS.root, rawFile)}; run 02-extract-raw first`);
  process.exit(1);
}

const parsed = parseKv(fs.readFileSync(rawFile));
const content = findChild(parsed.root, 'CSVContent');
if (content === undefined) {
  warn('ak_achievement.txt has no CSVContent node');
  process.exit(1);
}

function parseRewards(text: string, id: string): AchievementReward[] {
  const out: AchievementReward[] = [];
  for (const part of text.split('&')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const at = trimmed.indexOf(':');
    if (at <= 0) {
      warn(`${id}: malformed reward_attributes entry "${trimmed}"`);
      continue;
    }
    const key = trimmed.slice(0, at).trim();
    const value = Number(trimmed.slice(at + 1).trim());
    if (key === '' || !Number.isFinite(value) || value === 0) {
      warn(`${id}: bad reward_attributes entry "${trimmed}"`);
      continue;
    }
    out.push({ key, value });
  }
  return out;
}

const series = new Map<string, AchievementSeries>();
let stageCount = 0;
let badStages = 0;

for (const [id, raw] of Object.entries(content)) {
  if (!id.startsWith('achievement_') || raw === null || typeof raw !== 'object') continue;
  const row = raw as Record<string, unknown>;
  const text = (key: string): string => (typeof row[key] === 'string' ? (row[key] as string).trim() : '');
  const seriesId = text('series_id');
  const stage = Number(text('stage'));
  const target = Number(text('target'));
  const numbersOk = seriesId !== '' && Number.isInteger(stage) && stage >= 1 && stage <= 3 && Number.isFinite(target);
  if (!numbersOk) {
    warn(`${id}: missing or bad series_id/stage/target`);
    badStages++;
    continue;
  }
  const rewards = parseRewards(text('reward_attributes'), id);
  if (rewards.length === 0) warn(`${id}: no reward_attributes`);
  const entry: AchievementStage = {
    id,
    stage,
    condition: text('condition'),
    target,
    rewards,
    icon: `${achievementIconName(text('condition'), stage)}.png`,
  };
  let group = series.get(seriesId);
  if (group === undefined) {
    group = { id: seriesId, category: text('category'), stages: [] };
    series.set(seriesId, group);
  }
  group.stages.push(entry);
  stageCount++;
}

for (const group of series.values()) {
  group.stages.sort((a, b) => a.stage - b.stage);
  if (group.stages.length !== 3) {
    warn(`${group.id}: ${group.stages.length} stage(s), expected 3`);
    badStages++;
  }
  const seen = new Set<number>();
  for (const stage of group.stages) {
    if (seen.has(stage.stage)) {
      warn(`${group.id}: duplicate stage ${stage.stage}`);
      badStages++;
    }
    seen.add(stage.stage);
  }
}

const file: AchievementSeries[] = [...series.values()];
checkSoft(file.length, cfg.expected.achievementSeriesCount, 'achievement series');
checkSoft(stageCount, cfg.expected.achievementStageCount, 'achievement stages');
check(badStages === 0, `achievement rows are well formed (${badStages} bad)`);

// --- locale -----------------------------------------------------------------

function splitName(name: string): { prefix: string | null; short: string } {
  const parts = name
    .split('·')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return { prefix: parts.slice(0, -1).join(' · '), short: parts[parts.length - 1]! };
  }
  return { prefix: null, short: name.trim() };
}

const locales: Record<string, AchievementsLocale> = {};
let missingEnglish = 0;

for (const lang of cfg.languages) {
  const tokenFile = path.join(DIRS.cache, `tokens.${lang}.json`);
  if (!fs.existsSync(tokenFile)) {
    warn(`missing cache/tokens.${lang}.json; run 03-parse-locales first`);
    continue;
  }
  const tokens = JSON.parse(fs.readFileSync(tokenFile, 'utf8')) as Record<string, string>;
  const locale: AchievementsLocale = { schema: 1, lang, series: {} };
  let missing = 0;

  for (const group of file) {
    const titleParts: Array<string | null> = [];
    const stages: AchievementsLocale['series'][string]['stages'] = {};
    for (const stage of group.stages) {
      const base = `achievement_${stage.id.toLowerCase()}`;
      const name = tokens[`${base}_name`]?.trim() ?? '';
      const description = tokens[`${base}_description`]?.trim() ?? '';
      if (name === '' || description === '') missing++;
      const split = splitName(name);
      titleParts.push(split.prefix);
      stages[stage.id] = { name: name !== '' ? name : stage.id, shortName: split.short, description };
    }
    const first = titleParts[0];
    const title = first !== null && titleParts.every((part) => part === first) ? first : undefined;
    locale.series[group.id] = { ...(title !== undefined ? { title } : {}), stages };
  }

  if (missing > 0) {
    if (lang === 'en') missingEnglish += missing;
    warn(`${lang}: ${missing} achievement name/description token(s) missing`);
  } else {
    ok(`${lang}: names and descriptions for ${stageCount} stages`);
  }
  locales[lang] = locale;
}

check(missingEnglish === 0, 'english achievement text is complete');

// === write ===================================================================

const generatedAt = new Date(
  (JSON.parse(fs.readFileSync(path.join(DIRS.cache, 'vpk-index.json'), 'utf8')) as { vpkMtimeMs: number }).vpkMtimeMs,
).toISOString();

const out: AchievementsFile = { schema: 1, generatedAt, series: file };
writeJson(path.join(OUT, 'achievements.json'), out);
ok(`wrote wiki/achievements.json (${file.length} series, ${stageCount} stages)`);

for (const lang of Object.keys(locales)) {
  writeJson(path.join(OUT, `locale.${lang}.achievements.json`), locales[lang]!);
  ok(`wrote wiki/locale.${lang}.achievements.json`);
}

const keys = new Set<string>();
for (const group of file) for (const stage of group.stages) for (const r of stage.rewards) keys.add(r.key);
info(`reward keys: ${[...keys].sort().join(', ')}`);

exitIfFailed();
