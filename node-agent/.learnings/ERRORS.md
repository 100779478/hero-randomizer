## [ERR-20260408-001] apply_patch_windows_sandbox_refresh

**Logged**: 2026-04-08T00:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
`apply_patch` failed repeatedly on this Windows workspace due to sandbox refresh errors, so file edits needed a shell-based fallback.

### Error
```text
execution error: Io(Custom { kind: Other, error: "windows sandbox: setup refresh failed with status exit code: 1" })
```

### Context
- Operation attempted: `functions.apply_patch`
- Workspace: `D:\node-agent`
- Impact: blocked normal patch-based edits for multiple files

### Suggested Fix
Investigate Windows sandbox refresh handling for `apply_patch`. Until fixed, prefer direct file writes as a fallback when the same error repeats.

### Metadata
- Reproducible: yes
- Related Files: D:\node-agent\src\index.js

---