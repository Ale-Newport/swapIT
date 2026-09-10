import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'audio/silence',
  name: 'Generate Silence',
  description: 'Create a silent audio file of any length',
  category: 'audio',
  icon: 'Volume',
  weight: 30,
  requires: ['ffmpeg'],
  standalone: true,
  keywords: [
    'silent audio',
    'blank audio',
    'silence mp3',
    'empty track',
    'gap',
    'padding',
    'placeholder audio',
    'test file',
    'generar silencio',
    'audio en blanco',
    'silencio mp3',
  ],
  produces: ['mp3', 'wav', 'm4a', 'flac'],
  load: () => import('./ui'),
});
