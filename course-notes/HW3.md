# HW3：首个图表检查功能——missing-label

## 1. 任务目标

本周在产品仓库的 `course/main` 基础上创建独立分支 `hw03/first-check`，实现第一个图表质量检查功能 `missing-label`。

用户导入 draw.io 流程图后，可以检查整个文件中的所有页面，找出缺少名称的流程步骤。检查结果需要指出页面和图元，用户可以定位问题、补充名称，再次检查确认问题已经消失。

本功能目前作为开发环境中的最小检查面板提供，不修改原始图表内容，也不改变现有的选择辅助面板。

## 2. 需求与行为

- 检查整个 draw.io 文件，而不是只检查当前页面。
- 结果保留 `pageId` 和 `cellId`，以支持跨页面定位。
- 根据图元角色识别流程步骤，不把分组、标题、装饰等非流程步骤当作检查对象。
- 对空字符串和仅包含空白字符的名称进行检查。
- 将标签转换为可读文本后判断是否为空；HTML 格式或实体空格不能被误判为有效名称。
- 以普通文本方式显示页面名称、图元 ID 和原因，不能把标签内容作为 HTML 执行。
- 区分空文档、检查通过、发现问题、无效 XML 和执行失败。
- 检查过程不修改原始 XML。
- 规则核心与 XML/浏览器适配层分离，便于后续复用和扩展。

## 3. 实现方案

### 3.1 规则核心

新增 `lib/missing-label-core.ts`。

规则核心接收归一化后的页面和图元数据，不依赖 XML、DOM、浏览器或 Node API。它遍历所有页面，只检查标记为流程步骤的图元，并使用 `trim()` 判断名称是否为空。

问题结果保留：
- `pageId`：页面 ID
- `pageName`：页面名称
- `cellId`：图元 ID
- `reason`：问题原因

核心结果包含 `empty`、`ok` 和 `issues` 三种状态。

### 3.2 数据适配层

新增 `lib/missing-label.ts`。

适配层负责读取 draw.io 文件内容、调用现有 `parseDrawioFileContent` 解析和解压数据，并将各页面的 `mxCell` 转换成规则核心所需的数据结构。

流程步骤通过图元属性和样式标记识别：要求 `vertex="1"`，排除 edge，并检查样式中是否存在精确的 `courseRole=process` 标记。对 `object` 和 `UserObject` 包装形式，同时读取包装节点上的 ID 和 label。

标签使用 `DOMParser` 的 HTML 文本内容提取方式转换为可读文本，并折叠空白字符；不将标签作为页面 HTML 渲染。

适配层额外处理空输入、DOCTYPE、解析失败、没有页面和意外执行异常，分别返回明确状态。DOCTYPE 检查会先排除注释和 CDATA 内容，避免把其中的普通文本误判为声明。

**运行环境边界：** 规则核心本身是纯逻辑；当前适配层复用了 MCP server 的文件解析器，并使用 `DOMParser`。因此不能据此声称整个检查器已经实现 Node 与浏览器双环境通用。后续如需 Node 端复用，需要为解析和 DOM 依赖设计独立适配方案。

### 3.3 开发面板

新增 `components/canvas/missing-label-dev-panel.tsx`，并在 `components/workspace/workspace.tsx` 中将其加入编辑器 overlay。

面板只在开发环境显示。点击“检查”后扫描当前文档的全部页面，并按状态展示结果。发现问题时列出页面名称、图元 ID 和原因。

点击问题项时，先调用 `selectPage` 检查并切换到目标页面，再调用 `highlightChangedCells` 高亮目标图元。如果目标页面不存在或无法切换，会显示定位错误，而不是静默回退到其他页面。

现有 `SelectionAsk` 面板仍然保留。

编辑器桥接层的 `highlightCells` 当前行为是短暂高亮，不等同于选中图元或自动滚动到图元；本次浏览器验证确认了页面切换和高亮定位行为。

## 4. 方案与设计取舍

本次采用“纯规则核心 + 文件适配层 + 开发面板”的分层结构，而不是把 XML 解析、规则判断和 UI 状态全部写在一个组件中。这样规则可以使用普通数据进行单元测试，UI 也不需要承担 XML 解析细节。

检查对象采用明确的流程步骤角色标记，而不是把所有空名称图元都报告为问题。这样可以避免把分组、标题、装饰和其他非流程元素误报为缺失名称。

检查结果保留页面和图元的稳定标识，而不只保存显示文本。多页面文件可能出现不同页面复用相同图元 ID 的情况，因此定位时必须同时使用 `pageId` 和 `cellId`。

异常状态不合并处理：格式无效与执行过程中的意外错误分别返回 `invalid-xml` 和 `error`，避免把程序错误误报成用户文件格式错误。

## 5. 课程测试案例

产品仓库新增 `course-fixtures/`，保存课程提供的人工构造案例及其 README。README 说明了各案例的用途，以及无效 XML、DTD 和断开引用等输入应直接传给适配层验证的原因：应用导入器可能提前拒绝或修复这些输入。

本周测试覆盖正常图表、缺失名称、HTML 标签、跨页面同 ID、分组与装饰、压缩图表、文本安全、空图、无效 XML、DOCTYPE、自由端点和断开引用等情况。

其中 `multi-page.drawio` 用于验证两个页面复用图元 ID 时，检查结果仍能准确指向缺失名称的页面。

大型性能测试图表按课程说明在本地 `.runtime/` 目录生成；本周没有生成大型性能样例。

## 6. 代码改动

本周新增：
- `lib/missing-label-core.ts`
- `lib/missing-label.ts`
- `components/canvas/missing-label-dev-panel.tsx`
- `tests/unit/missing-label-core.test.ts`
- `tests/unit/missing-label.test.ts`
- `course-fixtures/`

本周修改：
- `components/workspace/workspace.tsx`

`workspace.tsx` 的改动仅是在原有 overlay 中保留 `SelectionAsk`，并增加 `MissingLabelDevPanel`。

## 7. 自动化验证

### 单元测试

执行命令：

`npx.cmd vitest run tests/unit/missing-label-core.test.ts tests/unit/missing-label.test.ts`

实际结果：
- `tests/unit/missing-label-core.test.ts`：4 项通过
- `tests/unit/missing-label.test.ts`：16 项通过
- 共 2 个测试文件、20 项测试全部通过

### TypeScript 检查

执行 `npx.cmd tsc --noEmit`。执行后命令没有输出错误并正常返回 PowerShell 提示符，类型检查通过。

### Biome 检查

执行 `npm.cmd run check` 未通过。当前仓库存在 Biome schema 版本与 CLI 版本不一致的问题（schema 2.4.14，CLI 2.5.15），并报告已有配置弃用、规则警告和格式问题。

本次没有运行自动修复或迁移，也没有借此修改无关文件。因此目前不能记录为全仓库 Biome 检查通过。

### 构建

本次功能改动后的 `npm.cmd run build` 已成功完成：编译成功、TypeScript 检查完成，并生成 91 个静态页面。构建过程中有 4 条来自现有文件的 Turbopack 动态文件系统访问警告，未影响构建成功。

## 8. 浏览器手动验证

开发服务器运行在 `http://localhost:6002`。

实际操作及观察结果：

1. 打开应用；首次未看到面板，强制刷新后面板显示。
2. 导入 `course-fixtures/multi-page.drawio`，确认图表有“流程 A”和“流程 B”两个页面。
3. 点击“检查”，面板报告 1 个缺失名称问题，位置为“流程 B · n2”，并显示页面 ID `page-b`。
4. 点击问题项，编辑器切换到对应页面，并高亮缺失名称的矩形图元。
5. 在图元中补充名称后再次检查，面板显示“检查完成，没有发现缺失名称”。
6. 导出图表成功。
7. 重新打开导出的文件，确认补充的名称仍然存在。

以上验证覆盖了导入、检查、跨页面定位、补充名称、重新检查、导出和重新打开文件的完整操作链。

## 9. 当前状态与后续事项

本周 `missing-label` 的规则核心、文件适配层、开发面板、单元测试和浏览器手动验证已经完成。

提交前仍需：
- 将 `.runtime/` 加入产品仓库 `.gitignore`，避免本地生成的大型临时文件进入版本控制。
- 确认本周报告和 Agent Context 文件已写入产品仓库。
- 检查完整 Git diff 和暂存区内容，确认只包含本周应交付的文件。
- 已在本次改动基础上完成生产构建复验，并记录实际结果。
- 按课程要求创建 PR：base 为个人 fork 的 `course/main`，compare 为 `hw03/first-check`。

目前尚未创建 PR，也尚未提交本周改动。

## 10. PR 信息

目标仓库：`Kzy5-6/next-ai-draw-io_cs146s`

Base：`course/main`

Compare：`hw03/first-check`

PR 描述应说明触发情境、用户可观察到的行为变化、实际执行的自动化测试和构建结果，以及浏览器中的完整验证过程。PR 描述应准确记录本次改动后的构建成功结果及现有警告，不应将警告描述为构建失败。