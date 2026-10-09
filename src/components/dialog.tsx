import { useEffect, useRef, type ReactNode } from 'react';
import styles from './control-panel.module.css';

/** A modal dialog. Escape or the close button calls `onClose`. */
export function Dialog(properties: { title: string; children: ReactNode; onClose: () => void }) {
    const { title, children, onClose } = properties;
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;

        dialog?.showModal();

        return () => dialog?.close();
    }, []);

    return (
        <dialog
            ref={dialogRef}
            className={styles.dialog}
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
        >
            <h3>{title}</h3>
            {children}
        </dialog>
    );
}
