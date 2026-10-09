import { parseTileset } from '../world-map/tileset';
import { parseWorldMap } from '../world-map/world-map';

// Only imported by production builds: in the dev server the editor reads the files through the API instead, so that
// adding or saving a file does not hot-reload the editor.
const mapFiles = import.meta.glob('../assets/maps/*.json', { eager: true, import: 'default' });
const tilesetFiles = import.meta.glob('../assets/tilesets/*.json', { eager: true, import: 'default' });

export const bundledFiles = {
    maps: Object.values(mapFiles).map(parseWorldMap),
    tilesets: Object.values(tilesetFiles).map(parseTileset)
};
