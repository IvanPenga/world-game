import { useEffect, useState } from 'react';

/** Loads an image and returns it once it is ready to be drawn, or null while loading. */
export function useImage(source: string): HTMLImageElement | null {
    const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement } | null>(null);

    useEffect(() => {
        const image = new Image();
        let cancelled = false;

        image.onload = () => {
            if (!cancelled) {
                setLoaded({ source, image });
            }
        };
        image.onerror = () => console.error(`Failed to load image "${source}"`);
        image.src = source;

        return () => {
            cancelled = true;
        };
    }, [source]);

    return loaded?.source === source ? loaded.image : null;
}
