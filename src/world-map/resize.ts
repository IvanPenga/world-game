import { removeUnusedScript } from './entities';
import { getEntitySize, getTile, layerNames, type WorldMap } from './world-map';

/** Which part of the map stays in place when it is resized, e.g. "top-left" grows or shrinks at the right and bottom. */
export type ResizeAnchor = `${'top' | 'middle' | 'bottom'}-${'left' | 'center' | 'right'}`;

export const resizeAnchors: ResizeAnchor[] = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right'
];

/** How far existing tiles move when the map is resized to the given size. */
export function getResizeOffset(
    map: WorldMap,
    width: number,
    height: number,
    anchor: ResizeAnchor
): { x: number; y: number } {
    const [vertical, horizontal] = anchor.split('-');
    const factorX = horizontal === 'left' ? 0 : horizontal === 'center' ? 0.5 : 1;
    const factorY = vertical === 'top' ? 0 : vertical === 'middle' ? 0.5 : 1;

    return { x: Math.floor((width - map.width) * factorX), y: Math.floor((height - map.height) * factorY) };
}

export type ResizeResult = {
    map: WorldMap;
    /** Ids of entities that ended up outside the map and were removed. */
    removedEntityIds: string[];
};

/**
 * Returns the map resized to width × height. New tiles are empty, except that the ground layer is filled with
 * `fillTileId`. Entities move with the tiles; triggers are cut to the map, and entities that end up entirely outside
 * are removed together with scripts nothing else uses.
 */
export function resizeWorldMap(
    map: WorldMap,
    width: number,
    height: number,
    anchor: ResizeAnchor = 'top-left',
    fillTileId = 0
): ResizeResult {
    const offset = getResizeOffset(map, width, height, anchor);
    const layers = Object.fromEntries(
        layerNames.map((layer) => {
            const tiles: number[] = [];

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sourceX = x - offset.x;
                    const sourceY = y - offset.y;
                    const isNew = sourceX < 0 || sourceY < 0 || sourceX >= map.width || sourceY >= map.height;

                    tiles.push(isNew ? (layer === 'ground' ? fillTileId : 0) : getTile(map, layer, sourceX, sourceY));
                }
            }

            return [layer, tiles];
        })
    ) as WorldMap['layers'];
    const removedEntityIds: string[] = [];
    const entities: WorldMap['entities'] = [];

    for (const entity of map.entities) {
        const size = getEntitySize(entity);
        const left = Math.max(entity.x + offset.x, 0);
        const top = Math.max(entity.y + offset.y, 0);
        const right = Math.min(entity.x + offset.x + size.width, width);
        const bottom = Math.min(entity.y + offset.y + size.height, height);

        if (right <= left || bottom <= top) {
            removedEntityIds.push(entity.id);
            continue;
        }
        entities.push(
            entity.type === 'trigger'
                ? { ...entity, x: left, y: top, width: right - left, height: bottom - top }
                : { ...entity, x: left, y: top }
        );
    }

    const resized: WorldMap = { ...map, width, height, layers, entities, scripts: { ...map.scripts } };

    for (const entity of map.entities) {
        if (removedEntityIds.includes(entity.id) && 'script' in entity) {
            removeUnusedScript(resized, entity.script);
        }
    }

    return { map: resized, removedEntityIds };
}
