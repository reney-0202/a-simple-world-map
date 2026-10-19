"use strict";

function runSoundProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("SOUNDPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    const S = window.W1980_SOUND;

    // 1. 模块与核心导出存在性
    assert("soundModuleLoaded", !!S, "W1980_SOUND 模块已加载");
    assert("playHotlineExists", S && typeof S.playHotline === "function", "playHotline 存在");
    assert("playTreatyExists", S && typeof S.playTreaty === "function", "playTreaty 存在");
    assert("playGavelExists", S && typeof S.playGavel === "function", "playGavel 存在");
    assert("playTeletypeExists", S && typeof S.playTeletype === "function", "playTeletype 存在");
    assert("audioContextGetterExists", S && typeof S.getAudioContext === "function", "getAudioContext 存在");

    // 2. 状态与控制器
    assert("setMutedExists", S && typeof S.setMuted === "function", "setMuted 存在");
    assert("isMutedExists", S && typeof S.isMuted === "function", "isMuted 存在");
    assert("setVolumeExists", S && typeof S.setVolume === "function", "setVolume 存在");
    assert("getVolumeExists", S && typeof S.getVolume === "function", "getVolume 存在");
    assert("canPlayExists", S && typeof S.canPlay === "function", "canPlay 存在");
    assert("isProbeOrHeadlessExists", S && typeof S.isProbeOrHeadless === "function", "isProbeOrHeadless 存在");

    // 3. DOM 与 UI 控件集成
    const sBtn = $("b-sound");
    assert("soundButtonInDom", !!sBtn, "#b-sound 按钮存在于 DOM");
    assert("soundButtonInitialIcon", sBtn && (sBtn.textContent === "🔊" || sBtn.textContent === "🔇"), "#b-sound 图标正确渲染");
    assert("toggleSoundMuteExists", typeof toggleSoundMute === "function", "toggleSoundMute 存在");
    assert("refreshSoundBtnExists", typeof refreshSoundBtn === "function", "refreshSoundBtn 存在");

    // 4. 静音逻辑与保护隔离
    S.setMuted(true);
    assert("setMutedTrue", S.isMuted() === true, "setMuted(true) 状态正确");
    if (ST.sound) ST.sound.muted = true;
    refreshSoundBtn();
    assert("uiSyncWhenMuted", sBtn && sBtn.textContent === "🔇" && sBtn.classList.contains("muted"), "静音时 UI 按钮显示 🔇 并增加 muted 类");
    assert("canPlayFalseWhenMuted", S.canPlay() === false, "静音状态下 canPlay() 严格返回 false");

    S.setMuted(false);
    assert("setMutedFalse", S.isMuted() === false, "setMuted(false) 状态正确");
    if (ST.sound) ST.sound.muted = false;
    refreshSoundBtn();
    assert("uiSyncWhenUnmuted", sBtn && sBtn.textContent === "🔊" && !sBtn.classList.contains("muted"), "取消静音时 UI 按钮显示 🔊");
    assert("headlessOrProbeSuppression", S.isProbeOrHeadless() === true, "探针/自动化无头环境下 isProbeOrHeadless 返回 true 保护静音");

    // 5. 音量动态调节与钳位
    S.setVolume(0.8);
    assert("volumeSetValid", Math.abs(S.getVolume() - 0.8) < 0.001, "音量正确设置至 0.8");
    S.setVolume(-0.5);
    assert("volumeClampMin", S.getVolume() === 0.0, "音量下限正确钳位至 0.0");
    S.setVolume(1.8);
    assert("volumeClampMax", S.getVolume() === 1.0, "音量上限正确钳位至 1.0");
    S.setVolume(0.6);
    assert("volumeReset", Math.abs(S.getVolume() - 0.6) < 0.001, "音量重置至基准 0.6");

    // 6. 探针隔离下四大标志性冷战音效无异常静音调用验证
    let threwHotline = false;
    try { S.playHotline(); } catch (e) { threwHotline = true; }
    assert("safeCallHotlineNoThrow", !threwHotline, "playHotline 安全调用无异常抛出");

    let threwTreaty = false;
    try { S.playTreaty(); } catch (e) { threwTreaty = true; }
    assert("safeCallTreatyNoThrow", !threwTreaty, "playTreaty 安全调用无异常抛出");

    let threwGavel = false;
    try { S.playGavel(); } catch (e) { threwGavel = true; }
    assert("safeCallGavelNoThrow", !threwGavel, "playGavel 安全调用无异常抛出");

    let threwTeletype = false;
    try { S.playTeletype(); } catch (e) { threwTeletype = true; }
    assert("safeCallTeletypeNoThrow", !threwTeletype, "playTeletype 安全调用无异常抛出");

    // 7. 存档与读档往返一致性
    assert("stateSoundInitialized", ST.sound && typeof ST.sound.muted === "boolean" && typeof ST.sound.vol === "number", "ST.sound 状态结构完备");
    ST.sound.muted = true;
    ST.sound.vol = 0.35;
    const saveOk = simSave();
    assert("simSaveIncludesSound", saveOk.ok, "simSave 成功序列化包含 sound 字段");

    ST.sound.muted = false;
    ST.sound.vol = 0.9;
    assert("stateTamperedBeforeLoad", ST.sound.muted === false && Math.abs(ST.sound.vol - 0.9) < 0.001, "读档前状态篡改确认");
    const loadOk = simLoad();
    assert("simLoadSucceeds", loadOk.ok, "simLoad 成功执行");
    assert("simLoadRestoresSound", ST.sound.muted === true && Math.abs(ST.sound.vol - 0.35) < 0.001, "simLoad 成功完整往返还原 sound.muted 与 sound.vol");

    // 8. 旁观模式零漂移铁律
    ST.player = null;
    applyPlayerDecisions();
    const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
    assert("observerZeroPmods", pmodsCount === 0, "旁观模式下音效系统零副作用，pmods 保持严格为空 (0 漂移)");

    // 恢复正常默认音效设置
    ST.sound.muted = false;
    ST.sound.vol = 0.6;
    S.setMuted(false);
    S.setVolume(0.6);
    refreshSoundBtn();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "soundprobe"; d.style.display = "none";
  d.textContent = "SOUNDPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// ---- R14: 钢铁雄心4风格时代美术与游戏资源全链路探针 ----
function runAssetsProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ASSETSPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    const A = window.W1980_ASSETS;

    // 1. 资源数据库完备性
    assert("assetsModuleLoaded", !!A, "W1980_ASSETS 模块已就绪");
    assert("leadersDictionaryDefined", A && typeof A.LEADERS === "object", "LEADERS 字典有效");
    assert("leadersCount16Plus", A && Object.keys(A.LEADERS).length >= 16, "覆盖 16+ 个核心国家领袖库");
    assert("newsPhotosDefined", A && typeof A.NEWS_PHOTOS === "object", "NEWS_PHOTOS 字典有效");
    assert("newsPhotosCount8", A && Object.keys(A.NEWS_PHOTOS).length >= 8, "包含 8 大时代新闻历史画报");
    assert("stampsDefined", A && typeof A.UI_STAMPS === "object", "UI_STAMPS 字典有效");
    assert("stampsCount4", A && Object.keys(A.UI_STAMPS).length >= 4, "包含四大冷战公文机密印章");

    // 2. 领袖检索函数与历史更替逻辑
    assert("getLeaderFnExists", typeof A.getLeader === "function", "getLeader 检索函数存在");
    const lCarter = A.getLeader("USA", 1980);
    assert("usaCarter1980", lCarter && lCarter.name === "吉米·卡特", "1980 年美国总统为吉米·卡特");
    const lReagan = A.getLeader("USA", 1985);
    assert("usaReagan1985", lReagan && lReagan.name === "罗纳德·里根", "1985 年美国总统更替为罗纳德·里根");
    const lBush = A.getLeader("USA", 1990);
    assert("usaBush1990", lBush && lBush.name === "乔治·H·W·布什", "1990 年美国总统更替为老布什");

    const lBrezhnev = A.getLeader("SUN", 1980);
    assert("sunBrezhnev1980", lBrezhnev && lBrezhnev.name === "列昂尼德·勃列日涅夫", "1980 年苏联最高领导人为勃列日涅夫");
    const lAndropov = A.getLeader("SUN", 1983);
    assert("sunAndropov1983", lAndropov && lAndropov.name === "尤里·安德罗波夫", "1983 年苏联最高领导人为安德罗波夫");
    const lGorbachev = A.getLeader("SUN", 1987);
    assert("sunGorbachev1987", lGorbachev && lGorbachev.name === "米哈伊尔·戈尔巴乔夫", "1987 年苏联最高领导人为戈尔巴乔夫");

    // 3. 次极大国与区域核心领袖覆盖
    assert("chnDengDefined", A.getLeader("CHN", 1985) && A.getLeader("CHN", 1985).name === "邓小平", "中国改革开放总设计师邓小平就绪");
    assert("gbrThatcherDefined", A.getLeader("GBR", 1982) && A.getLeader("GBR", 1982).name === "玛格丽特·撒切尔", "英国首相撒切尔夫人就绪");
    assert("fraMitterrandDefined", A.getLeader("FRA", 1985) && A.getLeader("FRA", 1985).name === "弗朗索瓦·密特朗", "法国总统密特朗就绪");
    assert("deuKohlDefined", A.getLeader("DEU", 1989) && A.getLeader("DEU", 1989).name === "赫尔穆特·科尔", "西德总理科尔就绪");
    assert("ddrHoneckerDefined", A.getLeader("DDR", 1986) && A.getLeader("DDR", 1986).name === "埃里希·昂纳克", "东德主席昂纳克就绪");
    assert("jpnNakasoneDefined", A.getLeader("JPN", 1985) && A.getLeader("JPN", 1985).name === "中曾根康弘", "日本首相中曾根康弘就绪");
    assert("irnKhomeiniDefined", A.getLeader("IRN", 1980) && A.getLeader("IRN", 1980).name === "鲁霍拉·穆萨维·霍梅尼", "伊朗最高领袖霍梅尼就绪");
    assert("irqSaddamDefined", A.getLeader("IRQ", 1980) && A.getLeader("IRQ", 1980).name === "萨达姆·侯赛因", "伊拉克总统萨达姆就绪");

    // 4. 时代特刊画报与首脑峰会现场照片检索
    assert("newsOilCrashPhoto", A.getNewsPhoto("oil_crash") && !!A.getNewsPhoto("oil_crash").url, "1986 油价暴跌画报有效");
    assert("newsChernobylPhoto", A.getNewsPhoto("chernobyl") && !!A.getNewsPhoto("chernobyl").url, "1986 切尔诺贝利现场画报有效");
    assert("newsBerlinWallPhoto", A.getNewsPhoto("east_europe") && !!A.getNewsPhoto("east_europe").url, "1989 柏林墙倒塌画报有效");
    assert("summitGenevaPhoto", A.getNewsPhoto("geneva_1985") && !!A.getNewsPhoto("geneva_1985").url, "1985 日内瓦峰会现场画报有效");

    // 5. 机密印章检索
    assert("stampTopSecret", A.getStamp("top_secret") && A.getStamp("top_secret").includes("stamp_top_secret.png"), "绝密印章有效");
    assert("stampSovietSecret", A.getStamp("soviet_secret") && A.getStamp("soviet_secret").includes("stamp_soviet_secret.png"), "苏维埃最高机密印章有效");
    assert("stampRatified", A.getStamp("ratified") && A.getStamp("ratified").includes("stamp_ratified.png"), "条约生效印章有效");
    assert("stampVetoed", A.getStamp("vetoed") && A.getStamp("vetoed").includes("stamp_vetoed.png"), "安理会一票否决印章有效");

    // 6. DOM 挂载与动态卡片渲染
    const lCard = $("p-leader-card");
    assert("leaderCardInDom", !!lCard, "#p-leader-card 挂载在概览选项卡");
    refreshLeaderCard("USA");
    assert("leaderCardRenderedUSA", lCard && lCard.style.display !== "none" && lCard.textContent.includes("总统"), "美国总统卡片成功渲染");
    refreshLeaderCard("SUN");
    assert("leaderCardRenderedSUN", lCard && lCard.style.display !== "none" && lCard.textContent.includes("总书记"), "苏联总书记卡片成功渲染");

    // 7. 时代特刊头版画报与印章联动
    openNewsModal("chernobyl");
    const nPhotoBox = $("news-photo-box");
    const nPhotoImg = $("news-photo-img");
    const nStampImg = $("news-stamp-img");
    assert("newsPhotoBoxRendered", nPhotoBox && nPhotoBox.style.display !== "none", "时代特刊画报容器正确展开");
    assert("newsPhotoImgValid", nPhotoImg && !!nPhotoImg.src, "特刊画报 img 拥有有效图片源");
    assert("newsStampImgValid", nStampImg && nStampImg.style.display !== "none", "特刊机密印章正确加盖");
    closeNewsModal();

    // 8. 首脑峰会画报与安理会印章联动
    ST.player = "USA";
    openSummitModal("geneva_1985", "SUN");
    const sPhotoBox = $("summit-photo-box");
    assert("summitPhotoBoxRendered", sPhotoBox && sPhotoBox.style.display !== "none", "首脑峰会现场画报容器正确展开");
    closeSummitModal();

    openUNSCModal("res_598");
    const uStamp = $("unsc-stamp-img");
    assert("unscStampContainerReady", !!uStamp, "安理会印章容器就绪");
    closeUNSCModal();

    // 9. 旁观模式零漂移铁律
    ST.player = null;
    applyPlayerDecisions();
    const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
    assert("observerZeroPmods", pmodsCount === 0, "旁观模式下时代美术系统零副作用，pmods 保持严格为空 (0 漂移)");

    // 10. 存档往返验证
    const saveOk = simSave();
    assert("simSaveSucceeds", saveOk.ok, "simSave 成功执行");
    const loadOk = simLoad();
    assert("simLoadSucceeds", loadOk.ok, "simLoad 成功执行");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "assetsprobe"; d.style.display = "none";
  d.textContent = "ASSETSPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
