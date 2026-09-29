import {
  MigrationExecutionError,
  MigrationSafetyError,
  applyMigration,
  describeDatabaseError,
  redactedFailureText,
  type MigrationClient,
} from '../migrate';

/**
 * A driver error shaped like the ones `pg` actually throws. The message carries
 * a row value, which is the whole point: PostgreSQL puts offending data into the
 * message text for a large class of errors (invalid input syntax, check
 * constraint violations, range errors), and the first thing an operator does
 * with a failure is paste it into a chat window.
 */
const ROW_VALUE = 'alice@customer.example';
function driverError(): Error {
  return Object.assign(
    new Error(`invalid input syntax for type integer: "${ROW_VALUE}"`),
    {
      code: '22P02',
      schema: 'public',
      table: 'transactions',
      column: 'merchant_id',
      constraint: 'transactions_merchant_id_fkey',
      routine: 'pg_strtoint32',
      detail: `Key (email)=(${ROW_VALUE}) already exists.`,
      where: `PL/pgSQL function inline_code_block line 3 at SQL statement`,
    },
  );
}

/** Every string a redacted error is allowed to expose, and nothing else. */
function assertNoRowData(text: string): void {
  expect(text).not.toContain(ROW_VALUE);
  expect(text).not.toContain('invalid input syntax');
  expect(text).not.toContain('Key (email)');
  expect(text).not.toContain('inline_code_block');
}

describe('migration error redaction', () => {
  it('does not carry the driver message, detail or context into the error text', () => {
    const error = new MigrationExecutionError('0007_add_index.sql', 42, driverError());
    assertNoRowData(error.message);
  });

  it('still names the migration, the line and the SQLSTATE so a failure is actionable', () => {
    const error = new MigrationExecutionError('0007_add_index.sql', 42, driverError());
    expect(error.message).toContain('0007_add_index.sql');
    expect(error.message).toContain('42');
    expect(error.message).toContain('22P02');
    expect(error.message).toContain('transactions_merchant_id_fkey');
    expect(error.message).toContain('rolled back');
  });

  it('keeps the original error reachable programmatically without printing it', () => {
    const cause = driverError();
    const error = new MigrationExecutionError('0007_add_index.sql', 42, cause);
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it('redacts a non-database cause rather than echoing its message', () => {
    const error = new MigrationExecutionError('0008_x.sql', 3, new Error(`boom ${ROW_VALUE}`));
    expect(error.message).not.toContain(ROW_VALUE);
    expect(error.message).toContain('0008_x.sql');
  });

  it('applyMigration surfaces only the redacted error when a statement fails', async () => {
    const client: MigrationClient = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: (async (text: string) => {
        if (/^(BEGIN|ROLLBACK|COMMIT|SELECT set_config)/i.test(text.trim())) return { rows: [] };
        throw driverError();
      }) as MigrationClient['query'],
    };
    await expect(
      applyMigration(client, '0009_boom.sql', 'CREATE TABLE t (id integer);'),
    ).rejects.toThrow(MigrationExecutionError);
    await applyMigration(client, '0009_boom.sql', 'CREATE TABLE t (id integer);').catch(
      (error: unknown) => {
        assertNoRowData((error as Error).message);
        assertNoRowData(String(error));
      },
    );
  });
});

describe('what the process entrypoint is allowed to print', () => {
  it('passes our own error classes through — their text is built from fixed strings', () => {
    const safety = new MigrationSafetyError([
      { filename: '0003_drop.sql', kind: 'destructive', rule: 'DROP TABLE', statement: 1 },
    ]);
    expect(redactedFailureText(safety)).toBe(safety.message);
    const execution = new MigrationExecutionError('0007_add_index.sql', 42, driverError());
    expect(redactedFailureText(execution)).toBe(execution.message);
  });

  it('reduces an unreviewed error to a code plus safe identifiers', () => {
    const text = redactedFailureText(driverError());
    expect(text).toContain('MIGRATE_UNEXPECTED_FAILURE');
    expect(text).toContain('22P02');
    assertNoRowData(text);
  });

  it('never prints a value that is not identifier-shaped', () => {
    const text = describeDatabaseError({
      code: '22P02',
      table: `users; DROP TABLE x -- ${ROW_VALUE}`,
      constraint: 'a'.repeat(200),
      column: 'merchant_id',
    });
    expect(text).toContain('code=22P02');
    expect(text).toContain('column=merchant_id');
    expect(text).not.toContain('DROP TABLE');
    expect(text).not.toContain(ROW_VALUE);
    expect(text).not.toContain('a'.repeat(64));
  });

  it('says so plainly when there is nothing safe to report', () => {
    expect(describeDatabaseError(new Error('opaque'))).toBe('no SQLSTATE reported');
    expect(describeDatabaseError(null)).toBe('no SQLSTATE reported');
    expect(describeDatabaseError(undefined)).toBe('no SQLSTATE reported');
  });
});
