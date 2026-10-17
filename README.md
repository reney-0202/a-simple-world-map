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
- 巨型边界数据（`data/borders_*.json`）的结构与量程。

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

```bash
# 跑全部探针，任一失败即非零退出
python tools/probe_runner.py run out tools/probe-results.json

# 与仓库内基线逐值比对（时间类字段与画布哈希除外）
python tools/probe_runner.py cmp tools/baseline-probes.json tools/probe-results.json
```

只跑指定探针：

```bash
python tools/probe_runner.py run out tools/probe-results.json simprobe saveprobe
```

退出码：`run` 为 0 表示全部通过、1 表示有失败/缺失/异常；`cmp` 为 0 表示一致、
2 表示存在差异。

**基线维护**：`tools/baseline-probes.json` 是回归基准。有意改变仿真数值时，
先确认探针全绿，再用新结果覆盖基线并一并提交：

```bash
python tools/probe_runner.py run out tools/baseline-probes.json
```

## 发布包体积

`out/` 就是发布包（Pages 上传的 artifact 就是这个目录），当前约 **3.13 MiB**，目标上限 3.2 MiB。
压缩只在**不改变运行时可见结果**的前提下做，每一项都实测过：

| 资源 | 处理 | 依据 |
|---|---|---|
| `data/country_id.png` | RGBA → 8 位调色板（**无损**：按精确 RGBA 值建表，135 色） | 浏览器 canvas 解码后逐字节与原始一致（`tools/cdp_id_raster_check.js`） |
| `assets/portraits/*.jpg` | 312×420 → 184×248，quality 88 | 屏显只有 76×102 CSS px（2× DPR 下 152×204），实测 PSNR ≥ 32.5 dB |
| `assets/ui/stamp_*.png` | 256 色调色板，**保持原始尺寸** | 缩小带直通 alpha 的美术会在浏览器合成时产生边缘光晕；仅量化后 PSNR ≥ 42 dB |
| `assets/pwa/icon-*.png` | 256 色调色板，**保持 192/512 尺寸** | manifest 声明了尺寸，量化后 PSNR ≥ 45 dB |

`data/province_id.png`（337 KB，最大单文件）**不动**：它的 2999 个 ID 装不进 256 色调色板，
而它的解码结果有 `nonzero` / `idSum` 校验，改动风险高于收益。

`data/provinces.js` 里从未被读取的 `has_capital` 字段已删除（−59,827 B）；
界面上的首都金星走 `data/countries.js` 的 `capital_px`，与省份表无关。

**体积策略已冻结**：`out/` 磁盘体积 ≤ 3.2 MiB 仅作为回归护栏，不再作为优化目标 ——
调色板与缩图已把图片榨干，剩余两个候选方向（`province_id.png` 拆分双 8 位 / 改 16 位灰度）
实测分别为负收益与「只值 22 KB 却要动栅格解码路径」。详见 `docs/ROADMAP.md`。

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
  预缓存全部应用文件（87 项），之后以 cache-first 提供，断网也能启动。
  这两个文件由 `out/` 的文件清单生成，**新增/删除文件后需重新生成 `sw.js`**
  （或改动 `CACHE_VERSION`），否则离线缓存会缺失新文件。

### PWA 注册的开关条件

Service Worker 仅在**地址无查询参数**时注册（或显式 `?sw=1` 强制启用）。
原因：CI 的无头探针使用 `--dump-dom` + `--virtual-time-budget` 运行，而 Service Worker
的安装/缓存生命周期会与虚拟时钟交互、使探针时序不确定；探针一律带查询参数，
因此这条规则从根上保证探针走纯网络路径。带参数的深链（如 `?player=SUN`）不启用离线，
功能不受影响。

> 已知取舍：`?player=SUN` 这类玩家深链会因此丢掉离线能力。这是为了让探针时序确定而做的
> 刻意选择，改进方案见 `docs/ROADMAP.md` 的 N1（把判定从「无查询参数」改为「不含探针参数」）。

## 后续迭代路线

完整的项目评审与后续路线见 **[`docs/ROADMAP.md`](docs/ROADMAP.md)**。

摘要：项目已完成 A–K 十一轮迭代，四道护栏（数据契约 / 效果词表 / 存档迁移 / 跨平台探针）齐备，
七大国全部跑通「外部压力 → 内政天平 → 议程门控 → 完成回馈」的闭环。后续按三个阶段推进：

| 阶段 | 主题 | 风险 | 内容 |
| --- | --- | --- | --- |
| **L** | 卫生与闸门 | 低 | 拆 `07-domestic.js`（2451 行）；探针注册收敛；清死代码；断言塌缩自动门 |
| **M** | 契约一致性 | 中 | 议程完成回馈数据声明式；备份仓 pipeline 双写收敛 |
| **N** | 平台与生成物 | 低 | PWA 深链注册修复；`sw.js` 预缓存清单自动生成 |

L 阶段全部**不改变仿真数值**，是后续改动的干净地基；M 阶段会真正改引擎分派逻辑，
必须等 L 把基线护栏加固之后再动。

