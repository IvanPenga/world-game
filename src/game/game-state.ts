import { produce, type Draft } from 'immer';
import { getCollisionAt, isWalkable } from '../world-map/collision';
import { getItemName, type ItemCatalog } from '../world-map/items';
import type { Tileset } from '../world-map/tileset';
import {
    getEntitiesAt,
    isInBounds,
    type Entity,
    type Facing,
    type MiniGame,
    type ResourceType,
    type ScriptAction,
    type WarpTarget,
    type WorldMap
} from '../world-map/world-map';

/** Time for one step from a tile to the next, like walking in the Game Boy games. */
export const stepDuration = 260;
/** Time to fade out (and again to fade in) when warping. */
export const fadeDuration = 250;
/** How often a wandering NPC tries to move. */
export const wanderInterval = 1200;

/** Every map and tileset the game can warp to, by id, and the items the player can carry. */
export type GameWorld = {
    maps: Record<string, WorldMap>;
    tilesets: Record<string, Tileset>;
    items: ItemCatalog;
};

export type GameInput = {
    /** Direction key being held, or null. */
    direction: Facing | null;
    /** The interact key was pressed since the last update. */
    interact: boolean;
    /** The menu key was pressed since the last update: opens or closes the inventory. */
    menu?: boolean;
    /** Direction key pressed (or repeated by the keyboard) since the last update. Moves the menu selection. */
    pressedDirection?: Facing | null;
};

/** An item stack in the inventory. */
export type InventoryEntry = { item: string; count: number };

type ItemEntity = Extract<Entity, { type: 'item' }>;

type ResourceEntity = Extract<Entity, { type: 'resource' }>;

type ShipEntity = Extract<Entity, { type: 'ship' }>;

/** Where a ship is while playing. Ships move when the player sails them, so this is kept apart from the map file. */
export type ShipRuntimeState = { x: number; y: number; facing: Facing };

type ScriptFrame = { actions: ScriptAction[]; index: number };

export type ActiveMiniGame = { definition: MiniGame; feedback: string | null };

type NpcRuntimeState = {
    x: number;
    y: number;
    facing: Facing;
    step: { fromX: number; fromY: number; elapsed: number } | null;
    wanderElapsed: number;
    wanderCount: number;
};

export type GameState = {
    mapId: string;
    player: {
        x: number;
        y: number;
        facing: Facing;
        /**
         * The step in progress: the tile the player comes from and how far along the step is, in milliseconds.
         * `boarding` is set for the step from the coast onto a ship, which does not move the ship.
         */
        step: { fromX: number; fromY: number; elapsed: number; boarding?: boolean } | null;
    };
    /** The ship the player is sailing, as "<mapId>/<shipId>", or null when walking. */
    sailing: string | null;
    /** Runtime positions of ships that were boarded, as "<mapId>/<shipId>". Other ships are where the map puts them. */
    ships: Record<string, ShipRuntimeState>;
    flags: Record<string, boolean>;
    /** Triggers with `once` that already ran, as "<mapId>/<triggerId>". */
    usedTriggers: string[];
    /** Items in the order they were first picked up. */
    inventory: InventoryEntry[];
    /** Item entities already picked up, as "<mapId>/<entityId>". */
    collectedItems: string[];
    /** Resource entities already gathered, as "<mapId>/<entityId>". */
    gatheredResources: string[];
    /** The inventory menu with the index of the selected entry, or null when it is closed. */
    menu: { selected: number } | null;
    /** The minigame currently blocking movement and scripts, or null when none is open. */
    miniGame: ActiveMiniGame | null;
    /** NPCs that turned to face the player, as "<mapId>/<npcId>". */
    npcFacing: Record<string, Facing>;
    /** Runtime positions for NPCs, separate from the map file so wandering does not edit the map. */
    npcs: Record<string, NpcRuntimeState>;
    /** Text in the dialogue box, or null when it is closed. */
    dialogue: string | null;
    /** The running script: a stack of action lists, one per nested `if` branch. */
    script: ScriptFrame[];
    transition: { phase: 'out' | 'in'; elapsed: number; target: WarpTarget } | null;
    /** Something went wrong that the map author should know about, e.g. a warp to a map that does not exist. */
    notice: string | null;
};

export const directionOffsets: Record<Facing, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
};

const opposite: Record<Facing, Facing> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function createGameState(mapId: string, start: { x: number; y: number }, facing: Facing = 'down'): GameState {
    return {
        mapId,
        player: { x: start.x, y: start.y, facing, step: null },
        sailing: null,
        ships: {},
        flags: {},
        usedTriggers: [],
        inventory: [],
        collectedItems: [],
        gatheredResources: [],
        menu: null,
        miniGame: null,
        npcFacing: {},
        npcs: {},
        dialogue: null,
        script: [],
        transition: null,
        notice: null
    };
}

export function getCurrentMap(state: GameState, world: GameWorld): WorldMap {
    return world.maps[state.mapId];
}

/** Whether the player is free to walk or sail: no menu, dialogue, script, warp or step in progress. */
export function isIdle(state: GameState): boolean {
    return (
        !state.menu &&
        !state.miniGame &&
        !state.dialogue &&
        state.script.length === 0 &&
        !state.transition &&
        !state.player.step
    );
}

/** Submits an answer to the active minigame and continues the script when the answer resolves it. */
export function submitMiniGameAnswer(state: GameState, world: GameWorld, answer: string): GameState {
    return produce(state, (draft) => {
        const active = draft.miniGame;

        if (!active) {
            return;
        }
        const { definition } = active;
        const solved = matchesMiniGameAnswer(definition, answer);
        const branch = solved ? definition.success : definition.failure;

        if (!solved && !branch) {
            active.feedback = 'That is not the right answer.';

            return;
        }
        draft.miniGame = null;
        if (branch && branch.length > 0) {
            draft.script.push({ actions: branch, index: 0 });
        }
        runScript(draft, world);
    });
}

function matchesMiniGameAnswer(miniGame: MiniGame, answer: string): boolean {
    const expected = miniGame.answer.trim();
    const actual = answer.trim();

    return miniGame.caseSensitive ? actual === expected : actual.toLocaleLowerCase() === expected.toLocaleLowerCase();
}

/** Whether an item entity was picked up already. Picked-up items are not drawn and no longer block the way. */
export function isItemCollected(state: GameState, mapId: string, entity: ItemEntity): boolean {
    return state.collectedItems.includes(`${mapId}/${entity.id}`);
}

/** Whether a resource entity was gathered already. Gathered resources are not drawn and no longer block the way. */
export function isResourceGathered(state: GameState, mapId: string, entity: ResourceEntity): boolean {
    return state.gatheredResources.includes(`${mapId}/${entity.id}`);
}

/** The runtime position and facing of a ship, where the player left it or where the map puts it. */
export function getShipState(state: GameState, mapId: string, ship: ShipEntity): ShipRuntimeState {
    return state.ships[`${mapId}/${ship.id}`] ?? { x: ship.x, y: ship.y, facing: ship.facing };
}

/** A ship's position in tiles, moving with the player while it is sailed. Used to draw ships smoothly. */
export function getShipPosition(state: GameState, mapId: string, ship: ShipEntity): { x: number; y: number } {
    const isSailedStep = state.sailing === `${mapId}/${ship.id}` && state.player.step && !state.player.step.boarding;

    if (isSailedStep) {
        return getPlayerPosition(state);
    }
    const { x, y } = getShipState(state, mapId, ship);

    return { x, y };
}

/** How many of an item the player carries. */
export function getItemCount(state: GameState, itemId: string): number {
    return state.inventory.find((entry) => entry.item === itemId)?.count ?? 0;
}

/** The player's position in tiles, between tiles while stepping. Used to draw the player and the camera. */
export function getPlayerPosition(state: GameState): { x: number; y: number } {
    const { x, y, step } = state.player;

    if (!step) {
        return { x, y };
    }
    const progress = Math.min(step.elapsed / stepDuration, 1);

    return { x: step.fromX + (x - step.fromX) * progress, y: step.fromY + (y - step.fromY) * progress };
}

/** The runtime position and facing of an NPC, including wander movement and turn-to-player overrides. */
export function getNpcState(state: GameState, mapId: string, npc: Extract<Entity, { type: 'npc' }>): NpcRuntimeState {
    const key = `${mapId}/${npc.id}`;
    const runtime = state.npcs[key];

    return runtime
        ? { ...runtime, facing: state.npcFacing[key] ?? runtime.facing }
        : {
              x: npc.x,
              y: npc.y,
              facing: state.npcFacing[key] ?? npc.facing,
              step: null,
              wanderElapsed: 0,
              wanderCount: 0
          };
}

/** An NPC's position in tiles, between tiles while stepping. Used to draw wandering NPCs smoothly. */
export function getNpcPosition(
    state: GameState,
    mapId: string,
    npc: Extract<Entity, { type: 'npc' }>
): { x: number; y: number } {
    const runtime = getNpcState(state, mapId, npc);

    if (!runtime.step) {
        return { x: runtime.x, y: runtime.y };
    }
    const progress = Math.min(runtime.step.elapsed / stepDuration, 1);

    return {
        x: runtime.step.fromX + (runtime.x - runtime.step.fromX) * progress,
        y: runtime.step.fromY + (runtime.y - runtime.step.fromY) * progress
    };
}

/** Opacity of the black screen during a warp, from 0 to 1. */
export function getFadeOpacity(state: GameState): number {
    if (!state.transition) {
        return 0;
    }
    const progress = Math.min(state.transition.elapsed / fadeDuration, 1);

    return state.transition.phase === 'out' ? progress : 1 - progress;
}

/**
 * The nearest tile to (x, y) the player can stand on, searching outwards in rings, or null when there is none.
 * Used to pick where a playtest starts.
 */
export function findWalkableTile(
    map: WorldMap,
    tileset: Tileset,
    x: number,
    y: number
): { x: number; y: number } | null {
    const maxRadius = Math.max(map.width, map.height);

    for (let radius = 0; radius <= maxRadius; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
                    continue;
                }
                const candidateX = x + dx;
                const candidateY = y + dy;

                if (isInBounds(map, candidateX, candidateY) && isWalkable(map, tileset, candidateX, candidateY)) {
                    return { x: candidateX, y: candidateY };
                }
            }
        }
    }

    return null;
}

/** Advances the game by `delta` milliseconds. Returns a new state; the given one is not changed. */
export function updateGame(state: GameState, world: GameWorld, input: GameInput, delta: number): GameState {
    return produce(state, (draft) => {
        draft.notice = null;

        if (draft.menu) {
            updateMenu(draft, input);

            return;
        }
        if (draft.transition) {
            updateTransition(draft, delta);

            return;
        }
        if (draft.miniGame) {
            return;
        }
        if (draft.dialogue) {
            if (input.interact) {
                draft.dialogue = null;
                runScript(draft, world);
            }

            return;
        }
        updateNpcs(draft, world, delta);
        if (draft.script.length > 0) {
            runScript(draft, world);

            return;
        }
        if (draft.player.step) {
            draft.player.step.elapsed += delta;
            if (draft.player.step.elapsed < stepDuration) {
                return;
            }
            const leftover = draft.player.step.elapsed - stepDuration;

            draft.player.step = null;
            arrive(draft, world);
            if (isIdle(draft) && input.direction) {
                tryStep(draft, world, input.direction, leftover);
            }

            return;
        }
        if (input.menu) {
            draft.menu = { selected: 0 };
        } else if (input.interact) {
            interact(draft, world);
        } else if (input.direction) {
            tryStep(draft, world, input.direction, 0);
        }
    });
}

/** While the inventory is open the world is paused: up and down move the selection, the menu key closes it. */
function updateMenu(draft: Draft<GameState>, input: GameInput) {
    const menu = draft.menu!;

    if (input.menu) {
        draft.menu = null;

        return;
    }
    const count = draft.inventory.length;

    if (count > 0 && input.pressedDirection === 'down') {
        menu.selected = (menu.selected + 1) % count;
    } else if (count > 0 && input.pressedDirection === 'up') {
        menu.selected = (menu.selected - 1 + count) % count;
    }
}

function updateTransition(draft: Draft<GameState>, delta: number) {
    const transition = draft.transition!;

    transition.elapsed += delta;
    if (transition.elapsed < fadeDuration) {
        return;
    }
    if (transition.phase === 'in') {
        draft.transition = null;

        return;
    }
    const { mapId, x, y } = transition.target;

    draft.mapId = mapId;
    draft.player.x = x;
    draft.player.y = y;
    draft.player.step = null;
    // The ship stays behind where the player left it; the player arrives on foot.
    draft.sailing = null;
    draft.transition = { phase: 'in', elapsed: 0, target: transition.target };
}

function tryStep(draft: Draft<GameState>, world: GameWorld, direction: Facing, elapsed: number) {
    const offset = directionOffsets[direction];
    const x = draft.player.x + offset.x;
    const y = draft.player.y + offset.y;

    draft.player.facing = direction;
    if (draft.sailing) {
        const ship = draft.ships[draft.sailing];

        ship.facing = direction;
        if (!canSailOn(draft, world, x, y)) {
            return;
        }
        ship.x = x;
        ship.y = y;
    } else if (!canPlayerStandOn(draft, world, x, y)) {
        return;
    }
    draft.player.step = { fromX: draft.player.x, fromY: draft.player.y, elapsed };
    draft.player.x = x;
    draft.player.y = y;
}

/**
 * Runs what happens when the player finishes a step onto a tile: warps and step triggers. Warps only work on foot,
 * so a ship never sails through a door; step triggers also run on water.
 */
function arrive(draft: Draft<GameState>, world: GameWorld) {
    const map = getCurrentMap(draft, world);
    const entities = getEntitiesAt(map, draft.player.x, draft.player.y);
    const warp = entities.find((entity) => entity.type === 'warp');

    if (warp && !draft.sailing) {
        startWarp(draft, world, warp.target);

        return;
    }
    const trigger = entities.find(
        (entity) => entity.type === 'trigger' && entity.on === 'step' && canRun(draft, entity)
    );

    if (trigger) {
        startEntityScript(draft, world, trigger);
    }
}

function interact(draft: Draft<GameState>, world: GameWorld) {
    const map = getCurrentMap(draft, world);
    const offset = directionOffsets[draft.player.facing];
    const x = draft.player.x + offset.x;
    const y = draft.player.y + offset.y;

    if (draft.sailing && canPlayerStandOn(draft, world, x, y)) {
        leaveShip(draft, x, y);

        return;
    }
    const ship = draft.sailing ? undefined : findShipAt(draft, map, x, y);

    if (ship) {
        boardShip(draft, ship);

        return;
    }
    if (interactWith(draft, world, map, x, y) || !draft.sailing) {
        return;
    }
    // Nothing to do in front of the ship: go ashore on any coast next to it.
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
        const coastX = draft.player.x + directionOffsets[direction].x;
        const coastY = draft.player.y + directionOffsets[direction].y;

        if (canPlayerStandOn(draft, world, coastX, coastY)) {
            draft.player.facing = direction;
            leaveShip(draft, coastX, coastY);

            return;
        }
    }
}

/** Starts the step from the coast onto the ship. The ship turns to where the player is going. */
function boardShip(draft: Draft<GameState>, ship: ShipEntity) {
    const key = `${draft.mapId}/${ship.id}`;
    const position = getShipState(draft, draft.mapId, ship);

    draft.ships[key] = { ...position, facing: draft.player.facing };
    draft.sailing = key;
    draft.player.step = { fromX: draft.player.x, fromY: draft.player.y, elapsed: 0, boarding: true };
    draft.player.x = position.x;
    draft.player.y = position.y;
}

/** Steps from the ship onto the coast tile (x, y). The ship stays where it is. */
function leaveShip(draft: Draft<GameState>, x: number, y: number) {
    draft.sailing = null;
    draft.player.step = { fromX: draft.player.x, fromY: draft.player.y, elapsed: 0 };
    draft.player.x = x;
    draft.player.y = y;
}

function findShipAt(draft: Draft<GameState>, map: WorldMap, x: number, y: number): ShipEntity | undefined {
    return map.entities.find((entity): entity is ShipEntity => {
        if (entity.type !== 'ship') {
            return false;
        }
        const ship = getShipState(draft, draft.mapId, entity);

        return ship.x === x && ship.y === y;
    });
}

/** Talks to, reads or picks up what is on the tile in front. Returns false when there is nothing to interact with. */
function interactWith(draft: Draft<GameState>, world: GameWorld, map: WorldMap, x: number, y: number): boolean {
    const entities = getEntitiesAt(map, x, y);
    const npc = map.entities.find((candidate) => {
        if (candidate.type !== 'npc') {
            return false;
        }
        const position = getNpcState(draft, draft.mapId, candidate);

        return position.x === x && position.y === y;
    });
    const item = entities.find(
        (candidate): candidate is ItemEntity =>
            candidate.type === 'item' && !isItemCollected(draft, draft.mapId, candidate)
    );
    const resource = entities.find(
        (candidate): candidate is ResourceEntity =>
            candidate.type === 'resource' && !isResourceGathered(draft, draft.mapId, candidate)
    );

    if (!npc && item) {
        collectItem(draft, world, item);

        return true;
    }
    if (!npc && resource) {
        gatherResource(draft, world, resource);

        return true;
    }
    const entity =
        npc ??
        entities.find((candidate) => candidate.type === 'sign') ??
        entities.find(
            (candidate) => candidate.type === 'trigger' && candidate.on === 'interact' && canRun(draft, candidate)
        );

    if (!entity) {
        return false;
    }
    if (entity.type === 'npc') {
        draft.npcFacing[`${draft.mapId}/${entity.id}`] = opposite[draft.player.facing];
        ensureNpc(draft, draft.mapId, entity).facing = opposite[draft.player.facing];
    }
    startEntityScript(draft, world, entity);

    return true;
}

function collectItem(draft: Draft<GameState>, world: GameWorld, entity: ItemEntity) {
    draft.collectedItems.push(`${draft.mapId}/${entity.id}`);
    addItem(draft, entity.item, entity.count ?? 1);
    draft.dialogue = `Found ${describeItems(world, entity.item, entity.count ?? 1)}!`;
}

function gatherResource(draft: Draft<GameState>, world: GameWorld, entity: ResourceEntity) {
    draft.gatheredResources.push(`${draft.mapId}/${entity.id}`);
    addItem(draft, entity.resource, entity.count ?? 1);
    draft.dialogue = `${getGatheredVerb(entity.resource)} ${describeItems(world, entity.resource, entity.count ?? 1)}!`;
}

function getGatheredVerb(resource: ResourceType): string {
    return resource === 'fruit' ? 'Picked' : 'Gathered';
}

function addItem(draft: Draft<GameState>, itemId: string, count: number) {
    const entry = draft.inventory.find((candidate) => candidate.item === itemId);

    if (entry) {
        entry.count += count;
    } else {
        draft.inventory.push({ item: itemId, count });
    }
}

/** "Potion", or "3 × Potion" for more than one. */
function describeItems(world: GameWorld, itemId: string, count: number): string {
    const name = getItemName(world.items, itemId);

    return count === 1 ? name : `${count} × ${name}`;
}

function ensureNpc(draft: Draft<GameState>, mapId: string, npc: Extract<Entity, { type: 'npc' }>): NpcRuntimeState {
    const key = `${mapId}/${npc.id}`;

    draft.npcs[key] ??= {
        x: npc.x,
        y: npc.y,
        facing: draft.npcFacing[key] ?? npc.facing,
        step: null,
        wanderElapsed: 0,
        wanderCount: 0
    };

    return draft.npcs[key];
}

/**
 * Whether a sign, an item or resource that was not collected yet, an NPC or a ship is on the tile, using runtime
 * positions for NPCs and ships. `ignoreKey` ("<mapId>/<entityId>") leaves out the NPC or ship that is moving.
 */
function isEntityInTheWay(draft: Draft<GameState>, map: WorldMap, x: number, y: number, ignoreKey?: string): boolean {
    return map.entities.some((entity) => {
        if (`${draft.mapId}/${entity.id}` === ignoreKey) {
            return false;
        }
        switch (entity.type) {
            case 'sign':
                return entity.x === x && entity.y === y;
            case 'item':
                return entity.x === x && entity.y === y && !isItemCollected(draft, draft.mapId, entity);
            case 'resource':
                return entity.x === x && entity.y === y && !isResourceGathered(draft, draft.mapId, entity);
            case 'npc': {
                const npc = getNpcState(draft, draft.mapId, entity);

                return npc.x === x && npc.y === y;
            }
            case 'ship': {
                const ship = getShipState(draft, draft.mapId, entity);

                return ship.x === x && ship.y === y;
            }
            default:
                return false;
        }
    });
}

function canPlayerStandOn(draft: Draft<GameState>, world: GameWorld, x: number, y: number): boolean {
    const map = getCurrentMap(draft, world);
    const tileset = world.tilesets[map.tilesetId];

    return getCollisionAt(map, tileset, x, y) === null && !isEntityInTheWay(draft, map, x, y);
}

/** Ships sail on water tiles only, and not through other ships, NPCs, signs or items. */
function canSailOn(draft: Draft<GameState>, world: GameWorld, x: number, y: number): boolean {
    const map = getCurrentMap(draft, world);
    const tileset = world.tilesets[map.tilesetId];

    return getCollisionAt(map, tileset, x, y) === 'water' && !isEntityInTheWay(draft, map, x, y, draft.sailing!);
}

function canNpcStandOn(draft: Draft<GameState>, world: GameWorld, npcKey: string, x: number, y: number): boolean {
    const map = getCurrentMap(draft, world);
    const tileset = world.tilesets[map.tilesetId];

    return (
        getCollisionAt(map, tileset, x, y) === null &&
        !(draft.player.x === x && draft.player.y === y) &&
        !isEntityInTheWay(draft, map, x, y, npcKey)
    );
}

function updateNpcs(draft: Draft<GameState>, world: GameWorld, delta: number) {
    const map = getCurrentMap(draft, world);
    const directions: Facing[] = ['down', 'left', 'up', 'right'];

    for (const entity of map.entities) {
        if (entity.type !== 'npc') {
            continue;
        }
        const npc = ensureNpc(draft, draft.mapId, entity);
        const key = `${draft.mapId}/${entity.id}`;

        if (npc.step) {
            npc.step.elapsed += delta;
            if (npc.step.elapsed >= stepDuration) {
                npc.step = null;
            }
            continue;
        }
        if (entity.movement !== 'wander') {
            continue;
        }
        npc.wanderElapsed += delta;
        if (npc.wanderElapsed < wanderInterval) {
            continue;
        }
        npc.wanderElapsed %= wanderInterval;
        npc.wanderCount++;

        for (let attempt = 0; attempt < directions.length; attempt++) {
            const direction = directions[(entity.id.length + npc.wanderCount + attempt) % directions.length];
            const offset = directionOffsets[direction];
            const x = npc.x + offset.x;
            const y = npc.y + offset.y;

            npc.facing = direction;
            draft.npcFacing[key] = direction;
            if (canNpcStandOn(draft, world, key, x, y)) {
                npc.step = { fromX: npc.x, fromY: npc.y, elapsed: 0 };
                npc.x = x;
                npc.y = y;
                break;
            }
        }
    }
}

function canRun(draft: Draft<GameState>, entity: Entity): boolean {
    return !(entity.type === 'trigger' && entity.once && draft.usedTriggers.includes(`${draft.mapId}/${entity.id}`));
}

function startEntityScript(draft: Draft<GameState>, world: GameWorld, entity: Entity) {
    if (!('script' in entity)) {
        return;
    }
    if (entity.type === 'trigger' && entity.once) {
        draft.usedTriggers.push(`${draft.mapId}/${entity.id}`);
    }
    const actions = getCurrentMap(draft, world).scripts[entity.script] ?? [];

    draft.script = [{ actions, index: 0 }];
    runScript(draft, world);
}

/** Runs script actions until one has to wait (a dialogue, a received item or a warp) or the script ends. */
function runScript(draft: Draft<GameState>, world: GameWorld) {
    while (draft.script.length > 0) {
        const frame = draft.script[draft.script.length - 1];

        if (frame.index >= frame.actions.length) {
            draft.script.pop();
            continue;
        }
        const action = frame.actions[frame.index];

        frame.index++;
        switch (action.type) {
            case 'say':
                draft.dialogue = action.text;

                return;
            case 'setFlag':
                draft.flags[action.flag] = action.value;
                break;
            case 'giveItem':
                addItem(draft, action.item, action.count ?? 1);
                draft.dialogue = `Received ${describeItems(world, action.item, action.count ?? 1)}!`;

                return;
            case 'miniGame':
                draft.miniGame = { definition: action.miniGame, feedback: null };

                return;
            case 'if':
                draft.script.push({ actions: (draft.flags[action.flag] ? action.then : action.else) ?? [], index: 0 });
                break;
            case 'warp':
                draft.script = [];
                startWarp(draft, world, action.target);

                return;
        }
    }
}

function startWarp(draft: Draft<GameState>, world: GameWorld, target: WarpTarget) {
    const targetMap = world.maps[target.mapId];

    if (!targetMap || !world.tilesets[targetMap.tilesetId]) {
        draft.notice = `This warp leads to map "${target.mapId}", which does not exist`;

        return;
    }
    if (!isInBounds(targetMap, target.x, target.y)) {
        draft.notice = `This warp leads to (${target.x}, ${target.y}), outside map "${target.mapId}"`;

        return;
    }
    draft.transition = { phase: 'out', elapsed: 0, target };
}
