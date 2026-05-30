# @psf/project-registry

Local Project Registry scanner for Personal Software Factory.

It scans `projects/*/project.passport.yaml`, delegates passport parsing and normalization to `@psf/project-passport`, and returns storage-ready project records plus the normalized passport.

```ts
import { scanProjectRegistry, findProjectById } from "@psf/project-registry";

const projects = await scanProjectRegistry("projects");
const project = findProjectById(projects, "ai-novelist");
```

## Error Behavior

Directories without `project.passport.yaml` are skipped. Invalid existing passport files throw `ProjectRegistryError` with a stable `code`, message, and details containing the passport path and underlying cause.
