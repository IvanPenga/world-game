import { describe, expect, it } from 'vitest';
import mapFileText from '../assets/maps/world-map-1.json?raw';
import tilesetFileText from '../assets/tilesets/overworld.json?raw';
import { serializeTileset, serializeWorldMap } from './map-file';
import { parseTileset } from './tileset';
import { createEmptyWorldMap, parseWorldMap } from './world-map';

describe('serializeWorldMap', () => {
    it('reproduces the bundled sample map file exactly', () => {
        expect(serializeWorldMap(parseWorldMap(JSON.parse(mapFileText)))).toBe(mapFileText);
    });

    it('writes one line per row of tiles and round-trips', () => {
        const map = createEmptyWorldMap({ id: 'test', name: 'Test', width: 3, height: 2, tilesetId: 'overworld' });
        map.layers.ground = [1, 2, 3, 4, 5, 6];
        const text = serializeWorldMap(map);

        expect(text).toContain('"ground": [\n            1, 2, 3,\n            4, 5, 6\n        ]');
        expect(parseWorldMap(JSON.parse(text))).toEqual(map);
    });
});

describe('serializeTileset', () => {
    it('reproduces the bundled tileset file exactly', () => {
        expect(serializeTileset(parseTileset(JSON.parse(tilesetFileText)))).toBe(tilesetFileText);
    });
});
