import type { ToolDefinition } from './types';

/**
 * True in the browser build published to GitHub Pages (`npm run build:web`),
 * where the native backend is replaced by `src/web/demoIpc.ts`.
 */
export const WEB_DEMO = import.meta.env.VITE_WEB_DEMO === 'true';

export const RELEASES_URL = 'https://github.com/Ale-Newport/swapIT/releases/latest';

/** Whether this tool can do its job where the app is running right now. */
export function runsHere(tool: Pick<ToolDefinition, 'web'>): boolean {
  return !WEB_DEMO || tool.web === true;
}
