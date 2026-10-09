// The .ts extension lets the dev server's Node config loader import this file too (vite-plugins/map-save-plugin.ts).
import { getTileIds, type Tileset } from './tileset.ts';
import { layerNames, type WorldMap } from './world-map.ts';

/**
 * Formats a map as the JSON stored in map files: indented with 4 spaces, with every layer written as one line per
 * row of tiles so the file stays readable and diffs stay small.
 */
export function serializeWorldMap(map: WorldMap): string {
    const placeholders = Object.fromEntries(layerNames.map((layer) => [layer, `__layer_${layer}__`]));
    const json = JSON.stringify({ ...map, layers: placeholders }, null, 4);

    return (
        layerNames.reduce((result, layer) => {
            const rows: string[] = [];

            for (let start = 0; start < map.layers[layer].length; start += map.width) {
                rows.push(`            ${map.layers[layer].slice(start, start + map.width).join(', ')}`);
            }

            return result.replace(`"${placeholders[layer]}"`, `[\n${rows.join(',\n')}\n        ]`);
        }, json) + '\n'
    );
}

/** Formats a tileset as the JSON stored in tileset files: indented with 4 spaces, one line per tile. */
export function serializeTileset(tileset: Tileset): string {
    const tiles = getTileIds(tileset).map((tileId) => {
        const fields = Object.entries(tileset.tiles[tileId]).map(
            ([key, value]) => `${JSON.stringify(key)}: ${formatTileValue(value)}`
        );

        return `        "${tileId}": { ${fields.join(', ')} }`;
    });
    const json = JSON.stringify({ ...tileset, tiles: '__tiles__' }, null, 4);

    return json.replace('"__tiles__"', `{\n${tiles.join(',\n')}\n    }`) + '\n';
}

function formatTileValue(value: unknown): string {
    if (
        value &&
        typeof value === 'object' &&
        'frames' in value &&
        Array.isArray(value.frames) &&
        'frameDuration' in value
    ) {
        return `{ "frames": [${value.frames.join(', ')}], "frameDuration": ${JSON.stringify(value.frameDuration)} }`;
    }

    return JSON.stringify(value);
}
