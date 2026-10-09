import { css } from 'goober';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { spriteSheet, useEditor } from '../editor/editor';
import { tileScale } from '../editor/tile-style';
import { drawMap, getTileAtPoint, type TilePosition } from '../rendering/map-renderer';
import { useRasterImage } from '../rendering/use-raster-image';
import { getEntitiesAt, layerNames, type LayerName } from '../world-map/world-map';

type MapCanvasProperties = {
    hoveredTile: TilePosition | null;
    onHoverChange: (tile: TilePosition | null) => void;
};

const dimmedLayerOpacity = 0.3;

const canvasStyles = css({
    display: 'block',
    background: '#222',
    cursor: 'crosshair',
    touchAction: 'none'
});

export function MapCanvas(properties: MapCanvasProperties) {
    const { hoveredTile, onHoverChange } = properties;
    const map = useEditor((state) => state.map);
    const tileset = useEditor((state) => state.tileset);
    const tool = useEditor((state) => state.tool);
    const view = useEditor(
        useShallow((state) => ({
            activeLayer: state.activeLayer,
            hiddenLayers: state.hiddenLayers,
            dimInactiveLayers: state.dimInactiveLayers,
            showGrid: state.showGrid,
            showCollision: state.showCollision,
            showEntities: state.showEntities,
            selectedEntityId: state.selectedEntityId,
            focusedTile: state.focusedTile
        }))
    );
    const actions = useEditor(
        useShallow((state) => ({
            paintTile: state.paintTile,
            fillArea: state.fillArea,
            beginStroke: state.beginStroke,
            endStroke: state.endStroke,
            selectEntity: state.selectEntity,
            placeEntity: state.placeEntity,
            moveEntity: state.moveEntity,
            focusTile: state.focusTile
        }))
    );
    const tilesetImage = useRasterImage(tileset.image);
    const spriteImage = useRasterImage(spriteSheet.image);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [time, setTime] = useState(0);
    /** Entity being dragged, and which tile of it was grabbed, so it does not jump to the pointer. */
    const draggedEntityRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

    const displayTileSize = tileset.tileSize * tileScale;
    const width = map.width * displayTileSize;
    const height = map.height * displayTileSize;

    useEffect(() => {
        const frameDuration = Math.min(
            ...Object.values(tileset.tiles)
                .map((tile) => tile.animation?.frameDuration)
                .filter((duration): duration is number => duration !== undefined)
        );

        if (!Number.isFinite(frameDuration)) {
            return;
        }
        let timer = 0;

        function tick() {
            setTime(performance.now());
            timer = window.setTimeout(tick, frameDuration);
        }

        timer = window.setTimeout(tick, frameDuration);

        return () => clearTimeout(timer);
    }, [tileset]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');

        if (!canvas || !context || !tilesetImage) {
            return;
        }
        const pixelRatio = window.devicePixelRatio || 1;
        const layerOpacity = Object.fromEntries(
            layerNames.map((layer): [LayerName, number] => {
                if (view.hiddenLayers.includes(layer)) {
                    return [layer, 0];
                }
                return [layer, view.dimInactiveLayers && layer !== view.activeLayer ? dimmedLayerOpacity : 1];
            })
        );

        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        drawMap(context, map, tileset, tilesetImage, {
            scale: tileScale,
            layerOpacity,
            showGrid: view.showGrid,
            showCollision: view.showCollision,
            showEntities: view.showEntities || tool === 'entity',
            selectedEntityId: view.selectedEntityId,
            hoveredTile,
            focusedTile: view.focusedTile,
            time,
            sprites: spriteImage && { sheet: spriteSheet, image: spriteImage }
        });
    }, [map, tileset, tilesetImage, spriteImage, view, tool, hoveredTile, width, height, time]);

    useEffect(() => {
        const focusedTile = view.focusedTile;
        const canvas = canvasRef.current;

        if (!focusedTile || !canvas) {
            return;
        }
        // Scrolls the map area sideways and the page up or down until the tile is in view.
        const rect = canvas.getBoundingClientRect();
        const cssScale = rect.width / width;
        const size = displayTileSize * cssScale;
        const left = rect.left + focusedTile.x * size;
        const top = rect.top + focusedTile.y * size;
        const scroller = canvas.closest('.map-area');
        const bounds = scroller?.getBoundingClientRect();

        if (scroller && bounds && (left < bounds.left || left + size > bounds.right)) {
            scroller.scrollBy({ left: left - (bounds.left + bounds.width / 2), behavior: 'smooth' });
        }
        if (top < 0 || top + size > window.innerHeight) {
            window.scrollBy({ top: top - window.innerHeight / 2, behavior: 'smooth' });
        }
    }, [view.focusedTile, width, displayTileSize]);

    function getTileFromEvent(event: PointerEvent<HTMLCanvasElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        const cssScale = rect.width / width;

        return getTileAtPoint(map, displayTileSize * cssScale, event.clientX - rect.left, event.clientY - rect.top);
    }

    function isHovered(tile: TilePosition | null) {
        return tile?.x === hoveredTile?.x && tile?.y === hoveredTile?.y;
    }

    function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
        const tile = getTileFromEvent(event);

        if (event.button !== 0 || !tile) {
            return;
        }
        actions.focusTile(null);

        switch (tool) {
            case 'fill':
                actions.fillArea(tile.x, tile.y);
                return;

            case 'entity': {
                const entity = getEntitiesAt(map, tile.x, tile.y).at(-1);

                if (!entity) {
                    actions.placeEntity(tile.x, tile.y);
                    return;
                }
                actions.selectEntity(entity.id);
                draggedEntityRef.current = { id: entity.id, offsetX: tile.x - entity.x, offsetY: tile.y - entity.y };
                break;
            }

            case 'brush':
                actions.paintTile(tile.x, tile.y);
                break;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        actions.beginStroke();
    }

    function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
        const tile = getTileFromEvent(event);

        if (isHovered(tile)) {
            return;
        }
        onHoverChange(tile);

        if (!tile || event.buttons !== 1) {
            return;
        }
        const draggedEntity = draggedEntityRef.current;

        if (tool === 'brush') {
            actions.paintTile(tile.x, tile.y);
        } else if (tool === 'entity' && draggedEntity) {
            actions.moveEntity(draggedEntity.id, tile.x - draggedEntity.offsetX, tile.y - draggedEntity.offsetY);
        }
    }

    function handlePointerUp() {
        draggedEntityRef.current = null;
        actions.endStroke();
    }

    return (
        <canvas
            ref={canvasRef}
            className={canvasStyles}
            style={{ width, height }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => onHoverChange(null)}
        />
    );
}
