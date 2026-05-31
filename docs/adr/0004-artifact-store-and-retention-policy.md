# ADR 0004: Artifact Store And Retention Policy

Date: 2026-05-31

Status: accepted

## Context

Current demo artifacts are generated under `missions/<mission-id>/...`, while the long-term plan recommends a dedicated artifact store. Real execution will produce larger files such as stdout/stderr logs, diffs, Playwright traces, screenshots, videos, HTML reports, and provider payloads.

## Decision

The recommended artifact path for new real-mode work is:

```text
artifacts/missions/<mission-id>/<run-id>/...
```

Existing `missions/<mission-id>/...` demo paths remain supported for backward compatibility. Small text artifacts may still be stored inline in the database. Large files should be path-only with metadata.

Artifact metadata should include:

- Mission ID;
- WorkerRun ID when available;
- artifact type;
- path;
- size;
- mime type;
- generated-by module;
- redaction status;
- retention class;
- created timestamp.

## Consequences

- Hub and API must tolerate both old demo paths and new artifact-store paths.
- Real logs and browser artifacts should not be embedded directly in database rows.
- Artifact cleanup can be implemented later without breaking current demo outputs.
- Secret redaction must happen before writing displayable artifacts.
