import 'virtual:rs/scripts';
import { createRoot } from 'react-dom/client';
import { editor } from './editor/Editor';
import { App } from './ui/App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
editor.init().then(
  () => root.render(<App />),
  (e) => {
    document.getElementById('root')!.textContent = `Editor failed to start: ${(e as Error).message}`;
    console.error(e);
  },
);
