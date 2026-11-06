import { validateRuleConfig } from "./diagram-check-rules"
import type {
    CheckScope,
    DiagramCheckData,
    DiagramCheckIssue,
    DiagramCheckReport,
    RuleConfig,
} from "./diagram-check-types"

export interface BuildReportOptions {
    inputName: string
    fingerprint: string | null
    scope: CheckScope
    config: unknown
    status: "completed" | "invalid" | "failed"
    data?: DiagramCheckData | null
    issues?: DiagramCheckIssue[]
    error?: { code: string; message: string } | null
    generatedAt?: string
}

function configDigest(config: RuleConfig): string {
    const canonical = JSON.stringify({
        id: config.id,
        rules: {
            "missing-label": config.rules["missing-label"],
            "isolated-step": config.rules["isolated-step"],
            "missing-endpoint": config.rules["missing-endpoint"],
            "dangling-endpoint": config.rules["dangling-endpoint"],
        },
    })

    // Deterministic FNV-1a digest of the canonical configuration.
    let hash = 0x811c9dc5
    for (let i = 0; i < canonical.length; i++) {
        hash ^= canonical.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }

    return (hash >>> 0).toString(16).padStart(8, "0")
}

function emptySummary() {
    return {
        pages: null,
        cells: null,
        errors: null,
        warnings: null,
    }
}

function sortIssues(issues: DiagramCheckIssue[]): DiagramCheckIssue[] {
    return [...issues].sort(
        (a, b) =>
            a.pageId.localeCompare(b.pageId) ||
            a.cellId.localeCompare(b.cellId) ||
            a.ruleId.localeCompare(b.ruleId),
    )
}

export function buildDiagramCheckReport(
    options: BuildReportOptions,
): DiagramCheckReport {
    const validation = validateRuleConfig(options.config)
    const validConfig = validation.valid ? validation.config : null

    const base = {
        schemaVersion: 1 as const,
        input: {
            name: options.inputName,
            fingerprint: options.fingerprint,
        },
        scope: options.scope,
        profile: validConfig
            ? {
                  id: validConfig.id,
                  rules: { ...validConfig.rules },
                  configDigest: configDigest(validConfig),
              }
            : null,
        issues: [] as DiagramCheckIssue[],
        summary: emptySummary(),
        generatedAt: options.generatedAt ?? new Date().toISOString(),
    }

    if (!validConfig) {
        return {
            ...base,
            status: "invalid",
            error: {
                code: "INVALID_CONFIG",
                message: validation.valid
                    ? "配置无效"
                    : validation.errors.join("；"),
            },
        }
    }

    if (options.status !== "completed") {
        return {
            ...base,
            status: options.status,
            error: options.error ?? {
                code:
                    options.status === "invalid"
                        ? "INVALID_INPUT"
                        : "EXECUTION_FAILED",
                message:
                    options.status === "invalid" ? "输入无效" : "检查执行失败",
            },
        }
    }

    if (!options.data) {
        return {
            ...base,
            status: "invalid",
            error: {
                code: "MISSING_DATA",
                message: "检查成功状态必须提供规范化图表数据",
            },
        }
    }

    const currentPageId =
        options.scope.kind === "current" ? options.scope.pageId : null

    const selectedPages =
        currentPageId === null
            ? options.data.pages
            : options.data.pages.filter((page) => page.id === currentPageId)

    if (options.scope.kind === "current" && selectedPages.length !== 1) {
        return {
            ...base,
            status: "invalid",
            error: {
                code: "CURRENT_PAGE_NOT_FOUND",
                message: `找不到当前页面：${options.scope.pageId}`,
            },
        }
    }

    const selectedPageIds = new Set(selectedPages.map((page) => page.id))
    const issues = sortIssues(
        (options.issues ?? []).filter((issue) =>
            selectedPageIds.has(issue.pageId),
        ),
    )

    const errors = issues.filter((issue) => issue.severity === "error").length
    const warnings = issues.filter(
        (issue) => issue.severity === "warning",
    ).length

    return {
        ...base,
        status: "completed",
        issues,
        summary: {
            pages: selectedPages.length,
            cells: selectedPages.reduce(
                (total, page) => total + page.cellCount,
                0,
            ),
            errors,
            warnings,
        },
        error: null,
    }
}
