import z from 'zod';

const itemDefinitionSchema = z.object({
    id: z.string().min(1),
    name: z.string(),
    description: z.string()
});

export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;

/**
 * Every item the player can carry, shared by all maps like flags are. Maps refer to items by id. The order is the
 * order items are listed in the editor.
 */
export const itemCatalogSchema = z
    .object({
        items: z.array(itemDefinitionSchema)
    })
    .superRefine((catalog, context) => {
        const ids = new Set<string>();

        catalog.items.forEach((item, index) => {
            if (ids.has(item.id)) {
                context.addIssue({
                    code: 'custom',
                    path: ['items', index, 'id'],
                    message: `Duplicate item id "${item.id}"`
                });
            }
            ids.add(item.id);
        });
    });

export type ItemCatalog = z.infer<typeof itemCatalogSchema>;

export function parseItemCatalog(data: unknown): ItemCatalog {
    const result = itemCatalogSchema.safeParse(data);

    if (!result.success) {
        throw new Error(`Invalid item catalog:\n${z.prettifyError(result.error)}`);
    }

    return result.data;
}

export function getItem(catalog: ItemCatalog, itemId: string): ItemDefinition | undefined {
    return catalog.items.find((item) => item.id === itemId);
}

/** The item's name, or its id when the catalog has no such item. */
export function getItemName(catalog: ItemCatalog, itemId: string): string {
    return getItem(catalog, itemId)?.name ?? itemId;
}
