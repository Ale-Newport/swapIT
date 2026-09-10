import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'video/watermark',
  name: 'Video Watermark',
  description: 'Burn a logo or line of text into video, placed and scaled',
  category: 'video',
  icon: 'Stamp',
  weight: 50,
  requires: ['ffmpeg'],
  keywords: [
    'watermark', 'logo', 'overlay', 'add logo to video', 'brand video', 'branding', 'copyright',
    'text overlay', 'stamp', 'marca de agua', 'poner logo', 'firma video',
  ],
  accepts: { kinds: ['video'], extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] },
  produces: ['mp4', 'mov', 'mkv', 'webm'],
  quickLabel: 'Add a watermark',
  load: () => import('./ui'),
});
