# HW3 Agent Context：missing-label

## 用户目标

实现首个图表质量检查功能 `missing-label`。用户导入 draw.io 文件后，可以检查所有页面中缺少名称的流程步骤，查看问题位置，定位并补充名称，再次检查确认问题消失。

## 当前任务范围

本周分支：`hw03/first-check`

目标仓库：个人 fork `Kzy5-6/next-ai-draw-io_cs146s`

PR 目标：base 为个人 fork 的 `course/main`，compare 为 `hw03/first-check`。

本周只实现 `missing-label` 首个检查功能，不提前实现后续周次的 CLI、CI、质量分析或工作流功能。

## 输入与接口

输入：draw.io 文件 XML 内容。

规则核心：`lib/missing-label-core.ts`

- 接收归一化后的页面和图元数据。
- 仅检查明确标记为流程步骤的图元。
- 对空白名称进行判断。
- 输出 `empty`、`ok` 或 `issues`。
- 每个问题保留 `pageId`、`pageName`、`cellId` 和 `reason`。

文件适配层：`lib/missing-label.ts`

- 调用现有 draw.io 文件解析器。
- 提取所有页面和图元。
- 将标签转换为可读文本。
- 处理无效 XML、DOCTYPE 和意外异常。
- 不修改输入文件内容。

开发面板：`components/canvas/missing-label-dev-panel.tsx`

- 仅开发环境显示。
- 提供检查按钮和结果列表。
- 支持按页面 ID 和图元 ID 定位并高亮问题。

## 已完成工作

- 新增纯规则核心和文件适配层。
- 新增开发环境检查面板，并集成到 workspace overlay。
- 新增核心测试和适配层测试。
- 新增课程人工案例目录 `course-fixtures/`。
- 20 项相关单元测试通过。
- `npx.cmd tsc --noEmit` 通过。
- 浏览器验证多页面导入、检查、定位、高亮、补充名称、重查、导出和重新打开均成功。
- 产品仓库 `course-notes/HW3.md` 已创建。
- 产品仓库 `.gitignore` 已增加 `/.runtime/`，并通过 `git check-ignore -v .runtime\test.tmp` 验证。

## 已知限制与待处理

- 规则核心是纯逻辑；当前适配层仍依赖 MCP server 解析器和 `DOMParser`，不能声称整个检查器已实现 Node/browser 双环境通用。
- 编辑器高亮是短暂高亮，不等同于选择图元或自动滚动。
- `npm.cmd run check` 未通过，当前仓库 Biome schema 与 CLI 版本不一致，并存在格式和规则问题；没有执行自动修复。
- 本次改动后的 `npm.cmd run build` 已成功；编译、TypeScript 检查和 91 个静态页面生成均完成。存在 4 条来自现有文件的 Turbopack 动态文件系统访问警告。
- 尚未暂存、提交或创建 PR。
- 不要修改与本周任务无关的文件，不要执行自动格式化或依赖升级。

## 主要文件

新增：
- `lib/missing-label-core.ts`
- `lib/missing-label.ts`
- `components/canvas/missing-label-dev-panel.tsx`
- `tests/unit/missing-label-core.test.ts`
- `tests/unit/missing-label.test.ts`
- `course-fixtures/`
- `course-notes/HW3.md`
- `course-notes/agent-context.md`

修改：
- `components/workspace/workspace.tsx`
- `.gitignore`

## 验证命令

相关单元测试：

`npx.cmd vitest run tests/unit/missing-label-core.test.ts tests/unit/missing-label.test.ts`

TypeScript：

`npx.cmd tsc --noEmit`

Biome：

`npm.cmd run check`

生产构建：

`npm.cmd run build`

生产构建已在本次改动基础上复验通过；后续 PR 描述应记录成功结果及现有警告。

## 交接要求

继续工作前先检查：

`git status --short`

`git diff -- .gitignore components/workspace/workspace.tsx`

确认报告内容和文件清单，再审查新增文件。不要因为文件尚未跟踪就忽略它们；需要逐项确认新增文件内容。

提交前必须检查：

`git diff`

`git diff --cached`

按实际文件清单暂存，不要使用未经检查的全量暂存。只有在用户明确同意后才执行 commit 和 push。

PR 创建前确认目标仓库、base `course/main` 和 compare `hw03/first-check`。PR 描述必须基于实际测试、构建和浏览器验证结果，不得虚构状态。

## 新会话开始时

先复述当前任务目标、已完成事项、已知限制和待处理事项，再执行任何文件修改或 Git 操作。一次只推进一个步骤，命令执行后等待用户提供真实输出。