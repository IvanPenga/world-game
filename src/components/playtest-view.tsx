import { css } from 'goober';
import { produce } from 'immer';
import { useEffect, useRef, useState } from 'react';
import { itemCatalog, spriteSheet, useEditor } from '../editor/editor';
import { tileScale } from '../editor/tile-style';
import {
    createGameState,
    findWalkableTile,
    getCurrentMap,
    getFadeOpacity,
    getNpcPosition,
    getNpcState,
    getPlayerPosition,
    getShipPosition,
    getShipState,
    isItemCollected,
    isResourceGathered,
    stepDuration,
    submitMiniGameAnswer,
    updateGame,
    type GameState,
    type GameWorld
} from '../game/game-state';
import {
    drawItem,
    drawMap,
    drawResource,
    drawShip,
    drawSprite,
    type LoadedSpriteSheet
} from '../rendering/map-renderer';
import { useRasterImage } from '../rendering/use-raster-image';
import type { Facing } from '../world-map/world-map';
import { getItem } from '../world-map/items';
import styles from './control-panel.module.css';
import { InventoryMenu } from './inventory-menu';
import { MiniGameOverlay } from './minigame-overlay';

/** The Game Boy Color screen is 10 × 9 tiles. */
const viewportTiles = { width: 10, height: 9 };

const directionKeys: Record<string, Facing> = {
    arrowup: 'up',
    w: 'up',
    arrowdown: 'down',
    s: 'down',
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right'
};
const interactKeys = ['z', ' ', 'enter'];
const menuKeys = ['x', 'i'];

const layoutStyles = css({ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' });
const screenStyles = css({ position: 'relative', lineHeight: 0 });
const canvasStyles = css({ display: 'block', background: '#000', imageRendering: 'pixelated' });
const dialogueStyles = css({
    position: 'absolute',
    left: '8px',
    right: '8px',
    bottom: '8px',
    minHeight: '3.2em',
    padding: '10px 14px',
    border: '4px double #333',
    borderRadius: '6px',
    background: '#f8f8f8',
    color: '#111',
    font: '18px/1.5 monospace',
    whiteSpace: 'pre-wrap'
});
const noticeStyles = css({
    position: 'absolute',
    left: '8px',
    right: '8px',
    top: '8px',
    padding: '6px 10px',
    background: '#fdd',
    color: '#700',
    font: '14px/1.4 sans-serif'
});

/** What the side panel shows; updated only when it changes, not every frame. */
type Hud = Pick<GameState, 'mapId' | 'dialogue' | 'flags' | 'inventory' | 'menu' | 'miniGame' | 'sailing'> & {
    x: number;
    y: number;
    notice: string | null;
};

function getHud(state: GameState, previous: Hud | null): Hud {
    const next: Hud = {
        mapId: state.mapId,
        dialogue: state.dialogue,
        flags: state.flags,
        inventory: state.inventory,
        menu: state.menu,
        miniGame: state.miniGame,
        sailing: state.sailing,
        x: state.player.x,
        y: state.player.y,
        notice: state.notice ?? previous?.notice ?? null
    };

    return previous && Object.keys(next).every((key) => next[key as keyof Hud] === previous[key as keyof Hud])
        ? previous
        : next;
}

/**
 * Walks around the map with the real collision rules: arrow keys or WASD to move, Z / Space / Enter to talk and
 * read, Escape to go back to the editor. Uses the map and tileset as they are in the editor, including unsaved
 * changes; other maps are used as saved.
 */
export function PlaytestView() {
    const map = useEditor((state) => state.map);
    const tileset = useEditor((state) => state.tileset);
    const maps = useEditor((state) => state.maps);
    const tilesets = useEditor((state) => state.tilesets);
    const playtestStart = useEditor((state) => state.playtestStart);
    const stopPlaytest = useEditor((state) => state.stopPlaytest);
    const [world] = useState<GameWorld>(() => ({
        maps: { ...maps, [map.id]: map },
        tilesets: { ...tilesets, [tileset.id]: tileset },
        items: itemCatalog
    }));
    const [start] = useState(() => findWalkableTile(map, tileset, playtestStart?.x ?? 0, playtestStart?.y ?? 0));
    const [initialGame] = useState(() => (start ? createGameState(map.id, start) : null));
    const [hud, setHud] = useState<Hud | null>(() => initialGame && getHud(initialGame, null));
    const hudRef = useRef(hud);
    const gameRef = useRef<GameState | null>(initialGame);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentMap = world.maps[hud?.mapId ?? map.id];
    const tilesetImage = useRasterImage(world.tilesets[currentMap.tilesetId].image);
    const spriteImage = useRasterImage(spriteSheet.image);
    const imagesRef = useRef<{ tileset: CanvasImageSource | null; sprites: LoadedSpriteSheet | null }>({
        tileset: null,
        sprites: null
    });

    const displayTileSize = tileset.tileSize * tileScale;
    const width = viewportTiles.width * displayTileSize;
    const height = viewportTiles.height * displayTileSize;

    useEffect(() => {
        imagesRef.current = {
            tileset: tilesetImage,
            sprites: spriteImage && { sheet: spriteSheet, image: spriteImage }
        };
    }, [tilesetImage, spriteImage]);

    useEffect(() => {
        hudRef.current = hud;
    }, [hud]);

    function restart() {
        if (start) {
            gameRef.current = createGameState(map.id, start);
            const nextHud = getHud(gameRef.current, null);

            hudRef.current = nextHud;
            setHud(nextHud);
        }
    }

    function toggleFlag(flag: string) {
        const game = gameRef.current;

        if (game) {
            gameRef.current = produce(game, (draft) => {
                draft.flags[flag] = !draft.flags[flag];
            });
        }
    }

    function submitMiniGame(answer: string) {
        const game = gameRef.current;

        if (game) {
            gameRef.current = submitMiniGameAnswer(game, world, answer);
            const nextHud = getHud(gameRef.current, hudRef.current);

            hudRef.current = nextHud;
            setHud(nextHud);
        }
    }

    useEffect(() => {
        const held: Facing[] = [];
        let interact = false;
        let menu = false;
        let pressedDirection: Facing | null = null;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }
            const key = event.key.toLowerCase();

            if (key === 'escape') {
                stopPlaytest();
            } else if (directionKeys[key]) {
                pressedDirection = directionKeys[key];
                if (!held.includes(directionKeys[key])) {
                    held.push(directionKeys[key]);
                }
            } else if (interactKeys.includes(key)) {
                interact ||= !event.repeat;
            } else if (menuKeys.includes(key)) {
                menu ||= !event.repeat;
            } else {
                return;
            }
            event.preventDefault();
        }

        function handleKeyUp(event: KeyboardEvent) {
            const direction = directionKeys[event.key.toLowerCase()];

            if (direction && held.includes(direction)) {
                held.splice(held.indexOf(direction), 1);
            }
        }

        function handleBlur() {
            held.length = 0;
        }

        let frame = 0;
        let lastTime: number | null = null;

        function tick(time: number) {
            frame = requestAnimationFrame(tick);
            const delta = lastTime === null ? 0 : Math.min(time - lastTime, 100);

            lastTime = time;
            if (!gameRef.current) {
                return;
            }
            gameRef.current = updateGame(
                gameRef.current,
                world,
                { direction: held.at(-1) ?? null, interact, menu, pressedDirection },
                delta
            );
            interact = false;
            menu = false;
            pressedDirection = null;
            const nextHud = getHud(gameRef.current, hudRef.current);

            if (nextHud !== hudRef.current) {
                hudRef.current = nextHud;
                setHud(nextHud);
            }
            draw(gameRef.current, time);
        }

        function draw(game: GameState, time: number) {
            const canvas = canvasRef.current;
            const context = canvas?.getContext('2d');
            const { tileset: image, sprites } = imagesRef.current;

            if (!canvas || !context) {
                return;
            }
            const pixelRatio = window.devicePixelRatio || 1;
            const gameMap = getCurrentMap(game, world);
            const gameTileset = world.tilesets[gameMap.tilesetId];
            const position = getPlayerPosition(game);
            const cameraLeft = position.x + 0.5 - viewportTiles.width / 2;
            const cameraTop = position.y + 0.5 - viewportTiles.height / 2;

            if (canvas.width !== width * pixelRatio) {
                canvas.width = width * pixelRatio;
                canvas.height = height * pixelRatio;
            }
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            context.fillStyle = '#000';
            context.fillRect(0, 0, width, height);
            if (!image) {
                return;
            }
            // The camera keeps the player in the middle of the screen, like the Game Boy games.
            context.translate(Math.round(-cameraLeft * displayTileSize), Math.round(-cameraTop * displayTileSize));
            const options = {
                scale: tileScale,
                showEntities: false,
                clear: false,
                time,
                viewport: { left: cameraLeft, top: cameraTop, width: viewportTiles.width, height: viewportTiles.height }
            };

            drawMap(context, gameMap, gameTileset, image, { ...options, layers: ['ground', 'decoration'] });

            for (const entity of gameMap.entities) {
                if (entity.type === 'item' && !isItemCollected(game, game.mapId, entity)) {
                    drawItem(context, entity.x * displayTileSize, entity.y * displayTileSize, displayTileSize);
                }
                if (entity.type === 'resource' && !isResourceGathered(game, game.mapId, entity)) {
                    drawResource(
                        context,
                        entity.resource,
                        entity.x * displayTileSize,
                        entity.y * displayTileSize,
                        displayTileSize
                    );
                }
                if (entity.type === 'ship') {
                    const shipPosition = getShipPosition(game, game.mapId, entity);
                    const { facing } = getShipState(game, game.mapId, entity);

                    drawShip(
                        context,
                        facing,
                        shipPosition.x * displayTileSize,
                        shipPosition.y * displayTileSize,
                        displayTileSize
                    );
                }
            }

            for (const entity of gameMap.entities) {
                if (entity.type !== 'npc') {
                    continue;
                }
                const npc = getNpcState(game, game.mapId, entity);
                const npcPosition = getNpcPosition(game, game.mapId, entity);
                const left = npcPosition.x * displayTileSize;
                const top = npcPosition.y * displayTileSize;

                if (!sprites || !drawSprite(context, sprites, entity.sprite, npc.facing, left, top, displayTileSize)) {
                    context.fillStyle = '#ffd600';
                    context.fillRect(left + 8, top + 8, displayTileSize - 16, displayTileSize - 16);
                }
            }

            const step = game.player.step;
            const progress = step ? step.elapsed / stepDuration : 0;
            // A small hop in the middle of each step makes walking read as walking with a single frame per facing.
            const hop = step && !game.sailing && progress > 0.25 && progress < 0.75 ? tileScale : 0;
            const playerLeft = position.x * displayTileSize;
            const playerTop = position.y * displayTileSize - hop;

            if (
                !sprites ||
                !drawSprite(context, sprites, 'player', game.player.facing, playerLeft, playerTop, displayTileSize)
            ) {
                context.fillStyle = '#e53935';
                context.fillRect(playerLeft + 6, playerTop + 6, displayTileSize - 12, displayTileSize - 12);
            }

            const sailedShip = gameMap.entities.find(
                (entity) => entity.type === 'ship' && game.sailing === `${game.mapId}/${entity.id}`
            );

            if (sailedShip?.type === 'ship' && !step?.boarding) {
                const shipPosition = getShipPosition(game, game.mapId, sailedShip);

                drawShip(
                    context,
                    getShipState(game, game.mapId, sailedShip).facing,
                    shipPosition.x * displayTileSize,
                    shipPosition.y * displayTileSize,
                    displayTileSize,
                    true
                );
            }

            drawMap(context, gameMap, gameTileset, image, { ...options, layers: ['overhead'] });
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

            const fade = getFadeOpacity(game);

            if (fade > 0) {
                context.globalAlpha = fade;
                context.fillStyle = '#000';
                context.fillRect(0, 0, width, height);
                context.globalAlpha = 1;
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', handleBlur);
        frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', handleBlur);
        };
    }, [world, width, height, displayTileSize, stopPlaytest]);

    if (!start) {
        return (
            <div>
                <p>There is no tile on this map the player can stand on.</p>
                <button onClick={stopPlaytest}>Back to the editor</button>
            </div>
        );
    }
    const flagNames = [...new Set([...Object.keys(hud?.flags ?? {})])].sort();

    return (
        <div className={layoutStyles}>
            <div className={screenStyles}>
                <canvas ref={canvasRef} className={canvasStyles} style={{ width, height }} />
                {hud?.dialogue && (
                    <div className={dialogueStyles}>
                        {hud.dialogue} <span>▼</span>
                    </div>
                )}
                {hud?.menu && (
                    <InventoryMenu inventory={hud.inventory} selected={hud.menu.selected} items={itemCatalog} />
                )}
                {hud?.miniGame && <MiniGameOverlay miniGame={hud.miniGame} onSubmit={submitMiniGame} />}
                {hud?.notice && <div className={noticeStyles}>{hud.notice}</div>}
            </div>
            <aside className={styles['control-panel']}>
                <h2>Playtest</h2>
                <p className={styles.hint}>
                    Arrow keys / WASD walk · Z, Space or Enter talk, read, pick up, gather and board or leave a ship · X
                    or I bag · Esc back to the editor
                </p>
                <section>
                    <h3>{world.maps[hud?.mapId ?? map.id].name}</h3>
                    <p className={styles.hint}>
                        <code>{hud?.mapId}</code> at ({hud?.x}, {hud?.y}){hud?.sailing && ', sailing'}
                    </p>
                </section>
                <section>
                    <h3>Flags</h3>
                    {flagNames.length === 0 && <p className={styles.hint}>No flag set yet.</p>}
                    {flagNames.map((flag) => (
                        <label key={flag} className={styles.option}>
                            <input
                                type='checkbox'
                                checked={hud?.flags[flag] ?? false}
                                onChange={() => toggleFlag(flag)}
                            />{' '}
                            {flag}
                        </label>
                    ))}
                </section>
                <section>
                    <h3>Inventory</h3>
                    {hud?.inventory.length === 0 && <p className={styles.hint}>Nothing picked up yet.</p>}
                    {hud?.inventory.map((entry) => (
                        <div
                            key={entry.item}
                            className={styles.row}
                            title={getItem(itemCatalog, entry.item)?.description}
                        >
                            <span className={styles.grow}>{getItem(itemCatalog, entry.item)?.name ?? entry.item}</span>
                            <span>×{entry.count}</span>
                        </div>
                    ))}
                </section>
                <section className={styles.row}>
                    <button onClick={restart}>Restart</button>
                    <button onClick={stopPlaytest}>Back to the editor (Esc)</button>
                </section>
                <p className={styles.hint}>
                    Uses this map as it is in the editor, including unsaved changes. Other maps are used as saved.
                </p>
            </aside>
        </div>
    );
}
