import { describe, expect, it } from "vitest"
import { buildDiagramCheckReport } from "@/lib/diagram-check-report"
import {
    FLOWCHART_CONFIG,
    runDiagramRules,
    SKETCH_CONFIG,
    validateRuleConfig,
} from "@/lib/diagram-check-rules"
import type {
    DiagramCheckData,
    DiagramCheckIssue,
} from "@/lib/diagram-check-types"

const sampleData: DiagramCheckData = {
    pages: [
        {
            id: "page-a",
            name: "Page A",
            cellCount: 6,
            nodes: [
                { id: "n1", role: "process", label: "" },
                { id: "n2", role: "container", label: "Group" },
                { id: "n3", role: "process", label: "Isolated" },
            ],
            edges: [
                { id: "e1", source: "n1", target: "ghost" },
                { id: "e2", source: null, target: "n2" },
            ],
        },
        {
            id: "page-b",
            name: "Page B",
            cellCount: 2,
            nodes: [],
            edges: [],
        },
    ],
}

describe("diagram check rules", () => {
    it("reports missing labels, isolated steps and invalid endpoints", () => {
        const issues = runDiagramRules(sampleData, FLOWCHART_CONFIG)

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    pageId: "page-a",
                    cellId: "n1",
                    ruleId: "missing-label",
                    severity: "warning",
                }),
                expect.objectContaining({
                    pageId: "page-a",
                    cellId: "n3",
                    ruleId: "isolated-step",
                }),
                expect.objectContaining({
                    pageId: "page-a",
                    cellId: "e2",
                    ruleId: "missing-endpoint",
                }),
                expect.objectContaining({
                    pageId: "page-a",
                    cellId: "e1",
                    ruleId: "dangling-endpoint",
                    severity: "error",
                }),
            ]),
        )
    })

    it("reports whitespace-only process labels as missing", () => {
        const data: DiagramCheckData = {
            ...sampleData,
            pages: sampleData.pages.map((page) => ({
                ...page,
                nodes: page.nodes.map((node) =>
                    node.id === "n1" ? { ...node, label: "   " } : node,
                ),
            })),
        }

        const issues = runDiagramRules(data, FLOWCHART_CONFIG)
        expect(issues).toContainEqual(
            expect.objectContaining({
                pageId: "page-a",
                cellId: "n1",
                ruleId: "missing-label",
            }),
        )
    })

    it("disables missing-endpoint in sketch profile", () => {
        const issues = runDiagramRules(sampleData, SKETCH_CONFIG)

        expect(
            issues.some((issue) => issue.ruleId === "missing-endpoint"),
        ).toBe(false)
        expect(
            issues.some((issue) => issue.ruleId === "dangling-endpoint"),
        ).toBe(true)
    })

    it("counts self-connections as connections", () => {
        const data: DiagramCheckData = {
            pages: [
                {
                    id: "page-1",
                    name: "Page 1",
                    cellCount: 3,
                    nodes: [{ id: "n1", role: "process", label: "Step" }],
                    edges: [{ id: "e1", source: "n1", target: "n1" }],
                },
            ],
        }

        const issues = runDiagramRules(data, FLOWCHART_CONFIG)
        expect(issues.some((issue) => issue.ruleId === "isolated-step")).toBe(
            false,
        )
    })

    it("rejects missing and unknown custom rules", () => {
        expect(
            validateRuleConfig({
                id: "custom",
                rules: { "missing-label": "warning" },
            }),
        ).toMatchObject({ valid: false })

        expect(
            validateRuleConfig({
                id: "custom",
                rules: {
                    "missing-label": "warning",
                    "isolated-step": "warning",
                    "missing-endpoint": "warning",
                    "dangling-endpoint": "error",
                    unknown: "error",
                },
            }),
        ).toMatchObject({ valid: false })
    })
})

describe("diagram check report", () => {
    const issues: DiagramCheckIssue[] = [
        {
            pageId: "page-b",
            cellId: "n2",
            ruleId: "missing-label",
            severity: "warning",
            message: "Missing label",
        },
        {
            pageId: "page-a",
            cellId: "e1",
            ruleId: "dangling-endpoint",
            severity: "error",
            message: "Dangling endpoint",
        },
    ]

    it("counts only pages selected by current scope", () => {
        const report = buildDiagramCheckReport({
            inputName: "sample.drawio",
            fingerprint: "test-fingerprint",
            scope: { kind: "current", pageId: "page-a" },
            config: FLOWCHART_CONFIG,
            status: "completed",
            data: sampleData,
            issues,
            generatedAt: "2026-01-01T00:00:00.000Z",
        })

        expect(report.status).toBe("completed")
        expect(report.summary).toEqual({
            pages: 1,
            cells: 6,
            errors: 1,
            warnings: 0,
        })
        expect(report.issues).toHaveLength(1)
        expect(report.issues[0].cellId).toBe("e1")
    })

    it("keeps counts unknown when execution fails", () => {
        const report = buildDiagramCheckReport({
            inputName: "broken.drawio",
            fingerprint: null,
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
            status: "failed",
            error: { code: "PARSE_FAILED", message: "Parse failed" },
        })

        expect(report.status).toBe("failed")
        expect(report.summary).toEqual({
            pages: null,
            cells: null,
            errors: null,
            warnings: null,
        })
        expect(report.issues).toEqual([])
    })

    it("treats an empty valid page as completed with zero issues", () => {
        const report = buildDiagramCheckReport({
            inputName: "empty.drawio",
            fingerprint: "empty-fingerprint",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
            status: "completed",
            data: {
                pages: [
                    {
                        id: "page-1",
                        name: "Page 1",
                        nodes: [],
                        edges: [],
                        cellCount: 2,
                    },
                ],
            },
        })

        expect(report.status).toBe("completed")
        expect(report.summary).toEqual({
            pages: 1,
            cells: 2,
            errors: 0,
            warnings: 0,
        })
        expect(report.issues).toEqual([])
    })

    it("sorts issues by page, cell and rule identity", () => {
        const report = buildDiagramCheckReport({
            inputName: "sample.drawio",
            fingerprint: null,
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
            status: "completed",
            data: sampleData,
            issues,
        })

        expect(report.issues.map((issue) => issue.pageId)).toEqual([
            "page-a",
            "page-b",
        ])
    })
})

describe("custom configuration severity and report statistics", () => {
    it("rejects invalid severity values", () => {
        expect(
            validateRuleConfig({
                id: "invalid-severity",
                rules: {
                    "missing-label": "critical",
                    "isolated-step": "warning",
                    "missing-endpoint": "warning",
                    "dangling-endpoint": "error",
                },
            }),
        ).toMatchObject({ valid: false })
    })

    it("updates issue severity and report statistics for custom config", () => {
        const customConfig = {
            id: "custom-severity",
            rules: {
                ...FLOWCHART_CONFIG.rules,
                "missing-label": "error" as const,
            },
        }

        expect(validateRuleConfig(customConfig)).toMatchObject({
            valid: true,
        })

        const customIssues = runDiagramRules(sampleData, customConfig)
        const missingLabel = customIssues.find(
            (issue) => issue.ruleId === "missing-label",
        )

        expect(missingLabel?.severity).toBe("error")

        const report = buildDiagramCheckReport({
            inputName: "sample.drawio",
            fingerprint: "test-fingerprint",
            scope: { kind: "all" },
            config: customConfig,
            status: "completed",
            data: sampleData,
            issues: customIssues,
        })

        expect(report.summary).toEqual({
            pages: 2,
            cells: 8,
            errors: 2,
            warnings: 2,
        })
    })
})
