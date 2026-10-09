import clsx from 'clsx';
import { useState, type FormEvent } from 'react';
import { useEditor } from '../editor/editor';
import { resizeAnchors, resizeWorldMap, type ResizeAnchor } from '../world-map/resize';
import { getTileDefinition, getTileIds } from '../world-map/tileset';
import styles from './control-panel.module.css';
import { TileSelect } from './map-picker';

const anchorArrows: Record<ResizeAnchor, string> = {
    'top-left': '↖',
    'top-center': '↑',
    'top-right': '↗',
    'middle-left': '←',
    'middle-center': '•',
    'middle-right': '→',
    'bottom-left': '↙',
    'bottom-center': '↓',
    'bottom-right': '↘'
};

/** Name and size of the map. Remounts when the map changes, so the fields show the current values. */
export function MapProperties() {
    const map = useEditor((state) => state.map);

    return <MapPropertiesForm key={`${map.id}:${map.name}:${map.width}×${map.height}`} />;
}

function MapPropertiesForm() {
    const map = useEditor((state) => state.map);
    const tileset = useEditor((state) => state.tileset);
    const setMapName = useEditor((state) => state.setMapName);
    const resizeMap = useEditor((state) => state.resizeMap);
    const [name, setName] = useState(map.name);
    const [width, setWidth] = useState(map.width);
    const [height, setHeight] = useState(map.height);
    const [anchor, setAnchor] = useState<ResizeAnchor>('top-left');
    const [fillTileId, setFillTileId] = useState(1);
    const [message, setMessage] = useState<string | null>(null);

    const validSize = [width, height].every((size) => Number.isInteger(size) && size >= 1 && size <= 255);
    const removedIds = validSize ? resizeWorldMap(map, width, height, anchor).removedEntityIds : [];

    function handleResize(event: FormEvent) {
        event.preventDefault();
        if (!validSize) {
            return setMessage('Width and height must be whole numbers from 1 to 255');
        }
        // The form remounts with the new size; the removed entities were listed before resizing.
        resizeMap(width, height, anchor, fillTileId);
    }

    return (
        <div className={styles.form}>
            <p className={styles.hint}>
                Id <code>{map.id}</code> · tileset <code>{map.tilesetId}</code>
            </p>
            <label>
                Name
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => setMapName(name)}
                    onKeyDown={(event) => event.key === 'Enter' && setMapName(name)}
                />
            </label>
            <form className={styles.form} onSubmit={handleResize}>
                <div className={styles.pair}>
                    <label>
                        Width
                        <input
                            type='number'
                            min={1}
                            max={255}
                            value={Number.isNaN(width) ? '' : width}
                            onChange={(event) => setWidth(event.target.valueAsNumber)}
                        />
                    </label>
                    <label>
                        Height
                        <input
                            type='number'
                            min={1}
                            max={255}
                            value={Number.isNaN(height) ? '' : height}
                            onChange={(event) => setHeight(event.target.valueAsNumber)}
                        />
                    </label>
                </div>
                <div className={styles.pair}>
                    <div>
                        <span className={styles.hint}>Keep in place</span>
                        <div className={styles.anchors}>
                            {resizeAnchors.map((value) => (
                                <button
                                    key={value}
                                    type='button'
                                    title={value}
                                    className={clsx(value === anchor && styles.active)}
                                    onClick={() => setAnchor(value)}
                                >
                                    {anchorArrows[value]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <TileSelect
                        label='Fill new ground with'
                        tileIds={getTileIds(tileset)}
                        getName={(tileId) => getTileDefinition(tileset, tileId)?.name ?? ''}
                        value={fillTileId}
                        onChange={setFillTileId}
                    />
                </div>
                {removedIds.length > 0 && (
                    <p className={styles.error}>Resizing removes entities outside the map: {removedIds.join(', ')}</p>
                )}
                {message && <p className={styles.hint}>{message}</p>}
                <div className={styles.row}>
                    <button type='submit' disabled={width === map.width && height === map.height}>
                        Resize
                    </button>
                </div>
            </form>
        </div>
    );
}
