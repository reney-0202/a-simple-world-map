// world1980 探针注册表（单一事实源）· M2（探针注册收敛）
//
// 探针的「URL 参数令牌 → 查询串 / DOM 标记 / 虚拟时间预算」只在这里声明一次：
//   · 浏览器   app/10-events-save.js 的 CR.probeMode 用 params 判定「当前是不是探针会话」；
//   · 运行器   tools/probe_runner.py 读同一份 entries 驱动 25 个探针；
//   · 校验器   tools/validate 的 checkProbeRegistry 保证 params 与 entries 内部自洽。
// 于是「新增一个探针」只需在本文件加一条 + 在 13-boot.js 加一行 dispatch，
// 不再需要同时改 runner 的字典与两处正则 —— 那两处一旦不同步就会静默失效
// （历史上 blocprobe / decprobe 就是这么死的）。
//
// 注意：params 是**参数令牌**（`?end=1` 的令牌是 `end`），不是探针键（`endprobe`）。
// 二者不必相同，但必须由 entries 的 qs 前缀唯一推导出来 —— 校验器会强制这一点。
window.W1980_PROBES={
 "params": [
  "selftest",
  "simprobe",
  "saveprobe",
  "end",
  "sanprobe",
  "decprobe",
  "bloc",
  "flprobe",
  "warprobe",
  "groundwarprobe",
  "resprobe",
  "tradeprobe",
  "embargoprobe",
  "aiprobe",
  "econai",
  "summitprobe",
  "unscprobe",
  "panelprobe",
  "newsprobe",
  "chronicleprobe",
  "domesticprobe",
  "agendaprobe",
  "crisisprobe",
  "intelprobe",
  "afghanprobe",
  "prestigeprobe",
  "nukeprobe",
  "estprobe",
  "warai",
  "ideoprobe",
  "fuseprobe",
  "poleconprobe",
  "soundprobe",
  "assetsprobe"
 ],
 "entries": {
  "selftest": {
   "qs": "selftest=1",
   "marker": "SELFTEST",
   "budget": 30000,
   "class": "history"
  },
  "simprobe": {
   "qs": "simprobe=1",
   "marker": "SIMPROBE",
   "budget": 60000,
   "class": "history"
  },
  "saveprobe": {
   "qs": "saveprobe=1",
   "marker": "SAVEPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "endprobe": {
   "qs": "end=1&t=1991-12",
   "marker": "ENDPROBE",
   "budget": 60000,
   "class": "history"
  },
  "sanprobe": {
   "qs": "sanprobe=1&player=SUN&mil=3.5",
   "marker": "SANPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "decprobe": {
   "qs": "decprobe=1&player=USA",
   "marker": "DECPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "blocprobe": {
   "qs": "bloc=WP&player=DEU",
   "marker": "BLOCPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "flprobe": {
   "qs": "flprobe=1",
   "marker": "FLPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "groundwar": {
   "qs": "groundwarprobe=1",
   "marker": "GROUNDWARPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "warprobe": {
   "qs": "warprobe=1",
   "marker": "WARPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "resprobe": {
   "qs": "resprobe=1",
   "marker": "RESPROBE",
   "budget": 30000,
   "class": "mechanics"
  },
  "tradeprobe": {
   "qs": "tradeprobe=1",
   "marker": "TRADEPROBE",
   "budget": 30000,
   "class": "mechanics"
  },
  "embargo": {
   "qs": "embargoprobe=1",
   "marker": "EMBARGOPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "aiprobe": {
   "qs": "aiprobe=1",
   "marker": "AIPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "econai": {
   "qs": "econai=1",
   "marker": "ECONAIPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "summitprobe": {
   "qs": "summitprobe=1",
   "marker": "SUMMITPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "unscprobe": {
   "qs": "unscprobe=1",
   "marker": "UNSCPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "panelprobe": {
   "qs": "panelprobe=1",
   "marker": "PANELPROBE",
   "budget": 30000,
   "class": "mechanics"
  },
  "newsprobe": {
   "qs": "newsprobe=1",
   "marker": "NEWSPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "chronicle": {
   "qs": "chronicleprobe=1",
   "marker": "CHRONICLEPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "domestic": {
   "qs": "domesticprobe=1",
   "marker": "DOMESTICPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "agenda": {
   "qs": "agendaprobe=1",
   "marker": "AGENDAPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "crisis": {
   "qs": "crisisprobe=1",
   "marker": "CRISISPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "intel": {
   "qs": "intelprobe=1",
   "marker": "INTELPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "afghan": {
   "qs": "afghanprobe=1",
   "marker": "AFGHANPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "polecon": {
   "qs": "poleconprobe=1",
   "marker": "POLECONPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "prestige": {
   "qs": "prestigeprobe=1",
   "marker": "PRESTIGEPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "nuke": {
   "qs": "nukeprobe=1",
   "marker": "NUKEPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "est": {
   "qs": "estprobe=1",
   "marker": "ESTIMATESPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "warai": {
   "qs": "warai=1",
   "marker": "WARAIPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "ideo": {
   "qs": "ideoprobe=1",
   "marker": "IDEOLOGYPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "fuse": {
   "qs": "fuseprobe=1",
   "marker": "FUSEPROBE",
   "budget": 60000,
   "class": "mechanics"
  },
  "soundprobe": {
   "qs": "soundprobe=1",
   "marker": "SOUNDPROBE",
   "budget": 30000,
   "class": "mechanics"
  },
  "assetsprobe": {
   "qs": "assetsprobe=1",
   "marker": "ASSETSPROBE",
   "budget": 30000,
   "class": "mechanics"
  }
 }
};
