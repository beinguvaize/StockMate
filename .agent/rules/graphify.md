# Graphify Rules

These rules ensure the Antigravity agent maintains architectural integrity by prioritizing the Knowledge Graph over raw file scanning for structural queries.

## 1. Architectural Source of Truth
- **Read First**: Always consult `graphify-out/GRAPH_REPORT.md` before answering questions about "how the app works" or "what is the dependency tree."
- **God Nodes**: Prioritize the analysis and stability of "God Nodes" (e.g., `AppContext.jsx`, `supabase.js`) as they influence the entire system.

## 2. Context Navigation
- Avoid recursive `grep` across the whole repository if a community or module path is already identified in the graph.
- Use the **Communities** defined in the graph to narrow down searches (e.g., if a bug is in "Payments," focus on the `SalesContext` community).

## 3. Maintenance
- If a file marked as a "God Node" is modified, remind the user to run `/graphify` (or `graphify update .`) to refresh the index.
- Ensure all new modules are categorized within the existing architectural communities.
