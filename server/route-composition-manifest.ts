/** Reviewed source-analysis entrypoints, not a runtime router or service locator. */
export interface RouteRegistrar {
  file: string;
  name: string;
  app: string;
  guard?: string;
}

export const HARNESS_ROUTE_ROOTS = [
  { file: 'server/app.ts', name: 'createApp', app: 'app' },
  {
    file: 'server/routes.ts',
    name: 'registerRoutes',
    app: 'app',
    guard: 'installAsyncRouteGuard',
  },
] as const satisfies readonly RouteRegistrar[];

/** Each domain file/export is reviewed with its actual composition call. */
export const DOMAIN_ROUTE_REGISTRARS = [
  { file: 'server/domains/stock/routes.ts', name: 'registerStockRoutes', app: 'app' },
] as const satisfies readonly RouteRegistrar[];
