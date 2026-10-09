import { css } from 'goober';
import { useCallback, useEffect, useRef, useState } from 'react';
import { editorStore, useEditor } from '../editor/editor';
import { hasUnsavedChanges } from '../editor/editor-store';
import { useEditorShortcuts } from '../editor/use-editor-shortcuts';
import type { TilePosition } from '../rendering/map-renderer';
import { getCollisionAt, isWalkable } from '../world-map/collision';
import { getTileDefinition } from '../world-map/tileset';
import { getEntitiesAt, getTile, layerNames } from '../world-map/world-map';
import { MapCanvas } from './map-canvas';

const statusStyles = css({
    minHeight: '1.5em',
    marginTop: '8px',
    fontFamily: 'monospace'
});

export function WorldMapEditor() {
    const map = useEditor((state) => state.map);
    const tileset = useEditor((state) => state.tileset);
    const [hoveredTile, setHoveredTile] = useState<TilePosition | null>(null);
    const hoveredTileRef = useRef(hoveredTile);

    useEffect(() => {
        hoveredTileRef.current = hoveredTile;
    }, [hoveredTile]);
    useEditorShortcuts(
        editorStore,
        useCallback(() => hoveredTileRef.current, [])
    );
    useUnsavedChangesWarning();

    const hoverDetails = hoveredTile ? getHoverDetails(map, tileset, hoveredTile) : null;

    return (
        <div>
            <MapCanvas hoveredTile={hoveredTile} onHoverChange={setHoveredTile} />
            <div className={statusStyles}>{hoverDetails?.join(' · ')}</div>
        </div>
    );
}

function getHoverDetails(
    map: Parameters<typeof getTile>[0],
    tileset: Parameters<typeof getTileDefinition>[0],
    tile: TilePosition
) {
    const layerDetails = layerNames.map((layer) => {
        const tileId = getTile(map, layer, tile.x, tile.y);
        const name = getTileDefinition(tileset, tileId)?.name ?? (tileId === 0 ? 'empty' : `unknown ${tileId}`);

        return `${layer}: ${name}`;
    });
    const collision = getCollisionAt(map, tileset, tile.x, tile.y);
    const walkability = isWalkable(map, tileset, tile.x, tile.y)
        ? 'walkable'
        : collision
          ? `blocked: ${collision}`
          : 'blocked: entity';
    const entities = getEntitiesAt(map, tile.x, tile.y).map((entity) => `${entity.type}: ${entity.id}`);

    return [`(${tile.x}, ${tile.y})`, ...layerDetails, walkability, ...entities];
}

/** Asks the browser to confirm leaving or reloading the page while the map has unsaved changes. */
function useUnsavedChangesWarning() {
    const unsaved = useEditor(hasUnsavedChanges);

    useEffect(() => {
        if (!unsaved) {
            return;
        }
        function handleBeforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault();
        }

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [unsaved]);
}
