/** Rough character-to-token ratio used for session estimates. */
export const CHARS_PER_TOKEN = 4;

/** Approximate Claude Sonnet input price, in USD per 1,000,000 tokens. */
export const INPUT_USD_PER_MILLION_TOKENS = 3;

export interface PruningTotals {
  totalRawChars: number;
  totalPrunedChars: number;
  filesProcessed: number;
}

export function createPruningTotals(): PruningTotals {
  return {
    totalRawChars: 0,
    totalPrunedChars: 0,
    filesProcessed: 0,
  };
}

export function recordPrunedFile(
  totals: PruningTotals,
  rawCharCount: number,
  prunedCharCount: number,
): void {
  assertCharCount(rawCharCount, "rawCharCount");
  assertCharCount(prunedCharCount, "prunedCharCount");
  totals.totalRawChars += rawCharCount;
  totals.totalPrunedChars += prunedCharCount;
  totals.filesProcessed += 1;
}

export function formatPruningStats(totals: PruningTotals): string {
  const rawTokens = Math.round(totals.totalRawChars / CHARS_PER_TOKEN);
  const prunedTokens = Math.round(totals.totalPrunedChars / CHARS_PER_TOKEN);
  const tokensSaved = rawTokens - prunedTokens;
  const reductionPercent = rawTokens > 0 ? Math.round((tokensSaved / rawTokens) * 100) : 0;
  const dollarsSaved = ((tokensSaved / 1_000_000) * INPUT_USD_PER_MILLION_TOKENS).toFixed(4);

  return [
    "📊 Context Pruner Stats:",
    `- Files Processed: ${totals.filesProcessed}`,
    `- Original Prompt Volume: ~${rawTokens.toLocaleString("en-US")} tokens`,
    `- After Pruning: ~${prunedTokens.toLocaleString("en-US")} tokens`,
    `- Tokens Saved: ~${tokensSaved.toLocaleString("en-US")} (${reductionPercent}% reduction)`,
    `- Estimated Savings: ~$${dollarsSaved}`,
    "",
    "⚠️ Note: Token metrics and savings are approximations based on character heuristics (~4 chars/token). For exact token consumption and credit balances, check your provider's official dashboard/usage report.",
  ].join("\n");
}

function assertCharCount(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}
