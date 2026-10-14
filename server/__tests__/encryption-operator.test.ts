import { parseEncryptionOperatorArguments } from '../encryption-operator';

const target = [
  '--expected-host=127.0.0.1',
  '--expected-port=55440',
  '--expected-database=r5_synthetic',
];
const ref = 'a'.repeat(64);
describe('R5 explicit operator mutations', () => {
  test('default invocation is read-only and never implies credential disposition', () => {
    const options = parseEncryptionOperatorArguments(target);
    expect(options.execute).toBe(false);
    expect(options.action).toBe('inspect');
    expect(options.credentialDecision).toBeUndefined();
  });
  test('a named action without execute remains a dry run', () => {
    expect(
      parseEncryptionOperatorArguments([...target, '--action=activate-writes'])
        .execute
    ).toBe(false);
  });
  test('active scope is explicit and cannot carry an unused merchant credential decision', () => {
    expect(
      parseEncryptionOperatorArguments([...target, '--scope=active']).scope
    ).toBe('active');
    expect(() =>
      parseEncryptionOperatorArguments([...target, '--scope=all'])
    ).toThrow('R5_OPERATOR_INVALID_ARGUMENTS');
    expect(() =>
      parseEncryptionOperatorArguments([
        ...target,
        '--scope=active',
        '--action=activate-writes',
        '--credential-policy=delete',
        `--credential-review-reference=${ref}`,
      ])
    ).toThrow('R5_OPERATOR_INVALID_ARGUMENTS');
  });
  test.each(
    [
      ['--execute=true'],
      ['--action=activate-writes', '--execute=true'],
      [
        '--action=activate-writes',
        '--execute=true',
        '--confirm-database=wrong',
      ],
      ['--action=delete-all'],
      ['--execute=1'],
      ['--max-batches=1001'],
      ['--max-batches=0'],
      ['--action=backfill'],
      ['--action=rotate', '--run-id=not-a-uuid'],
      [
        '--action=contract',
        '--execute=true',
        '--confirm-database=r5_synthetic',
      ],
      ['--credential-policy=delete'],
      ['--action=activate-writes', '--credential-policy=delete'],
      [
        '--action=activate-writes',
        '--credential-policy=encrypt',
        `--credential-review-reference=${ref}`,
      ],
      [
        '--action=activate-writes',
        '--credential-policy=encrypt',
        `--credential-review-reference=${ref}`,
        '--credential-delete-after=2000-01-01',
      ],
      [
        '--action=activate-writes',
        '--credential-policy=encrypt',
        `--credential-review-reference=${ref}`,
        '--credential-delete-after=2030-02-30',
      ],
      [
        '--action=activate-writes',
        '--credential-policy=delete',
        `--credential-review-reference=${ref}`,
        '--credential-delete-after=2030-01-01',
      ],
      ['--credential-review-reference=ignored'],
    ].map(argv => [argv])
  )('invalid invocation %# fails before any connection', flags => {
    expect(() =>
      parseEncryptionOperatorArguments([...target, ...flags])
    ).toThrow('R5_OPERATOR_INVALID_ARGUMENTS');
  });
  test('explicit temporary encryption requires an approved future deletion date', () => {
    const options = parseEncryptionOperatorArguments([
      ...target,
      '--action=activate-writes',
      '--execute=true',
      '--confirm-database=r5_synthetic',
      '--credential-policy=encrypt',
      `--credential-review-reference=${ref}`,
      '--credential-delete-after=2030-01-01',
    ]);
    expect(options.credentialDecision).toEqual({
      policy: 'encrypt',
      reviewReference: ref,
      deleteAfter: '2030-01-01',
    });
  });
  test('contract requires its external review reference and exact target confirmation', () => {
    expect(
      parseEncryptionOperatorArguments([
        ...target,
        '--action=contract',
        '--execute=true',
        '--confirm-database=r5_synthetic',
        `--review-reference=${ref}`,
      ]).execute
    ).toBe(true);
  });
});
