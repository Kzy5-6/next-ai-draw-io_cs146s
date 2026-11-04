import { describe, expect, it } from "vitest"
import { findMissingLabels } from "@/lib/missing-label-core"

describe("findMissingLabels", () => {
    it("returns empty for a document with no pages", () => {
        expect(findMissingLabels([])).toEqual({
            status: "empty",
            issues: [],
        })
    })

    it("ignores the two mxGraph root cells when checking for diagram content", () => {
        expect(
            findMissingLabels([
                {
                    id: "page-a",
                    name: "流程 A",
                    cells: [
                        { id: "0", isProcess: false, labelText: "" },
                        { id: "1", isProcess: false, labelText: "" },
                    ],
                },
            ]),
        ).toEqual({ status: "empty", issues: [] })
    })

    it("returns ok when diagram content has no unlabeled process cells", () => {
        expect(
            findMissingLabels([
                {
                    id: "page-a",
                    name: "流程 A",
                    cells: [
                        { id: "n1", isProcess: true, labelText: "开始" },
                        { id: "g1", isProcess: false, labelText: "" },
                    ],
                },
            ]),
        ).toEqual({ status: "ok", issues: [] })
    })

    it("reports whitespace-only process labels with page and cell identifiers", () => {
        expect(
            findMissingLabels([
                {
                    id: "page-a",
                    name: "流程 A",
                    cells: [
                        { id: "n1", isProcess: true, labelText: "开始" },
                        { id: "n2", isProcess: true, labelText: "   " },
                    ],
                },
            ]),
        ).toEqual({
            status: "issues",
            issues: [
                {
                    pageId: "page-a",
                    pageName: "流程 A",
                    cellId: "n2",
                    reason: "流程步骤缺少名称",
                },
            ],
        })
    })
})
