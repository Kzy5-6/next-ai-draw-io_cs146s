import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { checkMissingLabels } from "@/lib/missing-label"

const fixture = (name: string) =>
    readFileSync(path.join(process.cwd(), "course-fixtures", name), "utf8")

describe("checkMissingLabels", () => {
    it("reports no issues for a normally labeled diagram", () => {
        const result = checkMissingLabels(fixture("normal.drawio"))

        expect(result).toEqual({ status: "ok", issues: [] })
    })

    it("reports the blank process cell in labels.drawio", () => {
        const result = checkMissingLabels(fixture("labels.drawio"))

        expect(result.status).toBe("issues")
        if (result.status !== "issues") return

        expect(result.issues).toEqual([
            {
                pageId: "page-a",
                pageName: "流程 A",
                cellId: "n2",
                reason: "流程步骤缺少名称",
            },
        ])
    })

    it("does not report containers, annotations or decorations", () => {
        const result = checkMissingLabels(fixture("grouped.drawio"))

        expect(result).toEqual({ status: "ok", issues: [] })
    })

    it("checks every page and preserves page and cell IDs", () => {
        const result = checkMissingLabels(fixture("multi-page.drawio"))

        expect(result.status).toBe("issues")
        if (result.status !== "issues") return

        expect(result.issues).toHaveLength(1)
        expect(result.issues[0]).toMatchObject({
            pageId: "page-b",
            pageName: "流程 B",
            cellId: "n2",
        })
    })

    it("treats HTML containing only a non-breaking space as a missing label", () => {
        const result = checkMissingLabels(fixture("html-label.drawio"))

        expect(result.status).toBe("issues")
        if (result.status !== "issues") return

        expect(result.issues.map((issue) => issue.cellId)).toEqual(["n2"])
    })

    it("does not treat an image-only HTML label as readable text", () => {
        const result = checkMissingLabels(fixture("text-safety.drawio"))

        expect(result.status).toBe("issues")
        if (result.status !== "issues") return

        expect(result.issues.map((issue) => issue.cellId)).toEqual(["n1"])
    })
    it("checks compressed draw.io pages", () => {
        const result = checkMissingLabels(fixture("compressed.drawio"))

        expect(result).toEqual({ status: "ok", issues: [] })
    })

    it("rejects a document containing an external entity", () => {
        const result = checkMissingLabels(fixture("external-entity.drawio"))

        expect(result.status).toBe("invalid-xml")
    })
    it("rejects an explicit DOCTYPE declaration", () => {
        const xml = fixture("normal.drawio").replace(
            "<mxfile",
            "<!DOCTYPE mxfile>\n<mxfile",
        )

        expect(checkMissingLabels(xml).status).toBe("invalid-xml")
    })

    it("does not mistake DOCTYPE text inside an XML comment for a declaration", () => {
        const xml = fixture("normal.drawio").replace(
            "<mxfile",
            "<!-- <!DOCTYPE mxfile> -->\n<mxfile",
        )

        expect(checkMissingLabels(xml)).toEqual({ status: "ok", issues: [] })
    })
    it("distinguishes an empty diagram", () => {
        const result = checkMissingLabels(fixture("empty.drawio"))

        expect(result).toEqual({ status: "empty", issues: [] })
    })

    it("reports malformed XML as invalid", () => {
        const result = checkMissingLabels(fixture("invalid.drawio"))

        expect(result.status).toBe("invalid-xml")
    })

    it("does not modify the input XML", () => {
        const xml = fixture("labels.drawio")
        const original = xml

        checkMissingLabels(xml)

        expect(xml).toBe(original)
    })

    it("treats whitespace-only input as empty", () => {
        expect(checkMissingLabels("   ")).toEqual({
            status: "empty",
            issues: [],
        })
    })

    it("checks process labels regardless of free edge endpoints", () => {
        const result = checkMissingLabels(fixture("free-endpoint.drawio"))

        expect(result).toEqual({ status: "ok", issues: [] })
    })

    it("does not confuse dangling edge references with missing labels", () => {
        const result = checkMissingLabels(fixture("dangling.drawio"))

        expect(result).toEqual({ status: "ok", issues: [] })
    })
})
