import { constants as fsConstants } from "node:fs"
import { access, readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { checkDiagram } from "../lib/diagram-check"
import { compareDiagramReports } from "../lib/diagram-check-compare"
import {
    FLOWCHART_CONFIG,
    SKETCH_CONFIG,
    validateRuleConfig,
} from "../lib/diagram-check-rules"
import type { DiagramCheckReport, RuleConfig } from "../lib/diagram-check-types"
import { writeReportSafely } from "../lib/write-report-safely"

type ParsedArgs = {
    values: Map<string, string>
    flags: Set<string>
}

const HELP = `
CS146S Diagram Check CLI

Commands:
  course:check --input <file-or-directory> [options]
  course:compare --before <report.json> --after <report.json>

Check options:
  --input <path>       One .drawio file or a directory (non-recursive)
  --output <path>      JSON report destination
  --config <id|path>   Built-in flowchart/sketch ID or JSON config file
  --fail-on <level>    error (default), warning, or none
  --force              Replace an existing output report
  --dry-run            Validate the plan without reading diagram contents or writing files
  --help               Show this help

Compare options:
  --before <path>      Previous completed report
  --after <path>       Current completed report
  --help               Show this help

Examples:
  npm run course:check -- --input course-fixtures/normal.drawio --output .runtime/normal.json
  npm run course:check -- --input course-fixtures/batch --fail-on warning --output .runtime/batch.json
  npm run course:check -- --input course-fixtures/batch --dry-run
  npm run course:compare -- --before .runtime/before.json --after .runtime/after.json

Reports are JSON files at the --output path. A single input produces one report;
a directory produces a batch report containing every selected file result.
Exit codes: 0 = completed below threshold; 1 = issue threshold reached;
2 = invalid input/configuration or a check could not be completed.

Build: npm run course:build
`

function parseArgs(args: string[]): ParsedArgs {
    const values = new Map<string, string>()
    const flags = new Set<string>()
    const allowedValues = new Set([
        "--input",
        "--output",
        "--config",
        "--fail-on",
        "--before",
        "--after",
    ])
    const allowedFlags = new Set(["--force", "--dry-run", "--help"])

    for (let i = 0; i < args.length; i += 1) {
        const token = args[i]
        if (allowedFlags.has(token)) {
            flags.add(token)
            continue
        }
        if (!allowedValues.has(token)) {
            throw new Error(`未知参数：${token}`)
        }
        const value = args[i + 1]
        if (!value || value.startsWith("--")) {
            throw new Error(`参数 ${token} 缺少值`)
        }
        if (values.has(token)) {
            throw new Error(`参数 ${token} 不能重复`)
        }
        values.set(token, value)
        i += 1
    }
    return { values, flags }
}

function getValue(
    args: ParsedArgs,
    key: string,
    fallback?: string,
): string | undefined {
    return args.values.get(key) ?? fallback
}

async function loadConfig(configArg?: string): Promise<RuleConfig> {
    if (!configArg || configArg === "flowchart") return FLOWCHART_CONFIG
    if (configArg === "sketch") return SKETCH_CONFIG

    const configPath = path.resolve(configArg)
    let parsed: unknown
    try {
        parsed = JSON.parse(await readFile(configPath, "utf8"))
    } catch (error) {
        throw new Error(
            `无法读取配置文件 ${configPath}：${error instanceof Error ? error.message : String(error)}`,
        )
    }
    const validation = validateRuleConfig(parsed)
    if (!validation.valid) {
        throw new Error(`配置无效：${validation.errors.join("；")}`)
    }
    return validation.config
}

async function collectInputs(
    inputPath: string,
): Promise<{ files: string[]; isDirectory: boolean }> {
    const absolute = path.resolve(inputPath)
    const info = await stat(absolute).catch(() => null)
    if (!info) throw new Error(`输入路径不存在或不可访问：${absolute}`)

    if (info.isFile()) {
        if (path.extname(absolute).toLowerCase() !== ".drawio") {
            throw new Error("单文件输入必须使用 .drawio 扩展名")
        }
        return { files: [absolute], isDirectory: false }
    }
    if (!info.isDirectory()) {
        throw new Error("输入必须是 .drawio 文件或目录")
    }

    const entries = await readdir(absolute, { withFileTypes: true })
    const files = entries
        .filter(
            (entry) =>
                entry.isFile() &&
                path.extname(entry.name).toLowerCase() === ".drawio",
        )
        .map((entry) => path.join(absolute, entry.name))
        .sort((a, b) => {
            const left = path.basename(a)
            const right = path.basename(b)
            return left < right ? -1 : left > right ? 1 : 0
        })
    return { files, isDirectory: true }
}

function failedReport(name: string, message: string): DiagramCheckReport {
    return {
        schemaVersion: 1,
        input: { name, fingerprint: null },
        scope: { kind: "all" },
        profile: null,
        status: "failed",
        issues: [],
        summary: { pages: null, cells: null, errors: null, warnings: null },
        error: { code: "CLI_INPUT_FAILED", message },
        generatedAt: new Date().toISOString(),
    }
}

async function validateOutput(
    outputArg: string | undefined,
    force: boolean,
    inputFiles: string[],
): Promise<string | null> {
    if (!outputArg) return null
    const output = path.resolve(outputArg)
    if (
        inputFiles.some(
            (file) => path.resolve(file).toLowerCase() === output.toLowerCase(),
        )
    ) {
        throw new Error("输出路径不能与任何输入文件相同")
    }

    const parent = path.dirname(output)
    const parentInfo = await stat(parent).catch(() => null)
    if (!parentInfo?.isDirectory()) {
        throw new Error(`输出目录不存在：${parent}。请先创建目录`)
    }
    try {
        await access(parent, fsConstants.W_OK)
    } catch {
        throw new Error(`输出目录不可写：${parent}`)
    }

    const existing = await stat(output).catch(() => null)
    if (existing && !force) {
        throw new Error(`输出文件已存在：${output}。如需覆盖请添加 --force`)
    }
    if (existing?.isDirectory()) {
        throw new Error(`输出路径是目录：${output}`)
    }
    return output
}

function thresholdReached(
    reports: DiagramCheckReport[],
    threshold: string,
): boolean {
    if (threshold === "none") return false
    return reports.some(
        (report) =>
            report.status === "completed" &&
            report.issues.some(
                (issue) =>
                    issue.severity === "error" ||
                    (threshold === "warning" && issue.severity === "warning"),
            ),
    )
}

async function runCheck(args: ParsedArgs): Promise<number> {
    const inputArg = getValue(args, "--input")
    if (!inputArg) throw new Error("缺少 --input")
    const threshold = getValue(args, "--fail-on", "error") ?? "error"
    if (!["error", "warning", "none"].includes(threshold)) {
        throw new Error("--fail-on 只能是 error、warning 或 none")
    }

    const config = await loadConfig(getValue(args, "--config"))
    const plan = await collectInputs(inputArg)
    if (plan.files.length === 0)
        throw new Error("输入目录中没有当前层的 .drawio 文件")

    const output = await validateOutput(
        getValue(args, "--output"),
        args.flags.has("--force"),
        plan.files,
    )
    if (!args.flags.has("--dry-run") && !output) {
        throw new Error("正式检查必须指定 --output；仅 dry-run 可以省略")
    }

    if (args.flags.has("--dry-run")) {
        process.stdout.write(
            `${JSON.stringify(
                {
                    dryRun: true,
                    input: path.resolve(inputArg),
                    kind: plan.isDirectory ? "directory" : "file",
                    files: plan.files.map((file) =>
                        path.relative(process.cwd(), file),
                    ),
                    config: config.id,
                    failOn: threshold,
                    output: output ?? null,
                    writesFiles: false,
                    parsesDiagrams: false,
                },
                null,
                2,
            )}\n`,
        )
        return 0
    }

    const reports: DiagramCheckReport[] = []
    for (const file of plan.files) {
        try {
            const xml = await readFile(file, "utf8")
            reports.push(
                await checkDiagram({
                    xml,
                    inputName: path.basename(file),
                    scope: { kind: "all" },
                    config,
                }),
            )
        } catch (error) {
            reports.push(
                failedReport(
                    path.basename(file),
                    error instanceof Error ? error.message : String(error),
                ),
            )
        }
    }

    const completed = reports.filter(
        (report) => report.status === "completed",
    ).length
    const failed = reports.length - completed
    const document = plan.isDirectory
        ? {
              schemaVersion: 1,
              kind: "batch",
              input: path.resolve(inputArg),
              config: config.id,
              completed,
              failed,
              results: reports.map((report, index) => ({
                  file: path.basename(plan.files[index]),
                  status: report.status,
                  report,
              })),
          }
        : reports[0]

    if (!output) throw new Error("正式检查必须指定 --output")
    await writeReportSafely(output, `${JSON.stringify(document, null, 2)}\n`)

    process.stdout.write(`报告已写入：${output}\n`)
    process.stdout.write(`completed: ${completed}; failed: ${failed}\n`)

    if (failed > 0) return 2
    return thresholdReached(reports, threshold) ? 1 : 0
}

function assertReportShape(
    value: unknown,
    label: string,
): asserts value is DiagramCheckReport {
    if (!value || typeof value !== "object") {
        throw new Error(`${label} 不是有效的报告对象`)
    }
    const report = value as Record<string, unknown>
    if (
        typeof report.schemaVersion !== "number" ||
        !["completed", "invalid", "failed"].includes(String(report.status)) ||
        !Array.isArray(report.issues) ||
        !report.scope ||
        typeof report.scope !== "object"
    ) {
        throw new Error(`${label} 缺少必需字段或字段格式错误`)
    }
    const scope = report.scope as Record<string, unknown>
    if (
        scope.kind !== "all" &&
        !(scope.kind === "current" && typeof scope.pageId === "string")
    ) {
        throw new Error(`${label} 的 scope 格式无效`)
    }
    if (
        report.profile !== null &&
        report.profile !== undefined &&
        typeof report.profile !== "object"
    ) {
        throw new Error(`${label} 的 profile 格式无效`)
    }
    for (const issue of report.issues) {
        if (!issue || typeof issue !== "object") {
            throw new Error(`${label} 包含格式无效的问题项`)
        }
        const item = issue as Record<string, unknown>
        if (
            typeof item.pageId !== "string" ||
            typeof item.cellId !== "string" ||
            typeof item.ruleId !== "string" ||
            !["warning", "error"].includes(String(item.severity))
        ) {
            throw new Error(`${label} 包含缺少身份字段的问题项`)
        }
    }
}
async function runCompare(args: ParsedArgs): Promise<number> {
    const beforePath = getValue(args, "--before")
    const afterPath = getValue(args, "--after")
    if (!beforePath || !afterPath) {
        throw new Error("比较命令需要同时指定 --before 和 --after")
    }

    let before: DiagramCheckReport
    let after: DiagramCheckReport
    try {
        before = JSON.parse(
            await readFile(path.resolve(beforePath), "utf8"),
        ) as DiagramCheckReport
        after = JSON.parse(
            await readFile(path.resolve(afterPath), "utf8"),
        ) as DiagramCheckReport
    } catch (error) {
        throw new Error(
            `无法读取报告 JSON：${error instanceof Error ? error.message : String(error)}`,
        )
    }

    assertReportShape(before, "before 报告")
    assertReportShape(after, "after 报告")

    const comparison = compareDiagramReports(before, after)
    if (!comparison.comparable) {
        process.stderr.write(`报告不可比较：${comparison.reason}\n`)
        return 2
    }

    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`)
    process.stdout.write(
        `新增：${comparison.added.length}；已解决：${comparison.resolved.length}；持续存在：${comparison.persisting.length}\n`,
    )
    if (comparison.configurationChanged) {
        process.stdout.write(
            "提示：两份报告使用了不同配置，问题变化可能受到规则配置影响。\n",
        )
    }
    return 0
}

async function main(): Promise<number> {
    const [command, ...rawArgs] = process.argv.slice(2)
    if (!command || command === "--help" || command === "help") {
        process.stdout.write(HELP)
        return 0
    }

    const args = parseArgs(rawArgs)
    if (args.flags.has("--help")) {
        process.stdout.write(HELP)
        return 0
    }

    if (command === "check") return runCheck(args)
    if (command === "compare") return runCompare(args)
    throw new Error(`未知命令：${command}\n${HELP}`)
}

main()
    .then((code) => {
        process.exitCode = code
    })
    .catch((error) => {
        process.stderr.write(
            `错误：${error instanceof Error ? error.message : String(error)}\n`,
        )
        process.stderr.write("使用 --help 查看命令示例。\n")
        process.exitCode = 2
    })
