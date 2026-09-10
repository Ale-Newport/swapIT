import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/password',
  name: 'Password Generator',
  description: 'Strong random passwords and passphrases, with entropy',
  category: 'generators',
  icon: 'KeyRound',
  weight: 90,
  standalone: true,
  keywords: [
    'password', 'password generator', 'strong password', 'random password', 'passphrase',
    'diceware', 'secure password', 'entropy', 'memorable password', 'pin', 'secret',
    'contraseña', 'generar contraseña', 'clave segura',
  ],
  load: () => import('./ui'),
});
