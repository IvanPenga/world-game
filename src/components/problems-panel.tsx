import clsx from 'clsx';
import { useEditor } from '../editor/editor';
import { useProblems } from '../editor/use-problems';
import type { Problem } from '../world-map/lint';
import styles from './control-panel.module.css';

/** Warnings about the map that do not stop it from being saved. Click one to point at it on the map. */
export function ProblemsPanel() {
    const problems = useProblems();
    const selectEntity = useEditor((state) => state.selectEntity);
    const setTool = useEditor((state) => state.setTool);
    const focusTile = useEditor((state) => state.focusTile);

    if (problems.length === 0) {
        return <p className={styles.hint}>No problems found.</p>;
    }

    function show(problem: Problem) {
        if (problem.entityId) {
            setTool('entity');
            selectEntity(problem.entityId);
        }
        focusTile(problem.x === undefined || problem.y === undefined ? null : { x: problem.x, y: problem.y });
    }

    return (
        <ul className={styles.problems}>
            {problems.map((problem, index) => (
                <li key={index}>
                    <button
                        className={clsx(styles.problem, problem.severity === 'warning' && styles.warning)}
                        onClick={() => show(problem)}
                    >
                        {problem.severity === 'warning' ? '⚠' : 'ℹ'} {problem.message}
                    </button>
                </li>
            ))}
        </ul>
    );
}

export function ProblemCount() {
    const problems = useProblems();
    const warnings = problems.filter((problem) => problem.severity === 'warning').length;

    return (
        <>
            {warnings > 0 ? ` (${warnings} ⚠)` : ''}
            {problems.length > warnings ? ` (${problems.length - warnings} ℹ)` : ''}
        </>
    );
}
