import { describe, expect, it } from 'vitest';
import { getEditDistance, lintWorldMap, type LintContext } from './lint';
import type { Tileset } from './tileset';
import { createEmptyWorldMap, type WorldMap } from './world-map';

const tileset: Tileset = {
    id: 'overworld',
    image: 'overworld.png',
    tileSize: 16,
    columns: 4,
    tiles: {
        '1': { name: 'Grass' },
        '4': { name: 'Water', collision: 'water' },
        '5': { name: 'Tree', collision: 'solid' }
    }
};

/** A 5×3 grass map with a door at (0, 1) that the house map leads back to. */
function createTestMap(): WorldMap {
    return {
        ...createEmptyWorldMap({
            id: 'route',
            name: 'Route',
            width: 5,
            height: 3,
            tilesetId: 'overworld',
            fillTileId: 1
        }),
        entities: [{ type: 'warp', id: 'door', x: 0, y: 1, target: { mapId: 'house', x: 1, y: 1 } }]
    };
}

function createHouse(): WorldMap {
    return {
        ...createEmptyWorldMap({
            id: 'house',
            name: 'House',
            width: 3,
            height: 3,
            tilesetId: 'overworld',
            fillTileId: 1
        }),
        entities: [{ type: 'warp', id: 'exit', x: 1, y: 2, target: { mapId: 'route', x: 0, y: 1 } }]
    };
}

function lint(map: WorldMap, overrides: Partial<LintContext> = {}) {
    return lintWorldMap(map, {
        tileset,
        maps: { house: createHouse() },
        tilesets: { overworld: tileset },
        spriteIds: ['npc'],
        itemIds: ['potion', 'wood'],
        ...overrides
    }).map((problem) => problem.message);
}

describe('lintWorldMap', () => {
    it('finds nothing wrong with a simple connected map', () => {
        expect(lint(createTestMap())).toEqual([]);
    });

    it('reports warps to missing maps, outside the target map or onto water', () => {
        const map = createTestMap();
        const house = createHouse();
        house.layers.ground[0] = 4;
        map.entities.push(
            { type: 'warp', id: 'lost', x: 1, y: 0, target: { mapId: 'nowhere', x: 0, y: 0 } },
            { type: 'warp', id: 'far', x: 2, y: 0, target: { mapId: 'house', x: 9, y: 0 } },
            { type: 'warp', id: 'wet', x: 3, y: 0, target: { mapId: 'house', x: 0, y: 0 } }
        );

        expect(lint(map, { maps: { house } })).toEqual([
            'warp "lost" leads to map "nowhere", which does not exist',
            'warp "far" leads to (9, 0) in "house", outside that map (3×3)',
            'warp "wet" lands on a water tile at (0, 0) in "house"'
        ]);
    });

    it('reports walkable areas that no warp leads to', () => {
        const map = createTestMap();
        // A wall of trees at x = 2 cuts off the right side.
        for (const y of [0, 1, 2]) {
            map.layers.ground[y * 5 + 2] = 5;
        }

        expect(lint(map)).toEqual(['6 walkable tiles around (3, 0) cannot be reached from any warp']);
    });

    it('counts land a ship can sail to as reachable', () => {
        const map = createTestMap();
        // A river at x = 2 cuts off the right side; a ship on it reaches the other bank.
        for (const y of [0, 1, 2]) {
            map.layers.ground[y * 5 + 2] = 4;
        }
        expect(lint(map)).toEqual(['6 walkable tiles around (3, 0) cannot be reached from any warp']);

        map.entities.push({ type: 'ship', id: 'ferry', x: 2, y: 1, facing: 'down' });
        expect(lint(map)).toEqual([]);
    });

    it('reports ships on land and ships nobody can board', () => {
        const map = createTestMap();
        for (const y of [0, 1, 2]) {
            for (const x of [1, 2, 3]) {
                map.layers.ground[y * 5 + x] = 4;
            }
        }
        map.entities.push(
            { type: 'ship', id: 'beached', x: 0, y: 0, facing: 'down' },
            { type: 'ship', id: 'adrift', x: 2, y: 1, facing: 'down' }
        );

        expect(lint(map)).toEqual([
            'Ship "beached" is not on water',
            'Ship "adrift" has no walkable tile next to it, so the player cannot board it',
            '3 walkable tiles around (4, 0) cannot be reached from any warp'
        ]);
    });

    it('reports NPCs on solid tiles, unknown sprites and entities on the same tile', () => {
        const map = createTestMap();
        map.layers.ground[4] = 5;
        map.entities.push(
            { type: 'npc', id: 'stuck', x: 4, y: 0, sprite: 'ghost', facing: 'down', movement: 'static', script: 's' },
            { type: 'sign', id: 'sign', x: 4, y: 0, script: 's' }
        );
        map.scripts.s = [{ type: 'say', text: 'Hi' }];

        expect(lint(map)).toEqual([
            'NPC "stuck" stands on a solid tile',
            '"stuck" and "sign" are on the same tile',
            'NPC "stuck" uses sprite "ghost", which is not in the sprite sheet'
        ]);
    });

    it('reports flags that are checked but never set, suggesting a close name', () => {
        const map = createTestMap();
        map.entities.push({ type: 'sign', id: 'sign', x: 3, y: 0, script: 's' });
        map.scripts.s = [
            { type: 'setFlag', flag: 'met-old-man', value: true },
            { type: 'if', flag: 'met-oldman', then: [] }
        ];

        expect(lint(map)).toEqual([
            'Flag "met-oldman" is checked in "s" but never set in any map. Did you mean "met-old-man"?',
            'Flag "met-old-man" is set but never checked in any map'
        ]);
    });

    it('reports items on solid tiles, unknown items and items given without a name', () => {
        const map = createTestMap();
        map.layers.ground[4] = 5;
        map.entities.push(
            { type: 'item', id: 'lost', x: 4, y: 0, item: 'potion' },
            { type: 'item', id: 'odd', x: 3, y: 2, item: 'unknown' },
            { type: 'sign', id: 'sign', x: 3, y: 0, script: 's' }
        );
        map.scripts.s = [
            { type: 'giveItem', item: 'potion' },
            { type: 'giveItem', item: 'elixir' },
            { type: 'giveItem', item: '' },
            { type: 'say', text: 'Here you go' }
        ];

        expect(lint(map)).toEqual([
            'Item "lost" lies on a solid tile, where the player cannot reach it',
            'Item "odd" holds "unknown", which is not in the item catalog',
            'Script "s" gives "elixir", which is not in the item catalog',
            'Script "s" gives an item without a name'
        ]);
    });

    it('reports resources on solid tiles and resources missing from the item catalog', () => {
        const map = createTestMap();
        map.layers.ground[4] = 5;
        map.entities.push(
            { type: 'resource', id: 'branches', x: 4, y: 0, resource: 'wood' },
            { type: 'resource', id: 'fruit', x: 3, y: 2, resource: 'fruit' }
        );

        expect(lint(map)).toEqual([
            'Resource "branches" lies on a solid tile, where the player cannot reach it',
            'Resource "fruit" holds "fruit", which is not in the item catalog'
        ]);
    });

    it('reports tiles that are not in the tileset', () => {
        const map = createTestMap();
        map.layers.decoration[3] = 42;

        expect(lint(map)).toEqual([
            'Tile 42 on the decoration layer is not in tileset "overworld" (1×, first at (3, 0))'
        ]);
    });
});

describe('getEditDistance', () => {
    it('counts single-character edits', () => {
        expect(getEditDistance('kitten', 'sitting')).toBe(3);
        expect(getEditDistance('', 'abc')).toBe(3);
        expect(getEditDistance('same', 'same')).toBe(0);
    });
});
