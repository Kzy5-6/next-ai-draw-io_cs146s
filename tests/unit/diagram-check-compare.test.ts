import { describe, expect, it } from "vitest"
import { compareDiagramReports } from "@/lib/diagram-check-compare"
import { buildDiagramCheckReport } from "@/lib/diagram-check-report"
import { FLOWCHART_CONFIG } from "@/lib/diagram-check-rules"
import type {
    DiagramCheckData,
    DiagramCheckIssue,
} from "@/lib/diagram-check-types"

const data: DiagramCheckData = {
    pages: [
        {
            id: "page-a",
            name: "Page A",
            cellCount: 4,
            nodes: [],
            edges: [],
        },
    ],
}

const issue = (
    cellId: string,
    ruleId: DiagramCheckIssue["ruleId"] = "missing-label",
    message = "Issue",
): DiagramCheckIssue => ({
    pageId: "page-a",
    cellId,
    ruleId,
    severity: "warning",
    message,
})

function report(
    issues: DiagramCheckIssue[],
    options: {
        scope?: { kind: "all" } | { kind: "current"; pageId: string }
        config?: typeof FLOWCHART_CONFIG
        fingerprint?: string
        status?: "completed" | "invalid" | "failed"
    } = {},
) {
    return buildDiagramCheckReport({
        inputName: "diagram.drawio",
        fingerprint: options.fingerprint ?? "fingerprint-a",
        scope: options.scope ?? { kind: "all" },
        config: options.config ?? FLOWCHART_CONFIG,
        status: options.status ?? "completed",
        data,
        issues,
        generatedAt: "2026-01-01T00:00:00.000Z",
    })
}

describe("diagram report comparison", () => {
    it("classifies added, resolved and persisting issues by identity", () => {
        const previous = report([issue("keep"), issue("remove")])
        const current = report([
            issue("keep", "missing-label", "Updated message"),
            issue("add"),
        ])

        const result = compareDiagramReports(previous, current)

        expect(result.comparable).toBe(true)
        if (!result.comparable) return

        expect(result.added.map((item) => item.cellId)).toEqual(["add"])
        expect(result.resolved.map((item) => item.cellId)).toEqual(["remove"])
        expect(result.persisting.map((item) => item.cellId)).toEqual(["keep"])
    })

    it("compares reports when configuration changed", () => {
        const changedConfig = {
            id: "custom",
            rules: {
                ...FLOWCHART_CONFIG.rules,
                "missing-label": "error" as const,
            },
        }

        const previous = report([issue("n1")])
        const current = report(
            [
                {
                    ...issue("n1"),
                    severity: "error",
                },
            ],
            { config: changedConfig },
        )

        const result = compareDiagramReports(previous, current)

        expect(result.comparable).toBe(true)
        if (!result.comparable) return

        expect(result.configurationChanged).toBe(true)
        expect(result.added).toEqual([])
        expect(result.resolved).toEqual([])
        expect(result.persisting).toHaveLength(1)
    })

    it("allows different input fingerprints", () => {
        const previous = report([issue("n1")], {
            fingerprint: "before",
        })
        const current = report([issue("n1")], {
            fingerprint: "after",
        })

        const result = compareDiagramReports(previous, current)

        expect(result.comparable).toBe(true)
    })

    it("rejects reports with different scopes", () => {
        const previous = report([issue("n1")], {
            scope: { kind: "all" },
        })
        const current = report([issue("n1")], {
            scope: { kind: "current", pageId: "page-a" },
        })

        expect(compareDiagramReports(previous, current)).toMatchObject({
            comparable: false,
            reason: "报告检查范围不一致",
        })
    })

    it("rejects non-completed reports", () => {
        const previous = report([issue("n1")])
        const failed = report([], { status: "failed" })

        expect(compareDiagramReports(previous, failed)).toMatchObject({
            comparable: false,
            reason: "只有 completed 状态的报告可以比较",
        })
    })
})
