import { describe, expect, it } from 'vitest';
import type { Tileset } from '../world-map/tileset';
import { createEmptyWorldMap } from '../world-map/world-map';
import { drawItem, drawMap, drawResource, drawShip, getTileAtPoint } from './map-renderer';

const tileset: Tileset = { id: 'test', image: 'test.png', tileSize: 16, columns: 4, tiles: {} };

function createRecordingContext() {
    const drawImageCalls: number[][] = [];
    const context = {
        drawImage: (_image: unknown, ...args: number[]) => drawImageCalls.push(args),
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        clearRect: () => {},
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        imageSmoothingEnabled: true,
        globalAlpha: 1
    } as unknown as CanvasRenderingContext2D;

    return { context, drawImageCalls };
}

describe('getTileAtPoint', () => {
    const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 3, height: 2, tilesetId: 'test' });

    it('returns the tile under a point', () => {
        expect(getTileAtPoint(map, 48, 0, 0)).toEqual({ x: 0, y: 0 });
        expect(getTileAtPoint(map, 48, 143, 95)).toEqual({ x: 2, y: 1 });
    });

    it('returns null outside the map', () => {
        expect(getTileAtPoint(map, 48, 144, 0)).toBeNull();
        expect(getTileAtPoint(map, 48, -1, 0)).toBeNull();
    });
});

describe('drawMap', () => {
    it('draws non-empty tiles bottom layer first, scaled, with smoothing off', () => {
        const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 2, height: 1, tilesetId: 'test' });
        map.layers.ground = [1, 0];
        map.layers.overhead = [6, 0];
        const { context, drawImageCalls } = createRecordingContext();

        drawMap(context, map, tileset, {} as CanvasImageSource, { scale: 3 });

        expect(context.imageSmoothingEnabled).toBe(false);
        expect(drawImageCalls).toEqual([
            [0, 0, 16, 16, 0, 0, 48, 48],
            [16, 16, 16, 16, 0, 0, 48, 48]
        ]);
    });

    it('skips hidden layers', () => {
        const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 1, height: 1, tilesetId: 'test', fillTileId: 1 });
        map.layers.overhead = [6];
        const { context, drawImageCalls } = createRecordingContext();

        drawMap(context, map, tileset, {} as CanvasImageSource, { scale: 1, layerOpacity: { ground: 0 } });

        expect(drawImageCalls).toEqual([[16, 16, 16, 16, 0, 0, 16, 16]]);
    });

    it('draws only the requested layers', () => {
        const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 1, height: 1, tilesetId: 'test', fillTileId: 1 });
        map.layers.overhead = [6];
        const { context, drawImageCalls } = createRecordingContext();

        drawMap(context, map, tileset, {} as CanvasImageSource, {
            scale: 1,
            layers: ['overhead'],
            showEntities: false
        });

        expect(drawImageCalls).toEqual([[16, 16, 16, 16, 0, 0, 16, 16]]);
    });

    it('draws animated tile frames for the given time', () => {
        const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 1, height: 1, tilesetId: 'test', fillTileId: 1 });
        const animatedTileset: Tileset = {
            ...tileset,
            tiles: { '1': { name: 'Water', animation: { frames: [1, 5], frameDuration: 100 } } }
        };
        const { context, drawImageCalls } = createRecordingContext();

        drawMap(context, map, animatedTileset, {} as CanvasImageSource, { scale: 1, time: 100 });

        expect(drawImageCalls[0]).toEqual([0, 16, 16, 16, 0, 0, 16, 16]);
    });

    it('draws only tiles inside the viewport when one is provided', () => {
        const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 4, height: 3, tilesetId: 'test', fillTileId: 1 });
        const { context, drawImageCalls } = createRecordingContext();

        drawMap(context, map, tileset, {} as CanvasImageSource, {
            scale: 1,
            viewport: { left: 1, top: 1, width: 2, height: 1 }
        });

        expect(drawImageCalls).toEqual([
            [0, 0, 16, 16, 16, 16, 16, 16],
            [0, 0, 16, 16, 32, 16, 16, 16]
        ]);
    });

    it('draws NPCs with the frame for their sprite and facing', () => {
        const map = createEmptyWorldMap({ id: 'm', name: 'M', width: 2, height: 1, tilesetId: 'test' });
        map.entities = [
            { type: 'npc', id: 'n', x: 1, y: 0, sprite: 'girl', facing: 'left', movement: 'static', script: 's' }
        ];
        map.scripts = { s: [] };
        const sheet = {
            image: 'c.png',
            frameSize: 16,
            facings: ['down', 'up', 'left', 'right'] as const,
            sprites: ['npc', 'girl']
        };
        const { context, drawImageCalls } = createRecordingContext();

        drawMap(context, map, tileset, {} as CanvasImageSource, {
            scale: 2,
            sprites: { sheet: { ...sheet, facings: [...sheet.facings] }, image: {} as CanvasImageSource }
        });

        expect(drawImageCalls).toEqual([[32, 16, 16, 16, 32, 0, 32, 32]]);
    });
});

describe('drawItem', () => {
    it('draws the item ball inside its tile, in 16ths of the tile size', () => {
        const rectangles: number[][] = [];
        const { context } = createRecordingContext();

        context.fillRect = (...args: number[]) => rectangles.push(args);
        drawItem(context, 48, 96, 48);

        expect(rectangles.length).toBeGreaterThan(50);
        for (const [left, top, width, height] of rectangles) {
            expect(width).toBe(3);
            expect(height).toBe(3);
            expect(left).toBeGreaterThanOrEqual(48);
            expect(left + width).toBeLessThanOrEqual(96);
            expect(top).toBeGreaterThanOrEqual(96);
            expect(top + height).toBeLessThanOrEqual(144);
        }
    });
});

describe('drawResource', () => {
    it('draws resource pixel art inside its tile, in 16ths of the tile size', () => {
        const rectangles: number[][] = [];
        const { context } = createRecordingContext();

        context.fillRect = (...args: number[]) => rectangles.push(args);
        drawResource(context, 'fruit', 48, 96, 48);

        expect(rectangles.length).toBeGreaterThan(40);
        for (const [left, top, width, height] of rectangles) {
            expect(width).toBe(3);
            expect(height).toBe(3);
            expect(left).toBeGreaterThanOrEqual(48);
            expect(left + width).toBeLessThanOrEqual(96);
            expect(top).toBeGreaterThanOrEqual(96);
            expect(top + height).toBeLessThanOrEqual(144);
        }
    });
});

describe('drawShip', () => {
    function drawnPixels(facing: 'left' | 'right' | 'up') {
        const rectangles: string[] = [];
        const { context } = createRecordingContext();

        context.fillRect = (left: number, top: number) => rectangles.push(`${left},${top}`);
        drawShip(context, facing, 0, 0, 16);

        return rectangles;
    }

    it('draws the ship inside its tile and mirrors it when facing left', () => {
        const right = drawnPixels('right');
        const left = drawnPixels('left');

        expect(right.length).toBeGreaterThan(50);
        expect(left.sort()).toEqual(
            right
                .map((point) => point.split(',').map(Number))
                .map(([x, y]) => `${15 - x},${y}`)
                .sort()
        );
        expect(drawnPixels('up')).not.toEqual(right);
    });
});
