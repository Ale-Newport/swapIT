import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// The webview is a native window: browser context menus and text-drag get in the way.
document.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('input, textarea, [contenteditable], .selectable')) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
