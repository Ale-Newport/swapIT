import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'files/metadata',
  name: 'File Metadata',
  description: 'Type, size, dates and embedded tags for any batch of files',
  category: 'files',
  icon: 'Info',
  weight: 50,
  keywords: [
    'metadata', 'file info', 'exif', 'mime type', 'created date', 'modified date',
    'file details', 'properties', 'metadatos', 'propiedades', 'información del archivo',
    'file size', 'tags',
  ],
  accepts: {},
  quickLabel: 'Show file details',
  load: () => import('./ui'),
});
