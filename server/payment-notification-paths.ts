/** Kept in one place so the general parser cannot consume these receipts before
 * their stricter 8 KB parser. Card verification uses a separate domain finalizer. */
export function isDurablePaymentNotificationPath(path:string):boolean {
  return path==='/api/windcave/notification' || path==='/api/windcave/rent-notification' ||
    path==='/api/windcave/trades-notification' || path==='/api/billing/card/notification' || /^\/api\/pay\/notification\/[^/]+\/?$/.test(path);
}

/** Existing documented GET uses sessionid; sessionId is retained compatibility.
 * Duplicate fields, arrays and conflicting aliases are never a single hint. */
export function extractWindcaveNotificationSession(input:unknown):unknown {
  if(!input || typeof input!=='object' || Array.isArray(input)) return undefined;
  const source=input as Record<string,unknown>;
  const values=[source.sessionid,source.sessionId].filter(value=>value!==undefined);
  if(!values.length || values.some(value=>typeof value!=='string') || values.some(value=>value!==values[0])) return undefined;
  return values[0];
}
