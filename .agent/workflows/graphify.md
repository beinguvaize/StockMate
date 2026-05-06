# Graphify Workflow

This workflow registers the `/graphify` command to perform a structural analysis of the repository.

## Slash Command: /graphify
**Description**: Re-indexes the codebase, identifies architectural God Nodes, and updates the Graph Report.

### Steps
1. **Analyze God Nodes**: Identify the files with the highest central dependency (e.g., AppContext, Main Components).
2. **Community Detection**: Group files into logical clusters (Auth, Inventory, Sales, Reporting).
3. **Update Graph Report**: Write findings to `graphify-out/GRAPH_REPORT.md`.
4. **Summary**: Present a high-level summary of the architectural health to the user.

---

> [!TIP]
> Use `/graphify` whenever you add a major new feature or refactor core state management to keep the agent's mental model in sync.
