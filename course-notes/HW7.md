# HW7 — Independent Review, Finding Adjudication, and Regression

## Historical change under review

HW7 reviews the HW6 change from `0fa3ba4730babfd3caf5cb63cda185d198ad829b` to `91f462188a5048bdf503d5e5b316cbf558ebfb09`.

The historical change covered multiple parts of the course diagram-checking workflow, including the draw.io XML adapter, CLI behavior and tests, integration and boundary tests, safe report writing, browser regression coverage, and safety fixture generation.

The review packet and historical diff are under `course-reviews/hw7/`.

## Review process and evidence quality

Three independent review rounds were conducted with separate prompts:

- Behavior: externally observable behavior, boundaries, CLI behavior, and report replacement.
- Design and integration: module boundaries, callers, Node/browser separation, configuration, and shared interfaces.
- Security and reliability: hostile XML, resource limits, temporary files, cleanup, and sensitive data.

The review conclusions and adjudication are recorded in `course-reviews/hw7/review-record.md`.

The separate verbatim reviewer response files were not preserved in the repository. The adjudication record therefore summarizes the findings available from the review work; it does not claim to contain verbatim transcripts or unrecorded session metadata.

## Findings and decisions

The most important finding was a temporary-file ownership race in the historical report writer. Its temporary filename combined the output path, process ID, and millisecond timestamp. Concurrent writes in the same process could choose the same temporary path. The losing write could then remove the temporary file belonging to the winning write, causing the winning rename to fail.

All three review rounds independently identified this same issue. It is recorded as one confirmed defect, not three separate defects.

The security/reliability review also identified a POSIX permissions concern: replacing a restrictive report with a temporary file could change the destination's permissions. The implementation now creates temporary files with mode `0600` and preserves the existing file's permission bits when replacing it. The POSIX-specific regression test is skipped on Windows, so direct verification on Linux or macOS remains outstanding.

The design review identified that the CLI still contained its own report writer rather than calling the shared helper. Direct inspection confirmed this integration gap. `scripts/course-cli.ts` now imports `writeReportSafely` from `lib/write-report-safely.ts`, and the duplicate local implementation and unused filesystem imports were removed.

The earlier test suite also lacked a direct successful replacement test for an existing regular report file. A regression test was added.

Other topics—including XML DTD/entity edge cases, malformed XML delimiter interactions, decompression allocation behavior, broader secret-redaction coverage, and browser/server boundaries—remain questions or evidence limitations where no reproducible defect was established. They should not be described as proven safe merely because no exploit was demonstrated.

## Independent review lab

`course-labs/review/` contains a standalone path-containment exercise.

The original implementation used a string-prefix check. That allowed a sibling directory whose name began with the permitted directory name to pass validation. The initial test run reproduced the defect: three tests passed and the sibling-prefix traversal test failed.

The fix uses `path.relative()` and rejects parent traversal and absolute relative paths. The post-fix suite passed all four tests:

`node --test course-labs/review/report-path.test.js`

## Implementation changes and regression tests

The shared report writer now:

- Uses a UUID-based temporary filename.
- Cleans up only a temporary file owned by the current write.
- Serializes writes to the same resolved path within the process.
- Creates temporary files with restrictive permissions.
- Preserves existing POSIX permission bits when replacing an existing report.
- Renames the completed temporary file into place.

The CLI now uses this shared implementation.

The helper and CLI tests passed: 16 passed, 1 skipped. The skipped test is the POSIX permission test on Windows. The concurrency regression passed in two separate sequences of ten repeated runs.

The CLI build succeeded. A real smoke run against `course-fixtures/normal.drawio` wrote `.runtime/hw7-smoke-report.json` and reported one completed diagram and zero failures. The report contained one page, seven cells, zero errors, zero warnings, and status `completed`.

The full unit suite passed:

- 94 test files passed.
- 1,016 tests passed.
- 1 test skipped.
- 0 tests failed.

Some tests intentionally emit provider and network error messages to stderr while asserting error-handling behavior. Those messages did not indicate test failures.

## Remaining verification

The Windows run cannot validate POSIX permission behavior because that test is skipped on Windows. Run the relevant test on Linux or macOS CI.

The HW3 minimum user-interface flow was manually re-verified after the HW7 changes; see the browser regression evidence below. The CLI smoke test validates the command-line path, while the browser check provides separate UI regression evidence.

The Node-only filesystem helper's browser/server import boundary should remain part of the final integration check.

## HW8 decision and candidate SHA

**Decision: not yet approved for interface integration.**

The HW3 minimum interface regression has passed, including cross-page navigation, highlighting, correction, and export/reopen persistence. However, POSIX permission preservation still needs direct verification on Linux or macOS, and the Node-only filesystem helper's browser/server import boundary needs final inspection. The changes are also not yet committed.

Current HEAD is the historical HW6 commit `91f462188a5048bdf503d5e5b316cbf558ebfb09`. It is not the HW8 candidate SHA.

The HW7 candidate commit is `6a92cba`. Do not invent or reuse the historical SHA as the candidate.

## HW3 Browser Regression Verification

The HW3 minimum interface regression check was manually verified in the browser after the HW7 changes.

- Imported `course-fixtures/multi-page.drawio`: 2 pages and 14 cells.
- Ran the all-pages flowchart check: found exactly one `missing-label` warning for cell `n2` on page `page-b`.
- Clicked the finding: the editor navigated to the target page and highlighted the target shape.
- Added a label and reran the check: 2 pages, 14 cells, 0 errors, 0 warnings.
- Exported the diagram, opened the exported file in a blank diagram, and reran the check: 2 pages, 14 cells, 0 errors, 0 warnings. The added label was retained.

Result: the HW3 minimum interface regression verification passed, including cross-page issue navigation, highlighting, rechecking after correction, and export/reopen persistence.
