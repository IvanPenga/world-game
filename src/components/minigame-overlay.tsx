import { css } from 'goober';
import { useState } from 'react';
import type { ActiveMiniGame } from '../game/game-state';

const overlayStyles = css({
    position: 'absolute',
    inset: '10px',
    display: 'grid',
    placeItems: 'center',
    background: '#101820cc',
    color: '#f8f8f8',
    font: '16px/1.45 monospace'
});
const panelStyles = css({
    width: 'min(82%, 320px)',
    display: 'grid',
    gap: '10px',
    padding: '16px',
    border: '4px double #d6e4ff',
    borderRadius: '8px',
    background: '#162534',
    boxShadow: '0 16px 48px #0008'
});
const inputStyles = css({
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '2px solid #d6e4ff',
    background: '#f8f8f8',
    color: '#111',
    font: '18px monospace'
});
const buttonStyles = css({ justifySelf: 'end', padding: '6px 12px' });
const feedbackStyles = css({ color: '#ffcc66' });

export function MiniGameOverlay(properties: { miniGame: ActiveMiniGame; onSubmit: (answer: string) => void }) {
    const { miniGame, onSubmit } = properties;
    const [answer, setAnswer] = useState('');
    const definition = miniGame.definition;

    return (
        <div className={overlayStyles}>
            <form
                className={panelStyles}
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmit(answer);
                }}
            >
                <strong>{definition.title || 'Mini game'}</strong>
                <label>
                    {definition.prompt || 'Enter the answer.'}
                    <input
                        autoFocus
                        className={inputStyles}
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                    />
                </label>
                {miniGame.feedback && <span className={feedbackStyles}>{miniGame.feedback}</span>}
                <button type='submit' className={buttonStyles}>
                    Submit
                </button>
            </form>
        </div>
    );
}
