import { produce } from 'immer';
import { createStore, useStore } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createEntity, removeUnusedScript } from '../world-map/entities';
import { resizeWorldMap, type ResizeAnchor } from '../world-map/resize';
import { tilesetSchema, type TileDefinition, type Tileset } from '../world-map/tileset';
import {
    getEntitySize,
    getFloodFillIndices,
    getTileIndex,
    isInBounds,
    validateWorldMap,
    worldMapSchema,
    type Entity,
    type EntityType,
    type LayerName,
    type ScriptAction,
    type WorldMap
} from '../world-map/world-map';
import { createMemoryDraftStorage, type DraftStorage } from './drafts';
import type { EditorRepository, InvalidFile } from './repository';

const historyLimit = 100;

export type EditorTool = 'brush' | 'fill' | 'entity';

export type TilePosition = { x: number; y: number };

/** What the editor edits at a time: a map and the tileset it is drawn with. Undo steps are snapshots of both. */
type Snapshot = { map: WorldMap; tileset: Tileset };

/** A map to open: an existing one by id, or a new map that has not been saved yet. */
export type NavigationTarget = { mapId: string; focus?: TilePosition } | { newMap: WorldMap };

/** Unsaved changes from an earlier session, found when a map was opened. */
export type RecoverableDraft = {
    map?: WorldMap;
    tileset?: Tileset;
    savedAt: number;
};

type EditorState = {
    map: WorldMap;
    tileset: Tileset;
    /** The map as it was last saved or opened, or null for a new map that has never been saved. */
    savedMap: WorldMap | null;
    savedTileset: Tileset;
    /** Every map and tileset as saved, by id. Used for the map list, warp targets, linting and playtesting. */
    maps: Record<string, WorldMap>;
    tilesets: Record<string, Tileset>;
    /** Map and tileset files that could not be read. */
    invalidFiles: InvalidFile[];
    /** Ids of maps that were never saved but have a draft. */
    draftMapIds: string[];
    activeLayer: LayerName;
    tool: EditorTool;
    selectedTileId: number;
    entityTypeToPlace: EntityType;
    selectedEntityId: string | null;
    hiddenLayers: LayerName[];
    dimInactiveLayers: boolean;
    showGrid: boolean;
    showCollision: boolean;
    showEntities: boolean;
    /** Tile highlighted on the map, e.g. after clicking a problem in the problems list. */
    focusedTile: TilePosition | null;
    past: Snapshot[];
    future: Snapshot[];
    saving: boolean;
    saveError: string | null;
    /** Opening a map (or the file list) is in progress. */
    loading: boolean;
    loadError: string | null;
    /** A map the user wants to open while there are unsaved changes; waits for them to save, discard or cancel. */
    pendingNavigation: NavigationTarget | null;
    recoverableDraft: RecoverableDraft | null;
    /** Where the player starts while playtesting, or null when not playtesting. */
    playtestStart: TilePosition | null;
};

type EditorActions = {
    setActiveLayer: (layer: LayerName) => void;
    setTool: (tool: EditorTool) => void;
    selectTile: (tileId: number) => void;
    toggleLayerVisibility: (layer: LayerName) => void;
    toggleDimInactiveLayers: () => void;
    toggleGrid: () => void;
    toggleCollision: () => void;
    toggleEntities: () => void;
    /** Starts grouping map edits into a single undo step, e.g. while dragging the brush. */
    beginStroke: () => void;
    endStroke: () => void;
    paintTile: (x: number, y: number) => void;
    fillArea: (x: number, y: number) => void;
    setEntityTypeToPlace: (type: EntityType) => void;
    selectEntity: (id: string | null) => void;
    /** Places a new entity of the chosen type and selects it. */
    placeEntity: (x: number, y: number) => void;
    moveEntity: (id: string, x: number, y: number) => void;
    /**
     * Replaces an entity (and optionally the script it runs). The change is only applied when the resulting map is
     * valid; otherwise the validation error is returned.
     */
    updateEntity: (id: string, entity: Entity, scriptActions?: unknown) => string | null;
    deleteEntity: (id: string) => void;
    setMapName: (name: string) => void;
    /** Resizes the map (see `resizeWorldMap`) and returns the ids of the entities that were removed. */
    resizeMap: (width: number, height: number, anchor: ResizeAnchor, fillTileId: number) => string[];
    /** Changes a tile of the tileset. `null` removes the tile from the palette. */
    updateTileDefinition: (tileId: number, definition: TileDefinition | null) => void;
    undo: () => void;
    redo: () => void;
    /** Saves the map and tileset if they have unsaved changes. Edits made while saving stay unsaved. */
    save: () => Promise<void>;
    /** Opens a map, first asking what to do with unsaved changes (see `resolveNavigation`). */
    requestNavigation: (target: NavigationTarget) => Promise<void>;
    /** Answers the question from `requestNavigation`. */
    resolveNavigation: (choice: 'save' | 'discard' | 'cancel') => Promise<void>;
    /** Reads the map and tileset files again, e.g. after they were edited outside the editor. */
    refreshFiles: () => Promise<void>;
    restoreDraft: () => void;
    dismissDraft: () => void;
    focusTile: (tile: TilePosition | null) => void;
    startPlaytest: (start: TilePosition) => void;
    stopPlaytest: () => void;
};

export type EditorStore = EditorState & EditorActions;

export type EditorStoreOptions = {
    map: WorldMap;
    tileset: Tileset;
    /** The map as saved; defaults to `map`. Pass null for a map that has never been saved. */
    savedMap?: WorldMap | null;
    maps?: Record<string, WorldMap>;
    tilesets?: Record<string, Tileset>;
    invalidFiles?: InvalidFile[];
    repository?: EditorRepository;
    drafts?: DraftStorage;
    /** Item a newly placed item entity holds, normally the first item in the catalog. */
    defaultItemId?: string;
};

export function hasUnsavedMapChanges(state: EditorState): boolean {
    return state.map !== state.savedMap;
}

export function hasUnsavedTilesetChanges(state: EditorState): boolean {
    return state.tileset !== state.savedTileset;
}

export function hasUnsavedChanges(state: EditorState): boolean {
    return hasUnsavedMapChanges(state) || hasUnsavedTilesetChanges(state);
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
    return Object.fromEntries(items.map((item) => [item.id, item]));
}

/** Drafts that are valid and differ from what was opened. Stale or broken drafts are removed. */
function findRecoverableDraft(drafts: DraftStorage, map: WorldMap, tileset: Tileset): RecoverableDraft | null {
    function load<T>(kind: 'map' | 'tileset', id: string, current: T, parse: (data: unknown) => T | null) {
        const draft = drafts.load(kind, id);
        const document = draft ? parse(draft.document) : null;

        if (!draft || !document || JSON.stringify(document) === JSON.stringify(current)) {
            drafts.clear(kind, id);

            return null;
        }

        return { document, savedAt: draft.savedAt };
    }
    const mapDraft = load('map', map.id, map, (data) => {
        const result = worldMapSchema.safeParse(data);

        return result.success && result.data.tilesetId === map.tilesetId ? result.data : null;
    });
    const tilesetDraft = load('tileset', tileset.id, tileset, (data) => tilesetSchema.safeParse(data).data ?? null);

    if (!mapDraft && !tilesetDraft) {
        return null;
    }

    return {
        map: mapDraft?.document,
        tileset: tilesetDraft?.document,
        savedAt: Math.max(mapDraft?.savedAt ?? 0, tilesetDraft?.savedAt ?? 0)
    };
}

const noRepository: EditorRepository = {
    listMaps: async () => ({ items: [], invalid: [] }),
    listTilesets: async () => ({ items: [], invalid: [] }),
    saveMap: async () => {},
    saveTileset: async () => {}
};

export function createEditorStore(options: EditorStoreOptions) {
    const { map: initialMap, tileset: initialTileset, repository = noRepository } = options;
    const drafts = options.drafts ?? createMemoryDraftStorage();
    const initialSavedMap = options.savedMap === undefined ? initialMap : options.savedMap;

    return createStore<EditorStore>()(
        immer((set, get) => {
            /** Snapshot before the current stroke started, or null when no stroke is in progress. */
            let strokeBase: Snapshot | null = null;

            function getSnapshot(): Snapshot {
                const { map, tileset } = get();

                return { map, tileset };
            }

            function pushHistory(state: EditorState, previous: Snapshot) {
                state.past.push(previous);
                if (state.past.length > historyLimit) {
                    state.past.shift();
                }
                state.future = [];
                state.recoverableDraft = null;
            }

            /** Applies an edit to the map and records the previous snapshot for undo. Skips no-op edits. */
            function editMap(recipe: (map: WorldMap) => boolean) {
                const previous = getSnapshot();

                set((state) => {
                    if (recipe(state.map) && !strokeBase) {
                        pushHistory(state, previous);
                    }
                });
            }

            function replaceMap(map: WorldMap) {
                const previous = getSnapshot();

                if (map === previous.map) {
                    return;
                }
                set((state) => {
                    state.map = map;
                    pushHistory(state, previous);
                });
            }

            function toggle(key: 'dimInactiveLayers' | 'showGrid' | 'showCollision' | 'showEntities') {
                set((state) => {
                    state[key] = !state[key];
                });
            }

            async function refreshFiles() {
                const [mapListing, tilesetListing] = await Promise.all([
                    repository.listMaps(),
                    repository.listTilesets()
                ]);
                const maps = byId(mapListing.items);

                set((state) => {
                    state.maps = maps;
                    state.tilesets = byId(tilesetListing.items);
                    state.invalidFiles = [...mapListing.invalid, ...tilesetListing.invalid];
                    state.draftMapIds = drafts.listIds('map').filter((id) => !(id in maps));
                });
            }

            async function navigate(target: NavigationTarget) {
                set((state) => {
                    state.loading = true;
                    state.loadError = null;
                });
                try {
                    await refreshFiles();
                    const { maps, tilesets } = get();
                    let map: WorldMap;
                    let savedMap: WorldMap | null = null;

                    if ('newMap' in target) {
                        map = target.newMap;
                    } else if (maps[target.mapId]) {
                        map = savedMap = maps[target.mapId];
                    } else {
                        const draft = worldMapSchema.safeParse(drafts.load('map', target.mapId)?.document);

                        if (!draft.success) {
                            throw new Error(`Map "${target.mapId}" does not exist`);
                        }
                        map = draft.data;
                    }
                    const tileset = tilesets[map.tilesetId];

                    if (!tileset) {
                        throw new Error(`Map "${map.id}" uses tileset "${map.tilesetId}", which does not exist`);
                    }
                    strokeBase = null;
                    set((state) => {
                        state.map = map;
                        state.savedMap = savedMap;
                        state.tileset = tileset;
                        state.savedTileset = tileset;
                        state.selectedEntityId = null;
                        state.focusedTile = 'mapId' in target ? (target.focus ?? null) : null;
                        state.past = [];
                        state.future = [];
                        state.saveError = null;
                        state.recoverableDraft = savedMap ? findRecoverableDraft(drafts, map, tileset) : null;
                    });
                } catch (error) {
                    set((state) => {
                        state.loadError = getErrorMessage(error);
                    });
                } finally {
                    set((state) => {
                        state.loading = false;
                        state.pendingNavigation = null;
                    });
                }
            }

            return {
                map: initialMap,
                tileset: initialTileset,
                savedMap: initialSavedMap,
                savedTileset: initialTileset,
                maps: options.maps ?? (initialSavedMap ? { [initialMap.id]: initialSavedMap } : {}),
                tilesets: options.tilesets ?? { [initialTileset.id]: initialTileset },
                invalidFiles: options.invalidFiles ?? [],
                draftMapIds: drafts.listIds('map').filter((id) => !(id in (options.maps ?? {}))),
                activeLayer: 'ground',
                tool: 'brush',
                selectedTileId: 1,
                entityTypeToPlace: 'npc',
                selectedEntityId: null,
                hiddenLayers: [],
                dimInactiveLayers: false,
                showGrid: true,
                showCollision: false,
                showEntities: true,
                focusedTile: null,
                past: [],
                future: [],
                saving: false,
                saveError: null,
                loading: false,
                loadError: null,
                pendingNavigation: null,
                recoverableDraft: initialSavedMap ? findRecoverableDraft(drafts, initialMap, initialTileset) : null,
                playtestStart: null,

                setActiveLayer: (layer) =>
                    set((state) => {
                        state.activeLayer = layer;
                    }),

                setTool: (tool) =>
                    set((state) => {
                        state.tool = tool;
                    }),

                selectTile: (tileId) =>
                    set((state) => {
                        state.selectedTileId = tileId;
                        if (state.tool === 'entity') {
                            state.tool = 'brush';
                        }
                    }),

                toggleLayerVisibility: (layer) =>
                    set((state) => {
                        state.hiddenLayers = state.hiddenLayers.includes(layer)
                            ? state.hiddenLayers.filter((hiddenLayer) => hiddenLayer !== layer)
                            : [...state.hiddenLayers, layer];
                    }),

                toggleDimInactiveLayers: () => toggle('dimInactiveLayers'),
                toggleGrid: () => toggle('showGrid'),
                toggleCollision: () => toggle('showCollision'),
                toggleEntities: () => toggle('showEntities'),

                beginStroke: () => {
                    strokeBase ??= getSnapshot();
                },

                endStroke: () => {
                    const base = strokeBase;

                    strokeBase = null;
                    if (base && base.map !== get().map) {
                        set((state) => pushHistory(state, base));
                    }
                },

                paintTile: (x, y) => {
                    const { activeLayer, selectedTileId } = get();

                    editMap((map) => {
                        if (!isInBounds(map, x, y)) {
                            return false;
                        }
                        const index = getTileIndex(map, x, y);

                        if (map.layers[activeLayer][index] === selectedTileId) {
                            return false;
                        }
                        map.layers[activeLayer][index] = selectedTileId;

                        return true;
                    });
                },

                fillArea: (x, y) => {
                    const { activeLayer, selectedTileId } = get();

                    editMap((map) => {
                        const indices = getFloodFillIndices(map, activeLayer, x, y);

                        if (indices.length === 0 || map.layers[activeLayer][indices[0]] === selectedTileId) {
                            return false;
                        }
                        for (const index of indices) {
                            map.layers[activeLayer][index] = selectedTileId;
                        }

                        return true;
                    });
                },

                setEntityTypeToPlace: (type) =>
                    set((state) => {
                        state.entityTypeToPlace = type;
                        state.tool = 'entity';
                    }),

                selectEntity: (id) =>
                    set((state) => {
                        state.selectedEntityId = id;
                    }),

                placeEntity: (x, y) => {
                    const { map, entityTypeToPlace } = get();

                    if (!isInBounds(map, x, y)) {
                        return;
                    }
                    const { entity, script } = createEntity(map, entityTypeToPlace, x, y, options.defaultItemId);

                    editMap((draft) => {
                        draft.entities.push(entity);
                        if ('script' in entity && script) {
                            draft.scripts[entity.script] = script;
                        }

                        return true;
                    });
                    set((state) => {
                        state.selectedEntityId = entity.id;
                    });
                },

                moveEntity: (id, x, y) =>
                    editMap((map) => {
                        const entity = map.entities.find((candidate) => candidate.id === id);

                        if (!entity || (entity.x === x && entity.y === y)) {
                            return false;
                        }
                        const { width, height } = getEntitySize(entity);

                        if (!isInBounds(map, x, y) || !isInBounds(map, x + width - 1, y + height - 1)) {
                            return false;
                        }
                        entity.x = x;
                        entity.y = y;

                        return true;
                    }),

                updateEntity: (id, entity, scriptActions) => {
                    const currentMap = get().map;
                    const nextMap = produce(currentMap, (map) => {
                        const index = map.entities.findIndex((candidate) => candidate.id === id);

                        if (index === -1) {
                            return;
                        }
                        const previousEntity = map.entities[index];

                        map.entities[index] = entity;
                        if ('script' in entity && scriptActions !== undefined) {
                            map.scripts[entity.script] = scriptActions as ScriptAction[];
                        }
                        if ('script' in previousEntity) {
                            removeUnusedScript(map, previousEntity.script);
                        }
                    });
                    const error = validateWorldMap(nextMap);

                    if (error) {
                        return error;
                    }
                    replaceMap(nextMap);
                    set((state) => {
                        if (state.selectedEntityId === id) {
                            state.selectedEntityId = entity.id;
                        }
                    });

                    return null;
                },

                deleteEntity: (id) => {
                    editMap((map) => {
                        const index = map.entities.findIndex((entity) => entity.id === id);

                        if (index === -1) {
                            return false;
                        }
                        const [entity] = map.entities.splice(index, 1);

                        if ('script' in entity) {
                            removeUnusedScript(map, entity.script);
                        }

                        return true;
                    });
                    set((state) => {
                        if (state.selectedEntityId === id) {
                            state.selectedEntityId = null;
                        }
                    });
                },

                setMapName: (name) =>
                    editMap((map) => {
                        if (map.name === name) {
                            return false;
                        }
                        map.name = name;

                        return true;
                    }),

                resizeMap: (width, height, anchor, fillTileId) => {
                    const { map } = get();

                    if (width === map.width && height === map.height) {
                        return [];
                    }
                    const result = resizeWorldMap(map, width, height, anchor, fillTileId);

                    replaceMap(result.map);
                    set((state) => {
                        if (state.selectedEntityId && result.removedEntityIds.includes(state.selectedEntityId)) {
                            state.selectedEntityId = null;
                        }
                        state.focusedTile = null;
                    });

                    return result.removedEntityIds;
                },

                updateTileDefinition: (tileId, definition) => {
                    const previous = getSnapshot();
                    const key = String(tileId);
                    const current = previous.tileset.tiles[key];

                    if (JSON.stringify(current ?? null) === JSON.stringify(definition)) {
                        return;
                    }
                    set((state) => {
                        if (definition) {
                            state.tileset.tiles[key] = definition;
                        } else {
                            delete state.tileset.tiles[key];
                        }
                        pushHistory(state, previous);
                    });
                },

                undo: () =>
                    set((state) => {
                        if (strokeBase) {
                            return;
                        }
                        const previous = state.past.pop();

                        if (previous) {
                            state.future.push({ map: state.map, tileset: state.tileset });
                            state.map = previous.map;
                            state.tileset = previous.tileset;
                        }
                    }),

                redo: () =>
                    set((state) => {
                        if (strokeBase) {
                            return;
                        }
                        const next = state.future.pop();

                        if (next) {
                            state.past.push({ map: state.map, tileset: state.tileset });
                            state.map = next.map;
                            state.tileset = next.tileset;
                        }
                    }),

                save: async () => {
                    const { map, tileset, saving } = get();

                    if (saving) {
                        return;
                    }
                    set((state) => {
                        state.saving = true;
                        state.saveError = null;
                    });
                    try {
                        if (tileset !== get().savedTileset) {
                            await repository.saveTileset(tileset);
                            drafts.clear('tileset', tileset.id);
                            set((state) => {
                                state.savedTileset = tileset;
                                state.tilesets[tileset.id] = tileset;
                            });
                        }
                        if (map !== get().savedMap) {
                            await repository.saveMap(map);
                            drafts.clear('map', map.id);
                            set((state) => {
                                state.savedMap = map;
                                state.maps[map.id] = map;
                                state.draftMapIds = state.draftMapIds.filter((id) => id !== map.id);
                            });
                        }
                    } catch (error) {
                        set((state) => {
                            state.saveError = getErrorMessage(error);
                        });
                    } finally {
                        set((state) => {
                            state.saving = false;
                        });
                    }
                },

                requestNavigation: async (target) => {
                    if ('mapId' in target && target.mapId === get().map.id && get().savedMap) {
                        return;
                    }
                    if (hasUnsavedChanges(get())) {
                        set((state) => {
                            state.pendingNavigation = target;
                        });

                        return;
                    }
                    await navigate(target);
                },

                resolveNavigation: async (choice) => {
                    const { pendingNavigation, map, tileset } = get();

                    if (!pendingNavigation || choice === 'cancel') {
                        set((state) => {
                            state.pendingNavigation = null;
                        });

                        return;
                    }
                    if (choice === 'save') {
                        await get().save();
                        if (get().saveError) {
                            set((state) => {
                                state.pendingNavigation = null;
                            });

                            return;
                        }
                    }
                    await navigate(pendingNavigation);
                    if (choice === 'discard' && !get().loadError) {
                        // Cleared only now, because a draft could still be written while the next map loads.
                        drafts.clear('map', map.id);
                        drafts.clear('tileset', tileset.id);
                    }
                },

                refreshFiles: async () => {
                    try {
                        await refreshFiles();
                    } catch (error) {
                        set((state) => {
                            state.loadError = getErrorMessage(error);
                        });
                    }
                },

                restoreDraft: () => {
                    const { recoverableDraft } = get();

                    if (!recoverableDraft) {
                        return;
                    }
                    const previous = getSnapshot();

                    set((state) => {
                        state.map = recoverableDraft.map ?? state.map;
                        state.tileset = recoverableDraft.tileset ?? state.tileset;
                        pushHistory(state, previous);
                    });
                },

                dismissDraft: () => {
                    const { map, tileset } = get();

                    drafts.clear('map', map.id);
                    drafts.clear('tileset', tileset.id);
                    set((state) => {
                        state.recoverableDraft = null;
                    });
                },

                focusTile: (tile) =>
                    set((state) => {
                        state.focusedTile = tile;
                    }),

                startPlaytest: (start) =>
                    set((state) => {
                        state.playtestStart = start;
                    }),

                stopPlaytest: () =>
                    set((state) => {
                        state.playtestStart = null;
                    })
            };
        })
    );
}

export type EditorStoreApi = ReturnType<typeof createEditorStore>;

export function createEditorHook(store: EditorStoreApi) {
    return function useEditor<T>(selector: (state: EditorStore) => T): T {
        return useStore(store, selector);
    };
}
