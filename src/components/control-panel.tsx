import clsx from 'clsx';
import { useEditor } from '../editor/editor';
import { hasUnsavedChanges, type EditorTool } from '../editor/editor-store';
import { getTileBackgroundStyle } from '../editor/tile-style';
import { getTileDefinition, getTileIds } from '../world-map/tileset';
import { entityTypes, layerNames } from '../world-map/world-map';
import styles from './control-panel.module.css';
import { EntityPanel } from './entity-panel';
import { FlagOverview } from './flag-overview';
import { MapPicker } from './map-picker';
import { MapProperties } from './map-properties';
import { ProblemCount, ProblemsPanel } from './problems-panel';
import { TilesetEditor } from './tileset-editor';
import { DraftBanner } from './unsaved-changes';

const tools: { tool: EditorTool; label: string; shortcut: string }[] = [
    { tool: 'brush', label: 'Brush', shortcut: 'B' },
    { tool: 'fill', label: 'Fill', shortcut: 'F' },
    { tool: 'entity', label: 'Entities', shortcut: 'N' }
];

export function ControlPanel() {
    const tool = useEditor((state) => state.tool);

    return (
        <aside className={styles['control-panel']}>
            <MapPicker />
            <SaveSection />
            <DraftBanner />
            <HistorySection />
            <ToolSection />
            {tool === 'entity' ? (
                <EntitySection />
            ) : (
                <>
                    <LayerSection />
                    <TileSection />
                </>
            )}
            <ViewSection />
            <details>
                <summary>Map</summary>
                <MapProperties />
            </details>
            <details>
                <summary>Tileset</summary>
                <TilesetEditor />
            </details>
            <details>
                <summary>Flags</summary>
                <FlagOverview />
            </details>
            <details open>
                <summary>
                    Problems
                    <ProblemCount />
                </summary>
                <ProblemsPanel />
            </details>
        </aside>
    );
}

function ToolSection() {
    const tool = useEditor((state) => state.tool);
    const setTool = useEditor((state) => state.setTool);

    return (
        <section>
            <h3>Tool</h3>
            <div className={styles.row}>
                {tools.map(({ tool: value, label, shortcut }) => (
                    <button
                        key={value}
                        className={clsx(value === tool && styles.active)}
                        title={`${label} (${shortcut})`}
                        onClick={() => setTool(value)}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </section>
    );
}

function TileSection() {
    const tileset = useEditor((state) => state.tileset);
    const selectedTileId = useEditor((state) => state.selectedTileId);
    const selectTile = useEditor((state) => state.selectTile);

    return (
        <section>
            <h3>Tiles</h3>
            <div className={styles.palette}>
                <button
                    className={clsx(styles.swatch, selectedTileId === 0 && styles.active)}
                    title='Eraser (E)'
                    onClick={() => selectTile(0)}
                >
                    ✕
                </button>
                {getTileIds(tileset).map((tileId) => {
                    const definition = getTileDefinition(tileset, tileId);

                    return (
                        <button
                            key={tileId}
                            className={clsx(styles.swatch, tileId === selectedTileId && styles.active)}
                            style={getTileBackgroundStyle(tileset, [tileId])}
                            title={[definition?.name, definition?.collision].filter(Boolean).join(' · ')}
                            onClick={() => selectTile(tileId)}
                        />
                    );
                })}
            </div>
        </section>
    );
}

function EntitySection() {
    const entityTypeToPlace = useEditor((state) => state.entityTypeToPlace);
    const setEntityTypeToPlace = useEditor((state) => state.setEntityTypeToPlace);

    return (
        <section>
            <h3>Entities</h3>
            <p className={styles.hint}>
                Click an empty tile to place, click an entity to select it, drag to move. Delete removes the selected
                entity.
            </p>
            <div className={styles.row}>
                {entityTypes.map((type) => (
                    <button
                        key={type}
                        className={clsx(type === entityTypeToPlace && styles.active)}
                        onClick={() => setEntityTypeToPlace(type)}
                    >
                        {type}
                    </button>
                ))}
            </div>
            <EntityPanel />
        </section>
    );
}

function LayerSection() {
    const activeLayer = useEditor((state) => state.activeLayer);
    const hiddenLayers = useEditor((state) => state.hiddenLayers);
    const setActiveLayer = useEditor((state) => state.setActiveLayer);
    const toggleLayerVisibility = useEditor((state) => state.toggleLayerVisibility);

    return (
        <section>
            <h3>Layers</h3>
            {layerNames.map((layer, index) => (
                <div key={layer} className={styles.layer}>
                    <input
                        type='checkbox'
                        title='Visible'
                        checked={!hiddenLayers.includes(layer)}
                        onChange={() => toggleLayerVisibility(layer)}
                    />
                    <button
                        className={clsx(styles.grow, layer === activeLayer && styles.active)}
                        title={`Paint on ${layer} (${index + 1})`}
                        onClick={() => setActiveLayer(layer)}
                    >
                        {layer}
                    </button>
                </div>
            ))}
        </section>
    );
}

function ViewSection() {
    const dimInactiveLayers = useEditor((state) => state.dimInactiveLayers);
    const showGrid = useEditor((state) => state.showGrid);
    const showCollision = useEditor((state) => state.showCollision);
    const showEntities = useEditor((state) => state.showEntities);
    const toggleDimInactiveLayers = useEditor((state) => state.toggleDimInactiveLayers);
    const toggleGrid = useEditor((state) => state.toggleGrid);
    const toggleCollision = useEditor((state) => state.toggleCollision);
    const toggleEntities = useEditor((state) => state.toggleEntities);

    const options = [
        { label: 'Dim other layers (D)', checked: dimInactiveLayers, onChange: toggleDimInactiveLayers },
        { label: 'Grid (G)', checked: showGrid, onChange: toggleGrid },
        { label: 'Collision (C)', checked: showCollision, onChange: toggleCollision },
        { label: 'Entities', checked: showEntities, onChange: toggleEntities }
    ];

    return (
        <section>
            <h3>View</h3>
            {options.map(({ label, checked, onChange }) => (
                <label key={label} className={styles.option}>
                    <input type='checkbox' checked={checked} onChange={onChange} /> {label}
                </label>
            ))}
        </section>
    );
}

function HistorySection() {
    const canUndo = useEditor((state) => state.past.length > 0);
    const canRedo = useEditor((state) => state.future.length > 0);
    const undo = useEditor((state) => state.undo);
    const redo = useEditor((state) => state.redo);

    return (
        <section className={styles.row}>
            <button disabled={!canUndo} title='Undo (Ctrl+Z)' onClick={undo}>
                Undo
            </button>
            <button disabled={!canRedo} title='Redo (Ctrl+Shift+Z)' onClick={redo}>
                Redo
            </button>
        </section>
    );
}

function SaveSection() {
    const unsaved = useEditor(hasUnsavedChanges);
    const saving = useEditor((state) => state.saving);
    const saveError = useEditor((state) => state.saveError);
    const save = useEditor((state) => state.save);
    const startPlaytest = useEditor((state) => state.startPlaytest);
    const map = useEditor((state) => state.map);

    return (
        <section>
            <div className={styles.row}>
                <button disabled={saving || !unsaved} title='Save the map and tileset (Ctrl+S)' onClick={save}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
                <span className={clsx(styles.status, styles.grow)}>
                    {unsaved ? 'Unsaved changes' : 'All changes saved'}
                </span>
                <button
                    title='Walk around the map (P plays from the tile under the mouse)'
                    onClick={() => startPlaytest({ x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) })}
                >
                    ▶ Playtest
                </button>
            </div>
            {saveError && <p className={clsx(styles.error, styles['save-error'])}>{saveError}</p>}
        </section>
    );
}
