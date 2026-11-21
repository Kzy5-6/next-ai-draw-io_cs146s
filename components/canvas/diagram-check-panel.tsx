"use client"

import { useEffect, useRef, useState } from "react"
import { useDiagram } from "@/contexts/diagram-context"
import { checkDiagram } from "@/lib/diagram-check"
import { adaptDiagramXml } from "@/lib/diagram-check-adapter"
import { FLOWCHART_CONFIG, SKETCH_CONFIG } from "@/lib/diagram-check-rules"
import type {
    CheckScope,
    DiagramCheckReport,
    RuleId,
} from "@/lib/diagram-check-types"
import { highlightChangedCells, selectPage } from "@/lib/drawio/editor-bridge"
import { useCanvasStore } from "@/stores/canvas-store"
import { useUiStore } from "@/stores/ui-store"

type Profile = "flowchart" | "sketch"
type Severity = "all" | "error" | "warning"

export function DiagramCheckPanel({
    onHandToAI,
}: {
    onHandToAI: (message: string) => void
}) {
    const { chartXML } = useDiagram()
    const currentPageId = useCanvasStore((state) => state.currentPageId)
    const focusComposer = useUiStore((state) => state.focusComposer)
    const setPanelOpen = useUiStore((state) => state.setPanelOpen)

    const [scopeKind, setScopeKind] = useState<"all" | "current">("all")
    const [profileId, setProfileId] = useState<Profile>("flowchart")
    const [severity, setSeverity] = useState<Severity>("all")
    const [ruleFilter, setRuleFilter] = useState<RuleId | "all">("all")
    const [report, setReport] = useState<DiagramCheckReport | null>(null)
    const [reportXML, setReportXML] = useState("")
    const [stale, setStale] = useState(false)
    const [isChecking, setIsChecking] = useState(false)
    const [checkError, setCheckError] = useState("")
    const [navigationError, setNavigationError] = useState("")
    const taskId = useRef(0)
    const latestXML = useRef(chartXML)
    latestXML.current = chartXML

    const config = profileId === "flowchart" ? FLOWCHART_CONFIG : SKETCH_CONFIG

    useEffect(() => {
        if (report && reportXML !== chartXML) setStale(true)
    }, [chartXML, report, reportXML])

    useEffect(() => {
        if (
            report?.scope.kind === "current" &&
            currentPageId !== report.scope.pageId
        ) {
            setStale(true)
        }
    }, [currentPageId, report])

    const runCheck = async () => {
        const id = ++taskId.current
        setCheckError("")
        setNavigationError("")

        let scope: CheckScope
        if (scopeKind === "current") {
            if (!currentPageId) {
                setCheckError("???? ID ????????????")
                return
            }
            scope = { kind: "current", pageId: currentPageId }
        } else {
            scope = { kind: "all" }
        }

        const inputXML = chartXML
        const inputConfig = config
        setIsChecking(true)

        try {
            const result = await checkDiagram({
                xml: inputXML,
                inputName: "当前图表",
                scope,
                config: inputConfig,
            })

            if (id !== taskId.current) return
            if (latestXML.current !== inputXML) {
                setStale(true)
                return
            }

            setReport(result)
            setReportXML(inputXML)
            setStale(false)
        } catch (error) {
            if (id !== taskId.current) return
            setCheckError(error instanceof Error ? error.message : "??????")
        } finally {
            if (id === taskId.current) setIsChecking(false)
        }
    }

    const cancelCheck = () => {
        taskId.current += 1
        setIsChecking(false)
    }

    const locateIssue = (pageId: string, cellId: string) => {
        setNavigationError("")
        try {
            const adapted = adaptDiagramXml(chartXML)
            const page =
                adapted.status === "ok"
                    ? adapted.data.pages.find((item) => item.id === pageId)
                    : undefined
            const exists =
                page?.nodes.some((node) => node.id === cellId) ||
                page?.edges.some((edge) => edge.id === cellId)

            if (!exists) {
                setNavigationError(
                    `目标 ${pageId} / ${cellId} 已不存在，请重新检查。`,
                )
                return
            }
            if (!selectPage(pageId)) {
                setNavigationError(
                    `无法切换页面 ${pageId}。请确认 draw.io 编辑器可用。目标 ID：${cellId}`,
                )
                return
            }
            highlightChangedCells([cellId], pageId, { navigate: false })
        } catch {
            setNavigationError(
                `无法定位目标。页面 ID：${pageId}；图形 ID：${cellId}`,
            )
        }
    }

    const handToAI = (issue: DiagramCheckReport["issues"][number]) => {
        const safe = (value: string) => JSON.stringify(value)
        onHandToAI(
            [
                "???????????????????????????????????????",
                `?????${issue.ruleId}`,
                `?????${issue.severity}`,
                `?? ID?${safe(issue.pageId)}`,
                `?? ID?${safe(issue.cellId)}`,
                `?????${safe(issue.message)}`,
                `检查输入指纹：${report?.input.fingerprint ?? "unknown"}`,
                "??????????????????????????????",
            ].join("\n"),
        )
    }

    const exportReport = () => {
        if (!report) return
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: "application/json",
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = `diagram-check-${Date.now()}.json`
        anchor.click()
        URL.revokeObjectURL(url)
    }

    const visibleIssues =
        report?.issues.filter(
            (issue) =>
                (severity === "all" || issue.severity === severity) &&
                (ruleFilter === "all" || issue.ruleId === ruleFilter),
        ) ?? []

    return (
        <section
            data-testid="diagram-check-panel"
            className="absolute left-3 top-3 z-30 w-[min(390px,calc(100%-24px))] max-h-[min(78vh,680px)] overflow-y-auto rounded-xl border border-border bg-background/95 p-3 text-foreground shadow-lg backdrop-blur"
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">????</h2>
                <div className="flex gap-1">
                    {report && (
                        <button
                            type="button"
                            onClick={exportReport}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            导出报告
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={runCheck}
                        disabled={isChecking}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                        {isChecking ? "????" : "????"}
                    </button>
                    {isChecking && (
                        <button
                            type="button"
                            onClick={cancelCheck}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            取消
                        </button>
                    )}
                </div>
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
                    检查配置
                    <select
                        value={profileId}
                        onChange={(event) =>
                            setProfileId(event.target.value as Profile)
                        }
                        className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                    >
                        <option value="flowchart">Flowchart</option>
                        <option value="sketch">Sketch</option>
                    </select>
                </label>
            </div>

            {isChecking && (
                <p className="mt-2 text-xs text-muted-foreground"></p>
            )}
            {checkError && (
                <p
                    role="alert"
                    className="mt-2 whitespace-pre-wrap text-xs text-destructive"
                >
                    {checkError}
                </p>
            )}
            {navigationError && (
                <p
                    role="alert"
                    className="mt-2 whitespace-pre-wrap text-xs text-destructive"
                >
                    {navigationError}
                </p>
            )}

            {report && (
                <div className="mt-3 space-y-2">
                    <div className="rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold">
                                {report.status === "completed"
                                    ? "检查已完成"
                                    : report.status === "invalid"
                                      ? "输入无效"
                                      : "??????"}
                            </p>
                            {stale && (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                                    ?????
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {report.scope.kind === "all"
                                ? "全部页面"
                                : `页面 ${report.scope.pageId}`}
                            {" · "}
                            {report.profile?.id ?? "未知配置"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            ?? {report.summary.pages ?? "?"} ? ??{" "}
                            {report.summary.cells ?? "?"} ? ??{" "}
                            {report.summary.errors ?? "?"} ? ??{" "}
                            {report.summary.warnings ?? "?"}
                        </p>
                        {report.error && (
                            <p className="mt-1 break-words text-xs text-destructive">
                                {report.error.code}: {report.error.message}
                            </p>
                        )}
                        {report.status === "completed" &&
                            report.issues.length === 0 && (
                                <p className="mt-2 text-xs text-green-700">
                                    检查成功，没有发现问题。
                                </p>
                            )}
                        {stale && (
                            <p className="mt-1 text-xs text-amber-800">
                                图表或检查范围已变化。此报告仍可导出，但不代表当前图表状态。
                            </p>
                        )}
                    </div>

                    {report.issues.length > 0 && (
                        <>
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={severity}
                                    onChange={(event) =>
                                        setSeverity(
                                            event.target.value as Severity,
                                        )
                                    }
                                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                                >
                                    <option value="all">全部严重程度</option>
                                    <option value="error">???</option>
                                    <option value="warning">???</option>
                                </select>
                                <select
                                    value={ruleFilter}
                                    onChange={(event) =>
                                        setRuleFilter(
                                            event.target.value as
                                                | RuleId
                                                | "all",
                                        )
                                    }
                                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                                >
                                    <option value="all">全部规则</option>
                                    <option value="missing-label">
                                        missing-label
                                    </option>
                                    <option value="isolated-step">
                                        isolated-step
                                    </option>
                                    <option value="missing-endpoint">
                                        missing-endpoint
                                    </option>
                                    <option value="dangling-endpoint">
                                        dangling-endpoint
                                    </option>
                                </select>
                            </div>
                            <p className="text-xs font-medium">
                                显示 {visibleIssues.length} /{" "}
                                {report.issues.length} ???
                            </p>
                            <ul className="space-y-2">
                                {visibleIssues.map((issue) => (
                                    <li
                                        key={`${issue.pageId}:${issue.cellId}:${issue.ruleId}`}
                                        className="rounded-md border border-border p-2"
                                    >
                                        <button
                                            type="button"
                                            onClick={() =>
                                                locateIssue(
                                                    issue.pageId,
                                                    issue.cellId,
                                                )
                                            }
                                            className="w-full text-left text-xs hover:underline"
                                        >
                                            <span className="block font-medium">
                                                {issue.cellId} · {issue.ruleId}
                                            </span>
                                            <span className="block text-muted-foreground">
                                                {issue.pageId} ·{" "}
                                                {issue.severity}
                                            </span>
                                            <span className="mt-1 block break-words">
                                                {issue.message}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handToAI(issue)}
                                            className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                                        >
                                            ?? AI ??
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </section>
    )
}
