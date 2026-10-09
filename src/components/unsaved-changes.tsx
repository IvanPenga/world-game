import { useEditor } from '../editor/editor';
import { hasUnsavedMapChanges, hasUnsavedTilesetChanges } from '../editor/editor-store';
import styles from './control-panel.module.css';
import { Dialog } from './dialog';

/** Asks what to do with unsaved changes before another map is opened. */
export function NavigationDialog() {
    const pendingNavigation = useEditor((state) => state.pendingNavigation);
    const mapName = useEditor((state) => state.map.name);
    const tilesetId = useEditor((state) => state.tileset.id);
    const mapChanged = useEditor(hasUnsavedMapChanges);
    const tilesetChanged = useEditor(hasUnsavedTilesetChanges);
    const saving = useEditor((state) => state.saving);
    const resolveNavigation = useEditor((state) => state.resolveNavigation);

    if (!pendingNavigation) {
        return null;
    }
    const changed = [mapChanged && `map "${mapName}"`, tilesetChanged && `tileset "${tilesetId}"`]
        .filter(Boolean)
        .join(' and ');

    return (
        <Dialog title='Unsaved changes' onClose={() => resolveNavigation('cancel')}>
            <p>The {changed} has unsaved changes. Save them before opening the other map?</p>
            <div className={styles.row}>
                <button disabled={saving} autoFocus onClick={() => resolveNavigation('save')}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
                <button disabled={saving} onClick={() => resolveNavigation('discard')}>
                    Don't save
                </button>
                <button disabled={saving} className={styles.danger} onClick={() => resolveNavigation('cancel')}>
                    Cancel
                </button>
            </div>
        </Dialog>
    );
}

/** Offers to bring back unsaved changes from an earlier session. */
export function DraftBanner() {
    const recoverableDraft = useEditor((state) => state.recoverableDraft);
    const restoreDraft = useEditor((state) => state.restoreDraft);
    const dismissDraft = useEditor((state) => state.dismissDraft);

    if (!recoverableDraft) {
        return null;
    }
    const what = [recoverableDraft.map && 'this map', recoverableDraft.tileset && 'the tileset']
        .filter(Boolean)
        .join(' and ');

    return (
        <div className={styles.banner}>
            <span>
                Found unsaved changes to {what} from {new Date(recoverableDraft.savedAt).toLocaleString()}.
            </span>
            <div className={styles.row}>
                <button onClick={restoreDraft}>Restore</button>
                <button onClick={dismissDraft}>Discard</button>
            </div>
        </div>
    );
}
