export interface MissingLabelCell {
    id: string
    isProcess: boolean
    labelText: string
}

export interface MissingLabelPage {
    id: string
    name: string
    cells: MissingLabelCell[]
}

export interface MissingLabelIssue {
    pageId: string
    pageName: string
    cellId: string
    reason: string
}

export type MissingLabelResult =
    | { status: "empty"; issues: [] }
    | { status: "ok"; issues: [] }
    | { status: "issues"; issues: MissingLabelIssue[] }

/**
 * Pure rule core: accepts normalized page and cell data.
 * It has no XML, DOM, browser, or Node dependencies.
 */
export function findMissingLabels(
    pages: MissingLabelPage[],
): MissingLabelResult {
    const hasDiagramContent = pages.some((page) =>
        page.cells.some((cell) => cell.id !== "0" && cell.id !== "1"),
    )

    if (!hasDiagramContent) {
        return { status: "empty", issues: [] }
    }

    const issues: MissingLabelIssue[] = []

    for (const page of pages) {
        for (const cell of page.cells) {
            if (!cell.isProcess || cell.labelText.trim()) continue

            issues.push({
                pageId: page.id,
                pageName: page.name,
                cellId: cell.id,
                reason: "流程步骤缺少名称",
            })
        }
    }

    return issues.length > 0
        ? { status: "issues", issues }
        : { status: "ok", issues: [] }
}
