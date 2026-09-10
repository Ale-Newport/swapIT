import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/hash-text',
  name: 'Hash Text',
  description: 'MD5, SHA-1, SHA-256 and SHA-512 of any text at once',
  category: 'developer',
  icon: 'Fingerprint',
  weight: 75,
  standalone: true,
  keywords: [
    'hash', 'md5', 'sha1', 'sha256', 'sha512', 'checksum', 'digest', 'fingerprint',
    'hash text', 'hash string', 'hash de texto', 'suma de verificacion',
  ],
  // No `quickLabel`: this tool hashes typed text, never files — dropped files
  // belong to developer/file-hash, which is the one offered in quick actions.
  load: () => import('./ui'),
});
