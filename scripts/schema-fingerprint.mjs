import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fail = (code) => { throw new Error(code); };

// Catalogue statements for R0-T6A schema comparison.
//
// This tool records object NAMES, TYPES, DEFINITIONS AND STATUS ONLY. Every
// statement below reads pg_catalog or information_schema; not one selects from
// an application table, so no row data can reach a fingerprint or an evidence
// file. schema-fingerprint.test.mjs enforces that as a contract.
//
// Nothing selects an OID, a size, a planner statistic or a sequence's current
// value either. Those differ between two databases carrying identical schemas
// and would destroy the digest's only job: telling schema drift from noise.
export const QUERIES = Object.freeze({
  tables: `
    SELECT c.relname AS "name", c.relkind AS "kind", c.relpersistence AS "persistence",
           c.relrowsecurity AS "rowSecurity", c.relforcerowsecurity AS "forceRowSecurity",
           pg_catalog.pg_get_userbyid(c.relowner) AS "owner", c.relacl::text AS "acl"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,

  // Names only. A sequence's last_value is row data and is deliberately unread.
  sequences: `
    SELECT c.relname AS "name"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S'`,

  // pg_attribute is authoritative and privilege-independent, and format_type
  // already carries length/precision/scale. information_schema.columns is
  // joined only to decompose those into separate comparable fields; it is a
  // privilege-filtered view, so a null there never hides the real type.
  columns: `
    SELECT c.relname AS "table", a.attname AS "name", a.attnum AS "position",
           a.attacl::text AS "acl",
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS "type", t.typname AS "udtName",
           NOT a.attnotnull AS "nullable",
           pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS "default",
           CASE a.attidentity WHEN '' THEN NULL ELSE a.attidentity END AS "identity",
           CASE a.attgenerated WHEN '' THEN NULL ELSE a.attgenerated END AS "generated",
           co.collname AS "collation",
           ic.character_maximum_length AS "maxLength", ic.numeric_precision AS "numericPrecision",
           ic.numeric_scale AS "numericScale", ic.datetime_precision AS "datetimePrecision"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation AND co.collname <> 'default'
      LEFT JOIN information_schema.columns ic
             ON ic.table_schema = n.nspname AND ic.table_name = c.relname AND ic.column_name = a.attname
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
       AND a.attnum > 0 AND NOT a.attisdropped`,

  // pg_get_constraintdef is the comparison text for primary key, unique and
  // check constraints; NOT VALID and DEFERRABLE clauses appear inside it.
  constraints: `
    SELECT rel.relname AS "table", con.conname AS "name", con.contype AS "type",
           pg_catalog.pg_get_constraintdef(con.oid) AS "definition",
           con.convalidated AS "validated", con.condeferrable AS "deferrable", con.condeferred AS "deferred"
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public' AND con.contype IN ('p', 'u', 'c', 'f')`,

  // Referential actions get their own decoded fields because pg_get_constraintdef
  // omits the NO ACTION default: a dropped ON DELETE CASCADE would otherwise be
  // invisible in the definition text alone.
  // attname is the name type, and the driver has no array parser for name[]:
  // it hands back the literal "{merchant_id}". The ::text cast makes the array
  // arrive as an array; names() below refuses anything else.
  foreignKeys: `
    SELECT rel.relname AS "table", con.conname AS "name",
           ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
                  ORDER BY pg_catalog.array_position(con.conkey, a.attnum)) AS "columns",
           fn.nspname AS "referencedSchema", fr.relname AS "referencedTable",
           ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a
                  WHERE a.attrelid = con.confrelid AND a.attnum = ANY (con.confkey)
                  ORDER BY pg_catalog.array_position(con.confkey, a.attnum)) AS "referencedColumns",
           con.confupdtype AS "onUpdate", con.confdeltype AS "onDelete", con.confmatchtype AS "match",
           con.convalidated AS "validated", con.condeferrable AS "deferrable", con.condeferred AS "deferred"
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
      JOIN pg_catalog.pg_class fr ON fr.oid = con.confrelid
      JOIN pg_catalog.pg_namespace fn ON fn.oid = fr.relnamespace
     WHERE n.nspname = 'public' AND con.contype = 'f'`,

  indexes: `
    SELECT rel.relname AS "table", cls.relname AS "name",
           pg_catalog.pg_get_indexdef(idx.indexrelid) AS "definition",
           idx.indisunique AS "unique", idx.indisprimary AS "primaryKey", idx.indisvalid AS "valid"
      FROM pg_catalog.pg_index idx
      JOIN pg_catalog.pg_class cls ON cls.oid = idx.indexrelid
      JOIN pg_catalog.pg_class rel ON rel.oid = idx.indrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public' AND rel.relkind IN ('r', 'p', 'm')`,

  // Views were invisible to version 1. A view is the classic way to expose a
  // column the base table protects, so "which views exist and what do they
  // select" is schema, not decoration. Definitions are recorded verbatim, the
  // same treatment pg_get_constraintdef already gets.
  views: `
    SELECT c.relname AS "name", c.relkind AS "kind",
           pg_catalog.pg_get_viewdef(c.oid, true) AS "definition",
           c.relpersistence AS "persistence",
           c.relrowsecurity AS "rowSecurity", c.relforcerowsecurity AS "forceRowSecurity",
           pg_catalog.pg_get_userbyid(c.relowner) AS "owner", c.relacl::text AS "acl"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')`,

  // tgisinternal excludes the triggers Postgres builds for foreign keys and
  // deferred constraints; those are already recorded as constraints, and
  // counting them twice would make every foreign key look like a trigger.
  triggers: `
    SELECT rel.relname AS "table", t.tgname AS "name",
           pg_catalog.pg_get_triggerdef(t.oid, true) AS "definition",
           t.tgenabled AS "enabled", t.tgdeferrable AS "deferrable", t.tginitdeferred AS "deferred"
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class rel ON rel.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public' AND NOT t.tgisinternal`,

  // A trigger is only as trustworthy as the function it calls, so routines are
  // collected with it. The BODY IS DIGESTED, NOT COPIED: a function body is
  // unbounded procedural code that can embed a literal secret, and this
  // document is committed to a public repository. A digest still changes when
  // the body changes, which is all drift detection needs. prosecdef is carried
  // in the clear because SECURITY DEFINER is a privilege escalation surface and
  // must be readable, not hashed.
  routines: `
    SELECT p.proname AS "name", p.prokind AS "kind",
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS "arguments",
           pg_catalog.pg_get_function_result(p.oid) AS "returns",
           l.lanname AS "language", p.provolatile AS "volatility",
           p.proisstrict AS "strict", p.prosecdef AS "securityDefiner",
           p.proconfig::text AS "config", p.proacl::text AS "acl",
           pg_catalog.pg_get_userbyid(p.proowner) AS "owner",
           encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') AS "bodyDigest",
           length(p.prosrc) AS "bodyLength"
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public'`,

  // Role oid 0 inside polroles means PUBLIC and has no pg_roles row, so a plain
  // join would silently drop the single most important case: a policy that
  // applies to everyone.
  policies: `
    SELECT rel.relname AS "table", pol.polname AS "name", pol.polcmd AS "command",
           pol.polpermissive AS "permissive",
           CASE WHEN 0 = ANY (pol.polroles) THEN ARRAY['PUBLIC']::text[]
                ELSE ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r
                            WHERE r.oid = ANY (pol.polroles) ORDER BY r.rolname) END AS "roles",
           pg_catalog.pg_get_expr(pol.polqual, pol.polrelid) AS "using",
           pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid) AS "withCheck"
      FROM pg_catalog.pg_policy pol
      JOIN pg_catalog.pg_class rel ON rel.oid = pol.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = 'public'`,

  // Whether PUBLIC may still put objects in `public` is a schema-level fact no
  // per-table query can see.
  schemas: `
    SELECT n.nspname AS "name", pg_catalog.pg_get_userbyid(n.nspowner) AS "owner",
           n.nspacl::text AS "acl"
      FROM pg_catalog.pg_namespace n
     WHERE n.nspname = 'public'`,

  // Default privileges apply to objects that do not exist yet, so they are
  // invisible to every other query here and are exactly how a future table
  // silently becomes readable.
  defaultPrivileges: `
    SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS "role",
           d.defaclobjtype AS "objectType", n.nspname AS "schema", d.defaclacl::text AS "acl"
      FROM pg_catalog.pg_default_acl d
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace`,

  // Not schema-scoped, and deliberately so: a rebuild that lacks an extension
  // the schema depends on fails at the first query, not at provisioning.
  extensions: `
    SELECT e.extname AS "name", e.extversion AS "version", n.nspname AS "schema"
      FROM pg_catalog.pg_extension e
      JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace`,

  // Enums and domains only. Composite types are excluded because Postgres mints
  // one per table, which would restate the table list as noise.
  types: `
    SELECT t.typname AS "name", t.typtype AS "kind",
           pg_catalog.format_type(t.typbasetype, t.typtypmod) AS "baseType",
           t.typnotnull AS "notNull",
           pg_catalog.pg_get_expr(t.typdefaultbin, 0) AS "default",
           ARRAY(SELECT e.enumlabel::text FROM pg_catalog.pg_enum e
                  WHERE e.enumtypid = t.oid ORDER BY e.enumsortorder) AS "labels"
      FROM pg_catalog.pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')`,
});

const RELKIND = Object.freeze({ r: 'table', p: 'partitioned table' });
const PERSISTENCE = Object.freeze({ p: 'permanent', u: 'unlogged', t: 'temporary' });
const CONTYPE = Object.freeze({ p: 'primary key', u: 'unique', c: 'check', f: 'foreign key' });
const IDENTITY = Object.freeze({ a: 'always', d: 'by default' });
const GENERATED = Object.freeze({ s: 'stored', v: 'virtual' });
const FK_ACTION = Object.freeze({ a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' });
const FK_MATCH = Object.freeze({ f: 'FULL', p: 'PARTIAL', s: 'SIMPLE' });
const VIEW_RELKIND = Object.freeze({ v: 'view', m: 'materialized view' });
const TRIGGER_ENABLED = Object.freeze({ O: 'enabled', D: 'disabled', R: 'replica', A: 'always' });
const PROKIND = Object.freeze({ f: 'function', p: 'procedure', a: 'aggregate', w: 'window' });
const VOLATILITY = Object.freeze({ i: 'immutable', s: 'stable', v: 'volatile' });
const POLICY_CMD = Object.freeze({ '*': 'all', r: 'read', a: 'append', w: 'write', d: 'remove' });
const DEFACL_OBJECT = Object.freeze({ r: 'table', S: 'sequence', f: 'function', T: 'type', n: 'schema' });
const TYPTYPE = Object.freeze({ e: 'enum', d: 'domain' });

// Privileges are the one thing here that is genuinely environment-specific: the
// same schema provisioned twice carries different role NAMES, and recording
// them raw would make every cross-environment comparison differ for a reason
// that is not drift — destroying the digest's only job.
//
// So role names are normalised, not dropped. If every relation in `public` has
// the same owner, that name becomes `@owner`; any other grantee keeps its
// literal name, because a grant to somebody who is not the owner is precisely
// the drift worth seeing. An empty grantee is PUBLIC, which is never
// normalised away. When ownership is mixed, nothing is normalised and the
// literal names stay visible — the mixture is itself the finding, and
// `ownership.normalised` says which happened rather than leaving it to guess.
export function ownerNormaliser(owners) {
  const distinct = [...new Set(owners.filter((owner) => typeof owner === 'string' && owner !== ''))].sort(compare);
  const normalised = distinct.length === 1;
  const map = (name) => (name == null ? null : (normalised && name === distinct[0] ? '@owner' : name));
  return { map, normalised, distinctOwners: distinct.length };
}

/** Splits an aclitem[] literal on top-level commas; a quoted role name may contain one. */
function splitAclItems(text) {
  const items = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index - 1] !== '\\') { quoted = !quoted; current += character; continue; }
    if (character === ',' && !quoted) { items.push(current); current = ''; continue; }
    current += character;
  }
  if (current !== '') items.push(current);
  return items;
}

const unquote = (name) => (name.startsWith('"') && name.endsWith('"') && name.length > 1
  ? name.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\') : name);

/**
 * `null` means the catalogue holds no explicit grants at all — the object has
 * default privileges and only its owner can reach it. That is a different fact
 * from "an empty grant list" and is preserved as such.
 */
export function normaliseAcl(text, mapName) {
  if (text == null || text === '') return null;
  const inner = text.startsWith('{') && text.endsWith('}') ? text.slice(1, -1) : fail('FINGERPRINT_UNEXPECTED_ACL_SHAPE');
  if (inner === '') return [];
  return splitAclItems(inner).map((item) => {
    const match = /^(.*)=([a-zA-Z*]*)\/(.*)$/.exec(item);
    if (!match) fail('FINGERPRINT_UNEXPECTED_ACL_SHAPE');
    const grantee = unquote(match[1]);
    return {
      grantee: grantee === '' ? 'PUBLIC' : mapName(grantee),
      privileges: match[2],
      grantor: mapName(unquote(match[3])),
    };
  }).sort((left, right) => compare(canonicalJson(left), canonicalJson(right)));
}

// An unrecognised catalogue code stays visible as unknown(x) rather than
// aborting or silently collapsing to a default; a fingerprint that hides what
// it did not understand is worse than one that says so.
const decode = (map, code) => (code == null ? null : map[code] ?? `unknown(${code})`);

// Code-unit order, never localeCompare: a fingerprint compared across two
// machines must not depend on either machine's locale.
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Recursively sorts object keys; array order is preserved because callers already sorted it. */
export function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value instanceof Date) return value.toISOString();
  // An absent field becomes an explicit null so JSON.stringify cannot drop the
  // key entirely and make two different shapes digest alike.
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  const sorted = {};
  for (const key of Object.keys(value).sort(compare)) sorted[key] = canonicalise(value[key]);
  return sorted;
}

export const canonicalJson = (value) => JSON.stringify(canonicalise(value));
/** The written form: indented for reviewable diffs, still byte-deterministic. */
export const serialise = (value) => `${JSON.stringify(canonicalise(value), null, 2)}\n`;
export const digestOf = (value) => `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;

// A driver that returns an unparsed array literal must stop the run, not be
// spread into single characters and fingerprinted as if it were column names.
const names = (value) => (Array.isArray(value) ? [...value]
  : value == null ? [] : fail('FINGERPRINT_UNEXPECTED_ROW_SHAPE'));

function sortRows(rows, keys) {
  // Ties fall back to the whole canonical row, so even duplicate sort keys can
  // never reorder between two runs of the same schema.
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const result = compare(left[key], right[key]);
      if (result !== 0) return result;
    }
    return compare(canonicalJson(left), canonicalJson(right));
  });
}

/** Pure: raw catalogue rows in, deterministic comparison body out. */
export function buildFingerprint(rows) {
  // Derived before anything else: every ACL in the document is expressed
  // relative to this, so it has to be decided from the whole relation set
  // rather than per row.
  const ownership = ownerNormaliser([
    ...(rows.tables ?? []).map((row) => row.owner),
    ...(rows.views ?? []).map((row) => row.owner),
  ]);
  const acl = (value) => normaliseAcl(value, ownership.map);

  const tables = sortRows((rows.tables ?? []).map((row) => ({
    name: row.name, kind: decode(RELKIND, row.kind), persistence: decode(PERSISTENCE, row.persistence),
    rowSecurity: row.rowSecurity ?? null, forceRowSecurity: row.forceRowSecurity ?? null,
    owner: ownership.map(row.owner ?? null), acl: acl(row.acl),
  })), ['name']);

  const sequences = sortRows((rows.sequences ?? []).map((row) => ({ name: row.name })), ['name']);

  // Sorted by name rather than by ordinal, so a column added in a different
  // order reads as one position difference instead of shifting every row after
  // it. Defaults are copied verbatim and never normalised: a rogue nextval(...)
  // on a foreign-key column is precisely the drift this fingerprint exists to
  // expose, so smoothing defaults would defeat the tool.
  const columns = sortRows((rows.columns ?? []).map((row) => ({
    table: row.table, name: row.name, position: row.position ?? null, acl: acl(row.acl),
    type: row.type ?? null, udtName: row.udtName ?? null, nullable: row.nullable ?? null,
    default: row.default ?? null,
    identity: decode(IDENTITY, row.identity), generated: decode(GENERATED, row.generated),
    collation: row.collation ?? null, maxLength: row.maxLength ?? null,
    numericPrecision: row.numericPrecision ?? null, numericScale: row.numericScale ?? null,
    datetimePrecision: row.datetimePrecision ?? null,
  })), ['table', 'name']);

  const constraints = sortRows((rows.constraints ?? []).map((row) => ({
    table: row.table, name: row.name, type: decode(CONTYPE, row.type), definition: row.definition ?? null,
    validated: row.validated ?? null, deferrable: row.deferrable ?? null, deferred: row.deferred ?? null,
  })), ['table', 'name']);

  const foreignKeys = sortRows((rows.foreignKeys ?? []).map((row) => ({
    table: row.table, name: row.name, columns: names(row.columns),
    referencedSchema: row.referencedSchema ?? null, referencedTable: row.referencedTable ?? null,
    referencedColumns: names(row.referencedColumns),
    onUpdate: decode(FK_ACTION, row.onUpdate), onDelete: decode(FK_ACTION, row.onDelete),
    match: decode(FK_MATCH, row.match), validated: row.validated ?? null,
    deferrable: row.deferrable ?? null, deferred: row.deferred ?? null,
  })), ['table', 'name']);

  const indexes = sortRows((rows.indexes ?? []).map((row) => ({
    table: row.table, name: row.name, definition: row.definition ?? null,
    unique: row.unique ?? null, primaryKey: row.primaryKey ?? null, valid: row.valid ?? null,
  })), ['table', 'name']);

  const views = sortRows((rows.views ?? []).map((row) => ({
    name: row.name, kind: decode(VIEW_RELKIND, row.kind), definition: row.definition ?? null,
    persistence: decode(PERSISTENCE, row.persistence),
    rowSecurity: row.rowSecurity ?? null, forceRowSecurity: row.forceRowSecurity ?? null,
    owner: ownership.map(row.owner ?? null), acl: acl(row.acl),
  })), ['name']);

  const triggers = sortRows((rows.triggers ?? []).map((row) => ({
    table: row.table, name: row.name, definition: row.definition ?? null,
    enabled: decode(TRIGGER_ENABLED, row.enabled),
    deferrable: row.deferrable ?? null, deferred: row.deferred ?? null,
  })), ['table', 'name']);

  const routines = sortRows((rows.routines ?? []).map((row) => ({
    name: row.name, kind: decode(PROKIND, row.kind), arguments: row.arguments ?? null,
    returns: row.returns ?? null, language: row.language ?? null,
    volatility: decode(VOLATILITY, row.volatility), strict: row.strict ?? null,
    securityDefiner: row.securityDefiner ?? null, config: row.config ?? null,
    bodyDigest: row.bodyDigest ?? null, bodyLength: row.bodyLength ?? null,
    owner: ownership.map(row.owner ?? null), acl: acl(row.acl),
  })), ['name', 'arguments']);

  const policies = sortRows((rows.policies ?? []).map((row) => ({
    table: row.table, name: row.name, command: decode(POLICY_CMD, row.command),
    permissive: row.permissive ?? null, roles: names(row.roles).map((role) => ownership.map(role)),
    using: row.using ?? null, withCheck: row.withCheck ?? null,
  })), ['table', 'name']);

  const schemas = sortRows((rows.schemas ?? []).map((row) => ({
    name: row.name, owner: ownership.map(row.owner ?? null), acl: acl(row.acl),
  })), ['name']);

  const defaultPrivileges = sortRows((rows.defaultPrivileges ?? []).map((row) => ({
    role: ownership.map(row.role ?? null), objectType: decode(DEFACL_OBJECT, row.objectType),
    schema: row.schema ?? null, acl: acl(row.acl),
  })), ['schema', 'objectType', 'role']);

  const extensions = sortRows((rows.extensions ?? []).map((row) => ({
    name: row.name, version: row.version ?? null, schema: row.schema ?? null,
  })), ['name']);

  const types = sortRows((rows.types ?? []).map((row) => ({
    name: row.name, kind: decode(TYPTYPE, row.kind), baseType: row.baseType ?? null,
    notNull: row.notNull ?? null, default: row.default ?? null, labels: names(row.labels),
  })), ['name']);

  // Derived, but recorded rather than left to the reader: the repository has a
  // known latent issue where foreign-key columns carry auto-increment defaults.
  // Listing the intersection makes it a one-line check in the evidence file.
  const defaults = new Map(columns.map((column) => [`${column.table}\u0000${column.name}`, column.default]));
  const foreignKeyColumnDefaults = sortRows(foreignKeys.flatMap((key) => key.columns
    .filter((column) => defaults.get(`${key.table}\u0000${column}`) != null)
    .map((column) => ({
      table: key.table, column, constraint: key.name,
      default: defaults.get(`${key.table}\u0000${column}`),
    }))), ['table', 'column', 'constraint']);

  const byType = (type) => constraints.filter((constraint) => constraint.type === type).length;
  // An explicit grant to anyone but the object's OWN owner, anywhere in the
  // schema. Derived for the same reason foreignKeyColumnDefaults is: it turns
  // the question a reviewer actually asks into a single number instead of a
  // manual scan.
  //
  // Compared against each object's own owner rather than the normalised
  // `@owner`, because `public` is owned by the built-in `pg_database_owner`
  // while the relations are owned by the provisioning role. Comparing to
  // `@owner` counted the schema owner's own grant as an outside grant.
  //
  // A stock PostgreSQL 15+ database reads 1: `GRANT USAGE ON SCHEMA public TO
  // PUBLIC`, which is the shipped default. Anything above 1 was granted by
  // somebody.
  const grantsBeyondOwner = [...tables, ...views, ...columns, ...routines, ...schemas]
    .flatMap((object) => (object.acl ?? []).map((entry) => ({ entry, owner: object.owner ?? '@owner' })))
    .filter(({ entry, owner }) => entry.grantee !== owner).length;
  return {
    // Version 2 adds views, triggers, routines, policies, privileges,
    // default privileges, extensions and types. A version 1 document and a
    // version 2 document of the same database are not comparable, and the
    // field says so rather than letting a digest mismatch imply drift.
    fingerprintVersion: 2,
    schema: 'public',
    ownership: { normalised: ownership.normalised, distinctOwners: ownership.distinctOwners },
    counts: {
      tables: tables.length, sequences: sequences.length, columns: columns.length,
      constraints: constraints.length, primaryKeyConstraints: byType('primary key'),
      uniqueConstraints: byType('unique'), checkConstraints: byType('check'),
      foreignKeyConstraints: byType('foreign key'), foreignKeys: foreignKeys.length,
      indexes: indexes.length, foreignKeyColumnDefaults: foreignKeyColumnDefaults.length,
      views: views.length, triggers: triggers.length, routines: routines.length,
      policies: policies.length, extensions: extensions.length, types: types.length,
      defaultPrivileges: defaultPrivileges.length, grantsBeyondOwner,
    },
    tables, sequences, columns, constraints, foreignKeys, indexes, foreignKeyColumnDefaults,
    views, triggers, routines, policies, schemas, defaultPrivileges, extensions, types,
  };
}

// No database name, host, server version or generation timestamp enters the
// document. An empty uniquely named database and an authorised restored
// snapshot must produce byte-identical output when their schemas agree; any of
// those fields would make every comparison differ for reasons that are not drift.
export function fingerprintDocument(rows) {
  const fingerprint = buildFingerprint(rows);
  return { digest: digestOf(fingerprint), fingerprint };
}

/** Refuses ambient DATABASE_URL, matching scripts/db-backup.mjs: an operator tool names its own target. */
export function connectionSettings(env) {
  const raw = env.FINGERPRINT_DATABASE_URL;
  if (typeof raw !== 'string' || raw === '') fail('FINGERPRINT_INVALID_CONNECTION');
  let url;
  try { url = new URL(raw); } catch { fail('FINGERPRINT_INVALID_CONNECTION'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) fail('FINGERPRINT_INVALID_CONNECTION');
  // A percent-encoded socket directory is not a host, and libpq would accept it.
  if (!url.hostname || url.hostname.includes('%')) fail('FINGERPRINT_INVALID_CONNECTION');
  if (url.port !== '' && !/^[1-9]\d{0,4}$/.test(url.port)) fail('FINGERPRINT_INVALID_CONNECTION');
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { fail('FINGERPRINT_INVALID_CONNECTION'); }
  if (!database || database.includes('/')) fail('FINGERPRINT_INVALID_CONNECTION');
  // Query options can redirect host/dbname/user behind the URI's back. Accept
  // only bounded transport settings, once each.
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => !['sslmode', 'connect_timeout'].includes(key))) {
    fail('FINGERPRINT_INVALID_CONNECTION');
  }
  const mode = url.searchParams.get('sslmode');
  if (mode !== null && !['disable', 'require', 'verify-ca', 'verify-full'].includes(mode)) {
    fail('FINGERPRINT_INVALID_CONNECTION');
  }
  const timeout = url.searchParams.get('connect_timeout');
  if (timeout !== null && (!/^[1-9]\d*$/.test(timeout) || Number(timeout) > 60)) fail('FINGERPRINT_INVALID_CONNECTION');
  // Explicit fields, never the string: pg backfills anything a URI omits from
  // the ambient PG* environment.
  return {
    host: url.hostname, port: url.port === '' ? 5432 : Number(url.port),
    user: decodeURIComponent(url.username) || undefined,
    password: url.password === '' ? undefined : decodeURIComponent(url.password),
    database,
    ssl: mode === null || mode === 'disable' ? false : { rejectUnauthorized: mode !== 'require' },
  };
}

/** Reads the whole catalogue from one read-only snapshot. Never writes, never reads a table's rows. */
export async function collectSchema(client) {
  // REPEATABLE READ gives every collection the same catalogue state; READ ONLY
  // makes writing impossible whatever the connected role is allowed to do.
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  try {
    await client.query('SET LOCAL search_path = pg_catalog');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const rows = {};
    for (const [name, sql] of Object.entries(QUERIES)) rows[name] = (await client.query(sql)).rows;
    return rows;
  } finally {
    // Nothing was written, so the rollback is only about not leaving an open
    // snapshot behind; its failure must not mask the collection's own error.
    await client.query('ROLLBACK').catch(() => undefined);
  }
}

async function openClient(settings) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    ...settings, application_name: 'schema-fingerprint',
    connectionTimeoutMillis: 5_000, query_timeout: 65_000, statement_timeout: 60_000,
  });
  try { await client.connect(); } catch (error) { await client.end().catch(() => undefined); throw error; }
  return client;
}

export async function runFingerprint(argv, {
  env = process.env, connect = openClient, out = process.stdout, log = process.stderr,
} = {}) {
  if (argv.length !== 0) fail('FINGERPRINT_INVALID_ARGUMENTS');
  const settings = connectionSettings(env);
  let client;
  try { client = await connect(settings); } catch { fail('FINGERPRINT_CONNECT_FAILED'); }
  let rows;
  try { rows = await collectSchema(client); }
  // Never propagate the driver's message: it carries the host and database.
  catch { fail('FINGERPRINT_QUERY_FAILED'); }
  finally { await Promise.resolve(client?.end?.()).catch(() => undefined); }
  const document = fingerprintDocument(rows);
  out.write(serialise(document));
  const counts = Object.entries(document.fingerprint.counts).map(([key, value]) => `${key}=${value}`).join(' ');
  log.write(`SCHEMA_FINGERPRINT ${document.digest} ${counts}\n`);
  return document;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runFingerprint(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${/^FINGERPRINT_[A-Z_]+$/.test(error.message) ? error.message : 'FINGERPRINT_FAILED'}\n`);
    process.exitCode = 1;
  }
}
