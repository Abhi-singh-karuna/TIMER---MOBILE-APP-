---
name: typecheck
description: Run TypeScript type checking across the entire codebase without emitting files
---

Run TypeScript type checking:

```bash
npx tsc --noEmit
```

This project has no test suite — `tsc --noEmit` is the primary static validation tool. Fix all errors before considering a change complete.
