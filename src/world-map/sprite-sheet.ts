import z from 'zod';
import { facingSchema, type Facing } from './world-map';

/**
 * Character sprites in one image: one row per sprite and one column per facing, each frame `frameSize` pixels square.
 * NPCs refer to a sprite by its id.
 */
export const spriteSheetSchema = z.object({
    image: z.string(),
    frameSize: z.int().positive(),
    facings: z.array(facingSchema),
    sprites: z.array(z.string())
});

export type SpriteSheet = z.infer<typeof spriteSheetSchema>;

export function parseSpriteSheet(data: unknown): SpriteSheet {
    const result = spriteSheetSchema.safeParse(data);

    if (!result.success) {
        throw new Error(`Invalid sprite sheet:\n${z.prettifyError(result.error)}`);
    }

    return result.data;
}

/** Column and row of a sprite's frame in the image, or null when the sheet has no such sprite or facing. */
export function getSpriteFrame(
    sheet: SpriteSheet,
    spriteId: string,
    facing: Facing
): { column: number; row: number } | null {
    const row = sheet.sprites.indexOf(spriteId);
    const column = sheet.facings.indexOf(facing);

    return row === -1 || column === -1 ? null : { column, row };
}
