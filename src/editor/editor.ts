import itemsFile from '../assets/items/items.json';
import charactersSheet from '../assets/sprites/characters.json';
import { parseItemCatalog } from '../world-map/items';
import { parseSpriteSheet } from '../world-map/sprite-sheet';
import { createEmptyWorldMap } from '../world-map/world-map';
import { createLocalDraftStorage } from './drafts';
import { createEditorHook, createEditorStore, hasUnsavedMapChanges, hasUnsavedTilesetChanges } from './editor-store';
import { createBundledRepository, createDevServerRepository } from './repository';

const lastMapKey = 'world-editor:last-map';
const draftDelay = 500;

export const spriteSheet = parseSpriteSheet(charactersSheet);

/** Every item the player can carry. The editor only reads it; edit src/assets/items/items.json by hand. */
export const itemCatalog = parseItemCatalog(itemsFile);

// The dev server reads and saves the files in src/assets; a production build only has the files bundled into it.
const repository = import.meta.env.DEV
    ? createDevServerRepository()
    : createBundledRepository((await import('./bundled-files')).bundledFiles);
const drafts = createLocalDraftStorage();

function readLastMapId(): string | null {
    try {
        return window.localStorage.getItem(lastMapKey);
    } catch {
        return null;
    }
}

async function createInitialStore() {
    const [mapListing, tilesetListing] = await Promise.all([repository.listMaps(), repository.listTilesets()]);
    const maps = Object.fromEntries(mapListing.items.map((map) => [map.id, map]));
    const tilesets = Object.fromEntries(tilesetListing.items.map((tileset) => [tileset.id, tileset]));
    const invalidFiles = [...mapListing.invalid, ...tilesetListing.invalid];
    const lastMapId = readLastMapId();
    const map = (lastMapId && maps[lastMapId]) || mapListing.items[0];
    const tileset = tilesets[map?.tilesetId] ?? tilesetListing.items[0];

    if (!tileset) {
        throw new Error('There is no tileset in src/assets/tilesets');
    }
    const defaultItemId = itemCatalog.items[0]?.id;

    if (map) {
        return createEditorStore({ map, tileset, maps, tilesets, invalidFiles, repository, drafts, defaultItemId });
    }

    return createEditorStore({
        map: createEmptyWorldMap({ id: 'map-1', name: 'Map 1', width: 20, height: 18, tilesetId: tileset.id }),
        tileset,
        savedMap: null,
        maps,
        tilesets,
        invalidFiles,
        repository,
        drafts,
        defaultItemId
    });
}

export const editorStore = await createInitialStore();

export const useEditor = createEditorHook(editorStore);

// Keeps a draft of unsaved changes (written a moment after the last edit) and remembers the open map.
let draftTimer: ReturnType<typeof setTimeout> | undefined;

editorStore.subscribe((state, previous) => {
    if (state.map === previous.map && state.tileset === previous.tileset && state.savedMap === previous.savedMap) {
        return;
    }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
        const current = editorStore.getState();

        if (hasUnsavedMapChanges(current)) {
            drafts.save('map', current.map.id, current.map);
        }
        if (hasUnsavedTilesetChanges(current)) {
            drafts.save('tileset', current.tileset.id, current.tileset);
        }
    }, draftDelay);

    if (state.savedMap && (state.map.id !== previous.map.id || !previous.savedMap)) {
        try {
            window.localStorage.setItem(lastMapKey, state.map.id);
        } catch {
            // Remembering the map is only a convenience.
        }
    }
});
