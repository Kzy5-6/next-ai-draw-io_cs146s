import { parseDrawioFileContent } from "@/packages/mcp-server/src/load-diagram"
import {
    findMissingLabels,
    type MissingLabelCell,
    type MissingLabelIssue,
    type MissingLabelPage,
    type MissingLabelResult,
} from "./missing-label-core"

export type { MissingLabelIssue }

export type DiagramCheckResult =
    | MissingLabelResult
    | { status: "invalid-xml"; issues: []; error: string }
    | { status: "error"; issues: []; error: string }

/**
 * Convert a draw.io label into readable text without executing its markup.
 */
function readableLabel(value: string): string {
    const doc = new DOMParser().parseFromString(value, "text/html")
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim()
}

function isProcessCell(cell: Element): boolean {
    if (cell.getAttribute("vertex") !== "1") return false
    if (cell.getAttribute("edge") === "1") return false

    const style = cell.getAttribute("style") ?? ""
    return style
        .split(";")
        .some((entry) => entry.trim() === "courseRole=process")
}

function extractPages(xml: string): MissingLabelPage[] {
    const doc = new DOMParser().parseFromString(xml, "application/xml")
    const root = doc.documentElement

    const pageElements =
        root.tagName === "mxfile"
            ? Array.from(root.children).filter(
                  (child) => child.tagName === "diagram",
              )
            : root.tagName === "mxGraphModel"
              ? [root]
              : []

    return pageElements.map((page, index) => {
        const model =
            page.tagName === "mxGraphModel"
                ? page
                : page.querySelector("mxGraphModel")

        const cells: MissingLabelCell[] = []

        if (model) {
            for (const cell of Array.from(
                model.getElementsByTagName("mxCell"),
            )) {
                const wrapper = cell.parentElement
                const isWrapped =
                    wrapper?.tagName === "object" ||
                    wrapper?.tagName === "UserObject"

                const id =
                    cell.getAttribute("id") || wrapper?.getAttribute("id")

                if (!id) continue

                const label = isWrapped
                    ? (wrapper?.getAttribute("label") ?? "")
                    : (cell.getAttribute("value") ?? "")

                cells.push({
                    id,
                    isProcess: isProcessCell(cell),
                    labelText: readableLabel(label),
                })
            }
        }

        return {
            id:
                page.getAttribute("id") ||
                (root.tagName === "mxGraphModel"
                    ? "page-1"
                    : `page-${index + 1}`),
            name: page.getAttribute("name") || `Page ${index + 1}`,
            cells,
        }
    })
}

/**
 * Check every page in a draw.io document.
 *
 * The input XML is never modified. Parsing and decompression happen in this
 * adapter; the rule core only receives normalized page and cell data.
 */
export function checkMissingLabels(xml: string): DiagramCheckResult {
    if (!xml.trim()) {
        return { status: "empty", issues: [] }
    }

    try {
        // Ignore comments and CDATA when checking for forbidden declarations.
        const xmlWithoutComments = xml
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")

        if (/<!DOCTYPE\b/i.test(xmlWithoutComments)) {
            return {
                status: "invalid-xml",
                issues: [],
                error: "DOCTYPE declarations are not allowed.",
            }
        }

        const loaded = parseDrawioFileContent(xml)

        if (!loaded.ok) {
            return {
                status: "invalid-xml",
                issues: [],
                error: loaded.error,
            }
        }

        const pages = extractPages(loaded.xml)

        if (pages.length === 0) {
            return {
                status: "invalid-xml",
                issues: [],
                error: "The document contains no draw.io pages.",
            }
        }

        return findMissingLabels(pages)
    } catch (error) {
        return {
            status: "error",
            issues: [],
            error:
                error instanceof Error
                    ? error.message
                    : "An unexpected error occurred during the check.",
        }
    }
}
