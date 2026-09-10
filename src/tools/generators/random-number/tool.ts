import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/random-number',
  name: 'Random Number',
  description: 'Pick numbers in a range, or roll dice like 3d6+2',
  category: 'generators',
  icon: 'Dices',
  weight: 50,
  standalone: true,
  keywords: [
    'random number', 'random', 'dice', 'roll dice', 'd20', '3d6', 'lottery numbers',
    'pick a number', 'raffle', 'sample', 'shuffle numbers', 'número aleatorio',
    'dados', 'sorteo',
  ],
  load: () => import('./ui'),
});
