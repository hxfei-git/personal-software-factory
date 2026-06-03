# Documentation

This directory holds architecture references, API contracts, safety guidance, operations notes, ADRs, progress rollups, and historical planning material for Personal Software Factory.

Start with the root current fact sources:

- `../struct.md`
- `../summary.md`
- `../debug.md`
- `../README.md`
- `progress.md`

ADRs under `adr/` are retained decision records. Numbered phase planning documents were removed during aggressive cleanup after their current facts moved into root fact sources, current operational docs, or ADRs.

Low-value historical plans and brainstorms are removed once their useful facts are represented in current docs or ADRs. `archive/` is reserved for retained audit references only.

Documentation should stay aligned with the implemented system. Do not describe a capability as enabled unless its gates, tests, and safety boundaries are implemented and verified.
