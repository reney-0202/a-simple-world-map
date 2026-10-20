# a-simple-world-map

## 运行方式

双击 `out/打开地图.bat`，或在 `out` 目录下运行：

```bash
python serve.py
```

然后在浏览器访问提示的本地地址即可。

## 自动化校验

仓库自带三道校验，CI（`.github/workflows/ci.yml`）会在每次 push / PR 时执行。

### 1. 数据层契约（Node）

```bash
node tools/validate_data.js out            # 人类可读的逐项结果，exit 1 表示有违约
node tools/validate_data.js out --json     # 机器可读结果（CI 会上传为 artifact）
node tools/validate_data.js out --report   # 54 实体 × 数据面覆盖矩阵
node tools/validate_data.js out --quiet    # 只打印问题 / OK 行
```

把 `data/` 与 `engine/` 的脚本载入同一作用域，校验跨模块外键与词表。检查项按类别
拆成 `tools/validate/checks.js` 里的独立函数（每类一个），因此可以脱离浏览器与 `out/`
单独测试：

- 54 可玩实体 / 133 成员双地址空间：crises、events、crossroads、agendas、intel、ai、resources 中出现的实体键必须可解析；
- `INIT_RESERVES` 必须覆盖全部 54 个可玩实体（且不含未知实体）；
- `BASELINE_ROUTES` 的 from/to 必须可解析；
- **巴统管制与咽喉航道**：`embargo.COCOM` 的阵营必须属于 `BLOC` 词表、`restrictedRes` 必须属于资源词表，`CHOKEPOINTS[*].affectedRoutes` 必须指向真实航线，`defaultState` 必须存在于自己的 `states`；
- **栅格完整性摘要**：`checksum.json` / `countries.js` 里的 `sha256_province_id_png` 必须与实际 PNG 字节一致（两处副本也必须互相一致）；
- 事件效果键必须属于 `data/effects.js` 的词表（28 个合法键），站点来自 crises / agendas / **`UNSC_RESOLUTIONS`**；
- AI 主动战略目标（`STRATEGIC_OBJECTIVES`）的属主与 target 必须可解析；
- **议程门控词表**：每个议程的 `condition` 必须是 `data/agenda-conditions.js` 登记过的名字
  （`mil_le_3` / `mil_le_1` / `mil_ge_5` / `domestic_faction`），且 `domestic_faction` 必须带完整
  `faction` 声明（`key` + `lead`/`over` 或 `field`/`min`）。写错一个名字 = 构建期失败，
  而不是「门控静默放行」；
- **议程完成回馈字段**：`onComplete: {字段: 增量}` 里的字段名同样必须在同一份词表里登记
  （完成议程时的内政回馈完全由数据声明，引擎不再按国家名/议程 id 分支）；
- 巨型边界数据（`data/borders_*.json`）的结构与量程。

### 1a. 导出结构对账（pipeline ↔ 产物）

```bash
node tools/check_export_schema.js out
```

`out/data/provinces.js` / `countries.js` 由备份仓的 `pipeline/` 生成，两侧是同一事实的两份拷贝。
完整重跑 pipeline 需要十几 GB 原始栅格（`work/` 未入库），CI 里做不到，所以这道门守的是可验证的那一半：

- 发布的产物字段集必须等于 `pipeline/export-schema.json`（结构契约，随备份仓提交）；
- `pipeline/s5_meta.py` 里 `pj.append({...})` / `t.update({...})` 仍在写这些字段。

任何一方单独改动都会失败，必须显式更新契约 —— 这是刻意的：改动要有意识，不要静默漂移
（`has_capital` 当初就是这么留下来的）。主仓没有 `pipeline/`，此步打印 `SKIP` 并 exit 0。

### 1a2. Service Worker 预缓存清单（Node）

```bash
node tools/sw_manifest.js out            # 校验：与磁盘不一致 → exit 1
node tools/sw_manifest.js out --update   # 按磁盘重写 sw.js 的 PRECACHE
```

`out/sw.js` 的 `PRECACHE` 是生成物，排除项只有 `sw.js` / `serve.py` / `打开地图.bat` 三个
（都写明了理由）。新增或删除任何发布文件后不重新生成就会构建失败 ——
离线缓存与发布文件集再也不会悄悄错位。

`CACHE_VERSION` **不在**该脚本职责内：清单只反映文件集合，改内容是改不出来的，
所以内容变更后仍然必须手动 bump（否则用户会一直吃到旧缓存）。

### 1b. 校验器自身的单元测试（Node，无依赖）

```bash
node tools/validate.test.js
```

每个检查函数都对着合成数据跑「干净 → 无问题」与「故意改坏 → 必须报错」两个方向。
**一个无法被弄失败的检查不是检查** —— `embargo.COMCOM`（数据键实为 `COCOM`）与
`AI_DOCTRINES`（根本没有 effects）两处扫描正是因此静默失效了很久，现在由这些用例兜住。

### 1c. 效果词表的运行期双保险

`data/effects.js` 除了是构建期的事实源，还在浏览器里自查：

- `W1980_EFFECTS.report(label, effects)` —— 各消费点（危机卡 / 议程加成 / 安理会决议）
  登记表外键，同一站点只记一次；
- `W1980_EFFECTS.auditData()` —— 一次遍历数据里**声明过的每个** effects 站点，
  覆盖本局从未触发的分支；
- 违规写入 `W1980_EFFECTS.violations`，`domesticprobe` 断言其为空；
  探针 / `?dev=1` 下同时 `console.error`。

于是「数据里拼错一个效果键」在构建期（CI 判失败）和运行期（探针判失败）都会暴露，
而不是静默无效。

### 2. 无头探针（Python + Chromium）

游戏内置 25 个自检探针（`?selftest=1`、`?simprobe=1` …），每个会渲染一个隐藏的
`<div id="…probe">MARKER {json}</div>`。运行器用 Chromium 系浏览器
（Edge / Chrome / Chromium，可用 `W1980_BROWSER` 指定）以 `--headless=new --dump-dom`
抓取并判定：

**探针注册表是单一事实源**：`out/data/probes.js` 声明每个探针的
「URL 参数令牌 → 查询串 / DOM 标记 / 虚拟时间预算」，三处消费者读同一份文件：

| 消费者 | 用途 |
| --- | --- |
| `app/10-events-save.js` | `CR.probeMode`（探针会话判定）用 `params` |
| `app/13-boot.js` | 18 个普通探针走「令牌 → 运行函数」分派表；启动时自检令牌已登记 |
| `tools/probe_runner.py` | 用 `entries` 驱动 25 个探针；启动前自检 `params` 与 `entries` 自洽；`cmp --class=…` 按类别设门 |
| `tools/validate/checks.js` | `checkProbeRegistry` 在 CI 里校验注册表内部一致性（含 `class` 合法性） |

于是**新增一个普通探针只需两处**：`data/probes.js` 加一条 + `13-boot.js` 分派表加一行。
参数不对会立刻失败，而不是静默不跑：

- 运行器侧：`PROBE REGISTRY INVALID (data/probes.js): registry.entries has probes missing from params: domesticprobe`（退出 2）
- 浏览器侧：`探针分派表里的 ghostprobe 未在 data/probes.js 的 params 中登记`（抛错 → 启动错误面板）

注意 `params` 是**参数令牌**而非探针键：`?end=1` 的令牌是 `end`（探针键是 `endprobe`），
`?bloc=WP` 的令牌是 `bloc`（键是 `blocprobe`）。校验器强制二者由 `qs` 前缀唯一推导。

```bash
# 跑全部探针，任一失败即非零退出
python tools/probe_runner.py run out tools/probe-results.json

# 每个探针携带多少条断言（可审计的覆盖表）
python tools/probe_runner.py count tools/probe-results.json
python tools/probe_runner.py count tools/probe-results.json --json

# 与仓库内基线逐值比对（时间类字段与画布哈希除外）
python tools/probe_runner.py cmp tools/baseline-probes.json tools/probe-results.json

# 只看「史实轨迹」这一类（CI 硬门，必须 identical）
python tools/probe_runner.py cmp tools/baseline-probes.json tools/probe-results.json --class=history
```

只跑指定探针：

```bash
python tools/probe_runner.py run out tools/probe-results.json simprobe saveprobe
```

退出码：`run` 为 0 表示全部通过、1 表示有失败/缺失/异常；`cmp` 为 0 表示一致、
2 表示存在差异或**断言数减少**；`count` 恒为 0（只报告）。

**探针分两类**（`data/probes.js` 每个 entry 的 `class` 字段），因为它们语义不同：

| 类别 | 探针 | 语义 | 允许变吗 |
| --- | --- | --- | --- |
| `history` | `selftest`、`simprobe`、`endprobe` | 无玩家、旁观跑 1980→1991 的史实轨迹 | **绝不**。`cmp --class=history` 是 CI 硬门 |
| `mechanics` | 其余 22 个（含 `saveprobe`） | 主动设玩家、篡改状态来验证某个子系统 | **应当**，当机制被有意改变时 |

混为一谈的代价很具体：任何真玩法改动都只能默认关闭，于是玩家默认体验永远不能变好。
所以 CI 跑两道门 —— `--class=history` **必须 identical**（红灯即阻塞），
全量 `cmp` 打印每一处差异供 review（`continue-on-error`，不阻塞）。
断言塌缩门在两道门里都生效，覆盖不放松。

**断言塌缩自动门**：`cmp` 除了逐值比对，还会比较每个探针的**断言条数**。
删掉一条断言（哪怕整个探针仍然 "绿"）会让 `cmp` 退出 2 并打印：

```
ASSERTION COLLAPSE (1 probe(s)):
  domestic: 116 -> 115 assertions
  total (all probes): 854 -> 853
  lost: domestic/initDomesticStateExists
```

这是因为「跑绿」不等于「还在测原来的东西」——重构时静默丢一条断言，套件依然全绿，
但保证已经缩小。断言**增加**不算失败（新覆盖是常态）。当前总量：25 个探针 / 854 条断言。

**基线维护**：`tools/baseline-probes.json` 是回归基准。有意改变仿真数值时，
先确认探针全绿，再用新结果覆盖基线并一并提交：

```bash
python tools/probe_runner.py run out tools/baseline-probes.json
```

注意：`mechanics` 类探针的差异**不一定要更新基线** —— 先在提交信息里逐条解释，
再决定是「这次改动是对的，更新基线」还是「这是漂移，回退」。`history` 类的差异
永远只有一种解释：这是 bug。

## 发布包体积

`out/` 就是发布包（Pages 上传的 artifact 就是这个目录），当前约 **3.25 MiB**，上限 3.5 MiB。
压缩只在**不改变运行时可见结果**的前提下做，每一项都实测过：

| 资源 | 处理 | 依据 |
|---|---|---|
| `data/country_id.png` | RGBA → 8 位调色板（**无损**：按精确 RGBA 值建表，135 色） | 浏览器 canvas 解码后逐字节与原始一致（`tools/cdp_id_raster_check.js`） |
| `assets/portraits/*.jpg` | 312×420 → 184×248，quality 88 | 屏显只有 76×102 CSS px（2× DPR 下 152×204），实测 PSNR ≥ 32.5 dB |
| `assets/ui/stamp_*.png` | 256 色调色板，**保持原始尺寸** | 缩小带直通 alpha 的美术会在浏览器合成时产生边缘光晕；仅量化后 PSNR ≥ 42 dB |
| `assets/pwa/icon-*.png` | 256 色调色板，**保持 192/512 尺寸** | manifest 声明了尺寸，量化后 PSNR ≥ 45 dB |

`data/province_id.png`（337 KB，最大单文件）**不动**：它的 2999 个 ID 装不进 256 色调色板，
而它的解码结果有 `nonzero` / `idSum` 校验，改动风险高于收益。

`data/provinces.js` 里从未被读取的字段已删除：`has_capital`（−59,827 B，界面首都金星走
`data/countries.js` 的 `capital_px`），以及 P0/P2 时清理的 `px`（2998 条 × 约 9 B）、冗余
`id`（键本身就是 id）与 `cities.js` 的第 5 个元素（1856 条首都标记，同样从未被读，
首都星是从 `countries.capital_px` 画的）—— 合计 −61,870 B，全部 27 个探针逐位不变
（含地图签名哈希）。

**这道护栏现在是自动的**：`tools/validate/checks.js` 的 `checkBundleHygiene` 在 CI 里
① 断言 `out/` ≤ 3.5 MiB，② 断言每条省份记录只携带 `PROVINCE_FIELDS` 声明的六个字段，
③ 断言每条城市记录是 `CITY_ARITY`（4）元组。
后两条尤其重要 —— 这两张表都是导出管线生成的，一个没人读的字段可以随几千条记录
静默漂很久，任何测试都看不见（`px` / `id` / 首都标记就是这么活下来的）。
新增字段必须是一次**有意识的**改动。

**预算的语义**：3.5 MiB = 当前体积 + 约 10% 余量。它的职责是抓**意外膨胀**
（未压缩的图片、重复的数据文件），不是配给功能 —— 每次加功能都触发的门，
最后一定会被人绕过去。Phase F（威望竞赛，一个完整子系统）把它从 3.2 推到 3.5，
是在加功能的那次提交里显式做出的决定。

**验收方式**：任何资源改动后跑一遍

```bash
node tools/cdp_id_raster_check.js out <改动前的备份目录>   # 栅格解码逐字节比对
python tools/probe_runner.py cmp tools/baseline-probes.json tools/probe-results.json
```

## 部署与 PWA

`out/` 是纯静态目录，无构建步骤，可直接托管。

- **GitHub Pages**：`.github/workflows/pages.yml` 在 `main` 分支推送时把 `out/` 发布到
  Pages（需在仓库设置里把 Pages 的 Source 设为「GitHub Actions」）。站点地址形如
  `https://<owner>.github.io/<repo>/`。
- **离线（PWA）**：`out/manifest.webmanifest` 声明应用元信息，`out/sw.js` 在安装时
  预缓存全部发布文件（当前 95 项），之后以 cache-first 提供，断网也能启动。
  `PRECACHE` 由 `node tools/sw_manifest.js out --update` 从 `out/` 实际文件集生成，
  CI 用 `node tools/sw_manifest.js out` 校验一致性 —— **新增/删除发布文件后不重新生成就构建失败**。
  注意 `CACHE_VERSION` 仍需手动 bump：清单只反映文件**集合**，改内容是改不出来的。

### PWA 注册的开关条件

Service Worker 在**正常访问时一律注册**，只有「探针 / 诊断会话」才跳过：

| URL | 是否注册 SW | 说明 |
| --- | --- | --- |
| `/`（裸地址） | ✅ | 常规入口 |
| `?player=SUN`、`?c=CHN`、`?m=pop` … | ✅ | 普通深链（O1 之前会被误判成探针而丢掉离线能力） |
| `?sw=1` | ✅ | 强制注册（验证 PWA 用） |
| `?nosw=1` | ❌ | 强制不注册（调试 / 自动化验证用） |
| `?domesticprobe=1`、`?selftest=1`、`?end=1&t=…`（任何已登记探针参数） | ❌ | 探针必须走纯网络路径 |

判定依据是 `data/probes.js` 的 `params`（与运行器、`CR.probeMode` 同一份事实源），
所以**新增探针自动获得这条保护**，不需要再改 PWA 代码。另有 `dev` / `audit` / `modeprobe`
三个诊断开关同样跳过注册 —— 正在查问题时命中旧缓存只会让问题更难查。

原因：CI 的无头探针用 `--dump-dom` + `--virtual-time-budget` 运行，Service Worker 的
install/activate/缓存生命周期会与虚拟时钟交互、使探针时序不确定。实测 10 种 URL 的注册行为
见 `files/cdp_pwa.js`（O1 验收脚本，全部通过）。

## 后续迭代路线

完整的项目评审与后续路线见 **[`docs/ROADMAP.md`](docs/ROADMAP.md)**。

摘要：项目已完成 A–O 十五轮迭代，四道护栏（数据契约 / 效果词表 / 存档迁移 / 跨平台探针）齐备，
七大国全部跑通「外部压力 → 内政天平 → 议程门控 → 完成回馈」的闭环。L–O 五个阶段全部交付：

| 阶段 | 主题 | 状态 | 内容 |
| --- | --- | --- | --- |
| **L** | 参与感与战略灵活性 | ✅ | 政治资本行动预算（稀缺化所有施政动作）+ 47 个通用实体获得 3 条施政路线 + 施政方针三选一（均衡/强硬/改革）+ 国家战略指令板（6 选 2 的跨年度目标） |
| **M** | 卫生与闸门 | ✅ | `07-domestic.js` 2995 → 1279 行（拆成 domestic / agency / agenda / crisis 四模块）；`08-covert.js` 1074 → 845；探针注册收敛为单一事实源 `data/probes.js`；议程门控词表 `data/agenda-conditions.js`；断言塌缩自动门 |
| **N** | 契约一致性 | ✅ | 议程完成回馈改为数据声明式 `onComplete`（引擎不再按国家/议程 id 分支）；导出结构对账 `tools/check_export_schema.js`（产物 ↔ pipeline 契约） |
| **O** | 平台与生成物 | ✅ | PWA 深链注册修复（`?player=SUN` 恢复离线能力，探针仍不注册）；`sw.js` 预缓存清单由 `tools/sw_manifest.js` 生成 + CI 校验 |
| **P0** | 基线分层 | ✅ | 探针按语义分成 `history`（3，史实轨迹，CI **硬门**）与 `mechanics`（23，机制，差异需解释）；发布包死字段清理（`px` + 冗余 `id`，−58 kB）+ 体积/生成记录字段自动门 |
| **P1** | 账单到期（经济 → 政治） | ✅ | 全游戏第一条**双向**边：增长相对**国民预期**的落差 → 执政路线被问责 → 动荡 → 施政拖累。`data/polecon.js`（54 实体史实锚）+ `app/07d-polecon.js`；修 `growthOf` 单位 bug（`0.025` 实为 0.025%）；27 个探针 / 945 条断言 |
| **P2** | AI 睁眼（经济 → AI） | ✅ | `worldState` 首次携带全体实体只读经济快照；10 条经济目标（纾困破产盟友 / 对破产对手趁火打劫 / 枪炮 vs 黄油 / 能源对冲）；**修负向军费目标的死代码**（负 delta 此前永远不生效）；`?econai=1` 32 条断言 |
| **F** | 威望竞赛 | ✅ | 冷战的第三轴：**位置性、会衰减、可争夺**的威望。13 起史实威望事件（史实梯子 = 你要对抗的对手）+ 6 项工程（花政治资本、拖累 GDP、有当众失败风险）+ 第三世界按威望漂移阵营。`?prestigeprobe=1` 67 条断言 |
| **D** | 地面战争 | ✅ | 三场局部战争从**日期状态机**变成可争夺战局：`control`（史实基线 + 偏离）、5 项作战方针、消耗/厌战、胜负改写威望并清空战线。**只对偏离史实的代价计费**（历史总代价已在校准曲线里）。`?groundwarprobe=1` 65 条断言 |
| **N1** | 核风险轴 | ✅ | 6 个「展示用」效果键全部接上真实消费者（display-only **6 → 0**）：升级（危机阶梯/张力/战争/条约）+ 威慑可信度（军费/威望落差/同盟）→ 月误判概率 → 事故三选一 → DEFCON 1 连持 3 月 = 核战争终局。`?nukeprobe=1` 65 条断言；30 探针 / 1142 条断言 |

后续如需继续，方向见 `docs/ROADMAP.md` 末尾的「后续可选方向」。

