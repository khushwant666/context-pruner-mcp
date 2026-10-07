/** Rough character-to-token ratio used for session estimates. */
export declare const CHARS_PER_TOKEN = 4;
/** Approximate Claude Sonnet input price, in USD per 1,000,000 tokens. */
export declare const INPUT_USD_PER_MILLION_TOKENS = 3;
export interface PruningTotals {
    totalRawChars: number;
    totalPrunedChars: number;
    filesProcessed: number;
}
export declare function createPruningTotals(): PruningTotals;
export declare function recordPrunedFile(totals: PruningTotals, rawCharCount: number, prunedCharCount: number): void;
export declare function formatPruningStats(totals: PruningTotals): string;
