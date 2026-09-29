/**
 * ts-jest AST transformer: rewrite `import.meta` into a plain object literal so
 * Vite-style `import.meta.env.*` reads work under ts-jest's CommonJS target.
 *
 * Vite injects `import.meta.env` at build time; ts-jest (module: commonjs) does
 * not, and TS even rejects the syntax (TS1343). We replace every `import.meta`
 * meta-property with `{ env: { ... } }` so the tests can import the terminal
 * pages that reference `import.meta.env.DEV` / `VITE_*`.
 *
 * Env values mirror the test runtime: DEV false / PROD true, plus the VITE_*
 * keys the code actually reads. Unknown keys resolve to undefined, which is the
 * same behaviour Vite gives for an unset variable.
 */
const ts = require('typescript');

module.exports = {
  // Bump when the emitted shape changes so ts-jest invalidates its cache.
  version: 1,
  name: 'import-meta-transformer',
  factory: (compilerInstance) => {
    const f = ts.factory;

    const buildEnvObject = () =>
      f.createObjectLiteralExpression(
        [
          f.createPropertyAssignment(
            'env',
            f.createObjectLiteralExpression(
              [
                f.createPropertyAssignment('DEV', f.createFalse()),
                f.createPropertyAssignment('PROD', f.createTrue()),
                f.createPropertyAssignment('MODE', f.createStringLiteral('test')),
                f.createPropertyAssignment('VITE_MOCK', f.createStringLiteral('0')),
                f.createPropertyAssignment('VITE_BUILD_TIME', f.createIdentifier('undefined')),
              ],
              true,
            ),
          ),
        ],
        true,
      );

    return (context) => {
      const visit = (node) => {
        if (
          ts.isMetaProperty(node) &&
          node.keywordToken === ts.SyntaxKind.ImportKeyword &&
          node.name.escapedText === 'meta'
        ) {
          return f.createParenthesizedExpression(buildEnvObject());
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (sourceFile) => ts.visitNode(sourceFile, visit);
    };
  },
};
