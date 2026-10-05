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
When reading reference files, exploring dependencies, or checking types, ALWAYS use the `get_code_skeleton` MCP tool instead of reading raw file contents. Only read the full implementation of the exact file being edited.
```

## Tool

| Tool | Parameters | Description |
| --- | --- | --- |
| `get_code_skeleton` | `filePath: string` | Reads a file and returns imports, interfaces, types, exported classes, and method signatures. Function bodies are replaced with `/* implementation hidden */`. `filePath` may be relative to the working directory or absolute. |

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
