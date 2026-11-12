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

describe("property-based behavior", () => {
    async function runCheck(xml: string) {
        return checkDiagram({
            xml,
            inputName: "property-test.drawio",
            scope: { kind: "all" },
            config: FLOWCHART_CONFIG,
        })
    }

    function issueKeys(
        report: Awaited<ReturnType<typeof runCheck>>,
        pageId?: string,
    ) {
        return report.issues
            .filter((issue) => pageId === undefined || issue.pageId === pageId)
            .map((issue) => `${issue.pageId}:${issue.cellId}:${issue.ruleId}`)
            .sort()
    }

    it("keeps the issue set unchanged when cell order changes", async () => {
        const original = fixture("labels.drawio")
        const cellPattern = /<mxCell\b[\s\S]*?<\/mxCell>|<mxCell\b[^>]*\/>/g
        const cells = original.match(cellPattern)

        expect(cells).not.toBeNull()
        if (!cells) return

        const reordered = [...cells.slice(0, 2), ...cells.slice(2).reverse()]
        let index = 0
        const changed = original.replace(cellPattern, () => reordered[index++])

        const before = await runCheck(original)
        const after = await runCheck(changed)

        expect(before.status).toBe("completed")
        expect(after.status).toBe("completed")
        expect(issueKeys(after)).toEqual(issueKeys(before))
    })

    it("keeps structural issues unchanged after translating all coordinates", async () => {
        const original = fixture("labels.drawio")
        const translated = original.replace(
            /<mxGeometry\b[^>]*>/g,
            (geometry) =>
                geometry
                    .replace(
                        /\bx="(-?\d+(?:\.\d+)?)"/g,
                        (_, value) => `x="${Number(value) + 1000}"`,
                    )
                    .replace(
                        /\by="(-?\d+(?:\.\d+)?)"/g,
                        (_, value) => `y="${Number(value) + 500}"`,
                    ),
        )

        const before = await runCheck(original)
        const after = await runCheck(translated)

        expect(before.status).toBe("completed")
        expect(after.status).toBe("completed")
        expect(issueKeys(after)).toEqual(issueKeys(before))
    })

    it("does not let a change on page-a affect page-b issues", async () => {
        const original = fixture("multi-page.drawio")
        const changed = original.replace(
            '<mxCell id="n1" value="Step 1"',
            '<mxCell id="n1" value="   "',
        )

        const before = await runCheck(original)
        const after = await runCheck(changed)

        expect(before.status).toBe("completed")
        expect(after.status).toBe("completed")
        expect(issueKeys(after, "page-b")).toEqual(issueKeys(before, "page-b"))
    })

    it("removes the missing-label issue after supplying a label", async () => {
        const original = fixture("labels.drawio")
        const repaired = original.replace(
            'id="n2" value="   "',
            'id="n2" value="Step 2"',
        )

        const before = await runCheck(original)
        const after = await runCheck(repaired)

        expect(before.issues).toContainEqual(
            expect.objectContaining({
                cellId: "n2",
                ruleId: "missing-label",
            }),
        )
        expect(after.issues).not.toContainEqual(
            expect.objectContaining({
                cellId: "n2",
                ruleId: "missing-label",
            }),
        )
    })

    it("does not mutate the input when checking it repeatedly", async () => {
        const original = fixture("labels.drawio")
        const snapshot = original

        const first = await runCheck(original)
        const second = await runCheck(original)

        expect(original).toBe(snapshot)
        expect(second.issues).toEqual(first.issues)
        expect(second.summary).toEqual(first.summary)
    })
})
