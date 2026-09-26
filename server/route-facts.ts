/**
 * R1-T2 (C10) — the per-route facts the route policy records, read from the
 * syntax tree of each registration: its middleware arguments, its handler's
 * body, and every helper function defined in the same file that either of
 * those calls (followed transitively, by lexical scope).
 *
 * A fact is what the code does, not a judgment: which parameters are parsed
 * strictly, which authorization checks run, which storage methods are
 * called, which calls leave the process (email, push, live updates, the
 * payment provider, outbound HTTP), which statuses can be answered, which
 * response projections are used, and where an error's own text reaches a
 * response. The judgments (who may call, which tenant, is this disclosure
 * acceptable) are recorded separately and checked against these facts.
 *
 * Not followed: functions imported from other modules (only classified by
 * name, below) and methods on service objects (recorded as calls). So
 * `storageMethods` is what the route file itself calls.
 */
import * as ts from "typescript";
import fs from "fs";
import path from "path";
import { findExpressBindings, REGISTRATION_FILES } from "./route-inventory";

export interface RouteFacts {
  /** Middleware between the path and the handler, as written. */
  middleware: string[];
  /** Each path parameter read, with the parser it goes through ("raw" when none). */
  params: string[];
  /** Each query key read, likewise. */
  query: string[];
  /** Body validation: "schema: <name>", "fields: <names read directly>", "whole body: <callee>", "file". */
  body: string[];
  /** Authorization checks called, and tenant/role comparisons made. */
  authChecks: string[];
  /** `storage.<method>` calls. */
  storageMethods: string[];
  /** Calls with an effect outside this server's storage, as "<kind>: <callee>". */
  sideEffects: string[];
  /** Status codes the handler can answer (302 for a redirect, 200 for a plain send). */
  statuses: number[];
  /** Response projections (`*Dto(` calls). */
  dtos: string[];
  /** Where an error's own text is put into a response. */
  errorTextInResponse: string[];
  /** Capability and payment-mode gates. */
  capabilityGates: string[];
  /** Billing / entitlement gates. */
  entitlementGates: string[];
  /** Rate limits and attempt throttles. */
  rateLimits: string[];
  /** Idempotency keys and one-time claims. */
  idempotency: string[];
  /** Helper functions in the same file that were followed. */
  helpers: string[];
}

const ROUTE_METHODS: Record<string, string> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
  all: "ALL",
};

/** Parsers that validate a path or query value strictly (server/http-params.ts and friends). */
const STRICT_PARSERS = new Set([
  "strictPositiveIntegerParam",
  "strictPositiveIntegerQueryParam",
  "strictBoundedIntegerQueryParam",
  "strictUuidParam",
  "isTutorialPageKey",
  "isInvoiceDocumentName",
]);

/**
 * Authorization checks: called, recorded, not followed (their inside is a
 * comparison already named by the check).
 */
const AUTH_CHECK_CALLS = new Set([
  "authenticateToken",
  "authenticateAdmin",
  "authenticateApiKey",
  "authorizeCronRequest",
  "checkMerchantOwnership",
  "checkAccountOwnership",
  "isAccountOwner",
  "isValidatedPlatformAdmin",
  "resolvePaymentToken",
  "isTokenAddressedTransaction",
  "getCheckoutInvoiceByToken",
  "loadTokenReceipt",
  "prepareTokenCompletion",
  "paymentAttempts.resolveReturnState",
  "validateResetToken",
  "resetPassword",
  "verifyGoogleSignInState",
  "storage.getMerchantByToken",
  "storage.getQuoteByToken",
  "storage.getUserByInviteToken",
  // Sign-in: a password, Google's one-time code, a sign-up's emailed link.
  "authenticateUser",
  "checkPasswordEvenly",
  "storage.consumeAuthHandoffCode",
  "storage.verifyMerchant",
]);

/** Calls that leave the process, by the kind of effect. */
const SIDE_EFFECT_CALLS: Record<string, string> = {
  sendEmail: "email",
  sendTeamInviteEmail: "email",
  resendInvoiceEmail: "email",
  resendTradeInvoice: "email/SMS",
  sendTradePaymentInvoice: "email/SMS",
  sendTradeQuote: "email/SMS",
  tellBusinessQuoteAcceptanceBlocked: "email",
  sendGstInvoices: "email",
  sendPushToMerchant: "push",
  createWindcaveSession: "provider",
  queryWindcaveSession: "provider",
  createWindcaveRefund: "provider",
  submitGooglePayToken: "provider",
  createAttendedSession: "provider",
  submitTapToPayToken: "provider",
  createCardStorageSession: "provider",
  queryStoredCardSession: "provider",
  chargeStoredCard: "provider",
  fetch: "outbound http",
  logSecurityEvent: "audit log",
};

/** Callee prefixes that leave the process, by kind. */
const SIDE_EFFECT_PREFIXES: Array<[string, string]> = [
  ["windcaveService.", "provider"],
  ["sseBroker.", "live update"],
  ["fs.", "file system"],
];

/**
 * Any function named send…Email or resend…Email sends one: the email service's
 * senders are imported where they are used, often inside the handler, so a new
 * one is recognised by its name without being listed.
 */
const EMAIL_SENDER = /^(re)?send\w*Email$/;

const CAPABILITY_CALLS = new Set(["isWindcaveConfigured", "requireEcommerceApi", "windcaveService.isConfigured"]);
/** Calls under a side-effect prefix that only read this server's configuration. */
const CONFIGURATION_READS = new Set(["windcaveService.isConfigured"]);
const ENTITLEMENT_NAMES = new Set(["requireBillingCard", "billingCardIsReady", "BILLING_CARD_REQUIRED"]);

const RESPONSE_NAMES = new Set(["res", "_res", "response"]);
const REQUEST_NAMES = new Set(["req", "_req", "request"]);
const ERROR_NAMES = /^(e|err|error|ex|caught|cause|.*Error|.*error)$/;

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isFunctionLike(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
}

/**
 * The function an identifier names, looked up by lexical scope: the nearest
 * enclosing block (or the file) that declares it as `function name` or
 * `const name = (…) => …` / `function (…)`.
 */
function resolveLocalFunction(identifier: ts.Identifier): ts.FunctionLikeDeclaration | undefined {
  const name = identifier.text;
  let scope: ts.Node | undefined = identifier.parent;
  while (scope) {
    const statements: ts.NodeArray<ts.Statement> | undefined = ts.isBlock(scope) || ts.isSourceFile(scope)
      ? scope.statements
      : undefined;
    if (statements) {
      for (const statement of statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body) {
          return statement;
        }
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === name &&
              declaration.initializer &&
              (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
            ) {
              return declaration.initializer;
            }
          }
        }
      }
    }
    scope = scope.parent;
  }
  return undefined;
}

function describeArgument(node: ts.Expression, sourceFile: ts.SourceFile): string {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "inline function";
  if (ts.isCallExpression(node)) return `${node.expression.getText(sourceFile)}(…)`;
  return node.getText(sourceFile);
}

export interface RouteFactsOptions {
  /**
   * Statuses answered inside imported functions the routes use as gates,
   * by name — e.g. `authenticateToken` from server/auth.ts, read with
   * statusesOfFunction() so they follow that file's source.
   */
  importedStatuses?: Record<string, number[]>;
}

class FactCollector {
  params = new Map<string, Set<string>>();
  query = new Map<string, Set<string>>();
  body = new Set<string>();
  bodyFields = new Set<string>();
  authChecks = new Set<string>();
  storageMethods = new Set<string>();
  sideEffects = new Set<string>();
  statuses = new Set<number>();
  dtos = new Set<string>();
  errorText = new Set<string>();
  capabilityGates = new Set<string>();
  entitlementGates = new Set<string>();
  rateLimits = new Set<string>();
  idempotency = new Set<string>();
  helpers = new Set<string>();
  private visited = new Set<ts.Node>();
  /** >0 while reading inside an authorization check: its comparisons are the check itself. */
  private quiet = 0;

  constructor(
    private sourceFile: ts.SourceFile,
    private importedStatuses: Record<string, number[]> = {},
  ) {}

  /** Adds the statuses an imported gate answers, when `name` is one. */
  noteImportedGate(name: string) {
    for (const status of this.importedStatuses[name] ?? []) this.statuses.add(status);
  }

  private text(node: ts.Node): string {
    return compact(node.getText(this.sourceFile));
  }

  /**
   * Reads one function (handler, middleware or helper) once. `quietly`: an
   * authorization check, whose storage reads, statuses and effects count but
   * whose comparisons are already named by the check.
   */
  readFunction(fn: ts.FunctionLikeDeclaration, quietly = false) {
    if (this.visited.has(fn)) return;
    this.visited.add(fn);
    if (quietly) this.quiet++;
    try {
      if (fn.body) this.visit(fn.body);
    } finally {
      if (quietly) this.quiet--;
    }
  }

  private noteAccess(map: Map<string, Set<string>>, name: string, node: ts.Node) {
    const parser = this.parserOf(node);
    const parsers = map.get(name) ?? new Set<string>();
    parsers.add(parser);
    map.set(name, parsers);
  }

  /**
   * The strict parser a `req.params.x` / `req.query.x` read is passed to;
   * "checked" for a presence test (`=== undefined`, `typeof`), which uses no
   * value; otherwise "raw".
   */
  private parserOf(node: ts.Node): string {
    let current: ts.Node = node;
    if (ts.isTypeOfExpression(node.parent)) return "checked";
    if (
      ts.isBinaryExpression(node.parent) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(node.parent.operatorToken.kind)
    ) {
      const other = node.parent.left === node ? node.parent.right : node.parent.left;
      if (other.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(other) && other.text === "undefined")) {
        return "checked";
      }
    }
    // Look through `String(…)`, `as` casts and parentheses to the call it feeds.
    while (
      current.parent &&
      (ts.isAsExpression(current.parent) || ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent))
    ) {
      current = current.parent;
    }
    const parent = current.parent;
    if (parent && ts.isCallExpression(parent) && parent.arguments.includes(current as ts.Expression)) {
      const callee = parent.expression.getText(this.sourceFile);
      if (STRICT_PARSERS.has(callee)) return callee;
    }
    return "raw";
  }

  private requestPart(node: ts.Expression): "params" | "query" | "body" | undefined {
    // req.params / req.query / req.body, optionally via `(req as any)`
    if (!ts.isPropertyAccessExpression(node)) return undefined;
    let object: ts.Expression = node.expression;
    while (ts.isParenthesizedExpression(object) || ts.isAsExpression(object)) object = object.expression;
    if (!ts.isIdentifier(object) || !REQUEST_NAMES.has(object.text)) return undefined;
    const part = node.name.text;
    return part === "params" || part === "query" || part === "body" ? part : undefined;
  }

  private isNullishOrLiteral(node: ts.Expression): boolean {
    return (
      node.kind === ts.SyntaxKind.NullKeyword ||
      (ts.isIdentifier(node) && node.text === "undefined") ||
      ts.isNumericLiteral(node) ||
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword
    );
  }

  private visit = (node: ts.Node): void => {
    // Property reads of the request.
    if (ts.isPropertyAccessExpression(node)) {
      const part = this.requestPart(node.expression);
      if (part === "params") this.noteAccess(this.params, node.name.text, node);
      else if (part === "query") this.noteAccess(this.query, node.name.text, node);
      else if (part === "body") this.bodyFields.add(node.name.text);

      const text = this.text(node);
      if (text.startsWith("config.features.")) this.capabilityGates.add(text);
      if (/^(req|_req|request)\.file$/.test(text)) this.body.add("file");
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      const part = this.requestPart(node.expression);
      const key = node.argumentExpression.text;
      if (part === "params") this.noteAccess(this.params, key, node);
      else if (part === "query") this.noteAccess(this.query, key, node);
      else if (part === "body") this.bodyFields.add(key);
      if (/^(req|_req|request)\.headers$/.test(this.text(node.expression)) && /idempotency/i.test(key)) {
        this.idempotency.add(`${key.toLowerCase()} header`);
      }
    }
    // `const { a, b } = req.params | req.query | req.body`
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      let initializer: ts.Expression = node.initializer;
      while (ts.isParenthesizedExpression(initializer) || ts.isAsExpression(initializer)) initializer = initializer.expression;
      const part = this.requestPart(initializer);
      if (part) {
        for (const element of node.name.elements) {
          const key = element.propertyName ?? element.name;
          if (!ts.isIdentifier(key)) continue;
          if (part === "params") this.params.set(key.text, new Set(["raw", ...(this.params.get(key.text) ?? [])]));
          else if (part === "query") this.query.set(key.text, new Set(["raw", ...(this.query.get(key.text) ?? [])]));
          else this.bodyFields.add(key.text);
        }
      }
    }
    if (ts.isIdentifier(node)) {
      if (ENTITLEMENT_NAMES.has(node.text) && !ts.isPropertyAccessExpression(node.parent)) {
        this.entitlementGates.add(node.text);
      }
    }
    if (ts.isBinaryExpression(node)) this.readComparison(node);
    if (ts.isCallExpression(node)) this.readCall(node);

    ts.forEachChild(node, this.visit);
  };

  private readComparison(node: ts.BinaryExpression) {
    if (this.quiet > 0) return;
    const operator = node.operatorToken.kind;
    if (
      operator !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
      operator !== ts.SyntaxKind.ExclamationEqualsEqualsToken &&
      operator !== ts.SyntaxKind.EqualsEqualsToken &&
      operator !== ts.SyntaxKind.ExclamationEqualsToken
    ) {
      return;
    }
    const left = this.text(node.left);
    const right = this.text(node.right);
    const tenantish = (text: string) => /(^|\.|\?\.)(merchantId|userId|ownerId)$/.test(text);
    const roleish = (text: string) => /(^|\.|\?\.)role$/.test(text);
    // A request value compared with a configured secret (a webhook's shared key).
    const secretish = (text: string) => /^(config\.|process\.env)/.test(text) && /secret|key|token|pass/i.test(text);
    const tenantComparison =
      (tenantish(left) && !this.isNullishOrLiteral(node.right)) ||
      (tenantish(right) && !this.isNullishOrLiteral(node.left));
    const secretComparison =
      (secretish(left) && !this.isNullishOrLiteral(node.right)) ||
      (secretish(right) && !this.isNullishOrLiteral(node.left));
    if (tenantComparison || secretComparison || roleish(left) || roleish(right)) {
      this.authChecks.add(`compares ${this.text(node)}`);
    }
  }

  private readCall(node: ts.CallExpression) {
    const callee = this.text(node.expression);
    const calleeName = ts.isIdentifier(node.expression)
      ? node.expression.text
      : ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : "";

    // Responses: `res.status(4xx)`, `res.sendStatus(…)`, `res.redirect(…)`, and a
    // send with no status on its chain (`res.json(…)`, `res.type(…).send(…)`): 200.
    if (ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      const method = node.expression.name.text;
      const chain = this.responseChain(target);
      if (chain.rooted && (method === "status" || method === "sendStatus")) {
        const code = node.arguments[0];
        if (code && ts.isNumericLiteral(code)) this.statuses.add(Number(code.text));
        // `res.status(ok ? 200 : 207)`: both.
        if (code && ts.isConditionalExpression(code)) {
          for (const branch of [code.whenTrue, code.whenFalse]) {
            if (ts.isNumericLiteral(branch)) this.statuses.add(Number(branch.text));
          }
        }
      }
      if (chain.rooted && method === "redirect") {
        const code = node.arguments[0];
        this.statuses.add(code && ts.isNumericLiteral(code) && node.arguments.length > 1 ? Number(code.text) : 302);
      }
      if (chain.rooted && !chain.hasStatus && ["json", "send", "end", "sendFile"].includes(method)) {
        this.statuses.add(200);
      }
      if (["json", "send", "end", "redirect"].includes(method)) this.readResponseBody(node);

      // storage.<method>(…)
      if (ts.isIdentifier(target) && target.text === "storage") {
        this.storageMethods.add(method);
      }
    }

    // Validation of the body.
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "safeParse" || node.expression.name.text === "parse") &&
      node.arguments[0] &&
      this.requestPart(node.arguments[0]) === "body"
    ) {
      this.body.add(`schema: ${this.text(node.expression.expression)}`);
    }
    // The whole body handed to another call.
    for (const argument of node.arguments) {
      if (this.requestPart(argument) === "body" && !/\.(safeParse|parse)$/.test(callee)) {
        this.body.add(`whole body: ${callee}`);
      }
    }

    if (calleeName.endsWith("Dto")) this.dtos.add(calleeName);

    if (AUTH_CHECK_CALLS.has(callee) || AUTH_CHECK_CALLS.has(calleeName)) {
      this.authChecks.add(AUTH_CHECK_CALLS.has(callee) ? callee : calleeName);
    }
    // Recorded even inside a check followed quietly: it is how that check compares.
    if (calleeName === "timingSafeEqual") this.authChecks.add(`constant-time comparison: ${callee}`);
    const effect = CONFIGURATION_READS.has(callee) ? undefined :
      SIDE_EFFECT_CALLS[callee] ??
      SIDE_EFFECT_PREFIXES.find(([prefix]) => callee.startsWith(prefix))?.[1] ??
      (EMAIL_SENDER.test(calleeName) ? "email" : undefined);
    if (effect) this.sideEffects.add(`${effect}: ${callee}`);
    if (CAPABILITY_CALLS.has(callee)) this.capabilityGates.add(callee);
    // A storage budget that refuses a request once spent (consume…Limit) is a rate limit too.
    if (/RateLimit|Limiter|tooManyAttempts|TooManyAttempts|consume\w*Limit$/.test(callee)) this.rateLimits.add(callee);
    if (/idempotency|claim/i.test(calleeName)) this.idempotency.add(calleeName);

    // Follow a helper defined in this file. An authorization check is followed
    // quietly and not listed as a helper: it is recorded above.
    if (ts.isIdentifier(node.expression)) {
      this.noteImportedGate(node.expression.text);
      const helper = resolveLocalFunction(node.expression);
      if (helper) {
        const isCheck = AUTH_CHECK_CALLS.has(node.expression.text);
        if (!isCheck) this.helpers.add(node.expression.text);
        this.readFunction(helper, isCheck);
      }
    }
  }

  /** Whether a call chain starts at the response object, and whether it sets a status on the way. */
  private responseChain(start: ts.Expression): { rooted: boolean; hasStatus: boolean } {
    let node: ts.Expression = start;
    let hasStatus = false;
    for (;;) {
      if (ts.isIdentifier(node)) return { rooted: RESPONSE_NAMES.has(node.text), hasStatus };
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (["status", "sendStatus"].includes(node.expression.name.text)) hasStatus = true;
        node = node.expression.expression;
      } else if (ts.isPropertyAccessExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
        node = node.expression;
      } else {
        return { rooted: false, hasStatus };
      }
    }
  }

  /** Records where an error's own text is put into a response body. */
  private readResponseBody(call: ts.CallExpression) {
    // `(error as Error).message` is `error.message`: look through casts and parentheses.
    const unwrap = (node: ts.Expression): ts.Expression => {
      let inner = node;
      while (ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner) || ts.isNonNullExpression(inner)) {
        inner = inner.expression;
      }
      return inner;
    };
    const find = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        const name = node.name.text;
        const owner = this.text(unwrap(node.expression));
        const ownerLast = owner.split(/\?\.|\./).pop() ?? owner;
        if (
          (["message", "stack"].includes(name) && ERROR_NAMES.test(ownerLast)) ||
          (["errors", "issues"].includes(name) && /(^|\.)error$/.test(owner))
        ) {
          this.errorText.add(this.text(node));
          return;
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "String" &&
        node.arguments[0] &&
        ts.isIdentifier(unwrap(node.arguments[0])) &&
        ERROR_NAMES.test((unwrap(node.arguments[0]) as ts.Identifier).text)
      ) {
        this.errorText.add(this.text(node));
        return;
      }
      ts.forEachChild(node, find);
    };
    for (const argument of call.arguments) find(argument);
  }

  result(middleware: string[]): RouteFacts {
    const sorted = (values: Iterable<string>) => [...values].sort();
    // A presence check next to a real read says nothing more; alone, it is kept.
    const withParsers = (map: Map<string, Set<string>>) =>
      [...map.entries()]
        .map(([name, parsers]) => {
          const used = [...parsers].filter((parser) => parser !== "checked");
          return `${name}: ${sorted(used.length > 0 ? used : parsers).join(" | ")}`;
        })
        .sort();
    const body = new Set(this.body);
    if (this.bodyFields.size > 0) body.add(`fields: ${sorted(this.bodyFields).join(", ")}`);
    return {
      middleware,
      params: withParsers(this.params),
      query: withParsers(this.query),
      body: sorted(body),
      authChecks: sorted(this.authChecks),
      storageMethods: sorted(this.storageMethods),
      sideEffects: sorted(this.sideEffects),
      statuses: [...this.statuses].sort((a, b) => a - b),
      dtos: sorted(this.dtos),
      errorTextInResponse: sorted(this.errorText),
      capabilityGates: sorted(this.capabilityGates),
      entitlementGates: sorted(this.entitlementGates),
      rateLimits: sorted(this.rateLimits),
      idempotency: sorted(this.idempotency),
      helpers: sorted(this.helpers),
    };
  }
}

/**
 * The facts of every route registered in one file, keyed "METHOD path", in
 * registration order.
 */
export function extractRouteFacts(
  sourceText: string,
  fileName: string,
  options: RouteFactsOptions = {},
): Map<string, RouteFacts> {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const bindings = new Set([...findExpressBindings(sourceFile), "app", "router"]);
  const facts = new Map<string, RouteFacts>();

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      bindings.has(node.expression.expression.text) &&
      node.expression.name.text in ROUTE_METHODS &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const method = ROUTE_METHODS[node.expression.name.text];
      const routePath = (node.arguments[0] as ts.StringLiteralLike).text;
      const collector = new FactCollector(sourceFile, options.importedStatuses);
      const middlewareArgs = node.arguments.slice(1, -1);
      const handler = node.arguments[node.arguments.length - 1];

      for (const argument of middlewareArgs) {
        if (ts.isIdentifier(argument)) {
          if (CAPABILITY_CALLS.has(argument.text)) collector.capabilityGates.add(argument.text);
          collector.noteImportedGate(argument.text);
          // A middleware defined in this file is read like a helper (the
          // admin gate's own checks, a limiter's storage use).
          const middleware = resolveLocalFunction(argument);
          if (middleware) {
            collector.helpers.add(argument.text);
            collector.readFunction(middleware);
          }
        } else if (isFunctionLike(argument)) {
          collector.readFunction(argument as ts.FunctionLikeDeclaration);
        }
      }
      if (isFunctionLike(handler)) {
        collector.readFunction(handler as ts.FunctionLikeDeclaration);
      } else if (ts.isIdentifier(handler)) {
        const named = resolveLocalFunction(handler);
        if (named) {
          collector.helpers.add(handler.text);
          collector.readFunction(named);
        }
      }

      facts.set(`${method} ${routePath}`, collector.result(middlewareArgs.map((arg) => describeArgument(arg, sourceFile))));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return facts;
}

/**
 * The statuses one function in a file can answer, reading the helpers it
 * calls in that file too — for an imported gate such as server/auth.ts's
 * authenticateToken, whose answers belong to every route that uses it.
 */
export function statusesOfFunction(sourceText: string, fileName: string, functionName: string): number[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === functionName && !!statement.body,
  );
  if (!declaration) throw new Error(`${fileName}: no function ${functionName}`);
  const collector = new FactCollector(sourceFile);
  collector.readFunction(declaration);
  return collector.result([]).statuses;
}

/** RouteFacts as the policy file records them: empty lists left out. */
export type RecordedRouteFacts = Partial<RouteFacts>;

const FACT_FIELDS: Array<keyof RouteFacts> = [
  "middleware",
  "params",
  "query",
  "body",
  "authChecks",
  "storageMethods",
  "sideEffects",
  "statuses",
  "dtos",
  "errorTextInResponse",
  "capabilityGates",
  "entitlementGates",
  "rateLimits",
  "idempotency",
  "helpers",
];

export function compactFacts(facts: RouteFacts): RecordedRouteFacts {
  const recorded: Record<string, unknown> = {};
  for (const field of FACT_FIELDS) {
    if (facts[field].length > 0) recorded[field] = facts[field];
  }
  return recorded as RecordedRouteFacts;
}

export function expandFacts(recorded: RecordedRouteFacts): RouteFacts {
  const facts: Record<string, unknown> = {};
  for (const field of FACT_FIELDS) facts[field] = recorded[field] ?? [];
  return facts as unknown as RouteFacts;
}

/**
 * The facts of every route in every registration file, as the code stands:
 * what scripts/generate-route-policy.ts records and what
 * route-policy-facts.test.ts compares the record with.
 */
export function currentRouteFacts(repoRoot = process.cwd()): Map<string, RouteFacts> {
  const read = (file: string) => fs.readFileSync(path.join(repoRoot, file), "utf8");
  const importedStatuses = {
    authenticateToken: statusesOfFunction(read("server/auth.ts"), "server/auth.ts", "authenticateToken"),
  };
  const all = new Map<string, RouteFacts>();
  for (const file of REGISTRATION_FILES) {
    for (const [key, facts] of extractRouteFacts(read(file), file, { importedStatuses })) all.set(key, facts);
  }
  return all;
}
