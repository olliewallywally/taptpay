import fs from 'node:fs';
import path from 'node:path';
import * as composition from '../route-composition';
import { extractRouteFacts } from '../route-facts';

const root = 'server/routes.ts';
const stock = 'server/domains/stock/routes.ts';
const roots = [{ file: root, name: 'registerRoutes', app: 'app' }];
const registrars = [{ file: stock, name: 'registerStockRoutes', app: 'app' }];
const sources = {
  [root]: `import {registerStockRoutes} from './domains/stock/routes';
    export function registerRoutes(app: Express) {
      app.get('/before', handler);
      registerStockRoutes(app, {storage});
      app.get('/after', handler);
    }`,
  [stock]: `export function registerStockRoutes(app: Express, deps: StockDeps) {
    app.get('/stock/:id', authenticateToken, async (req, res) => {
      const id = strictPositiveIntegerParam(req.params.id);
      if (!checkMerchantOwnership(req, id)) return res.sendStatus(403);
      const item = await storage.getStockItemForMerchant(id, req.user.merchantId);
      await sendEmail({to: 'synthetic@example.test'});
      res.json(stockDto(item));
    });
  }`,
};

function compose(changes: Partial<typeof sources> = {}, modules = registrars) {
  return composition.composeRouteRegistrations({
    sources: { ...sources, ...changes },
    roots,
    registrars: modules,
  });
}

describe('S1 explicit same-app route composition', () => {
  test('follows the actual call position across files', () => {
    expect(
      compose()
        .steps.filter(step => step.kind === 'route')
        .map(step => step.path)
    ).toEqual(['/before', '/stock/:id', '/after']);
    expect(compose().registrations.map(route => route.file)).toEqual([
      root,
      stock,
      root,
    ]);
  });

  test('supports reviewed import aliases without changing paths or order', () => {
    const source = sources[root]
      .replace(
        '{registerStockRoutes}',
        '{registerStockRoutes as registerStock}'
      )
      .replace('registerStockRoutes(app,', 'registerStock(app,');
    expect(
      compose({ [root]: source }).registrations.map(route => route.path)
    ).toEqual(['/before', '/stock/:id', '/after']);
  });

  test('interleaves middleware and routes rather than comparing sets', () => {
    const source = sources[root]
      .replace(
        "app.get('/before', handler);",
        "app.use(firstGuard); app.get('/before', handler);"
      )
      .replace(
        "app.get('/after', handler);",
        "app.use(lastGuard); app.get('/after', handler);"
      );
    expect(
      compose({ [root]: source }).steps.map(step =>
        step.kind === 'route' ? step.path : step.mounts
      )
    ).toEqual(['firstGuard', '/before', '/stock/:id', 'lastGuard', '/after']);
  });

  test('refuses an unlisted file even when its registrar is imported', () => {
    expect(() => compose({}, [])).toThrow(/UNLISTED_ROUTE_SOURCE/);
  });

  test('refuses a listed registrar that is no longer called', () => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          'registerStockRoutes(app, {storage});',
          ''
        ),
      })
    ).toThrow(/UNREACHED_ROUTE_REGISTRAR/);
  });

  test('refuses duplicate registrar invocation', () => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          'registerStockRoutes(app, {storage});',
          'registerStockRoutes(app, {storage}); registerStockRoutes(app, {storage});'
        ),
      })
    ).toThrow(/REPEATED_ROUTE_REGISTRAR/);
  });

  test('refuses duplicate method/path registrations from separate modules', () => {
    expect(() =>
      compose({ [stock]: sources[stock].replace('/stock/:id', '/before') })
    ).toThrow(/DUPLICATE_ROUTE_REGISTRATION/);
  });

  test('refuses a different app rather than assuming it shares the guard', () => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          'registerStockRoutes(app,',
          'registerStockRoutes(otherApp,'
        ),
      })
    ).toThrow(/ROUTE_REGISTRAR_APP_MISMATCH/);
  });

  test.each(['makeDependencies()', 'dependencies', '{...defaults, storage}'])(
    'requires an explicit dependency object: %s',
    value => {
      expect(() =>
        compose({ [root]: sources[root].replace('{storage});', `${value});`) })
      ).toThrow(/UNSUPPORTED_ROUTE_DEPENDENCY_BINDING/);
    }
  );

  test.each([
    'if (enabled) registerStockRoutes(app, {storage});',
    'for (const item of items) registerStockRoutes(app, {storage});',
    'enabled && registerStockRoutes(app, {storage});',
    'const deferred = () => registerStockRoutes(app, {storage});',
  ])('requires review before runtime-dependent assembly: %s', call => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          'registerStockRoutes(app, {storage});',
          call
        ),
      })
    ).toThrow(/CONDITIONAL_ROUTE_REGISTRAR|UNREACHED_ROUTE_REGISTRAR/);
  });

  test('refuses shadowing an approved registrar import', () => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          "app.get('/before', handler);",
          "const registerStockRoutes = otherFunction; app.get('/before', handler);"
        ),
      })
    ).toThrow(/SHADOWED_ROUTE_REGISTRAR/);
  });

  test('refuses destructured shadowing of an approved registrar', () => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          "app.get('/before', handler);",
          "const {registerStockRoutes} = dependencies; app.get('/before', handler);"
        ),
      })
    ).toThrow(/SHADOWED_ROUTE_REGISTRAR/);
  });

  test.each([
    'const indirect = registerStockRoutes; indirect(app, {storage});',
    'const deferred = () => registerStockRoutes(app, {storage});',
  ])(
    'refuses extra indirect/deferred calls even beside a valid call: %s',
    extra => {
      expect(() =>
        compose({
          [root]: sources[root].replace(
            "app.get('/after', handler);",
            extra + " app.get('/after', handler);"
          ),
        })
      ).toThrow(/INDIRECT_ROUTE_REGISTRAR|CONDITIONAL_ROUTE_REGISTRAR/);
    }
  );

  test('refuses a namespace call beside an otherwise valid named call', () => {
    const source =
      "import * as stock from './domains/stock/routes';\n" +
      sources[root].replace(
        "app.get('/after', handler);",
        "stock.registerStockRoutes(app, {storage}); app.get('/after', handler);"
      );
    expect(() => compose({ [root]: source })).toThrow(
      /INDIRECT_ROUTE_REGISTRAR/
    );
  });

  test('refuses asynchronous domain registrar functions', () => {
    expect(() =>
      compose({
        [stock]: sources[stock].replace(
          'export function',
          'export async function'
        ),
      })
    ).toThrow(/ASYNC_ROUTE_REGISTRAR/);
  });

  test.each([
    '',
    'app.get("/early", handler); installAsyncRouteGuard(app);',
    'installAsyncRouteGuard(otherApp);',
  ])('refuses an absent, late or wrong-app async guard: %s', preamble => {
    expect(() =>
      composition.composeRouteRegistrations({
        sources: {
          ...sources,
          [root]: sources[root].replace(
            "app.get('/before', handler);",
            preamble + " app.get('/before', handler);"
          ),
        },
        roots: [{ ...roots[0], guard: 'installAsyncRouteGuard' }],
        registrars,
      })
    ).toThrow(/ROUTE_ASYNC_GUARD_ORDER/);
  });

  test('accepts a guard before every domain invocation on the same app', () => {
    expect(
      composition.composeRouteRegistrations({
        sources: {
          ...sources,
          [root]: sources[root].replace(
            "app.get('/before', handler);",
            "installAsyncRouteGuard(app); app.get('/before', handler);"
          ),
        },
        roots: [{ ...roots[0], guard: 'installAsyncRouteGuard' }],
        registrars,
      }).registrations
    ).toHaveLength(3);
  });

  test('refuses a declaration with hidden registrations outside its reviewed function', () => {
    expect(() =>
      compose({ [stock]: sources[stock] + "\napp.post('/hidden', handler);" })
    ).toThrow(/UNREACHED_SOURCE_REGISTRATION/);
  });

  test('does not mistake a same-line handler registration for boot-time assembly', () => {
    expect(() =>
      compose({
        [root]: sources[root].replace(
          "app.get('/before', handler);",
          "app.get('/before', () => { app.get('/deferred', handler); });"
        ),
      })
    ).toThrow(/DEFERRED_SOURCE_REGISTRATION/);
  });

  test('refuses cycles even when no duplicate path has yet been reached', () => {
    const other = 'server/domains/other/routes.ts';
    expect(() =>
      composition.composeRouteRegistrations({
        roots,
        registrars: [
          ...registrars,
          { file: other, name: 'registerOtherRoutes', app: 'app' },
        ],
        sources: {
          ...sources,
          [stock]:
            "import {registerOtherRoutes} from '../other/routes'; export function registerStockRoutes(app: Express) { registerOtherRoutes(app); }",
          [other]:
            "import {registerStockRoutes} from '../stock/routes'; export function registerOtherRoutes(app: Express) { registerStockRoutes(app); }",
        },
      })
    ).toThrow(/CYCLIC_ROUTE_REGISTRAR/);
  });

  test('guard and effect changes inside a module remain visible to the fact checks', () => {
    const facts = (source: string) =>
      extractRouteFacts(source, stock).get('GET /stock/:id')!;
    const before = facts(sources[stock]);
    expect(before.middleware).toEqual(['authenticateToken']);
    expect(before.authChecks).toContain('checkMerchantOwnership');
    expect(before.storageMethods).toContain('getStockItemForMerchant');
    expect(before.sideEffects).toContain('email: sendEmail');
    expect(
      facts(sources[stock].replace('authenticateToken, ', '')).middleware
    ).not.toEqual(before.middleware);
    expect(
      facts(
        sources[stock].replace(
          'if (!checkMerchantOwnership(req, id)) return res.sendStatus(403);',
          ''
        )
      ).authChecks
    ).not.toEqual(before.authChecks);
    expect(
      facts(
        sources[stock].replace(
          "await sendEmail({to: 'synthetic@example.test'});",
          ''
        )
      ).sideEffects
    ).not.toEqual(before.sideEffects);
  });

  test('ordered comparison detects omissions, multiplicity and reordering', () => {
    const expected = compose().registrations.map(
      ({ method, path: routePath }) => ({ method, path: routePath })
    );
    expect(composition.routeOrderProblems(expected, expected)).toEqual([]);
    expect(
      composition.routeOrderProblems(expected.slice(1), expected)
    ).not.toEqual([]);
    expect(
      composition.routeOrderProblems([...expected, expected[0]], expected)
    ).not.toEqual([]);
    expect(
      composition.routeOrderProblems([...expected].reverse(), expected)
    ).not.toEqual([]);
  });

  test('current composition is the reviewed actual 196-route order', () => {
    const actual = composition.currentRouteComposition().registrations;
    const expected = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'server/route-registration-order.json'),
        'utf8'
      )
    );
    expect(actual).toHaveLength(196);
    expect(composition.routeOrderProblems(actual, expected)).toEqual([]);
  });
});
