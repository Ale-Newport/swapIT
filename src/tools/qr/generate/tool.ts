import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'qr/generate',
  name: 'QR Code Generator',
  description: 'Make QR codes for links, Wi-Fi, contacts and more',
  category: 'qr',
  icon: 'QrCode',
  weight: 100,
  standalone: true,
  keywords: [
    'qr', 'qr code', 'generate qr', 'create qr', 'wifi qr', 'qr wifi password',
    'vcard', 'contact card qr', 'url to qr', 'qr with logo', 'whatsapp qr',
    'menu qr', 'código qr', 'generar qr',
  ],
  produces: ['png', 'svg', 'pdf'],
  load: () => import('./ui'),
});
