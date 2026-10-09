import { describe, expect, it } from 'vitest';
import map1 from '../assets/maps/world-map-1.json';
import {
    createEmptyWorldMap,
    getEntitiesAt,
    getFloodFillIndices,
    getTile,
    parseWorldMap,
    type WorldMap
} from './world-map';

function createTestMap(overrides: Partial<WorldMap> = {}): WorldMap {
    return {
        ...createEmptyWorldMap({ id: 'test', name: 'Test', width: 3, height: 2, tilesetId: 'overworld' }),
        ...overrides
    };
}

describe('parseWorldMap', () => {
    it('accepts the bundled sample map', () => {
        expect(() => parseWorldMap(map1)).not.toThrow();
    });

    it('rejects layers whose length does not match width × height', () => {
        const map = createTestMap();
        map.layers.ground = [1, 1];

        expect(() => parseWorldMap(map)).toThrow(/Layer must have 6 tiles/);
    });

    it('rejects entities outside the map', () => {
        const map = createTestMap({
            entities: [{ type: 'warp', id: 'door', x: 3, y: 0, target: { mapId: 'house', x: 0, y: 0 } }]
        });

        expect(() => parseWorldMap(map)).toThrow(/outside the map/);
    });

    it('rejects triggers that extend past the map edge', () => {
        const map = createTestMap({
            entities: [{ type: 'trigger', id: 't', x: 1, y: 0, width: 3, height: 1, on: 'step', script: 's' }],
            scripts: { s: [] }
        });

        expect(() => parseWorldMap(map)).toThrow(/outside the map/);
    });

    it('rejects references to unknown scripts', () => {
        const map = createTestMap({ entities: [{ type: 'sign', id: 'sign', x: 0, y: 0, script: 'missing' }] });

        expect(() => parseWorldMap(map)).toThrow(/Unknown script "missing"/);
    });

    it('rejects duplicate entity ids', () => {
        const map = createTestMap({
            entities: [
                { type: 'sign', id: 'a', x: 0, y: 0, script: 's' },
                { type: 'sign', id: 'a', x: 1, y: 0, script: 's' }
            ],
            scripts: { s: [{ type: 'say', text: 'hi' }] }
        });

        expect(() => parseWorldMap(map)).toThrow(/Duplicate entity id "a"/);
    });

    it('validates nested script actions', () => {
        const map = createTestMap({
            scripts: { s: [{ type: 'if', flag: 'f', then: [{ type: 'say', text: 42 }] }] }
        } as unknown as Partial<WorldMap>);

        expect(() => parseWorldMap(map)).toThrow();
    });
});

describe('map helpers', () => {
    it('reads tiles by coordinate and returns 0 outside the map', () => {
        const map = createTestMap();
        map.layers.ground = [1, 2, 3, 4, 5, 6];

        expect(getTile(map, 'ground', 2, 1)).toBe(6);
        expect(getTile(map, 'ground', 3, 0)).toBe(0);
        expect(getTile(map, 'ground', -1, 0)).toBe(0);
    });

    it('finds entities covering a tile, including multi-tile triggers', () => {
        const map = createTestMap({
            entities: [{ type: 'trigger', id: 't', x: 0, y: 0, width: 2, height: 2, on: 'step', script: 's' }],
            scripts: { s: [] }
        });

        expect(getEntitiesAt(map, 1, 1).map((entity) => entity.id)).toEqual(['t']);
        expect(getEntitiesAt(map, 2, 1)).toEqual([]);
    });
});

describe('getFloodFillIndices', () => {
    it('returns tiles connected up, down, left and right that share the tile id', () => {
        const map = createTestMap();
        // 1 1 2
        // 2 1 1
        map.layers.ground = [1, 1, 2, 2, 1, 1];

        expect(getFloodFillIndices(map, 'ground', 0, 0).sort()).toEqual([0, 1, 4, 5]);
        expect(getFloodFillIndices(map, 'ground', 2, 0)).toEqual([2]);
    });

    it('does not connect diagonally', () => {
        const map = createTestMap();
        // 1 2 2
        // 2 1 2
        map.layers.ground = [1, 2, 2, 2, 1, 2];

        expect(getFloodFillIndices(map, 'ground', 0, 0)).toEqual([0]);
    });

    it('returns nothing outside the map', () => {
        expect(getFloodFillIndices(createTestMap(), 'ground', 5, 5)).toEqual([]);
    });
});
