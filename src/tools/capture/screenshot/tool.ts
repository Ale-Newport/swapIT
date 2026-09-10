import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'capture/screenshot',
  name: 'Screenshot',
  description: 'Capture a selection, a window or the whole screen',
  category: 'capture',
  icon: 'Camera',
  weight: 70,
  standalone: true,
  keywords: [
    'screenshot', 'screen capture', 'capture screen', 'screen grab', 'window shot',
    'print screen', 'snip', 'region capture', 'grab a window', 'captura de pantalla',
    'pantallazo', 'capturar pantalla',
  ],
  produces: ['png'],
  load: () => import('./ui'),
});
