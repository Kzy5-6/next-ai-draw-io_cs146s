"use client"

import { useState } from "react"
import { useDiagram } from "@/contexts/diagram-context"
import { highlightChangedCells, selectPage } from "@/lib/drawio/editor-bridge"
import { checkMissingLabels } from "@/lib/missing-label"

export function MissingLabelDevPanel() {
    const { chartXML } = useDiagram()
    const [result, setResult] = useState<ReturnType<
        typeof checkMissingLabels
    > | null>(null)
    const [navigationError, setNavigationError] = useState("")

    if (process.env.NODE_ENV !== "development") return null

    const runCheck = () => {
        setNavigationError("")
        setResult(checkMissingLabels(chartXML))
    }

    const locateIssue = (pageId: string, cellId: string) => {
        setNavigationError("")
        if (!selectPage(pageId)) {
            setNavigationError(`无法切换到页面 ${pageId}，请确认该页面仍存在。`)
            return
        }
        highlightChangedCells([cellId], pageId, { navigate: false })
    }

    return (
        <section className="absolute left-3 top-3 z-30 w-[min(360px,calc(100%-24px))] max-h-[min(60vh,520px)] overflow-y-auto rounded-lg border border-border bg-background/95 p-3 text-foreground shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">缺失名称检查（开发）</h2>
                <button
                    type="button"
                    onClick={runCheck}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                    检查
                </button>
            </div>

            {!result ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    点击“检查”扫描当前文档的所有页面。
                </p>
            ) : result.status === "empty" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                    文档为空，没有可检查的流程步骤。
                </p>
            ) : result.status === "ok" ? (
                <p className="mt-2 text-xs text-green-700">
                    检查完成，没有发现缺失名称。
                </p>
            ) : result.status === "invalid-xml" ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-destructive">
                    文档格式无效：{result.error}
                </p>
            ) : result.status === "error" ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-destructive">
                    检查执行失败：{result.error}
                </p>
            ) : (
                <div className="mt-2">
                    <p className="text-xs text-amber-700">
                        发现 {result.issues.length} 个缺失名称的流程步骤：
                    </p>
                    <ul className="mt-2 space-y-1.5">
                        {result.issues.map((issue) => (
                            <li key={`${issue.pageId}:${issue.cellId}`}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        locateIssue(issue.pageId, issue.cellId)
                                    }
                                    className="w-full rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted"
                                >
                                    <span className="block font-medium">
                                        {issue.pageName} · {issue.cellId}
                                    </span>
                                    <span className="block break-words text-muted-foreground">
                                        {issue.reason}（页面 ID：{issue.pageId}
                                        ）
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
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
