import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { describe, it } from "node:test";
import { buildModuleOutline, outlineSource, resolveOutlineOptions } from "../dist/module-outline.js";

describe("module outline", () => {
  it("lists exported signatures and skips function bodies", () => {
    const outline = outlineSource(
      "payment.ts",
      `export interface ChargeResult { success: boolean; }
export class PaymentService { charge() { return 1; } }
export function chargeCustomer(customerId: string, amount: number): boolean {
  return amount > 0;
}
function hiddenHelper(): void { return; }
`,
    );

    assert.match(outline, /export interface ChargeResult/);
    assert.match(outline, /export class PaymentService/);
    assert.match(outline, /export function chargeCustomer\(customerId: string, amount: number\): boolean/);
    assert.doesNotMatch(outline, /return amount/);
    assert.doesNotMatch(outline, /hiddenHelper/);
  });

  it("puts a space before the parentheses of an anonymous default export", () => {
    const outline = outlineSource(
      "mod.ts",
      "export default function (amount: number): string {\n  return String(amount);\n}\n",
    );

    assert.match(outline, /export default function \(amount: number\): string/);
    assert.doesNotMatch(outline, /function\(/);
  });

  it("skips node_modules and dist, and honors maxFiles", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "outline-"));
    await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(root, "dist"), { recursive: true });
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "node_modules", "pkg", "index.ts"), "export function dependency(): void {}\n");
    await fs.writeFile(path.join(root, "dist", "index.js"), "export function built(): void {}\n");
    await fs.writeFile(path.join(root, "src", "a.ts"), "export function alpha(): void {}\n");
    await fs.writeFile(path.join(root, "src", "b.ts"), "export function beta(): void {}\n");
    await fs.writeFile(path.join(root, "readme.md"), "not code\n");

    const outline = await buildModuleOutline(root, { recursive: true, maxFiles: 1 });

    assert.match(outline, /export function alpha/);
    assert.doesNotMatch(outline, /dependency/);
    assert.doesNotMatch(outline, /built/);
    assert.match(outline, /Stopped after 1 file/);
    await fs.rm(root, { recursive: true, force: true });
  });

  it("rejects an unbounded maxFiles value", () => {
    assert.throws(() => resolveOutlineOptions(false, 0), /maxFiles/);
  });
});
