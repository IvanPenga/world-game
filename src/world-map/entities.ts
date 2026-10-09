import type { Entity, EntityType, ScriptAction, WorldMap } from './world-map';

/** Smallest "<prefix>-<n>" that is not used as an entity id or a script id. */
export function createUniqueId(map: WorldMap, prefix: string): string {
    const usedIds = new Set([...map.entities.map((entity) => entity.id), ...Object.keys(map.scripts)]);

    for (let number = 1; ; number++) {
        const id = `${prefix}-${number}`;

        if (!usedIds.has(id)) {
            return id;
        }
    }
}

/**
 * A new entity with sensible defaults, plus the script it runs (when its type runs one). New items hold `itemId`,
 * normally the first item in the catalog.
 */
export function createEntity(
    map: WorldMap,
    type: EntityType,
    x: number,
    y: number,
    itemId = 'item'
): { entity: Entity; script?: ScriptAction[] } {
    const id = createUniqueId(map, type);

    switch (type) {
        case 'warp':
            return { entity: { type, id, x, y, target: { mapId: 'new-map', x: 0, y: 0 } } };
        case 'npc':
            return {
                entity: { type, id, x, y, sprite: 'npc', facing: 'down', movement: 'static', script: id },
                script: [{ type: 'say', text: 'Hello!' }]
            };
        case 'sign':
            return { entity: { type, id, x, y, script: id }, script: [{ type: 'say', text: 'A sign.' }] };
        case 'trigger':
            return {
                entity: { type, id, x, y, width: 1, height: 1, on: 'step', script: id },
                script: [{ type: 'say', text: 'Something happened.' }]
            };
        case 'item':
            return { entity: { type, id, x, y, item: itemId } };
        case 'resource':
            return { entity: { type, id, x, y, resource: 'wood' } };
        case 'ship':
            return { entity: { type, id, x, y, facing: 'right' } };
    }
}

/** Removes a script once no entity uses it any more. */
export function removeUnusedScript(map: WorldMap, scriptId: string) {
    const isUsed = map.entities.some((entity) => 'script' in entity && entity.script === scriptId);

    if (!isUsed) {
        delete map.scripts[scriptId];
    }
}
