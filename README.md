# a-simple-world-map

## 运行方式

双击 `out/打开地图.bat`，或在 `out` 目录下运行：

```bash
python serve.py
```

然后在浏览器访问提示的本地地址即可。

## 自动化校验

仓库自带两道校验，CI（`.github/workflows/ci.yml`）会在每次 push / PR 时执行。

### 1. 数据层契约（Node）

```bash
node tools/validate_data.js out
```

把 `data/` 与 `engine/` 的脚本载入同一作用域，校验跨模块外键与词表：

- 54 可玩实体 / 133 成员双地址空间：crises、events、crossroads、agendas、intel、ai、resources、embargo 中出现的实体键必须可解析；
- `INIT_RESERVES` 必须覆盖全部 54 个可玩实体（且不含未知实体）；
- `BASELINE_ROUTES` 的 from/to 必须可解析；
- 事件效果键必须属于 `data/effects.js` 的词表（28 个合法键）；
- AI 主动战略目标（`STRATEGIC_OBJECTIVES`）的属主与 target 必须可解析；
- 巨型边界数据（`data/borders_*.json`）的结构与量程。

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
