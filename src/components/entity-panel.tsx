import { useState, type CSSProperties, type FormEvent } from 'react';
import { spriteSheet, useEditor } from '../editor/editor';
import { createUniqueId } from '../world-map/entities';
import { getScriptUsers } from '../world-map/scripts';
import { getSpriteFrame } from '../world-map/sprite-sheet';
import { resourceTypes, scriptActionSchema, type Entity, type Facing, type ScriptAction } from '../world-map/world-map';
import styles from './control-panel.module.css';
import { ItemFields, ScriptEditor, WarpTargetFields } from './script-editor';

const scriptHelp =
    'Actions: say { text }, setFlag { flag, value }, giveItem { item, count }, warp { target: { mapId, x, y } }, ' +
    'if { flag, then, else }';

const newScriptOption = '\u0000new';

/** Properties of the selected entity. Remounts whenever the stored entity changes, e.g. after undo or a drag. */
export function EntityPanel() {
    const map = useEditor((state) => state.map);
    const selectedEntityId = useEditor((state) => state.selectedEntityId);
    const entity = map.entities.find((candidate) => candidate.id === selectedEntityId);

    if (!entity) {
        return null;
    }
    const script = 'script' in entity ? map.scripts[entity.script] : undefined;

    return <EntityForm key={JSON.stringify([entity, script])} entity={entity} script={script} />;
}

type EntityFormProperties = {
    entity: Entity;
    script: ScriptAction[] | undefined;
};

function EntityForm(properties: EntityFormProperties) {
    const { entity, script } = properties;
    const map = useEditor((state) => state.map);
    const updateEntity = useEditor((state) => state.updateEntity);
    const deleteEntity = useEditor((state) => state.deleteEntity);
    const [draft, setDraft] = useState<Entity>(entity);
    const [actions, setActions] = useState<ScriptAction[]>(script ?? []);
    /** Script as JSON text while editing it as JSON, otherwise null. */
    const [scriptText, setScriptText] = useState<string | null>(null);
    /** Id for a new script, while "New script" is chosen, otherwise null. */
    const [newScriptId, setNewScriptId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function change(changes: Record<string, unknown>) {
        setDraft({ ...draft, ...changes } as Entity);
    }

    /** The script actions being edited, or an error message when the JSON text is not a valid script. */
    function readActions(): ScriptAction[] | string {
        if (scriptText === null) {
            return actions;
        }
        try {
            const result = scriptActionSchema.array().safeParse(JSON.parse(scriptText));

            return result.success ? result.data : 'The script is not a list of valid actions';
        } catch {
            return 'The script is not valid JSON';
        }
    }

    function toggleJson() {
        if (scriptText === null) {
            setScriptText(JSON.stringify(actions, null, 2));

            return;
        }
        const result = readActions();

        if (typeof result === 'string') {
            return setError(result);
        }
        setActions(result);
        setScriptText(null);
        setError(null);
    }

    function chooseScript(value: string) {
        if (value === newScriptOption) {
            setNewScriptId(createUniqueId(map, draft.id));

            return;
        }
        setNewScriptId(null);
        change({ script: value });
        setActions(map.scripts[value] ?? []);
        setScriptText(null);
    }

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!('script' in draft)) {
            return setError(updateEntity(entity.id, draft));
        }
        const scriptActions = readActions();

        if (typeof scriptActions === 'string') {
            return setError(scriptActions);
        }
        if (newScriptId !== null) {
            if (!newScriptId.trim()) {
                return setError('The new script needs an id');
            }
            if (newScriptId in map.scripts) {
                return setError(`There is already a script "${newScriptId}". Pick it from the list to share it.`);
            }
        }
        setError(updateEntity(entity.id, { ...draft, script: newScriptId ?? draft.script }, scriptActions));
    }

    const scriptId = 'script' in draft ? draft.script : null;
    const sharedWith =
        scriptId && newScriptId === null ? getScriptUsers(map, scriptId).filter((id) => id !== entity.id) : [];

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles['form-heading']}>
                <strong>Selected {entity.type}</strong>
                <span>
                    {draft.x}, {draft.y}
                </span>
            </div>

            <fieldset>
                <legend>Basics</legend>
                <TextField label='Id' value={draft.id} onChange={(id) => change({ id })} />
                <div className={styles.pair}>
                    <NumberField label='X' value={draft.x} onChange={(x) => change({ x })} />
                    <NumberField label='Y' value={draft.y} onChange={(y) => change({ y })} />
                </div>
            </fieldset>

            {draft.type === 'warp' && (
                <fieldset>
                    <legend>Destination</legend>
                    <WarpTargetFields target={draft.target} onChange={(target) => change({ target })} />
                </fieldset>
            )}

            {draft.type === 'npc' && (
                <fieldset>
                    <legend>NPC</legend>
                    <SpriteField
                        sprite={draft.sprite}
                        facing={draft.facing}
                        onChange={(sprite) => change({ sprite })}
                    />
                    <div className={styles.pair}>
                        <SelectField
                            label='Facing'
                            value={draft.facing}
                            options={['down', 'up', 'left', 'right']}
                            onChange={(facing) => change({ facing })}
                        />
                        <SelectField
                            label='Movement'
                            value={draft.movement}
                            options={['static', 'wander']}
                            onChange={(movement) => change({ movement })}
                        />
                    </div>
                </fieldset>
            )}

            {draft.type === 'item' && (
                <fieldset>
                    <legend>Item</legend>
                    <ItemFields item={draft.item} count={draft.count} onChange={change} />
                    <p className={styles.hint}>The player picks it up by facing it and pressing the interact key.</p>
                </fieldset>
            )}

            {draft.type === 'resource' && (
                <fieldset>
                    <legend>Resource</legend>
                    <div className={styles.pair}>
                        <SelectField
                            label='Resource'
                            value={draft.resource}
                            options={[...resourceTypes]}
                            onChange={(resource) => change({ resource })}
                        />
                        <NumberField
                            label='Count'
                            value={draft.count ?? 1}
                            min={1}
                            onChange={(count) => change({ count: count === 1 ? undefined : count })}
                        />
                    </div>
                    <p className={styles.hint}>The player gathers it by facing it and pressing the interact key.</p>
                </fieldset>
            )}

            {draft.type === 'ship' && (
                <fieldset>
                    <legend>Ship</legend>
                    <SelectField
                        label='Facing'
                        value={draft.facing}
                        options={['down', 'up', 'left', 'right']}
                        onChange={(facing) => change({ facing })}
                    />
                    <p className={styles.hint}>
                        Place it on water next to the coast. The player boards it by facing it and pressing the interact
                        key, sails on water tiles and goes ashore with the interact key.
                    </p>
                </fieldset>
            )}

            {draft.type === 'trigger' && (
                <fieldset>
                    <legend>Trigger area</legend>
                    <div className={styles.pair}>
                        <NumberField label='Width' value={draft.width} onChange={(width) => change({ width })} />
                        <NumberField label='Height' value={draft.height} onChange={(height) => change({ height })} />
                    </div>
                    <div className={styles.pair}>
                        <SelectField
                            label='Runs on'
                            value={draft.on}
                            options={['step', 'interact']}
                            onChange={(on) => change({ on })}
                        />
                        <label>
                            Only once
                            <input
                                type='checkbox'
                                checked={draft.once ?? false}
                                onChange={(event) => change({ once: event.target.checked || undefined })}
                            />
                        </label>
                    </div>
                </fieldset>
            )}

            {scriptId !== null && (
                <fieldset>
                    <legend>Script</legend>
                    <label>
                        Script
                        <select
                            value={newScriptId === null ? scriptId : newScriptOption}
                            onChange={(event) => chooseScript(event.target.value)}
                        >
                            {Object.keys(map.scripts)
                                .sort()
                                .map((id) => {
                                    const users = getScriptUsers(map, id);

                                    return (
                                        <option key={id} value={id}>
                                            {id}
                                            {users.length > 0 ? ` (used by ${users.join(', ')})` : ''}
                                        </option>
                                    );
                                })}
                            {!(scriptId in map.scripts) && <option value={scriptId}>{scriptId}</option>}
                            <option value={newScriptOption}>New script…</option>
                        </select>
                    </label>
                    {newScriptId !== null && (
                        <TextField label='New script id' value={newScriptId} onChange={setNewScriptId} />
                    )}
                    {sharedWith.length > 0 && (
                        <p className={styles.hint}>
                            Shared with {sharedWith.join(', ')}: changes apply to all of them.
                        </p>
                    )}
                    <div className={styles.row}>
                        <span className={styles.grow}>{scriptText === null ? 'Actions' : 'Script (JSON)'}</span>
                        <button type='button' className={styles.small} onClick={toggleJson}>
                            {scriptText === null ? 'Edit as JSON' : 'Edit as list'}
                        </button>
                    </div>
                    {scriptText === null ? (
                        <ScriptEditor actions={actions} onChange={setActions} />
                    ) : (
                        <label title={scriptHelp}>
                            <textarea
                                value={scriptText}
                                spellCheck={false}
                                onChange={(event) => setScriptText(event.target.value)}
                            />
                        </label>
                    )}
                </fieldset>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.row}>
                <button type='submit'>Apply</button>
                <button type='button' className={styles.danger} onClick={() => deleteEntity(entity.id)}>
                    Delete
                </button>
            </div>
        </form>
    );
}

type SpriteFieldProperties = {
    sprite: string;
    facing: Facing;
    onChange: (sprite: string) => void;
};

function SpriteField(properties: SpriteFieldProperties) {
    const { sprite, facing, onChange } = properties;
    const options = spriteSheet.sprites.includes(sprite) ? spriteSheet.sprites : [...spriteSheet.sprites, sprite];

    return (
        <div className={styles['sprite-field']}>
            <label>
                Sprite
                <select value={sprite} onChange={(event) => onChange(event.target.value)}>
                    {options.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
            </label>
            <div className={styles['sprite-grid']} aria-label='Sprite previews'>
                {options.map((option) => (
                    <button
                        key={option}
                        type='button'
                        className={option === sprite ? styles.active : undefined}
                        title={option}
                        onClick={() => onChange(option)}
                    >
                        <span className={styles['sprite-preview']} style={getSpritePreviewStyle(option, facing)} />
                        <span>{option}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function getSpritePreviewStyle(sprite: string, facing: Facing): CSSProperties | undefined {
    const frame = getSpriteFrame(spriteSheet, sprite, facing);

    if (!frame) {
        return undefined;
    }
    const size = spriteSheet.frameSize;

    return {
        backgroundImage: `url(${spriteSheet.image})`,
        backgroundPosition: `-${frame.column * size * 2}px -${frame.row * size * 2}px`,
        backgroundSize: `${spriteSheet.facings.length * size * 2}px ${spriteSheet.sprites.length * size * 2}px`
    };
}

type FieldProperties<T> = {
    label: string;
    value: T;
    onChange: (value: T) => void;
};

function TextField(properties: FieldProperties<string>) {
    const { label, value, onChange } = properties;

    return (
        <label>
            {label}
            <input value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}

function NumberField(properties: FieldProperties<number> & { min?: number }) {
    const { label, value, min = 0, onChange } = properties;

    return (
        <label>
            {label}
            <input
                type='number'
                min={min}
                step={1}
                value={Number.isNaN(value) ? '' : value}
                onChange={(event) => onChange(event.target.valueAsNumber)}
            />
        </label>
    );
}

function SelectField<T extends string>(properties: FieldProperties<T> & { options: T[] }) {
    const { label, value, options, onChange } = properties;

    return (
        <label>
            {label}
            <select value={value} onChange={(event) => onChange(event.target.value as T)}>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}
