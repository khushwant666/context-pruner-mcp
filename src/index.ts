#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { HIDDEN_IMPLEMENTATION_GUIDANCE } from "./guidance.js";
import { buildModuleOutline, resolveOutlineOptions } from "./module-outline.js";
import { normalizeSymbolList, pruneCodeToSkeleton } from "./prune.js";
import { createPruningTotals, formatPruningStats, recordPrunedFile, type PruningTotals } from "./pruning-stats.js";

export function createPrunerServer(): McpServer {
  const server = new McpServer({
    name: "context-pruner-mcp",
    version: "0.2.0",
  });
  registerTools(server, createPruningTotals());
  return server;
}

function registerTools(server: McpServer, pruningTotals: PruningTotals): void {
  server.tool(
    "get_code_skeleton",
    `Fetches a pruned skeleton of a file. Pass symbol or symbols to keep those functions in full and hide every other function body. Set expandCallees to also keep same-file functions they call. ${HIDDEN_IMPLEMENTATION_GUIDANCE}`,
    {
      filePath: z.string().describe("Relative or absolute path to the target code file"),
      symbol: z
        .string()
        .optional()
        .describe("Function or method name to keep in full, such as chargeCustomer. Omit to hide every function body."),
      symbols: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("One function name or a list of function names to keep in full. Combined with symbol when both are set."),
      expandCallees: z
        .boolean()
        .optional()
        .describe("When true, also keep the full body of same-file functions called by the requested symbols. Defaults to false."),
    },
    async ({ filePath, symbol, symbols, expandCallees }) => {
      let focusSymbols: string[];
      try {
        focusSymbols = normalizeSymbolList(symbol, symbols);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }

      try {
        const resolvedPath = path.resolve(process.cwd(), filePath);
        const rawContent = await fs.readFile(resolvedPath, "utf-8");
        const pruned =
          focusSymbols.length === 0
            ? pruneCodeToSkeleton(rawContent).text
            : pruneCodeToSkeleton(rawContent, {
                symbols: focusSymbols,
                expandCallees: expandCallees === true,
                filePath: resolvedPath,
              }).text;
        recordPrunedFile(pruningTotals, rawContent.length, pruned.length);

        return {
          content: [
            {
              type: "text" as const,
              text: pruned || "// File contained no structural signatures",
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading file ${filePath}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_pruning_stats",
    `Returns the number of files processed, estimated tokens saved, and cost efficiency for this server session. ${HIDDEN_IMPLEMENTATION_GUIDANCE}`,
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: formatPruningStats(pruningTotals),
          },
        ],
      };
    },
  );

  server.tool(
    "get_module_outline",
    `Scans a directory and returns exported types, interfaces, classes, and top-level function signatures. Skips node_modules, .git, dist, and build output. ${HIDDEN_IMPLEMENTATION_GUIDANCE}`,
    {
      dirPath: z.string().describe("Relative or absolute path to a source directory"),
      recursive: z
        .boolean()
        .optional()
        .describe("When true, include subdirectories. Defaults to false. Skips node_modules, .git, dist, and build output."),
      maxFiles: z
        .number()
        .optional()
        .describe("Maximum number of source files to include. Defaults to 30."),
    },
    async ({ dirPath, recursive, maxFiles }) => {
      try {
        const options = resolveOutlineOptions(recursive, maxFiles);
        const outline = await buildModuleOutline(dirPath, options);
        return {
          content: [
            {
              type: "text" as const,
              text: outline,
            },
          ],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
        };
      }
    },
  );
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  const invoked = path.resolve(entry);
  const current = path.resolve(fileURLToPath(import.meta.url));
  return process.platform === "win32" ? invoked.toLowerCase() === current.toLowerCase() : invoked === current;
}

async function main(): Promise<void> {
  const server = createPrunerServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (isDirectExecution()) {
  main().catch((err: unknown) => {
    console.error("MCP Server Error:", err);
    process.exit(1);
  });
}
