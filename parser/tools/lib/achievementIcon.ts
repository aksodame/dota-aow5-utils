/**
 * The achievement icon a stage draws, as the game's own HUD computes it.
 *
 * The table has no icon column; the achievement page in `hud/script.js` derives
 * the texture from the condition:
 *
 *   - `hero|level|current`            → `level_<stage>`;
 *   - `leaderboard|champion|tax`      → `gold_1`;
 *   - everything else (boss rows)     → `boss_<monster id>_1`.
 *
 * One file per boss, shared by its “hunter” and “finisher” series, and one per
 * level, because those stages look different.
 */
export function achievementIconName(condition: string, stage: number): string {
  const parts = condition.split('|').map((part) => part.trim());
  if (parts[0] === 'hero' && parts[1] === 'level') return `level_${stage}`;
  if (parts[0] === 'leaderboard' && parts[1] === 'champion' && parts[2] === 'tax') return 'gold_1';
  const target = parts[2] ?? '';
  const monster = target.startsWith('monster_') ? target.slice('monster_'.length) : target;
  return `boss_${monster}_1`;
}
