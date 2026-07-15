# Database Last View Delete Disabled Smoke

Status: done

Implemented:
- Extended the deterministic database template UI smoke after the view delete flow.
- Opens settings for the final remaining database view.
- Verifies the delete action is disabled.
- Verifies the current default view action is disabled.
- Stabilized template application smoke by polling persisted row/page template state before asserting DOM text.
- Corrected the template manager smoke to explicitly create a new template instead of editing the first existing template.

Gates:
- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
