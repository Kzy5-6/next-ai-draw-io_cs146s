import type { DiagramCheckReport } from "./diagram-check-types"

export type CheckWorkflowPhase =
    | "idle"
    | "running"
    | "completed"
    | "invalid"
    | "failed"

export interface CheckSnapshot {
    documentSessionId: string
    fingerprint: string | null
    scopeKey: string
    configDigest: string
}

export interface DiagramCheckWorkflowState {
    nextTaskId: number
    activeTaskId: number | null
    phase: CheckWorkflowPhase
    report: DiagramCheckReport | null
    stale: boolean
    snapshot: CheckSnapshot | null
}

export type DiagramCheckWorkflowAction =
    | { type: "start"; snapshot: CheckSnapshot }
    | { type: "resolve"; taskId: number; report: DiagramCheckReport }
    | { type: "cancel"; taskId: number }
    | { type: "mark-stale" }
    | { type: "clear" }

export const initialDiagramCheckWorkflowState: DiagramCheckWorkflowState = {
    nextTaskId: 1,
    activeTaskId: null,
    phase: "idle",
    report: null,
    stale: false,
    snapshot: null,
}

export function diagramCheckWorkflowReducer(
    state: DiagramCheckWorkflowState,
    action: DiagramCheckWorkflowAction,
): DiagramCheckWorkflowState {
    switch (action.type) {
        case "start": {
            const taskId = state.nextTaskId
            return {
                ...state,
                nextTaskId: taskId + 1,
                activeTaskId: taskId,
                phase: "running",
                snapshot: action.snapshot,
            }
        }

        case "resolve": {
            if (state.activeTaskId !== action.taskId) return state

            return {
                ...state,
                activeTaskId: null,
                phase: action.report.status,
                report: action.report,
                stale: false,
            }
        }

        case "cancel": {
            if (state.activeTaskId !== action.taskId) return state

            return {
                ...state,
                activeTaskId: null,
                phase: state.report?.status ?? "idle",
            }
        }

        case "mark-stale":
            if (!state.report || state.stale) return state
            return { ...state, stale: true }

        case "clear":
            return {
                ...initialDiagramCheckWorkflowState,
                nextTaskId: state.nextTaskId,
            }
    }
}

export function isCheckReportExportStale(
    state: DiagramCheckWorkflowState,
): boolean {
    return state.report !== null && state.stale
}
