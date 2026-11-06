"use client"

import { useState } from "react"
import { useDiagram } from "@/contexts/diagram-context"
import { checkDiagram } from "@/lib/diagram-check"
import { FLOWCHART_CONFIG, SKETCH_CONFIG } from "@/lib/diagram-check-rules"
import type { CheckScope, DiagramCheckReport } from "@/lib/diagram-check-types"
import { highlightChangedCells, selectPage } from "@/lib/drawio/editor-bridge"
import { useCanvasStore } from "@/stores/canvas-store"

export function MissingLabelDevPanel() {
    const { chartXML } = useDiagram()
    const currentPageId = useCanvasStore((state) => state.currentPageId)

    const [scopeKind, setScopeKind] = useState<"all" | "current">("all")
    const [profileId, setProfileId] = useState<"flowchart" | "sketch">(
        "flowchart",
    )
    const [report, setReport] = useState<DiagramCheckReport | null>(null)
    const [isChecking, setIsChecking] = useState(false)
    const [navigationError, setNavigationError] = useState("")
    const [checkError, setCheckError] = useState("")

    if (process.env.NODE_ENV !== "development") return null

    const runCheck = async () => {
        setNavigationError("")
        setCheckError("")
        setReport(null)

        let scope: CheckScope

        if (scopeKind === "current") {
            if (!currentPageId) {
                setCheckError(
                    "当前页面 ID 不可用，请先在 draw.io 中选择一个页面。",
                )
                return
            }
            scope = { kind: "current", pageId: currentPageId }
        } else {
            scope = { kind: "all" }
        }

        setIsChecking(true)

        try {
            const result = await checkDiagram({
                xml: chartXML,
                inputName: "当前图表",
                scope,
                config:
                    profileId === "flowchart"
                        ? FLOWCHART_CONFIG
                        : SKETCH_CONFIG,
            })
            setReport(result)
        } catch (error) {
            setCheckError(
                error instanceof Error ? error.message : "检查执行失败",
            )
        } finally {
            setIsChecking(false)
        }
    }

    const locateIssue = (pageId: string, cellId: string) => {
        setNavigationError("")

        if (!selectPage(pageId)) {
            setNavigationError(
                `无法切换到页面 ${pageId}，请确认该页面仍然存在。`,
            )
            return
        }

        highlightChangedCells([cellId], pageId, { navigate: false })
    }

    return (
        <section className="absolute left-3 top-3 z-30 w-[min(380px,calc(100%-24px))] max-h-[min(70vh,600px)] overflow-y-auto rounded-lg border border-border bg-background/95 p-3 text-foreground shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">图表规则检查（开发）</h2>
                <button
                    type="button"
                    onClick={runCheck}
                    disabled={isChecking}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                    {isChecking ? "检查中…" : "检查"}
                </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">
                    检查范围
                    <select
                        value={scopeKind}
                        onChange={(event) =>
                            setScopeKind(
                                event.target.value as "all" | "current",
                            )
                        }
                        className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                    >
                        <option value="all">全部页面</option>
                        <option value="current">当前页面</option>
                    </select>
                </label>

                <label className="text-xs text-muted-foreground">
                    规则配置
                    <select
                        value={profileId}
                        onChange={(event) =>
                            setProfileId(
                                event.target.value as "flowchart" | "sketch",
                            )
                        }
                        className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                    >
                        <option value="flowchart">Flowchart</option>
                        <option value="sketch">Sketch</option>
                    </select>
                </label>
            </div>

            {checkError && (
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-destructive">
                    {checkError}
                </p>
            )}

            {report && (
                <div className="mt-3 space-y-2">
                    <div className="rounded-md border border-border p-2">
                        <p className="text-xs font-medium">
                            {report.status === "completed"
                                ? "检查已完成"
                                : report.status === "invalid"
                                  ? "输入无效"
                                  : "检查执行失败"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            范围：
                            {report.scope.kind === "all"
                                ? "全部页面"
                                : `当前页面 (${report.scope.pageId})`}
                            {" · "}
                            配置：{report.profile?.id ?? profileId}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            页面：{report.summary.pages ?? "未知"}
                            {" · "}
                            图元：{report.summary.cells ?? "未知"}
                            {" · "}
                            错误：{report.summary.errors ?? "未知"}
                            {" · "}
                            警告：{report.summary.warnings ?? "未知"}
                        </p>
                    </div>

                    {report.error && (
                        <p className="whitespace-pre-wrap break-words text-xs text-destructive">
                            {report.error.code}: {report.error.message}
                        </p>
                    )}

                    {report.status === "completed" &&
                        report.issues.length === 0 && (
                            <p className="text-xs text-green-700">
                                检查完成，没有发现问题。
                            </p>
                        )}

                    {report.issues.length > 0 && (
                        <div>
                            <p className="text-xs font-medium">
                                发现 {report.issues.length} 个问题
                            </p>
                            <ul className="mt-2 space-y-1.5">
                                {report.issues.map((issue) => (
                                    <li
                                        key={`${issue.pageId}:${issue.cellId}:${issue.ruleId}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                locateIssue(
                                                    issue.pageId,
                                                    issue.cellId,
                                                )
                                            }
                                            className="w-full rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted"
                                        >
                                            <span className="block font-medium">
                                                {issue.cellId} · {issue.ruleId}
                                            </span>
                                            <span className="block text-muted-foreground">
                                                {issue.severity === "error"
                                                    ? "错误"
                                                    : "警告"}
                                                {" · "}
                                                页面 {issue.pageId}
                                            </span>
                                            <span className="mt-0.5 block break-words text-muted-foreground">
                                                {issue.message}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {navigationError && (
                <p className="mt-2 text-xs text-destructive">
                    {navigationError}
                </p>
            )}
        </section>
    )
}
