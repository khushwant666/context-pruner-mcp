#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { normalizeSymbol, pruneCodeToSkeleton } from "./prune.js";
import { createPruningTotals, formatPruningStats, recordPrunedFile } from "./pruning-stats.js";

const server = new McpServer({
  name: "context-pruner-mcp",
  version: "0.1.3",
});

const pruningTotals = createPruningTotals();

server.tool(
  "get_code_skeleton",
  "Fetches a pruned skeleton of a file. Pass symbol to keep that function's full body and hide every other function body.",
  {
    filePath: z.string().describe("Relative or absolute path to the target code file"),
    symbol: z
      .string()
      .optional()
      .describe("Function or method name to keep in full, such as chargeCustomer. Omit to hide every function body."),
  },
  async ({ filePath, symbol }) => {
    let focusedSymbol: string | undefined;
    try {
      focusedSymbol = normalizeSymbol(symbol);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }

    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);
      const rawContent = await fs.readFile(resolvedPath, "utf-8");
      const pruned = pruneCodeToSkeleton(rawContent, focusedSymbol).text;
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