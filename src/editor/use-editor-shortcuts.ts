import { useEffect } from 'react';
import { layerNames } from '../world-map/world-map';
import type { EditorStoreApi, TilePosition } from './editor-store';

function isTypingTarget(target: EventTarget | null) {
    return (
        target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    );
}

/**
 * Keyboard shortcuts: Ctrl/Cmd+S save (also while typing), Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, B brush, F fill, N entities, E eraser,
 * 1–3 active layer, D dim other layers, G grid, C collision, Delete remove selected entity, Escape deselect,
 * P playtest from the tile under the mouse. Ignored while playtesting (the game has its own keys).
 */
export function useEditorShortcuts(store: EditorStoreApi, getHoveredTile: () => TilePosition | null) {
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (store.getState().playtestStart) {
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                store.getState().save();

                return;
            }
            if (isTypingTarget(event.target)) {
                return;
            }
            const state = store.getState();
            const key = event.key.toLowerCase();

            if (event.ctrlKey || event.metaKey) {
                if (key === 'z' && event.shiftKey) {
                    state.redo();
                } else if (key === 'z') {
                    state.undo();
                } else if (key === 'y') {
                    state.redo();
                } else {
                    return;
                }
                event.preventDefault();

                return;
            }
            if (event.altKey || event.shiftKey) {
                return;
            }

            switch (key) {
                case 'b':
                    state.setTool('brush');
                    break;
                case 'f':
                    state.setTool('fill');
                    break;
                case 'e':
                    state.selectTile(0);
                    break;
                case 'n':
                    state.setTool('entity');
                    break;
                case 'd':
                    state.toggleDimInactiveLayers();
                    break;
                case 'g':
                    state.toggleGrid();
                    break;
                case 'c':
                    state.toggleCollision();
                    break;
                case '1':
                case '2':
                case '3':
                    state.setActiveLayer(layerNames[Number(key) - 1]);
                    break;
                case 'delete':
                case 'backspace':
                    if (state.tool === 'entity' && state.selectedEntityId) {
                        state.deleteEntity(state.selectedEntityId);
                    }
                    break;
                case 'escape':
                    state.selectEntity(null);
                    state.focusTile(null);
                    break;
                case 'p': {
                    const tile = getHoveredTile();

                    state.startPlaytest(
                        tile ?? { x: Math.floor(state.map.width / 2), y: Math.floor(state.map.height / 2) }
                    );
                    break;
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [store, getHoveredTile]);
}
