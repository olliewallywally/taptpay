import { composeRouteRegistrations } from '../route-composition';
import { routeFunctionResolver } from '../route-analysis-functions';
import { extractRouteFacts } from '../route-facts';

const root = 'server/routes.ts';
const stock = 'server/domains/stock/routes.ts';
const rootSource = `import {registerStockRoutes} from './domains/stock/routes';
  export function checkMerchantOwnership(req, id) { return storage.getMerchantForUser(id, req.user.merchantId); }
  export function notify() { throw Error('source must never execute'); sendEmail({to: 'synthetic@example.test'}); }
  export function registerRoutes(app: Express) { registerStockRoutes(app, {checkMerchantOwnership, notify}); }`;

function facts(source: string, parent = rootSource) {
  const composition = composeRouteRegistrations({
    sources: { [root]: parent, [stock]: source },
    roots: [{ file: root, name: 'registerRoutes', app: 'app' }],
    registrars: [{ file: stock, name: 'registerStockRoutes', app: 'app' }],
  });
  const sourceFile = composition.sourceFiles.get(stock)!;
  return extractRouteFacts(source, stock, {
    sourceFile,
    resolveFunction: routeFunctionResolver(composition),
  }).get('GET /stock/:id')!;
}

describe('S1 helper facts across approved source boundaries', () => {
  test.each([
    [
      'destructured parameter',
      '{checkMerchantOwnership, notify}',
      '',
      'checkMerchantOwnership',
      'notify',
    ],
    [
      'literal bag',
      'deps',
      'const {checkMerchantOwnership, notify} = deps;',
      'checkMerchantOwnership',
      'notify',
    ],
    [
      'named property calls',
      'deps',
      '',
      'deps.checkMerchantOwnership',
      'deps.notify',
    ],
    [
      'aliased local binding',
      'deps',
      'const {checkMerchantOwnership, notify: announce} = deps;',
      'checkMerchantOwnership',
      'announce',
    ],
  ])(
    'follows original guard/effect functions through %s without executing them',
    (_name, parameter, preamble, guard, notify) => {
      const result =
        facts(`export function registerStockRoutes(app: Express, ${parameter}: Deps) {
      ${preamble}
      app.get('/stock/:id', authenticateToken, (req, res) => {
        if (!${guard}(req, req.params.id)) return res.sendStatus(403);
        ${notify}(); res.json({ok: true});
      });
    }`);
      expect(result.authChecks).toContain('checkMerchantOwnership');
      expect(result.storageMethods).toContain('getMerchantForUser');
      expect(result.sideEffects).toContain('email: sendEmail');
    }
  );

  test('reads an explicitly available named helper import from the actual source', () => {
    const result =
      facts(`import {checkMerchantOwnership, notify as announce} from '../../routes';
      export function registerStockRoutes(app: Express) {
        app.get('/stock/:id', authenticateToken, (req, res) => {
          if (!checkMerchantOwnership(req, req.params.id)) return res.sendStatus(403);
          announce(); res.json({ok: true});
        });
      }`);
    expect(result.storageMethods).toContain('getMerchantForUser');
    expect(result.sideEffects).toContain('email: sendEmail');
  });

  test('local shadowing does not falsely attribute an outer helper effect', () => {
    const result =
      facts(`export function registerStockRoutes(app: Express, deps: Deps) {
      const notify = () => false;
      app.get('/stock/:id', (_req, res) => { notify(); res.json({ok: true}); });
    }`);
    expect(result.sideEffects).not.toContain('email: sendEmail');
  });

  test.each([
    '{...other, checkMerchantOwnership, notify}',
    '{checkMerchantOwnership, get notify() { return different; }}',
    '{checkMerchantOwnership, notify, notify: other}',
  ])(
    'refuses ambiguous dependency objects rather than losing effects: %s',
    bag => {
      expect(() =>
        facts(
          `export function registerStockRoutes(app: Express, deps: Deps) {
      app.get('/stock/:id', (_req, res) => { deps.notify(); res.json({ok: true}); });
    }`,
          rootSource.replace('{checkMerchantOwnership, notify});', `${bag});`)
        )
      ).toThrow(
        /UNSUPPORTED_ROUTE_DEPENDENCY_BINDING|DUPLICATE_ROUTE_DEPENDENCY/
      );
    }
  );

  test('removing an injected helper body changes the recorded effects', () => {
    const source = `export function registerStockRoutes(app: Express, deps: Deps) {
      app.get('/stock/:id', (_req, res) => { deps.notify(); res.json({ok: true}); });
    }`;
    expect(facts(source).sideEffects).toContain('email: sendEmail');
    expect(
      facts(
        source,
        rootSource.replace("sendEmail({to: 'synthetic@example.test'});", '')
      ).sideEffects
    ).not.toContain('email: sendEmail');
  });
});
