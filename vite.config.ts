import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { editorFilesPlugin, mapsCollection, tilesetsCollection } from './vite-plugins/editor-files-plugin.ts';

const assetsDirectory = (folder: string) => fileURLToPath(new URL(`./src/assets/${folder}`, import.meta.url));
const rootFile = (file: string) => fileURLToPath(new URL(`./${file}`, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        editorFilesPlugin([mapsCollection(assetsDirectory('maps')), tilesetsCollection(assetsDirectory('tilesets'))])
    ],
    build: {
        rollupOptions: {
            input: {
                editor: rootFile('index.html'),
                game: rootFile('game.html')
            }
        }
    }
});
