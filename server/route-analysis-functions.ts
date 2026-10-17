/** Resolve only source functions and literal injected dependencies; never evaluate them. */
import path from 'node:path';
import ts from 'typescript';
import type { RouteComposition } from './route-composition';

type SourceFunction =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;
const isFunction = (node: ts.Node): node is SourceFunction =>
  (ts.isFunctionDeclaration(node) && !!node.body) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node);

export function routeFunctionResolver(
  composition: RouteComposition
): (expression: ts.Expression) => SourceFunction | undefined {
  function project(
    value: ts.Node | undefined,
    key: string,
    seen: Set<ts.Node>
  ): ts.Node | undefined {
    if (!value) return undefined;
    const resolved = resolve(value, seen);
    if (!resolved || !ts.isObjectLiteralExpression(resolved)) return undefined;
    if (
      resolved.properties.some(
        property =>
          !ts.isPropertyAssignment(property) &&
          !ts.isShorthandPropertyAssignment(property)
      )
    ) {
      throw Error('UNSUPPORTED_ROUTE_DEPENDENCY_BINDING');
    }
    const properties = resolved.properties.filter(
      property =>
        property.name &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        property.name.text === key
    );
    if (properties.length > 1) throw Error('DUPLICATE_ROUTE_DEPENDENCY');
    const property = properties[0];
    if (!property) return undefined;
    return resolve(
      ts.isShorthandPropertyAssignment(property)
        ? property.name
        : (property as ts.PropertyAssignment).initializer,
      seen
    );
  }

  function bindingValue(
    name: ts.BindingName,
    target: string,
    value: () => ts.Node | undefined,
    seen: Set<ts.Node>
  ): { found: boolean; value?: ts.Node } {
    if (ts.isIdentifier(name))
      return name.text === target
        ? { found: true, value: resolve(value(), seen) }
        : { found: false };
    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        if (!ts.isIdentifier(element.name) || element.name.text !== target)
          continue;
        if (
          element.dotDotDotToken ||
          (element.propertyName &&
            !ts.isIdentifier(element.propertyName) &&
            !ts.isStringLiteral(element.propertyName))
        ) {
          throw Error('UNSUPPORTED_ROUTE_DEPENDENCY_BINDING');
        }
        const key = element.propertyName
          ? (element.propertyName as ts.Identifier | ts.StringLiteral).text
          : target;
        return {
          found: true,
          value:
            project(value(), key, seen) ?? resolve(element.initializer, seen),
        };
      }
    }
    return { found: false };
  }

  function imported(
    identifier: ts.Identifier,
    source: ts.SourceFile,
    seen: Set<ts.Node>
  ): ts.Node | undefined {
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.importClause?.isTypeOnly
      )
        continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      const binding = bindings.elements.find(
        element => !element.isTypeOnly && element.name.text === identifier.text
      );
      if (!binding) continue;
      if (!statement.moduleSpecifier.text.startsWith('.')) return undefined;
      let file = path.posix.normalize(
        path.posix.join(
          path.posix.dirname(source.fileName),
          statement.moduleSpecifier.text
        )
      );
      file = file.replace(/\.js$/, '.ts');
      if (!file.endsWith('.ts')) file += '.ts';
      const target = composition.sourceFiles.get(file);
      if (!target) return undefined; // Existing external gates retain their explicit status/name classification.
      const name = binding.propertyName?.text ?? binding.name.text;
      for (const declaration of target.statements) {
        if (
          !ts.canHaveModifiers(declaration) ||
          !ts
            .getModifiers(declaration)
            ?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        )
          continue;
        if (
          ts.isFunctionDeclaration(declaration) &&
          declaration.name?.text === name &&
          declaration.body
        )
          return declaration;
        if (ts.isVariableStatement(declaration)) {
          const variable = declaration.declarationList.declarations.find(
            item => ts.isIdentifier(item.name) && item.name.text === name
          );
          if (variable) return resolve(variable.initializer, seen);
        }
      }
      throw Error('UNSUPPORTED_ROUTE_HELPER_EXPORT');
    }
    return undefined;
  }

  function resolve(
    node: ts.Node | undefined,
    prior: Set<ts.Node>
  ): ts.Node | undefined {
    if (!node) return undefined;
    if (prior.has(node)) throw Error('CYCLIC_ROUTE_DEPENDENCY');
    const seen = new Set(prior).add(node);
    if (isFunction(node) || ts.isObjectLiteralExpression(node)) return node;
    if (
      ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return resolve(node.expression, seen);
    if (ts.isPropertyAccessExpression(node))
      return project(node.expression, node.name.text, seen);
    if (!ts.isIdentifier(node)) return undefined;
    let scope: ts.Node | undefined = node.parent;
    while (scope) {
      if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
        for (const statement of scope.statements) {
          if (
            ts.isFunctionDeclaration(statement) &&
            statement.name?.text === node.text
          )
            return statement.body ? statement : undefined;
          if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              const value = bindingValue(
                declaration.name,
                node.text,
                () => declaration.initializer,
                seen
              );
              if (value.found) return value.value;
            }
          }
          if (
            (ts.isClassDeclaration(statement) ||
              ts.isEnumDeclaration(statement)) &&
            statement.name?.text === node.text
          )
            return undefined;
        }
      }
      if (ts.isFunctionLike(scope)) {
        for (let index = 0; index < scope.parameters.length; index++) {
          const parameter = scope.parameters[index];
          const value = bindingValue(
            parameter.name,
            node.text,
            () => {
              const invocation = ts.isFunctionDeclaration(scope!)
                ? composition.invocations.get(scope as ts.FunctionDeclaration)
                : undefined;
              return (
                invocation?.call?.arguments[index] ?? parameter.initializer
              );
            },
            seen
          );
          if (value.found) return value.value;
        }
      }
      if (ts.isSourceFile(scope)) return imported(node, scope, seen);
      scope = scope.parent;
    }
    return undefined;
  }
  return expression => {
    const value = resolve(expression, new Set());
    return value && isFunction(value) ? value : undefined;
  };
}
