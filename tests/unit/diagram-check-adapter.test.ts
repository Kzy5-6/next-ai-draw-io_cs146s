// @vitest-environment node

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { deflateRaw } from "pako"
import { describe, expect, it } from "vitest"
import { adaptDiagramXml } from "@/lib/diagram-check-adapter"

function fixture(name: string): string {
    return readFileSync(resolve(process.cwd(), "course-fixtures", name), "utf8")
}

describe("diagram check adapter fixtures", () => {
    it("adapts a normal diagram", () => {
        const result = adaptDiagramXml(fixture("normal.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(result.data.pages).toHaveLength(1)
        expect(result.data.pages[0].nodes.length).toBeGreaterThan(0)
        expect(result.data.pages[0].edges.length).toBeGreaterThan(0)
    })

    it("adapts compressed pages", () => {
        const normal = adaptDiagramXml(fixture("normal.drawio"))
        const compressed = adaptDiagramXml(fixture("compressed.drawio"))

        expect(normal.status).toBe("ok")
        expect(compressed.status).toBe("ok")
        if (normal.status !== "ok" || compressed.status !== "ok") return

        expect(compressed.data.pages[0].nodes).toEqual(
            normal.data.pages[0].nodes,
        )
        expect(compressed.data.pages[0].edges).toEqual(
            normal.data.pages[0].edges,
        )
    })

    it("allows duplicate cell IDs across different pages", () => {
        const result = adaptDiagramXml(fixture("multi-page.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(result.data.pages.length).toBe(2)
    })

    it("adapts grouped diagrams without treating containers as process steps", () => {
        const result = adaptDiagramXml(fixture("grouped.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(
            result.data.pages[0].nodes.some(
                (node) => node.role === "container",
            ),
        ).toBe(true)
    })

    it("accepts a valid empty page", () => {
        const result = adaptDiagramXml(fixture("empty.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(result.data.pages).toHaveLength(1)
        expect(result.data.pages[0].cellCount).toBe(2)
        expect(result.data.pages[0].nodes).toEqual([])
        expect(result.data.pages[0].edges).toEqual([])
    })

    it("rejects DTD and malformed XML", () => {
        expect(
            adaptDiagramXml('<!DOCTYPE mxfile [<!ENTITY x "test">]><mxfile/>')
                .status,
        ).toBe("invalid")

        expect(adaptDiagramXml("<mxfile><diagram></mxfile>").status).toBe(
            "invalid",
        )
    })

    it("rejects empty input", () => {
        expect(adaptDiagramXml("").status).toBe("invalid")
    })
})

describe("additional course fixture cases", () => {
    it("treats HTML-only labels as empty readable text", () => {
        const result = adaptDiagramXml(fixture("html-label.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(
            result.data.pages[0].nodes.find((node) => node.id === "n2")?.label,
        ).toBe("")
    })

    it("preserves non-HTML labels as plain text for safe rendering", () => {
        const result = adaptDiagramXml(fixture("text-safety.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(
            result.data.pages[0].nodes.find((node) => node.id === "n1")?.label,
        ).toContain("<img")
        expect(
            result.data.pages[0].nodes.find((node) => node.id === "n1")?.label,
        ).toContain("onerror")
    })

    it("preserves a free endpoint as null", () => {
        const result = adaptDiagramXml(fixture("free-endpoint.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(
            result.data.pages[0].edges.find((edge) => edge.id === "e1")?.target,
        ).toBeNull()
    })

    it("preserves dangling endpoint references", () => {
        const result = adaptDiagramXml(fixture("dangling.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(
            result.data.pages[0].edges.find((edge) => edge.id === "e1")?.target,
        ).toBe("unknown")
    })

    it("treats whitespace-only labels as empty", () => {
        const result = adaptDiagramXml(fixture("labels.drawio"))

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(
            result.data.pages[0].nodes.find((node) => node.id === "n2")?.label,
        ).toBe("")
    })
})

// Security boundary tests for compressed pages
describe("compressed page safety limits", () => {
    function compressedPage(xml: string): string {
        const encoded = new TextEncoder().encode(encodeURIComponent(xml))
        return Buffer.from(deflateRaw(encoded)).toString("base64")
    }

    it("rejects cumulative decompressed content exceeding 8 MiB", () => {
        const largeModel = (id: string) =>
            `<mxGraphModel><root><mxCell id="0"/><mxCell id="1"/>` +
            `<mxCell id="${id}" value="${"x".repeat(4_300_000)}" vertex="1" parent="1"/>` +
            `</root></mxGraphModel>`

        const xml =
            `<mxfile>` +
            `<diagram id="p1">${compressedPage(largeModel("a"))}</diagram>` +
            `<diagram id="p2">${compressedPage(largeModel("b"))}</diagram>` +
            `</mxfile>`

        const result = adaptDiagramXml(xml)

        expect(result.status).toBe("invalid")
        if (result.status === "invalid") {
            expect(result.code).toBe("DECOMPRESSED_TOO_LARGE")
        }
    })

    it("rejects DTD declarations inside decompressed page content", () => {
        const maliciousModel =
            `<!DOCTYPE mxGraphModel [<!ENTITY x "expanded">]>` +
            `<mxGraphModel><root><mxCell id="0"/><mxCell id="1"/></root></mxGraphModel>`

        const xml = `<mxfile><diagram id="p1">${compressedPage(maliciousModel)}</diagram></mxfile>`

        const result = adaptDiagramXml(xml)

        expect(result.status).toBe("invalid")
        if (result.status === "invalid") {
            expect(result.code).toBe("DTD_FORBIDDEN")
        }
    })
})

describe("wrapped cells and duplicate IDs", () => {
    it("reads ID and label from object wrappers", () => {
        const xml = `
            <mxGraphModel><root>
                <mxCell id="0"/>
                <mxCell id="1" parent="0"/>
                <object id="wrapped-1" label="Object label">
                    <mxCell vertex="1" parent="1"/>
                </object>
            </root></mxGraphModel>`

        const result = adaptDiagramXml(xml)

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(result.data.pages[0].nodes).toContainEqual({
            id: "wrapped-1",
            role: "process",
            label: "Object label",
        })
    })

    it("reads ID and label from UserObject wrappers", () => {
        const xml = `
            <mxGraphModel><root>
                <mxCell id="0"/>
                <mxCell id="1" parent="0"/>
                <UserObject id="wrapped-2" label="UserObject label">
                    <mxCell vertex="1" parent="1"/>
                </UserObject>
            </root></mxGraphModel>`

        const result = adaptDiagramXml(xml)

        expect(result.status).toBe("ok")
        if (result.status !== "ok") return

        expect(result.data.pages[0].nodes).toContainEqual({
            id: "wrapped-2",
            role: "process",
            label: "UserObject label",
        })
    })

    it("rejects duplicate cell IDs within one page", () => {
        const xml = `
            <mxGraphModel><root>
                <mxCell id="0"/>
                <mxCell id="1" parent="0"/>
                <mxCell id="duplicate" value="First" vertex="1" parent="1"/>
                <mxCell id="duplicate" value="Second" vertex="1" parent="1"/>
            </root></mxGraphModel>`

        const result = adaptDiagramXml(xml)

        expect(result.status).toBe("invalid")
    })
})

describe("XML declaration security boundaries", () => {
    it("does not reject DOCTYPE text inside an XML comment", () => {
        const xml = `
            <!-- <!DOCTYPE is documentation text, not a declaration -->
            <mxGraphModel>
                <root>
                    <mxCell id="0"/>
                    <mxCell id="1" parent="0"/>
                    <mxCell id="node-1" value="Start" vertex="1" parent="1"/>
                </root>
            </mxGraphModel>
        `

        const result = adaptDiagramXml(xml)
        expect(result.status).toBe("ok")
    })

    it("does not reject DOCTYPE text inside CDATA", () => {
        const xml = `
            <mxGraphModel>
                <root>
                    <mxCell id="0"/>
                    <mxCell id="1" parent="0"/>
                    <mxCell id="node-1" value="Start" vertex="1" parent="1"/>
                </root>
                <description><![CDATA[The literal text <!DOCTYPE is not a declaration]]></description>
            </mxGraphModel>
        `

        const result = adaptDiagramXml(xml)
        expect(result.status).toBe("ok")
    })

    it("still rejects an actual DTD declaration", () => {
        const xml = `<!DOCTYPE mxGraphModel [<!ENTITY x "test">]>
            <mxGraphModel>
                <root>
                    <mxCell id="0"/>
                    <mxCell id="1" parent="0"/>
                </root>
            </mxGraphModel>
        `

        const result = adaptDiagramXml(xml)
        expect(result.status).toBe("invalid")
        if (result.status === "invalid") {
            expect(result.code).toBe("DTD_FORBIDDEN")
        }
    })
})

describe("input safety limit boundaries", () => {
    const safetyFile = (name: string): Buffer => {
        const diagram = (totalCells: number) => {
            const extra = Array.from(
                { length: totalCells - 2 },
                (_, i) =>
                    `<mxCell id="c${i + 2}" value="Node ${i + 2}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`,
            ).join("")
            return (
                "<mxGraphModel><root>" +
                '<mxCell id="0"/><mxCell id="1" parent="0"/>' +
                extra +
                "</root></mxGraphModel>"
            )
        }

        const cellMatch = name.match(/^cells-(\d+)\.drawio$/)
        if (cellMatch) {
            return Buffer.from(diagram(Number(cellMatch[1])), "utf8")
        }

        const pageMatch = name.match(/^pages-(\d+)\.drawio$/)
        if (pageMatch) {
            const pages = Array.from(
                { length: Number(pageMatch[1]) },
                (_, i) =>
                    `<diagram id="p${i}" name="Page ${i}">${diagram(2)}</diagram>`,
            ).join("")
            return Buffer.from(`<mxfile>${pages}</mxfile>`, "utf8")
        }

        const sizeMatch = name.match(/^file-(\d+)-bytes\.drawio$/)
        if (sizeMatch) {
            const target = Number(sizeMatch[1])
            const base = diagram(3)
            const closing = "</mxGraphModel>"
            const padding = target - Buffer.byteLength(base, "utf8") - 7
            if (padding < 0) throw new Error("Target size is too small")
            const exact =
                base.slice(0, -closing.length) +
                "<!--" +
                "x".repeat(padding) +
                "-->" +
                closing
            const result = Buffer.from(exact, "utf8")
            if (result.length !== target)
                throw new Error("Incorrect fixture size")
            return result
        }

        throw new Error(`Unknown safety fixture: ${name}`)
    }

    it("accepts a file exactly at the 2 MiB limit", () => {
        const result = adaptDiagramXml(
            safetyFile("file-2097152-bytes.drawio").toString("utf8"),
        )
        expect(result.status).toBe("ok")
    })

    it("rejects a file one byte above the 2 MiB limit", () => {
        const result = adaptDiagramXml(
            safetyFile("file-2097153-bytes.drawio").toString("utf8"),
        )
        expect(result.status).toBe("invalid")
    })

    it("accepts exactly 9999 mxCell elements", () => {
        const result = adaptDiagramXml(
            safetyFile("cells-9999.drawio").toString("utf8"),
        )
        expect(result.status).toBe("ok")
    })

    it("accepts exactly 10000 mxCell elements", () => {
        const result = adaptDiagramXml(
            safetyFile("cells-10000.drawio").toString("utf8"),
        )
        expect(result.status).toBe("ok")
    })

    it("rejects 10001 mxCell elements", () => {
        const result = adaptDiagramXml(
            safetyFile("cells-10001.drawio").toString("utf8"),
        )
        expect(result.status).toBe("invalid")
    })

    it("accepts exactly 20 pages", () => {
        const result = adaptDiagramXml(
            safetyFile("pages-20.drawio").toString("utf8"),
        )
        expect(result.status).toBe("ok")
    })

    it("rejects 21 pages", () => {
        const result = adaptDiagramXml(
            safetyFile("pages-21.drawio").toString("utf8"),
        )
        expect(result.status).toBe("invalid")
    })
})
