export type RuleId =
    | "missing-label"
    | "isolated-step"
    | "missing-endpoint"
    | "dangling-endpoint"

export type RuleSeverity = "off" | "warning" | "error"

export type CellRole = "process" | "container" | "annotation" | "decoration"

export interface DiagramCheckNode {
    id: string
    role: CellRole
    label: string
}

export interface DiagramCheckEdge {
    id: string
    source: string | null
    target: string | null
}

export interface DiagramCheckPage {
    id: string
    name: string
    nodes: DiagramCheckNode[]
    edges: DiagramCheckEdge[]
    cellCount: number
}

export interface DiagramCheckData {
    pages: DiagramCheckPage[]
}

export interface RuleConfig {
    id: string
    rules: Record<RuleId, RuleSeverity>
}

export type CheckScope = { kind: "all" } | { kind: "current"; pageId: string }

export interface DiagramCheckIssue {
    pageId: string
    cellId: string
    ruleId: RuleId
    severity: Exclude<RuleSeverity, "off">
    message: string
}

export interface ReportSummary {
    pages: number | null
    cells: number | null
    errors: number | null
    warnings: number | null
}

export interface ReportError {
    code: string
    message: string
}

export interface DiagramCheckReport {
    schemaVersion: 1
    input: {
        name: string
        fingerprint: string | null
    }
    scope: CheckScope
    profile: {
        id: string
        rules: Record<RuleId, RuleSeverity>
        configDigest: string
    } | null
    status: "completed" | "invalid" | "failed"
    issues: DiagramCheckIssue[]
    summary: ReportSummary
    error: ReportError | null
    generatedAt: string
}
