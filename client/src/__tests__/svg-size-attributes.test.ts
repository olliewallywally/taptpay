import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * R1-T10c — the width and height of an svg shape are lengths. "auto" is a CSS value, not a length: the
 * browser ignores the attribute and writes an error to the console every time the page draws
 * (`Error: <svg> attribute height: Expected length, "auto"`). The device matrix found one on the
 * phone's transactions page. Size a shape with a number or a percentage, or leave it to CSS.
 *
 * Read from the source, because jsdom does not check an svg attribute's value.
 */
const ROOT = path.resolve(process.cwd(), "client/src");
/** The svg elements whose width and height attributes are lengths. */
const SIZED = new Set(["svg", "rect", "image", "foreignObject", "use", "pattern", "mask", "filter"]);
const NOT_A_LENGTH = /^(auto|inherit|initial|unset|fit-content|max-content|min-content)$/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(tsx|jsx)$/.test(entry.name) && !/\.(test|spec)\.(tsx|jsx)$/.test(entry.name) ? [file] : [];
  });
}

/** The size attributes in a file's JSX that are written out and are not lengths. */
function notLengths(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && SIZED.has(node.tagName.text)) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !["width", "height"].includes(attribute.name.getText(source))) continue;
        const value = attribute.initializer;
        const written = value && ts.isStringLiteral(value) ? value.text
          : value && ts.isJsxExpression(value) && value.expression && (ts.isStringLiteral(value.expression) || ts.isNoSubstitutionTemplateLiteral(value.expression)) ? value.expression.text
          : null;
        if (written !== null && NOT_A_LENGTH.test(written.trim())) {
          found.push(`${path.relative(process.cwd(), file)}:${source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1}: <${node.tagName.text} ${attribute.getText(source)}>`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("R1-T10c — an svg shape's width and height", () => {
  const files = sources(ROOT);

  it("are lengths in every page, never a CSS word such as \"auto\"", () => {
    expect(files.flatMap((file) => notLengths(file, fs.readFileSync(file, "utf8")))).toEqual([]);
    expect(files.length).toBeGreaterThan(150);
  });

  it("the reading itself tells a length from a word", () => {
    const read = (code: string) => notLengths("probe.tsx", code).length;
    for (const wrong of [
      'const a = <svg viewBox="0 0 10 10" width="100%" height="auto" />;',
      "const a = <svg width='auto'><path d=\"M0 0\" /></svg>;",
      'const a = <svg height={"auto"} />;',
      "const a = <svg height={`auto`} />;",
      'const a = <svg><rect width="auto" height="4" /></svg>;',
      'const a = <svg onClick={() => go()} height="auto" />;',
    ]) {
      expect([wrong, read(wrong)]).toEqual([wrong, 1]);
    }
    for (const fine of [
      'const a = <svg viewBox="0 0 10 10" width="100%" />;',
      'const a = <svg width="24" height={24} style={{ height: "auto" }} />;',
      "const a = <svg width={size} height={size * 2} />;",
      'const a = <img width="auto" height="auto" />;',
      'const a = <div style={{ height: "auto" }} />;',
      '// <svg height="auto" />\nconst a = 1;',
    ]) {
      expect([fine, read(fine)]).toEqual([fine, 0]);
    }
  });
});
