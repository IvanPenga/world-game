import { describe, expect, it, vi } from 'vitest';
import type { Tileset } from '../world-map/tileset';
import { createEmptyWorldMap, getTile, type Entity, type WorldMap } from '../world-map/world-map';
import { createMemoryDraftStorage, type DraftStorage } from './drafts';
import { createEditorStore, hasUnsavedChanges } from './editor-store';
import type { EditorRepository } from './repository';

const tileset: Tileset = {
    id: 'overworld',
    image: 'overworld.png',
    tileSize: 16,
    columns: 4,
    tiles: { '1': { name: 'Grass' }, '5': { name: 'Tree', collision: 'solid' } }
};

function createTestMap(id = 'test', width = 4, height = 4): WorldMap {
    return createEmptyWorldMap({ id, name: id, width, height, tilesetId: 'overworld' });
}

/** A repository that keeps "files" in memory. */
function createTestRepository(maps: WorldMap[] = [createTestMap()]) {
    const files = { maps: new Map(maps.map((map) => [map.id, map])), tilesets: new Map([[tileset.id, tileset]]) };
    const repository: EditorRepository = {
        listMaps: async () => ({ items: [...files.maps.values()], invalid: [] }),
        listTilesets: async () => ({ items: [...files.tilesets.values()], invalid: [] }),
        saveMap: vi.fn(async (map: WorldMap) => void files.maps.set(map.id, map)),
        saveTileset: vi.fn(async (saved: Tileset) => void files.tilesets.set(saved.id, saved))
    };

    return { files, repository };
}

function setup(options: { repository?: EditorRepository; drafts?: DraftStorage; map?: WorldMap } = {}) {
    const map = options.map ?? createTestMap();

    return createEditorStore({ map, tileset, repository: options.repository, drafts: options.drafts });
}

describe('editor store', () => {
    it('paints the selected tile on the active layer', () => {
        const store = setup();
        store.getState().selectTile(5);
        store.getState().setActiveLayer('decoration');
        store.getState().paintTile(1, 2);

        const { map } = store.getState();
        expect(getTile(map, 'decoration', 1, 2)).toBe(5);
        expect(getTile(map, 'ground', 1, 2)).toBe(0);
    });

    it('does not mutate previous map snapshots', () => {
        const store = setup();
        const before = store.getState().map;
        store.getState().paintTile(0, 0);

        expect(getTile(before, 'ground', 0, 0)).toBe(0);
        expect(store.getState().map).not.toBe(before);
    });

    it('ignores out-of-bounds and no-op paints without adding history', () => {
        const store = setup();
        store.getState().paintTile(10, 10);
        store.getState().selectTile(0);
        store.getState().paintTile(0, 0);

        expect(store.getState().past).toHaveLength(0);
    });

    it('undoes and redoes edits', () => {
        const store = setup();
        store.getState().paintTile(0, 0);
        store.getState().paintTile(1, 0);

        store.getState().undo();
        expect(getTile(store.getState().map, 'ground', 1, 0)).toBe(0);
        expect(getTile(store.getState().map, 'ground', 0, 0)).toBe(1);

        store.getState().redo();
        expect(getTile(store.getState().map, 'ground', 1, 0)).toBe(1);
    });

    it('clears redo history after a new edit', () => {
        const store = setup();
        store.getState().paintTile(0, 0);
        store.getState().undo();
        store.getState().paintTile(2, 2);

        expect(store.getState().future).toHaveLength(0);
    });

    it('groups paints during a stroke into a single undo step', () => {
        const store = setup();
        store.getState().beginStroke();
        store.getState().paintTile(0, 0);
        store.getState().paintTile(1, 0);
        store.getState().paintTile(2, 0);
        store.getState().endStroke();

        expect(store.getState().past).toHaveLength(1);

        store.getState().undo();
        expect(store.getState().map.layers.ground.every((tileId) => tileId === 0)).toBe(true);
    });

    it('adds no history for a stroke that changes nothing', () => {
        const store = setup();
        store.getState().selectTile(0);
        store.getState().beginStroke();
        store.getState().paintTile(0, 0);
        store.getState().endStroke();

        expect(store.getState().past).toHaveLength(0);
    });

    it('ignores undo while a stroke is in progress', () => {
        const store = setup();
        store.getState().paintTile(3, 3);
        store.getState().beginStroke();
        store.getState().paintTile(0, 0);
        store.getState().undo();
        store.getState().endStroke();

        expect(getTile(store.getState().map, 'ground', 3, 3)).toBe(1);
        expect(store.getState().past).toHaveLength(2);
    });

    it('fills a connected area as one undo step', () => {
        const store = setup();
        store.getState().selectTile(4);
        store.getState().fillArea(0, 0);

        expect(store.getState().map.layers.ground.every((tileId) => tileId === 4)).toBe(true);
        expect(store.getState().past).toHaveLength(1);

        store.getState().fillArea(2, 2);
        expect(store.getState().past).toHaveLength(1);
    });

    describe('entities', () => {
        it('places an entity with its script and selects it', () => {
            const store = setup();
            store.getState().setEntityTypeToPlace('sign');
            store.getState().placeEntity(1, 1);

            const { map, selectedEntityId, past } = store.getState();
            expect(map.entities).toEqual([{ type: 'sign', id: 'sign-1', x: 1, y: 1, script: 'sign-1' }]);
            expect(map.scripts['sign-1']).toBeDefined();
            expect(selectedEntityId).toBe('sign-1');
            expect(past).toHaveLength(1);
        });

        it('places an item holding the default item, without a script', () => {
            const store = createEditorStore({ map: createTestMap(), tileset, defaultItemId: 'potion' });
            store.getState().setEntityTypeToPlace('item');
            store.getState().placeEntity(2, 1);

            const { map, selectedEntityId } = store.getState();
            expect(map.entities).toEqual([{ type: 'item', id: 'item-1', x: 2, y: 1, item: 'potion' }]);
            expect(map.scripts).toEqual({});
            expect(selectedEntityId).toBe('item-1');
        });

        it('moves entities but keeps multi-tile triggers inside the map', () => {
            const store = setup();
            store.getState().setEntityTypeToPlace('trigger');
            store.getState().placeEntity(0, 0);
            store.getState().updateEntity('trigger-1', {
                ...(store.getState().map.entities[0] as Extract<Entity, { type: 'trigger' }>),
                width: 2
            });

            store.getState().moveEntity('trigger-1', 3, 0);
            expect(store.getState().map.entities[0]).toMatchObject({ x: 0, y: 0 });

            store.getState().moveEntity('trigger-1', 2, 3);
            expect(store.getState().map.entities[0]).toMatchObject({ x: 2, y: 3 });
        });

        it('rejects invalid updates and leaves the map unchanged', () => {
            const store = setup();
            store.getState().placeEntity(0, 0);
            const before = store.getState().map;
            const npc = before.entities[0];

            const error = store.getState().updateEntity(npc.id, { ...npc, x: 10 });

            expect(error).toMatch(/outside the map/);
            expect(store.getState().map).toBe(before);
        });

        it('renames the entity and its script, removing the old script', () => {
            const store = setup();
            store.getState().placeEntity(0, 0);
            const npc = store.getState().map.entities[0] as Extract<Entity, { type: 'npc' }>;

            const error = store
                .getState()
                .updateEntity(npc.id, { ...npc, id: 'professor', script: 'professor-talk' }, [
                    { type: 'say', text: 'Welcome!' }
                ]);

            const { map, selectedEntityId } = store.getState();
            expect(error).toBeNull();
            expect(selectedEntityId).toBe('professor');
            expect(map.scripts).toEqual({ 'professor-talk': [{ type: 'say', text: 'Welcome!' }] });
        });

        it('rejects invalid scripts', () => {
            const store = setup();
            store.getState().placeEntity(0, 0);
            const npc = store.getState().map.entities[0];

            expect(store.getState().updateEntity(npc.id, npc, [{ type: 'dance' }])).not.toBeNull();
        });

        it('deletes an entity together with its script, and undo restores both', () => {
            const store = setup();
            store.getState().placeEntity(2, 2);
            store.getState().deleteEntity('npc-1');

            expect(store.getState().map.entities).toEqual([]);
            expect(store.getState().map.scripts).toEqual({});
            expect(store.getState().selectedEntityId).toBeNull();

            store.getState().undo();
            expect(store.getState().map.entities).toHaveLength(1);
            expect(store.getState().map.scripts['npc-1']).toBeDefined();
        });
    });

    describe('view', () => {
        it('toggles layer visibility', () => {
            const store = setup();
            store.getState().toggleLayerVisibility('overhead');
            expect(store.getState().hiddenLayers).toEqual(['overhead']);

            store.getState().toggleLayerVisibility('overhead');
            expect(store.getState().hiddenLayers).toEqual([]);
        });
    });

    describe('saving', () => {
        it('starts without unsaved changes and has them after an edit', () => {
            const store = setup();
            expect(hasUnsavedChanges(store.getState())).toBe(false);

            store.getState().paintTile(0, 0);
            expect(hasUnsavedChanges(store.getState())).toBe(true);
        });

        it('writes the current map and marks it saved', async () => {
            const { repository, files } = createTestRepository();
            const store = setup({ repository });
            store.getState().paintTile(0, 0);

            await store.getState().save();

            expect(repository.saveMap).toHaveBeenCalledWith(store.getState().map);
            expect(repository.saveTileset).not.toHaveBeenCalled();
            expect(files.maps.get('test')).toBe(store.getState().map);
            expect(store.getState().maps.test).toBe(store.getState().map);
            expect(hasUnsavedChanges(store.getState())).toBe(false);
            expect(store.getState().saving).toBe(false);
        });

        it('counts undoing back to the saved map as saved', async () => {
            const store = setup();
            store.getState().paintTile(0, 0);
            await store.getState().save();

            store.getState().paintTile(1, 0);
            store.getState().undo();
            expect(hasUnsavedChanges(store.getState())).toBe(false);
        });

        it('keeps edits made while saving unsaved', async () => {
            let finishWrite = () => {};
            const { repository } = createTestRepository();
            repository.saveMap = () => new Promise<void>((resolve) => (finishWrite = resolve));
            const store = setup({ repository });
            store.getState().paintTile(0, 0);

            const saving = store.getState().save();
            expect(store.getState().saving).toBe(true);
            store.getState().paintTile(1, 0);
            finishWrite();
            await saving;

            expect(hasUnsavedChanges(store.getState())).toBe(true);
        });

        it('keeps the changes unsaved and reports the error when writing fails', async () => {
            const { repository } = createTestRepository();
            repository.saveMap = async () => {
                throw new Error('Disk full');
            };
            const store = setup({ repository });
            store.getState().paintTile(0, 0);

            await store.getState().save();

            expect(store.getState().saveError).toBe('Disk full');
            expect(hasUnsavedChanges(store.getState())).toBe(true);
            expect(store.getState().saving).toBe(false);
        });

        it('saves tileset changes, which are undoable', async () => {
            const { repository, files } = createTestRepository();
            const store = setup({ repository });

            store.getState().updateTileDefinition(2, { name: 'Sand' });
            expect(store.getState().tileset.tiles['2']).toEqual({ name: 'Sand' });
            store.getState().undo();
            expect(store.getState().tileset.tiles['2']).toBeUndefined();
            expect(hasUnsavedChanges(store.getState())).toBe(false);

            store.getState().redo();
            store.getState().updateTileDefinition(5, null);
            await store.getState().save();

            expect(files.tilesets.get('overworld')?.tiles).toEqual({ '1': { name: 'Grass' }, '2': { name: 'Sand' } });
            expect(repository.saveMap).not.toHaveBeenCalled();
        });
    });

    describe('opening maps', () => {
        it('opens another map straight away when there are no unsaved changes', async () => {
            const { repository } = createTestRepository([createTestMap(), createTestMap('house', 6, 5)]);
            const store = setup({ repository });

            await store.getState().requestNavigation({ mapId: 'house' });

            expect(store.getState().map.id).toBe('house');
            expect(store.getState().past).toEqual([]);
            expect(store.getState().maps.house).toBeDefined();
        });

        it('asks first when there are unsaved changes, and can save them', async () => {
            const { repository, files } = createTestRepository([createTestMap(), createTestMap('house')]);
            const store = setup({ repository });
            store.getState().paintTile(0, 0);

            await store.getState().requestNavigation({ mapId: 'house' });
            expect(store.getState().map.id).toBe('test');
            expect(store.getState().pendingNavigation).toEqual({ mapId: 'house' });

            await store.getState().resolveNavigation('save');
            expect(store.getState().map.id).toBe('house');
            expect(getTile(files.maps.get('test')!, 'ground', 0, 0)).toBe(1);
        });

        it('can discard the changes or cancel', async () => {
            const { repository, files } = createTestRepository([createTestMap(), createTestMap('house')]);
            const drafts = createMemoryDraftStorage();
            const store = setup({ repository, drafts });
            store.getState().paintTile(0, 0);

            await store.getState().requestNavigation({ mapId: 'house' });
            await store.getState().resolveNavigation('cancel');
            expect(store.getState().pendingNavigation).toBeNull();
            expect(store.getState().map.id).toBe('test');

            drafts.save('map', 'test', store.getState().map);
            await store.getState().requestNavigation({ mapId: 'house' });
            await store.getState().resolveNavigation('discard');
            expect(store.getState().map.id).toBe('house');
            expect(getTile(files.maps.get('test')!, 'ground', 0, 0)).toBe(0);
            expect(drafts.load('map', 'test')).toBeNull();
        });

        it('opens a new map as unsaved', async () => {
            const { repository } = createTestRepository();
            const store = setup({ repository });

            await store.getState().requestNavigation({ newMap: createTestMap('cave') });

            expect(store.getState().map.id).toBe('cave');
            expect(store.getState().savedMap).toBeNull();
            expect(hasUnsavedChanges(store.getState())).toBe(true);
        });

        it('reports maps that do not exist', async () => {
            const store = setup({ repository: createTestRepository().repository });

            await store.getState().requestNavigation({ mapId: 'nowhere' });

            expect(store.getState().loadError).toMatch(/does not exist/);
            expect(store.getState().map.id).toBe('test');
        });
    });

    describe('drafts', () => {
        it('offers to restore a draft that differs from the saved map, as an undoable change', () => {
            const drafts = createMemoryDraftStorage();
            const draftMap = { ...createTestMap(), name: 'Draft name' };
            drafts.save('map', 'test', draftMap);

            const store = setup({ drafts });
            expect(store.getState().recoverableDraft?.map).toEqual(draftMap);

            store.getState().restoreDraft();
            expect(store.getState().map.name).toBe('Draft name');
            expect(store.getState().recoverableDraft).toBeNull();
            expect(hasUnsavedChanges(store.getState())).toBe(true);

            store.getState().undo();
            expect(store.getState().map.name).toBe('test');
        });

        it('ignores and removes drafts that are invalid or equal to the saved map', () => {
            const drafts = createMemoryDraftStorage();
            drafts.save('map', 'test', createTestMap());
            drafts.save('tileset', 'overworld', { broken: true });

            const store = setup({ drafts });

            expect(store.getState().recoverableDraft).toBeNull();
            expect(drafts.listIds('map')).toEqual([]);
            expect(drafts.listIds('tileset')).toEqual([]);
        });

        it('forgets the draft when it is dismissed', () => {
            const drafts = createMemoryDraftStorage();
            drafts.save('map', 'test', { ...createTestMap(), name: 'Draft name' });
            const store = setup({ drafts });

            store.getState().dismissDraft();

            expect(store.getState().recoverableDraft).toBeNull();
            expect(drafts.load('map', 'test')).toBeNull();
        });
    });

    describe('map properties', () => {
        it('renames and resizes the map as undoable steps', () => {
            const store = setup();
            store.getState().placeEntity(3, 3);

            store.getState().setMapName('Route 2');
            const removed = store.getState().resizeMap(2, 2, 'top-left', 1);

            expect(removed).toEqual(['npc-1']);
            expect(store.getState().map).toMatchObject({ name: 'Route 2', width: 2, height: 2, entities: [] });
            expect(store.getState().selectedEntityId).toBeNull();

            store.getState().undo();
            expect(store.getState().map.width).toBe(4);
            expect(store.getState().map.entities).toHaveLength(1);
        });
    });
});
