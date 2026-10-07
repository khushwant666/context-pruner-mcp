import ts from "typescript";
import { collectSameFileCallees, parseSourceFile } from "./callees.js";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const HIDDEN_BODY = "{ /* implementation hidden */ }";
const DEFAULT_FILE_NAME = "snippet.ts";

export interface PruneResult {
  text: string;
  symbolFound: boolean;
}

export interface PruneFocus {
  symbols?: readonly string[];
  expandCallees?: boolean;
  filePath?: string;
}

interface ResolvedFocus {
  symbols: string[];
  expandCallees: boolean;
  filePath?: string;
}

interface BodySpan {
  name: string | null;
  start: number;
  end: number;
}

export function pruneCodeToSkeleton(code: string, symbol?: string): PruneResult;
export function pruneCodeToSkeleton(code: string, focus: PruneFocus): PruneResult;
export function pruneCodeToSkeleton(code: string, symbolOrFocus?: string | PruneFocus): PruneResult {
  const focus = resolveFocus(symbolOrFocus);
  if (focus.expandCallees && !focus.filePath) {
    throw new Error("A file path is required to expand callees.");
  }

  const filePath = focus.filePath ?? DEFAULT_FILE_NAME;
  const keepNames = new Set(focus.symbols);
  if (focus.expandCallees && focus.filePath) {
    for (const callee of collectSameFileCallees(code, focus.filePath, focus.symbols)) {
      keepNames.add(callee);
    }
  }

  return hideUnkeptBodies(code, filePath, keepNames, focus.symbols);
}

function hideUnkeptBodies(
  code: string,
  filePath: string,
  keepNames: ReadonlySet<string>,
  requested: readonly string[],
): PruneResult {
  const sourceFile = parseSourceFile(code, filePath);
  const foundNames = new Set<string>();
  const replacements: BodySpan[] = [];

  const visit = (node: ts.Node, insideKept: boolean): void => {
    const body = namedBlock(node, sourceFile);
    if (!body) {
      ts.forEachChild(node, (child) => visit(child, insideKept));
      return;
    }

    const keep = body.name !== null && keepNames.has(body.name);
    if (keep && body.name !== null && requested.includes(body.name)) {
      foundNames.add(body.name);
    }
    if (!keep && !insideKept) {
      replacements.push(body);
      return;
    }
    ts.forEachChild(node, (child) => visit(child, insideKept || keep));
  };

  visit(sourceFile, false);
  const spans = omitNestedSpans(replacements);
  spans.sort((left, right) => right.start - left.start);

  let text = code;
  for (const span of spans) {
    text = text.slice(0, span.start) + HIDDEN_BODY + text.slice(span.end);
  }

  const missing = requested.filter((name) => !foundNames.has(name));
  if (missing.length > 0) {
    const note = missingSymbolNote(missing, requested.length);
    text = text.length > 0 ? `${text}\n${note}` : note;
  }
  return { text, symbolFound: foundNames.size > 0 };
}

function omitNestedSpans(spans: readonly BodySpan[]): BodySpan[] {
  return spans.filter((span, index) => {
    const nested = spans.some((other) => isStrictlyInside(span, other));
    if (nested) {
      return false;
    }
    const firstWithRange = spans.findIndex((other) => other.start === span.start && other.end === span.end);
    return firstWithRange === index;
  });
}

function isStrictlyInside(inner: BodySpan, outer: BodySpan): boolean {
  const contained = outer.start <= inner.start && inner.end <= outer.end;
  const smaller = outer.start < inner.start || outer.end > inner.end;
  return contained && smaller;
}

function namedBlock(node: ts.Node, sourceFile: ts.SourceFile): BodySpan | undefined {
  const block = blockBody(node);
  if (!block) {
    return undefined;
  }
  return {
    name: functionName(node),
    start: block.getStart(sourceFile),
    end: block.end,
  };
}

function blockBody(node: ts.Node): ts.Node | undefined {
  if (
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isFunctionExpression(node)
  ) {
    return node.body;
  }
  if (ts.isVariableDeclaration(node) && node.initializer && isFunctionValue(node.initializer)) {
    return functionValueBody(node.initializer);
  }
  if (ts.isArrowFunction(node)) {
    return functionValueBody(node);
  }
  return undefined;
}

function isFunctionValue(node: ts.Expression): node is ts.ArrowFunction | ts.FunctionExpression {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function functionValueBody(fn: ts.ArrowFunction | ts.FunctionExpression): ts.Node {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
    return fn.body;
  }
  return fn.body;
}

function functionName(node: ts.Node): string | null {
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) {
    return identifierText(node.name);
  }
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return identifierText(node.name);
  }
  if (ts.isVariableDeclaration(node)) {
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

function resolveFocus(symbolOrFocus?: string | PruneFocus): ResolvedFocus {
  if (typeof symbolOrFocus === "string" || symbolOrFocus === undefined) {
    const symbol = normalizeSymbol(symbolOrFocus);
    return { symbols: symbol ? [symbol] : [], expandCallees: false };
  }
  const symbols = (symbolOrFocus.symbols ?? []).map((name) => {
    const normalized = normalizeSymbol(name);
    if (!normalized) {
      throw new Error("Symbol names cannot be empty.");
    }
    return normalized;
  });
  return {
    symbols,
    expandCallees: symbolOrFocus.expandCallees === true,
    filePath: symbolOrFocus.filePath,
  };
}

function missingSymbolNote(missing: readonly string[], requestedCount: number): string {
  if (missing.length === 1 && requestedCount === 1) {
    return `// Symbol "${missing[0]}" was not found. Returned a skeleton only.`;
  }
  const quoted = missing.map((name) => `"${name}"`).join(", ");
  const suffix = missing.length === requestedCount ? " Returned a skeleton only." : "";
  return `// ${missing.length === 1 ? "Symbol" : "Symbols"} ${quoted} ${missing.length === 1 ? "was" : "were"} not found.${suffix}`;
}

export function normalizeSymbolList(
  symbol: string | undefined,
  symbols: string | readonly string[] | undefined,
): string[] {
  const rawNames: string[] = [];
  if (symbol !== undefined) {
    rawNames.push(symbol);
  }
  if (typeof symbols === "string") {
    rawNames.push(symbols);
  } else if (symbols) {
    rawNames.push(...symbols);
  }

  const unique: string[] = [];
  for (const name of rawNames) {
    const normalized = normalizeSymbol(name);
    if (!normalized) {
      throw new Error("Symbol names cannot be empty.");
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }
  return unique;
}

export function normalizeSymbol(symbol: string | undefined): string | undefined {
  const trimmed = symbol?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!IDENTIFIER.test(trimmed)) {
    throw new Error(
      `Symbol "${trimmed}" is not a function name. Use a name like chargeCustomer.`,
    );
  }
  return trimmed;
}
