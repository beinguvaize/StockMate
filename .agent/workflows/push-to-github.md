---
description: how to push changes to GitHub following the project branching rules
---

1. Ensure you are on the `develop` branch
```bash
git checkout develop
```

2. Stage and commit changes with a descriptive message
```bash
git add . ; git commit -m "update: [brief description of changes]"
```

// turbo
3. Push to Staging (develop branch)
```bash
git push origin develop
```

> [!IMPORTANT]
> - Always work on the `develop` branch.
> - Only push to Staging by pushing to the `develop` branch.
> - Never push directly to `main`.
