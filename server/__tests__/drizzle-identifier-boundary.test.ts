import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

test('the actual PostgreSQL compiler keeps a quoted identifier inside one identifier', () => {
  const query = new PgDialect().sqlToQuery(
    sql`SELECT ${sql.identifier('name"; DROP TABLE synthetic; --')}`
  );
  expect(query.sql).toBe('SELECT "name""; DROP TABLE synthetic; --"');
  expect(query.params).toEqual([]);
});

test('the actual PostgreSQL compiler keeps untrusted values as parameters', () => {
  const value = "synthetic'; DROP TABLE synthetic; --";
  const query = new PgDialect().sqlToQuery(sql`SELECT ${value}`);
  expect(query.sql).toBe('SELECT $1');
  expect(query.params).toEqual([value]);
});
