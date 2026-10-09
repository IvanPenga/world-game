import { getFlagUsage } from '../world-map/scripts';
import { useEditor } from './editor';

/** Names of all flags any map uses, for suggesting flag names while editing scripts. */
export function useKnownFlags(): string[] {
    const map = useEditor((state) => state.map);
    const maps = useEditor((state) => state.maps);
    const flags = new Set<string>();

    for (const other of Object.values({ ...maps, [map.id]: map })) {
        for (const flag of getFlagUsage(other).keys()) {
            flags.add(flag);
        }
    }

    return [...flags].sort();
}
