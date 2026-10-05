#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { createPruningTotals, formatPruningStats, recordPrunedFile } from "./pruning-stats.js";

const server = new McpServer({
  name: "context-pruner-mcp",
  version: "0.1.1",
});

const pruningTotals = createPruningTotals();

function pruneCodeToSkeleton(code: string): string {
  const lines = code.split("\n");
  const skeletonLines: string[] = [];
  let bracketDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("export interface") ||
      trimmed.startsWith("interface ") ||
      trimmed.startsWith("type ") ||
      trimmed.startsWith("export type") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      skeletonLines.push(line);
      continue;
    }

    if (trimmed.includes("class ") && trimmed.endsWith("{")) {
      skeletonLines.push(line);
      bracketDepth++;
      continue;
    }

    const isFunctionOrMethod =
      (trimmed.startsWith("public ") ||
        trimmed.startsWith("private ") ||
        trimmed.startsWith("async ") ||
        trimmed.startsWith("function ") ||
        trimmed.startsWith("export function ") ||
        trimmed.includes("):") ||
        trimmed.includes(") :") ||
        trimmed.includes("=> {")) &&
      trimmed.includes("(");

    if (isFunctionOrMethod) {
      if (line.includes("{")) {
        skeletonLines.push(line.replace(/\{.*/, "{ /* implementation hidden */ }"));
      } else {
        skeletonLines.push(line);
      }
      continue;
    }

    if (trimmed === "}" && bracketDepth > 0) {
      bracketDepth--;
      skeletonLines.push(line);
    }
  }

  return skeletonLines.join("\n");
}

server.tool(
  "get_code_skeleton",
  "Fetches an AST-pruned skeleton (signatures, interfaces, exports) of a file, saving context tokens by removing function bodies.",
  {
    filePath: z.string().describe("Relative or absolute path to the target code file"),
  },
  async ({ filePath }) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);
      const rawContent = await fs.readFile(resolvedPath, "utf-8");
      const pruned = pruneCodeToSkeleton(rawContent);
      recordPrunedFile(pruningTotals, rawContent.length, pruned.length);

      return {
        content: [
          {
            type: "text",
            text: pruned || "// File contained no structural signatures",
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Error reading file ${filePath}: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_pruning_stats",
  "Returns the number of files processed, estimated tokens saved, and cost efficiency for this server session.",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: formatPruningStats(pruningTotals),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP Server Error:", err);
  process.exit(1);
});