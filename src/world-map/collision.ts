import { getTileDefinition, type Collision, type Tileset } from './tileset';
import { getEntitiesAt, getTile, isInBounds, type Entity, type LayerName, type WorldMap } from './world-map';

/** Layers that can block movement. The overhead layer is drawn above the player and never blocks. */
export const collisionLayers: LayerName[] = ['ground', 'decoration'];

/**
 * Collision of a map tile, combined from its collision layers: "solid" wins over "water".
 * Tiles outside the map are solid. Returns null when the tile can be walked on.
 */
export function getCollisionAt(map: WorldMap, tileset: Tileset, x: number, y: number): Collision | null {
    if (!isInBounds(map, x, y)) {
        return 'solid';
    }
    let collision: Collision | null = null;

    for (const layer of collisionLayers) {
        const tileCollision = getTileDefinition(tileset, getTile(map, layer, x, y))?.collision;

        if (tileCollision === 'solid') {
            return 'solid';
        }
        collision = tileCollision ?? collision;
    }

    return collision;
}

/** Entities the player cannot walk (or sail) through. Items and resources block until they are collected. */
export function isBlockingEntity(entity: Entity): boolean {
    return (
        entity.type === 'npc' ||
        entity.type === 'sign' ||
        entity.type === 'item' ||
        entity.type === 'resource' ||
        entity.type === 'ship'
    );
}

/** Whether the player can stand on the tile: no solid or water collision and no blocking entity in the way. */
export function isWalkable(map: WorldMap, tileset: Tileset, x: number, y: number): boolean {
    return (
        getCollisionAt(map, tileset, x, y) === null &&
        !getEntitiesAt(map, x, y).some((entity) => isBlockingEntity(entity))
    );
}
