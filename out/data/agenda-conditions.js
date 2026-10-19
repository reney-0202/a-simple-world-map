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
    // 内政天平门控：完全由数据侧的 `ag.faction` 声明驱动，引擎只按声明求值。    //   { key, lead, over }  —— lead 权重必须严格高于 over
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

  // 议程完成回馈可写的内政字段（ON-COMPLETE FIELDS）· N1
  //
  // 完成一项议程时，数据用 `onComplete: { 字段: 增量 }` 声明对「本国」内政状态的回馈。
  // 引擎把它施加到 ST.domestic.<该国> 上并按 0~100 夹取。字段名若拼错，旧行为是
  // 静默无效 —— 与门控名字同类的问题，所以同样登记成词表：
  //   · 构建期：未登记字段名 = 校验失败；
  //   · 运行期：目标国家没有该字段 = 探针断言失败（见 agendaProbeOnCompleteContract）。
  //
  // shape 说明该字段属于哪一类内政模型，仅供阅读与报告用：
  //   major    —— 七大国专属内政（sun/usa/chn/deu/jpn/fra/gbr）
  //   general  —— 通用国家（generals[k]）
  //   both     —— 两类都有
  const ONCOMPLETE_FIELDS = {
    // 通用国家 (generals[k])
    stability: { shape: "general", zh: "民生安定度" },
    legitimacy: { shape: "general", zh: "执政合法性" },
    sanctionStrain: { shape: "general", zh: "制裁压力" },
    // 苏联
    shortage: { shape: "major", zh: "消费品短缺" },
    conservative: { shape: "major", zh: "保守鹰派权重" },
    reformist: { shape: "major", zh: "改革派权重" },
    // 美国
    congressApproval: { shape: "major", zh: "国会支持率" },
    presidentialApproval: { shape: "major", zh: "总统民调" },
    // 中国
    planned: { shape: "major", zh: "计划/国营派权重" },
    dualTrackPrice: { shape: "major", zh: "双轨物价扭曲度" },
    sezMomentum: { shape: "major", zh: "特区开放动能" },
    externalStress: { shape: "major", zh: "外部环境压力" },
    // 西德
    spdApproval: { shape: "major", zh: "社民党支持率" },
    cduApproval: { shape: "major", zh: "基民盟支持率" },
    detenteDepth: { shape: "major", zh: "东西欧缓和深度" },
    natoBurden: { shape: "major", zh: "北约防务分担度" },
    pipelineDependency: { shape: "major", zh: "对苏能源依赖度" },
    energyPressure: { shape: "major", zh: "能源供应压力" },
    // 日本
    exportist: { shape: "major", zh: "出口产业派权重" },
    domesticist: { shape: "major", zh: "内需开放派权重" },
    tradeFriction: { shape: "major", zh: "对美贸易摩擦压力" },
    // 法国
    dirigiste: { shape: "major", zh: "国家干预派权重" },
    rigueur: { shape: "major", zh: "紧缩坚挺派权重" },
    francStrength: { shape: "major", zh: "法郎平价与外部竞争力" },
    externalPressure: { shape: "major", zh: "外部环境压力（法国）" },
    // 英国
    monetarist: { shape: "major", zh: "货币主义派权重" },
    welfarist: { shape: "major", zh: "福利共识派权重" },
    cityStrength: { shape: "major", zh: "金融城与服务业竞争力" },
    inflation: { shape: "major", zh: "通胀压力" },
    // 共享
    unrest: { shape: "both", zh: "社会动荡度" }
  };

  function isOnCompleteField(name) {
    return Object.prototype.hasOwnProperty.call(ONCOMPLETE_FIELDS, name);
  }

  global.W1980_AGENDA_CONDITIONS = {
    CONDITIONS: CONDITIONS,
    isRegistered: isRegistered,
    names: names,
    get: get,
    ONCOMPLETE_FIELDS: ONCOMPLETE_FIELDS,
    isOnCompleteField: isOnCompleteField
  };
})(typeof window !== "undefined" ? window : globalThis);
