import { getCollisionAt } from '../world-map/collision';
import { getSpriteFrame, type SpriteSheet } from '../world-map/sprite-sheet';
import { getAnimatedTileId, getTileSourcePosition, type Collision, type Tileset } from '../world-map/tileset';
import {
    getEntitySize,
    getTile,
    layerNames,
    type Entity,
    type Facing,
    type LayerName,
    type WorldMap
} from '../world-map/world-map';

export type TilePosition = { x: number; y: number };

export type DrawMapOptions = {
    scale: number;
    /** Opacity per layer, from 0 (hidden) to 1. Layers that are left out are fully visible. */
    layerOpacity?: Partial<Record<LayerName, number>>;
    showGrid?: boolean;
    showCollision?: boolean;
    showEntities?: boolean;
    selectedEntityId?: string | null;
    hoveredTile?: TilePosition | null;
    /** Tile to point out, e.g. the tile a problem is about. */
    focusedTile?: TilePosition | null;
    /** Draws NPCs with their sprite. Without it, NPCs are only drawn as markers. */
    sprites?: LoadedSpriteSheet | null;
    /** Layers to draw; defaults to all. The game draws the overhead layer separately, above the characters. */
    layers?: readonly LayerName[];
    /** Whether to clear the map area first (default true). */
    clear?: boolean;
    /** Time in milliseconds, used for animated tiles. */
    time?: number;
    /** Tile-space bounds to draw. Useful after translating the canvas to a camera viewport. */
    viewport?: { left: number; top: number; width: number; height: number };
};

export type LoadedSpriteSheet = { sheet: SpriteSheet; image: CanvasImageSource };

type Context = Pick<
    CanvasRenderingContext2D,
    | 'drawImage'
    | 'fillRect'
    | 'strokeRect'
    | 'fillText'
    | 'beginPath'
    | 'moveTo'
    | 'lineTo'
    | 'stroke'
    | 'clearRect'
    | 'fillStyle'
    | 'strokeStyle'
    | 'lineWidth'
    | 'font'
    | 'textAlign'
    | 'textBaseline'
    | 'imageSmoothingEnabled'
    | 'globalAlpha'
>;

const collisionColors: Record<Collision, string> = {
    solid: 'rgba(255, 0, 0, 0.4)',
    water: 'rgba(0, 110, 255, 0.45)'
};

const entityStyles: Record<Entity['type'], { color: string; label: string }> = {
    warp: { color: '#e040fb', label: 'W' },
    npc: { color: '#ffd600', label: 'N' },
    sign: { color: '#00e5ff', label: 'S' },
    trigger: { color: '#ff6d00', label: 'T' },
    item: { color: '#76ff03', label: 'I' },
    resource: { color: '#aeea00', label: 'R' },
    ship: { color: '#ff8a80', label: 'B' }
};

/** Pixel art for items lying on the map, drawn in 16ths of a tile: k = outline, r = red, w = white. */
const itemPixels = [
    '...kkkk...',
    '.kkrrrrkk.',
    '.krwrrrrk.',
    'krrrkkrrrk',
    'kkkkwwkkkk',
    'kwwwkkwwwk',
    'kwwwwwwwwk',
    '.kwwwwwwk.',
    '.kkwwwwkk.',
    '...kkkk...'
];
const itemColors: Record<string, string> = { k: '#202020', r: '#e53935', w: '#f5f5f5' };

/** Pixel art for gatherable resources: k = outline, b/d = wood, g/l = leaves, r = fruit, s/h = stone. */
const resourcePixels = {
    wood: [
        '................',
        '................',
        '................',
        '................',
        '...kkkkkkkkkk...',
        '..kbbbbbbbbbbk..',
        '.kbdbbdbbdbbbk.',
        '.kbbbbbbbbbbbk.',
        '..kdddddddddk...',
        '...kkkkkkkkk....',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................'
    ],
    stone: [
        '................',
        '................',
        '................',
        '......kkkk......',
        '....kkhhhhkk....',
        '...khhhhhhhhk...',
        '..khhsshhhhhk...',
        '..khhhhhsshhk...',
        '..kshhhhhhhhk...',
        '...khhsshhhk....',
        '....kkhhhhk.....',
        '......kkkk......',
        '................',
        '................',
        '................',
        '................'
    ],
    fruit: [
        '................',
        '................',
        '.......kk.......',
        '.....kkllkk.....',
        '....kggggggk....',
        '...kgrggggrgk...',
        '...kgggrggggk...',
        '..kgggggggrggk..',
        '..kgrggggggggk..',
        '...kgggrgggk....',
        '....kgggggk.....',
        '.....kkkkk......',
        '................',
        '................',
        '................',
        '................'
    ]
};
const resourceColors: Record<string, string> = {
    k: '#202020',
    b: '#9a5b2f',
    d: '#5d3421',
    g: '#2e7d32',
    l: '#8bc34a',
    r: '#e53935',
    s: '#757575',
    h: '#b0bec5'
};

/**
 * Pixel art for ships, 16 × 16, one grid seen from the side (facing right; mirrored for left) and one from the front
 * (up and down). k = outline, b = hull, d = dark hull, s = sail, m = mast, f = flag. The player is drawn on top.
 */
const shipPixels: Record<'side' | 'front', string[]> = {
    side: [
        '................',
        '.......f........',
        '.......mff......',
        '.......m........',
        '.......mss......',
        '.......msss.....',
        '.......mssss....',
        '.......msssss...',
        '.......mssssss..',
        '.......m........',
        'kkkkkkkkkkkkkkkk',
        'kbbbbbbbbbbbbbbk',
        '.kbbbbbbbbbbbbk.',
        '.kddddddddddddk.',
        '..kkkkkkkkkkkk..',
        '................'
    ],
    front: [
        '................',
        '.......ff.......',
        '.......m........',
        '....sssmsss.....',
        '....sssmsss.....',
        '....sssmsss.....',
        '....sssmsss.....',
        '.......m........',
        '....kkkkkkkk....',
        '...kbbbbbbbbk...',
        '...kbbbbbbbbk...',
        '...kbbbbbbbbk...',
        '...kddddddddk...',
        '....kddddddk....',
        '.....kkkkkk.....',
        '................'
    ]
};
const shipColors: Record<string, string> = {
    k: '#3e2723',
    b: '#a1683a',
    d: '#6d4424',
    s: '#fafafa',
    m: '#5d4037',
    f: '#e53935'
};

/** Converts a point in canvas pixels to the tile under it, or null when outside the map. */
export function getTileAtPoint(map: WorldMap, displayTileSize: number, pointX: number, pointY: number) {
    const x = Math.floor(pointX / displayTileSize);
    const y = Math.floor(pointY / displayTileSize);

    return x >= 0 && y >= 0 && x < map.width && y < map.height ? { x, y } : null;
}

export function drawMap(
    context: Context,
    map: WorldMap,
    tileset: Tileset,
    tilesetImage: CanvasImageSource,
    options: DrawMapOptions
) {
    const {
        scale,
        layerOpacity = {},
        showGrid = false,
        showCollision = false,
        showEntities = true,
        selectedEntityId = null,
        hoveredTile = null,
        focusedTile = null,
        sprites = null,
        layers = layerNames,
        clear = true,
        time = 0,
        viewport = { left: 0, top: 0, width: map.width, height: map.height }
    } = options;
    const sourceSize = tileset.tileSize;
    const displaySize = sourceSize * scale;
    const bounds = getViewportBounds(map, viewport);

    context.imageSmoothingEnabled = false;
    if (clear) {
        context.clearRect(0, 0, map.width * displaySize, map.height * displaySize);
    }

    for (const layer of layers) {
        const opacity = layerOpacity[layer] ?? 1;

        if (opacity <= 0) {
            continue;
        }
        context.globalAlpha = opacity;

        for (let y = bounds.top; y < bounds.bottom; y++) {
            for (let x = bounds.left; x < bounds.right; x++) {
                const tileId = getTile(map, layer, x, y);

                if (tileId === 0) {
                    continue;
                }
                const { column, row } = getTileSourcePosition(tileset, getAnimatedTileId(tileset, tileId, time));

                context.drawImage(
                    tilesetImage,
                    column * sourceSize,
                    row * sourceSize,
                    sourceSize,
                    sourceSize,
                    x * displaySize,
                    y * displaySize,
                    displaySize,
                    displaySize
                );
            }
        }
    }

    context.globalAlpha = 1;

    if (showCollision) {
        drawCollision(context, map, tileset, displaySize, bounds);
    }

    if (showGrid) {
        drawGrid(context, map, displaySize);
    }

    if (showEntities) {
        for (const entity of map.entities) {
            if (isEntityInViewport(entity, bounds)) {
                drawEntity(context, entity, displaySize, entity.id === selectedEntityId, sprites);
            }
        }
    }

    if (focusedTile) {
        context.strokeStyle = '#ffd600';
        context.lineWidth = 3;
        context.strokeRect(
            focusedTile.x * displaySize - 1.5,
            focusedTile.y * displaySize - 1.5,
            displaySize + 3,
            displaySize + 3
        );
    }

    if (hoveredTile) {
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.strokeRect(
            hoveredTile.x * displaySize + 1,
            hoveredTile.y * displaySize + 1,
            displaySize - 2,
            displaySize - 2
        );
    }
}

function getViewportBounds(map: WorldMap, viewport: NonNullable<DrawMapOptions['viewport']>) {
    const left = Math.max(0, Math.floor(viewport.left));
    const top = Math.max(0, Math.floor(viewport.top));
    const right = Math.min(map.width, Math.ceil(viewport.left + viewport.width));
    const bottom = Math.min(map.height, Math.ceil(viewport.top + viewport.height));

    return { left, top, right, bottom };
}

function drawCollision(
    context: Context,
    map: WorldMap,
    tileset: Tileset,
    displaySize: number,
    bounds: ReturnType<typeof getViewportBounds>
) {
    for (let y = bounds.top; y < bounds.bottom; y++) {
        for (let x = bounds.left; x < bounds.right; x++) {
            const collision = getCollisionAt(map, tileset, x, y);

            if (collision) {
                context.fillStyle = collisionColors[collision];
                context.fillRect(x * displaySize, y * displaySize, displaySize, displaySize);
            }
        }
    }
}

function isEntityInViewport(entity: Entity, bounds: ReturnType<typeof getViewportBounds>) {
    const size = getEntitySize(entity);

    return (
        entity.x < bounds.right &&
        entity.x + size.width > bounds.left &&
        entity.y < bounds.bottom &&
        entity.y + size.height > bounds.top
    );
}

function drawGrid(context: Context, map: WorldMap, displaySize: number) {
    context.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    context.lineWidth = 1;
    context.beginPath();

    for (let x = 1; x < map.width; x++) {
        context.moveTo(x * displaySize + 0.5, 0);
        context.lineTo(x * displaySize + 0.5, map.height * displaySize);
    }
    for (let y = 1; y < map.height; y++) {
        context.moveTo(0, y * displaySize + 0.5);
        context.lineTo(map.width * displaySize, y * displaySize + 0.5);
    }
    context.stroke();
}

/** Draws a character's frame with its top-left corner at (left, top). Returns false when the sheet has no such sprite. */
export function drawSprite(
    context: Context,
    sprites: LoadedSpriteSheet,
    spriteId: string,
    facing: Facing,
    left: number,
    top: number,
    displaySize: number
): boolean {
    const frame = getSpriteFrame(sprites.sheet, spriteId, facing);

    if (!frame) {
        return false;
    }
    const { frameSize } = sprites.sheet;

    context.drawImage(
        sprites.image,
        frame.column * frameSize,
        frame.row * frameSize,
        frameSize,
        frameSize,
        left,
        top,
        displaySize,
        displaySize
    );

    return true;
}

/** Draws an item ball in the tile whose top-left corner is at (left, top). */
export function drawItem(context: Context, left: number, top: number, displaySize: number) {
    const pixel = displaySize / 16;
    const offsetX = left + ((16 - itemPixels[0].length) / 2) * pixel;
    const offsetY = top + (16 - itemPixels.length - 1) * pixel;

    itemPixels.forEach((row, y) => {
        [...row].forEach((code, x) => {
            if (itemColors[code]) {
                context.fillStyle = itemColors[code];
                context.fillRect(offsetX + x * pixel, offsetY + y * pixel, pixel, pixel);
            }
        });
    });
}

/** Draws a gatherable resource in the tile whose top-left corner is at (left, top). */
export function drawResource(
    context: Context,
    resource: Extract<Entity, { type: 'resource' }>['resource'],
    left: number,
    top: number,
    displaySize: number
) {
    const pixel = displaySize / 16;

    resourcePixels[resource].forEach((row, y) => {
        [...row].forEach((code, x) => {
            if (resourceColors[code]) {
                context.fillStyle = resourceColors[code];
                context.fillRect(left + x * pixel, top + y * pixel, pixel, pixel);
            }
        });
    });
}

/** First row of the hull in each ship grid. */
const shipHullRows = { side: 10, front: 8 };

/**
 * Draws a ship in the tile whose top-left corner is at (left, top), turned to `facing`. With `hullOnly`, only the
 * hull is drawn: the game draws it again over the player so the player sits in the ship.
 */
export function drawShip(
    context: Context,
    facing: Facing,
    left: number,
    top: number,
    displaySize: number,
    hullOnly = false
) {
    const pixel = displaySize / 16;
    const view = facing === 'left' || facing === 'right' ? 'side' : 'front';
    const mirror = facing === 'left';

    shipPixels[view].forEach((row, y) => {
        if (hullOnly && y < shipHullRows[view]) {
            return;
        }
        [...row].forEach((code, x) => {
            if (shipColors[code]) {
                context.fillStyle = shipColors[code];
                context.fillRect(left + (mirror ? 15 - x : x) * pixel, top + y * pixel, pixel, pixel);
            }
        });
    });
}

function drawEntity(
    context: Context,
    entity: Entity,
    displaySize: number,
    isSelected: boolean,
    sprites: LoadedSpriteSheet | null
) {
    const { color, label } = entityStyles[entity.type];
    const { width, height } = getEntitySize(entity);
    const left = entity.x * displaySize;
    const top = entity.y * displaySize;

    if (entity.type === 'npc' && sprites) {
        drawSprite(context, sprites, entity.sprite, entity.facing, left, top, displaySize);
    }

    if (entity.type === 'item') {
        drawItem(context, left, top, displaySize);
    }

    if (entity.type === 'resource') {
        drawResource(context, entity.resource, left, top, displaySize);
    }

    if (entity.type === 'ship') {
        drawShip(context, entity.facing, left, top, displaySize);
    }

    if (entity.type === 'trigger') {
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.strokeRect(left + 1, top + 1, width * displaySize - 2, height * displaySize - 2);
    }

    if (isSelected) {
        context.strokeStyle = '#fff';
        context.lineWidth = 4;
        context.strokeRect(left + 2, top + 2, width * displaySize - 4, height * displaySize - 4);
    }

    const hasSprite =
        entity.type === 'item' ||
        entity.type === 'resource' ||
        entity.type === 'ship' ||
        (entity.type === 'npc' && sprites && getSpriteFrame(sprites.sheet, entity.sprite, entity.facing));
    const badgeSize = Math.round(displaySize * (hasSprite ? 0.3 : 0.4));

    context.fillStyle = color;
    context.fillRect(left, top, badgeSize, badgeSize);
    context.fillStyle = '#000';
    context.font = `bold ${Math.round(badgeSize * 0.75)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, left + badgeSize / 2, top + badgeSize / 2 + 1);
}
