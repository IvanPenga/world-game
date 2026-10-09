import { describe, expect, it } from 'vitest';
import { getFlagUsage, getScriptUsers, getWarpTargets } from './scripts';
import { createEmptyWorldMap, type WorldMap } from './world-map';

function createTestMap(): WorldMap {
    return {
        ...createEmptyWorldMap({ id: 'm', name: 'M', width: 4, height: 4, tilesetId: 'overworld' }),
        entities: [
            { type: 'warp', id: 'door', x: 0, y: 0, target: { mapId: 'house', x: 1, y: 1 } },
            { type: 'sign', id: 'sign', x: 1, y: 0, script: 'talk' }
        ],
        scripts: {
            talk: [
                {
                    type: 'if',
                    flag: 'met',
                    then: [{ type: 'warp', target: { mapId: 'cave', x: 0, y: 0 } }],
                    else: [{ type: 'setFlag', flag: 'met', value: true }]
                }
            ]
        }
    };
}

describe('scripts', () => {
    it('collects the flags scripts set and check, including inside branches', () => {
        expect(getFlagUsage(createTestMap())).toEqual(new Map([['met', { setIn: ['talk'], checkedIn: ['talk'] }]]));
    });

    it('lists warp entities and warp actions', () => {
        expect(getWarpTargets(createTestMap())).toEqual([
            { target: { mapId: 'house', x: 1, y: 1 }, source: 'warp "door"', entityId: 'door' },
            { target: { mapId: 'cave', x: 0, y: 0 }, source: 'script "talk"', entityId: 'sign' }
        ]);
    });

    it('finds the entities that run a script', () => {
        expect(getScriptUsers(createTestMap(), 'talk')).toEqual(['sign']);
    });
});
