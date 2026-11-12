# HW5 — CLI and CI

## Build Behavior

`course:check` and `course:compare` use npm lifecycle pre-scripts to run `course:build` first.

The build bundles the Node.js execution path with esbuild into `.runtime/course-cli.cjs`. This generated directory is local and ignored by Git.

### Build and Run Commands

```powershell
npm ci
npm run course:build
node .runtime/course-cli.cjs --help

npm run course:check -- --input course-fixtures/normal.drawio --output .runtime/normal.json
npm run course:check -- --input course-fixtures/batch --fail-on warning --output .runtime/batch.json
npm run course:check -- --input course-fixtures/batch --dry-run

npm run course:compare -- --before .runtime/before.json --after .runtime/after.json
```

Built-in configurations are:

- `flowchart` (default)
- `sketch`

A custom JSON configuration can be supplied using `--config path/to/config.json`.

## CLI Behavior

### Directory Mode

Directory mode follows these rules:

- Scans only direct child files with the `.drawio` extension.
- Does not recursively scan nested directories.
- Does not follow directory entries that are symbolic links.
- Processes files in stable filename order.

### Batch Reports

A batch report contains one result for each selected input, including invalid or failed files.

An invalid file does not stop the remaining checks from executing.

### Dry Run

The `--dry-run` option validates:

- CLI arguments.
- Configuration.
- Input selection.
- Output destination.

It does not:

- Parse diagram contents.
- Run validation rules.
- Create directories.
- Write reports.

### Output Protection

An existing output file is protected unless `--force` is supplied.

Reports are written through a temporary file and renamed only after the temporary write succeeds.

### Exit Codes

| Exit Code | Description |
|---|---|
| `0` | Checks completed and no issue met the selected failure threshold. |
| `1` | At least one completed report met `--fail-on`. |
| `2` | Invalid CLI arguments/configuration/input, malformed XML in a batch, failed execution, or an incomparable report. |

The default `--fail-on` threshold is `error`.

Available thresholds:

- `error` (default): Fails when errors are reported.
- `warning`: Fails when warnings or errors are reported.
- `none`: Disables issue-based failure.

**Example:** A batch containing three completed files and one invalid XML file writes all four results and exits with code `2`.

## Compare Behavior

The compare command requires completed reports with compatible schema and scope.

Issue identity is determined by:

- Page ID
- Cell ID
- Rule ID

Message text and `generatedAt` do not affect issue identity.

Configuration digest changes are reported separately.

Incomplete or malformed reports are rejected. The CLI does not infer resolutions from incomplete results.

## CI Workflow

The GitHub Actions workflow is located at:

`.github/workflows/course-check.yml`

### Workflow Triggers

The workflow runs on pull requests whose base branch is `course/main`.

### Workflow Steps

The workflow uses Node.js 24 and performs the following steps:

1. Runs `npm ci`.
2. Performs TypeScript checking.
3. Runs the diagram and CLI test set.
4. Builds the CLI.
5. Checks `normal.drawio`.

### Artifact Upload

The report artifact is uploaded using `if: always()`.

If the normal report was not created, the workflow emits a warning directing the reader to the earlier logs.

**Artifact name:** `hw5-normal-diagram-report`

## Local Verification Record

The following behaviors were exercised locally during HW5 development.

| Test Case | Expected/Observed Result | Exit Code |
|---|---|---|
| `normal.drawio` | Completed successfully | `0` |
| `labels.drawio` with default `--fail-on error` | Completed successfully | `0` |
| `labels.drawio` with `--fail-on warning` | Warning threshold triggered failure | `1` |
| Batch with four inputs | 3 completed, 1 failed; invalid input did not discard the first three results | `2` |
| `--dry-run` | Printed the execution plan without creating the requested report | `0` |
| Comparing identical reports | No added, resolved, or persisting issues | `0` |
| Comparing normal and labels reports | Detected the missing-label issue as added | `0` |
| Existing output without `--force` | Output protected; operation rejected | `2` |
| Existing output with `--force` | Report replaced successfully | `0` |
| Missing output parent directory | Rejected without creating the directory | `2` |

## CI Run Links and Failure Diagnosis

> **Important:** Complete this section after running the workflow on the personal GitHub fork. Do not substitute local verification results for GitHub Actions run URLs.

### GitHub Actions Runs

| Item | Result |
|---|---|
| Successful normal PR Actions run | TODO — Paste the GitHub Actions run URL |
| Downloadable artifact name | `hw5-normal-diagram-report` |
| Expected-failure demonstration PR Actions run | TODO — Paste the GitHub Actions run URL |
| Expected-failure demonstration PR | TODO — Paste the pull request URL |

### Expected-Failure Demonstration

Perform the following steps:

1. Create a temporary pull request containing a change that makes the workflow check a known-invalid diagram fixture.
2. Verify that the GitHub Actions workflow fails for the expected diagram/input failure.
3. Confirm from the Actions logs that the failure is not caused by:
   - Dependency installation.
   - TypeScript checking.
   - Test execution.
4. Verify that the CLI exits with code `2`.
5. Record the GitHub Actions run URL.
6. Record the demonstration pull request URL.
7. Close the demonstration pull request without merging it.

### Real CI Failure Diagnosis

For any actual CI failure, record the following information:

| Field | Description |
|---|---|
| Failing step | Name of the failed GitHub Actions step |
| Relevant log excerpt | The relevant error message or log output |
| Diagnosis category | Configuration, graph issue/threshold, or execution/tooling |
| Smallest corrective change | The minimum change required to fix the failure |
| Rerun URL | GitHub Actions URL for the verification run |

### GitHub Actions Disabled

If GitHub Actions is disabled for the fork:

- Record the repository setting prompt indicating that Actions must be enabled.
- Record the equivalent local verification commands.
- Include the corresponding local exit codes.

Do not claim that a GitHub Actions run succeeded if the workflow was only verified locally.
