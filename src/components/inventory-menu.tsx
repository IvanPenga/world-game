import { css } from 'goober';
import type { InventoryEntry } from '../game/game-state';
import { getItem, type ItemCatalog } from '../world-map/items';

const overlayStyles = css({
    position: 'absolute',
    inset: '8px',
    display: 'grid',
    gridTemplateRows: '1fr auto',
    gap: '8px',
    color: '#111',
    font: '18px/1.5 monospace',
    lineHeight: 1.5
});
const boxStyles = css({
    padding: '10px 14px',
    border: '4px double #333',
    borderRadius: '6px',
    background: '#f8f8f8',
    overflow: 'hidden'
});
const listStyles = css({
    margin: 0,
    padding: 0,
    listStyle: 'none',
    '& li': { display: 'flex', gap: '8px' },
    '& li > span:nth-child(2)': { flex: 1 }
});
const descriptionStyles = css({ minHeight: '4.5em', whiteSpace: 'pre-wrap' });

/** Entries that fit in the list; longer inventories scroll with the selection. */
const visibleEntries = 7;

/**
 * The player's bag, drawn over the game screen: the items on top with the selected one marked, and the selected
 * item's description below, like the bag in the Game Boy games.
 */
export function InventoryMenu(properties: { inventory: InventoryEntry[]; selected: number; items: ItemCatalog }) {
    const { inventory, selected, items } = properties;
    const selectedEntry = inventory[selected];
    const selectedItem = selectedEntry && getItem(items, selectedEntry.item);
    const first = Math.max(0, Math.min(selected - Math.floor(visibleEntries / 2), inventory.length - visibleEntries));
    const visible = inventory.slice(first, first + visibleEntries);

    return (
        <div className={overlayStyles}>
            <div className={boxStyles}>
                <strong>BAG</strong> {first > 0 && '▲'}
                {inventory.length === 0 ? (
                    <p>The bag is empty.</p>
                ) : (
                    <ul className={listStyles}>
                        {visible.map((entry, index) => (
                            <li key={entry.item}>
                                <span>{first + index === selected ? '▶' : '\u00a0'}</span>
                                <span>{getItem(items, entry.item)?.name ?? entry.item}</span>
                                <span>×{entry.count}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {first + visibleEntries < inventory.length && '▼'}
            </div>
            <div className={`${boxStyles} ${descriptionStyles}`}>
                {selectedEntry
                    ? (selectedItem?.description ?? `"${selectedEntry.item}" is not in the item catalog.`)
                    : 'Items you pick up or are given are kept here.'}
            </div>
        </div>
    );
}
