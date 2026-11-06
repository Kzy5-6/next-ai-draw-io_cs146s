// @vitest-environment node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { checkDiagram } from "@/lib/diagram-check"
import { FLOWCHART_CONFIG, SKETCH_CONFIG } from "@/lib/diagram-check-rules"

function fixture(name: string): string {
    return readFileSync(resolve(process.cwd(), "course-fixtures", name), "utf8")
}

describe("diagram check integration", () => {
    it("completes a normal diagram and generates a fingerprint", async () => {
        const report = await checkDiagram({
            xml: fixture("normal.drawio"),
            inputName: "normal.drawio",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
        })

        expect(report.status).toBe("completed")
        expect(report.input.fingerprint).toMatch(/^[a-f0-9]{64}$/)
        expect(report.summary.pages).toBe(1)
        expect(report.summary.errors).toBe(0)
    })

    it("reports missing labels in the labels fixture", async () => {
        const report = await checkDiagram({
            xml: fixture("labels.drawio"),
            inputName: "labels.drawio",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
        })

        expect(report.status).toBe("completed")
        expect(report.issues).toContainEqual(
            expect.objectContaining({
                cellId: "n2",
                ruleId: "missing-label",
            }),
        )
    })

    it("distinguishes free and dangling endpoints", async () => {
        const free = await checkDiagram({
            xml: fixture("free-endpoint.drawio"),
            inputName: "free-endpoint.drawio",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
        })
        const dangling = await checkDiagram({
            xml: fixture("dangling.drawio"),
            inputName: "dangling.drawio",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
        })

        expect(
            free.issues.some((issue) => issue.ruleId === "missing-endpoint"),
        ).toBe(true)
        expect(
            free.issues.some((issue) => issue.ruleId === "dangling-endpoint"),
        ).toBe(false)
        expect(
            dangling.issues.some(
                (issue) => issue.ruleId === "dangling-endpoint",
            ),
        ).toBe(true)
    })

    it("disables free-endpoint warnings in the sketch profile", async () => {
        const report = await checkDiagram({
            xml: fixture("free-endpoint.drawio"),
            inputName: "free-endpoint.drawio",
            scope: { kind: "all" },
            config: SKETCH_CONFIG,
        })

        expect(report.status).toBe("completed")
        expect(
            report.issues.some((issue) => issue.ruleId === "missing-endpoint"),
        ).toBe(false)
    })

    it("checks only the requested page in current-page scope", async () => {
        const report = await checkDiagram({
            xml: fixture("multi-page.drawio"),
            inputName: "multi-page.drawio",
            scope: { kind: "current", pageId: "page-b" },
            config: FLOWCHART_CONFIG,
        })

        expect(report.status).toBe("completed")
        expect(report.summary.pages).toBe(1)
        expect(report.issues.every((issue) => issue.pageId === "page-b")).toBe(
            true,
        )
    })

    it("returns invalid for malformed input without inventing zero counts", async () => {
        const report = await checkDiagram({
            xml: fixture("invalid.drawio"),
            inputName: "invalid.drawio",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
        })

        expect(report.status).toBe("invalid")
        expect(report.summary.pages).toBeNull()
        expect(report.summary.errors).toBeNull()
        expect(report.issues).toEqual([])
    })
})
