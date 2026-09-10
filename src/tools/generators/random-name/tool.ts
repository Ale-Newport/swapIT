import { defineTool } from '@/core/registry';

export default defineTool({
  id: 'generators/random-name',
  name: 'Random Name',
  description: 'Names for placeholders, plus project codenames',
  category: 'generators',
  icon: 'UserRound',
  weight: 35,
  standalone: true,
  keywords: [
    'random name', 'name generator', 'fake name', 'character name', 'codename', 'project name',
    'branch name', 'username ideas', 'nombre aleatorio', 'generador de nombres', 'apellidos',
  ],
  load: () => import('./ui'),
});
