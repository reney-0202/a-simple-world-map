"use strict";
/* world1980 — HoI4-flavoured interactive province map (Equal Earth, no dependencies) */

const $ = (id) => document.getElementById(id);
const CM = window.W1980_COUNTRIES, PM = window.W1980_PROVINCES, CITY = window.W1980_CITIES;
const CK = CM.checksum;
const W = CK.base[0], H = CK.base[1], N = W * H;
const KM2 = CK.km2PerPx;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

const OCEAN = "#16202b", GREY = "#4a4f55", GUTTER = "#101822";
const BLOC = { NATO: "#3E6FB0", WP: "#B03A3A", SOV: "#8E3B3B", CHN: "#D4A017", W: "#4E8C7A", NA: "#7A9A3C", NE: "#9B9B9B" };
const BLOC_ZH = { NATO: "北约", WP: "华约", SOV: "亲苏", CHN: "中国阵营", W: "西方(非北约)", NA: "不结盟/第三世界", NE: "中立" };
const MAJOR = {
  SUN: "#C0392B", USA: "#4A7EBB", GBR: "#B08BB5", FRA: "#6C8EBF", CHN: "#E0B040",
  DEU: "#8E7CC3", DDR: "#C97C7C", JPN: "#D98C8C", IND: "#7FB069", BRA: "#A8C256"
};
const PALETTE = ["#5F9EA0", "#C1873B", "#7D6A9E", "#4E8C7A", "#B0533A", "#6B9BD2", "#9E5B7A",
  "#8FA35C", "#96694B", "#5C7C9E", "#A85C6E", "#7A8B4F", "#B98A56", "#64789B",
  "#9C6B8E", "#7FA3A0", "#C0A05A", "#6E7F5A", "#8B5E5E", "#5D8AA8", "#8C7A5B", "#6A8F8B"];

const MODES = [["political", "政治", "1"], ["bloc", "阵营", "2"], ["pop", "人口", "3"],
  ["ind", "工业", "4"], ["province", "政区随机色", "5"], ["delta", "变化", "6"], ["resource", "资源", "7"]];
const LAYERS = [["province", "省界"], ["country", "国界"], ["capital", "首都金星"],
  ["city", "城市点"], ["label", "地名标签"]];

// ---- R5C'（tasks/015）：对外决策档位表（定案：军援损耗率 1.5×，主人裁定） ----
// 单位 = pp/年（加性，进引擎 P.pmods 玩家决策层）。tgt = 目标实体全部成员，self = 本国反噬/转移损耗。
const DEC_TIERS = {
  san: [ { zh: "外交抗议", tgt: 0.5, self: 0.3 }, { zh: "轻度制裁", tgt: 1.5, self: 1.0 },
    { zh: "重度制裁", tgt: 3.0, self: 2.0 } ],
  aid: [ { zh: "军事顾问", tgt: 1.0, self: 1.5 }, { zh: "装备援助", tgt: 2.0, self: 3.0 },
    { zh: "全面军援", tgt: 3.0, self: 4.5 } ]
};
const DEC_MAX = { san: 2, aid: 2 };        // 同时目标数上限（制裁 2 / 军援 2）

// ---- R7A（tasks/018，C2 经济网络）：阵营经贸协作基础强度与脱钩摩擦模型 ----
// 单位 = pp/年（加性，进引擎 P.pmods 玩家决策层）。
const BLOC_NET_BASE = {
  NATO: 0.40, W: 0.40, WP: 0.20, SOV: 0.15, CHN: 0.15, NA: 0.0, NE: 0.0
};

// ---- ST 状态对象的所有权约定（架构检查点 4）-----------------------------------
// ST 是单一全局状态对象，17 个子系统共用。为可维护性，约定「一个字段一名写主」：
//   写主 = 唯一在正常运行中写入该字段的模块；其他模块只读。
// 例外是 10-events-save.js 的 simLoad 系列：它是存档还原的通用入口，
// 按字段逐一还原所有子系统的值（这是设计意图，见 loadXxxState 注释）。
// 另有 12-probes.js / 13-boot.js 为测试与启动参数注入，属于受控外部写入。
// 字段归属表（写主 → 字段）：
//   11-shell.js    mode, sortKey, sel, hover, hoverC, layers
//   09-endgame.js  player, mil —— 运行时入口为 setPlayer / setMil（09-endgame.js:105/118）；
//                   存档还原走 10-events-save.js 的 loadPlayerProfile；其余直写点集中在
//                   07-domestic.js / 08-covert.js 的探针夹具与 12-probes.js / 13-boot.js
//                   （测试注入与 ?player=/ ?mil= 启动参数），属受控外部写入。
//   03-decisions.js sanctions, aid, blocOverride, blocSince（setBloc 为阵营写入入口）
//   04-frontlines.js frontlines（setFrontline 为唯一入口）
//   05-economy.js  tradeRoutes, reserves, cocom, chokepoints, smuggle
//   06-ai.js       ai（含 tensions/cables/decisions）, panelTab
//   07-domestic.js domestic, agendas, crises
//   08-covert.js   intel, afghan, sound
//   09-endgame.js  endTab
//   10-events-save.js lastNewsId（读侧过滤见同文件 showNews 处）、newsModalEnabled（读侧）
// 迁移字段时：先改写主，再更新本表；不要把散落的 ST.x = ... 直接搬进其他模块。
// ------------------------------------------------------------------------------

const ST = {
  mode: "political", sortKey: "pop_m", sel: null, hover: 0, hoverC: null,
  player: null, mil: 0,            // R3：玩家实体（可 null=旁观）与军费占比决策（%）
  sanctions: [], aid: [],          // R5C'：对外决策名单 [{t:KEY, l:0..2, since:月序}]（制裁/军援互斥）
  blocOverride: {},                // R5E/R7A：结盟 —— {playerKey: BLOC} 仅玩家自己可迁入/迁出
  blocSince: null,                 // R7A（C2 经济网络）：玩家迁入阵营时的全局月份索引（脱钩震荡计算用）
  frontlines: {},                  // R8A（动态地缘前线）：省份交战占领映射 { [provId]: { occupier: KEY, warId: ID, since: 月序 } }
  tradeRoutes: [],                 // R9B（贸易大动脉）：活跃航线清单 [{id, from, to, res, amount, cur, desc}]
  reserves: {},                    // R9B（双轨外汇储备池）：{ [key]: { usd: number, trb: number } }
  cocom: { active: true, strict: false }, // R9C（巴统出口管制）：西方对华约先进技术禁运体系
  chokepoints: { hormuz: "open" },        // R9C（咽喉航道状态）：霍尔木兹海峡 open / contested / blocked
  smuggle: { tr_deu_sun_tech: true },     // R9C（反禁运特种走私通道）：{ [routeId]: boolean }
  ai: { enabled: true, decisions: {}, tensions: {}, cables: [] }, // R10A（反应式 AI）：战略性格决策机与双边态度
  panelTab: "overview",                    // R11A（面板 Tabs）：当前激活的选项卡 (overview/defense/economy/diplomacy)
  newsModalEnabled: true,                  // R11B（时代大新闻）：是否开启大事件头版弹窗
  lastNewsId: null,                        // R11B：最近一次触发的时代大新闻 ID
  endTab: "rubric",                        // R11C（终局长卷 Tabs）：当前结算选项卡 (rubric/epilogue/chronicle)
  domestic: null,                          // R12A（内政生态与派系天平）：{ sun, usa, generals }
  agendas: {},                             // R12B（专属国家战略议程）：{ [cKey]: { active, progress, completed, bonuses } }
  crises: { history: [], pending: null },  // R12C（突发危机抉择卡与升级阶梯）：已决断历史与当前待决危机
  intel: null,                             // R13A（全球谍战沙盒）：特情局黑金预算、行动力点数与隐蔽行动记录
  afghan: null,                            // R13B（阿富汗战争泥潭）：第40集团军战区态势、失血槽与撤军进度
  sound: { muted: false, vol: 0.6 },       // R13C（时代音效架构）：音效开关与音量
  layers: { province: true, country: true, capital: true, city: true, label: true }
};
const view = { x: 0, y: 0, s: 1, fit: 1 };

let pid = null, pol = null, landm = null;      // rasters
let play = null;                               // playable entity id per px（集团合并后）
let playPol = null;                            // province -> playable entity id
let playKeys = null;                           // entity id -> key（byPlayableId）
let playIdOfKey = null;                        // key -> entity id
let playPids = null;                           // key -> Set(polity_id)（集团=多个成员政体）
const flMap = new Uint16Array(3000);           // R8A：前线快速映射缓存（省份 ID -> 占领国实体 ID）
let hasFrontlines = false;                     // R8A：是否存在活动前线（用于 bakeNow 零开销分支）
let provPol = null;                            // province -> polity id
let runs = null, cruns = null;                 // RLE
let modeCan = null, mctx = null, tables = {}, baked = {}, bakedNow = null;
let mapCan, mctx2, ovCan, octx, bimg = null, oimg = null;
let xmapA = null, ymapA = null, xmapP = -1, ymapP = -1;
let VB_P = null, VB_C = null;   // 矢量边界折线（delta-int16 解码后的浮点折线，惰性）
let xmapX = NaN, ymapY = NaN;   // ← 缓存必须跟 view.x/view.y 一起失效，否则平移后边界层会错位
let __W1980 = null;             // 调试/验证钩子（见文件末尾 window.__W1980）

// ---------------------------------------------------------------- helpers
function hx(s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }
function u32(r, g, b, a) { return (((a === undefined ? 255 : a) << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function u32c(s) { const c = hx(s); return u32(c[0], c[1], c[2]); }
function rgba(r, g, b, a) { return ((Math.round(a * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function fmtPop(m) { return (m / 100).toFixed(m >= 1000 ? 1 : 2) + " 亿"; }
function fmtMoney(bn) { return bn >= 1000 ? (bn / 1000).toFixed(2) + " 万亿美元" : (bn * 10).toFixed(0) + " 亿美元"; }
function fmtArea2(km2) { return km2 >= 1e6 ? (km2 / 1e6).toFixed(2) + " 百万 km²" : Math.round(km2).toLocaleString() + " km²"; }
