"use strict";
// J2：PWA 离线支持 —— 注册 Service Worker（out/sw.js）。
//
// 为什么只在「无查询参数」时注册：
//   CI 的无头探针使用 --dump-dom + --virtual-time-budget 运行，而 Service Worker
//   的 install/activate/缓存生命周期会与虚拟时钟交互，使探针时序不确定。探针一律
//   带查询参数（?selftest=1 / ?simprobe=1 …），因此这里用「查询串为空」作为
//   PWA 的开关条件 —— 规则简单、可预测，且从根上保证探针跑的是纯网络路径。
//   真实用户从站点根地址进入（无参数）即自动获得离线能力；带参数的深链
//   （?player=SUN 等）只是不启用离线，功能不受影响。
//   需要强制启用时加 ?sw=1（用于验证 PWA 本身）。
(function () {
  if (!("serviceWorker" in navigator)) return;
  // SW 需要 http/https；file:// 直接打开时跳过
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  const q = location.search || "";
  const force = /[?&]sw=1\b/.test(q);
  const bare = q === "" || q === "?";
  if (!bare && !force) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      // 新版本就绪后自动接管，避免用户停留在旧缓存
      if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }).catch(function (e) {
      if (window.console && console.warn) console.warn("[world1980] Service Worker 注册失败：" + (e && e.message));
    });
  });
})();
