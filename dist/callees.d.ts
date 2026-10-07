import ts from "typescript";
export declare const SUPPORTED_SOURCE_EXTENSIONS: string[];
export declare function scriptKindForPath(filePath: string): ts.ScriptKind;
export declare function parseSourceFile(code: string, filePath: string): ts.SourceFile;
/**
 * Same-file functions reachable from the requested symbols.
 * If A calls B and B calls C, both B and C are returned.
 */
export declare function collectSameFileCallees(code: string, filePath: string, symbols: readonly string[]): string[];
