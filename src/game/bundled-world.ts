import items from '../assets/items/items.json';
import characters from '../assets/sprites/characters.json';
import { parseItemCatalog } from '../world-map/items';
import { parseSpriteSheet } from '../world-map/sprite-sheet';
import { parseTileset } from '../world-map/tileset';
import { parseWorldMap } from '../world-map/world-map';

const mapFiles = import.meta.glob('../assets/maps/*.json', { eager: true, import: 'default' });
const tilesetFiles = import.meta.glob('../assets/tilesets/*.json', { eager: true, import: 'default' });

export const bundledWorld = {
    maps: Object.fromEntries(
        Object.values(mapFiles).map((data) => {
            const map = parseWorldMap(data);

            return [map.id, map];
        })
    ),
    tilesets: Object.fromEntries(
        Object.values(tilesetFiles).map((data) => {
            const tileset = parseTileset(data);

            return [tileset.id, tileset];
        })
    ),
    items: parseItemCatalog(items),
    spriteSheet: parseSpriteSheet(characters)
};
