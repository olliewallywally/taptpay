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

/** S2 adds an exact file/export only after its concrete extraction review. */
export const DOMAIN_ROUTE_REGISTRARS =
  [] as const satisfies readonly RouteRegistrar[];
