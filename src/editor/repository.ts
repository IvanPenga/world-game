import { serializeTileset, serializeWorldMap } from '../world-map/map-file';
import type { Tileset } from '../world-map/tileset';
import type { WorldMap } from '../world-map/world-map';

export type InvalidFile = { file: string; error: string };

export type Listing<T> = {
    items: T[];
    /** Files that are not valid documents, e.g. a map file edited by hand with a mistake. */
    invalid: InvalidFile[];
};

/** Where the editor reads and saves maps and tilesets. */
export type EditorRepository = {
    listMaps: () => Promise<Listing<WorldMap>>;
    listTilesets: () => Promise<Listing<Tileset>>;
    saveMap: (map: WorldMap) => Promise<void>;
    saveTileset: (tileset: Tileset) => Promise<void>;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(body.error ?? `${init?.method ?? 'GET'} ${url} failed (${response.status})`);
    }

    return body;
}

function put(url: string, document: unknown) {
    return request<unknown>(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document)
    }).then(() => {});
}

/** Reads and writes the files in src/assets through the dev server (see vite-plugins/editor-files-plugin.ts). */
export function createDevServerRepository(): EditorRepository {
    return {
        listMaps: () => request('/api/maps'),
        listTilesets: () => request('/api/tilesets'),
        saveMap: (map) => put(`/api/maps/${encodeURIComponent(map.id)}`, map),
        saveTileset: (tileset) => put(`/api/tilesets/${encodeURIComponent(tileset.id)}`, tileset)
    };
}

function download(fileName: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * For builds without a dev server: starts with the files bundled into the build. Saving downloads the file and keeps
 * the saved version for the rest of the session.
 */
export function createBundledRepository(bundled: { maps: WorldMap[]; tilesets: Tileset[] }): EditorRepository {
    const maps = new Map(bundled.maps.map((map) => [map.id, map]));
    const tilesets = new Map(bundled.tilesets.map((tileset) => [tileset.id, tileset]));

    return {
        listMaps: async () => ({ items: [...maps.values()], invalid: [] }),
        listTilesets: async () => ({ items: [...tilesets.values()], invalid: [] }),
        saveMap: async (map) => {
            download(`${map.id}.json`, serializeWorldMap(map));
            maps.set(map.id, map);
        },
        saveTileset: async (tileset) => {
            download(`${tileset.id}.json`, serializeTileset(tileset));
            tilesets.set(tileset.id, tileset);
        }
    };
}
