/** Pure, allowlisted AST analysis. Never imports or executes application code. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  extractSourceInventory,
  type RouteRegistration,
  type MiddlewareUse,
} from './route-inventory';
import {
  DOMAIN_ROUTE_REGISTRARS,
  HARNESS_ROUTE_ROOTS,
  type RouteRegistrar,
} from './route-composition-manifest';

export interface LocatedRoute extends RouteRegistration {
  file: string;
}
export type CompositionStep =
  | (LocatedRoute & { kind: 'route' })
  | (MiddlewareUse & { file: string; kind: 'middleware' });
export interface RegistrarInvocation {
  definition: ts.FunctionDeclaration;
  call?: ts.CallExpression;
  app: string;
}
export interface RouteComposition {
  registrations: LocatedRoute[];
  steps: CompositionStep[];
  sourceFiles: Map<string, ts.SourceFile>;
  invocations: Map<ts.FunctionDeclaration, RegistrarInvocation>;
}

function descriptorKey(registrar: RouteRegistrar): string {
  if (
    !/^server\/(?:[\w-]+\/)*[\w-]+\.ts$/.test(registrar.file) ||
    !/^[A-Za-z_$][\w$]*$/.test(registrar.name) ||
    !/^[A-Za-z_$][\w$]*$/.test(registrar.app)
  ) {
    throw Error('INVALID_ROUTE_REGISTRAR');
  }
  return `${registrar.file}:${registrar.name}`;
}

function relativeImport(file: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(file), specifier)
  );
  return resolved.replace(/\.js$/, '.ts').replace(/(?<!\.ts)$/, '.ts');
}

/** The supported boundary is a named synchronous registrar on the same app.
 * Conditional, deferred, cyclic, shadowed and hidden assembly needs new review.
 */
export function composeRouteRegistrations(options: {
  sources: Record<string, string>;
  roots: readonly RouteRegistrar[];
  registrars: readonly RouteRegistrar[];
}): RouteComposition {
  const descriptors = [...options.roots, ...options.registrars];
  const allowed = new Map<string, RouteRegistrar>();
  const allowedFiles = new Set<string>();
  for (const descriptor of descriptors) {
    const key = descriptorKey(descriptor);
    if (allowed.has(key)) throw Error('DUPLICATE_ROUTE_DESCRIPTOR');
    allowed.set(key, descriptor);
    allowedFiles.add(descriptor.file);
  }
  if (!options.roots.length) throw Error('EMPTY_ROUTE_ROOTS');

  const sourceFiles = new Map<string, ts.SourceFile>();
  for (const [file, text] of Object.entries(options.sources)) {
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS
    );
    const diagnostics = (
      source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
    ).parseDiagnostics;
    if (diagnostics.length) throw Error('ROUTE_SOURCE_PARSE_ERROR');
    const inventory = extractSourceInventory(text, file);
    if (
      !allowedFiles.has(file) &&
      (inventory.registrations.length || inventory.uses.length)
    ) {
      throw Error('UNLISTED_ROUTE_SOURCE');
    }
    sourceFiles.set(file, source);
  }
  for (const file of allowedFiles)
    if (!sourceFiles.has(file)) throw Error('MISSING_ROUTE_SOURCE');

  const steps: CompositionStep[] = [];
  const invocations = new Map<ts.FunctionDeclaration, RegistrarInvocation>();
  const active = new Set<string>();
  const reached = new Set<string>();
  const declaredRoutes = new Set<string>();

  function visitRegistrar(
    descriptor: RouteRegistrar,
    call?: ts.CallExpression
  ): void {
    const key = descriptorKey(descriptor);
    if (active.has(key)) throw Error('CYCLIC_ROUTE_REGISTRAR');
    if (reached.has(key)) throw Error('REPEATED_ROUTE_REGISTRAR');
    const source = sourceFiles.get(descriptor.file)!;
    const definitions = source.statements.filter(
      (node): node is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === descriptor.name &&
        !!node.body &&
        !!node.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
    );
    if (definitions.length !== 1) throw Error('MISSING_ROUTE_REGISTRAR_EXPORT');
    const definition = definitions[0];
    if (descriptor.guard) {
      const first = definition.body!.statements[0];
      const expression =
        first && ts.isExpressionStatement(first) ? first.expression : undefined;
      if (
        !expression ||
        !ts.isCallExpression(expression) ||
        !ts.isIdentifier(expression.expression) ||
        expression.expression.text !== descriptor.guard ||
        !ts.isIdentifier(expression.arguments[0]) ||
        expression.arguments[0].text !== descriptor.app
      )
        throw Error('ROUTE_ASYNC_GUARD_ORDER');
    }
    if (
      call &&
      (definition.asteriskToken ||
        definition.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword
        ))
    ) {
      throw Error('ASYNC_ROUTE_REGISTRAR');
    }
    if (
      call &&
      (!ts.isIdentifier(definition.parameters[0]?.name) ||
        (definition.parameters[0].name as ts.Identifier).text !==
          descriptor.app)
    ) {
      throw Error('ROUTE_REGISTRAR_PARAMETER_MISMATCH');
    }
    const imports = new Map<string, RouteRegistrar>();
    const registrarNames = new Set<string>();
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const target = relativeImport(
        descriptor.file,
        statement.moduleSpecifier.text
      );
      const bindings = statement.importClause?.namedBindings;
      if (target && allowedFiles.has(target)) {
        if (statement.importClause?.name)
          registrarNames.add(statement.importClause.name.text);
        if (bindings && ts.isNamespaceImport(bindings))
          registrarNames.add(bindings.name.text);
      }
      if (!target || !bindings || !ts.isNamedImports(bindings)) continue;
      for (const binding of bindings.elements) {
        if (binding.isTypeOnly || statement.importClause?.isTypeOnly) continue;
        const imported = binding.propertyName?.text ?? binding.name.text;
        const matched = allowed.get(`${target}:${imported}`);
        if (matched) {
          imports.set(binding.name.text, matched);
          registrarNames.add(binding.name.text);
        }
      }
    }
    const refersToRegistrar = (node: ts.Node): boolean => {
      if (ts.isIdentifier(node) && registrarNames.has(node.text)) return true;
      return (
        ts.forEachChild(node, child =>
          refersToRegistrar(child) ? true : undefined
        ) ?? false
      );
    };
    // An alias must not hide an additional registration call beside a valid one.
    for (let previous = -1; previous !== registrarNames.size; ) {
      previous = registrarNames.size;
      const aliases = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          refersToRegistrar(node.initializer)
        ) {
          registrarNames.add(node.name.text);
        }
        ts.forEachChild(node, aliases);
      };
      aliases(definition.body!);
    }
    const bindingNames = (name: ts.BindingName): string[] =>
      ts.isIdentifier(name)
        ? [name.text]
        : name.elements.flatMap(element =>
            ts.isOmittedExpression(element) ? [] : bindingNames(element.name)
          );
    const shadowCheck = (node: ts.Node): void => {
      if (
        (ts.isVariableDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isParameter(node)) &&
        node.name &&
        bindingNames(node.name).some(name => imports.has(name))
      ) {
        throw Error('SHADOWED_ROUTE_REGISTRAR');
      }
      ts.forEachChild(node, shadowCheck);
    };
    shadowCheck(definition.body!);
    const checkCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && refersToRegistrar(node.expression)) {
        if (
          !ts.isIdentifier(node.expression) ||
          !imports.has(node.expression.text)
        )
          throw Error('INDIRECT_ROUTE_REGISTRAR');
        let parent: ts.Node = node.parent;
        if (ts.isAwaitExpression(parent)) parent = parent.parent;
        if (
          !ts.isExpressionStatement(parent) ||
          parent.parent !== definition.body
        )
          throw Error('CONDITIONAL_ROUTE_REGISTRAR');
        if (
          node.arguments.length > 2 ||
          (node.arguments[1] &&
            !ts.isObjectLiteralExpression(node.arguments[1]))
        ) {
          throw Error('UNSUPPORTED_ROUTE_DEPENDENCY_BINDING');
        }
        const bag = node.arguments[1];
        if (bag && ts.isObjectLiteralExpression(bag)) {
          if (
            bag.properties.some(
              property =>
                !ts.isShorthandPropertyAssignment(property) &&
                !ts.isPropertyAssignment(property)
            )
          ) {
            throw Error('UNSUPPORTED_ROUTE_DEPENDENCY_BINDING');
          }
        }
      }
      ts.forEachChild(node, checkCalls);
    };
    checkCalls(definition.body!);
    active.add(key);
    reached.add(key);
    invocations.set(definition, { definition, call, app: descriptor.app });

    const visit = (node: ts.Node): void => {
      // An app registration in a handler/deferred function is not boot assembly.
      if (node !== definition.body && ts.isFunctionLike(node)) return;
      if (ts.isCallExpression(node)) {
        if (
          ts.isIdentifier(node.expression) &&
          imports.has(node.expression.text)
        ) {
          if (
            !ts.isIdentifier(node.arguments[0]) ||
            node.arguments[0].text !== descriptor.app
          ) {
            throw Error('ROUTE_REGISTRAR_APP_MISMATCH');
          }
          let parent: ts.Node = node.parent;
          if (ts.isAwaitExpression(parent)) parent = parent.parent;
          if (
            !ts.isExpressionStatement(parent) ||
            parent.parent !== definition.body
          ) {
            throw Error('CONDITIONAL_ROUTE_REGISTRAR');
          }
          visitRegistrar(imports.get(node.expression.text)!, node);
          return;
        }
        const expression = node.expression;
        const target =
          ts.isPropertyAccessExpression(expression) ||
          ts.isElementAccessExpression(expression)
            ? expression.expression
            : undefined;
        if (
          target &&
          ts.isIdentifier(target) &&
          target.text === descriptor.app
        ) {
          const found = extractSourceInventory(
            node.getText(source),
            descriptor.file,
            descriptor.app
          );
          if (found.registrations.length + found.uses.length > 1) {
            throw Error('DEFERRED_SOURCE_REGISTRATION');
          }
          const line =
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1;
          for (const route of found.registrations) {
            const routeKey = `${route.method} ${route.path}`;
            if (declaredRoutes.has(routeKey))
              throw Error('DUPLICATE_ROUTE_REGISTRATION');
            declaredRoutes.add(routeKey);
            steps.push({
              ...route,
              file: descriptor.file,
              line,
              kind: 'route',
            });
          }
          for (const middleware of found.uses) {
            if (middleware.looksLikeMountedRouter)
              throw Error('UNREVIEWED_ROUTE_MOUNT');
            steps.push({
              ...middleware,
              file: descriptor.file,
              line,
              kind: 'middleware',
            });
          }
          if (found.registrations.length || found.uses.length) return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(definition.body!);
    active.delete(key);
  }
  for (const root of options.roots) visitRegistrar(root);
  for (const registrar of descriptors)
    if (!reached.has(descriptorKey(registrar)))
      throw Error('UNREACHED_ROUTE_REGISTRAR');

  const identity = (step: CompositionStep): string =>
    JSON.stringify([
      step.file,
      step.line,
      step.kind,
      step.kind === 'route' ? step.method : step.mounts,
      step.path,
    ]);
  const expected: string[] = [];
  for (const file of allowedFiles) {
    const source = sourceFiles.get(file)!;
    const inventory = extractSourceInventory(source.text, file);
    expected.push(
      ...inventory.registrations.map(route =>
        identity({ ...route, file, kind: 'route' })
      ),
      ...inventory.uses.map(use =>
        identity({ ...use, file, kind: 'middleware' })
      )
    );
  }
  if (
    JSON.stringify(expected.sort()) !==
    JSON.stringify(steps.map(identity).sort())
  ) {
    throw Error('UNREACHED_SOURCE_REGISTRATION');
  }
  return {
    registrations: steps.filter(
      (step): step is LocatedRoute & { kind: 'route' } => step.kind === 'route'
    ),
    steps,
    sourceFiles,
    invocations,
  };
}

export function currentRouteComposition(
  repoRoot = process.cwd()
): RouteComposition {
  const files = [
    ...new Set(
      [...HARNESS_ROUTE_ROOTS, ...DOMAIN_ROUTE_REGISTRARS].map(
        registrar => registrar.file
      )
    ),
  ];
  return composeRouteRegistrations({
    sources: Object.fromEntries(
      files.map(file => [
        file,
        fs.readFileSync(path.join(repoRoot, file), 'utf8'),
      ])
    ),
    roots: HARNESS_ROUTE_ROOTS,
    registrars: DOMAIN_ROUTE_REGISTRARS,
  });
}

/** Ordered array comparison retains omissions, duplicates and precedence changes. */
export function routeOrderProblems(
  actual: readonly { method: string; path: string }[],
  expected: readonly { method: string; path: string }[]
): string[] {
  const problems: string[] = [];
  for (
    let index = 0;
    index < Math.max(actual.length, expected.length);
    index++
  ) {
    const key = (entry: { method: string; path: string } | undefined) =>
      entry ? `${entry.method} ${entry.path}` : '<missing>';
    if (key(actual[index]) !== key(expected[index]))
      problems.push(
        `route #${index + 1}: ${key(actual[index])} != ${key(expected[index])}`
      );
  }
  return problems;
}
