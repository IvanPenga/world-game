import { useEditor } from '../editor/editor';
import { getFlagUsage } from '../world-map/scripts';
import styles from './control-panel.module.css';

/**
 * Every flag used by any map: where it is set and where it is checked. Flags are shared by all maps, so a flag set
 * in one map can be checked in another.
 */
export function FlagOverview() {
    const map = useEditor((state) => state.map);
    const maps = useEditor((state) => state.maps);
    const rows = new Map<string, { set: string[]; checked: string[] }>();

    for (const other of Object.values({ ...maps, [map.id]: map })) {
        for (const [flag, usage] of getFlagUsage(other)) {
            const row = rows.get(flag) ?? { set: [], checked: [] };
            const where = (scriptId: string) => (other.id === map.id ? scriptId : `${other.id}/${scriptId}`);

            row.set.push(...usage.setIn.map(where));
            row.checked.push(...usage.checkedIn.map(where));
            rows.set(flag, row);
        }
    }
    if (rows.size === 0) {
        return <p className={styles.hint}>No script sets or checks a flag yet.</p>;
    }

    return (
        <table className={styles.table}>
            <thead>
                <tr>
                    <th>Flag</th>
                    <th>Set in</th>
                    <th>Checked in</th>
                </tr>
            </thead>
            <tbody>
                {[...rows]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([flag, { set, checked }]) => (
                        <tr key={flag}>
                            <td>
                                <code>{flag}</code>
                            </td>
                            <td className={set.length === 0 ? styles.missing : undefined}>
                                {set.join(', ') || 'never'}
                            </td>
                            <td className={checked.length === 0 ? styles.missing : undefined}>
                                {checked.join(', ') || 'never'}
                            </td>
                        </tr>
                    ))}
            </tbody>
        </table>
    );
}
