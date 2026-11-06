import type {
    DiagramCheckData,
    DiagramCheckIssue,
    RuleConfig,
    RuleId,
    RuleSeverity,
} from "./diagram-check-types"

export const FLOWCHART_CONFIG: RuleConfig = {
    id: "flowchart",
    rules: {
        "missing-label": "warning",
        "isolated-step": "warning",
        "missing-endpoint": "warning",
        "dangling-endpoint": "error",
    },
}

export const SKETCH_CONFIG: RuleConfig = {
    id: "sketch",
    rules: {
        "missing-label": "warning",
        "isolated-step": "warning",
        "missing-endpoint": "off",
        "dangling-endpoint": "error",
    },
}

const RULE_IDS: RuleId[] = [
    "missing-label",
    "isolated-step",
    "missing-endpoint",
    "dangling-endpoint",
]

const SEVERITIES: RuleSeverity[] = ["off", "warning", "error"]

export type ConfigValidation =
    | { valid: true; config: RuleConfig }
    | { valid: false; errors: string[] }

export function validateRuleConfig(input: unknown): ConfigValidation {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { valid: false, errors: ["配置必须是对象"] }
    }

    const candidate = input as Record<string, unknown>
    const errors: string[] = []

    if (typeof candidate.id !== "string" || !candidate.id.trim()) {
        errors.push("配置 id 必须是非空字符串")
    }

    if (
        !candidate.rules ||
        typeof candidate.rules !== "object" ||
        Array.isArray(candidate.rules)
    ) {
        errors.push("rules 必须是对象")
        return { valid: false, errors }
    }

    const rules = candidate.rules as Record<string, unknown>

    for (const key of Object.keys(rules)) {
        if (!RULE_IDS.includes(key as RuleId)) {
            errors.push(`未知规则：${key}`)
        }
    }

    for (const ruleId of RULE_IDS) {
        if (!(ruleId in rules)) {
            errors.push(`缺少规则：${ruleId}`)
        } else if (!SEVERITIES.includes(rules[ruleId] as RuleSeverity)) {
            errors.push(`规则 ${ruleId} 的值无效`)
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors }
    }

    return {
        valid: true,
        config: {
            id: candidate.id as string,
            rules: rules as Record<RuleId, RuleSeverity>,
        },
    }
}

export function runDiagramRules(
    data: DiagramCheckData,
    config: RuleConfig,
): DiagramCheckIssue[] {
    const validation = validateRuleConfig(config)
    if (!validation.valid) {
        throw new Error(validation.errors.join("；"))
    }

    const issues: DiagramCheckIssue[] = []

    for (const page of data.pages) {
        const endpointIds = new Set(page.nodes.map((node) => node.id))

        const connectedIds = new Set<string>()

        for (const edge of page.edges) {
            if (edge.source) connectedIds.add(edge.source)
            if (edge.target) connectedIds.add(edge.target)

            if (validation.config.rules["missing-endpoint"] !== "off") {
                if (!edge.source || !edge.target) {
                    issues.push({
                        pageId: page.id,
                        cellId: edge.id,
                        ruleId: "missing-endpoint",
                        severity: validation.config.rules["missing-endpoint"] as
                            | "warning"
                            | "error",
                        message: "连接缺少 source 或 target 端点",
                    })
                }
            }

            if (validation.config.rules["dangling-endpoint"] !== "off") {
                const missing: string[] = []

                if (edge.source && !endpointIds.has(edge.source)) {
                    missing.push(edge.source)
                }
                if (edge.target && !endpointIds.has(edge.target)) {
                    missing.push(edge.target)
                }

                if (missing.length > 0) {
                    issues.push({
                        pageId: page.id,
                        cellId: edge.id,
                        ruleId: "dangling-endpoint",
                        severity: validation.config.rules[
                            "dangling-endpoint"
                        ] as "warning" | "error",
                        message: `连接引用了不存在的节点或容器：${missing.join(", ")}`,
                    })
                }
            }
        }

        for (const node of page.nodes) {
            if (node.role !== "process") continue

            if (
                validation.config.rules["missing-label"] !== "off" &&
                !node.label.trim()
            ) {
                issues.push({
                    pageId: page.id,
                    cellId: node.id,
                    ruleId: "missing-label",
                    severity: validation.config.rules["missing-label"] as
                        | "warning"
                        | "error",
                    message: "流程步骤缺少名称",
                })
            }

            if (
                validation.config.rules["isolated-step"] !== "off" &&
                !connectedIds.has(node.id)
            ) {
                issues.push({
                    pageId: page.id,
                    cellId: node.id,
                    ruleId: "isolated-step",
                    severity: validation.config.rules["isolated-step"] as
                        | "warning"
                        | "error",
                    message: "流程步骤没有连接",
                })
            }
        }
    }

    return issues.sort(
        (a, b) =>
            a.pageId.localeCompare(b.pageId) ||
            a.cellId.localeCompare(b.cellId) ||
            a.ruleId.localeCompare(b.ruleId),
    )
}
