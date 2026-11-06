import type {
    DiagramCheckIssue,
    DiagramCheckReport,
} from "./diagram-check-types"

export type ReportComparison =
    | {
          comparable: false
          reason: string
      }
    | {
          comparable: true
          configurationChanged: boolean
          added: DiagramCheckIssue[]
          resolved: DiagramCheckIssue[]
          persisting: DiagramCheckIssue[]
      }

function sameScope(
    a: DiagramCheckReport["scope"],
    b: DiagramCheckReport["scope"],
): boolean {
    if (a.kind !== b.kind) return false
    if (a.kind === "all" && b.kind === "all") return true
    return a.kind === "current" && b.kind === "current" && a.pageId === b.pageId
}

function issueKey(issue: DiagramCheckIssue): string {
    return JSON.stringify([issue.pageId, issue.cellId, issue.ruleId])
}

export function compareDiagramReports(
    previous: DiagramCheckReport,
    current: DiagramCheckReport,
): ReportComparison {
    if (previous.status !== "completed" || current.status !== "completed") {
        return {
            comparable: false,
            reason: "只有 completed 状态的报告可以比较",
        }
    }

    if (previous.schemaVersion !== current.schemaVersion) {
        return {
            comparable: false,
            reason: "报告 schemaVersion 不一致",
        }
    }

    if (!sameScope(previous.scope, current.scope)) {
        return {
            comparable: false,
            reason: "报告检查范围不一致",
        }
    }

    const previousByKey = new Map(
        previous.issues.map((issue) => [issueKey(issue), issue]),
    )
    const currentByKey = new Map(
        current.issues.map((issue) => [issueKey(issue), issue]),
    )

    const added = current.issues.filter(
        (issue) => !previousByKey.has(issueKey(issue)),
    )
    const resolved = previous.issues.filter(
        (issue) => !currentByKey.has(issueKey(issue)),
    )
    const persisting = current.issues.filter((issue) =>
        previousByKey.has(issueKey(issue)),
    )

    return {
        comparable: true,
        configurationChanged:
            previous.profile?.configDigest !== current.profile?.configDigest,
        added,
        resolved,
        persisting,
    }
}
