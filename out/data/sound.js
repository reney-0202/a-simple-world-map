// world1980 - data/sound.js
// R13C: 时代音效架构与原生 Web Audio 合成器引擎（Soundscape Engine）

(function () {
  let audioCtx = null;
  let masterGain = null;
  let isMutedState = false;
  let masterVolume = 0.6;

  // 从本地存储还原静音偏好
  try {
    const savedMute = localStorage.getItem("w1980_sound_muted");
    if (savedMute !== null) isMutedState = (savedMute === "1");
    const savedVol = localStorage.getItem("w1980_sound_vol");
    if (savedVol !== null) masterVolume = parseFloat(savedVol) || 0.6;
  } catch (e) {}

  const SOUND_DEFINITIONS = [
    { id: "hotline", name: "美苏热线呼叫音", desc: "440Hz+480Hz 双音低沉脉冲，模拟克里姆林宫/五角大楼加急热线" },
    { id: "treaty", name: "历史换约落笔声", desc: "羊皮纸书写摩擦与木质印章合鸣，模拟军控条约签署与重大议程确立" },
    { id: "gavel", name: "安理会木槌落槌", desc: "清脆阻尼木质击台声，模拟联合国安理会决议通过与一票否决权行使" },
    { id: "teletype", name: "电传打字机微鸣", desc: "短促机械敲击与走纸脉冲，模拟时代头条特刊与突发加急密电收发" }
  ];

  function isProbeOrHeadless() {
    if (typeof window === "undefined") return true;
    if (window.CR && window.CR.probeMode) return true;
    if (typeof navigator !== "undefined" && navigator.webdriver) return true;
    // M2（探针注册收敛）：探针参数令牌来自 data/probes.js —— 与运行器、与页面
    // 的 CR.probeMode 用的是同一份表。`audit` 是额外的诊断开关而非探针，单独列出。
    // 令牌按整词匹配：`?audit=1` 命中，`?auditor=x` 不命中。
    const reg = window.W1980_PROBES;
    const tokens = (reg && Array.isArray(reg.params)) ? reg.params.concat(["audit"]) : ["audit"];
    for (let i = 0; i < tokens.length; i++) {
      if (new RegExp("[?&]" + tokens[i] + "(=|&|$)").test(location.search)) return true;
    }
    return false;
  }

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(isMutedState ? 0 : masterVolume, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    } catch (e) {
      return null;
    }
    return audioCtx;
  }

  function canPlay() {
    if (isMutedState) return false;
    if (isProbeOrHeadless()) return false;
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return true;
  }

  // 1. ☎️ 美苏热线呼叫音（Hotline Pulse: 440Hz + 480Hz 双频贝尔脉冲）
  function playHotline() {
    if (!canPlay()) return false;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(480, now);

    // 双脉冲包络：0.12s 鸣响，0.06s 间隔，0.12s 鸣响，渐隐
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.02);
    gain.gain.setValueAtTime(0.3, now + 0.12);
    gain.gain.linearRampToValueAtTime(0, now + 0.14);
    gain.gain.setValueAtTime(0, now + 0.20);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.22);
    gain.gain.setValueAtTime(0.3, now + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.50);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.55);
    osc2.stop(now + 0.55);
    return true;
  }

  // 2. 📜 历史换约落笔声（Treaty Pen Stroke: 低频羊皮纸与印章共鸣）
  function playTreaty() {
    if (!canPlay()) return false;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 盖章低频主体
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(0.35, now + 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    // 羊皮纸摩擦声（过滤噪声）
    const bufferSize = ctx.sampleRate * 0.15;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(masterGain);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);

    osc.start(now);
    whiteNoise.start(now);
    osc.stop(now + 0.25);
    whiteNoise.stop(now + 0.25);
    return true;
  }

  // 3. 🔨 安理会木槌落槌（UNSC Gavel Strike: 清脆木质瞬态与木台混响）
  function playGavel() {
    if (!canPlay()) return false;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 木槌头部硬度敲击
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    // 木台共振音
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = "triangle";
    bodyOsc.frequency.setValueAtTime(180, now + 0.01);
    bodyOsc.frequency.exponentialRampToValueAtTime(75, now + 0.22);

    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.setValueAtTime(0.25, now + 0.01);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(oscGain);
    oscGain.connect(masterGain);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(masterGain);

    osc.start(now);
    bodyOsc.start(now);
    osc.stop(now + 0.15);
    bodyOsc.stop(now + 0.28);
    return true;
  }

  // 4. 🚨 加急密电打字机微鸣（Teletype Chime: 机械击键与电传走纸瞬态）
  function playTeletype() {
    if (!canPlay()) return false;
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 机械击键
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.04);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
    return true;
  }

  function toggleMute() {
    isMutedState = !isMutedState;
    try {
      localStorage.setItem("w1980_sound_muted", isMutedState ? "1" : "0");
    } catch (e) {}
    if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(isMutedState ? 0 : masterVolume, audioCtx.currentTime);
    }
    return isMutedState;
  }

  function setMuted(muted) {
    isMutedState = !!muted;
    try {
      localStorage.setItem("w1980_sound_muted", isMutedState ? "1" : "0");
    } catch (e) {}
    if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(isMutedState ? 0 : masterVolume, audioCtx.currentTime);
    }
    return isMutedState;
  }

  function isMuted() {
    return isMutedState;
  }

  function setVolume(vol) {
    masterVolume = Math.max(0, Math.min(1, typeof vol === "number" ? vol : 0.6));
    try {
      localStorage.setItem("w1980_sound_vol", String(masterVolume));
    } catch (e) {}
    if (masterGain && audioCtx && !isMutedState) {
      masterGain.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
    }
    return masterVolume;
  }

  function getVolume() {
    return masterVolume;
  }

  window.W1980_SOUND = {
    SOUND_DEFINITIONS: SOUND_DEFINITIONS,
    getAudioContext: getAudioContext,
    canPlay: canPlay,
    playHotline: playHotline,
    playTreaty: playTreaty,
    playGavel: playGavel,
    playTeletype: playTeletype,
    toggleMute: toggleMute,
    setMuted: setMuted,
    isMuted: isMuted,
    setVolume: setVolume,
    getVolume: getVolume,
    isProbeOrHeadless: isProbeOrHeadless
  };
})();
