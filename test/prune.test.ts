import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pruneCodeToSkeleton } from "../src/prune.ts";

const SOURCE = `export class PaymentService {
  public async chargeCustomer(customerId: string, amount: number): Promise<boolean> {
    const validated = customerId.length > 0;
    if (amount <= 0) {
      return false;
    }
    return validated;
  }

  public refund(transactionId: string): boolean {
    return transactionId.startsWith("tx_");
  }
}
`;

describe("pruneCodeToSkeleton", () => {
  it("hides every function body when no symbol is requested", () => {
    const result = pruneCodeToSkeleton(SOURCE);

    assert.equal(result.symbolFound, false);
    assert.match(result.text, /chargeCustomer\(customerId: string, amount: number\): Promise<boolean> \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(result.text, /amount <= 0/);
    assert.doesNotMatch(result.text, /startsWith/);
  });

  it("keeps the named function and hides the others", () => {
    const result = pruneCodeToSkeleton(SOURCE, "chargeCustomer");

    assert.equal(result.symbolFound, true);
    assert.match(result.text, /const validated = customerId.length > 0/);
    assert.match(result.text, /if \(amount <= 0\)/);
    assert.match(result.text, /return validated/);
    assert.match(result.text, /refund\(transactionId: string\): boolean \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(result.text, /startsWith/);
  });

  it("keeps a multi-line signature and its body", () => {
    const source = `export const chargeCustomer = async (
  customerId: string,
  amount: number
): Promise<boolean> => {
  return amount > 0;
};

export function refund(transactionId: string): boolean {
  return false;
}
`;
    const result = pruneCodeToSkeleton(source, "chargeCustomer");

    assert.equal(result.symbolFound, true);
    assert.match(result.text, /customerId: string/);
    assert.match(result.text, /return amount > 0/);
    assert.doesNotMatch(result.text, /return false/);
  });

  it("does not treat a call to the symbol as the function itself", () => {
    const source = `export function refund(transactionId: string): boolean {
  return chargeCustomer(transactionId, 10);
}

export function chargeCustomer(customerId: string, amount: number): boolean {
  return amount > 0;
}
`;
    const result = pruneCodeToSkeleton(source, "chargeCustomer");

    assert.equal(result.symbolFound, true);
    assert.match(result.text, /return amount > 0/);
    assert.doesNotMatch(result.text, /return chargeCustomer/);
  });

  it("reports a missing symbol and still returns a skeleton", () => {
    const result = pruneCodeToSkeleton(SOURCE, "missingFunction");

    assert.equal(result.symbolFound, false);
    assert.match(result.text, /Symbol "missingFunction" was not found/);
    assert.doesNotMatch(result.text, /amount <= 0/);
  });

  it("rejects a symbol that is not an identifier", () => {
    assert.throws(() => pruneCodeToSkeleton(SOURCE, "charge customer"), /not a function name/);
  });
});
