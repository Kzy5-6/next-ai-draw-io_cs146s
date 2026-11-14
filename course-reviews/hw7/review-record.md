# HW7 Review and Verification Record

## Historical scope

- Before SHA: `0fa3ba4730babfd3caf5cb63cda185d198ad829b`
- After SHA: `91f462188a5048bdf503d5e5b316cbf558ebfb09`
- Historical diff: `course-reviews/hw7/hw6-history.diff`
- Working branch: `hw07/review`

## Three independent reviews

Three separate review rounds were performed using the prompts in this directory.

| Round | Focus | Prompt | Raw response artifact |
|---|---|---|---|
| Behavior | Observable behavior and contracts | `behavior-prompt.md` | Not preserved as a separate file |
| Design | Module boundaries and integration | `design-prompt.md` | Not preserved as a separate file |
| Security/reliability | Hostile inputs and filesystem failure modes | `reliability-prompt.md` | Not preserved as a separate file |

The review conclusions below are reconstructed from the review findings and subsequent code inspection recorded during this work. They are not verbatim reviewer transcripts. Session/model metadata was not retained.

## Finding adjudication

| ID | Finding | Round(s) | Verdict | Evidence and rationale | Resolution |
|---|---|---|---|---|---|
| R1 | Temporary report filename collision and unsafe cleanup ownership | Behavior, Design, Security/Reliability | Confirmed; one shared finding independently identified by all three rounds | The historical writer used PID plus millisecond timestamp and unconditionally removed the temporary path on failure. Two same-process writes to the same output could collide; the failing writer could delete the other writer's temporary file before its rename. | Replaced timestamp-only naming with `randomUUID()`, tracked temporary-file ownership, and serialized same-process writes per resolved output path. Added concurrent-write regression coverage. |
| R2 | Replacing an existing report could change its POSIX permission bits | Security/Reliability | Confirmed platform-specific risk | Atomic rename installs the temporary file's permissions as the destination's permissions. A previously restrictive report could become more permissive if the temporary file used ordinary defaults. | Temporary files are created with mode `0600`; when replacing an existing file, its permission bits are copied to the temporary file before rename. POSIX test is present but skipped on Windows; Linux/macOS execution remains necessary for direct platform verification. |
| R3 | CLI did not use the shared safe report writer | Design | Confirmed integration gap | Inspection found a second local `writeReportSafely` implementation in `scripts/course-cli.ts`; the CLI was not calling `lib/write-report-safely.ts`. | Removed the local implementation and imported the shared helper. CLI build, CLI unit tests, and a real CLI report write passed afterward. |
| R4 | Existing regular-file replacement was not directly covered | Behavior, Design | Confirmed test-coverage gap; duplicate observation across rounds | Earlier failure coverage used a directory at the destination rather than an existing regular report file. | Added a test that replaces an existing regular report file. |
| R5 | CLI secret-redaction test may not exercise a value actually consumed or logged by the CLI | Design | Test-evidence limitation | The review questioned whether the sentinel environment variable was read by the implementation. No separate production disclosure was demonstrated. | Retain as a test-quality limitation; do not classify as a confirmed production vulnerability. |
| R6 | XML DTD/entity parsing edge cases, malformed delimiter interactions, decompression allocation behavior, browser/server boundary, and broader logging behavior | All rounds, with differing emphasis | Insufficient evidence / questions | Reviewers raised areas requiring additional caller, parser, runtime, or threat-model evidence. No reproducible bypass or production defect was established in the review evidence available here. | Do not claim these concerns are disproven. Keep them as follow-up verification topics. |

## Cross-round comparison

- All three reviews independently identified the temporary-file collision/cleanup ownership defect. This is one defect, not three separate issues.
- The POSIX permission concern was unique to the security/reliability review.
- The CLI/shared-helper integration gap was identified by the design review and confirmed by direct caller inspection.
- Existing regular-file replacement coverage was independently questioned in the behavior and design reviews; it was addressed with a dedicated regression test.
- XML parsing, decompression, logging, and browser/server separation concerns were not promoted to confirmed defects without reproducible evidence.

## Fixes and regression evidence

The shared writer in `lib/write-report-safely.ts` now:

- Uses a UUID in the temporary filename.
- Tracks whether the current call owns the temporary file before cleanup.
- Serializes writes to the same resolved output path within the current process.
- Creates new temporary reports with restrictive permissions.
- Preserves existing POSIX permission bits when replacing a report.
- Uses atomic rename after the temporary file is fully written and closed.

The CLI in `scripts/course-cli.ts` now imports and uses the shared writer instead of maintaining a duplicate implementation.

Regression evidence:

- `npx.cmd vitest run tests/unit/course-cli.test.ts tests/unit/write-report-safely.test.ts`: 16 passed, 1 skipped.
- The permission test is skipped on Windows; it needs POSIX CI or a POSIX machine for direct verification.
- The concurrency regression was run repeatedly in isolated test runs; two sequences of ten runs passed.
- `npm.cmd run course:build`: passed.
- `npm.cmd run course:check -- --input course-fixtures/normal.drawio --output .runtime/hw7-smoke-report.json --force`: passed; one diagram completed, zero failures.
- Smoke report: 1 page, 7 cells, 0 errors, 0 warnings, status `completed`.
- `npx.cmd vitest run`: 94 test files passed; 1,016 tests passed, 1 skipped, 0 failed.
- Vite emitted an advisory that `vite-tsconfig-paths` can be replaced by native `resolve.tsconfigPaths`; it did not fail the tests.

The full unit suite emitted expected stderr from tests that deliberately simulate provider failures, rejected redirects, and unavailable services. These messages were test output, not test failures.

## Independent review lab

Location: `course-labs/review/`

The intentionally vulnerable starter used `target.startsWith(base)` for path containment. This incorrectly accepted a sibling path such as `reports-private` when the allowed directory was `reports`.

Initial reproduction: three tests passed and the sibling-prefix traversal test failed.

The implementation was repaired using `path.relative()` and checks for parent traversal and absolute relative paths.

Post-fix result: all four tests passed.

Run with:

`node --test course-labs/review/report-path.test.js`

## HW8 delivery decision

**Decision: not yet approved for interface integration.**

The backend/report-writing changes are a plausible HW8 candidate, and the CLI smoke test proves the command-line path can write a completed report. However:

- The HW3 minimum user-interface flow has now been manually re-verified; see the browser regression evidence below.
- The current HEAD is still the historical HW6 commit `91f462188a5048bdf503d5e5b316cbf558ebfb09`.
- The HW7 fixes are uncommitted, so there is no honest candidate commit SHA yet.
- POSIX permission preservation still needs execution on a POSIX platform.

Candidate SHA: `6a92cba`. Do not substitute the historical HW6 SHA.

Before approving interface integration, retain the completed HW3 browser regression evidence, verify the relevant browser/server import boundary, and run the permission test on POSIX CI.

## HW3 Browser Regression Evidence

After the HW7 fixes, the HW3 minimum interface was manually revalidated in the browser. The two-page fixture produced the expected single `missing-label` warning for `page-b` / `n2`; clicking the finding navigated to and highlighted the target. After adding a label, the all-pages check reported 2 pages, 14 cells, 0 errors, and 0 warnings. The exported file was then opened in a blank diagram; the label persisted and the check again reported 2 pages, 14 cells, 0 errors, and 0 warnings.

This is manual browser regression evidence for the minimum interface criteria, not evidence of automated browser coverage.
