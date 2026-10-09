import { describe, expect, it } from 'vitest';
import overworld from '../assets/tilesets/overworld.json';
import { getAnimatedTileId, getTileIds, getTileSourcePosition, parseTileset } from './tileset';

describe('tileset', () => {
    const tileset = parseTileset(overworld);

    it('lists tile ids in order', () => {
        expect(getTileIds(tileset)).toEqual(Array.from({ length: 66 }, (_, index) => index + 1));
    });

    it('maps 1-based tile ids to positions in the image', () => {
        expect(getTileSourcePosition(tileset, 1)).toEqual({ column: 0, row: 0 });
        expect(getTileSourcePosition(tileset, 4)).toEqual({ column: 3, row: 0 });
        expect(getTileSourcePosition(tileset, 5)).toEqual({ column: 0, row: 1 });
    });

    it('rejects tile id 0', () => {
        expect(() => parseTileset({ ...overworld, tiles: { '0': { name: 'Nothing' } } })).toThrow();
    });

    it('resolves animated tile frames from time', () => {
        const animated = parseTileset({
            ...overworld,
            tiles: { ...overworld.tiles, '1': { name: 'Grass', animation: { frames: [1, 2], frameDuration: 100 } } }
        });

        expect(getAnimatedTileId(animated, 1, 0)).toBe(1);
        expect(getAnimatedTileId(animated, 1, 100)).toBe(2);
        expect(getAnimatedTileId(animated, 1, 200)).toBe(1);
    });
});
