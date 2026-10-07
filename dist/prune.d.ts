export interface PruneResult {
    text: string;
    symbolFound: boolean;
}
export interface PruneFocus {
    symbols?: readonly string[];
    expandCallees?: boolean;
    filePath?: string;
}
export declare function pruneCodeToSkeleton(code: string, symbol?: string): PruneResult;
export declare function pruneCodeToSkeleton(code: string, focus: PruneFocus): PruneResult;
export declare function normalizeSymbolList(symbol: string | undefined, symbols: string | readonly string[] | undefined): string[];
export declare function normalizeSymbol(symbol: string | undefined): string | undefined;
