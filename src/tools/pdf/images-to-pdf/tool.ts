import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'pdf/images-to-pdf',
  name: 'Images to PDF',
  description: 'Combine photos into one PDF, in the order you choose',
  category: 'pdf',
  icon: 'FileImage',
  weight: 98,
  keywords: [
    'images to pdf', 'jpg to pdf', 'jpeg to pdf', 'png to pdf', 'heic to pdf', 'photos to pdf',
    'combine images', 'scan to pdf', 'picture to pdf', 'imagenes a pdf', 'fotos a pdf', 'crear pdf',
  ],
  accepts: { kinds: ['image'], extensions: ['jpg', 'jpeg', 'png'] },
  produces: ['pdf'],
  quickLabel: 'Make a PDF from these images',
  load: () => import('./ui'),
});
