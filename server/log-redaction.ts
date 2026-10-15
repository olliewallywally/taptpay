// Only application-owned field names may be supplied to structured log calls.
// Raw request/SDK objects belong behind the forbidden body/header key families.
const SENSITIVE_KEY =
  /(?:authorization|password|secret|token|cookie|api[-_]?key|bank|account|card|processor|session|(?:^|_)x[-_]?id|return[-_]?state|oauth|pan$|cvc$|cvv$|body|payload|headers?|rawquery|querystring|response|stack|cause|error$|message$|useragent)/i;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
export function maskedEmail(value: unknown): string {
  if (typeof value !== 'string') return '[REDACTED]';
  const at = value.indexOf('@');
  return at > 0
    ? `${at > 2 ? value.slice(0, 2) : ''}***${value.slice(at, at + 255)}`
    : '[REDACTED]';
}
const SAFE_ERROR_CODES = new Set([
  '23505',
  '23514',
  '42P08',
  '42804',
  '42P18',
  '23502',
  '22007',
  '42703',
  '42P01',
  '40001',
  '40P01',
  '08000',
  '08006',
  '53300',
  '57014',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'EPIPE',
  'EAI_AGAIN',
]);
export const isSafeLogCode = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_ERROR_CODES.has(value);
/** Read inert error metadata only; never invoke caller/provider accessors. */
export function errorDataProperty(error: unknown, key: string): unknown {
  try {
    let current = error;
    if (!current || typeof current !== 'object') return undefined;
    for (let depth = 0; current && depth < 4; depth++) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor)
        return 'value' in descriptor ? descriptor.value : undefined;
      current = Object.getPrototypeOf(current);
    }
  } catch {
    /* fixed metadata fallback */
  }
  return undefined;
}
export function safeErrorSummary(error: unknown) {
  const code = errorDataProperty(error, 'code');
  return isSafeLogCode(code)
    ? { kind: 'error' as const, code }
    : { kind: 'error' as const };
}
/** Bounded, descriptor-only traversal: no getter/toJSON or upstream Error text. */
export function redactSensitive(value: unknown, key = ''): unknown {
  let fields = 128;
  const seen = new WeakSet<object>();
  const visit = (current: unknown, name: string, depth: number): unknown => {
    if (SENSITIVE_KEY.test(name)) return '[REDACTED]';
    if (/email/i.test(name)) return maskedEmail(current);
    if (current instanceof Error) return safeErrorSummary(current);
    if (
      Buffer.isBuffer(current) ||
      ArrayBuffer.isView(current) ||
      current instanceof ArrayBuffer
    )
      return '[REDACTED_BYTES]';
    if (typeof current === 'string')
      return current
        .slice(0, 4096)
        .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
        .replace(JWT, '[REDACTED_JWT]')
        .replace(/enc:v[0-9]+:[A-Za-z0-9_:-]+/g, '[REDACTED_ENVELOPE]')
        .replace(
          /\/(pay|split|checkout|receipt)\/t\/[^/?#\s]+/g,
          '/$1/t/:token'
        )
        .replace(/\/api\/pay\/t\/[^/?#\s]+/g, '/api/pay/t/:token')
        .replace(/\/(api\/)?pay\/return\/[^/?#\s]+/g, '/$1pay/return/:state')
        .replace(
          /(\/(?:invoices|quotes|job-invoices|invoice-rent-requests)\/token\/)[^/?#\s]+/g,
          '$1:token'
        )
        .replace(/([?&][^&=?#\s]{1,64}=)[^&#\s]*/g, '$1[REDACTED]')
        .slice(0, 1024);
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'number')
      return Number.isFinite(current) ? current : '[INVALID_NUMBER]';
    if (typeof current === 'bigint') return '[BIGINT]';
    if (typeof current !== 'object') return '[UNSUPPORTED]';
    if (seen.has(current)) return '[CIRCULAR]';
    if (depth >= 5 || fields <= 0) return '[TRUNCATED]';
    seen.add(current);
    if (Array.isArray(current)) {
      const result: unknown[] = [];
      for (let i = 0; i < Math.min(current.length, 32) && fields > 0; i++) {
        fields--;
        const descriptor = Object.getOwnPropertyDescriptor(current, String(i));
        result.push(
          descriptor && 'value' in descriptor
            ? visit(descriptor.value, '', depth + 1)
            : '[OMITTED]'
        );
      }
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const name of Object.keys(current).slice(0, 32)) {
      if (fields-- <= 0) break;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      const safeName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)
        ? name
        : 'omittedField';
      result[safeName] =
        descriptor && 'value' in descriptor
          ? visit(descriptor.value, name, depth + 1)
          : '[OMITTED]';
    }
    return result;
  };
  try {
    return visit(value, key, 0);
  } catch {
    return '[REDACTION_FAILED]';
  }
}
