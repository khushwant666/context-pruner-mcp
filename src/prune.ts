const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const FUNCTION_DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\b/;
const VARIABLE_DECLARATION =
  /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
const METHOD_DECLARATION =
  /^(?:export\s+)?(?:(?:public|private|protected|async|static|readonly|abstract|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>\n]+>)?\s*\(/;

export interface PruneResult {
  text: string;
  symbolFound: boolean;
}

export function pruneCodeToSkeleton(code: string, symbol?: string): PruneResult {
  const focusedSymbol = normalizeSymbol(symbol);
  if (focusedSymbol === undefined) {
    return { text: pruneWithoutSymbol(code), symbolFound: false };
  }

  const lines = code.split("\n");
  const output: string[] = [];
  let depth = 0;
  let mode: "scan" | "keep" | "skip" = "scan";
  let stopDepth = 0;
  let awaiting: "keep" | "skip" | null = null;
  let awaitBaseDepth = 0;
  let symbolFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const nextDepth = depth + braceDelta(line);

    if (mode === "keep") {
      output.push(line);
      depth = nextDepth;
      if (depth <= stopDepth) {
        mode = "scan";
      }
      continue;
    }

    if (mode === "skip") {
      depth = nextDepth;
      if (depth <= stopDepth) {
        mode = "scan";
      }
      continue;
    }

    if (awaiting) {
      output.push(line);
      depth = nextDepth;
      if (nextDepth > awaitBaseDepth) {
        mode = awaiting;
        stopDepth = awaitBaseDepth;
        awaiting = null;
      } else if (trimmed.endsWith(";") && !trimmed.includes("{")) {
        awaiting = null;
      }
      continue;
    }

    const declaredName = declaredFunctionName(trimmed);
    if (declaredName !== null && opensFunction(trimmed)) {
      const keepThisFunction = declaredName === focusedSymbol;
      if (keepThisFunction) {
        symbolFound = true;
      }
      if (nextDepth === depth && !trimmed.includes("{")) {
        output.push(line);
        awaiting = keepThisFunction ? "keep" : "skip";
        awaitBaseDepth = depth;
        continue;
      }
      if (keepThisFunction) {
        output.push(line);
        if (nextDepth > depth) {
          mode = "keep";
          stopDepth = depth;
        }
      } else if (trimmed.includes("{")) {
        output.push(line.replace(/\{.*/, "{ /* implementation hidden */ }"));
        if (nextDepth > depth) {
          mode = "skip";
          stopDepth = depth;
        }
      } else {
        output.push(line);
      }
      depth = nextDepth;
      continue;
    }

    if (isStructuralLine(trimmed) || (trimmed.includes("class ") && trimmed.endsWith("{"))) {
      output.push(line);
      depth = nextDepth;
      continue;
    }

    if (trimmed === "}" && depth > 0) {
      output.push(line);
    }
    depth = nextDepth;
  }

  let text = output.join("\n");
  if (!symbolFound) {
    const note = `// Symbol "${focusedSymbol}" was not found. Returned a skeleton only.`;
    text = text.length > 0 ? `${text}\n${note}` : note;
  }
  return { text, symbolFound };
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

function pruneWithoutSymbol(code: string): string {
  const lines = code.split("\n");
  const skeletonLines: string[] = [];
  let bracketDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (isStructuralLine(trimmed)) {
      skeletonLines.push(line);
      continue;
    }

    if (trimmed.includes("class ") && trimmed.endsWith("{")) {
      skeletonLines.push(line);
      bracketDepth++;
      continue;
    }

    const isFunctionOrMethod =
      (trimmed.startsWith("public ") ||
        trimmed.startsWith("private ") ||
        trimmed.startsWith("async ") ||
        trimmed.startsWith("function ") ||
        trimmed.startsWith("export function ") ||
        trimmed.includes("):") ||
        trimmed.includes(") :") ||
        trimmed.includes("=> {")) &&
      trimmed.includes("(");

    if (isFunctionOrMethod) {
      if (line.includes("{")) {
        skeletonLines.push(line.replace(/\{.*/, "{ /* implementation hidden */ }"));
      } else {
        skeletonLines.push(line);
      }
      continue;
    }

    if (trimmed === "}" && bracketDepth > 0) {
      bracketDepth--;
      skeletonLines.push(line);
    }
  }

  return skeletonLines.join("\n");
}

function isStructuralLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("import ") ||
    trimmed.startsWith("export interface") ||
    trimmed.startsWith("interface ") ||
    trimmed.startsWith("type ") ||
    trimmed.startsWith("export type") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*")
  );
}

function declaredFunctionName(trimmed: string): string | null {
  return (
    FUNCTION_DECLARATION.exec(trimmed)?.[1] ??
    VARIABLE_DECLARATION.exec(trimmed)?.[1] ??
    METHOD_DECLARATION.exec(trimmed)?.[1] ??
    null
  );
}

function opensFunction(trimmed: string): boolean {
  return (
    trimmed.includes("function") ||
    trimmed.includes("=>") ||
    trimmed.includes("{") ||
    trimmed.endsWith("(") ||
    trimmed.endsWith(",") ||
    trimmed.includes("(")
  );
}

function braceDelta(line: string): number {
  let delta = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && line[index + 1] === "/") {
      break;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      delta += 1;
    } else if (character === "}") {
      delta -= 1;
    }
  }

  return delta;
}
