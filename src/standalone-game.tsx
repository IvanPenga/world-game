import { css } from 'goober';
import { useEffect, useRef, useState } from 'react';
import { tileScale } from './editor/tile-style';
import { bundledWorld } from './game/bundled-world';
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
    type GameInput,
    type GameState
} from './game/game-state';
import { InventoryMenu } from './components/inventory-menu';
import { MiniGameOverlay } from './components/minigame-overlay';
import {
    drawItem,
    drawMap,
    drawResource,
    drawShip,
    drawSprite,
    type LoadedSpriteSheet
} from './rendering/map-renderer';
import { useRasterImage } from './rendering/use-raster-image';
import type { Facing } from './world-map/world-map';

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

const pageStyles = css({
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#101820',
    color: '#eee'
});
const panelStyles = css({ display: 'grid', gap: '12px', justifyItems: 'center' });
const screenStyles = css({ position: 'relative', lineHeight: 0, boxShadow: '0 24px 80px #0008' });
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

const idle: GameInput = { direction: null, interact: false };

type Hud = Pick<GameState, 'mapId' | 'dialogue' | 'inventory' | 'menu' | 'miniGame'> & { notice: string | null };

function getHud(state: GameState, previous: Hud | null): Hud {
    const next = {
        mapId: state.mapId,
        dialogue: state.dialogue,
        inventory: state.inventory,
        menu: state.menu,
        miniGame: state.miniGame,
        notice: state.notice ?? previous?.notice ?? null
    };

    return previous && Object.keys(next).every((key) => next[key as keyof Hud] === previous[key as keyof Hud])
        ? previous
        : next;
}

function getStartMapId() {
    const requested = new URLSearchParams(window.location.search).get('map');

    return requested && bundledWorld.maps[requested] ? requested : Object.keys(bundledWorld.maps)[0];
}

export function StandaloneGame() {
    const [mapId] = useState(getStartMapId);
    const map = bundledWorld.maps[mapId];
    const tileset = bundledWorld.tilesets[map.tilesetId];
    const [start] = useState(() =>
        findWalkableTile(map, tileset, Math.floor(map.width / 2), Math.floor(map.height / 2))
    );
    const [initialGame] = useState(() => (start ? createGameState(map.id, start) : null));
    const [hud, setHud] = useState<Hud | null>(() => initialGame && getHud(initialGame, null));
    const hudRef = useRef(hud);
    const gameRef = useRef<GameState | null>(initialGame);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const currentMap = bundledWorld.maps[hud?.mapId ?? map.id];
    const tilesetImage = useRasterImage(bundledWorld.tilesets[currentMap.tilesetId].image);
    const spriteImage = useRasterImage(bundledWorld.spriteSheet.image);
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
            sprites: spriteImage && { sheet: bundledWorld.spriteSheet, image: spriteImage }
        };
    }, [tilesetImage, spriteImage]);

    useEffect(() => {
        hudRef.current = hud;
    }, [hud]);

    useEffect(() => {
        const held: Facing[] = [];
        let interact = false;
        let menu = false;
        let pressedDirection: Facing | null = null;
        let frame = 0;
        let lastTime: number | null = null;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                return;
            }
            const key = event.key.toLowerCase();

            if (directionKeys[key]) {
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

        function draw(game: GameState, time: number) {
            const canvas = canvasRef.current;
            const context = canvas?.getContext('2d');
            const { tileset: image, sprites } = imagesRef.current;

            if (!canvas || !context) {
                return;
            }
            const pixelRatio = window.devicePixelRatio || 1;
            const gameMap = getCurrentMap(game, bundledWorld);
            const gameTileset = bundledWorld.tilesets[gameMap.tilesetId];
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

        function tick(time: number) {
            frame = requestAnimationFrame(tick);
            const delta = lastTime === null ? 0 : Math.min(time - lastTime, 100);

            lastTime = time;
            if (!gameRef.current) {
                return;
            }
            gameRef.current = updateGame(
                gameRef.current,
                bundledWorld,
                { ...idle, direction: held.at(-1) ?? null, interact, menu, pressedDirection },
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

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('blur', () => (held.length = 0));
        frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [width, height, displayTileSize]);

    if (!start) {
        return <main className={pageStyles}>There is no tile on this map the player can stand on.</main>;
    }

    function submitMiniGame(answer: string) {
        const game = gameRef.current;

        if (game) {
            gameRef.current = submitMiniGameAnswer(game, bundledWorld, answer);
            const nextHud = getHud(gameRef.current, hudRef.current);

            hudRef.current = nextHud;
            setHud(nextHud);
        }
    }

    return (
        <main className={pageStyles}>
            <div className={panelStyles}>
                <div className={screenStyles}>
                    <canvas ref={canvasRef} className={canvasStyles} style={{ width, height }} />
                    {hud?.dialogue && <div className={dialogueStyles}>{hud.dialogue} ▼</div>}
                    {hud?.menu && (
                        <InventoryMenu
                            inventory={hud.inventory}
                            selected={hud.menu.selected}
                            items={bundledWorld.items}
                        />
                    )}
                    {hud?.miniGame && <MiniGameOverlay miniGame={hud.miniGame} onSubmit={submitMiniGame} />}
                    {hud?.notice && <div className={noticeStyles}>{hud.notice}</div>}
                </div>
                <p>
                    Arrow keys / WASD walk · Z, Space or Enter talk, pick up, gather and board or leave a ship · X or I
                    bag
                </p>
            </div>
        </main>
    );
}
