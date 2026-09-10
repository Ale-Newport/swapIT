import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'capture/ocr',
  name: 'Image or PDF to Text',
  description: 'Read the text out of pictures, screenshots and scans',
  category: 'capture',
  icon: 'ScanText',
  weight: 80,
  // Poppler (`pdftoppm`) is only needed to turn PDF pages into images, so it is
  // checked inside the tool when a PDF is actually selected — listing it here
  // would replace the whole tool with an install card for image work too.
  requires: ['tesseract'],
  keywords: [
    'ocr', 'image to text', 'read text from image', 'screenshot to text', 'scanned pdf',
    'extract text', 'tesseract', 'text recognition', 'photo to text', 'searchable',
    'reconocer texto', 'texto de imagen', 'escanear a texto',
  ],
  // Exact extensions only: Leptonica reads these and nothing else, so the broad
  // `image` kind would let HEIC/HEIF/AVIF through to a raw Tesseract failure.
  accepts: {
    kinds: ['pdf'],
    extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp', 'gif', 'pdf'],
  },
  produces: ['txt'],
  quickLabel: 'Read the text in this file',
  load: () => import('./ui'),
});
