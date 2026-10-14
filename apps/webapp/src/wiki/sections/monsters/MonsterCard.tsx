import type { ReactNode } from 'react';
import {
  dropChance,
  dropCount,
  monsterRoomAverages,
  monsterSpawnGroups,
  monsterTypeGroup,
  poolFor,
  spawnWeight,
  spawnsOf,
  totalWeight,
  type Difficulty,
  type DifficultyKey,
  type Monster,
  type PoolEntry,
} from 'aow5-shared/wiki';
import { Panel } from '@/ui';
import { Link } from '@/router';
import { Check, DataFooter, DetailHeader, FactGrid, Note, Tag, WikiDetail, num, pct, pctOf } from '../../kit';
import { nameOf, qty, type Pools } from './model';
import { ItemCell, TypeBadge, useItemName, waveText, type Ctx } from './parts';
import styles from '../MonstersPage.module.css';

interface Props {
  ctx: Ctx;
  m: Monster;
  pools: Pools;
  diff: DifficultyKey;
  difficulty: Difficulty | undefined;
  diffLabel: string;
  noRecipes: boolean;
  isRecipe: (id: string) => boolean;
  zoneAll: boolean;
  setZoneAll: (next: boolean) => void;
  /** The room a per-location average is counted in: the filtered one if the unit is there, else its easiest. */
  zoneRoom: string | undefined;
}

/** One unit: who it is, where it stands, and what it drops at the chosen difficulty. */
export function MonsterCard({ ctx, m, pools, diff, difficulty, diffLabel, noRecipes, isRecipe, zoneAll, setZoneAll, zoneRoom }: Props) {
  const { model, t, lang } = ctx;
  const itemName = useItemName();
  const group = monsterTypeGroup(m.type);
  const f = (value: number | undefined, digits = 2) => num(value, lang, digits);
  const quantity = (value: number) => qty(value, (v, d) => num(v, lang, d));

  // Stats a crate does not have are not zero, they are absent — a breakable
  // shows its level and health and nothing else, or the card is a list of dashes.
  const statRows: [ReactNode, ReactNode][] = [];
  const stat = (label: string, value: number | undefined, unit = '') => {
    if (value !== undefined) statRows.push([label, `${f(value)}${unit}`]);
  };
  stat(t.stat.level, m.level);
  stat(t.stat.hp, m.hp);
  if (group !== 'container') {
    stat(t.stat.damage, m.damage);
    stat(t.stat.armor, m.armor);
    stat(t.stat.magicResist, m.magicResist, '%');
    stat(t.stat.moveSpeed, m.moveSpeed);
    stat(t.stat.gold, m.gold);
    stat(t.stat.exp, m.exp);
    stat(t.stat.attackRange, m.attackRange);
    if (m.stunResist !== undefined && m.stunResist !== 0) stat(t.stat.stunResist, m.stunResist, '%');
  }

  const spawnCodes = m.locations.filter((code) => spawnsOf(model.locations, m.id, code).length > 0);
  const anyRarity = spawnCodes.some((code) => spawnsOf(model.locations, m.id, code).some((p) => p.via === 'rarity'));
  const hunts = model.hunters.get(m.id) ?? [];

  const first = pools.first.get(m.id) ?? [];
  const fullPool = poolFor(m, diff);
  const pool = pools.ordinary.get(m.id) ?? [];
  const total = totalWeight(pool);
  const count = dropCount(m, difficulty);
  const zone = zoneRoom === undefined ? undefined : model.rooms.get(zoneRoom);
  const zonePoints = zoneRoom === undefined ? [] : spawnsOf(model.locations, m.id, zoneRoom);
  const zoneAvg = quantity(spawnWeight(zonePoints));
  const hardOnly = diff === 'hard' ? m.poolHard.filter(([id]) => !m.pool.some(([p]) => p === id)) : [];

  const grid = (entries: readonly PoolEntry[], value: (id: string, weight: number) => { text: string; what: string }) => (
    <div className={styles.dropGrid}>
      {[...entries]
        .sort((a, b) => b[1] - a[1])
        .map(([id, weight]) => {
          const v = value(id, weight);
          return (
            <ItemCell
              key={id}
              id={id}
              ctx={ctx}
              value={v.text}
              title={`${itemName(id)}\n${id} · ${t.cellWeight(num(weight, lang))} · ${v.what}`}
            />
          );
        })}
    </div>
  );

  const firstTotal = totalWeight(first);
  const averages = zoneAll && zoneRoom !== undefined ? monsterRoomAverages(m, zonePoints, difficulty, { noRecipes, isRecipe }) : undefined;

  return (
    <WikiDetail>
      <DetailHeader
        title={nameOf(model, m.id)}
        code={m.id}
        tags={
          <>
            <TypeBadge m={m} lang={lang} />
            {m.type === 'building' && <Tag>{t.building}</Tag>}
            {m.locations.map((code) => {
              const room = model.rooms.get(code);
              return room === undefined ? null : (
                <Tag key={code} href={ctx.href('loc', code)} title={t.locationTagTitle}>
                  📍 {t.locationOption(room.level, room.name, room.dlc)}
                </Tag>
              );
            })}
            {m.consideredHero && <Tag>{t.consideredHero}</Tag>}
          </>
        }
      />

      {t.notes[m.id] !== undefined && <Note>{t.notes[m.id]}</Note>}

      <Panel title={t.stats}>
        <FactGrid rows={statRows} />
      </Panel>

      {m.groups !== undefined && m.groups.length > 0 && (
        <Panel title={t.guards(m.groups.length)}>
          <div className={styles.lines}>
            {m.groups.map((gid) => {
              const g = model.groups[gid];
              return (
                <div
                  key={gid}
                  className={styles.line}
                  title={g === undefined ? gid : g.monsters.map(([id, w]) => t.guardWeight(nameOf(model, id), id, w)).join('\n')}
                >
                  <span className={styles.lineHead}>{gid}</span>
                  <span className={styles.lineBody}>
                    {g === undefined
                      ? t.noData
                      : g.monsters.map(([id, w], i) => (
                          <span key={id}>
                            {i > 0 && ', '}
                            {model.byId.has(id) ? (
                              <Link to={{ href: ctx.href(id) }} className={styles.inlineLink}>
                                {nameOf(model, id)}
                              </Link>
                            ) : (
                              nameOf(model, id)
                            )}{' '}
                            ×{w}
                          </span>
                        ))}
                  </span>
                  <span className={styles.lineNote}>{g === undefined ? '' : t.guardKinds(g.monsters.length)}</span>
                </div>
              );
            })}
          </div>
          <Note>{t.guardNote}</Note>
        </Panel>
      )}

      {spawnCodes.length > 0 && (
        <Panel title={t.spawns}>
          <div className={styles.lines}>
            {spawnCodes.map((code) => {
              const room = model.rooms.get(code);
              const points = spawnsOf(model.locations, m.id, code);
              const groups = monsterSpawnGroups(points);
              return (
                <div key={code} className={styles.line} title={t.spawnTitle}>
                  <span className={styles.lineHead}>{room === undefined ? code : `${t.levelTag(room.level)} · ${room.name}`}</span>
                  <span className={styles.lineBody}>{groups.map((g) => `${g.count}×${pctOf(g.chance, lang, 2)}`).join(', ')}</span>
                  <span className={styles.lineNote}>
                    {t.spawnPoints(points.length)}, {t.spawnAvg(quantity(spawnWeight(points)))}
                  </span>
                </div>
              );
            })}
          </div>
          {anyRarity && <Note>{t.rarityNote}</Note>}
        </Panel>
      )}

      {hunts.length > 0 && (
        <Panel title={t.hunterSection}>
          <div className={styles.lines}>
            {hunts.map(({ code, hunter }) => {
              const room = model.rooms.get(code);
              return (
                <div key={code} className={styles.line}>
                  <span className={styles.lineHead}>{room === undefined ? code : `${t.levelTag(room.level)} · ${room.name}`}</span>
                  <span className={styles.lineBody}>{waveText(t, hunter, lang)}</span>
                  {hunter.other !== undefined && (
                    <span className={styles.lineNote}>
                      {t.hunterOther}:{' '}
                      <code>
                        {Object.entries(hunter.other)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')}
                      </code>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <Note>{t.hunterNote}</Note>
        </Panel>
      )}

      {first.length > 0 && (
        <Panel title={t.firstDrop}>
          {grid(first, (_id, weight) => {
            const text = pct(firstTotal > 0 ? weight / firstTotal : 0, lang);
            return { text, what: t.cellShare(text) };
          })}
          <Note>{t.firstNote}</Note>
        </Panel>
      )}

      <Panel title={t.drop}>
        {fullPool.length === 0 ? (
          <Note>{t.noPool}</Note>
        ) : (
          <div className={styles.dropBody}>
            <div className={styles.dropHead}>
              <span className={styles.ratePill}>{t.dropRate(pct(m.dropRatePct / 100, lang))}</span>
              <span className={styles.rateNote}>
                {t.dropRange(count.lo === count.cap ? `${count.lo}` : `${count.lo}–${count.cap}`, count.cap, diffLabel)}
              </span>
              <span className={styles.zoneCheck}>
                <Check
                  checked={zoneAll}
                  onChange={setZoneAll}
                  title={zone === undefined ? t.zoneNoRoom : t.zoneTitle(zone.name, zoneAvg)}
                >
                  {t.zone}
                </Check>
              </span>
            </div>
            {pool.length === 0 ? (
              <Note>{t.zoneEmpty}</Note>
            ) : zoneAll ? (
              zone === undefined || averages === undefined ? (
                <Note>{t.zoneNoLoc}</Note>
              ) : (
                <>
                  <Note>{t.zoneNote(zone.name, zone.level, zoneAvg)}</Note>
                  {grid(pool, (id) => {
                    const text = quantity(averages.get(id) ?? 0);
                    return { text, what: t.cellZone(text) };
                  })}
                </>
              )
            ) : (
              grid(pool, (_id, weight) => {
                const text = pct(dropChance(m, weight, total, difficulty), lang);
                return { text, what: t.cellChance(text) };
              })
            )}
            {noRecipes && fullPool.length > pool.length && <Note>{t.recipesHidden(fullPool.length - pool.length)}</Note>}
            {hardOnly.length > 0 && <Note>{t.hardOnly(hardOnly.map(([id]) => itemName(id)).join(', '))}</Note>}
            <Note>{t.formula(num(count.avg, lang))}</Note>
          </div>
        )}
      </Panel>

      <DataFooter ruleset={model.ruleset} built={model.built.slice(0, 10)} />
    </WikiDetail>
  );
}
