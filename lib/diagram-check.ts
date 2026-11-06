import { adaptDiagramXml } from "./diagram-check-adapter"
import { buildDiagramCheckReport } from "./diagram-check-report"
import { runDiagramRules } from "./diagram-check-rules"
import type {
    CheckScope,
    DiagramCheckReport,
    RuleConfig,
} from "./diagram-check-types"

export interface CheckDiagramOptions {
    xml: string
    inputName: string
    scope: CheckScope
    config: unknown
}

async function sha256(text: string): Promise<string | null> {
    try {
        const bytes = new TextEncoder().encode(text)
        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("")
    } catch {
        return null
    }
}

export async function checkDiagram(
    options: CheckDiagramOptions,
): Promise<DiagramCheckReport> {
    const fingerprint = await sha256(options.xml)
    const adapted = adaptDiagramXml(options.xml)

    if (adapted.status === "invalid") {
        return buildDiagramCheckReport({
            inputName: options.inputName,
            fingerprint,
            scope: options.scope,
            config: options.config,
            status: "invalid",
            error: {
                code: adapted.code,
                message: adapted.message,
            },
        })
    }

    try {
        const config = options.config as RuleConfig
        const issues = runDiagramRules(adapted.data, config)

        return buildDiagramCheckReport({
            inputName: options.inputName,
            fingerprint,
            scope: options.scope,
            config: options.config,
            status: "completed",
            data: adapted.data,
            issues,
        })
    } catch (error) {
        return buildDiagramCheckReport({
            inputName: options.inputName,
            fingerprint,
            scope: options.scope,
            config: options.config,
            status: "failed",
            error: {
                code: "CHECK_EXECUTION_FAILED",
                message:
                    error instanceof Error ? error.message : "检查执行失败",
            },
        })
    }
}
