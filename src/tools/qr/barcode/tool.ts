import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'qr/barcode',
  name: 'Barcode Generator',
  description: 'Create Code 128, EAN, UPC, ITF and Data Matrix codes',
  category: 'qr',
  icon: 'Barcode',
  weight: 60,
  standalone: true,
  keywords: [
    'barcode', 'code 128', 'code 39', 'ean-13', 'ean 13', 'upc', 'upc-a', 'itf-14',
    'codabar', 'data matrix', 'product barcode', 'generate barcode', 'label printing',
    'código de barras',
  ],
  produces: ['png', 'svg'],
  load: () => import('./ui'),
});
