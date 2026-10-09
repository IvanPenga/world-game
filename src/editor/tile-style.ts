import type { CSSProperties } from 'react';
import { getTileSourcePosition, type Tileset } from '../world-map/tileset';

export const tileScale = 3;

/** Background styles that draw the given tiles on top of each other. The first tile id is drawn on top. */
export function getTileBackgroundStyle(tileset: Tileset, tileIds: number[]): CSSProperties {
    const visibleTileIds = tileIds.filter((tileId) => tileId !== 0);
    const displayTileSize = tileset.tileSize * tileScale;

    if (visibleTileIds.length === 0) {
        return {};
    }

    return {
        backgroundImage: visibleTileIds.map(() => `url(${tileset.image})`).join(', '),
        backgroundSize: visibleTileIds.map(() => `${tileset.columns * displayTileSize}px auto`).join(', '),
        backgroundPosition: visibleTileIds
            .map((tileId) => {
                const { column, row } = getTileSourcePosition(tileset, tileId);

                return `-${column * displayTileSize}px -${row * displayTileSize}px`;
            })
            .join(', '),
        backgroundRepeat: 'no-repeat'
    };
}
