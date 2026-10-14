import { useMemo } from 'react';
import { monsterTypeRank, roomLoot, totalWeight, type Difficulty, type Monster } from 'aow5-shared/wiki';
import { Panel, cx } from '@/ui';
import { Link } from '@/router';
import { DataFooter, DetailHeader, Note, Tag, WikiDetail, num, pct } from '../../kit';
import { nameOf, qty, type Pools, type Room } from './model';
import { ItemCell, TypeBadge, useItemName, type Ctx } from './parts';
import styles from '../MonstersPage.module.css';

interface Props {
  ctx: Ctx;
  room: Room;
  pools: Pools;
  difficulty: Difficulty | undefined;
  noRecipes: boolean;
  isRecipe: (id: string) => boolean;
  /** Where "back to the monster" goes: the last unit open, or the section. */
  backHref: string;
}

/**
 * Everything a room gives: who lives there, who always drops something, and
 * the whole loot table of the ordinary pools with the chance per full clear.
 */
export function LocationView({ ctx, room, pools, difficulty, noRecipes, isRecipe, backHref }: Props) {
  const { model, t, lang } = ctx;
  const quantity = (value: number) => qty(value, (v, d) => num(v, lang, d));

  const here = useMemo(
    () =>
      model.monsters
        .filter((m) => m.locations.includes(room.code))
        .sort((a, b) => monsterTypeRank(a.type) - monsterTypeRank(b.type) || (a.level ?? 0) - (b.level ?? 0)),
    [model, room.code],
  );
  const loot = useMemo(
    () => roomLoot(here, model.locations, room.code, difficulty, { noRecipes, isRecipe }),
    [here, model.locations, room.code, difficulty, noRecipes, isRecipe],
  );
  const bosses = here.filter((m) => room.bosses.includes(m.id));
  const guaranteed = here.filter((m) => (pools.first.get(m.id)?.length ?? 0) > 0);

  return (
    <WikiDetail>
      <DetailHeader
        title={room.name}
        code={room.code}
        tags={
          <>
            <Tag href={backHref}>{t.back}</Tag>
            <Tag>{t.locLevel(room.level)}</Tag>
            {room.dlc && <Tag tone="accent">{t.dlc}</Tag>}
            {room.gold > 0 && <Tag>{t.locGold(num(room.gold, lang))}</Tag>}
          </>
        }
      />

      <Panel title={t.monstersHere(here.length)}>
        <div className={styles.monChips}>
          {here.map((m) => (
            <Link
              key={m.id}
              to={{ href: ctx.href(m.id) }}
              className={cx(styles.monChip, room.bosses.includes(m.id) && styles.monChipBoss)}
              title={m.id}
            >
              <TypeBadge m={m} lang={lang} /> {nameOf(model, m.id)}
            </Link>
          ))}
        </div>
        {bosses.length > 0 && <Note>{t.bossesHere(bosses.map((m) => nameOf(model, m.id)).join(', '))}</Note>}
      </Panel>

      {guaranteed.length > 0 && (
        <Panel title={t.guaranteedHere(guaranteed.length)}>
          <div className={styles.gRows}>
            {guaranteed.map((m) => (
              <GuaranteedRow key={m.id} ctx={ctx} m={m} pools={pools} />
            ))}
          </div>
          <Note>{t.guaranteedNote}</Note>
        </Panel>
      )}

      <Panel title={t.loot(loot.length)}>
        {loot.length === 0 ? (
          <Note>{t.noLoot}</Note>
        ) : (
          <div className={styles.lootWrap}>
            <table className={styles.loot}>
              <thead>
                <tr>
                  <th>{t.lootItem}</th>
                  <th className={styles.num}>{t.lootBest}</th>
                  <th className={styles.num}>{t.lootClear}</th>
                  <th className={styles.num}>{t.lootAvg}</th>
                </tr>
              </thead>
              <tbody>
                {loot.map((rec) => (
                  <tr key={rec.id}>
                    <td>
                      <ItemCell id={rec.id} ctx={ctx} compact />
                      <div className={styles.from}>
                        {t.dropsFrom}
                        {rec.from.map((f, i) => (
                          <span key={f.monster}>
                            {i > 0 && ', '}
                            <Link to={{ href: ctx.href(f.monster) }} className={styles.inlineLink}>
                              {nameOf(model, f.monster)} {pct(f.chance, lang)}
                            </Link>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={styles.num}>{pct(rec.best, lang)}</td>
                    <td className={cx(styles.num, styles.numStrong)} title={t.lootClearTitle}>
                      {pct(rec.clear, lang)}
                    </td>
                    <td className={styles.num} title={t.lootAvgTitle(quantity(rec.kills), Math.round(rec.kills))}>
                      {quantity(rec.avg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>{t.lootNote}</Note>
      </Panel>

      <DataFooter ruleset={model.ruleset} built={model.built.slice(0, 10)} />
    </WikiDetail>
  );
}

/** A unit and its whole guaranteed drop, as icons with their share. */
function GuaranteedRow({ ctx, m, pools }: { ctx: Ctx; m: Monster; pools: Pools }) {
  const { model, t, lang } = ctx;
  const itemName = useItemName();
  const first = pools.first.get(m.id) ?? [];
  const total = totalWeight(first);
  return (
    <div className={styles.gRow}>
      <div className={styles.gRowHead}>
        <TypeBadge m={m} lang={lang} />
        <Link to={{ href: ctx.href(m.id) }} className={styles.inlineLink} title={m.id}>
          {nameOf(model, m.id)}
        </Link>
      </div>
      <div className={styles.dropGrid}>
        {[...first]
          .sort((a, b) => b[1] - a[1])
          .map(([id, weight]) => {
            const share = pct(total > 0 ? weight / total : 0, lang);
            return <ItemCell key={id} id={id} ctx={ctx} compact value={share} title={`${itemName(id)}\n${t.cellShare(share)}`} />;
          })}
      </div>
    </div>
  );
}
