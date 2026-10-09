import clsx from 'clsx';
import { useState, type FormEvent } from 'react';
import { useEditor } from '../editor/editor';
import { getTileBackgroundStyle } from '../editor/tile-style';
import { useImage } from '../rendering/use-image';
import { collisionSchema, getTileDefinition, type Collision, type TileDefinition } from '../world-map/tileset';
import styles from './control-panel.module.css';

/**
 * Every tile in the tileset image. Click one to name it, set its collision and choose whether it is in the palette.
 * Changes are undoable and saved with the map.
 */
export function TilesetEditor() {
    const tileset = useEditor((state) => state.tileset);
    const image = useImage(tileset.image);
    const [selectedTileId, setSelectedTileId] = useState(1);

    const rows = image ? Math.floor(image.naturalHeight / tileset.tileSize) : 0;
    const tileIds = Array.from({ length: rows * tileset.columns }, (_, index) => index + 1);
    const definition = getTileDefinition(tileset, selectedTileId);

    return (
        <div className={styles.form}>
            <p className={styles.hint}>
                <code>{tileset.id}</code> · {tileset.image} · faded tiles are not in the palette
            </p>
            <div className={styles.palette}>
                {tileIds.map((tileId) => {
                    const tile = getTileDefinition(tileset, tileId);

                    return (
                        <button
                            key={tileId}
                            className={clsx(
                                styles.swatch,
                                !tile && styles.unused,
                                tileId === selectedTileId && styles.active
                            )}
                            style={getTileBackgroundStyle(tileset, [tileId])}
                            title={`${tileId}: ${tile ? [tile.name, tile.collision, tile.animation && 'animated'].filter(Boolean).join(' · ') : 'not in palette'}`}
                            onClick={() => setSelectedTileId(tileId)}
                        >
                            {tile?.collision && (
                                <span className={styles.badge}>{tile.collision === 'solid' ? 'S' : 'W'}</span>
                            )}
                        </button>
                    );
                })}
            </div>
            <TileForm
                key={`${selectedTileId}:${JSON.stringify(definition)}`}
                tileId={selectedTileId}
                definition={definition}
            />
        </div>
    );
}

function TileForm(properties: { tileId: number; definition: TileDefinition | undefined }) {
    const { tileId, definition } = properties;
    const updateTileDefinition = useEditor((state) => state.updateTileDefinition);
    const [inPalette, setInPalette] = useState(definition !== undefined);
    const [name, setName] = useState(definition?.name ?? `Tile ${tileId}`);
    const [collision, setCollision] = useState<Collision | ''>(definition?.collision ?? '');

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        updateTileDefinition(
            tileId,
            inPalette
                ? {
                      name,
                      ...(collision ? { collision } : {}),
                      ...(definition?.animation ? { animation: definition.animation } : {})
                  }
                : null
        );
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <strong>Tile {tileId}</strong>
            <label className={styles.option}>
                <input type='checkbox' checked={inPalette} onChange={(event) => setInPalette(event.target.checked)} />{' '}
                In palette
            </label>
            <div className={styles.pair}>
                <label>
                    Name
                    <input value={name} disabled={!inPalette} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                    Collision
                    <select
                        value={collision}
                        disabled={!inPalette}
                        onChange={(event) => setCollision(event.target.value as Collision | '')}
                    >
                        <option value=''>none (walkable)</option>
                        {collisionSchema.options.map((option) => (
                            <option key={option}>{option}</option>
                        ))}
                    </select>
                </label>
            </div>
            <div className={styles.row}>
                <button type='submit'>Apply</button>
            </div>
        </form>
    );
}
