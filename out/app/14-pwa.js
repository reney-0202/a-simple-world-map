"use strict";
// J2 + O1（平台与生成物）：PWA 离线支持 —— 注册 Service Worker（out/sw.js）。
//
// 历史背景：最初只在「查询串为空」时注册，为的是让 CI 的无头探针走纯网络路径
// （SW 的 install/activate/缓存生命周期会和 --virtual-time-budget 的虚拟时钟交互，
// 使探针时序不确定）。代价是：任何带参数的深链（`?player=SUN`、`?m=pop` …）都会
// **静默失去离线能力**，而且没有任何提示。
//
// O1 把开关从「有没有查询串」改成「这是不是探针/诊断会话」：
//   · 探针参数令牌来自 data/probes.js（与运行器、CR.probeMode 同一份单一事实源），
//     所以探针 URL 一定不会注册 SW —— 保住了时序确定性这条硬约束；
//   · 普通深链（?player= / ?mil= / ?c= / ?m= …）现在照常获得离线能力；
//   · ?sw=1 强制注册、?nosw=1 强制不注册（调试与自动化验证用）。
(function () {
  if (!("serviceWorker" in navigator)) return;
  // SW 需要 http/https；file:// 直接打开时跳过
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  const q = location.search || "";
  const has = function (token) {
    return new RegExp("[?&]" + token + "(=|&|$)").test(q);
  };
  if (/[?&]nosw=1\b/.test(q)) return;                       // 强制不注册
  const force = /[?&]sw=1\b/.test(q);                       // 强制注册

  // 探针/诊断会话：不缓存，保证无头时序确定
  const reg = window.W1980_PROBES;
  const probeParams = (reg && Array.isArray(reg.params)) ? reg.params : [];
  // 这三个不是探针，但都是「正在诊断」的开关：缓存会让人看到旧文件，反而更难查
  const diagnosticParams = ["dev", "audit", "modeprobe"];
  let isProbeSession = false;
  for (let i = 0; i < probeParams.length && !isProbeSession; i++) isProbeSession = has(probeParams[i]);
  for (let i = 0; i < diagnosticParams.length && !isProbeSession; i++) isProbeSession = has(diagnosticParams[i]);

  if (!force && isProbeSession) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (r) {
      // 新版本就绪后自动接管，避免用户停留在旧缓存
      if (r && r.waiting) r.waiting.postMessage({ type: "SKIP_WAITING" });
    }).catch(function (e) {
      if (window.console && console.warn) console.warn("[world1980] Service Worker 注册失败：" + (e && e.message));
    });
  });
})();
