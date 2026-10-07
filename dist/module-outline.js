import * as fs from "fs/promises";
import * as path from "path";
import ts from "typescript";
import { parseSourceFile, SUPPORTED_SOURCE_EXTENSIONS } from "./callees.js";
export const DEFAULT_MAX_FILES = 30;
export const MAX_FILES_LIMIT = 500;
const SKIPPED_DIRECTORIES = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
]);
const SUPPORTED_EXTENSIONS = new Set(SUPPORTED_SOURCE_EXTENSIONS);
export function resolveOutlineOptions(recursive, maxFiles) {
    if (maxFiles !== undefined && (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > MAX_FILES_LIMIT)) {
        throw new Error(`maxFiles must be an integer from 1 to ${MAX_FILES_LIMIT}.`);
    }
    return {
        recursive: recursive === true,
        maxFiles: maxFiles ?? DEFAULT_MAX_FILES,
    };
}
export async function buildModuleOutline(dirPath, options) {
    const root = path.resolve(dirPath);
    let rootStat;
    try {
        rootStat = await fs.stat(root);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Error reading directory ${dirPath}: ${message}`);
    }
    if (!rootStat.isDirectory()) {
        throw new Error(`Error reading directory ${dirPath}: path is not a directory.`);
    }
    if (SKIPPED_DIRECTORIES.has(path.basename(root))) {
        throw new Error(`Refusing to outline ${path.basename(root)}. Choose a source directory.`);
    }
    const files = await listSourceFiles(root, options);
    if (files.paths.length === 0) {
        return `// No supported source files found in ${dirPath}.`;
    }
    const sections = [];
    for (const filePath of files.paths) {
        sections.push(await outlineFile(root, filePath));
    }
    if (files.truncated) {
        sections.push(`// Stopped after ${options.maxFiles} file${options.maxFiles === 1 ? "" : "s"}.`);
    }
    return sections.join("\n\n");
}
export function outlineSource(filePath, code) {
    try {
        const sourceFile = parseSourceFile(code, filePath);
        const lines = exportedSignatures(sourceFile);
        if (lines.length === 0) {
            return "(no exported types, interfaces, classes, or functions)";
        }
        return lines.join("\n");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `// ${message}`;
    }
}
async function listSourceFiles(root, options) {
    const paths = [];
    const pending = [root];
    let truncated = false;
    while (pending.length > 0 && paths.length < options.maxFiles) {
        const directory = pending.shift();
        if (!directory) {
            break;
        }
        const entries = await fs.readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            if (entry.isSymbolicLink()) {
                continue;
            }
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (options.recursive && !SKIPPED_DIRECTORIES.has(entry.name)) {
                    pending.push(fullPath);
                }
                continue;
            }
            if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                continue;
            }
            if (paths.length >= options.maxFiles) {
                truncated = true;
                break;
            }
            paths.push(fullPath);
        }
    }
    if (pending.length > 0 && paths.length >= options.maxFiles) {
        truncated = true;
    }
    return { paths, truncated };
}
async function outlineFile(root, filePath) {
    const relativePath = path.relative(root, filePath).split(path.sep).join("/");
    try {
        const code = await fs.readFile(filePath, "utf8");
        return `${relativePath}\n${outlineSource(filePath, code)}`;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `${relativePath}\n// ${message}`;
    }
}
function exportedSignatures(sourceFile) {
    const reexported = reexportedNames(sourceFile);
    const lines = [];
    for (const statement of sourceFile.statements) {
        lines.push(...signaturesForStatement(statement, sourceFile, reexported));
    }
    return lines;
}
function reexportedNames(sourceFile) {
    const names = new Set();
    for (const statement of sourceFile.statements) {
        if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
            continue;
        }
        for (const element of statement.exportClause.elements) {
            names.add(element.propertyName?.text ?? element.name.text);
        }
    }
    return names;
}
function signaturesForStatement(statement, sourceFile, reexported) {
    if (ts.isInterfaceDeclaration(statement) && isExported(statement, statement.name.text, reexported)) {
        return [`export interface ${statement.name.text}`];
    }
    if (ts.isTypeAliasDeclaration(statement) && isExported(statement, statement.name.text, reexported)) {
        return [`export type ${statement.name.text}`];
    }
    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement, statement.name.text, reexported)) {
        return [`export class ${statement.name.text}`];
    }
    if (ts.isFunctionDeclaration(statement) && isExported(statement, statement.name?.text, reexported)) {
        return [functionSignature(statement, sourceFile)];
    }
    if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.flatMap((declaration) => {
            const name = ts.isIdentifier(declaration.name) ? declaration.name.text : undefined;
            if (!isExported(statement, name, reexported)) {
                return [];
            }
            return variableFunctionSignature(declaration, sourceFile);
        });
    }
    return [];
}
function isExported(node, name, reexported) {
    return hasExportModifier(node) || (name !== undefined && reexported.has(name));
}
function hasExportModifier(node) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}
function functionSignature(node, sourceFile) {
    const name = node.name?.getText(sourceFile);
    const parameters = node.parameters.map((parameter) => parameter.getText(sourceFile)).join(", ");
    const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : "";
    const isAsync = hasModifier(node, ts.SyntaxKind.AsyncKeyword);
    if (!name) {
        return `export default ${isAsync ? "async " : ""}function (${parameters})${returnType}`;
    }
    return `export ${isAsync ? "async " : ""}function ${name}(${parameters})${returnType}`;
}
function variableFunctionSignature(declaration, sourceFile) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        return [];
    }
    if (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer)) {
        return [];
    }
    const parameters = declaration.initializer.parameters
        .map((parameter) => parameter.getText(sourceFile))
        .join(", ");
    const returnType = declaration.initializer.type ? `: ${declaration.initializer.type.getText(sourceFile)}` : "";
    const isAsync = hasModifier(declaration.initializer, ts.SyntaxKind.AsyncKeyword);
    return [`export ${isAsync ? "async " : ""}function ${declaration.name.text}(${parameters})${returnType}`];
}
function hasModifier(node, kind) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}
