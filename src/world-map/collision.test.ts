import { describe, expect, it } from 'vitest';
import { getCollisionAt } from './collision';
import type { Tileset } from './tileset';
import { createEmptyWorldMap } from './world-map';

const tileset: Tileset = {
    id: 'test',
    image: 'test.png',
    tileSize: 16,
    columns: 4,
    tiles: {
        '1': { name: 'Grass' },
        '2': { name: 'Water', collision: 'water' },
        '3': { name: 'Rock', collision: 'solid' }
    }
};

function setup() {
    return createEmptyWorldMap({ id: 'm', name: 'M', width: 3, height: 1, tilesetId: 'test', fillTileId: 1 });
}

describe('getCollisionAt', () => {
    it('is walkable when no tile has collision', () => {
        expect(getCollisionAt(setup(), tileset, 0, 0)).toBeNull();
    });

    it('combines ground and decoration, with solid winning over water', () => {
        const map = setup();
        map.layers.ground = [2, 2, 1];
        map.layers.decoration = [0, 3, 3];

        expect(getCollisionAt(map, tileset, 0, 0)).toBe('water');
        expect(getCollisionAt(map, tileset, 1, 0)).toBe('solid');
        expect(getCollisionAt(map, tileset, 2, 0)).toBe('solid');
    });

    it('ignores the overhead layer', () => {
        const map = setup();
        map.layers.overhead = [3, 0, 0];

        expect(getCollisionAt(map, tileset, 0, 0)).toBeNull();
    });

    it('treats tiles outside the map as solid', () => {
        expect(getCollisionAt(setup(), tileset, 3, 0)).toBe('solid');
        expect(getCollisionAt(setup(), tileset, 0, -1)).toBe('solid');
    });
});
