import { describe, expect, it } from 'vitest';
import type { Tileset } from '../world-map/tileset';
import { createEmptyWorldMap, type WorldMap } from '../world-map/world-map';
import {
    createGameState,
    fadeDuration,
    findWalkableTile,
    getFadeOpacity,
    getItemCount,
    getNpcPosition,
    getPlayerPosition,
    getShipPosition,
    getShipState,
    stepDuration,
    submitMiniGameAnswer,
    updateGame,
    type GameInput,
    type GameState,
    type GameWorld
} from './game-state';

const tileset: Tileset = {
    id: 'overworld',
    image: 'overworld.png',
    tileSize: 16,
    columns: 4,
    tiles: {
        '1': { name: 'Grass' },
        '4': { name: 'Water', collision: 'water' },
        '5': { name: 'Tree', collision: 'solid' }
    }
};

function createWorld(): GameWorld {
    const route: WorldMap = {
        ...createEmptyWorldMap({
            id: 'route',
            name: 'Route',
            width: 5,
            height: 5,
            tilesetId: 'overworld',
            fillTileId: 1
        }),
        entities: [
            { type: 'warp', id: 'door', x: 4, y: 0, target: { mapId: 'house', x: 1, y: 1 } },
            { type: 'npc', id: 'man', x: 2, y: 0, sprite: 'npc', facing: 'down', movement: 'static', script: 'man' },
            { type: 'trigger', id: 'grass', x: 0, y: 4, width: 2, height: 1, on: 'step', script: 'grass', once: true },
            { type: 'item', id: 'ball', x: 2, y: 3, item: 'potion' },
            { type: 'resource', id: 'branches', x: 1, y: 3, resource: 'wood', count: 2 },
            { type: 'sign', id: 'box', x: 4, y: 4, script: 'gift' }
        ],
        scripts: {
            man: [
                {
                    type: 'if',
                    flag: 'met',
                    then: [{ type: 'say', text: 'Again?' }],
                    else: [
                        { type: 'say', text: 'Hello!' },
                        { type: 'setFlag', flag: 'met', value: true }
                    ]
                }
            ],
            grass: [{ type: 'say', text: 'Careful!' }],
            gift: [
                { type: 'giveItem', item: 'potion', count: 2 },
                { type: 'giveItem', item: 'key' },
                { type: 'say', text: 'Enjoy!' }
            ]
        }
    };
    route.layers.ground[1 * 5 + 0] = 5;
    const house = createEmptyWorldMap({ id: 'house', name: 'House', width: 3, height: 3, tilesetId: 'overworld' });

    const items = {
        items: [
            { id: 'potion', name: 'Potion', description: 'Heals a little.' },
            { id: 'key', name: 'Key', description: 'Opens a door.' },
            { id: 'wood', name: 'Wood', description: 'Timber.' }
        ]
    };

    return { maps: { route, house }, tilesets: { overworld: tileset }, items };
}

const idle: GameInput = { direction: null, interact: false };

/**
 * Starts with the given input, then holds the direction for `time` milliseconds in 16 ms frames. The key is released
 * on the last frame, so the player stops after the step instead of walking on.
 */
function run(state: GameState, world: GameWorld, input: Partial<GameInput>, time: number): GameState {
    let current = updateGame(state, world, { ...idle, ...input }, 0);

    for (let elapsed = 0; elapsed < time; elapsed += 16) {
        const isLast = elapsed + 16 >= time;

        current = updateGame(
            current,
            world,
            { ...idle, direction: isLast ? null : (input.direction ?? null) },
            Math.min(16, time - elapsed)
        );
    }

    return current;
}

/**
 * A 5×3 map with a pond at x = 2..3, y = 0..1 and a ship at (2, 1). Grass everywhere else; a door at (4, 0).
 *
 *     . . ~ ~ W
 *     . . B ~ .
 *     . . . . .
 */
function createSeaWorld(): GameWorld {
    const world = createWorld();
    const sea: WorldMap = {
        ...createEmptyWorldMap({ id: 'sea', name: 'Sea', width: 5, height: 3, tilesetId: 'overworld', fillTileId: 1 }),
        entities: [
            { type: 'ship', id: 'boat', x: 2, y: 1, facing: 'down' },
            { type: 'warp', id: 'dock-door', x: 4, y: 0, target: { mapId: 'house', x: 1, y: 1 } }
        ]
    };
    for (const index of [2, 3, 7, 8]) {
        sea.layers.ground[index] = 4;
    }
    world.maps.sea = sea;

    return world;
}

function getBoat(world: GameWorld) {
    return world.maps.sea.entities.find((entity) => entity.type === 'ship')!;
}

function press(state: GameState, world: GameWorld): GameState {
    return updateGame(state, world, { direction: null, interact: true }, 16);
}

describe('game', () => {
    it('walks one tile per step, smoothly', () => {
        const world = createWorld();
        let state = createGameState('route', { x: 2, y: 2 });

        state = updateGame(state, world, { direction: 'right', interact: false }, 0);
        expect(state.player).toMatchObject({ x: 3, y: 2, facing: 'right' });

        state = updateGame(state, world, idle, stepDuration / 2);
        expect(getPlayerPosition(state)).toEqual({ x: 2.5, y: 2 });

        state = updateGame(state, world, idle, stepDuration / 2);
        expect(state.player.step).toBeNull();
        expect(getPlayerPosition(state)).toEqual({ x: 3, y: 2 });
    });

    it('keeps walking without stopping while the direction is held', () => {
        const world = createWorld();
        let state = updateGame(
            createGameState('route', { x: 0, y: 2 }),
            world,
            { direction: 'right', interact: false },
            0
        );

        state = updateGame(state, world, { direction: 'right', interact: false }, stepDuration + 10);

        expect(state.player).toMatchObject({ x: 2, y: 2, step: { fromX: 1, elapsed: 10 } });
    });

    it('turns but does not walk into solid tiles, NPCs or the map edge', () => {
        const world = createWorld();
        const blocked = [
            { start: { x: 1, y: 1 }, direction: 'left' as const },
            { start: { x: 2, y: 1 }, direction: 'up' as const },
            { start: { x: 0, y: 0 }, direction: 'up' as const }
        ];

        for (const { start, direction } of blocked) {
            const state = updateGame(createGameState('route', start), world, { direction, interact: false }, 16);

            expect(state.player).toMatchObject({ ...start, facing: direction, step: null });
        }
    });

    it('talks to the NPC in front, who turns to the player, and remembers flags', () => {
        const world = createWorld();
        let state = createGameState('route', { x: 2, y: 1 }, 'up');

        state = press(state, world);
        expect(state.dialogue).toBe('Hello!');
        expect(state.npcFacing['route/man']).toBe('down');

        state = press(state, world);
        expect(state.dialogue).toBeNull();
        expect(state.flags).toEqual({ met: true });

        state = press(state, world);
        expect(state.dialogue).toBe('Again?');
    });

    it('moves wandering NPCs without editing the map positions', () => {
        const world = createWorld();
        const npc = world.maps.route.entities.find((entity) => entity.type === 'npc')!;

        npc.movement = 'wander';
        let state = createGameState('route', { x: 0, y: 0 });

        state = updateGame(state, world, idle, 1200);
        expect(getNpcPosition(state, 'route', npc)).toEqual({ x: 2, y: 0 });

        state = updateGame(state, world, idle, stepDuration / 2);
        expect(getNpcPosition(state, 'route', npc)).toEqual({ x: 2, y: 0.5 });

        state = updateGame(state, world, idle, stepDuration / 2);
        expect(getNpcPosition(state, 'route', npc)).toEqual({ x: 2, y: 1 });
        expect(npc).toMatchObject({ x: 2, y: 0 });
    });

    it('uses wandering NPC positions for collision and interaction', () => {
        const world = createWorld();
        const npc = world.maps.route.entities.find((entity) => entity.type === 'npc')!;

        npc.movement = 'wander';
        let state = updateGame(createGameState('route', { x: 0, y: 0 }), world, idle, 1200 + stepDuration);

        state = updateGame(state, world, { direction: 'right', interact: false }, 0);
        expect(state.player).toMatchObject({ x: 1, y: 0 });

        state = press(createGameState('route', { x: 2, y: 2 }, 'up'), world);
        expect(state.dialogue).toBeNull();

        state = press(updateGame(state, world, idle, 1200 + stepDuration), world);
        expect(state.dialogue).toBe('Hello!');
    });

    it('runs a step trigger once', () => {
        const world = createWorld();
        let state = run(createGameState('route', { x: 1, y: 3 }), world, { direction: 'down' }, stepDuration);
        expect(state.dialogue).toBe('Careful!');

        state = press(state, world);
        state = run(state, world, { direction: 'right' }, stepDuration);
        state = run(state, world, { direction: 'left' }, stepDuration);
        expect(state.player).toMatchObject({ x: 1, y: 4 });
        expect(state.dialogue).toBeNull();
    });

    it('warps with a fade when stepping on a warp', () => {
        const world = createWorld();
        let state = run(createGameState('route', { x: 4, y: 1 }), world, { direction: 'up' }, stepDuration);
        expect(state.transition?.phase).toBe('out');

        state = updateGame(state, world, idle, fadeDuration);
        expect(state).toMatchObject({ mapId: 'house', player: { x: 1, y: 1 } });
        expect(getFadeOpacity(state)).toBe(1);

        state = updateGame(state, world, idle, fadeDuration);
        expect(state.transition).toBeNull();
    });

    it('reports warps to maps that do not exist instead of warping', () => {
        const world = createWorld();
        delete world.maps.house;

        const state = run(createGameState('route', { x: 4, y: 1 }), world, { direction: 'up' }, stepDuration);

        expect(state.transition).toBeNull();
        expect(state.notice).toMatch(/"house", which does not exist/);
    });

    it('picks up an item in front, which then disappears and no longer blocks the way', () => {
        const world = createWorld();
        let state = updateGame(createGameState('route', { x: 2, y: 2 }), world, { ...idle, direction: 'down' }, 16);
        expect(state.player).toMatchObject({ x: 2, y: 2, facing: 'down', step: null });

        state = press(state, world);
        expect(state.dialogue).toBe('Found Potion!');
        expect(state.inventory).toEqual([{ item: 'potion', count: 1 }]);
        expect(state.collectedItems).toEqual(['route/ball']);

        state = press(press(state, world), world);
        expect(state.dialogue).toBeNull();
        expect(getItemCount(state, 'potion')).toBe(1);

        state = run(state, world, { direction: 'down' }, stepDuration);
        expect(state.player).toMatchObject({ x: 2, y: 3 });
    });

    it('gathers a resource in front, which then disappears and no longer blocks the way', () => {
        const world = createWorld();
        let state = updateGame(createGameState('route', { x: 1, y: 2 }), world, { ...idle, direction: 'down' }, 16);
        expect(state.player).toMatchObject({ x: 1, y: 2, facing: 'down', step: null });

        state = press(state, world);
        expect(state.dialogue).toBe('Gathered 2 × Wood!');
        expect(state.inventory).toEqual([{ item: 'wood', count: 2 }]);
        expect(state.gatheredResources).toEqual(['route/branches']);

        state = press(press(state, world), world);
        state = run(state, world, { direction: 'down' }, stepDuration);
        expect(state.player).toMatchObject({ x: 1, y: 3 });
    });

    it('gives items from a script, stacking items the player already has', () => {
        const world = createWorld();
        let state = press(createGameState('route', { x: 2, y: 2 }, 'down'), world);

        state = press(state, world);
        state = run(state, world, { direction: 'right' }, stepDuration);
        state = run(state, world, { direction: 'right' }, stepDuration);
        state = run(state, world, { direction: 'down' }, stepDuration);
        state = updateGame(state, world, { ...idle, direction: 'down' }, 16);
        state = press(state, world);
        expect(state.dialogue).toBe('Received 2 × Potion!');

        state = press(state, world);
        expect(state.dialogue).toBe('Received Key!');

        state = press(state, world);
        expect(state.dialogue).toBe('Enjoy!');
        expect(state.inventory).toEqual([
            { item: 'potion', count: 3 },
            { item: 'key', count: 1 }
        ]);
    });

    it('opens a mini game from a script and continues with success actions after the right answer', () => {
        const world = createWorld();

        world.maps.route.scripts.gift = [
            {
                type: 'miniGame',
                miniGame: {
                    type: 'password',
                    title: 'Electrical board',
                    prompt: 'Enter the reset code.',
                    answer: 'sparks',
                    success: [
                        { type: 'setFlag', flag: 'board-reset', value: true },
                        { type: 'say', text: 'The board hums back to life.' }
                    ]
                }
            }
        ];
        let state = press(createGameState('route', { x: 3, y: 4 }, 'right'), world);

        expect(state.miniGame?.definition.title).toBe('Electrical board');
        expect(state.dialogue).toBeNull();

        state = updateGame(state, world, { ...idle, direction: 'left' }, stepDuration);
        expect(state.player).toMatchObject({ x: 3, y: 4, step: null });

        state = submitMiniGameAnswer(state, world, 'wrong');
        expect(state.miniGame?.feedback).toBe('That is not the right answer.');
        expect(state.flags['board-reset']).toBeUndefined();

        state = submitMiniGameAnswer(state, world, 'SPARKS');
        expect(state.miniGame).toBeNull();
        expect(state.flags['board-reset']).toBe(true);
        expect(state.dialogue).toBe('The board hums back to life.');
    });

    it('opens the inventory when idle, moves the selection with wrap-around and pauses the world', () => {
        const world = createWorld();
        let state = createGameState('route', { x: 2, y: 2 });

        state.inventory = [
            { item: 'potion', count: 1 },
            { item: 'key', count: 1 }
        ];
        state = updateGame(state, world, { ...idle, menu: true }, 16);
        expect(state.menu).toEqual({ selected: 0 });

        state = updateGame(state, world, { ...idle, pressedDirection: 'down' }, 16);
        expect(state.menu).toEqual({ selected: 1 });
        state = updateGame(state, world, { ...idle, pressedDirection: 'down' }, 16);
        expect(state.menu).toEqual({ selected: 0 });
        state = updateGame(state, world, { ...idle, pressedDirection: 'up' }, 16);
        expect(state.menu).toEqual({ selected: 1 });

        state = updateGame(state, world, { direction: 'right', interact: true }, stepDuration);
        expect(state.player).toMatchObject({ x: 2, y: 2, step: null });
        expect(state.dialogue).toBeNull();

        state = updateGame(state, world, { ...idle, menu: true }, 16);
        expect(state.menu).toBeNull();
    });

    it('does not open the inventory during a dialogue', () => {
        const world = createWorld();
        let state = press(createGameState('route', { x: 2, y: 1 }, 'up'), world);

        state = updateGame(state, world, { ...idle, menu: true }, 16);

        expect(state.menu).toBeNull();
        expect(state.dialogue).toBe('Hello!');
    });

    it('cannot walk onto a ship, but boards it from the coast with the interact key', () => {
        const world = createSeaWorld();
        let state = updateGame(createGameState('sea', { x: 1, y: 1 }), world, { ...idle, direction: 'right' }, 16);
        expect(state.player).toMatchObject({ x: 1, y: 1, facing: 'right', step: null });

        state = press(state, world);
        expect(state.sailing).toBe('sea/boat');
        expect(state.player).toMatchObject({ x: 2, y: 1, step: { boarding: true } });
        expect(getShipPosition(state, 'sea', getBoat(world))).toEqual({ x: 2, y: 1 });
        expect(getShipState(state, 'sea', getBoat(world)).facing).toBe('right');

        state = updateGame(state, world, idle, stepDuration);
        expect(state.player.step).toBeNull();
    });

    it('sails on water only, moving the ship with the player', () => {
        const world = createSeaWorld();
        let state = updateGame(
            press(createGameState('sea', { x: 1, y: 1 }, 'right'), world),
            world,
            idle,
            stepDuration
        );

        state = updateGame(state, world, { ...idle, direction: 'up' }, 0);
        state = updateGame(state, world, idle, stepDuration / 2);
        expect(getShipPosition(state, 'sea', getBoat(world))).toEqual({ x: 2, y: 0.5 });

        state = run(state, world, {}, stepDuration);
        state = run(state, world, { direction: 'right' }, stepDuration);
        expect(state.player).toMatchObject({ x: 3, y: 0 });

        // Land, the map edge and the door are not water.
        for (const direction of ['right', 'up'] as const) {
            state = updateGame(state, world, { ...idle, direction }, 16);
            expect(state.player).toMatchObject({ x: 3, y: 0, facing: direction, step: null });
        }
        expect(getShipState(state, 'sea', getBoat(world))).toEqual({ x: 3, y: 0, facing: 'up' });
        expect(getBoat(world)).toMatchObject({ x: 2, y: 1 });
    });

    it('goes ashore on the coast in front, leaving the ship behind, and can board it again', () => {
        const world = createSeaWorld();
        let state = updateGame(
            press(createGameState('sea', { x: 1, y: 1 }, 'right'), world),
            world,
            idle,
            stepDuration
        );

        state = run(state, world, { direction: 'up' }, stepDuration);
        state = updateGame(state, world, { ...idle, direction: 'left' }, 16);
        state = press(state, world);
        expect(state.sailing).toBeNull();
        expect(state.player).toMatchObject({ x: 1, y: 0, facing: 'left' });
        expect(getShipState(state, 'sea', getBoat(world))).toMatchObject({ x: 2, y: 0 });

        state = updateGame(state, world, idle, stepDuration);
        state = updateGame(state, world, { ...idle, direction: 'right' }, 16);
        state = press(state, world);
        expect(state.sailing).toBe('sea/boat');
        expect(state.player).toMatchObject({ x: 2, y: 0 });
    });

    it('goes ashore on any coast next to the ship when there is only water in front', () => {
        const world = createSeaWorld();
        let state = updateGame(
            press(createGameState('sea', { x: 1, y: 1 }, 'right'), world),
            world,
            idle,
            stepDuration
        );

        state = press(state, world);

        expect(state.sailing).toBeNull();
        expect(state.player).toMatchObject({ x: 2, y: 2, facing: 'down' });
    });

    it('does not open doors while sailing and arrives on foot after a warp', () => {
        const world = createSeaWorld();
        world.maps.sea.entities.push({
            type: 'warp',
            id: 'whirlpool',
            x: 3,
            y: 1,
            target: { mapId: 'house', x: 1, y: 1 }
        });
        let state = updateGame(
            press(createGameState('sea', { x: 1, y: 1 }, 'right'), world),
            world,
            idle,
            stepDuration
        );

        state = run(state, world, { direction: 'right' }, stepDuration);
        expect(state.player).toMatchObject({ x: 3, y: 1 });
        expect(state.transition).toBeNull();

        state = updateGame(state, world, { ...idle, direction: 'down' }, 16);
        state = updateGame(press(state, world), world, idle, stepDuration);
        expect(state).toMatchObject({ sailing: null, player: { x: 3, y: 2 } });

        state = run(state, world, { direction: 'right' }, stepDuration);
        state = run(state, world, { direction: 'up' }, stepDuration);
        state = run(state, world, { direction: 'up' }, stepDuration);
        expect(state.transition?.phase).toBe('out');
        state = updateGame(state, world, idle, fadeDuration);
        expect(state).toMatchObject({ mapId: 'house', sailing: null });
    });

    it('finds the nearest walkable tile to start on', () => {
        const world = createWorld();

        expect(findWalkableTile(world.maps.route, tileset, 0, 1)).toEqual({ x: 0, y: 0 });
        expect(findWalkableTile(world.maps.route, tileset, 3, 3)).toEqual({ x: 3, y: 3 });
    });
});
