# Manual Verification Checklist

Use this checklist to verify the extension and MCP server work correctly with a live notebook.

## Prerequisites

- [ ] Project builds cleanly: `pnpm build`
- [ ] Tests pass: `pnpm test`
- [ ] VS Code Extension Development Host launches without errors

## Bridge Verification

- [ ] Open a notebook (`.ipynb`) in the Extension Development Host
- [ ] Verify the status bar shows "Notebook Bridge" (running)
- [ ] Run "Notebook Session Labs: Show Bridge Status" command
- [ ] Note the port and token displayed

## MCP Server Verification

Set environment variables:
```bash
export NSL_BRIDGE_HOST=127.0.0.1
export NSL_BRIDGE_PORT=<port from extension>
export NSL_BRIDGE_TOKEN=<token from extension>
```

- [ ] MCP server starts: `node packages/mcp-server/dist/index.js`
- [ ] Health check passes (no warning in output)

## Tool Verification

### Read Operations
- [ ] `get_active_notebook` returns notebook info
- [ ] `list_open_notebooks` lists the open notebook
- [ ] `list_cells` returns cell summaries
- [ ] `read_cell` returns cell source for index 0
- [ ] `read_cell_output` returns outputs (if cell has been executed)
- [ ] `get_selection` returns current selection state

### Edit Operations
- [ ] `insert_cell` with index 0, kind "code", source "print('hello')" succeeds
- [ ] `edit_cell_source` on the new cell with "print('world')" succeeds
- [ ] `delete_cell` on the test cell succeeds
- [ ] `move_cell` moves a cell between positions

### Execution Operations
- [ ] `execute_cell` on a cell with `print("test")` returns output
- [ ] `run_all_cells` executes all cells
- [ ] `save_notebook` saves the notebook

### Edit + Rerun Cycle
- [ ] Edit a cell source to `1 + 1`
- [ ] Execute the cell
- [ ] Read the output and confirm it shows the result
- [ ] Edit the source to `2 + 2`
- [ ] Re-execute and confirm updated output