import { index, route, type RouteConfig } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('resources', 'routes/directory.tsx'),
  route('resources/:id', 'routes/resource.tsx'),
  route('about', 'routes/about.tsx'),
  route('404.html', 'routes/not-found.tsx', { id: 'static404' }),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
