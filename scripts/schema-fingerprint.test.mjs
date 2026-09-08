import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUERIES, buildFingerprint, canonicalJson, canonicalise, collectSchema,
  connectionSettings, digestOf, fingerprintDocument, runFingerprint, serialise,
} from './schema-fingerprint.mjs';

// Synthetic catalogue rows shaped like the real column aliases. No live
// database is opened anywhere in this file.
const CATALOGUE = Object.freeze({
  tables: [
    { name: 'transactions', kind: 'r', persistence: 'p', rowSecurity: false, forceRowSecurity: false },
    { name: 'merchants', kind: 'r', persistence: 'p', rowSecurity: false, forceRowSecurity: false },
  ],
  sequences: [{ name: 'merchants_id_seq' }, { name: 'transactions_merchant_id_seq' }],
  columns: [
    { table: 'merchants', name: 'id', position: 1, type: 'integer', udtName: 'int4', nullable: false,
      default: "nextval('merchants_id_seq'::regclass)", identity: null, generated: null, collation: null,
      maxLength: null, numericPrecision: 32, numericScale: 0, datetimePrecision: null },
    { table: 'merchants', name: 'email', position: 2, type: 'character varying(255)', udtName: 'varchar',
      nullable: false, default: null, identity: null, generated: null, collation: null,
      maxLength: 255, numericPrecision: null, numericScale: null, datetimePrecision: null },
    { table: 'transactions', name: 'id', position: 1, type: 'integer', udtName: 'int4', nullable: false,
      default: null, identity: 'a', generated: null, collation: null,
      maxLength: null, numericPrecision: 32, numericScale: 0, datetimePrecision: null },
    // The known latent defect: a foreign-key column carrying its own sequence.
    { table: 'transactions', name: 'merchant_id', position: 2, type: 'integer', udtName: 'int4',
      nullable: false, default: "nextval('transactions_merchant_id_seq'::regclass)", identity: null,
      generated: null, collation: null, maxLength: null, numericPrecision: 32, numericScale: 0,
      datetimePrecision: null },
    { table: 'transactions', name: 'amount', position: 3, type: 'numeric(10,2)', udtName: 'numeric',
      nullable: true, default: null, identity: null, generated: null, collation: null,
      maxLength: null, numericPrecision: 10, numericScale: 2, datetimePrecision: null },
  ],
  constraints: [
    { table: 'merchants', name: 'merchants_pkey', type: 'p', definition: 'PRIMARY KEY (id)',
      validated: true, deferrable: false, deferred: false },
    { table: 'merchants', name: 'merchants_email_key', type: 'u', definition: 'UNIQUE (email)',
      validated: true, deferrable: false, deferred: false },
    { table: 'transactions', name: 'transactions_amount_check', type: 'c',
      definition: 'CHECK ((amount >= (0)::numeric))', validated: true, deferrable: false, deferred: false },
    { table: 'transactions', name: 'transactions_merchant_id_fkey', type: 'f',
      definition: 'FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE',
      validated: true, deferrable: false, deferred: false },
  ],
  foreignKeys: [
    { table: 'transactions', name: 'transactions_merchant_id_fkey', columns: ['merchant_id'],
      referencedSchema: 'public', referencedTable: 'merchants', referencedColumns: ['id'],
      onUpdate: 'a', onDelete: 'c', match: 's', validated: true, deferrable: false, deferred: false },
  ],
  indexes: [
    { table: 'transactions', name: 'transactions_pkey', definition: 'CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (id)',
      unique: true, primaryKey: true, valid: true },
    { table: 'merchants', name: 'merchants_pkey', definition: 'CREATE UNIQUE INDEX merchants_pkey ON public.merchants USING btree (id)',
      unique: true, primaryKey: true, valid: true },
  ],
});

// Reversal is a deterministic reordering: a flaky shuffle would make a
// determinism test unreproducible, which is the opposite of the point.
const reordered = (catalogue) => Object.fromEntries(
  Object.entries(catalogue).map(([name, rows]) => [name, [...rows].reverse()]));

function fakeClient(catalogue, { failOn } = {}) {
  const seen = [];
  return {
    seen,
    async query(sql) {
      seen.push(sql);
      // A driver message on a real target carries the host and database.
      if (failOn && sql.includes(failOn)) throw new Error('relation error at db.internal:5432/live_payments');
      const name = Object.entries(QUERIES).find(([, statement]) => statement === sql)?.[0];
      return { rows: name ? catalogue[name] : [] };
    },
    async end() { seen.push('-- end'); },
  };
}

test('catalogue statements read only pg_catalog and information_schema', () => {
  for (const [name, sql] of Object.entries(QUERIES)) {
    const relations = [...sql.matchAll(/\b(?:from|join)\s+([^\s(]+)/gi)].map((match) => match[1]);
    assert.ok(relations.length > 0, `${name} reads nothing`);
    for (const relation of relations) {
      assert.ok(/^(?:pg_catalog|information_schema)\./.test(relation), `${name} reads ${relation}`);
    }
    assert.doesNotMatch(sql, /\b(?:insert|update|delete|create|alter|drop|truncate)\b/i);
  }
});

test('canonical JSON sorts keys recursively and ignores insertion order', () => {
  const one = { b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } };
  const other = { a: { c: 3, d: [{ y: 2, z: 1 }] }, b: 1 };
  assert.equal(canonicalJson(one), canonicalJson(other));
  assert.equal(canonicalJson(one), '{"a":{"c":3,"d":[{"y":2,"z":1}]},"b":1}');
  // Array order is content, not key order, and must survive untouched.
  assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }));
});

test('undefined fields become explicit nulls instead of vanishing', () => {
  assert.deepEqual(canonicalise({ a: undefined, b: [undefined] }), { a: null, b: [null] });
  assert.equal(canonicalJson({ a: undefined }), '{"a":null}');
  assert.notEqual(canonicalJson({ a: undefined }), canonicalJson({}));
});

test('shuffled catalogue rows produce byte-identical output and one digest', () => {
  const first = fingerprintDocument(CATALOGUE);
  const second = fingerprintDocument(reordered(CATALOGUE));
  assert.equal(serialise(first), serialise(second));
  assert.equal(first.digest, second.digest);
  assert.equal(first.digest, digestOf(first.fingerprint));
  assert.equal(serialise(first), serialise(fingerprintDocument(CATALOGUE)));
  assert.match(first.digest, /^sha256:[0-9a-f]{64}$/);
});

test('the digest is pinned so a shape change cannot silently invalidate recorded evidence', () => {
  assert.equal(fingerprintDocument(CATALOGUE).digest,
    'sha256:1df762c48c44045fed8e63d720603bd19e8899b6999b07753206bd8a5e8fbd09');
});

test('a changed default, action or definition changes the digest', () => {
  const baseline = fingerprintDocument(CATALOGUE).digest;
  const mutations = [
    { columns: CATALOGUE.columns.map((row) => (row.name === 'merchant_id' ? { ...row, default: null } : row)) },
    { foreignKeys: CATALOGUE.foreignKeys.map((row) => ({ ...row, onDelete: 'a' })) },
    { indexes: CATALOGUE.indexes.map((row) => ({ ...row, unique: false })) },
    { columns: CATALOGUE.columns.map((row) => ({ ...row, nullable: true })) },
    { columns: CATALOGUE.columns.map((row) => (row.name === 'amount' ? { ...row, numericScale: 4 } : row)) },
  ];
  for (const mutation of mutations) {
    assert.notEqual(fingerprintDocument({ ...CATALOGUE, ...mutation }).digest, baseline);
  }
});

test('foreign-key column defaults are recorded verbatim, never normalised away', () => {
  const { fingerprint } = fingerprintDocument(CATALOGUE);
  assert.deepEqual(fingerprint.foreignKeyColumnDefaults, [{
    table: 'transactions', column: 'merchant_id', constraint: 'transactions_merchant_id_fkey',
    default: "nextval('transactions_merchant_id_seq'::regclass)",
  }]);
  const column = fingerprint.columns.find((row) => row.table === 'transactions' && row.name === 'merchant_id');
  assert.equal(column.default, "nextval('transactions_merchant_id_seq'::regclass)");
});

test('an unparsed array literal stops the run instead of becoming character columns', () => {
  // node-postgres has no parser for name[] and returns the literal "{merchant_id}".
  // Spreading that string produced thirteen single-character "columns" and a
  // confident, wrong fingerprint; the queries now cast to text[] and the builder
  // refuses anything that is not an array.
  for (const field of ['columns', 'referencedColumns']) {
    assert.throws(() => buildFingerprint({ ...CATALOGUE,
      foreignKeys: [{ ...CATALOGUE.foreignKeys[0], [field]: '{merchant_id}' }],
    }), /FINGERPRINT_UNEXPECTED_ROW_SHAPE/);
  }
  for (const sql of [QUERIES.foreignKeys]) {
    assert.equal((sql.match(/a\.attname::text/g) ?? []).length, 2, 'name[] must be cast to text[]');
  }
});

test('catalogue codes are decoded and unknown ones stay visible', () => {
  const { fingerprint } = fingerprintDocument(CATALOGUE);
  assert.deepEqual(fingerprint.foreignKeys[0].onDelete, 'CASCADE');
  assert.deepEqual(fingerprint.foreignKeys[0].onUpdate, 'NO ACTION');
  assert.deepEqual(fingerprint.foreignKeys[0].match, 'SIMPLE');
  assert.deepEqual(fingerprint.constraints.map((row) => row.type).sort(),
    ['check', 'foreign key', 'primary key', 'unique']);
  assert.equal(fingerprint.columns.find((row) => row.table === 'transactions' && row.name === 'id').identity, 'always');
  const unknown = buildFingerprint({ ...CATALOGUE, foreignKeys: [{ ...CATALOGUE.foreignKeys[0], onDelete: 'x' }] });
  assert.equal(unknown.foreignKeys[0].onDelete, 'unknown(x)');
});

test('counts summarise exactly the collections they name', () => {
  const { counts, ...body } = buildFingerprint(CATALOGUE);
  for (const key of ['tables', 'sequences', 'columns', 'constraints', 'foreignKeys', 'indexes', 'foreignKeyColumnDefaults']) {
    assert.equal(counts[key], body[key].length, key);
  }
  assert.equal(counts.primaryKeyConstraints + counts.uniqueConstraints + counts.checkConstraints
    + counts.foreignKeyConstraints, counts.constraints);
  assert.equal(buildFingerprint({}).counts.tables, 0);
});

test('rows are ordered by name so a position change is a value, not a reordering', () => {
  const { columns } = buildFingerprint(CATALOGUE);
  assert.deepEqual(columns.map((row) => `${row.table}.${row.name}`),
    ['merchants.email', 'merchants.id', 'transactions.amount', 'transactions.id', 'transactions.merchant_id']);
  const moved = buildFingerprint({ ...CATALOGUE,
    columns: CATALOGUE.columns.map((row) => (row.table === 'transactions' ? { ...row, position: row.position + 1 } : row)) });
  assert.deepEqual(moved.columns.map((row) => `${row.table}.${row.name}`),
    columns.map((row) => `${row.table}.${row.name}`));
  assert.notEqual(canonicalJson(moved), canonicalJson(buildFingerprint(CATALOGUE)));
});

test('ambient database URLs cannot supply the fingerprint connection', () => {
  const live = 'postgresql://app:secret@db.internal:5432/live_payments';
  for (const env of [{}, { DATABASE_URL: live }, { NEON_DATABASE_URL: live, PGDATABASE: 'live_payments' },
    { FINGERPRINT_DATABASE_URL: '' }]) {
    assert.throws(() => connectionSettings(env), /FINGERPRINT_INVALID_CONNECTION/);
  }
});

test('malformed URIs and libpq redirects are refused before the driver is imported', () => {
  const base = 'postgresql://fixture@127.0.0.1:55432/fingerprint_fixture';
  for (const invalid of ['not-a-url', 'mysql://fixture@127.0.0.1/x', `${base}#fragment`,
    `${base}?host=db.internal`, `${base}?dbname=live_payments`, `${base}?service=production`,
    `${base}?options=-csearch_path%3Devil`, `${base}?passfile=/etc/passwd`,
    `${base}?sslmode=disable&sslmode=verify-full`, `${base}?sslmode=maybe`,
    `${base}?connect_timeout=0`, `${base}?connect_timeout=999`, `${base}?connect_timeout=1abc`,
    'postgresql://fixture@%2Fvar%2Frun%2Fpostgresql/fingerprint_fixture',
    'postgresql://fixture@127.0.0.1:55432/']) {
    assert.throws(() => connectionSettings({ FINGERPRINT_DATABASE_URL: invalid }), /FINGERPRINT_INVALID_CONNECTION/, invalid);
  }
  assert.deepEqual(connectionSettings({ FINGERPRINT_DATABASE_URL: base }), {
    host: '127.0.0.1', port: 55432, user: 'fixture', password: undefined,
    database: 'fingerprint_fixture', ssl: false,
  });
  assert.deepEqual(connectionSettings({ FINGERPRINT_DATABASE_URL: `${base}?sslmode=verify-full` }).ssl,
    { rejectUnauthorized: true });
});

test('collection runs inside one read-only snapshot before any catalogue statement', async () => {
  const client = fakeClient(CATALOGUE);
  const rows = await collectSchema(client);
  assert.deepEqual(Object.keys(rows).sort(), Object.keys(QUERIES).sort());
  assert.match(client.seen[0], /^BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY$/);
  assert.equal(client.seen.at(-1), 'ROLLBACK');
  for (const sql of Object.values(QUERIES)) {
    assert.ok(client.seen.indexOf(sql) > client.seen.indexOf("SET LOCAL statement_timeout = '60s'"));
  }
});

test('the command emits the document on stdout and one comparable line on stderr', async () => {
  const written = [];
  const logged = [];
  const client = fakeClient(CATALOGUE);
  const document = await runFingerprint([], {
    env: { FINGERPRINT_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55432/fingerprint_fixture' },
    connect: async () => client,
    out: { write: (chunk) => written.push(chunk) },
    log: { write: (chunk) => logged.push(chunk) },
  });
  assert.equal(written.join(''), serialise(document));
  assert.equal(JSON.parse(written.join('')).digest, document.digest);
  assert.equal(logged.length, 1);
  assert.match(logged[0], new RegExp(`^SCHEMA_FINGERPRINT ${document.digest} .*tables=2 .*columns=5`));
  assert.equal(client.seen.at(-1), '-- end');
});

test('arguments are refused and driver errors never reach the caller', async () => {
  const env = { FINGERPRINT_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55432/fingerprint_fixture' };
  const overrides = { env, connect: async () => fakeClient(CATALOGUE), out: { write() {} }, log: { write() {} } };
  await assert.rejects(runFingerprint(['--out', 'x'], overrides), /FINGERPRINT_INVALID_ARGUMENTS/);
  await assert.rejects(runFingerprint([], { ...overrides, connect: async () => { throw new Error('ECONNREFUSED db.internal:5432'); } }),
    (error) => error.message === 'FINGERPRINT_CONNECT_FAILED');
  await assert.rejects(runFingerprint([], { ...overrides, connect: async () => fakeClient(CATALOGUE, { failOn: 'pg_constraint' }) }),
    (error) => error.message === 'FINGERPRINT_QUERY_FAILED');
});
