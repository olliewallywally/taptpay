export type EnvironmentValidationMode = "audit" | "enforce";
export type AppEnvironment = "development" | "test" | "staging" | "production";
export type DatabaseTarget = "local" | "ci" | "staging" | "production";
export type PaymentMode = "disabled" | "simulation" | "uat" | "production";

export const UAT_WINDCAVE_ENDPOINT = "https://uat.windcave.com/api/v1";
export const PRODUCTION_WINDCAVE_ENDPOINT = "https://sec.windcave.com/api/v1";

export const FEATURE_ENV_KEYS = Object.freeze([
  "FEATURE_NEW_RETAIL_PAYMENTS",
  "FEATURE_SUBSCRIPTION_CHARGING",
  "FEATURE_INVOICE_PAYMENTS",
  "FEATURE_TAP_TO_PAY",
  "FEATURE_SPLIT_CONFIGURATION",
  "FEATURE_ECOMMERCE_API",
  "FEATURE_REFUND_INITIATION",
  "FEATURE_LIVE_WINDCAVE",
  "FEATURE_XERO_CONNECT",
  "FEATURE_XERO_ENQUEUE",
  "FEATURE_XERO_WORKER",
  "FEATURE_PROVIDER_RECONCILIATION",
  "FEATURE_XERO_TRADES_EXPORT",
  "FEATURE_XERO_PROPERTY_EXPORT",
  "FEATURE_XERO_RETAIL_EXPORT",
  "FEATURE_CRYPTO",
] as const);

export const BOOLEAN_ENV_KEYS = Object.freeze([
  "SEED_DEMO_DATA",
  "RUN_SCHEMA_PUSH",
  "RUN_MIGRATIONS",
  "SMTP_SECURE",
  ...FEATURE_ENV_KEYS,
] as const);

export type BooleanEnvironmentKey = (typeof BOOLEAN_ENV_KEYS)[number];
export type FeatureEnvironmentKey = (typeof FEATURE_ENV_KEYS)[number];
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface ConfigDiagnostic {
  readonly key: string;
  readonly group: string;
  readonly message: string;
}

export class ConfigValidationError extends Error {
  readonly key: string;
  readonly group: string;

  constructor(key: string, group: string, message = "is missing or invalid") {
    super(`Configuration error [${group}]: ${key} ${message}`);
    this.name = "ConfigValidationError";
    this.key = key;
    this.group = group;
  }
}

export interface AppConfig {
  readonly envValidationMode: EnvironmentValidationMode;
  readonly appEnv: AppEnvironment;
  readonly isProduction: boolean;
  readonly publicOrigin?: string;
  readonly publicApiOrigin?: string;
  /**
   * How many proxies stand in front of the app (TRUST_PROXY_HOPS). null = not known, so no
   * forwarded header is believed and no limit is keyed on the visitor's address; 0 = none.
   */
  readonly trustProxyHops: number | null;
  readonly databaseTarget: DatabaseTarget;
  readonly databaseUrl?: string;
  readonly jwtSecret: string;
  readonly paymentReturnStateSecret?: string;
  readonly cronSecret?: string;
  readonly seedDemoData: boolean;
  readonly runSchemaPush: boolean;
  readonly retiredRunMigrations: boolean;
  readonly paymentMode: PaymentMode;
  readonly features: Readonly<{
    newRetailPayments: boolean;
    subscriptionCharging: boolean;
    invoicePayments: boolean;
    tapToPay: boolean;
    splitConfiguration: boolean;
    ecommerceApi: boolean;
    refundInitiation: boolean;
    liveWindcave: boolean;
    xeroConnect: boolean;
    xeroEnqueue: boolean;
    xeroWorker: boolean;
    providerReconciliation: boolean;
    xeroTradesExport: boolean;
    xeroPropertyExport: boolean;
    xeroRetailExport: boolean;
    crypto: false;
  }>;
  readonly windcave: Readonly<{
    endpoint?: string;
    username?: string;
    apiKey?: string;
    applePayMerchantId?: string;
    googlePayMerchantId?: string;
    merchantId?: string;
  }>;
  readonly admin: Readonly<{
    email?: string;
    notifyEmail?: string;
    passwordHash?: string;
  }>;
  readonly oauth: Readonly<{ googleClientId?: string; googleClientSecret?: string }>;
  readonly analytics: Readonly<{ propertyId?: string; serviceAccount?: string }>;
  readonly push: Readonly<{
    vapidPublicKey?: string;
    vapidPrivateKey?: string;
    apnsKey?: string;
    apnsKeyId?: string;
    apnsTeamId?: string;
    apnsBundleId: string;
  }>;
  readonly email: Readonly<{
    provider: "resend" | "smtp" | "gmail" | "outlook" | "simulation";
    resendApiKey?: string;
    fromEmail: string;
    smtpHost?: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string;
    smtpPass?: string;
    gmailUser?: string;
    gmailAppPassword?: string;
    outlookUser?: string;
    outlookPass?: string;
  }>;
  readonly sms: Readonly<{
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
    messagingServiceSid?: string;
  }>;
  readonly whatsapp: Readonly<{ apiUrl?: string; apiKey?: string; instance: string }>;
  readonly wallets: Readonly<{
    googlePayEnvironment: "TEST" | "PRODUCTION";
    applePayMerchantId: string;
  }>;
  readonly legacyDomains: Readonly<{
    productionDomain?: string;
    replitDomains?: string;
  }>;
  readonly diagnostics: readonly ConfigDiagnostic[];
  readonly rawBooleans: Readonly<Record<BooleanEnvironmentKey, boolean>>;
}

const APP_ENVIRONMENTS = new Set<AppEnvironment>(["development", "test", "staging", "production"]);
const DATABASE_TARGETS = new Set<DatabaseTarget>(["local", "ci", "staging", "production"]);
const PAYMENT_MODES = new Set<PaymentMode>(["disabled", "simulation", "uat", "production"]);
const EMAIL_PROVIDERS = new Set<AppConfig["email"]["provider"]>([
  "resend", "smtp", "gmail", "outlook", "simulation",
]);

function nonempty(env: EnvironmentSource, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function enumValue<T extends string>(key: string, raw: string | undefined, allowed: Set<T>): T {
  if (!raw || !allowed.has(raw as T)) throw new ConfigValidationError(key, "core");
  return raw as T;
}

/**
 * R1-T4 phase B (owner decision 2026-09-21, Q4: off until checked on the live
 * deployment). Unset: not known — behind a proxy every visitor may arrive from the
 * proxy's address, so nothing keyed on the address is safe. "0": no proxy, the
 * connection's own address is the visitor's. "1"–"9": trust that many proxy hops.
 */
export function parseTrustProxyHops(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^[0-9]$/.test(raw)) throw new ConfigValidationError("TRUST_PROXY_HOPS", "network", "must be a whole number from 0 to 9");
  return Number(raw);
}

export function parseStrictBoolean(key: string, raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new ConfigValidationError(key, "boolean", "must be true or false");
}

function validateOrigin(key: string, value: string | undefined): string | undefined {
  if (!value) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigValidationError(key, "origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.includes("*") ||
    parsed.origin !== value
  ) {
    throw new ConfigValidationError(key, "origin");
  }
  return value;
}

function requireCompleteGroup(
  group: string,
  values: readonly [string, string | undefined][],
): void {
  const present = values.filter(([, value]) => value !== undefined).length;
  if (present > 0 && present < values.length) {
    throw new ConfigValidationError(
      values.map(([key]) => key).join(" + "),
      group,
      "must be configured together",
    );
  }
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value as Readonly<T>;
}

export function loadConfig(env: EnvironmentSource): Readonly<AppConfig> {
  const validationRaw = nonempty(env, "ENV_VALIDATION_MODE")
    ?? (nonempty(env, "JEST_WORKER_ID") ? "audit" : undefined);
  if (!validationRaw) throw new ConfigValidationError("ENV_VALIDATION_MODE", "core");
  if (validationRaw !== "audit" && validationRaw !== "enforce") {
    throw new ConfigValidationError("ENV_VALIDATION_MODE", "core");
  }
  const envValidationMode = validationRaw as EnvironmentValidationMode;
  const diagnostics: ConfigDiagnostic[] = [];
  const optionalFailure = (key: string, group: string) => {
    if (envValidationMode === "enforce") throw new ConfigValidationError(key, group);
    diagnostics.push({ key, group, message: `${key} is missing or invalid` });
  };

  const explicitAppEnv = nonempty(env, "APP_ENV");
  const appEnv = explicitAppEnv
    ? enumValue("APP_ENV", explicitAppEnv, APP_ENVIRONMENTS)
    : nonempty(env, "JEST_WORKER_ID") ? "test" : (() => {
      throw new ConfigValidationError("APP_ENV", "core", "must be explicit");
    })();
  const isProduction = appEnv === "production";

  const expectedDatabaseTarget: DatabaseTarget = appEnv === "test" ? "ci" : appEnv === "development" ? "local" : appEnv;
  const databaseTargetRaw = nonempty(env, "DATABASE_TARGET");
  if (!databaseTargetRaw && (appEnv === "staging" || appEnv === "production")) {
    throw new ConfigValidationError("DATABASE_TARGET", "database");
  }
  const databaseTarget = databaseTargetRaw
    ? enumValue("DATABASE_TARGET", databaseTargetRaw, DATABASE_TARGETS)
    : expectedDatabaseTarget;
  if (databaseTarget !== expectedDatabaseTarget) {
    throw new ConfigValidationError("DATABASE_TARGET", "database", "does not match APP_ENV");
  }

  const databaseUrl = nonempty(env, "DATABASE_URL");
  if (!databaseUrl && (appEnv === "staging" || appEnv === "production")) {
    throw new ConfigValidationError("DATABASE_URL", "database");
  }

  const jwtSecret = nonempty(env, "JWT_SECRET");
  if (!jwtSecret && (appEnv === "staging" || appEnv === "production")) {
    throw new ConfigValidationError("JWT_SECRET", "authentication");
  }
  if (jwtSecret && (appEnv === "staging" || appEnv === "production") && jwtSecret.length < 32) {
    throw new ConfigValidationError("JWT_SECRET", "authentication", "does not meet the minimum strength policy");
  }

  const rawBooleans = Object.fromEntries(
    BOOLEAN_ENV_KEYS.map((key) => [key, parseStrictBoolean(key, env[key], false)]),
  ) as Record<BooleanEnvironmentKey, boolean>;
  if (rawBooleans.FEATURE_CRYPTO) {
    throw new ConfigValidationError("FEATURE_CRYPTO", "capability", "must remain false");
  }
  if (rawBooleans.SEED_DEMO_DATA && appEnv !== "development" && appEnv !== "test") {
    throw new ConfigValidationError(
      "SEED_DEMO_DATA",
      "database",
      "cannot be true in staging or production",
    );
  }

  const paymentMode = enumValue(
    "PAYMENT_MODE",
    nonempty(env, "PAYMENT_MODE") ?? "disabled",
    PAYMENT_MODES,
  );
  if ((appEnv === "staging" || appEnv === "production") && paymentMode === "simulation") {
    throw new ConfigValidationError("PAYMENT_MODE", "payments", "cannot use simulation in staging or production");
  }
  if (appEnv === "production" && paymentMode === "uat") {
    throw new ConfigValidationError("PAYMENT_MODE", "payments", "cannot use UAT in production");
  }
  if (paymentMode === "uat" && appEnv !== "development" && appEnv !== "staging") {
    throw new ConfigValidationError("PAYMENT_MODE", "payments", "UAT is allowed only in development or staging");
  }
  if (paymentMode === "production" && appEnv !== "production") {
    throw new ConfigValidationError("PAYMENT_MODE", "payments", "production mode requires APP_ENV=production");
  }

  const windcaveEndpoint = nonempty(env, "WINDCAVE_ENDPOINT");
  const windcaveUsername = nonempty(env, "WINDCAVE_USERNAME");
  const windcaveApiKey = nonempty(env, "WINDCAVE_API_KEY");
  requireCompleteGroup("Windcave credentials", [
    ["WINDCAVE_USERNAME", windcaveUsername],
    ["WINDCAVE_API_KEY", windcaveApiKey],
  ]);
  if (paymentMode === "uat") {
    if (windcaveEndpoint !== UAT_WINDCAVE_ENDPOINT) {
      throw new ConfigValidationError("WINDCAVE_ENDPOINT", "payments", "must be the approved UAT endpoint");
    }
    if (!windcaveUsername || !windcaveApiKey) {
      throw new ConfigValidationError("WINDCAVE_USERNAME + WINDCAVE_API_KEY", "Windcave credentials");
    }
    if (!rawBooleans.FEATURE_PROVIDER_RECONCILIATION) {
      throw new ConfigValidationError(
        "FEATURE_PROVIDER_RECONCILIATION",
        "payments",
        "must remain true while real provider sessions can exist",
      );
    }
  }
  if (paymentMode === "production") {
    if (envValidationMode !== "enforce") {
      throw new ConfigValidationError("ENV_VALIDATION_MODE", "payments", "must be enforce for production money");
    }
    if (!rawBooleans.FEATURE_LIVE_WINDCAVE) {
      throw new ConfigValidationError("FEATURE_LIVE_WINDCAVE", "payments", "must be true for production mode");
    }
    if (windcaveEndpoint !== PRODUCTION_WINDCAVE_ENDPOINT) {
      throw new ConfigValidationError("WINDCAVE_ENDPOINT", "payments", "must be the approved production endpoint");
    }
    if (!windcaveUsername || !windcaveApiKey) {
      throw new ConfigValidationError("WINDCAVE_USERNAME + WINDCAVE_API_KEY", "Windcave credentials");
    }
    if (!rawBooleans.FEATURE_PROVIDER_RECONCILIATION) {
      throw new ConfigValidationError(
        "FEATURE_PROVIDER_RECONCILIATION",
        "payments",
        "must remain true while real provider sessions can exist",
      );
    }
  }

  const paymentReturnStateSecret = nonempty(env, "PAYMENT_RETURN_STATE_SECRET");
  if (paymentReturnStateSecret && paymentReturnStateSecret === jwtSecret) {
    throw new ConfigValidationError("PAYMENT_RETURN_STATE_SECRET", "payments", "must be independent of JWT_SECRET");
  }
  const paymentInitiationFlagEnabled = !!(
    rawBooleans.FEATURE_NEW_RETAIL_PAYMENTS ||
    rawBooleans.FEATURE_SUBSCRIPTION_CHARGING ||
    rawBooleans.FEATURE_INVOICE_PAYMENTS ||
    rawBooleans.FEATURE_TAP_TO_PAY ||
    rawBooleans.FEATURE_SPLIT_CONFIGURATION ||
    rawBooleans.FEATURE_ECOMMERCE_API
  );
  if ((paymentMode !== "disabled" || paymentInitiationFlagEnabled) && !paymentReturnStateSecret) {
    throw new ConfigValidationError("PAYMENT_RETURN_STATE_SECRET", "payments");
  }
  if (
    paymentReturnStateSecret &&
    (paymentMode !== "disabled" || paymentInitiationFlagEnabled) &&
    paymentReturnStateSecret.length < 32
  ) {
    throw new ConfigValidationError(
      "PAYMENT_RETURN_STATE_SECRET",
      "payments",
      "does not meet the minimum strength policy",
    );
  }

  const publicOrigin = validateOrigin("PUBLIC_ORIGIN", nonempty(env, "PUBLIC_ORIGIN"));
  const publicApiOrigin = validateOrigin("PUBLIC_API_ORIGIN", nonempty(env, "PUBLIC_API_ORIGIN"));
  if (paymentMode !== "disabled" && !publicOrigin) {
    throw new ConfigValidationError("PUBLIC_ORIGIN", "payments");
  }

  const moneyFlagEnabled = FEATURE_ENV_KEYS.some((key) => key !== "FEATURE_CRYPTO" && rawBooleans[key]);
  if (moneyFlagEnabled && envValidationMode !== "enforce") {
    throw new ConfigValidationError("ENV_VALIDATION_MODE", "capability", "must be enforce when a capability is enabled");
  }

  const cronSecret = nonempty(env, "CRON_SECRET");
  const scheduledCapabilityEnabled = !!(
    rawBooleans.FEATURE_SUBSCRIPTION_CHARGING ||
    rawBooleans.FEATURE_INVOICE_PAYMENTS ||
    rawBooleans.FEATURE_XERO_WORKER
  );
  if (scheduledCapabilityEnabled && (!cronSecret || cronSecret.length < 32)) {
    throw new ConfigValidationError("CRON_SECRET", "scheduler", "does not meet the minimum strength policy");
  }

  const vapidPublicKey = nonempty(env, "VAPID_PUBLIC_KEY");
  const vapidPrivateKey = nonempty(env, "VAPID_PRIVATE_KEY");
  requireCompleteGroup("web-push", [
    ["VAPID_PUBLIC_KEY", vapidPublicKey],
    ["VAPID_PRIVATE_KEY", vapidPrivateKey],
  ]);
  const apnsKey = nonempty(env, "APNS_KEY_P8");
  const apnsKeyId = nonempty(env, "APNS_KEY_ID");
  const apnsTeamId = nonempty(env, "APNS_TEAM_ID");
  requireCompleteGroup("native-push", [
    ["APNS_KEY_P8", apnsKey],
    ["APNS_KEY_ID", apnsKeyId],
    ["APNS_TEAM_ID", apnsTeamId],
  ]);

  const googleClientId = nonempty(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = nonempty(env, "GOOGLE_CLIENT_SECRET");
  requireCompleteGroup("google-oauth", [
    ["GOOGLE_CLIENT_ID", googleClientId],
    ["GOOGLE_CLIENT_SECRET", googleClientSecret],
  ]);
  if (googleClientId && !publicOrigin && appEnv !== "test") {
    throw new ConfigValidationError("PUBLIC_ORIGIN", "google-oauth");
  }

  const analyticsPropertyId = nonempty(env, "GOOGLE_ANALYTICS_PROPERTY_ID");
  const analyticsServiceAccount = nonempty(env, "GOOGLE_ANALYTICS_SERVICE_ACCOUNT");
  requireCompleteGroup("analytics", [
    ["GOOGLE_ANALYTICS_PROPERTY_ID", analyticsPropertyId],
    ["GOOGLE_ANALYTICS_SERVICE_ACCOUNT", analyticsServiceAccount],
  ]);

  const emailProviderRaw = nonempty(env, "EMAIL_PROVIDER") ?? "resend";
  if (!EMAIL_PROVIDERS.has(emailProviderRaw as AppConfig["email"]["provider"])) {
    throw new ConfigValidationError("EMAIL_PROVIDER", "email");
  }
  const emailProvider = emailProviderRaw as AppConfig["email"]["provider"];
  const resendApiKey = nonempty(env, "RESEND_API_KEY");
  if (emailProvider === "resend" && !resendApiKey) optionalFailure("RESEND_API_KEY", "email");

  const smtpHost = nonempty(env, "SMTP_HOST");
  const smtpUser = nonempty(env, "SMTP_USER");
  const smtpPass = nonempty(env, "SMTP_PASS");
  requireCompleteGroup("smtp-email", [
    ["SMTP_HOST", smtpHost],
    ["SMTP_USER", smtpUser],
    ["SMTP_PASS", smtpPass],
  ]);
  if (emailProvider === "smtp" && (!smtpHost || !smtpUser || !smtpPass)) {
    optionalFailure("SMTP_HOST + SMTP_USER + SMTP_PASS", "email");
  }
  const smtpPortRaw = nonempty(env, "SMTP_PORT") ?? "587";
  if (!/^\d+$/.test(smtpPortRaw) || Number(smtpPortRaw) < 1 || Number(smtpPortRaw) > 65535) {
    throw new ConfigValidationError("SMTP_PORT", "email");
  }
  const gmailUser = nonempty(env, "GMAIL_USER");
  const gmailAppPassword = nonempty(env, "GMAIL_APP_PASSWORD");
  requireCompleteGroup("gmail", [
    ["GMAIL_USER", gmailUser],
    ["GMAIL_APP_PASSWORD", gmailAppPassword],
  ]);
  if (emailProvider === "gmail" && (!gmailUser || !gmailAppPassword)) {
    optionalFailure("GMAIL_USER + GMAIL_APP_PASSWORD", "email");
  }
  const outlookUser = nonempty(env, "OUTLOOK_USER");
  const outlookPass = nonempty(env, "OUTLOOK_PASS");
  requireCompleteGroup("outlook", [
    ["OUTLOOK_USER", outlookUser],
    ["OUTLOOK_PASS", outlookPass],
  ]);
  if (emailProvider === "outlook" && (!outlookUser || !outlookPass)) {
    optionalFailure("OUTLOOK_USER + OUTLOOK_PASS", "email");
  }
  if (emailProvider === "simulation" && (appEnv === "staging" || appEnv === "production")) {
    throw new ConfigValidationError("EMAIL_PROVIDER", "email", "cannot simulate in staging or production");
  }
  const emailConfigured = !!(
    (emailProvider === "resend" && resendApiKey) ||
    (emailProvider === "smtp" && smtpHost && smtpUser && smtpPass) ||
    (emailProvider === "gmail" && gmailUser && gmailAppPassword) ||
    (emailProvider === "outlook" && outlookUser && outlookPass)
  );
  if (emailConfigured && !publicOrigin && appEnv !== "test") {
    throw new ConfigValidationError("PUBLIC_ORIGIN", "email");
  }

  const twilioAccountSid = nonempty(env, "TWILIO_ACCOUNT_SID");
  const twilioAuthToken = nonempty(env, "TWILIO_AUTH_TOKEN");
  const twilioFromNumber = nonempty(env, "TWILIO_FROM_NUMBER");
  const twilioMessagingServiceSid = nonempty(env, "TWILIO_MESSAGING_SERVICE_SID");
  const anyTwilio = !!(twilioAccountSid || twilioAuthToken || twilioFromNumber || twilioMessagingServiceSid);
  if (anyTwilio && (!twilioAccountSid || !twilioAuthToken || (!twilioFromNumber && !twilioMessagingServiceSid))) {
    throw new ConfigValidationError("TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + sender", "sms", "must be configured together");
  }

  const whatsappApiUrl = nonempty(env, "EVOLUTION_API_URL");
  const whatsappApiKey = nonempty(env, "EVOLUTION_API_KEY");
  requireCompleteGroup("whatsapp", [
    ["EVOLUTION_API_URL", whatsappApiUrl],
    ["EVOLUTION_API_KEY", whatsappApiKey],
  ]);

  const features = {
    newRetailPayments: rawBooleans.FEATURE_NEW_RETAIL_PAYMENTS,
    subscriptionCharging: rawBooleans.FEATURE_SUBSCRIPTION_CHARGING,
    invoicePayments: rawBooleans.FEATURE_INVOICE_PAYMENTS,
    tapToPay: rawBooleans.FEATURE_TAP_TO_PAY,
    splitConfiguration: rawBooleans.FEATURE_SPLIT_CONFIGURATION,
    ecommerceApi: rawBooleans.FEATURE_ECOMMERCE_API,
    refundInitiation: rawBooleans.FEATURE_REFUND_INITIATION,
    liveWindcave: rawBooleans.FEATURE_LIVE_WINDCAVE,
    xeroConnect: rawBooleans.FEATURE_XERO_CONNECT,
    xeroEnqueue: rawBooleans.FEATURE_XERO_ENQUEUE,
    xeroWorker: rawBooleans.FEATURE_XERO_WORKER,
    providerReconciliation: rawBooleans.FEATURE_PROVIDER_RECONCILIATION,
    xeroTradesExport: rawBooleans.FEATURE_XERO_TRADES_EXPORT,
    xeroPropertyExport: rawBooleans.FEATURE_XERO_PROPERTY_EXPORT,
    xeroRetailExport: rawBooleans.FEATURE_XERO_RETAIL_EXPORT,
    crypto: false as const,
  };

  return deepFreeze({
    envValidationMode,
    appEnv,
    isProduction,
    publicOrigin,
    publicApiOrigin,
    trustProxyHops: parseTrustProxyHops(nonempty(env, "TRUST_PROXY_HOPS")),
    databaseTarget,
    databaseUrl,
    jwtSecret: jwtSecret ?? "dev-only-jwt-secret-not-for-production",
    paymentReturnStateSecret,
    cronSecret,
    seedDemoData: rawBooleans.SEED_DEMO_DATA,
    runSchemaPush: rawBooleans.RUN_SCHEMA_PUSH,
    retiredRunMigrations: rawBooleans.RUN_MIGRATIONS,
    paymentMode,
    features,
    windcave: {
      endpoint: windcaveEndpoint,
      username: windcaveUsername,
      apiKey: windcaveApiKey,
      applePayMerchantId: nonempty(env, "WINDCAVE_APPLE_PAY_MERCHANT_ID"),
      googlePayMerchantId: nonempty(env, "WINDCAVE_GOOGLE_PAY_MERCHANT_ID"),
      merchantId: nonempty(env, "WINDCAVE_MERCHANT_ID"),
    },
    admin: {
      email: nonempty(env, "ADMIN_EMAIL"),
      notifyEmail: nonempty(env, "ADMIN_NOTIFY_EMAIL"),
      passwordHash: nonempty(env, "ADMIN_PASSWORD_HASH"),
    },
    oauth: { googleClientId, googleClientSecret },
    analytics: { propertyId: analyticsPropertyId, serviceAccount: analyticsServiceAccount },
    push: {
      vapidPublicKey,
      vapidPrivateKey,
      apnsKey,
      apnsKeyId,
      apnsTeamId,
      apnsBundleId: nonempty(env, "APNS_BUNDLE_ID") ?? "nz.taptpay.app",
    },
    email: {
      provider: emailProvider,
      resendApiKey,
      fromEmail: nonempty(env, "RESEND_FROM_EMAIL") ?? "noreply@taptpay.co.nz",
      smtpHost,
      smtpPort: Number(smtpPortRaw),
      smtpSecure: rawBooleans.SMTP_SECURE,
      smtpUser,
      smtpPass,
      gmailUser,
      gmailAppPassword,
      outlookUser,
      outlookPass,
    },
    sms: {
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      fromNumber: twilioFromNumber,
      messagingServiceSid: twilioMessagingServiceSid,
    },
    whatsapp: {
      apiUrl: whatsappApiUrl,
      apiKey: whatsappApiKey,
      instance: nonempty(env, "EVOLUTION_INSTANCE") ?? "default",
    },
    wallets: {
      googlePayEnvironment: nonempty(env, "GOOGLE_PAY_ENV") === "PRODUCTION" ? "PRODUCTION" : "TEST",
      applePayMerchantId: nonempty(env, "APPLE_PAY_MERCHANT_ID") ?? "merchant.com.tapt.payment",
    },
    legacyDomains: {
      productionDomain: nonempty(env, "PRODUCTION_DOMAIN"),
      replitDomains: nonempty(env, "REPLIT_DOMAINS"),
    },
    diagnostics,
    rawBooleans,
  });
}

// The sole production environment read. Application modules consume this
// immutable snapshot; unit tests exercise loadConfig with explicit objects.
export const config = loadConfig(process.env);
