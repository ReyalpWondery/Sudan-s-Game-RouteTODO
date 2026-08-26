# AGENTS.md — 苏丹的游戏 · 线路规划器

> 本文件面向 AI 编码代理，介绍项目的结构、技术栈、运行与测试方式、代码约定。

## 项目概览

基于单机游戏《苏丹的游戏》（Sultan's Game）的**纯前端路线规划器**。帮玩家：

- 按篇章（人物线 / 主线 / 基础篇）把游戏内的任务线加入 TODO，跟踪每个事件的完成/锁定/排除状态；
- 汇总「当前可做」事件列表，完成事件后自动解锁后续线路并自动加入；
- 查询任意一张卡（尤其四品级苏丹卡：杀戮/纵欲/奢靡/征服）可以去哪些事件销掉、哪些未完成任务需要保留它；
- 检测苏丹卡冲突（同类型同品级被过多未完成事件必需时警告）。

项目语言为**简体中文**（README、代码注释、UI 文案、测试输出均为中文），文档与提交信息也用中文。

## 技术栈与运行方式

- **无构建系统、无框架、无打包器**：原生 HTML + CSS + 浏览器端 JavaScript（ES5 风格，`var` + IIFE，无模块系统）。
- 唯一的依赖是 `jsdom`，且**只用于测试**（见下文），运行时不需要 Node。
- **运行**：直接用浏览器打开**仓库根目录**的 `index.html` 即可，无需本地服务器（无 fetch，全部数据内联在 `planner/data.js`）。
- **持久化**：`localStorage`，键为 `sultan_planner_v1`。无网络请求、无遥测。

## 目录结构

```
├── README.md                  # 项目简介
├── index.html                 # 单页入口（根目录，方便 GitHub Pages 部署），按顺序加载 planner/ 下的 data.js → app.js → cardpage.js
├── data/                      # 源数据（JSON，人工整理的游戏攻略数据）
│   ├── achievements.json      #   成就：{groups:[{id,name,items:[{id,name,condition,chapterRefs,eventRefs}]}]}
│   ├── cards_a.json … cards_d.json  # 卡牌图鉴（4 个分片）：{cards:[{name,category,tags,obtain,uses}]}
│   └── chapters/*.json        #   43 个篇章文件，每篇 {id,title,category,characters,routes:[...]}
└── planner/                   # Web 应用本体
    ├── style.css
    ├── data.js                #   生成的数据文件（~1.3MB）：window.GAME_DATA = {chapters, achievements, cards}
    ├── app.js                 #   主逻辑：状态管理、前置解析、渲染、苏丹卡冲突警告；暴露 window.PLANNER
    ├── cardpage.js            #   销卡查询页：依赖 window.PLANNER；暴露 window.CARDPAGE
    └── .test/                 #   Node + jsdom 测试（隐藏目录，有自己的 package.json）
```

## 数据管线（重要）

- `planner/data.js` 由 `gen_data.py` 从 `data/` 下的 JSON **自动生成**——文件头有「请勿手改」注释。
- ⚠️ **`gen_data.py` 当前不在仓库中**（只提交了其产物）。修改攻略数据的正确流程是改 `data/*.json` 再重新生成 `data.js`；如果必须手改 `data.js`（生成脚本缺失时），请保持它与 `data/` 源 JSON 同步。
- 数据规模：43 篇章（33 人物线 / 5 主线 / 5 基础篇）、176 条线路、1440 个事件、3 个成就组、835 张图鉴卡。

### 数据模型速查

- **篇章 chapter**：`{id, title, category: character|main|base, characters[], routes[]}`
- **线路 route**：`{id, name, summary, steps[]}`
- **事件 step**：`{id, name, trigger, desc, prereqs[], slots[], terminal?}`
  - `prereqs` 是**事件名字符串**（不是 id），解析时同篇章同名优先，任一候选完成即满足；
  - `slots` 描述事件卡槽：`{card, sultan, maxGrade, required, consumed, note}`——`sultan:true` 表示可折苏丹卡，`maxGrade` 是允许的最高品级（岩石/青铜/白银/黄金，null 表示不限）。
- **状态**（localStorage）：`{added[], done[], doneAchv[], viewMode{}, doneRoutes[], achvOrder{}, excluded[], relaxed[], everDone[]}`，均为 route/step/成就条目的 id。

## 构建与测试

无构建步骤。测试在 `planner/.test/` 下，用 Node + jsdom 在真实 DOM 上跑整个应用：

```bash
cd planner/.test
npm install        # 只装 jsdom（首次或 package-lock 变化后）
node smoke.js            # 冒烟测试：添加线路、解锁链、撤销、持久化
node features_test.js    # 销卡查询页等特性
node branch_test.js      # 分歧自动排除逻辑
node savestate_test.js   # 存档/完结标记
node achv_test.js        # 成就页
node followup_test.js    # 完成事件后自动加入后续线路
node alimu_repro.js      # 阿里木篇排序复现脚本（诊断用，无 PASS/FAIL 断言，看输出）
```

约定：

- 测试脚本以 `0` 退出码表示全过，非 0 表示有 FAIL；每个用例打印 `PASS/FAIL + 中文名`。
- 改 `app.js` / `cardpage.js` 的逻辑后，**至少跑 `smoke.js` 与相关特性的测试**；建议全部跑一遍（都很快）。
- 当前全部测试通过（Node v24）。

## 代码约定

- **ES5 风格**：`var`、函数表达式、单 IIFE 包裹、`'use strict'`，不用 ES6+ 语法、不用模块化（jsdom 直接 `window.eval` 源码，保持可 eval 很重要）。
- DOM 操作全部手写 `document.createElement`（内部有 `el(tag, cls, text)` 辅助函数），不用 innerHTML 拼用户/数据内容，天然避免 XSS。
- 状态变更统一走 `save(); render();`：每次操作后全量重渲染（数据量小，无需虚拟 DOM）。
- `app.js` 通过 `window.PLANNER` 暴露只读索引与少量操作（`addRoute`、`stepStatus`、`refresh` 等）给 `cardpage.js`；跨脚本通信只用这两个全局对象，不要新增。
- 中文注释集中在关键业务逻辑（分歧排除、完结标记、前置解析）上方；改这些逻辑时同步更新注释。

## 关键业务逻辑（改之前先读懂）

都在 `app.js`：

- **前置解析 `resolvePrereqs`**：前置按名字匹配，同篇章候选优先；被「分歧排除」（relaxed）的候选也视为满足。
- **分歧自动排除 `autoExcludeBranches`**：完成抉择点的一个分支后，同一线路内同前置集合的未选分支自动打删除标（`excluded` + `relaxed`）。
- **完结标记 `toggleRouteDone` / 终结事件 `terminal`**：完结后剩余未完成事件全部排除；移除线路时清空该线的完成/排除/完结记录，但保留「曾完成」（`everDone`）历史。
- **自动加入后续线路 `autoAddFollowups`**：完成事件后，把因此解锁的未添加线路自动加入 TODO 并 toast 提示。
- **苏丹卡冲突 `sultanWarnings`**：同一类型同一品级被 >2 个未完成事件必需（黄金品级 >1）时顶部警告。

## 安全与部署

- 纯静态页面，无后端、无密钥、无外部请求；仓库根目录即完整站点（`index.html` + `planner/`），GitHub Pages 选根目录部署即可，也支持任意静态托管（或直接双击打开）。
- 不要往页面注入 `data.js` 之外的远程脚本；数据来自仓库内 JSON，渲染全部走 `textContent`。
