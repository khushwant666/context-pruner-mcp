import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPrunerServer } from "../dist/index.js";

const SAMPLE = `function formatAmount(amount: number): string {
  return "usd:" + amount;
}

function validate(customerId: string): boolean {
  return formatAmount(customerId.length).length > 0;
}

export function chargeCustomer(customerId: string, amount: number): boolean {
  return validate(customerId) && amount > 0;
}

export function refund(transactionId: string): boolean {
  return transactionId.startsWith("tx_");
}

export const sum = (a: number, b: number) => a + b;

export const doubled = (value: number): number => {
  return value * 2;
};
`;

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

describe("mcp tools", () => {
  let client: Client;
  let sourcePath: string;
  let tempDir: string;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pruner-tools-"));
    sourcePath = path.join(tempDir, "payment.ts");
    await fs.writeFile(sourcePath, SAMPLE);

    const server = createPrunerServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "context-pruner-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("keeps one symbol and hides the other functions", async () => {
    const text = await callTool(client, "get_code_skeleton", {
      filePath: sourcePath,
      symbol: "chargeCustomer",
    });

    assert.match(text, /return validate\(customerId\) && amount > 0/);
    assert.match(text, /function validate\(customerId: string\): boolean \{ \/\* implementation hidden \*\/ \}/);
    assert.match(text, /function refund\(transactionId: string\): boolean \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(text, /usd:/);
    assert.doesNotMatch(text, /startsWith/);
  });

  it("keeps every symbol in a multi-symbol request", async () => {
    const text = await callTool(client, "get_code_skeleton", {
      filePath: sourcePath,
      symbols: ["chargeCustomer", "refund"],
    });

    assert.match(text, /amount > 0/);
    assert.match(text, /startsWith/);
    assert.match(text, /function validate\(customerId: string\): boolean \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(text, /usd:/);
  });

  it("keeps recursive same-file callees when expandCallees is true", async () => {
    const text = await callTool(client, "get_code_skeleton", {
      filePath: sourcePath,
      symbols: ["chargeCustomer"],
      expandCallees: true,
    });

    assert.match(text, /usd:/);
    assert.match(text, /formatAmount\(customerId.length\)/);
    assert.match(text, /validate\(customerId\)/);
    assert.match(text, /function refund\(transactionId: string\): boolean \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(text, /startsWith/);
  });

  it("hides arrow functions with and without block bodies", async () => {
    const text = await callTool(client, "get_code_skeleton", {
      filePath: sourcePath,
      symbol: "chargeCustomer",
    });

    assert.match(text, /const sum = \(a: number, b: number\) => \{ \/\* implementation hidden \*\/ \};/);
    assert.match(text, /const doubled = \(value: number\): number => \{ \/\* implementation hidden \*\/ \}/);
    assert.doesNotMatch(text, /a \+ b/);
    assert.doesNotMatch(text, /value \* 2/);
  });

  it("outlines exported signatures in src", async () => {
    const text = await callTool(client, "get_module_outline", {
      dirPath: SRC_DIR,
      recursive: true,
    });

    assert.match(text, /prune\.ts/);
    assert.match(text, /export function pruneCodeToSkeleton\(code: string, symbol\?: string\): PruneResult/);
    assert.match(text, /callees\.ts/);
    assert.match(text, /export function collectSameFileCallees\(/);
    assert.match(text, /module-outline\.ts/);
    assert.match(text, /export async function buildModuleOutline\(/);
    assert.doesNotMatch(text, /node_modules/);
    assert.doesNotMatch(text, /replacements\.sort/);
  });
});

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true);
  const content = result.content;
  assert.ok(Array.isArray(content));
  const textBlock = content.find((item) => item.type === "text");
  assert.ok(textBlock && textBlock.type === "text");
  return textBlock.text;
}
