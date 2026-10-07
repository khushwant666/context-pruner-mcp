import ts from "typescript";
import * as path from "path";
const SCRIPT_KINDS = new Map([
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
export function scriptKindForPath(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    const kind = SCRIPT_KINDS.get(extension);
    if (kind === undefined) {
        throw new Error(`Unsupported file type "${extension || "(none)"}". Supported types: ${SUPPORTED_SOURCE_EXTENSIONS.join(", ")}.`);
    }
    return kind;
}
export function parseSourceFile(code, filePath) {
    let sourceFile;
    try {
        sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, scriptKindForPath(filePath));
    }
    catch (err) {
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
function syntaxDiagnostics(sourceFile) {
    const parsed = sourceFile;
    return parsed.parseDiagnostics ?? [];
}
/**
 * Same-file functions reachable from the requested symbols.
 * If A calls B and B calls C, both B and C are returned.
 */
export function collectSameFileCallees(code, filePath, symbols) {
    const sourceFile = parseSourceFile(code, filePath);
    const definedNames = collectDefinedFunctionNames(sourceFile);
    const requested = new Set(symbols);
    const discovered = new Set();
    const walked = new Set();
    let frontier = new Set(symbols);
    while (frontier.size > 0) {
        for (const name of frontier) {
            walked.add(name);
        }
        const next = new Set();
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
function directCallees(sourceFile, activeNames, definedNames) {
    const found = [];
    const visit = (node, insideActive) => {
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
function collectDefinedFunctionNames(sourceFile) {
    const names = new Set();
    const visit = (node) => {
        const name = declaredFunctionName(node);
        if (name) {
            names.add(name);
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return names;
}
function declaredFunctionName(node) {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) {
        return identifierText(node.name);
    }
    if (ts.isVariableDeclaration(node) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        return identifierText(node.name);
    }
    return null;
}
function identifierText(name) {
    if (name && ts.isIdentifier(name)) {
        return name.text;
    }
    return null;
}
function calleeName(expression) {
    if (ts.isIdentifier(expression)) {
        return expression.text;
    }
    if (ts.isPropertyAccessExpression(expression)) {
        return identifierText(expression.name);
    }
    return null;
}
