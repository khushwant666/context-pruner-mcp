# context-pruner-mcp

Coding agents such as Cursor Composer, Claude Code, and Cline often load entire files into the context window. Most of those tokens are implementation details the model does not need: helper logic, loops, and private method bodies. The window fills up, responses slow down, and API cost climbs.

**context-pruner-mcp** returns a structural skeleton instead: imports, types, interfaces, exported classes, and function signatures, with function bodies removed.

Use `get_code_skeleton` when an agent only needs the shape of a file. Read the full file only for the code you are actually changing.

```bash
npx -y "@khushwant.r/context-pruner-mcp"
```

- npm: [@khushwant.r/context-pruner-mcp](https://www.npmjs.com/package/@khushwant.r/context-pruner-mcp)
- source: [khushwant666/context-pruner-mcp](https://github.com/khushwant666/context-pruner-mcp)

## Setup

### Cursor

Add this to `.cursor/mcp.json` in the project, or to your global MCP settings:

```json
{
  "mcpServers": {
    "context-pruner": {
      "command": "npx",
      "args": ["-y", "@khushwant.r/context-pruner-mcp"]
    }
  }
}
```

On Windows, if `npx` is not picked up directly, wrap it with `cmd`:

```json
{
  "mcpServers": {
    "context-pruner": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@khushwant.r/context-pruner-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add context-pruner -- npx -y @khushwant.r/context-pruner-mcp
```

### VS Code / Cline

Add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "context-pruner": {
      "command": "npx",
      "args": ["-y", "@khushwant.r/context-pruner-mcp"]
    }
  }
}
```

## Tell the agent to use it

Agents still fall back to native file reads unless you say otherwise. Add this to `.cursorrules` or `CLAUDE.md`:

```markdown
When reading reference files, exploring dependencies, or checking types, ALWAYS use the `get_code_skeleton` MCP tool instead of reading raw file contents. If the user names a function or method, pass that name as `symbol` so only that body is included. Only read the full file when the problem is not confined to one function.
```

## Tools

| Tool | Parameters | Description |
| --- | --- | --- |
| `get_code_skeleton` | `filePath: string`, `symbol?: string` | Reads a file and returns imports, interfaces, types, classes, and signatures. Function bodies are replaced with `/* implementation hidden */`. Pass `symbol` (for example `chargeCustomer`) to keep that function's full body and still hide the others. Each successful call adds that file to the session totals. |
| `get_pruning_stats` | none | Returns files processed, estimated original tokens, pruned tokens, tokens saved, and approximate USD saved for the current server session. Ask the agent: "What are the pruning stats?" |

## Example

`src/service/payment.ts`:

```ts
export interface ChargeResult {
  success: boolean;
  transactionId: string;
}

export class PaymentService {
  public async chargeCustomer(customerId: string, amount: number): Promise<ChargeResult> {
    const validated = await this.validate(customerId);
    const stripe = createClient(this.apiKey);
    return { success: true, transactionId: "tx_123" };
  }
}
```

`get_code_skeleton` returns:

```ts
export interface ChargeResult {
export class PaymentService {
  public async chargeCustomer(customerId: string, amount: number): Promise<ChargeResult> { /* implementation hidden */ }
  }
```

The agent still sees the type, the class, and the method signature. The validation, client setup, and return logic stay out of the prompt.

## License

MIT © Khushwant Yadav
