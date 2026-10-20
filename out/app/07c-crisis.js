"use strict";

// ---- R12C: 中局突发危机抉择卡与升级阶梯系统 ----
let crisisResumePlay = false;
function initCrisisState() {
  ST.crises = {
    history: [],
    pending: null
  };
  return ST.crises;
}

function sanitizeCrisisState(data) {
  if (!data || typeof data !== "object") {
    return { history: [], pending: null };
  }
  const history = Array.isArray(data.history)
    ? data.history.filter((h) => h && typeof h.id === "string" && typeof h.tier === "number")
    : [];
  let pending = null;
  if (data.pending && typeof data.pending.id === "string") {
    pending = (window.W1980_CRISES && window.W1980_CRISES.getCrisisById(data.pending.id)) || data.pending;
  }
  return { history: history, pending: pending };
}

function openCrisisModal(cr) {
  if (!cr) return false;
  const modal = $("crisis-modal");
  if (!modal) return false;

  if (!ST.crises) initCrisisState();
  ST.crises.pending = cr;
  if (window.W1980_SOUND) window.W1980_SOUND.playTeletype();

  if (SIM.playing) {
    crisisResumePlay = true;
    SIM.playing = false;
    updateDate();
  }

  const mDate = $("crisis-date");
  if (mDate) mDate.textContent = cr.year + "-" + String(cr.month).padStart(2, "0");
  const mTitle = $("crisis-title");
  if (mTitle) mTitle.textContent = cr.title;
  const mSubhead = $("crisis-subhead");
  if (mSubhead) mSubhead.textContent = cr.headline || "";
  const mRegion = $("crisis-region");
  if (mRegion) mRegion.textContent = "📍 " + (cr.region || "前线热点战区");
  const mActors = $("crisis-actors");
  if (mActors) {
    const actorNames = (cr.actors || []).map((k) => (CM.countries[k] || {}).zh || k).join(" · ");
    mActors.textContent = "🌐 涉事各方：" + (actorNames || "美苏超级大国");
  }
  const mDesc = $("crisis-desc");
  if (mDesc) mDesc.textContent = cr.desc || "";

  const optContainer = $("crisis-options");
  if (optContainer) {
    optContainer.innerHTML = (cr.options || []).map((opt) => {
      const tierClass = "tier-" + opt.tier;
      return '<div class="crisis-card ' + tierClass + '">' +
        '<div class="crisis-card-hd">' +
          '<span class="crisis-card-tier">' + opt.icon + ' 阶梯 ' + opt.tier + '</span>' +
          '<span class="crisis-card-badge">' + (opt.badge || ("阶梯 " + opt.tier)) + '</span>' +
        '</div>' +
        '<div class="crisis-card-title">' + opt.title + '</div>' +
        '<div class="crisis-card-desc">' + opt.desc + '</div>' +
        '<div class="crisis-card-effects"><strong>决断预期：</strong>' + (opt.effects && opt.effects.summary ? opt.effects.summary : "重塑地缘对抗均势") + '</div>' +
        '<button class="crisis-btn-decide" data-crisis="' + cr.id + '" data-tier="' + opt.tier + '">拍板决断 (执行阶梯 ' + opt.tier + ')</button>' +
      '</div>';
    }).join("");

    optContainer.querySelectorAll(".crisis-btn-decide").forEach((btn) => {
      btn.onclick = () => {
        const cId = btn.dataset.crisis;
        const tier = parseInt(btn.dataset.tier, 10);
        resolveCrisis(cId, tier);
      };
    });
  }

  modal.style.display = "flex";
  return true;
}

function hideCrisisModal() {
  const modal = $("crisis-modal");
  if (modal) modal.style.display = "none";
}

function closeCrisisModal() {
  hideCrisisModal();
  if (crisisResumePlay) {
    SIM.playing = true; simKick();
    crisisResumePlay = false;
    updateDate();
  }
}

function resolveCrisis(crId, tier, silent) {
  if (!window.W1980_CRISES) return false;
  const cr = window.W1980_CRISES.getCrisisById(crId);
  if (!cr) return false;
  const opt = (cr.options || []).find((o) => o.tier === tier) || cr.options[0];
  if (!opt) return false;

  if (!ST.crises) initCrisisState();
  const y = SIM.S ? SIM.S.year : cr.year;
  const m = SIM.S ? SIM.S.month : cr.month;
  ST.crises.history.push({
    id: cr.id,
    tier: tier,
    y: y,
    m: m,
    title: cr.title,
    optionTitle: opt.title,
    time: Date.now()
  });
  ST.crises.pending = null;

  const eff = opt.effects || {};

  // D（数据层评审）/ I（数据层工具链）：统一效果词表自检 —— 数据里出现表外键 = 拼错或过期，
  // 静默无效最危险。词表见 data/effects.js（W1980_EFFECTS）：构建期由 tools/validate_data.js
  // 直接判失败；运行期登记进 W1980_EFFECTS.violations（探针断言其为空），
  // 并在探针/开发模式下同时打到控制台。
  if (window.W1980_EFFECTS && window.W1980_EFFECTS.report) {
    window.W1980_EFFECTS.report("crisis " + cr.id + " tier" + tier, eff);
  }

  // 1. 双边张力影响 (R10A)
  if (typeof eff.tensionDelta === "number" && eff.tensionDelta !== 0 && ST.ai && ST.ai.tensions) {
    const usSunKey = "USA:SUN";
    const curTension = typeof ST.ai.tensions[usSunKey] === "number" ? ST.ai.tensions[usSunKey] : 50;
    ST.ai.tensions[usSunKey] = clamp(curTension + eff.tensionDelta, 0, 100);
  }

  // 2. 大国内政生态与派系权力天平渗透 (R12A)
  if (ST.domestic) {
    if (ST.domestic.sun) {
      if (typeof eff.sunConservative === "number") {
        ST.domestic.sun.conservative = clamp(ST.domestic.sun.conservative + eff.sunConservative, 10, 95);
      }
      if (typeof eff.sunReformist === "number") {
        ST.domestic.sun.reformist = clamp(ST.domestic.sun.reformist + eff.sunReformist, 5, 90);
      }
      if (typeof eff.sunShortage === "number") {
        ST.domestic.sun.shortage = clamp(ST.domestic.sun.shortage + eff.sunShortage, 0, 100);
      }
    }
    if (ST.domestic.usa) {
      if (typeof eff.usaCongressApproval === "number") {
        ST.domestic.usa.congressApproval = clamp(ST.domestic.usa.congressApproval + eff.usaCongressApproval, 15, 90);
      }
    }
    if (ST.domestic.generals) {
      if (typeof eff.stabilityBonus === "number") {
        for (const k in ST.domestic.generals) {
          ST.domestic.generals[k].stability = clamp(ST.domestic.generals[k].stability + eff.stabilityBonus, 10, 100);
        }
      }
    }
  }

  // 3. 巴统技术管制升级
  if (eff.cocomStrict && ST.cocom) {
    ST.cocom.strict = true;
  }

  // 3b. F（威望竞赛）：危机抉择的威望影响 —— 落点是玩家自己（无玩家时静默跳过）。
  // 这条效果键把「在危机中站在哪一边」与「谁看起来代表未来」连了起来：
  // 强硬回击可能赢得威望，也可能当众丢脸，取决于危机卡怎么设计。
  if (typeof eff.prestigeDelta === "number" && eff.prestigeDelta !== 0 &&
      ST.player && typeof prestigeAdd === "function") {
    prestigeAdd(ST.player, eff.prestigeDelta, "危机决断：" + cr.title);
  }

  // 3c. N1（核风险轴）：把此前只存在于数据里的 6 个「展示用」键接上真实消费者 ——
  // 阶梯选择推升级、同盟凝聚推威慑、民意落回英国国内动荡。
  // gbrPopularity 落点与玩家国无关（它描述英国），所以不受 ST.player 限制。
  if (typeof nukeEscalateByTier === "function") nukeEscalateByTier(tier);
  if (typeof nukeApplyEffect === "function" && eff) nukeApplyEffect(eff, cr.id);

  // 4. 收件箱入账与即时反馈
  const inboxItem = {
    y: y,
    m: m,
    zh: "【突发危机决断】" + cr.title + " · " + opt.title,
    note: opt.icon + " 最高决策层拍板阶梯 " + tier + "（" + (opt.badge || "") + "）：" + (eff.summary || opt.desc),
    isCrisis: true
  };
  EV.items.push(inboxItem);
  EV.unread++;
  renderInbox();
  if (!silent) toast(inboxItem);

  // 5. 模态窗口关闭与播放恢复
  closeCrisisModal();
  if (ST.sel && typeof refreshDomesticBox === "function") {
    refreshDomesticBox(ST.sel);
  }
  return true;
}

function updateMonthlyCrises(y, m, silent) {
  if (!window.W1980_CRISES) return;
  if (!ST.crises) initCrisisState();

  const crises = window.W1980_CRISES.getCrisesForDate(y, m);
  if (!crises || !crises.length) return;

  for (let i = 0; i < crises.length; i++) {
    const cr = crises[i];
    if (ST.crises.history.some((h) => h.id === cr.id)) continue;

    // 旁观模式 或 探针测试模式：自动执行史实基准阶梯 2（对等均势反制），零暂停、零 pmods 注入、零漂移
    if (!ST.player || CR.probeMode) {
      ST.crises.history.push({
        id: cr.id,
        tier: 2,
        y: y,
        m: m,
        title: cr.title,
        optionTitle: (cr.options && cr.options[1] ? cr.options[1].title : "对等反制"),
        auto: true,
        time: Date.now()
      });
      continue;
    }

    // 玩家执政模式：涉及玩家国或美苏大国时触发危机抉择卡
    const isPlayerInvolved = !cr.actors || !cr.actors.length ||
      cr.actors.includes(ST.player) || cr.target === ST.player || cr.initiator === ST.player ||
      ST.player === "SUN" || ST.player === "USA";
    if (isPlayerInvolved) {
      if (silent === true && !CR.probeMode) {
        CR.resumePlay = SIM.playing;
        SIM.playing = false;
        updateDate();
        openCrisisModal(cr);
        return;
      }
      openCrisisModal(cr);
      return;
    }
  }
}
