import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'convert/universal',
  name: 'Universal Converter',
  description: 'Drop any file and pick what it should become',
  category: 'convert',
  icon: 'Repeat',
  weight: 100,
  keywords: [
    'convert', 'file converter', 'change format', 'convert anything', 'any format',
    'heic to jpg', 'mov to mp4', 'mp4 to mp3', 'docx to pdf', 'pdf to jpg', 'pdf to word',
    'batch convert', 'convertir archivo', 'cambiar formato',
  ],
  accepts: {
    kinds: ['image', 'svg', 'video', 'audio', 'pdf', 'document'],
    folders: true,
  },
  produces: [
    'jpg', 'png', 'webp', 'avif', 'tiff', 'bmp', 'gif', 'ico',
    'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v',
    'mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus',
    'pdf', 'docx', 'odt', 'rtf', 'html', 'txt', 'md',
  ],
  quickLabel: 'Convert this file',
  load: () => import('./ui'),
});
