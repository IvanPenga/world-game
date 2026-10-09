import './app.css';
import { ControlPanel } from './components/control-panel';
import { PlaytestView } from './components/playtest-view';
import { NavigationDialog } from './components/unsaved-changes';
import { WorldMapEditor } from './components/world-map-editor';
import { useEditor } from './editor/editor';

function App() {
    const playtesting = useEditor((state) => state.playtestStart !== null);

    if (playtesting) {
        return (
            <main>
                <PlaytestView />
            </main>
        );
    }

    return (
        <main>
            <div className='map-area'>
                <WorldMapEditor />
            </div>
            <ControlPanel />
            <NavigationDialog />
        </main>
    );
}

export default App;
