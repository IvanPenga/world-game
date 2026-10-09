import z from 'zod';

const coordinate = z.int().nonnegative();

const warpTargetSchema = z.object({
    mapId: z.string(),
    x: coordinate,
    y: coordinate
});

export type WarpTarget = z.infer<typeof warpTargetSchema>;

export const facingSchema = z.enum(['up', 'down', 'left', 'right']);

export type Facing = z.infer<typeof facingSchema>;

export const resourceTypes = ['wood', 'stone', 'fruit'] as const;

export type ResourceType = (typeof resourceTypes)[number];

const resourceTypeSchema = z.enum(resourceTypes);

export type MiniGame = {
    type: 'password';
    title: string;
    prompt: string;
    answer: string;
    caseSensitive?: boolean;
    success?: ScriptAction[];
    failure?: ScriptAction[];
};

export type ScriptAction =
    | { type: 'say'; text: string }
    | { type: 'warp'; target: WarpTarget }
    | { type: 'setFlag'; flag: string; value: boolean }
    | { type: 'giveItem'; item: string; count?: number }
    | { type: 'miniGame'; miniGame: MiniGame }
    | { type: 'if'; flag: string; then: ScriptAction[]; else?: ScriptAction[] };

export const scriptActionSchema: z.ZodType<ScriptAction> = z.lazy(() =>
    z.discriminatedUnion('type', [
        z.object({ type: z.literal('say'), text: z.string() }),
        z.object({ type: z.literal('warp'), target: warpTargetSchema }),
        z.object({ type: z.literal('setFlag'), flag: z.string(), value: z.boolean() }),
        z.object({ type: z.literal('giveItem'), item: z.string(), count: z.int().positive().optional() }),
        z.object({
            type: z.literal('miniGame'),
            miniGame: z.discriminatedUnion('type', [
                z.object({
                    type: z.literal('password'),
                    title: z.string(),
                    prompt: z.string(),
                    answer: z.string(),
                    caseSensitive: z.boolean().optional(),
                    success: z.array(scriptActionSchema).optional(),
                    failure: z.array(scriptActionSchema).optional()
                })
            ])
        }),
        z.object({
            type: z.literal('if'),
            flag: z.string(),
            then: z.array(scriptActionSchema),
            else: z.array(scriptActionSchema).optional()
        })
    ])
);

const entitySchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('warp'), id: z.string(), x: coordinate, y: coordinate, target: warpTargetSchema }),
    z.object({
        type: z.literal('npc'),
        id: z.string(),
        x: coordinate,
        y: coordinate,
        sprite: z.string(),
        facing: facingSchema,
        movement: z.enum(['static', 'wander']),
        script: z.string()
    }),
    z.object({ type: z.literal('sign'), id: z.string(), x: coordinate, y: coordinate, script: z.string() }),
    z.object({
        type: z.literal('trigger'),
        id: z.string(),
        x: coordinate,
        y: coordinate,
        width: z.int().positive(),
        height: z.int().positive(),
        on: z.enum(['step', 'interact']),
        script: z.string(),
        once: z.boolean().optional()
    }),
    z.object({
        type: z.literal('item'),
        id: z.string(),
        x: coordinate,
        y: coordinate,
        item: z.string(),
        count: z.int().positive().optional()
    }),
    z.object({
        type: z.literal('resource'),
        id: z.string(),
        x: coordinate,
        y: coordinate,
        resource: resourceTypeSchema,
        count: z.int().positive().optional()
    }),
    z.object({ type: z.literal('ship'), id: z.string(), x: coordinate, y: coordinate, facing: facingSchema })
]);

export type Entity = z.infer<typeof entitySchema>;

export type EntityType = Entity['type'];

export const entityTypes: EntityType[] = ['warp', 'npc', 'sign', 'trigger', 'item', 'resource', 'ship'];

/** Number of tiles an entity covers. Only triggers can be larger than one tile. */
export function getEntitySize(entity: Entity): { width: number; height: number } {
    return entity.type === 'trigger' ? { width: entity.width, height: entity.height } : { width: 1, height: 1 };
}

const layerSchema = z.array(z.int().nonnegative());

export const layerNames = ['ground', 'decoration', 'overhead'] as const;

export type LayerName = (typeof layerNames)[number];

export const worldMapSchema = z
    .object({
        id: z.string(),
        name: z.string(),
        width: z.int().positive(),
        height: z.int().positive(),
        tilesetId: z.string(),
        layers: z.object({ ground: layerSchema, decoration: layerSchema, overhead: layerSchema }),
        entities: z.array(entitySchema),
        scripts: z.record(z.string(), z.array(scriptActionSchema))
    })
    .superRefine((map, context) => {
        const tileCount = map.width * map.height;

        for (const layerName of layerNames) {
            if (map.layers[layerName].length !== tileCount) {
                context.addIssue({
                    code: 'custom',
                    path: ['layers', layerName],
                    message: `Layer must have ${tileCount} tiles (width × height), got ${map.layers[layerName].length}`
                });
            }
        }

        const entityIds = new Set<string>();

        map.entities.forEach((entity, index) => {
            const { width, height } = getEntitySize(entity);

            if (entityIds.has(entity.id)) {
                context.addIssue({
                    code: 'custom',
                    path: ['entities', index, 'id'],
                    message: `Duplicate entity id "${entity.id}"`
                });
            }
            entityIds.add(entity.id);

            if (entity.x + width > map.width || entity.y + height > map.height) {
                context.addIssue({
                    code: 'custom',
                    path: ['entities', index],
                    message: `Entity "${entity.id}" is outside the map`
                });
            }

            if ('script' in entity && !(entity.script in map.scripts)) {
                context.addIssue({
                    code: 'custom',
                    path: ['entities', index, 'script'],
                    message: `Unknown script "${entity.script}"`
                });
            }
        });
    });

export type WorldMap = z.infer<typeof worldMapSchema>;

export function parseWorldMap(data: unknown): WorldMap {
    const error = validateWorldMap(data);

    if (error) {
        throw new Error(`Invalid world map:\n${error}`);
    }

    return worldMapSchema.parse(data);
}

/** Returns a readable description of everything wrong with the map, or null when it is valid. */
export function validateWorldMap(data: unknown): string | null {
    const result = worldMapSchema.safeParse(data);

    return result.success ? null : z.prettifyError(result.error);
}

export function createEmptyWorldMap(options: {
    id: string;
    name: string;
    width: number;
    height: number;
    tilesetId: string;
    fillTileId?: number;
}): WorldMap {
    const { id, name, width, height, tilesetId, fillTileId = 0 } = options;
    const tileCount = width * height;

    return {
        id,
        name,
        width,
        height,
        tilesetId,
        layers: {
            ground: Array.from({ length: tileCount }, () => fillTileId),
            decoration: Array.from({ length: tileCount }, () => 0),
            overhead: Array.from({ length: tileCount }, () => 0)
        },
        entities: [],
        scripts: {}
    };
}

export function isInBounds(map: WorldMap, x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function getTileIndex(map: WorldMap, x: number, y: number): number {
    return y * map.width + x;
}

export function getTile(map: WorldMap, layer: LayerName, x: number, y: number): number {
    return isInBounds(map, x, y) ? map.layers[layer][getTileIndex(map, x, y)] : 0;
}

export function getEntitiesAt(map: WorldMap, x: number, y: number): Entity[] {
    return map.entities.filter((entity) => {
        const { width, height } = getEntitySize(entity);

        return x >= entity.x && x < entity.x + width && y >= entity.y && y < entity.y + height;
    });
}

/** Indices of all tiles connected to (x, y) (up, down, left, right) that have the same tile id on the layer. */
export function getFloodFillIndices(map: WorldMap, layer: LayerName, x: number, y: number): number[] {
    if (!isInBounds(map, x, y)) {
        return [];
    }
    const tiles = map.layers[layer];
    const targetTileId = tiles[getTileIndex(map, x, y)];
    const visited = new Set<number>();
    const stack: [number, number][] = [[x, y]];

    while (stack.length > 0) {
        const [currentX, currentY] = stack.pop()!;
        const index = getTileIndex(map, currentX, currentY);

        if (!isInBounds(map, currentX, currentY) || visited.has(index) || tiles[index] !== targetTileId) {
            continue;
        }
        visited.add(index);
        stack.push(
            [currentX + 1, currentY],
            [currentX - 1, currentY],
            [currentX, currentY + 1],
            [currentX, currentY - 1]
        );
    }

    return [...visited];
}
