# Developer Changelog: Dashboard Context Filters, Priority Drilldown, AI Acceptance

## Summary

This update turns the Dashboard into a context-filterable workspace and improves the priority and AI quality signals.

## Key Changes

- Added Dashboard context filters:
  - Identity filter is now a multi-select popover.
  - Project filter is disabled until at least one identity is selected.
  - Project options are limited to the selected identity or identities.
  - Both filters support `Uncategorized`.
  - Empty selection is shown as `All`.

- Updated Dashboard summary data flow:
  - `/api/dashboard/summary` now accepts multi-value `identity` and `project` query params.
  - Query params are comma-separated in the URL and survive refresh.
  - Dashboard stats, email classification, priority distribution, AI suggestions, attention emails, top tasks, due-this-week, and completion rate all use the selected context.
  - Email filtering is resolved through `ThreadMemory -> MatterMemory -> ProjectContext -> UserIdentity`.
  - Task filtering is resolved through `Task.matter -> MatterMemory -> ProjectContext -> UserIdentity`.

- Removed the old Dashboard identity/project cards:
  - `Active Identities` and `Active Projects` are no longer separate display cards.
  - The new top context filter replaces them.

- Added priority drilldown:
  - Dashboard Priority Distribution rows now link to `/dashboard/tasks?priority=...`.
  - Tasks page now has a priority filter: `All priorities`, `Critical`, `High`, `Medium`, `Low`.
  - `/api/tasks` supports `priority=critical|high|medium|low`.

- Replaced the old AI metric:
  - Removed `AI extraction rate`.
  - Added `AI task acceptance`.
  - It only counts `source === "ai_auto"` tasks.
  - Accepted = `confirmed + completed`.
  - Rejected = `dismissed`.
  - Pending AI suggestions are excluded from the denominator.
  - If there are no decided AI tasks, the Dashboard shows `Not enough decisions yet`.

## Notes

- `Uncategorized` uses the special URL token `__uncategorized__`.
- For identity filtering, uncategorized includes tasks/emails without a matter/project or with a project that has no identity.
- For project filtering, uncategorized includes tasks/emails without a project/matter.
- Dashboard project filter intentionally requires an identity first because project is treated as a child context of identity.

## Verification

- `npm run lint` passed.
- `npm run test:unit` passed: 260 tests.
- `npx next build --webpack` passed.
- Local Windows/OneDrive emitted a webpack cache rename warning after build, but the build completed successfully.
