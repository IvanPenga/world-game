import { useState, type FormEvent } from 'react';
import { useEditor } from '../editor/editor';
import { getTileDefinition, getTileIds } from '../world-map/tileset';
import { createEmptyWorldMap } from '../world-map/world-map';
import styles from './control-panel.module.css';
import { Dialog } from './dialog';

const mapIdPattern = /^[\w-]+$/;

/** Map list: switches between maps and creates new ones. */
export function MapPicker() {
    const map = useEditor((state) => state.map);
    const maps = useEditor((state) => state.maps);
    const draftMapIds = useEditor((state) => state.draftMapIds);
    const invalidFiles = useEditor((state) => state.invalidFiles);
    const loading = useEditor((state) => state.loading);
    const loadError = useEditor((state) => state.loadError);
    const requestNavigation = useEditor((state) => state.requestNavigation);
    const refreshFiles = useEditor((state) => state.refreshFiles);
    const [creating, setCreating] = useState(false);

    const savedMaps = Object.values(maps).sort((a, b) => a.name.localeCompare(b.name));
    const isNewMap = !(map.id in maps);

    return (
        <section>
            <div className={styles.row}>
                <select
                    className={styles.grow}
                    value={map.id}
                    disabled={loading}
                    title='Open a map'
                    onFocus={() => refreshFiles()}
                    onChange={(event) => requestNavigation({ mapId: event.target.value })}
                >
                    {savedMaps.map((savedMap) => (
                        <option key={savedMap.id} value={savedMap.id}>
                            {savedMap.name} ({savedMap.id})
                        </option>
                    ))}
                    {isNewMap && <option value={map.id}>{`${map.name} (${map.id}, not saved yet)`}</option>}
                    {draftMapIds
                        .filter((id) => id !== map.id)
                        .map((id) => (
                            <option key={id} value={id}>
                                {`${id} (unsaved draft)`}
                            </option>
                        ))}
                    {invalidFiles.map(({ file, error }) => (
                        <option key={file} disabled title={error}>
                            {`${file} (invalid file)`}
                        </option>
                    ))}
                </select>
                <button onClick={() => setCreating(true)}>New map</button>
            </div>
            {loading && <p className={styles.hint}>Loading…</p>}
            {loadError && <p className={styles.error}>{loadError}</p>}
            {invalidFiles.length > 0 && (
                <p className={styles.hint}>
                    {invalidFiles.length} file(s) could not be read. Hover them in the list to see why.
                </p>
            )}
            {creating && <NewMapDialog onClose={() => setCreating(false)} />}
        </section>
    );
}

function NewMapDialog(properties: { onClose: () => void }) {
    const { onClose } = properties;
    const map = useEditor((state) => state.map);
    const maps = useEditor((state) => state.maps);
    const draftMapIds = useEditor((state) => state.draftMapIds);
    const tileset = useEditor((state) => state.tileset);
    const tilesets = useEditor((state) => state.tilesets);
    const requestNavigation = useEditor((state) => state.requestNavigation);
    const usedIds = new Set([...Object.keys(maps), ...draftMapIds, map.id]);
    const [id, setId] = useState(() => {
        let number = 1;

        while (usedIds.has(`map-${number}`)) {
            number++;
        }

        return `map-${number}`;
    });
    const [name, setName] = useState('New map');
    const [width, setWidth] = useState(20);
    const [height, setHeight] = useState(18);
    const [tilesetId, setTilesetId] = useState(tileset.id);
    const [fillTileId, setFillTileId] = useState(1);
    const [error, setError] = useState<string | null>(null);
    const fillTileset = tilesets[tilesetId] ?? tileset;

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!mapIdPattern.test(id)) {
            return setError('The id may only contain letters, digits, "-" and "_". It is also the file name.');
        }
        if (usedIds.has(id)) {
            return setError(`There is already a map with the id "${id}"`);
        }
        if (![width, height].every((size) => Number.isInteger(size) && size >= 1 && size <= 255)) {
            return setError('Width and height must be whole numbers from 1 to 255');
        }
        onClose();
        requestNavigation({ newMap: createEmptyWorldMap({ id, name, width, height, tilesetId, fillTileId }) });
    }

    return (
        <Dialog title='New map' onClose={onClose}>
            <form className={styles.form} onSubmit={handleSubmit}>
                <label>
                    Id (file name)
                    <input value={id} autoFocus onChange={(event) => setId(event.target.value)} />
                </label>
                <label>
                    Name
                    <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <div className={styles.pair}>
                    <label>
                        Width
                        <input
                            type='number'
                            min={1}
                            max={255}
                            value={width}
                            onChange={(event) => setWidth(event.target.valueAsNumber)}
                        />
                    </label>
                    <label>
                        Height
                        <input
                            type='number'
                            min={1}
                            max={255}
                            value={height}
                            onChange={(event) => setHeight(event.target.valueAsNumber)}
                        />
                    </label>
                </div>
                <div className={styles.pair}>
                    <label>
                        Tileset
                        <select value={tilesetId} onChange={(event) => setTilesetId(event.target.value)}>
                            {Object.keys(tilesets).map((tilesetOption) => (
                                <option key={tilesetOption}>{tilesetOption}</option>
                            ))}
                        </select>
                    </label>
                    <TileSelect
                        label='Fill ground with'
                        tileIds={getTileIds(fillTileset)}
                        getName={(tileId) => getTileDefinition(fillTileset, tileId)?.name ?? ''}
                        value={fillTileId}
                        onChange={setFillTileId}
                    />
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <div className={styles.row}>
                    <button type='submit'>Create</button>
                    <button type='button' onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

export function TileSelect(properties: {
    label: string;
    tileIds: number[];
    getName: (tileId: number) => string;
    value: number;
    onChange: (tileId: number) => void;
}) {
    const { label, tileIds, getName, value, onChange } = properties;

    return (
        <label>
            {label}
            <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
                <option value={0}>Nothing</option>
                {tileIds.map((tileId) => (
                    <option key={tileId} value={tileId}>
                        {tileId}: {getName(tileId)}
                    </option>
                ))}
            </select>
        </label>
    );
}
