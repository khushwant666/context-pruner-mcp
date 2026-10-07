import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pruneCodeToSkeleton } from "../dist/prune.js";

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

  it("keeps several named functions and still hides the rest", () => {
    const result = pruneCodeToSkeleton(SOURCE, { symbols: ["chargeCustomer", "refund"] });

    assert.equal(result.symbolFound, true);
    assert.match(result.text, /amount <= 0/);
    assert.match(result.text, /startsWith/);
  });

  it("keeps same-file callees only when expandCallees is true", () => {
    const source = `function validate(customerId: string): boolean {
  return customerId.length > 0;
}

export function chargeCustomer(customerId: string, amount: number): boolean {
  if (!validate(customerId)) {
    return false;
  }
  return amount > 0;
}

export function refund(transactionId: string): boolean {
  return transactionId.startsWith("tx_");
}
`;
    const hidden = pruneCodeToSkeleton(source, {
      symbols: ["chargeCustomer"],
      expandCallees: false,
      filePath: "payment.ts",
    });
    assert.match(hidden.text, /return amount > 0/);
    assert.doesNotMatch(hidden.text, /customerId.length > 0/);
    assert.doesNotMatch(hidden.text, /startsWith/);

    const expanded = pruneCodeToSkeleton(source, {
      symbols: ["chargeCustomer"],
      expandCallees: true,
      filePath: "payment.ts",
    });
    assert.match(expanded.text, /customerId.length > 0/);
    assert.match(expanded.text, /return amount > 0/);
    assert.doesNotMatch(expanded.text, /startsWith/);
  });

  it("keeps a same-file method called through this", () => {
    const source = `export class PaymentService {
  private validate(customerId: string): boolean {
    return customerId.length > 0;
  }

  public chargeCustomer(customerId: string): boolean {
    return this.validate(customerId);
  }

  public refund(): boolean {
    return false;
  }
}
`;
    const result = pruneCodeToSkeleton(source, {
      symbols: ["chargeCustomer"],
      expandCallees: true,
      filePath: "payment.ts",
    });

    assert.match(result.text, /customerId.length > 0/);
    assert.match(result.text, /this.validate\(customerId\)/);
    assert.doesNotMatch(result.text, /return false/);
  });

  it("follows callees of callees in the same file", () => {
    const source = `function formatAmount(amount: number): string {
  return \`usd:\${amount}\`;
}

function validate(customerId: string): boolean {
  return formatAmount(customerId.length).length > 0;
}

export function chargeCustomer(customerId: string, amount: number): boolean {
  return validate(customerId) && amount > 0;
}

export function refund(): boolean {
  return false;
}
`;
    const result = pruneCodeToSkeleton(source, {
      symbols: ["chargeCustomer"],
      expandCallees: true,
      filePath: "payment.ts",
    });

    assert.match(result.text, /usd:/);
    assert.match(result.text, /formatAmount\(customerId.length\)/);
    assert.match(result.text, /validate\(customerId\)/);
    assert.doesNotMatch(result.text, /return false/);
  });

  it("keeps a template string that contains braces", () => {
    const source = "export function chargeCustomer(amount: number): string {\n  const note = `fee {\n    nested: ${amount}\n  }`;\n  return note;\n}\n\nexport function refund(): boolean {\n  return false;\n}\n";
    const result = pruneCodeToSkeleton(source, "chargeCustomer");

    assert.match(result.text, /fee \{/);
    assert.match(result.text, /nested: \$\{amount\}/);
    assert.doesNotMatch(result.text, /return false/);
  });

  it("hides concise arrow bodies and block arrow bodies", () => {
    const source = `export const sum = (a: number, b: number) => a + b;

export const doubled = (value: number): number => {
  return value * 2;
};
`;
    const result = pruneCodeToSkeleton(source);

    assert.match(result.text, /const sum = \(a: number, b: number\) => \{ \/\* implementation hidden \*\/ \};/);
    assert.match(result.text, /const doubled = \(value: number\): number => \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(result.text, /a \+ b/);
    assert.doesNotMatch(result.text, /value \* 2/);
  });

  it("replaces an outer arrow expression once when another arrow is nested inside it", () => {
    const source = `export const make = () => (x: number) => x + 1;
export const other = (n: number) => n + 2;
`;
    const result = pruneCodeToSkeleton(source);
    const hidden = result.text.match(/\/\* implementation hidden \*\//g) ?? [];

    assert.equal(hidden.length, 2);
    assert.match(result.text, /const make = \(\) => \{ \/\* implementation hidden \*\/ \};/);
    assert.match(result.text, /const other = \(n: number\) => \{ \/\* implementation hidden \*\/ \};/);
    assert.doesNotMatch(result.text, /x \+ 1/);
    assert.doesNotMatch(result.text, /n \+ 2/);
  });

  it("keeps a concise arrow body when that symbol is requested", () => {
    const source = `export const sum = (a: number, b: number) => a + b;
export const doubled = (value: number) => value * 2;
`;
    const result = pruneCodeToSkeleton(source, "sum");

    assert.match(result.text, /=> a \+ b/);
    assert.match(result.text, /const doubled = \(value: number\) => \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(result.text, /value \* 2/);
  });

  it("reports a parse error for invalid syntax when expanding callees", () => {
    assert.throws(
      () =>
        pruneCodeToSkeleton("export function chargeCustomer( {", {
          symbols: ["chargeCustomer"],
          expandCallees: true,
          filePath: "broken.ts",
        }),
      /Could not parse/,
    );
  });
});
