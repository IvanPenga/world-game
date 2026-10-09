import { useEffect, useState } from 'react';

/** Loads an image and copies it to a canvas once, which makes repeated canvas draws cheaper for SVG assets. */
export function useRasterImage(source: string): HTMLCanvasElement | null {
    const [loaded, setLoaded] = useState<{ source: string; canvas: HTMLCanvasElement } | null>(null);

    useEffect(() => {
        const image = new Image();
        let cancelled = false;

        image.onload = () => {
            if (cancelled) {
                return;
            }
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            context?.drawImage(image, 0, 0);
            setLoaded({ source, canvas });
        };
        image.onerror = () => console.error(`Failed to load image "${source}"`);
        image.src = source;

        return () => {
            cancelled = true;
        };
    }, [source]);

    return loaded?.source === source ? loaded.canvas : null;
}
