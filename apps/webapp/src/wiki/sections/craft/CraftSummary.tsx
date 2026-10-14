import { useMemo } from 'react';
import type { MapSummary } from 'aow5-shared/data';
import {
  craftFarm,
  craftMaterials,
  isCraftable,
  itemDropRooms,
  type CraftEconomy,
  type CraftItem,
  type DropSource,
} from 'aow5-shared/wiki';
import { Panel } from '@/ui';
import { wikiPath } from '@/router';
import { Check, FactGrid, ItemRef, Note, Tag, WikiLoading, collate, num, pctOf } from '../../kit';
import { itemHref, nameOf, type CraftContext } from './model';
import styles from './Craft.module.css';

interface Props {
  ctx: CraftContext;
  root: CraftItem;
  economy: CraftEconomy;
  matDepth: boolean;
  ignoreLevel: boolean;
  onIgnoreLevel: (next: boolean) => void;
  /** Item -> rooms it drops in, on hard. Null while the monster tables load. */
  drops: ReadonlyMap<string, readonly DropSource[]> | null;
  maps: ReadonlyMap<string, MapSummary>;
}

/**
 * The right-hand column: the crafting total, the materials summed over the
 * whole tree with where each drops, what selling or dismantling it fetches,
 * and where to farm the craft.
 */
export function CraftSummary({ ctx, root, economy, matDepth, ignoreLevel, onIgnoreLevel, drops, maps }: Props) {
  const { t, lang, pricing, prices, lookup } = ctx;
  const craft = pricing.craftOf(root.id);
  const buy = prices[root.id] ?? null;
  const verdict = buy === null || craft.value === null ? null : buy < craft.value ? 'buy' : craft.value < buy ? 'craft' : null;
  const gold = (value: number) => `${num(value, lang, 0)} ${ctx.goldUnit}`;

  const roomLevel = (room: string) => maps.get(room)?.tier;
  const roomName = (room: string) => maps.get(room)?.label ?? room;

  const mats = useMemo(() => {
    const byName = collate(lang);
    return craftMaterials(root, lookup, matDepth).sort(
      (a, b) => b.count - a.count || byName(nameOf(ctx, a.id), nameOf(ctx, b.id)),
    );
  }, [root, lookup, matDepth, lang, ctx]);

  const farm = useMemo(
    () => (drops === null ? null : craftFarm(root, drops, lookup, roomLevel, ignoreLevel ? null : root.level)),
    // `roomLevel` reads `maps`, which is stable for the visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, drops, lookup, ignoreLevel, maps],
  );

  return (
    <div className={styles.summary}>
      <Panel title={t.summary}>
        <FactGrid
          rows={[
            [
              <span title={t.craftYourselfTitle}>{t.craftYourself}</span>,
              <span title={t.craftYourselfTitle}>
                {craft.value === null ? t.unknownCost : gold(Math.round(craft.value)) + (craft.unknown ? ' + ?' : '')}
              </span>,
            ],
            ...(buy !== null ? [[t.buyReady, gold(buy)] as const] : []),
          ]}
        />
        {verdict !== null ? (
          <p className={verdict === 'buy' ? styles.verdictBuy : styles.verdictCraft}>{verdict === 'buy' ? t.verdictBuy : t.verdictCraft}</p>
        ) : (
          <p className={styles.hint}>{buy === null ? t.enterPrice : t.samePrice}</p>
        )}
      </Panel>

      <Panel title={t.materials(mats.length)}>
        <div className={styles.matHead}>
          <Check checked={ignoreLevel} onChange={onIgnoreLevel} title={t.higherLocsTitle}>
            {t.higherLocs}
          </Check>
        </div>
        {drops === null ? (
          <WikiLoading />
        ) : mats.length === 0 ? (
          <p className={styles.hint}>{t.emptyRecipe}</p>
        ) : (
          <>
            <ul className={styles.mats}>
              {mats.map((m) => {
                const item = lookup(m.id);
                const rooms = itemDropRooms(drops, m.id, roomLevel, ignoreLevel || item === undefined ? null : item.level);
                return (
                  <li key={m.id} className={styles.mat} title={t.matTitle(nameOf(ctx, m.id), m.count)}>
                    <ItemRef id={m.id} size="sm" count={num(m.count, lang, 0)} href={itemHref(ctx, m.id)} extra={<code>{m.id}</code>} />
                    <div className={styles.matLocs}>
                      {rooms.length === 0 ? (
                        <span className={styles.hint}>{isCraftable(item) ? t.onlyCraft : t.unknownSource}</span>
                      ) : (
                        <>
                          {rooms.slice(0, 3).map((s) => (
                            <Tag
                              key={s.room}
                              href={wikiPath('monsters', 'loc', s.room)}
                              title={t.locTitle(roomName(s.room), num(s.avg, lang, 2), rooms.length)}
                            >
                              {roomName(s.room)}
                            </Tag>
                          ))}
                          {rooms.length > 3 && (
                            <Tag title={rooms.slice(3).map((s) => roomName(s.room)).join('\n')}>{t.moreLocs(rooms.length - 3)}</Tag>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className={styles.hint}>{t.hardNote}</p>
          </>
        )}
      </Panel>

      <Panel title={t.sellDismantle}>
        <FactGrid
          rows={[
            [t.sellItem, gold(Math.floor(economy.sellValue))],
            [t.sellComponents, gold(Math.floor(economy.compSell))],
            ...(economy.essences.length === 0
              ? [[t.dismantle('—'), t.dismantleNone] as const]
              : economy.essences.map(
                  (e) =>
                    [
                      <span title={t.dismantleTitle}>{t.dismantle(nameOf(ctx, e.id))}</span>,
                      <span title={t.dismantleTitle}>
                        ×{num(e.count, lang, 0)}
                        {e.chance < 100 ? ` (${t.dismantleChance(pctOf(e.chance, lang, 0))})` : ''} → {gold(Math.round(e.value))}
                      </span>,
                    ] as const,
                )),
          ]}
        />
        {(economy.profSell || economy.profDis) && (
          <p className={styles.verdictCraft}>
            {t.profitable([...(economy.profSell ? [t.profitSell] : []), ...(economy.profDis ? [t.profitDis] : [])])}
          </p>
        )}
        {economy.unknown > 0 && <Note>{t.incomplete(economy.unknown)}</Note>}
      </Panel>

      <Panel title={t.whereToGet}>
        {farm === null ? (
          <WikiLoading />
        ) : (
          <div className={styles.farm}>
            {farm.rooms.slice(0, 3).map((room) => (
              <Tag
                key={room.room}
                href={wikiPath('monsters', 'loc', room.room)}
                title={t.farmTitle(roomName(room.room), num(room.score, lang, 2))}
              >
                {roomName(room.room)} · {num(room.score, lang, 1)}
              </Tag>
            ))}
            {farm.craftOnly.map((id) => (
              <Tag key={id} tone="accent" href={wikiPath('craft', id)} title={t.craftTagTitle(nameOf(ctx, id))}>
                {t.craftTag(nameOf(ctx, id))}
              </Tag>
            ))}
            {farm.rooms.length === 0 && farm.craftOnly.length === 0 && <Tag>{t.noData}</Tag>}
          </div>
        )}
      </Panel>
    </div>
  );
}
