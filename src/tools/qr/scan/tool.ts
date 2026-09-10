import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'qr/scan',
  name: 'QR Scanner',
  description: 'Read QR codes from images, screenshots or the clipboard',
  category: 'qr',
  icon: 'ScanLine',
  weight: 80,
  standalone: true,
  keywords: [
    'scan qr', 'read qr', 'decode qr', 'qr reader', 'qr from image', 'qr from screenshot',
    'what does this qr say', 'wifi password from qr', 'read vcard', 'escanear qr',
    'leer código qr', 'decodificar qr',
  ],
  accepts: { kinds: ['image'], extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'] },
  quickLabel: 'Scan this for a QR code',
  load: () => import('./ui'),
});
