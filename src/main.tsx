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

/** The GitHub Pages build: the app in a browser, with the native backend mocked (src/web). */
const WEB_DEMO = import.meta.env.VITE_WEB_DEMO === 'true';

const root = ReactDOM.createRoot(document.getElementById('root')!);

/**
 * Two windows share this bundle. The main window is the full app; `radial` is the
 * transparent overlay, which must start fast and stay small, so neither side loads
 * the other's code.
 */
async function boot(): Promise<void> {
  if (currentWindowLabel() === 'radial') {
    const mod = (import.meta.env.DEV || WEB_DEMO) && /radial-demo/.test(window.location.hash)
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
  if (WEB_DEMO) await import('./web/demoIpc');
  const { default: App } = await import('./App');
  const Banner = WEB_DEMO ? (await import('./web/DemoBanner')).DemoBanner : null;
  root.render(
    <React.StrictMode>
      <HashRouter>
        <App />
        {Banner && <Banner />}
      </HashRouter>
    </React.StrictMode>,
  );
}

void boot();
