import {
  detectGateMarkers,
  extractSourceInventory,
  sliceHandlerBodies,
} from '../route-inventory';

const source = `export function registerRoutes(app: Express) {
  app.get('/refunds', authenticateToken, async (req, res) => res.json([]));
  registerStockRoutes(app, {});
  const authenticateApiKey = (req, res, next) => next();
  app.post('/api-key', authenticateApiKey, async (req, res) => res.json({}));
}`;

describe('policy marker windows stop at reviewed domain calls', () => {
  const registrations = extractSourceInventory(source, 'server/routes.ts').registrations;

  test('a preceding route cannot inherit authentication from beyond a domain call', () => {
    const bodies = sliceHandlerBodies(source, registrations, [3]);
    expect(detectGateMarkers(bodies[0])).toContain('authenticateToken');
    expect(detectGateMarkers(bodies[0])).not.toContain('authenticateApiKey');
    expect(bodies[0]).not.toContain('registerStockRoutes');
  });

  test('the later route still carries its actual API-key gate', () => {
    const bodies = sliceHandlerBodies(source, registrations, [3]);
    expect(detectGateMarkers(bodies[1])).toContain('authenticateApiKey');
  });

  test('an earlier boundary cannot truncate a subsequent registration', () => {
    const bodies = sliceHandlerBodies(source, registrations, [1, 3]);
    expect(bodies[0]).toContain("app.get('/refunds'");
    expect(bodies[1]).toContain("app.post('/api-key'");
  });
});
