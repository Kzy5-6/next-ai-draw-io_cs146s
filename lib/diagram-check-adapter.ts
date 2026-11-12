import { SaxesParser } from "saxes"
import { decompressPageContent } from "@/packages/mcp-server/src/load-diagram"
import type {
    CellRole,
    DiagramCheckData,
    DiagramCheckPage,
} from "./diagram-check-types"

const LIMITS = {
    fileBytes: 2 * 1024 * 1024,
    decompressedBytes: 8 * 1024 * 1024,
    pages: 20,
    cells: 10_000,
}

interface XmlNode {
    name: string
    attributes: Record<string, string>
    text: string
    children: XmlNode[]
    parent: XmlNode | null
}

export type AdapterResult =
    | { status: "ok"; data: DiagramCheckData }
    | { status: "invalid"; code: string; message: string }

function invalid(code: string, message: string): AdapterResult {
    return { status: "invalid", code, message }
}

function parseXml(xml: string): XmlNode {
    const parser = new SaxesParser({ xmlns: false })
    const root: XmlNode = {
        name: "#document",
        attributes: {},
        text: "",
        children: [],
        parent: null,
    }
    const stack: XmlNode[] = [root]
    let parseError: string | null = null

    parser.on("opentag", (tag) => {
        const attributes: Record<string, string> = {}
        for (const [key, value] of Object.entries(tag.attributes)) {
            attributes[key] = String(value)
        }

        const node: XmlNode = {
            name: tag.name,
            attributes,
            text: "",
            children: [],
            parent: stack[stack.length - 1],
        }

        stack[stack.length - 1].children.push(node)
        stack.push(node)
    })

    parser.on("closetag", () => {
        if (stack.length > 1) stack.pop()
    })

    parser.on("text", (text) => {
        stack[stack.length - 1].text += text
    })

    parser.on("cdata", (text) => {
        stack[stack.length - 1].text += text
    })

    parser.on("error", (error) => {
        parseError ??= error.message
    })

    parser.write(xml).close()

    if (parseError) throw new Error(parseError)
    if (root.children.length !== 1) {
        throw new Error("XML ��������ֻ��һ����Ԫ��")
    }

    return root.children[0]
}

function descendants(node: XmlNode, name: string): XmlNode[] {
    const result: XmlNode[] = []

    for (const child of node.children) {
        if (child.name === name) result.push(child)
        result.push(...descendants(child, name))
    }

    return result
}

function firstDescendant(node: XmlNode, name: string): XmlNode | undefined {
    return descendants(node, name)[0]
}

function styleValues(style: string): Record<string, string> {
    const values: Record<string, string> = {}

    for (const item of style.split(";")) {
        const separator = item.indexOf("=")
        if (separator < 0) continue

        values[item.slice(0, separator).trim()] = item
            .slice(separator + 1)
            .trim()
    }

    return values
}

function readableLabel(value: string, html: boolean): string {
    let text = value

    if (html) {
        text = text
            .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;|&#160;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
    }

    return text.replace(/\s+/g, " ").trim()
}

function getRole(cell: XmlNode): {
    role: CellRole | "edge"
    courseRole: string | null
} {
    const attrs = cell.attributes
    const style = styleValues(attrs.style ?? "")
    const source = attrs.source
    const target = attrs.target

    if (attrs.edge === "1" || source !== undefined || target !== undefined) {
        return { role: "edge", courseRole: null }
    }

    const explicit = attrs.courseRole ?? style.courseRole ?? null

    if (explicit !== null) {
        if (
            explicit === "process" ||
            explicit === "annotation" ||
            explicit === "container" ||
            explicit === "decoration"
        ) {
            return { role: explicit, courseRole: explicit }
        }

        return { role: "decoration", courseRole: explicit }
    }

    if (
        attrs.group === "1" ||
        attrs.swimlane === "1" ||
        style.group === "1" ||
        style.swimlane === "1"
    ) {
        return { role: "container", courseRole: null }
    }

    if (
        attrs.text === "1" ||
        style.text === "1" ||
        attrs.edgeLabel === "1" ||
        style.edgeLabel === "1"
    ) {
        return { role: "annotation", courseRole: null }
    }

    if (
        attrs.image !== undefined ||
        style.image !== undefined ||
        style.shape === "image"
    ) {
        return { role: "decoration", courseRole: null }
    }

    if (attrs.vertex === "1") {
        return { role: "process", courseRole: null }
    }

    return { role: "decoration", courseRole: null }
}

function normalizePage(
    model: XmlNode,
    pageId: string,
    pageName: string,
): DiagramCheckPage {
    const cells = descendants(model, "mxCell")
    const seenIds = new Set<string>()
    const nodes: DiagramCheckPage["nodes"] = []
    const edges: DiagramCheckPage["edges"] = []

    for (const cell of cells) {
        const wrapper =
            cell.parent?.name === "object" || cell.parent?.name === "UserObject"
                ? cell.parent
                : null

        const id = wrapper?.attributes.id ?? cell.attributes.id

        if (!id) {
            throw new Error(`ҳ�� ${pageId} �д���ȱ�� ID �� mxCell`)
        }

        if (seenIds.has(id)) {
            throw new Error(`ҳ�� ${pageId} �д����ظ�ͼԪ ID��${id}`)
        }
        seenIds.add(id)

        if (id === "0" || id === "1") continue

        const role = getRole(cell)

        if (
            role.courseRole !== null &&
            !["process", "annotation", "container", "decoration"].includes(
                role.courseRole,
            )
        ) {
            throw new Error(
                `ҳ�� ${pageId} ��ͼԪ ${id} ʹ��δ֪ courseRole��${role.courseRole}`,
            )
        }

        if (role.role === "edge") {
            edges.push({
                id,
                source: cell.attributes.source || null,
                target: cell.attributes.target || null,
            })
            continue
        }

        const rawLabel =
            wrapper?.attributes.label ??
            wrapper?.attributes.value ??
            cell.attributes.value ??
            ""

        const html =
            wrapper?.attributes.html === "1" ||
            cell.attributes.html === "1" ||
            styleValues(cell.attributes.style ?? "").html === "1"

        nodes.push({
            id,
            role: role.role,
            label: readableLabel(rawLabel, html),
        })
    }

    return {
        id: pageId,
        name: pageName,
        nodes,
        edges,
        cellCount: cells.length,
    }
}

export function adaptDiagramXml(xml: string): AdapterResult {
    try {
        if (typeof xml !== "string" || !xml.trim()) {
            return invalid("EMPTY_INPUT", "��������Ϊ��")
        }

        const fileBytes = new TextEncoder().encode(xml).length

        if (fileBytes > LIMITS.fileBytes) {
            return invalid("FILE_TOO_LARGE", "�ļ����� 2 MiB ����")
        }

        const xmlForDtdCheck = xml
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")

        if (/<!DOCTYPE|<!ENTITY/i.test(xmlForDtdCheck)) {
            return invalid("DTD_FORBIDDEN", "������ DTD ��ʵ������")
        }

        const root = parseXml(xml)
        const pages: DiagramCheckPage[] = []
        const pageIds = new Set<string>()
        let totalCells = 0
        let totalDecompressedBytes = 0

        if (root.name === "mxGraphModel") {
            const page = normalizePage(root, "page-1", "Page 1")
            totalCells += page.cellCount
            pages.push(page)
        } else if (root.name === "mxfile") {
            const diagrams = root.children.filter(
                (child) => child.name === "diagram",
            )

            if (diagrams.length === 0) {
                return invalid("NO_PAGES", "mxfile ��û��ҳ��")
            }

            if (diagrams.length > LIMITS.pages) {
                return invalid("TOO_MANY_PAGES", "ҳ���������� 20")
            }

            for (let index = 0; index < diagrams.length; index++) {
                const diagram = diagrams[index]
                const pageId = diagram.attributes.id || `page-${index + 1}`
                const pageName = diagram.attributes.name || `Page ${index + 1}`

                if (pageIds.has(pageId)) {
                    return invalid(
                        "DUPLICATE_PAGE_ID",
                        `�����ظ�ҳ�� ID��${pageId}`,
                    )
                }
                pageIds.add(pageId)

                let model = firstDescendant(diagram, "mxGraphModel")

                if (!model) {
                    const compressed = diagram.text.trim()
                    if (!compressed) {
                        return invalid(
                            "INVALID_PAGE",
                            `ҳ�� ${pageId} ȱ�� mxGraphModel ����`,
                        )
                    }

                    const decompressed = decompressPageContent(compressed)

                    if (!decompressed) {
                        return invalid(
                            "DECOMPRESSION_FAILED",
                            `ҳ�� ${pageId} ��ѹʧ��`,
                        )
                    }

                    const decompressedForDtdCheck = decompressed
                        .replace(/<!--[\s\S]*?-->/g, "")
                        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")

                    if (/<!DOCTYPE|<!ENTITY/i.test(decompressedForDtdCheck)) {
                        return invalid(
                            "DTD_FORBIDDEN",
                            "解压页面不允许 DTD 或实体声明",
                        )
                    }

                    totalDecompressedBytes += new TextEncoder().encode(
                        decompressed,
                    ).length

                    if (totalDecompressedBytes > LIMITS.decompressedBytes) {
                        return invalid(
                            "DECOMPRESSED_TOO_LARGE",
                            `ҳ�� ${pageId} ��ѹ�󳬹� 8 MiB`,
                        )
                    }

                    const parsed = parseXml(decompressed)
                    if (parsed.name !== "mxGraphModel") {
                        return invalid(
                            "INVALID_PAGE_XML",
                            `ҳ�� ${pageId} ��ѹ���� mxGraphModel`,
                        )
                    }
                    model = parsed
                }

                const page = normalizePage(model, pageId, pageName)
                totalCells += page.cellCount

                if (totalCells > LIMITS.cells) {
                    return invalid("TOO_MANY_CELLS", "mxCell �������� 10,000")
                }

                pages.push(page)
            }
        } else {
            return invalid(
                "UNSUPPORTED_ROOT",
                "�����Ԫ�ر����� mxfile �� mxGraphModel",
            )
        }

        if (pages.length > LIMITS.pages) {
            return invalid("TOO_MANY_PAGES", "ҳ���������� 20")
        }

        if (totalCells > LIMITS.cells) {
            return invalid("TOO_MANY_CELLS", "mxCell �������� 10,000")
        }

        return {
            status: "ok",
            data: { pages },
        }
    } catch (error) {
        return invalid(
            "INVALID_XML",
            error instanceof Error ? error.message : "XML ����ʧ��",
        )
    }
}
