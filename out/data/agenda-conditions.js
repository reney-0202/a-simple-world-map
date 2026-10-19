// world1980 议程门控词表（AGENDA CONDITION VOCABULARY）· M3
//
// 背景：agendas.js 里每个议程可以声明 `condition`，引擎（07b-agenda.js 的
// checkAgendaCondition）按名字分支求值。此前这个名字没有任何契约约束 ——
// 写错一个名字（或引擎删了一个分支但数据还在用）会得到「门控永远不生效」的
// 静默放行，而且没有任何测试会失败。
//
// 这里把「合法的门控名字 + 它需要哪些同伴字段」收敛成单一事实源，两个方向都被堵住：
//   · 数据用了未登记的名字 → 构建期（tools/validate 的 checkAgendaConditions）判失败；
//   · 引擎遇到未登记的名字 → 一律**判未通过**并说明原因（fail-closed，绝不默认放行）。
//
// fields：该门控在议程对象上必须另外提供的字段（`ag.<field>`）。
// faction：是否需要 `ag.faction` 声明 —— 若为 true，validator 会进一步要求
//          `faction.key` 以及「lead+over」或「field+min」其中一组。
(function (global) {
  "use strict";

  const CONDITIONS = {
    // 军费阈值：引擎按当前军费占比与固定阈值比较。
    // （这三条的名字自带阈值，故不需要额外字段；改动阈值请改引擎或新增名字。）
    mil_le_3: {
      zh: "国防军费占比 ≤ 3.0%",
      fields: [],
      faction: false
    },
    mil_le_1: {
      zh: "国防军费占比 ≤ 1.0%（专守防卫红线）",
      fields: [],
      faction: false
    },
    mil_ge_5: {
      zh: "国防军费占比 ≥ 5.0%（尖端军备研发）",
      fields: [],
      faction: false
    },
    // 内政天平门控：完全由数据侧的 `ag.faction` 声明驱动，引擎只按声明求值。
    //   { key, lead, over }  —— lead 权重必须严格高于 over
    //   { key, field, min }  —— 该内政字段必须 ≥ min
    domestic_faction: {
      zh: "内政天平门控（派系领先或指标达标）",
      // `faction` 由 validator 单独、更精确地校验（key + lead/over 或 field/min），
      // 因此这里不重复列进 fields。
      fields: [],
      faction: true
    }
  };

  function isRegistered(name) {
    return Object.prototype.hasOwnProperty.call(CONDITIONS, name);
  }

  function names() {
    return Object.keys(CONDITIONS);
  }

  function get(name) {
    return isRegistered(name) ? CONDITIONS[name] : null;
  }

  global.W1980_AGENDA_CONDITIONS = {
    CONDITIONS: CONDITIONS,
    isRegistered: isRegistered,
    names: names,
    get: get
  };
})(typeof window !== "undefined" ? window : globalThis);
