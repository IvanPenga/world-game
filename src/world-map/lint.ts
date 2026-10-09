import { getCollisionAt, isBlockingEntity, isWalkable } from './collision';
import { forEachAction, getFlagUsage, getScriptUsers, getWarpTargets } from './scripts';
import { getTileDefinition, type Tileset } from './tileset';
import {
    getEntitiesAt,
    getEntitySize,
    getTileIndex,
    isInBounds,
    layerNames,
    type Entity,
    type WorldMap
} from './world-map';

export type Problem = {
    severity: 'warning' | 'info';
    message: string;
    /** Tile the problem is about, so the editor can point at it. */
    x?: number;
    y?: number;
    entityId?: string;
};

export type LintContext = {
    /** Tileset of the linted map. */
    tileset: Tileset;
    /** All maps by id, as saved. The linted map itself is taken from the `map` argument instead. */
    maps: Record<string, WorldMap>;
    tilesets: Record<string, Tileset>;
    /** Sprite ids NPCs can use. Sprites are not checked when left out. */
    spriteIds?: string[];
    /** Item ids in the item catalog. Items are not checked when left out. */
    itemIds?: string[];
};

/**
 * Things that are probably mistakes but do not make the map invalid: unreachable areas, NPCs on solid tiles, warps
 * to missing maps or onto water, flags that are checked but never set, and so on. Warnings come first.
 */
export function lintWorldMap(map: WorldMap, context: LintContext): Problem[] {
    const allMaps = { ...context.maps, [map.id]: map };
    const problems = [
        ...lintTiles(map, context.tileset),
        ...lintEntities(map, context),
        ...lintWarps(map, allMaps, context.tilesets),
        ...lintReachability(map, allMaps, context.tileset),
        ...lintScripts(map, context),
        ...lintFlags(map, allMaps)
    ];

    return [...problems.filter((p) => p.severity === 'warning'), ...problems.filter((p) => p.severity === 'info')];
}

function lintTiles(map: WorldMap, tileset: Tileset): Problem[] {
    const problems: Problem[] = [];

    for (const layer of layerNames) {
        const unknown = new Map<number, { count: number; x: number; y: number }>();

        map.layers[layer].forEach((tileId, index) => {
            if (tileId !== 0 && !getTileDefinition(tileset, tileId)) {
                const entry = unknown.get(tileId) ?? {
                    count: 0,
                    x: index % map.width,
                    y: Math.floor(index / map.width)
                };

                entry.count++;
                unknown.set(tileId, entry);
            }
        });
        for (const [tileId, { count, x, y }] of unknown) {
            problems.push({
                severity: 'warning',
                message: `Tile ${tileId} on the ${layer} layer is not in tileset "${tileset.id}" (${count}×, first at (${x}, ${y}))`,
                x,
                y
            });
        }
    }

    return problems;
}

function lintEntities(map: WorldMap, context: LintContext): Problem[] {
    const problems: Problem[] = [];

    for (const entity of map.entities) {
        const at = { x: entity.x, y: entity.y, entityId: entity.id };

        if (entity.type === 'npc') {
            const collision = getCollisionAt(map, context.tileset, entity.x, entity.y);

            if (collision) {
                problems.push({
                    severity: 'warning',
                    message: `NPC "${entity.id}" stands on a ${collision} tile`,
                    ...at
                });
            }
            if (context.spriteIds && !context.spriteIds.includes(entity.sprite)) {
                problems.push({
                    severity: 'info',
                    message: `NPC "${entity.id}" uses sprite "${entity.sprite}", which is not in the sprite sheet`,
                    ...at
                });
            }
        }
        if (entity.type === 'item' || entity.type === 'resource') {
            const collision = getCollisionAt(map, context.tileset, entity.x, entity.y);
            const label = entity.type === 'item' ? 'Item' : 'Resource';

            if (collision) {
                problems.push({
                    severity: 'warning',
                    message: `${label} "${entity.id}" lies on a ${collision} tile, where the player cannot reach it`,
                    ...at
                });
            }
            const item = entity.type === 'item' ? entity.item : entity.resource;

            if (context.itemIds && !context.itemIds.includes(item)) {
                problems.push({
                    severity: 'warning',
                    message: `${label} "${entity.id}" holds "${item}", which is not in the item catalog`,
                    ...at
                });
            }
        }
        if (entity.type === 'ship') {
            const hasCoast = getNeighbours(entity.x, entity.y).some(([x, y]) => isWalkable(map, context.tileset, x, y));

            if (getCollisionAt(map, context.tileset, entity.x, entity.y) !== 'water') {
                problems.push({ severity: 'warning', message: `Ship "${entity.id}" is not on water`, ...at });
            } else if (!hasCoast) {
                problems.push({
                    severity: 'warning',
                    message: `Ship "${entity.id}" has no walkable tile next to it, so the player cannot board it`,
                    ...at
                });
            }
        }
        if (isBlockingEntity(entity)) {
            const other = getEntitiesAt(map, entity.x, entity.y).find(
                (candidate) => candidate !== entity && isBlockingEntity(candidate)
            );

            if (other && map.entities.indexOf(other) > map.entities.indexOf(entity)) {
                problems.push({
                    severity: 'warning',
                    message: `"${entity.id}" and "${other.id}" are on the same tile`,
                    ...at
                });
            }
        }
        if (entity.type === 'trigger' && entity.on === 'step') {
            const { width, height } = getEntitySize(entity);
            // With a ship on the map, the player can also reach water tiles.
            const hasShip = map.entities.some((candidate) => candidate.type === 'ship');
            let canStepOn = false;

            for (let y = entity.y; y < entity.y + height && !canStepOn; y++) {
                for (let x = entity.x; x < entity.x + width && !canStepOn; x++) {
                    canStepOn =
                        isWalkable(map, context.tileset, x, y) ||
                        (hasShip && getCollisionAt(map, context.tileset, x, y) === 'water');
                }
            }
            if (!canStepOn) {
                problems.push({
                    severity: 'warning',
                    message: `Step trigger "${entity.id}" only covers tiles the player cannot walk or sail on`,
                    ...at
                });
            }
        }
    }

    return problems;
}

function lintWarps(map: WorldMap, allMaps: Record<string, WorldMap>, tilesets: Record<string, Tileset>): Problem[] {
    const problems: Problem[] = [];

    for (const { target, source, entityId } of getWarpTargets(map)) {
        const entity = map.entities.find((candidate) => candidate.id === entityId);
        const at = entity ? { x: entity.x, y: entity.y, entityId } : {};
        const targetMap = allMaps[target.mapId];
        const where = `(${target.x}, ${target.y}) in "${target.mapId}"`;

        if (!targetMap) {
            problems.push({
                severity: 'warning',
                message: `${source} leads to map "${target.mapId}", which does not exist`,
                ...at
            });
            continue;
        }
        if (target.x >= targetMap.width || target.y >= targetMap.height) {
            problems.push({
                severity: 'warning',
                message: `${source} leads to ${where}, outside that map (${targetMap.width}×${targetMap.height})`,
                ...at
            });
            continue;
        }
        const targetTileset = tilesets[targetMap.tilesetId];

        if (!targetTileset) {
            continue;
        }
        const collision = getCollisionAt(targetMap, targetTileset, target.x, target.y);

        if (collision) {
            problems.push({
                severity: 'warning',
                message: `${source} lands on a ${collision} tile at ${where}`,
                ...at
            });
        } else if (!isWalkable(targetMap, targetTileset, target.x, target.y)) {
            problems.push({
                severity: 'warning',
                message: `${source} lands on an NPC, sign, item, resource or ship at ${where}`,
                ...at
            });
        }
    }

    return problems;
}

/** Tiles where the player can appear in this map: warp targets from any map, and the map's own warp tiles. */
function getArrivalPoints(map: WorldMap, allMaps: Record<string, WorldMap>): { x: number; y: number }[] {
    const incoming = Object.values(allMaps).flatMap((other) =>
        getWarpTargets(other)
            .map(({ target }) => target)
            .filter((target) => target.mapId === map.id)
    );
    const warps = map.entities.filter((entity) => entity.type === 'warp');

    return [...incoming, ...warps];
}

function getNeighbours(x: number, y: number): [number, number][] {
    return [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1]
    ];
}

/**
 * Water tiles a ship can sail to from its tile: water connected to it (up, down, left, right) without entities in
 * the way. Other ships count as in the way, the ship itself does not.
 */
function getSailableTiles(map: WorldMap, tileset: Tileset, ship: Entity): { x: number; y: number }[] {
    const isSailable = (x: number, y: number) =>
        getCollisionAt(map, tileset, x, y) === 'water' &&
        !getEntitiesAt(map, x, y).some((entity) => entity !== ship && isBlockingEntity(entity));

    if (!isSailable(ship.x, ship.y)) {
        return [];
    }
    const visited = new Set([getTileIndex(map, ship.x, ship.y)]);
    const stack: [number, number][] = [[ship.x, ship.y]];
    const tiles: { x: number; y: number }[] = [];

    while (stack.length > 0) {
        const [x, y] = stack.pop()!;

        tiles.push({ x, y });
        for (const [nextX, nextY] of getNeighbours(x, y)) {
            if (
                isInBounds(map, nextX, nextY) &&
                !visited.has(getTileIndex(map, nextX, nextY)) &&
                isSailable(nextX, nextY)
            ) {
                visited.add(getTileIndex(map, nextX, nextY));
                stack.push([nextX, nextY]);
            }
        }
    }

    return tiles;
}

function lintReachability(map: WorldMap, allMaps: Record<string, WorldMap>, tileset: Tileset): Problem[] {
    const arrivals = getArrivalPoints(map, allMaps);

    if (arrivals.length === 0) {
        return [{ severity: 'info', message: 'No warp leads into this map, so reachability is not checked' }];
    }
    const walkable = (x: number, y: number) => isWalkable(map, tileset, x, y);
    const region = new Int32Array(map.width * map.height).fill(-1);
    const regions: { size: number; x: number; y: number }[] = [];

    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            if (region[getTileIndex(map, x, y)] !== -1 || !walkable(x, y)) {
                continue;
            }
            const id = regions.length;
            const stack: [number, number][] = [[x, y]];
            let size = 0;

            region[getTileIndex(map, x, y)] = id;
            while (stack.length > 0) {
                const [currentX, currentY] = stack.pop()!;

                size++;
                for (const [nextX, nextY] of [
                    [currentX + 1, currentY],
                    [currentX - 1, currentY],
                    [currentX, currentY + 1],
                    [currentX, currentY - 1]
                ]) {
                    if (
                        nextX >= 0 &&
                        nextY >= 0 &&
                        nextX < map.width &&
                        nextY < map.height &&
                        region[getTileIndex(map, nextX, nextY)] === -1 &&
                        walkable(nextX, nextY)
                    ) {
                        region[getTileIndex(map, nextX, nextY)] = id;
                        stack.push([nextX, nextY]);
                    }
                }
            }
            regions.push({ size, x, y });
        }
    }

    const reached = new Set<number>();

    for (const { x, y } of arrivals) {
        if (x < map.width && y < map.height) {
            reached.add(region[getTileIndex(map, x, y)]);
        }
    }

    // A ship that can be boarded from a reached area also reaches every coast of the water it sails on. Repeat, since
    // a newly reached island may have another ship.
    const coastsPerShip = map.entities
        .filter((entity) => entity.type === 'ship')
        .map((ship) => {
            const coasts = new Set<number>();

            for (const tile of getSailableTiles(map, tileset, ship)) {
                for (const [x, y] of getNeighbours(tile.x, tile.y)) {
                    if (isInBounds(map, x, y) && region[getTileIndex(map, x, y)] !== -1) {
                        coasts.add(region[getTileIndex(map, x, y)]);
                    }
                }
            }
            const boardingRegions = getNeighbours(ship.x, ship.y)
                .filter(([x, y]) => isInBounds(map, x, y) && region[getTileIndex(map, x, y)] !== -1)
                .map(([x, y]) => region[getTileIndex(map, x, y)]);

            return { boardingRegions, coasts: [...coasts] };
        });
    let changed = true;

    while (changed) {
        changed = false;
        for (const { boardingRegions, coasts } of coastsPerShip) {
            if (boardingRegions.some((id) => reached.has(id)) && coasts.some((id) => !reached.has(id))) {
                coasts.forEach((id) => reached.add(id));
                changed = true;
            }
        }
    }

    return regions
        .filter((_, id) => !reached.has(id))
        .map(({ size, x, y }) => ({
            severity: 'warning',
            message: `${size} walkable ${size === 1 ? 'tile' : 'tiles'} around (${x}, ${y}) cannot be reached from any warp`,
            x,
            y
        }));
}

function lintScripts(map: WorldMap, context: LintContext): Problem[] {
    const problems: Problem[] = [];

    for (const [scriptId, actions] of Object.entries(map.scripts)) {
        const users = getScriptUsers(map, scriptId);
        const user = map.entities.find((entity) => entity.id === users[0]);
        const at = user ? { x: user.x, y: user.y, entityId: user.id } : {};

        if (users.length === 0) {
            problems.push({ severity: 'info', message: `Script "${scriptId}" is not used by any entity` });
        }
        if (actions.length === 0) {
            problems.push({ severity: 'info', message: `Script "${scriptId}" does nothing`, ...at });
        }
        forEachAction(actions, (action) => {
            if (action.type === 'say' && action.text.trim() === '') {
                problems.push({ severity: 'warning', message: `Script "${scriptId}" says an empty text`, ...at });
            }
            if ((action.type === 'setFlag' || action.type === 'if') && action.flag.trim() === '') {
                problems.push({
                    severity: 'warning',
                    message: `Script "${scriptId}" uses a flag without a name`,
                    ...at
                });
            }
            if (action.type === 'giveItem' && action.item.trim() === '') {
                problems.push({
                    severity: 'warning',
                    message: `Script "${scriptId}" gives an item without a name`,
                    ...at
                });
            } else if (action.type === 'giveItem' && context.itemIds && !context.itemIds.includes(action.item)) {
                problems.push({
                    severity: 'warning',
                    message: `Script "${scriptId}" gives "${action.item}", which is not in the item catalog`,
                    ...at
                });
            }
            if (action.type === 'miniGame') {
                if (action.miniGame.title.trim() === '') {
                    problems.push({
                        severity: 'warning',
                        message: `Script "${scriptId}" opens a mini game without a title`,
                        ...at
                    });
                }
                if (action.miniGame.prompt.trim() === '') {
                    problems.push({
                        severity: 'warning',
                        message: `Script "${scriptId}" opens a mini game without a prompt`,
                        ...at
                    });
                }
                if (action.miniGame.answer.trim() === '') {
                    problems.push({
                        severity: 'warning',
                        message: `Script "${scriptId}" opens a mini game without an answer`,
                        ...at
                    });
                }
            }
        });
    }

    return problems;
}

function lintFlags(map: WorldMap, allMaps: Record<string, WorldMap>): Problem[] {
    const setAnywhere = new Set<string>();
    const checkedAnywhere = new Set<string>();

    for (const other of Object.values(allMaps)) {
        for (const [flag, usage] of getFlagUsage(other)) {
            if (usage.setIn.length > 0) {
                setAnywhere.add(flag);
            }
            if (usage.checkedIn.length > 0) {
                checkedAnywhere.add(flag);
            }
        }
    }

    const problems: Problem[] = [];

    for (const [flag, usage] of getFlagUsage(map)) {
        if (flag.trim() === '') {
            continue;
        }
        if (usage.checkedIn.length > 0 && !setAnywhere.has(flag)) {
            const suggestion = [...setAnywhere].find((candidate) => getEditDistance(candidate, flag) <= 2);

            problems.push({
                severity: 'warning',
                message:
                    `Flag "${flag}" is checked in ${usage.checkedIn.map((id) => `"${id}"`).join(', ')} but never set in any map` +
                    (suggestion ? `. Did you mean "${suggestion}"?` : '')
            });
        }
        if (usage.setIn.length > 0 && !checkedAnywhere.has(flag)) {
            problems.push({ severity: 'info', message: `Flag "${flag}" is set but never checked in any map` });
        }
    }

    return problems;
}

/** Number of single-character insertions, deletions or replacements that turn one text into the other. */
export function getEditDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let i = 1; i <= a.length; i++) {
        const current = [i];

        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        previous = current;
    }

    return previous[b.length];
}
