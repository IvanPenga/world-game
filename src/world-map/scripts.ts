import type { ScriptAction, WarpTarget, WorldMap } from './world-map';

/** Calls `visit` for every action in a script, including the actions inside `if` branches. */
export function forEachAction(actions: ScriptAction[], visit: (action: ScriptAction) => void) {
    for (const action of actions) {
        visit(action);
        if (action.type === 'if') {
            forEachAction(action.then, visit);
            forEachAction(action.else ?? [], visit);
        } else if (action.type === 'miniGame') {
            forEachAction(action.miniGame.success ?? [], visit);
            forEachAction(action.miniGame.failure ?? [], visit);
        }
    }
}

export type FlagUsage = {
    /** Script ids that set the flag. */
    setIn: string[];
    /** Script ids that branch on the flag. */
    checkedIn: string[];
};

/** Every flag the map's scripts set or check, sorted by name. */
export function getFlagUsage(map: WorldMap): Map<string, FlagUsage> {
    const usage = new Map<string, FlagUsage>();

    function add(flag: string, key: keyof FlagUsage, scriptId: string) {
        const entry = usage.get(flag) ?? { setIn: [], checkedIn: [] };

        if (!entry[key].includes(scriptId)) {
            entry[key].push(scriptId);
        }
        usage.set(flag, entry);
    }

    for (const [scriptId, actions] of Object.entries(map.scripts)) {
        forEachAction(actions, (action) => {
            if (action.type === 'setFlag') {
                add(action.flag, 'setIn', scriptId);
            } else if (action.type === 'if') {
                add(action.flag, 'checkedIn', scriptId);
            }
        });
    }

    return new Map([...usage].sort(([a], [b]) => a.localeCompare(b)));
}

/** Ids of the entities that run the script. */
export function getScriptUsers(map: WorldMap, scriptId: string): string[] {
    return map.entities.filter((entity) => 'script' in entity && entity.script === scriptId).map((entity) => entity.id);
}

export type WarpSource = {
    target: WarpTarget;
    /** Readable description of where the warp comes from, e.g. `warp "house-door"`. */
    source: string;
    /** The warp entity, or the first entity that runs the script with the `warp` action. */
    entityId?: string;
};

/** Every place the map warps to: warp entities and `warp` script actions. */
export function getWarpTargets(map: WorldMap): WarpSource[] {
    const targets: WarpSource[] = [];

    for (const entity of map.entities) {
        if (entity.type === 'warp') {
            targets.push({ target: entity.target, source: `warp "${entity.id}"`, entityId: entity.id });
        }
    }
    for (const [scriptId, actions] of Object.entries(map.scripts)) {
        forEachAction(actions, (action) => {
            if (action.type === 'warp') {
                targets.push({
                    target: action.target,
                    source: `script "${scriptId}"`,
                    entityId: getScriptUsers(map, scriptId)[0]
                });
            }
        });
    }

    return targets;
}
