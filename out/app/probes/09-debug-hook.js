"use strict";


// 验证钩子：?pan=<dx>,<dy> 可重复（等价于鼠标拖动），?selftest 由外部触发
// G（收尾评审）：本对象是全站唯一的调试挂接 —— 运行期错误经 __errors 暴露
//（数组由 probes/01-selftest.js 的 DBG_ERRORS 提供，此处仅引用同一数组）。
window.__W1980 = { view: view, render: render, drawOverlay: drawOverlay, drawMini: drawMini,
  zoomAt: zoomAt, maps: maps, ST: ST, setMode: setMode, sig: mapSig,
  __errors: DBG_ERRORS,
  // F（快赢/CI）：阵营相关的测试钩子 —— blocprobe 需要直接验证「着色真值源」
  // （tables.bloc）而不依赖画布读回；setBloc/blocOf/rebuildBlocTable 供探针与
  // CDP 诊断复用。
  setBloc: setBloc, blocOf: blocOf, rebuildBlocTable: rebuildBlocTable,
  tables: tables, getBakedNow: () => bakedNow, hasFrontlines: () => hasFrontlines,
  sim: SIM, simVal: simVal, simFastForward: simFastForward, simTogglePlay: simTogglePlay, simReset: simReset,
  simSave: simSave, simLoad: simLoad,
  simAtEnd: simAtEnd, endStats: endStats, simEndOpen: simEndOpen, simEndClose: simEndClose,
  setFrontline: setFrontline, clearFrontlines: clearFrontlines, rebuildFrontlinesMap: rebuildFrontlinesMap,
  updateTimelineFrontlines: updateTimelineFrontlines, flMap: flMap,
  getInterventionScore: getInterventionScore, refreshWarBox: refreshWarBox,
  runResProbe: runResProbe, refreshResBox: refreshResBox,
  runTradeProbe: runTradeProbe, refreshTradeBox: refreshTradeBox, getTradeFlows: getTradeFlows,
  runEmbargoProbe: runEmbargoProbe, calcResourcePenalty: calcResourcePenalty, getRouteStatus: getRouteStatus,
  runAIProbe: runAIProbe, refreshAIBox: refreshAIBox, updateAIDecisions: updateAIDecisions,
  openSummitModal: openSummitModal, closeSummitModal: closeSummitModal, signTreaty: signTreaty, walkoutSummit: walkoutSummit, runSummitProbe: runSummitProbe,
  openUNSCModal: openUNSCModal, closeUNSCModal: closeUNSCModal, voteUNSC: voteUNSC, executeResolution: executeResolution, runUNSCProbe: runUNSCProbe,
  setPanelTab: setPanelTab, updatePanelTabBadges: updatePanelTabBadges, refreshOverviewCard: refreshOverviewCard, runPanelProbe: runPanelProbe,
  openNewsModal: openNewsModal, closeNewsModal: closeNewsModal, runNewsProbe: runNewsProbe,
  generateEpilogue: generateEpilogue, generateChronicle: generateChronicle, exportMemoirs: exportMemoirs, copyMemoirs: copyMemoirs, setEndTab: setEndTab, runChronicleProbe: runChronicleProbe,
  initDomesticState: initDomesticState, updateDomesticPolitics: updateDomesticPolitics, refreshDomesticBox: refreshDomesticBox, applyDomesticPlayerAction: applyDomesticPlayerAction, runDomesticProbe: runDomesticProbe,
  initAgendaState: initAgendaState, getAgendaState: getAgendaState, startAgenda: startAgenda, updateMonthlyAgendas: updateMonthlyAgendas, refreshAgendaBox: refreshAgendaBox, runAgendaProbe: runAgendaProbe,
  initCrisisState: initCrisisState, sanitizeCrisisState: sanitizeCrisisState, openCrisisModal: openCrisisModal, hideCrisisModal: hideCrisisModal, closeCrisisModal: closeCrisisModal, resolveCrisis: resolveCrisis, updateMonthlyCrises: updateMonthlyCrises, runCrisisProbe: runCrisisProbe,
  initIntelState: initIntelState, sanitizeIntelState: sanitizeIntelState, updateMonthlyIntel: updateMonthlyIntel, executeCovertAction: executeCovertAction, refreshCovertBox: refreshCovertBox, runIntelProbe: runIntelProbe,
  initAfghanState: initAfghanState, sanitizeAfghanState: sanitizeAfghanState, updateMonthlyAfghan: updateMonthlyAfghan, setAfghanPolicy: setAfghanPolicy, refreshAfghanBox: refreshAfghanBox, runAfghanProbe: runAfghanProbe,
  refreshSoundBtn: refreshSoundBtn, toggleSoundMute: toggleSoundMute, runSoundProbe: runSoundProbe,
  refreshLeaderCard: refreshLeaderCard, runAssetsProbe: runAssetsProbe,
  decSet: decSet, sanctionSet: sanctionSet, aidSet: aidSet, setPlayer: setPlayer, setMil: setMil, select: select, entKeys: entKeys, applyPlayerDecisions: applyPlayerDecisions,
  panBy: (dx, dy) => { view.x -= dx / view.s; view.y -= dy / view.s; clampView(); render(); drawOverlay(); drawMini(); } };
