import { useId } from 'react';
import { itemCatalog, useEditor } from '../editor/editor';
import { useKnownFlags } from '../editor/use-known-flags';
import { getItem } from '../world-map/items';
import type { ScriptAction, WarpTarget } from '../world-map/world-map';
import styles from './control-panel.module.css';

const actionTypes: ScriptAction['type'][] = ['say', 'setFlag', 'giveItem', 'warp', 'miniGame', 'if'];

const actionLabels: Record<ScriptAction['type'], string> = {
    say: 'Say',
    setFlag: 'Set flag',
    giveItem: 'Give item',
    warp: 'Warp',
    miniGame: 'Mini game',
    if: 'If flag'
};

function createAction(type: ScriptAction['type'], currentMapId: string): ScriptAction {
    switch (type) {
        case 'say':
            return { type, text: '' };
        case 'setFlag':
            return { type, flag: '', value: true };
        case 'giveItem':
            return { type, item: itemCatalog.items[0]?.id ?? '' };
        case 'warp':
            return { type, target: { mapId: currentMapId, x: 0, y: 0 } };
        case 'miniGame':
            return {
                type,
                miniGame: {
                    type: 'password',
                    title: 'Locked panel',
                    prompt: 'Enter the code.',
                    answer: '',
                    success: [{ type: 'say', text: 'Unlocked!' }]
                }
            };
        case 'if':
            return { type, flag: '', then: [] };
    }
}

/** Edits a script as a list of actions. `if` actions contain their own lists for "then" and "else". */
export function ScriptEditor(properties: { actions: ScriptAction[]; onChange: (actions: ScriptAction[]) => void }) {
    const flagListId = useId();
    const knownFlags = useKnownFlags();

    return (
        <div className={styles.script}>
            <datalist id={flagListId}>
                {knownFlags.map((flag) => (
                    <option key={flag} value={flag} />
                ))}
            </datalist>
            <ActionList {...properties} flagListId={flagListId} />
        </div>
    );
}

type ActionListProperties = {
    actions: ScriptAction[];
    onChange: (actions: ScriptAction[]) => void;
    flagListId: string;
};

function ActionList(properties: ActionListProperties) {
    const { actions, onChange, flagListId } = properties;
    const mapId = useEditor((state) => state.map.id);

    function replace(index: number, action: ScriptAction | null) {
        onChange(action ? actions.with(index, action) : actions.toSpliced(index, 1));
    }

    function move(index: number, offset: number) {
        const next = [...actions];

        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        onChange(next);
    }

    return (
        <div className={styles['action-list']}>
            {actions.map((action, index) => (
                <div key={index} className={styles.action}>
                    <div className={styles.row}>
                        <select
                            value={action.type}
                            onChange={(event) =>
                                replace(index, createAction(event.target.value as ScriptAction['type'], mapId))
                            }
                        >
                            {actionTypes.map((type) => (
                                <option key={type} value={type}>
                                    {actionLabels[type]}
                                </option>
                            ))}
                        </select>
                        <span className={styles.grow} />
                        <button type='button' title='Move up' disabled={index === 0} onClick={() => move(index, -1)}>
                            ↑
                        </button>
                        <button
                            type='button'
                            title='Move down'
                            disabled={index === actions.length - 1}
                            onClick={() => move(index, 1)}
                        >
                            ↓
                        </button>
                        <button type='button' title='Remove' onClick={() => replace(index, null)}>
                            ✕
                        </button>
                    </div>
                    <ActionFields
                        action={action}
                        flagListId={flagListId}
                        onChange={(changed) => replace(index, changed)}
                    />
                </div>
            ))}
            <div className={styles.row}>
                {actionTypes.map((type) => (
                    <button
                        key={type}
                        type='button'
                        className={styles.small}
                        onClick={() => onChange([...actions, createAction(type, mapId)])}
                    >
                        + {actionLabels[type]}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ActionFields(properties: {
    action: ScriptAction;
    flagListId: string;
    onChange: (action: ScriptAction) => void;
}) {
    const { action, flagListId, onChange } = properties;

    switch (action.type) {
        case 'say':
            return (
                <textarea
                    className={styles.text}
                    value={action.text}
                    placeholder='What is said'
                    onChange={(event) => onChange({ ...action, text: event.target.value })}
                />
            );
        case 'setFlag':
            return (
                <div className={styles.pair}>
                    <input
                        value={action.flag}
                        list={flagListId}
                        placeholder='flag-name'
                        onChange={(event) => onChange({ ...action, flag: event.target.value })}
                    />
                    <select
                        value={String(action.value)}
                        onChange={(event) => onChange({ ...action, value: event.target.value === 'true' })}
                    >
                        <option value='true'>true</option>
                        <option value='false'>false</option>
                    </select>
                </div>
            );
        case 'giveItem':
            return (
                <ItemFields
                    item={action.item}
                    count={action.count}
                    onChange={(changes) => onChange({ ...action, ...changes })}
                />
            );
        case 'warp':
            return <WarpTargetFields target={action.target} onChange={(target) => onChange({ ...action, target })} />;
        case 'miniGame':
            return (
                <>
                    <label>
                        Title
                        <input
                            value={action.miniGame.title}
                            onChange={(event) =>
                                onChange({ ...action, miniGame: { ...action.miniGame, title: event.target.value } })
                            }
                        />
                    </label>
                    <label>
                        Prompt
                        <textarea
                            className={styles.text}
                            value={action.miniGame.prompt}
                            onChange={(event) =>
                                onChange({ ...action, miniGame: { ...action.miniGame, prompt: event.target.value } })
                            }
                        />
                    </label>
                    <div className={styles.pair}>
                        <label>
                            Answer
                            <input
                                value={action.miniGame.answer}
                                onChange={(event) =>
                                    onChange({
                                        ...action,
                                        miniGame: { ...action.miniGame, answer: event.target.value }
                                    })
                                }
                            />
                        </label>
                        <label className={styles.option}>
                            <input
                                type='checkbox'
                                checked={action.miniGame.caseSensitive ?? false}
                                onChange={(event) =>
                                    onChange({
                                        ...action,
                                        miniGame: {
                                            ...action.miniGame,
                                            caseSensitive: event.target.checked || undefined
                                        }
                                    })
                                }
                            />{' '}
                            Case-sensitive
                        </label>
                    </div>
                    <span className={styles.hint}>success</span>
                    <ActionList
                        actions={action.miniGame.success ?? []}
                        flagListId={flagListId}
                        onChange={(success) =>
                            onChange({
                                ...action,
                                miniGame: { ...action.miniGame, success: success.length > 0 ? success : undefined }
                            })
                        }
                    />
                    <span className={styles.hint}>failure</span>
                    <ActionList
                        actions={action.miniGame.failure ?? []}
                        flagListId={flagListId}
                        onChange={(failure) =>
                            onChange({
                                ...action,
                                miniGame: { ...action.miniGame, failure: failure.length > 0 ? failure : undefined }
                            })
                        }
                    />
                    <p className={styles.hint}>Without failure actions, a wrong answer keeps the mini game open.</p>
                </>
            );
        case 'if':
            return (
                <>
                    <input
                        value={action.flag}
                        list={flagListId}
                        placeholder='flag-name'
                        onChange={(event) => onChange({ ...action, flag: event.target.value })}
                    />
                    <span className={styles.hint}>then</span>
                    <ActionList
                        actions={action.then}
                        flagListId={flagListId}
                        onChange={(then) => onChange({ ...action, then })}
                    />
                    <span className={styles.hint}>else</span>
                    <ActionList
                        actions={action.else ?? []}
                        flagListId={flagListId}
                        onChange={(otherwise) =>
                            onChange({ ...action, else: otherwise.length > 0 ? otherwise : undefined })
                        }
                    />
                </>
            );
    }
}

/**
 * An item from the item catalog and how many of it, with the item's description. Used by `giveItem` actions and
 * item entities. A count of 1 is stored as no count.
 */
export function ItemFields(properties: {
    item: string;
    count: number | undefined;
    onChange: (changes: { item?: string; count?: number }) => void;
}) {
    const { item, count, onChange } = properties;
    const definition = getItem(itemCatalog, item);

    return (
        <>
            <div className={styles.pair}>
                <label>
                    Item
                    <select value={item} onChange={(event) => onChange({ item: event.target.value })}>
                        {itemCatalog.items.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.name}
                            </option>
                        ))}
                        {!definition && <option value={item}>{`${item || '(none)'} (not in the catalog)`}</option>}
                    </select>
                </label>
                <label>
                    Count
                    <input
                        type='number'
                        min={1}
                        step={1}
                        value={count ?? 1}
                        onChange={(event) => {
                            const value = event.target.valueAsNumber;

                            onChange({ count: value === 1 || Number.isNaN(value) ? undefined : value });
                        }}
                    />
                </label>
            </div>
            <p className={styles.hint}>{definition ? definition.description : 'Pick an item from the catalog'}</p>
        </>
    );
}

/**
 * Map and tile a warp leads to. The map is picked from the existing maps; the tile is checked against its size.
 * "Go to target" opens the target map and points at the tile.
 */
export function WarpTargetFields(properties: { target: WarpTarget; onChange: (target: WarpTarget) => void }) {
    const { target, onChange } = properties;
    const map = useEditor((state) => state.map);
    const maps = useEditor((state) => state.maps);
    const requestNavigation = useEditor((state) => state.requestNavigation);
    const focusTile = useEditor((state) => state.focusTile);
    const allMaps = { ...maps, [map.id]: map };
    const targetMap = allMaps[target.mapId];

    function goToTarget() {
        if (target.mapId === map.id) {
            focusTile({ x: target.x, y: target.y });
        } else {
            requestNavigation({ mapId: target.mapId, focus: { x: target.x, y: target.y } });
        }
    }

    return (
        <>
            <label>
                Target map
                <select value={target.mapId} onChange={(event) => onChange({ ...target, mapId: event.target.value })}>
                    {Object.values(allMaps)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.name} ({option.id}){option.id === map.id ? ', this map' : ''}
                            </option>
                        ))}
                    {!targetMap && <option value={target.mapId}>{`${target.mapId} (does not exist)`}</option>}
                </select>
            </label>
            <div className={styles.pair}>
                <label>
                    Target X
                    <input
                        type='number'
                        min={0}
                        max={targetMap ? targetMap.width - 1 : undefined}
                        value={Number.isNaN(target.x) ? '' : target.x}
                        onChange={(event) => onChange({ ...target, x: event.target.valueAsNumber })}
                    />
                </label>
                <label>
                    Target Y
                    <input
                        type='number'
                        min={0}
                        max={targetMap ? targetMap.height - 1 : undefined}
                        value={Number.isNaN(target.y) ? '' : target.y}
                        onChange={(event) => onChange({ ...target, y: event.target.valueAsNumber })}
                    />
                </label>
            </div>
            <div className={styles.row}>
                <span className={styles.hint}>
                    {targetMap
                        ? `"${targetMap.name}" is ${targetMap.width}×${targetMap.height}`
                        : 'Pick an existing map'}
                </span>
                <button type='button' className={styles.danger} disabled={!targetMap} onClick={goToTarget}>
                    Go to target
                </button>
            </div>
        </>
    );
}
