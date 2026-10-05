import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPruningTotals,
  formatPruningStats,
  recordPrunedFile,
} from "../src/pruning-stats.ts";

describe("pruning stats", () => {
  it("reports an empty session as zero savings", () => {
    const text = formatPruningStats(createPruningTotals());

    assert.match(text, /Files Processed: 0/);
    assert.match(text, /Original Prompt Volume: ~0 tokens/);
    assert.match(text, /After Pruning: ~0 tokens/);
    assert.match(text, /Tokens Saved: ~0 \(0% reduction\)/);
    assert.match(text, /Estimated Savings: ~\$0\.0000/);
    assert.match(text, /approximations based on character heuristics/);
  });

  it("accumulates raw and pruned characters across files", () => {
    const totals = createPruningTotals();
    recordPrunedFile(totals, 400, 100);
    recordPrunedFile(totals, 800, 200);

    assert.equal(totals.filesProcessed, 2);
    assert.match(formatPruningStats(totals), /Files Processed: 2/);
    assert.match(formatPruningStats(totals), /Original Prompt Volume: ~300 tokens/);
    assert.match(formatPruningStats(totals), /After Pruning: ~75 tokens/);
    assert.match(formatPruningStats(totals), /Tokens Saved: ~225 \(75% reduction\)/);
    assert.match(formatPruningStats(totals), /Estimated Savings: ~\$0\.0007/);
  });

  it("rejects invalid character counts", () => {
    const totals = createPruningTotals();
    assert.throws(() => recordPrunedFile(totals, -1, 0), /rawCharCount/);
    assert.throws(() => recordPrunedFile(totals, 1, Number.NaN), /prunedCharCount/);
    assert.equal(totals.filesProcessed, 0);
  });
});