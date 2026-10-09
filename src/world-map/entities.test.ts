import { describe, expect, it } from 'vitest';
import { createEntity, createUniqueId, removeUnusedScript } from './entities';
import { createEmptyWorldMap, validateWorldMap, type WorldMap } from './world-map';

function setup(): WorldMap {
    return createEmptyWorldMap({ id: 'm', name: 'M', width: 4, height: 4, tilesetId: 'overworld' });
}

describe('entities', () => {
    it('creates ids that are not used by entities or scripts', () => {
        const map = setup();
        map.entities.push({ type: 'sign', id: 'sign-1', x: 0, y: 0, script: 'sign-2' });
        map.scripts['sign-2'] = [];

        expect(createUniqueId(map, 'sign')).toBe('sign-3');
    });

    it.each(['warp', 'npc', 'sign', 'trigger', 'item', 'resource', 'ship'] as const)(
        'creates a valid %s with its script',
        (type) => {
            const map = setup();
            const { entity, script } = createEntity(map, type, 1, 2);

            map.entities.push(entity);
            if ('script' in entity) {
                expect(script).toBeDefined();
                map.scripts[entity.script] = script!;
            }

            expect(validateWorldMap(map)).toBeNull();
            expect(entity).toMatchObject({ type, x: 1, y: 2 });
        }
    );

    it('only removes scripts that no entity uses', () => {
        const map = setup();
        map.entities.push({ type: 'sign', id: 'a', x: 0, y: 0, script: 'shared' });
        map.scripts = { shared: [], orphan: [] };

        removeUnusedScript(map, 'shared');
        removeUnusedScript(map, 'orphan');

        expect(Object.keys(map.scripts)).toEqual(['shared']);
    });
});
