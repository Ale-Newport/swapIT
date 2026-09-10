import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/reverse',
  name: 'Reverse Video',
  description: 'Play a clip backwards, with reversed or removed audio',
  category: 'video',
  icon: 'Rewind',
  weight: 45,
  requires: ['ffmpeg'],
  keywords: [
    'reverse', 'reverse video', 'backwards', 'play backwards', 'rewind', 'boomerang',
    'invertir video', 'video al reves', 'reproducir al reves', 'reverse clip', 'backward',
  ],
  accepts: { kinds: ['video'], extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'], multiple: false },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Play it backwards',
  load: () => import('./ui'),
});
