import z from 'zod';

export const collisionSchema = z.enum(['solid', 'water']);

export type Collision = z.infer<typeof collisionSchema>;

const tileDefinitionSchema = z.object({
    name: z.string(),
    collision: collisionSchema.optional(),
    animation: z
        .object({
            frames: z.array(z.int().positive()).min(2),
            frameDuration: z.int().positive()
        })
        .optional()
});

export type TileDefinition = z.infer<typeof tileDefinitionSchema>;

/**
 * A single image cut into square tiles. Tile ids are 1-based and read left to right, top to bottom;
 * id 0 is reserved for "no tile".
 */
export const tilesetSchema = z.object({
    id: z.string(),
    image: z.string(),
    tileSize: z.int().positive(),
    columns: z.int().positive(),
    tiles: z.record(z.string().regex(/^[1-9]\d*$/), tileDefinitionSchema)
});

export type Tileset = z.infer<typeof tilesetSchema>;

export function parseTileset(data: unknown): Tileset {
    const result = tilesetSchema.safeParse(data);

    if (!result.success) {
        throw new Error(`Invalid tileset:\n${z.prettifyError(result.error)}`);
    }

    return result.data;
}

export function getTileIds(tileset: Tileset): number[] {
    return Object.keys(tileset.tiles)
        .map(Number)
        .sort((a, b) => a - b);
}

export function getTileDefinition(tileset: Tileset, tileId: number): TileDefinition | undefined {
    return tileset.tiles[String(tileId)];
}

/** Column and row of the tile inside the tileset image. */
export function getTileSourcePosition(tileset: Tileset, tileId: number): { column: number; row: number } {
    const index = tileId - 1;

    return { column: index % tileset.columns, row: Math.floor(index / tileset.columns) };
}

/** Returns the tile id to draw at a given time, resolving optional tile animations. */
export function getAnimatedTileId(tileset: Tileset, tileId: number, time: number): number {
    const animation = getTileDefinition(tileset, tileId)?.animation;

    if (!animation) {
        return tileId;
    }
    const index = Math.floor(time / animation.frameDuration) % animation.frames.length;

    return animation.frames[index];
}
