import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { currentWindowLabel } from './radial/native';
import './styles.css';

// The webview is a native window: browser context menus and text-drag get in the way.
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('input, textarea, [contenteditable], .selectable')) e.preventDefault();
});

const root = ReactDOM.createRoot(document.getElementById('root')!);

/**
 * Two windows share this bundle. The main window is the full app; `radial` is the
 * transparent overlay, which must start fast and stay small, so neither side loads
 * the other's code.
 */
async function boot(): Promise<void> {
  if (currentWindowLabel() === 'radial') {
    const mod = import.meta.env.DEV && /radial-demo/.test(window.location.hash)
      ? await import('./radial/dev/Demo')
      : await import('./radial/RadialApp');
    const Overlay = mod.default;
    root.render(
      <React.StrictMode>
        <Overlay />
      </React.StrictMode>,
    );
    return;
  }
  const { default: App } = await import('./App');
  root.render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
}

void boot();
