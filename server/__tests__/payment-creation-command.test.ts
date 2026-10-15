import {deriveRetailCreationCredential,bindCreationCommand} from '../payment-creation-command';
const key='11111111-1111-4111-8111-111111111111',secret='synthetic-return-secret-000000000000000000';
test('one authenticated create intent reconstructs the original credential without storing raw token',()=>{
  const first=deriveRetailCreationCredential(7,key,secret);expect(deriveRetailCreationCredential(7,key.toUpperCase(),secret)).toEqual(first);
  expect(first.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(deriveRetailCreationCredential(8,key,secret).hash).not.toBe(first.hash);
  expect(deriveRetailCreationCredential(7,key,secret+'rotated').hash).not.toBe(first.hash);
});
test('canonical creation fingerprints preserve date and money details and omit private token hashes',()=>{
  const intent={key,actor:{userId:1,role:'owner' as const}};
  const first=bindCreationCommand('property',7,{amountCents:100,dueAt:new Date('2026-10-13T00:00:00Z')},intent);
  expect(bindCreationCommand('property',7,{dueAt:'2026-10-13T00:00:00.000Z',amountCents:100},intent).fingerprint).toBe(first.fingerprint);
  expect(bindCreationCommand('property',7,{amountCents:101,dueAt:new Date('2026-10-13T00:00:00Z')},intent).fingerprint).not.toBe(first.fingerprint);
});
