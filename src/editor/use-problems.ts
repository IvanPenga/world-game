import { useMemo } from 'react';
import { lintWorldMap, type Problem } from '../world-map/lint';
import { itemCatalog, spriteSheet, useEditor } from './editor';

/** Lint problems of the open map, checked against every saved map and the current tileset. */
export function useProblems(): Problem[] {
    const map = useEditor((state) => state.map);
    const tileset = useEditor((state) => state.tileset);
    const maps = useEditor((state) => state.maps);
    const tilesets = useEditor((state) => state.tilesets);

    return useMemo(
        () =>
            lintWorldMap(map, {
                tileset,
                maps,
                tilesets: { ...tilesets, [tileset.id]: tileset },
                spriteIds: spriteSheet.sprites,
                itemIds: itemCatalog.items.map((item) => item.id)
            }),
        [map, tileset, maps, tilesets]
    );
}
