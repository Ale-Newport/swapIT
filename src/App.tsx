import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DndProvider } from '@/core/dnd';
import { usePrefs } from '@/core/prefs';
import { useSettings } from '@/core/settings';
import { bindProgressEvents, useTaskStore } from '@/core/tasks';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { Sidebar } from '@/components/layout/Sidebar';
import { TaskCenter } from '@/components/layout/TaskCenter';
import { TopBar } from '@/components/layout/TopBar';
import { CategoryPage, FavoritesPage } from '@/routes/CategoryPage';
import { Home, RecentPage } from '@/routes/Home';
import { Onboarding } from '@/routes/Onboarding';
import { SettingsPage } from '@/routes/Settings';
import { RadialPage } from '@/routes/RadialPage';
import { ToolPage } from '@/routes/ToolPage';
import { onAppNavigate } from '@/radial/native';

const LAST_TOOL_KEY = 'toolbox.lastTool';

function Shell() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const setPanelOpen = useTaskStore((s) => s.setPanelOpen);

  // The radial menu (a separate window) asks the main window to open a tool with files loaded.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let disposed = false;
    onAppNavigate(({ route, files }) => navigate(route, { state: files?.length ? { files } : undefined }))
      .then((fn) => (disposed ? fn() : (stop = fn)))
      .catch(() => undefined);
    return () => {
      disposed = true;
      stop?.();
    };
  }, [navigate]);

  // Remember the last tool so the app can reopen it next launch.
  useEffect(() => {
    if (location.pathname.startsWith('/t/')) {
      try {
        localStorage.setItem(LAST_TOOL_KEY, location.pathname);
      } catch {
        /* ignore */
      }
    }
  }, [location.pathname]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (meta && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setPanelOpen(!useTaskStore.getState().panelOpen);
        return;
      }
      if (meta && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void (async () => {
          const picked = await open({ multiple: true });
          if (!picked) return;
          const files = Array.isArray(picked) ? picked : [picked];
          // Home turns a selection into quick actions, which is what ⌘O should do.
          navigate('/', { state: { openFiles: files } });
        })();
        return;
      }
      if (meta && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (location.pathname !== '/') navigate(-1);
        return;
      }
      if (e.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    },
    [navigate, paletteOpen, setPanelOpen, location.pathname],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/recent" element={<RecentPage />} />
            <Route path="/radial" element={<RadialPage />} />
            <Route path="/c/:categoryId" element={<CategoryPage />} />
            <Route path="/t/*" element={<ToolPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <TaskCenter />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

export default function App() {
  const onboarded = usePrefs((s) => s.onboarded);
  const loadSettings = useSettings((s) => s.load);
  const openLastTool = useSettings((s) => s.settings.openLastTool);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    bindProgressEvents();
    void loadSettings().finally(() => setBooted(true));
  }, [loadSettings]);

  useEffect(() => {
    if (!booted || !onboarded || !openLastTool) return;
    if (window.location.hash && window.location.hash !== '#/') return;
    try {
      const last = localStorage.getItem(LAST_TOOL_KEY);
      if (last) window.location.hash = `#${last}`;
    } catch {
      /* ignore */
    }
    // Only on the first boot of a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted]);

  return (
    <DndProvider>{!onboarded ? <Onboarding /> : <Shell />}</DndProvider>
  );
}
