export type DraftKind = 'map' | 'tileset';

export type Draft = {
    /** The unsaved document. Not validated: it may come from an older version of the editor. */
    document: unknown;
    /** When the draft was written, in milliseconds since 1970. */
    savedAt: number;
};

/** Keeps copies of unsaved maps and tilesets so they can be restored after a crash or an accidental reload. */
export type DraftStorage = {
    load: (kind: DraftKind, id: string) => Draft | null;
    save: (kind: DraftKind, id: string, document: unknown) => void;
    clear: (kind: DraftKind, id: string) => void;
    /** Ids of all documents of the kind that have a draft. */
    listIds: (kind: DraftKind) => string[];
};

const keyPrefix = 'world-editor:draft:';

/** Drafts in the browser's localStorage. Does nothing when storage is unavailable, e.g. in a private window. */
export function createLocalDraftStorage(): DraftStorage {
    function getStorage(): Storage | null {
        try {
            return window.localStorage;
        } catch {
            return null;
        }
    }

    function attempt<T>(action: (storage: Storage) => T, fallback: T): T {
        const storage = getStorage();

        try {
            return storage ? action(storage) : fallback;
        } catch {
            return fallback;
        }
    }

    return {
        load: (kind, id) =>
            attempt((storage) => {
                const text = storage.getItem(`${keyPrefix}${kind}:${id}`);

                return text ? (JSON.parse(text) as Draft) : null;
            }, null),
        save: (kind, id, document) =>
            attempt(
                (storage) =>
                    storage.setItem(
                        `${keyPrefix}${kind}:${id}`,
                        JSON.stringify({ document, savedAt: Date.now() } satisfies Draft)
                    ),
                undefined
            ),
        clear: (kind, id) => attempt((storage) => storage.removeItem(`${keyPrefix}${kind}:${id}`), undefined),
        listIds: (kind) =>
            attempt(
                (storage) =>
                    Object.keys(storage)
                        .filter((key) => key.startsWith(`${keyPrefix}${kind}:`))
                        .map((key) => key.slice(`${keyPrefix}${kind}:`.length)),
                []
            )
    };
}

/** Drafts that only live as long as the page, for tests. */
export function createMemoryDraftStorage(now = () => Date.now()): DraftStorage {
    const drafts = new Map<string, Draft>();

    return {
        load: (kind, id) => drafts.get(`${kind}:${id}`) ?? null,
        save: (kind, id, document) => drafts.set(`${kind}:${id}`, { document, savedAt: now() }),
        clear: (kind, id) => drafts.delete(`${kind}:${id}`),
        listIds: (kind) =>
            [...drafts.keys()].filter((key) => key.startsWith(`${kind}:`)).map((key) => key.slice(kind.length + 1))
    };
}
