# HW5 — CLI and CI

## Build behavior

`course:check` and `course:compare` use npm lifecycle pre-scripts to run `course:build` first. The build bundles the Node execution path with esbuild into `.runtime/course-cli.cjs`. This generated directory is local and ignored by Git.

```powershell
npm ci
npm run course:build
node .runtime/course-cli.cjs --help
npm run course:check -- --input course-fixtures/normal.drawio --output .runtime/normal.json
npm run course:check -- --input course-fixtures/batch --fail-on warning --output .runtime/batch.json
npm run course:check -- --input course-fixtures/batch --dry-run
npm run course:compare -- --before .runtime/before.json --after .runtime/after.json
Built-in configurations are flowchart (default) and sketch. A JSON configuration can be supplied with --config path/to/config.json.
CLI behavior
Directory mode scans only direct child files with the .drawio extension. It does not recurse into nested directories or follow directory entries that are symbolic links. Files are processed in stable filename order.

A batch report contains one result for each selected input, including invalid or failed files. One invalid file does not stop the remaining checks.

--dry-run validates arguments, configuration, input selection, and output destination without parsing diagram contents, running rules, creating directories, or writing reports.

An existing output file is protected unless --force is supplied. The report is written through a temporary file and renamed only after the temporary write succeeds.

Exit codes:
- 0: checks completed and no issue met the selected failure threshold.
- 1: at least one completed report met --fail-on (error by default; warning includes warnings; none disables issue-based failure).
- 2: invalid CLI arguments/configuration/input, malformed XML in a batch, failed execution, or an incomparable report.
A batch with three completed files and one invalid XML file writes all four results and exits 2.
Compare behavior
Compare requires completed reports with compatible schema and scope. Issue identity uses page ID, cell ID, and rule ID; message text and generatedAt do not affect identity. Configuration digest changes are reported separately. Incomplete or malformed reports are rejected; the CLI does not infer resolutions from incomplete results.
CI workflow
.github/workflows/course-check.yml runs on pull requests whose base branch is course/main. It uses Node 24, runs npm ci, TypeScript checking, the diagram and CLI test set, builds the CLI, and checks normal.drawio.

The report artifact is uploaded with if: always(). If the normal report was not created, the workflow emits a warning directing the reader to earlier logs.
Local verification record
The following behaviors were exercised locally during HW5 development:
- normal.drawio: completed, exit 0.
- labels.drawio with default --fail-on error: exit 0.
- labels.drawio with --fail-on warning: exit 1.
- batch: completed: 3, failed: 1; the invalid fourth input did not discard the first three; exit 2.
- --dry-run: emitted the plan and did not create the requested report.
- Comparing an identical report: no added, resolved, or persisting issues.
- Comparing normal and labels reports: detected the missing-label issue as added.
- Existing output without --force: exit 2; with --force: report replaced successfully.
- Missing output parent: rejected without creating the directory.
CI run links and failure diagnosis
Fill in these fields after running the workflow on the personal fork. Do not substitute local results for GitHub Actions run URLs.
- Successful normal PR Actions run: TODO — paste the run URL.
- Downloadable artifact name: hw5-normal-diagram-report.
- Expected-failure demonstration PR Actions run: TODO — paste the run URL.
- Expected-failure demonstration PR: TODO — paste the PR URL; close it after recording the run.
For the expected-failure demonstration, use a temporary PR change that makes the workflow check a known-invalid diagram fixture. Confirm from the Actions log that the failure is the expected diagram/input failure (rather than dependency installation, TypeScript, or test execution), verify the CLI exit code is 2, record the run URL, and close the demonstration PR without merging.

For any real CI failure, record the failing step, relevant log excerpt, diagnosis category (configuration, graph issue/threshold, or execution/tooling), the smallest corrective change, and the rerun URL. If GitHub Actions is disabled for the fork, record the repository setting prompt and the equivalent local commands and exit codes instead.