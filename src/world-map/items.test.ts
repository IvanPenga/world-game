import { describe, expect, it } from 'vitest';
import itemsFile from '../assets/items/items.json';
import { getItem, getItemName, parseItemCatalog } from './items';

describe('item catalog', () => {
    it('parses the bundled item catalog', () => {
        const catalog = parseItemCatalog(itemsFile);

        expect(catalog.items.length).toBeGreaterThan(0);
        expect(getItem(catalog, 'potion')?.name).toBe('Potion');
    });

    it('rejects duplicate item ids', () => {
        const item = { id: 'potion', name: 'Potion', description: '' };

        expect(() => parseItemCatalog({ items: [item, item] })).toThrow(/Duplicate item id "potion"/);
    });

    it('falls back to the id for unknown items', () => {
        expect(getItemName({ items: [] }, 'mystery')).toBe('mystery');
    });
});
