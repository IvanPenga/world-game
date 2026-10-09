import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { serializeTileset, serializeWorldMap } from '../src/world-map/map-file.ts';
import { parseTileset, type Tileset } from '../src/world-map/tileset.ts';
import { parseWorldMap, type WorldMap } from '../src/world-map/world-map.ts';

const idPattern = /^[\w-]+$/;

/** A folder of JSON files, each holding one document with an `id`. */
export type JsonCollection<T extends { id: string }> = {
    /** URL path, e.g. `/api/maps`. */
    route: string;
    directory: string;
    /** Returns the document, or throws a readable error when it is invalid. */
    parse: (data: unknown) => T;
    serialize: (document: T) => string;
};

function readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let body = '';

        request.setEncoding('utf8');
        request.on('data', (chunk: string) => (body += chunk));
        request.on('end', () => resolve(body));
        request.on('error', reject);
    });
}

function reply(response: ServerResponse, status: number, body: unknown) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Every valid document in the folder with the file it came from, and the files that are not valid documents. */
async function readCollection<T extends { id: string }>(collection: JsonCollection<T>) {
    const documents: { file: string; document: T }[] = [];
    const invalid: { file: string; error: string }[] = [];

    for (const file of (await readdir(collection.directory)).sort()) {
        if (!file.endsWith('.json')) {
            continue;
        }
        try {
            const text = await readFile(path.join(collection.directory, file), 'utf8');

            documents.push({ file, document: collection.parse(JSON.parse(text)) });
        } catch (error) {
            invalid.push({ file, error: getErrorMessage(error) });
        }
    }

    return { documents, invalid };
}

/**
 * Dev-server API that lets the editor read and save maps and tilesets as JSON files:
 *
 * - `GET <route>` lists every document in the folder: `{ items, invalid: [{ file, error }] }`.
 * - `PUT <route>/<id>` validates the document and writes it to the file with the same `id`, or to `<id>.json`.
 *
 * Hot reload is skipped for files the API writes, so saving does not reset the editor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function editorFilesPlugin(collections: JsonCollection<any>[]): Plugin {
    /** Content last written per file, to tell our own writes from edits made outside the editor. */
    const writtenFiles = new Map<string, string>();

    return {
        name: 'editor-files',
        apply: 'serve',

        configureServer(server) {
            for (const collection of collections) {
                server.middlewares.use(collection.route, async (request, response) => {
                    const id = decodeURIComponent((request.url ?? '').split('?')[0].replace(/^\/+|\/+$/g, ''));

                    try {
                        if (request.method === 'GET' && id === '') {
                            const { documents, invalid } = await readCollection(collection);

                            return reply(response, 200, { items: documents.map((entry) => entry.document), invalid });
                        }
                        if (request.method !== 'PUT' || !idPattern.test(id)) {
                            return reply(response, 404, {
                                error: `Use GET ${collection.route} or PUT ${collection.route}/<id> (letters, digits, "-" and "_")`
                            });
                        }
                        let document: { id: string };

                        try {
                            document = collection.parse(JSON.parse(await readBody(request)));
                        } catch (error) {
                            return reply(response, 400, { error: getErrorMessage(error) });
                        }
                        if (document.id !== id) {
                            return reply(response, 400, { error: `The id in the body must be "${id}"` });
                        }
                        const { documents } = await readCollection(collection);
                        const file = documents.find((entry) => entry.document.id === id)?.file ?? `${id}.json`;
                        const filePath = path.join(collection.directory, file);
                        const content = collection.serialize(document);

                        writtenFiles.set(filePath, content);
                        await writeFile(filePath, content);
                        reply(response, 200, { file: path.relative(server.config.root, filePath) });
                    } catch (error) {
                        reply(response, 500, { error: getErrorMessage(error) });
                    }
                });
            }
        },

        async hotUpdate({ file, read }) {
            const written = writtenFiles.get(file);

            if (written !== undefined && (await read()) === written) {
                return [];
            }
        }
    };
}

export function mapsCollection(directory: string): JsonCollection<WorldMap> {
    return { route: '/api/maps', directory, parse: parseWorldMap, serialize: serializeWorldMap };
}

export function tilesetsCollection(directory: string): JsonCollection<Tileset> {
    return { route: '/api/tilesets', directory, parse: parseTileset, serialize: serializeTileset };
}
