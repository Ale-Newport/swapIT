import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'developer/jwt',
  name: 'JWT Decoder',
  description: 'Read the header, claims and expiry of a JSON web token',
  category: 'developer',
  icon: 'KeyRound',
  weight: 88,
  standalone: true,
  keywords: [
    'jwt', 'json web token', 'decode jwt', 'bearer token', 'claims', 'exp', 'expiry',
    'auth token', 'oauth', 'id token', 'access token', 'decodificar jwt', 'token',
  ],
  quickLabel: 'Decode a JWT',
  load: () => import('./ui'),
});
