import ts from "typescript";
import * as path from "path";

const SCRIPT_KINDS = new Map<string, ts.ScriptKind>([
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".js", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
]);

export const SUPPORTED_SOURCE_EXTENSIONS = [...SCRIPT_KINDS.keys()];

export function scriptKindForPath(filePath: string): ts.ScriptKind {
  const extension = path.extname(filePath).toLowerCase();
  const kind = SCRIPT_KINDS.get(extension);
  if (kind === undefined) {
    throw new Error(
      `Unsupported file type "${extension || "(none)"}". Supported types: ${SUPPORTED_SOURCE_EXTENSIONS.join(", ")}.`,
    );
  }
  return kind;
}

export function parseSourceFile(code: string, filePath: string): ts.SourceFile {
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      code,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(filePath),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse ${filePath}: ${message}`);
  }

  const syntaxError = syntaxDiagnostics(sourceFile)[0];
  if (syntaxError) {
    const message = ts.flattenDiagnosticMessageText(syntaxError.messageText, "\n");
    throw new Error(`Could not parse ${filePath}: ${message}`);
  }
  return sourceFile;
}

function syntaxDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
  const parsed = sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };
  return parsed.parseDiagnostics ?? [];
}

/**
 * Same-file functions reachable from the requested symbols.
 * If A calls B and B calls C, both B and C are returned.
 */
export function collectSameFileCallees(
  code: string,
  filePath: string,
  symbols: readonly string[],
): string[] {
  const sourceFile = parseSourceFile(code, filePath);
  const definedNames = collectDefinedFunctionNames(sourceFile);
  const requested = new Set(symbols);
  const discovered = new Set<string>();
  const walked = new Set<string>();
  let frontier = new Set(symbols);

  while (frontier.size > 0) {
    for (const name of frontier) {
      walked.add(name);
    }
    const next = new Set<string>();
    for (const calledName of directCallees(sourceFile, frontier, definedNames)) {
      if (!requested.has(calledName)) {
        discovered.add(calledName);
      }
      if (!walked.has(calledName)) {
        next.add(calledName);
      }
    }
    frontier = next;
  }

  return [...discovered];
}

function directCallees(
  sourceFile: ts.SourceFile,
  activeNames: ReadonlySet<string>,
  definedNames: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node, insideActive: boolean): void => {
    const name = declaredFunctionName(node);
    const nowInside = insideActive || (name !== null && activeNames.has(name));
    if (insideActive && ts.isCallExpression(node)) {
      const calledName = calleeName(node.expression);
      if (calledName && definedNames.has(calledName)) {
        found.push(calledName);
      }
    }
    ts.forEachChild(node, (child) => visit(child, nowInside));
  };
  visit(sourceFile, false);
  return found;
}

function collectDefinedFunctionNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    const name = declaredFunctionName(node);
    if (name) {
      names.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function declaredFunctionName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) {
    return identifierText(node.name);
  }
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return identifierText(node.name);
  }
  return null;
}

function identifierText(name: ts.Node | undefined): string | null {
  if (name && ts.isIdentifier(name)) {
    return name.text;
  }
  return null;
}

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return identifierText(expression.name);
  }
  return null;
}
