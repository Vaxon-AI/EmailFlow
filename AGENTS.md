<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Pre-push self-test (mandatory)

Before every `git push`, run all three commands the CI runs and confirm green:

```bash
npm run lint
npm run test:unit
npm run build
```

If any fails, fix and re-run before pushing. Don't push hoping CI will catch it - it will, and the fix will end up as a separate commit on top of yours.

After pushing, verify the run actually passed on the remote (lint warnings can still pass locally but fail in CI):

```bash
curl -s "https://api.github.com/repos/Vaxon-AI/EmailFlow/actions/runs?branch=main&per_page=3" \
  | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); d.workflow_runs.forEach(r=>console.log(r.head_sha.slice(0,7),r.status,r.conclusion||'(running)'))"
```

CI config is in `.github/workflows/ci.yml`. The `test` job runs `npm run test:unit`; the `build` job runs `npm run lint` then `npm run build`.

## React patterns the linter enforces

- **Don't sync state with `useEffect` when derived state works.** If you find yourself writing `useEffect(() => setX(value), [dep])`, the lint rule will flag it. Compute X from the dep directly (`const x = useMemo(...)` or just `const x = derive(dep)`).
  - Concrete case: a drawer that should close on route change. Don't store `open: boolean` and reset it in an effect; store the pathname when opened (`openedAt: string | null`) and derive `open = openedAt === currentPathname` - when the pathname changes, the comparison flips false on its own.

## Local changelog convention

- When the user asks for a changelog after a commit, create it as a local-only untracked file.
- Never commit or push changelog files unless the user explicitly asks.
- Name changelog files with the commit short SHA: `changelog_<commit>.md`, for example `changelog_a25a88b.md`.
