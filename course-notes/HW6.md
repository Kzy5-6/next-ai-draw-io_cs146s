# HW6 ? Quality Engineering and Testing

## Overview

This assignment strengthens the diagram validation and reporting workflow through boundary testing, property-based testing, CLI verification, safe report writing, browser regression tests, and mutation testing.

The implementation focuses on preserving validation correctness at input boundaries, preventing unsafe XML processing, ensuring deterministic CLI behavior, and avoiding data loss when report writes fail.

## Implementation

- Updated `lib/diagram-check-adapter.ts` to ignore `DOCTYPE` and `ENTITY` text inside XML comments and CDATA while continuing to reject actual DTD declarations.
- Added `tools/make_safety_cases.py` to generate local safety fixtures. Generated `.runtime` data is ignored and is not required by the unit tests.
- Added adapter boundary tests that construct their inputs dynamically, avoiding dependencies on local fixture files.
- Added property tests for cell ordering, coordinate translation, page isolation, label validation, and input immutability.
- Added CLI tests for dry-run/write path consistency and sensitive-data redaction in logs.
- Extracted safe report writing into `lib/write-report-safely.ts`. A failed replacement preserves the previous report and cleans up the temporary file.
- Updated browser test helpers to make canvas zoom and empty-canvas interactions reliable when floating UI panels are present.

## Test Coverage

| Area | Coverage |
|---|---|
| Input boundaries | Cell-count, page-count, file-size, decompressed-size, empty input, and small valid input |
| XML safety | DTD and entity rejection; comment and CDATA handling |
| Diagram structure | Multiple pages, page isolation, duplicate IDs across pages, and validation behavior |
| Property testing | Ordering, coordinate translation, page isolation, label correction, and immutability |
| CLI | Dry-run/write consistency and log redaction |
| Report writing | Failed replacement preserves the existing report and removes temporary files |
| Browser E2E | Workspace interactions, zoom, canvas selection, and export-related regressions |

Boundary coverage includes 9,999/10,000/10,001 cells, 20/21 pages, 2 MiB and 2 MiB + 1 byte files, and the decompressed-size limit.

## Mutation Testing

Three deliberate mutations were introduced and checked against the test suite:

1. Replacing page-scoped duplicate-ID handling with a global duplicate-ID set was detected by the adapter tests. The cross-page duplicate-ID behavior test failed as expected.
2. Changing whitespace-only label handling was initially not detected. A regression assertion was added to ensure whitespace-only process labels are reported as missing; the mutation was then detected.
3. Changing `countItems(null)` from an unknown result to zero was detected by the count-items tests.

All production mutations were restored after testing.

## Verification Results

- Biome check: 8 files checked successfully.
- Adapter tests: 27 passed.
- Full unit test suite: 94 test files and 1,014 tests passed.
- Workspace E2E suite: 142 tests passed in total. One test that initially timed out during application startup passed when rerun independently.
- Additional focused E2E regression checks passed.
- Production build: passed. Next.js completed compilation, TypeScript validation, page-data collection, generation of 91 static pages, and final optimization.

The production build emitted four Turbopack warnings about dynamic filesystem access in existing admin settings and server model configuration code. These warnings concern output tracing and deployment size, not build failure.

## Dependency Security Audit

`npm audit --omit=dev` reported 10 vulnerabilities: 1 low, 6 moderate, 2 high, and 1 critical.

The reported dependency paths include Next.js, Zod, sanitize-html through article extraction dependencies, and undici through the AI SDK dependency tree. No dependency upgrades or lockfile changes were made as part of this assignment. The audit therefore remains an outstanding dependency-maintenance item rather than a passing check.

## Commands Used

```powershell
npx.cmd biome check
npx.cmd vitest run tests/unit/diagram-check-adapter.test.ts
npx.cmd vitest run
npx.cmd playwright test tests/e2e/workspace.spec.ts
npm.cmd run build
npm.cmd audit --omit=dev
Outcome
The validation, CLI, report-writing, and browser workflows have expanded regression coverage. Boundary and mutation tests provide evidence that important failure cases are detected, while the full unit suite, browser tests, and production build pass. Dependency audit findings and existing Turbopack filesystem-tracing warnings are documented separately and were not silently treated as resolved.
