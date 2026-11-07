# HW4 — Extensible Checking System and Task Handoff

## 1. Architecture

The W4 implementation separates XML adaptation, rule execution, report generation, and report comparison.

```text
Draw.io XML
    |
    v
diagram-check-adapter.ts
    |
    v
DiagramCheckData
    |
    v
diagram-check-rules.ts
    |
    v
DiagramCheckIssue[]
    |
    v
diagram-check-report.ts
    |
    v
DiagramCheckReport
    |
    v
diagram-check-compare.ts
    |
    v
added / resolved / persisting
```
The UI integration is in `components/canvas/missing-label-dev-panel.tsx`.

Shared interfaces are in`lib/diagram-check-types.ts`.

The orchestration entry point is `lib/diagram-check.ts`.

## 2. Main interfaces

```text
Normalized diagram data
interface DiagramCheckData {
    pages: DiagramCheckPage[]
}

interface DiagramCheckPage {
    id: string
    name: string
    nodes: DiagramCheckNode[]
    edges: DiagramCheckEdge[]
    cellCount: number
}

interface DiagramCheckNode {
    id: string
    role: "process" | "container" | "annotation" | "decoration"
    label: string
}

interface DiagramCheckEdge {
    id: string
    source: string | null
    target: string | null
}
The adapter preserves page and cell identities, endpoint references, and readable labels. Structural root cells 0 and 1 are excluded from rule evaluation. Duplicate cell IDs within one page are invalid; IDs may repeat across different pages.
Rule configuration
const FLOWCHART_CONFIG = {
    id: "flowchart",
    rules: {
        "missing-label": "warning",
        "isolated-step": "warning",
        "missing-endpoint": "warning",
        "dangling-endpoint": "error",
    },
}

```
The sketch profile disables missing-endpoint and keeps dangling-endpoint as an error. Custom configurations must provide all four rules and valid severity values.

#### Report comparison
```text
countItems<T>(items: T[] | null): number | "未知"

countItems(["a", "b"]) // 2
countItems([])         // 0
countItems(null)       // "未知"
```
An empty array means the count is known to be zero. null means the count is unavailable.

##3. Task breakdown and dependencies
| Task | Input | Output | Dependency | Completion condition |
|---|---|---|---|---|
| Data adapter | Draw.io XML | DiagramCheckData or invalid result | XML parser and page decompression | Handles pages, roles, wrappers, IDs, endpoints, limits, and malformed input |
| Rule execution | DiagramCheckData and RuleConfig | Sorted DiagramCheckIssue[] | Shared types and adapter output | Four rules and both built-in profiles behave as specified |
| Report generation | Input metadata, scope, config, data, and issues | DiagramCheckReport | Adapter and rule execution | Correct status, scope, counts, errors, fingerprint, and stable issue ordering |

The report comparison module is an additional report capability.
## 4. Handoff Exercise

The handoff was simulated within the current conversation rather than through a separate independent Agent session. This is not a literal independent-agent handoff.

The requested `countItems` contract accepts an array or `null`, returns the array length for an array, and returns `"未知"` for `null`.

The important distinction is:

- An empty array (`[]`) returns `0`.
- `null` returns `"未知"`.

`lib/count-items.ts` documents the interface and examples. `tests/unit/count-items.test.ts` covers all three cases.

## 5. Integration Checks and Issues Addressed

- Added XML adapter tests for `object` and `UserObject` wrappers.
- Added a same-page duplicate-ID test. It must produce an invalid result.
- Retained the cross-page duplicate-ID test. Reusing an ID on another page is allowed.
- Added compressed-content safety tests for cumulative decompressed content and DTD declarations inside decompressed pages.
- Added custom configuration tests for invalid severity values and severity changes.
- Added report comparison tests for added, resolved, persisting, configuration changes, different fingerprints, scope mismatch, and non-completed reports.
- The failed-report test asserts that unavailable summary counts are `null`, not zero.
- Integration tests cover normal input, missing labels, free endpoints, dangling endpoints, current-page scope, and invalid input.

## 6. Regression Results

Latest combined verification:

- `npx.cmd tsc --noEmit` — passed.
- `npx.cmd vitest run` — 92 test files passed, 984 tests passed.
- No test failures.

The focused W4 test files include:

- `diagram-check.test.ts`
- `diagram-check-adapter.test.ts`
- `diagram-check-integration.test.ts`
- `diagram-check-compare.test.ts`
- `count-items.test.ts`
- `missing-label-core.test.ts`
- `missing-label.test.ts`

Vite printed a `vite-tsconfig-paths` compatibility notice. It did not cause test failures.

The `.gitignore` file already contains `/.runtime/`. No `.runtime` directory was found during the workspace check.

## 7. Source Map and Remaining Verification

The expected `docs/source-map.md` was not present in the checked repository. The architecture map above is based on inspected source files, not a reproduction of that missing document.
