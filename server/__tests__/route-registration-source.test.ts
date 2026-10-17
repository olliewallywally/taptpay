import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRouteRegistrationSource } from '../route-inventory';

describe('S1 source assertions locate real modular handlers', () => {
  let directory: string;
  const files = ['server/root.ts', 'server/stock.ts'];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'taptpay-s1-handler-'));
    fs.mkdirSync(path.join(directory, 'server'));
    fs.writeFileSync(
      path.join(directory, files[0]),
      "app.get('/other', (_req,res) => res.json({secretMarker: true}));"
    );
    fs.writeFileSync(
      path.join(directory, files[1]),
      `export function registerStock(app: Express) {
      app.get('/stock', authenticateToken, (_req,res) => res.json({ok: true}));
      // A neighbour must not satisfy the previous handler's assertion.
      app.post('/stock', (_req,res) => res.json({secretMarker: true}));
    }`
    );
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  test('selects the module and the exact AST registration, excluding neighbours', () => {
    const actual = readRouteRegistrationSource(
      'GET',
      '/stock',
      directory,
      files
    );
    expect(actual.file).toBe('server/stock.ts');
    expect(actual.registration).toContain('authenticateToken');
    expect(actual.registration).not.toContain('secretMarker');
    expect(actual.registration).not.toContain('neighbour');
  });
  test('a missing registration refuses rather than falling back to other source', () => {
    expect(() =>
      readRouteRegistrationSource('GET', '/missing', directory, files)
    ).toThrow('MISSING_ROUTE_SOURCE');
  });
  test('two matching source registrations refuse instead of choosing one', () => {
    fs.appendFileSync(
      path.join(directory, files[0]),
      "app.get('/stock', unguarded);"
    );
    expect(() =>
      readRouteRegistrationSource('GET', '/stock', directory, files)
    ).toThrow('DUPLICATE_ROUTE_SOURCE');
  });
});
