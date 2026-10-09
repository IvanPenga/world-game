import { describe, expect, it } from 'vitest';
import { getResizeOffset, resizeWorldMap } from './resize';
import { createEmptyWorldMap, getTile, validateWorldMap, type WorldMap } from './world-map';

function createTestMap(): WorldMap {
    const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 3, height: 2, tilesetId: 'overworld' });
    map.layers.ground = [1, 2, 3, 4, 5, 6];

    return map;
}

describe('resizeWorldMap', () => {
    it('grows to the right and bottom from the top-left, filling the ground layer', () => {
        const { map } = resizeWorldMap(createTestMap(), 4, 3, 'top-left', 9);

        expect(map.layers.ground).toEqual([1, 2, 3, 9, 4, 5, 6, 9, 9, 9, 9, 9]);
        expect(map.layers.decoration).toEqual(Array(12).fill(0));
        expect(validateWorldMap(map)).toBeNull();
    });

    it('keeps the anchored side in place', () => {
        const map = createTestMap();

        expect(getResizeOffset(map, 5, 4, 'bottom-right')).toEqual({ x: 2, y: 2 });
        expect(getResizeOffset(map, 5, 4, 'middle-center')).toEqual({ x: 1, y: 1 });
        expect(getTile(resizeWorldMap(map, 5, 4, 'bottom-right').map, 'ground', 2, 2)).toBe(1);
    });

    it('crops when shrinking', () => {
        const { map } = resizeWorldMap(createTestMap(), 2, 1, 'bottom-right');

        expect(map.layers.ground).toEqual([5, 6]);
    });

    it('moves entities, cuts triggers to the map and removes entities outside it with unused scripts', () => {
        const map = createTestMap();
        map.entities = [
            { type: 'sign', id: 'sign', x: 0, y: 0, script: 'shared' },
            { type: 'sign', id: 'other-sign', x: 2, y: 1, script: 'shared' },
            { type: 'npc', id: 'npc', x: 2, y: 0, sprite: 'npc', facing: 'down', movement: 'static', script: 'npc' },
            { type: 'trigger', id: 'trigger', x: 0, y: 1, width: 3, height: 1, on: 'step', script: 'shared' }
        ];
        map.scripts = { shared: [], npc: [] };

        const result = resizeWorldMap(map, 2, 2, 'top-right');

        expect(result.removedEntityIds).toEqual(['sign']);
        expect(result.map.entities).toEqual([
            { type: 'sign', id: 'other-sign', x: 1, y: 1, script: 'shared' },
            { type: 'npc', id: 'npc', x: 1, y: 0, sprite: 'npc', facing: 'down', movement: 'static', script: 'npc' },
            { type: 'trigger', id: 'trigger', x: 0, y: 1, width: 2, height: 1, on: 'step', script: 'shared' }
        ]);
        expect(Object.keys(result.map.scripts)).toEqual(['shared', 'npc']);
        expect(validateWorldMap(result.map)).toBeNull();
    });
});
