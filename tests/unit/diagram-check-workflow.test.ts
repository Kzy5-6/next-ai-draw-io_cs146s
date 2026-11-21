import { describe, expect, it } from "vitest"
import type { DiagramCheckReport } from "../../lib/diagram-check-types"
import {
    type CheckSnapshot,
    diagramCheckWorkflowReducer,
    initialDiagramCheckWorkflowState,
    isCheckReportExportStale,
} from "../../lib/diagram-check-workflow"

const snapshot: CheckSnapshot = {
    documentSessionId: "session-a",
    fingerprint: "fingerprint-a",
    scopeKey: "all",
    configDigest: "config-a",
}

function report(
    status: DiagramCheckReport["status"] = "completed",
): DiagramCheckReport {
    return {
        schemaVersion: 1,
        input: { name: "test.drawio", fingerprint: "fingerprint-a" },
        scope: { kind: "all" },
        profile: null,
        status,
        issues: [],
        summary: { pages: 1, cells: 0, errors: 0, warnings: 0 },
        error:
            status === "completed"
                ? null
                : {
                      code:
                          status === "invalid"
                              ? "INVALID_INPUT"
                              : "EXECUTION_FAILED",
                      message: "test",
                  },
        generatedAt: "2026-01-01T00:00:00.000Z",
    }
}

describe("diagram check workflow reducer", () => {
    it("keeps the previous report visible while a new check is running", () => {
        const withReport = {
            ...initialDiagramCheckWorkflowState,
            report: report(),
            phase: "completed" as const,
            snapshot,
        }

        const next = diagramCheckWorkflowReducer(withReport, {
            type: "start",
            snapshot: { ...snapshot, fingerprint: "fingerprint-b" },
        })

        expect(next.phase).toBe("running")
        expect(next.report).toBe(withReport.report)
        expect(next.activeTaskId).toBe(1)
    })

    it("does not let a late result overwrite a newer task", () => {
        const first = diagramCheckWorkflowReducer(
            initialDiagramCheckWorkflowState,
            { type: "start", snapshot },
        )
        const second = diagramCheckWorkflowReducer(first, {
            type: "start",
            snapshot: { ...snapshot, fingerprint: "fingerprint-b" },
        })

        const newerResult = diagramCheckWorkflowReducer(second, {
            type: "resolve",
            taskId: 2,
            report: report(),
        })
        const lateOlderResult = diagramCheckWorkflowReducer(newerResult, {
            type: "resolve",
            taskId: 1,
            report: report("failed"),
        })

        expect(lateOlderResult).toBe(newerResult)
        expect(lateOlderResult.report?.status).toBe("completed")
    })

    it("marks a report stale without discarding its snapshot or contents", () => {
        const completed = {
            ...initialDiagramCheckWorkflowState,
            phase: "completed" as const,
            report: report(),
            snapshot,
        }

        const stale = diagramCheckWorkflowReducer(completed, {
            type: "mark-stale",
        })

        expect(stale.stale).toBe(true)
        expect(stale.report).toBe(completed.report)
        expect(stale.snapshot).toBe(snapshot)
        expect(isCheckReportExportStale(stale)).toBe(true)
    })

    it("distinguishes invalid input from execution failure", () => {
        const started = diagramCheckWorkflowReducer(
            initialDiagramCheckWorkflowState,
            { type: "start", snapshot },
        )
        const invalid = diagramCheckWorkflowReducer(started, {
            type: "resolve",
            taskId: 1,
            report: report("invalid"),
        })

        const failedStart = diagramCheckWorkflowReducer(invalid, {
            type: "start",
            snapshot,
        })
        const failed = diagramCheckWorkflowReducer(failedStart, {
            type: "resolve",
            taskId: 2,
            report: report("failed"),
        })

        expect(invalid.phase).toBe("invalid")
        expect(failed.phase).toBe("failed")
    })

    it("ignores cancellation for a task that is no longer active", () => {
        const started = diagramCheckWorkflowReducer(
            initialDiagramCheckWorkflowState,
            { type: "start", snapshot },
        )
        const cancelled = diagramCheckWorkflowReducer(started, {
            type: "cancel",
            taskId: 999,
        })

        expect(cancelled).toBe(started)
        expect(cancelled.activeTaskId).toBe(1)
    })
})
