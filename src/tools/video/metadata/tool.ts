import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/metadata',
  name: 'Video Metadata',
  description: 'Read codecs, resolution, bitrate and streams',
  category: 'video',
  icon: 'Info',
  weight: 40,
  requires: ['ffprobe'],
  keywords: [
    'video info', 'metadata', 'codec', 'resolution', 'bitrate', 'frame rate', 'fps', 'streams',
    'ffprobe', 'what codec is this', 'video properties', 'informacion de video', 'propiedades',
  ],
  accepts: { kinds: ['video'] },
  quickLabel: 'Inspect this video',
  load: () => import('./ui'),
});
