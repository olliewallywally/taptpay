import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { currentRouteFacts } from '../route-facts';

describe('S1 retained factory facts follow the real registration file', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-s1-facts-'));
    fs.mkdirSync(path.join(directory, 'server'));
    const files = {
      'app.ts': `export function createApp() {
        const app = express();
        const retailCheckoutHandlers = createRetailCheckoutHandlers({checkRateLimit: async () => {
          if (!await storage.consumeCheckoutLimit()) return res.sendStatus(429);
        }});
        app.post('/fixture/session', retailCheckoutHandlers.session(true));
        return app;
      }`,
      'routes.ts':
        'export function registerRoutes(app: Express) { installAsyncRouteGuard(app); }',
      'index.ts': 'export {};',
      'vite.ts': 'export {};',
      'auth.ts':
        'export function authenticateToken(req, res, next) { if (!req.user) return res.sendStatus(401); next(); }',
      'payment-checkout-handlers.ts': `export function createRetailCheckoutHandlers() {
        const session = (token: boolean) => async (req, res) => {
          const id = strictPositiveIntegerParam(req.params.id);
          if (!checkMerchantOwnership(req, id)) return res.sendStatus(403);
          await storage.claimPaymentAttempt(id);
          await sendEmail({to: 'synthetic@example.test'});
          res.status(202).json(paymentDto({}));
        };
        return {session};
      }`,
    };
    for (const [name, source] of Object.entries(files))
      fs.writeFileSync(path.join(directory, 'server', name), source);
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('moving a retained factory out of routes.ts preserves the actual handler and injected limiter facts', () => {
    const facts = currentRouteFacts(directory).get('POST /fixture/session')!;
    expect(facts.authChecks).toContain('checkMerchantOwnership');
    expect(facts.params).toContain('id: strictPositiveIntegerParam');
    expect(facts.storageMethods).toEqual(
      expect.arrayContaining(['claimPaymentAttempt', 'consumeCheckoutLimit'])
    );
    expect(facts.sideEffects).toContain('email: sendEmail');
    expect(facts.statuses).toEqual(expect.arrayContaining([202, 403, 429]));
    expect(facts.dtos).toContain('paymentDto');
  });

  test('a removed provider-handler guard/effect is not hidden by the factory wrapper', () => {
    const file = path.join(directory, 'server/payment-checkout-handlers.ts');
    const source = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(
      file,
      source
        .replace(
          'if (!checkMerchantOwnership(req, id)) return res.sendStatus(403);',
          ''
        )
        .replace("await sendEmail({to: 'synthetic@example.test'});", '')
    );
    const facts = currentRouteFacts(directory).get('POST /fixture/session')!;
    expect(facts.authChecks).not.toContain('checkMerchantOwnership');
    expect(facts.sideEffects).not.toContain('email: sendEmail');
    expect(facts.storageMethods).toContain('claimPaymentAttempt');
  });

  test('a retained handler without its actual factory binding refuses analysis', () => {
    const file = path.join(directory, 'server/app.ts');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace('createRetailCheckoutHandlers(', 'unreviewedFactory(')
    );
    expect(() => currentRouteFacts(directory)).toThrow(
      /retained_payment_factory_drift/
    );
  });
});
