import { mapImageUrl } from 'aow5-shared/data';
import { spawnsOf, type Bounds, type Monster } from 'aow5-shared/wiki';
import { Panel } from '@/ui';
import { pctOf } from '../../kit';
import { nameOf } from './model';
import { waveText, type Ctx } from './parts';
import styles from '../MonstersPage.module.css';

/** World units to a percentage of the overview image; the image's Y axis runs down. */
const mapX = (b: Bounds, x: number) => ((x - b.minX) / (b.maxX - b.minX)) * 100;
const mapY = (b: Bounds, y: number) => ((b.maxY - y) / (b.maxY - b.minY)) * 100;

/**
 * The room's overview with the selected unit's spawn points on it.
 *
 * A unit in several mapped rooms gets a button that steps through them. The
 * overview is the game's own minimap art, drawn with transparency meant to sit
 * on the dark of the HUD — so it is laid on a dark ground in both themes.
 * A point's opacity follows its spawn chance, and a hunter's point (where its
 * wave comes from, not a spawn) has its own colour.
 */
export function MapBox({
  ctx,
  monster,
  room,
  filterRoom,
  index,
  onNext,
}: {
  ctx: Ctx;
  monster: Monster | undefined;
  /** The location view's room, when that is what is open. */
  room: string | undefined;
  /** The location filter, for when nothing is open. */
  filterRoom: string;
  index: number;
  onNext: () => void;
}) {
  const { model, t, lang } = ctx;
  const candidates = room !== undefined ? [room] : monster !== undefined ? monster.locations : filterRoom !== '' ? [filterRoom] : [];
  const mapCodes = candidates.filter((code) => model.mapped.includes(code));
  const code = mapCodes.length > 0 ? mapCodes[index % mapCodes.length] : undefined;
  const shownRoom = model.rooms.get(code ?? candidates[0] ?? '');

  if (code === undefined) {
    return (
      <Panel className={styles.mapPanel}>
        <div className={styles.mapPlaceholder}>
          <strong>{t.mapTitle}</strong>
          <span>{shownRoom?.name ?? t.mapPick}</span>
          <small>{model.mapped.length > 0 ? t.mapsAvailable(model.mapped.length, model.mapped.join(', ')) : t.noMaps}</small>
        </div>
      </Panel>
    );
  }

  const loc = model.locations.locations[code]!;
  const bounds = loc.bounds!;
  const points = monster === undefined ? [] : spawnsOf(model.locations, monster.id, code);
  const hunter = monster === undefined ? undefined : loc.hunters.find((h) => h.id === monster.id);
  const name = monster === undefined ? '' : nameOf(model, monster.id);
  const next = mapCodes.length > 1 ? mapCodes[(index + 1) % mapCodes.length]! : undefined;
  const nextName = next === undefined ? '' : (model.rooms.get(next)?.name ?? next);

  const caption: string[] = [];
  if (points.length > 0) caption.push(t.mapPoints(points.length));
  if (hunter !== undefined) caption.push(t.hunter);
  const roomName = shownRoom?.name ?? code;

  return (
    <Panel className={styles.mapPanel}>
      <div className={styles.mapCanvas}>
        <img className={styles.mapImg} src={mapImageUrl(`overview/${loc.overview!}`)} alt="" loading="lazy" decoding="async" />
        {points.map((p, i) => (
          <span
            key={i}
            className={styles.mapDot}
            style={{
              left: `${mapX(bounds, p.x).toFixed(2)}%`,
              top: `${mapY(bounds, p.y).toFixed(2)}%`,
              opacity: (0.22 + 0.78 * Math.min(1, p.chance / 100)).toFixed(2),
            }}
            title={t.dotTitle(name, pctOf(p.chance, lang, 2), p.count) + (p.via === 'rarity' ? `\n${t.rarityDot}` : '')}
          />
        ))}
        {hunter !== undefined && (
          <span
            className={styles.mapHunter}
            style={{ left: `${mapX(bounds, hunter.x).toFixed(2)}%`, top: `${mapY(bounds, hunter.y).toFixed(2)}%` }}
            title={t.hunterDot(name, waveText(t, hunter, lang))}
          />
        )}
        {next !== undefined && (
          <button type="button" className={styles.mapSwitch} onClick={onNext} title={t.mapSwitchTitle(mapCodes.length, nextName)}>
            {nextName} ▸
          </button>
        )}
      </div>
      <p className={styles.mapCaption}>
        {caption.length > 0 ? `${roomName}: ${caption.join(' · ')}` : `${t.levelTag(shownRoom?.level ?? 0)} · ${roomName}`}
      </p>
    </Panel>
  );
}
