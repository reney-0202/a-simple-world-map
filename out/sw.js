'use strict';
/* world1980 service worker (PWA offline support) - generated file.
 * Strategy: precache the whole app shell on install (it is a self-contained
 * static game), then serve cache-first so the app starts with no network.
 * Anything not precached is fetched and stored on first use, so media added
 * later still works offline after one visit.
 * Bump CACHE_VERSION whenever the shipped files change.
 */
const CACHE_VERSION = 'w1980-v23';
const PRECACHE = [
  "app/01-core.js",
  "app/02-sim.js",
  "app/03-decisions.js",
  "app/04-frontlines.js",
  "app/04a-groundwar.js",
  "app/05-economy.js",
  "app/06-ai.js",
  "app/07-domestic.js",
  "app/07a-agency.js",
  "app/07b-agenda.js",
  "app/07c-crisis.js",
  "app/07d-polecon.js",
  "app/07e-prestige.js",
  "app/07f-nuke.js",
  "app/08-covert.js",
  "app/08a-estimates.js",
  "app/08b-ideology.js",
  "app/09-endgame.js",
  "app/10-events-save.js",
  "app/11-shell.js",
  "app/12-news-modal.js",
  "app/13-boot.js",
  "app/14-pwa.js",
  "app/probes/01-selftest.js",
  "app/probes/02-decisions.js",
  "app/probes/03-frontlines.js",
  "app/probes/03a-groundwar.js",
  "app/probes/04-economy.js",
  "app/probes/05-ai.js",
  "app/probes/05a-econ-ai.js",
  "app/probes/06-diplomacy.js",
  "app/probes/07-news.js",
  "app/probes/08-domestic.js",
  "app/probes/08a-agenda.js",
  "app/probes/08b-crisis.js",
  "app/probes/08c-sound-assets.js",
  "app/probes/08d-polecon.js",
  "app/probes/08e-prestige.js",
  "app/probes/08f-nuke.js",
  "app/probes/08h-estimates.js",
  "app/probes/08i-warai.js",
  "app/probes/08j-ideology.js",
  "app/probes/09-debug-hook.js",
  "assets/audio/radio_tracks.json",
  "assets/news/news_berlin_wall_1989.jpg",
  "assets/news/news_chernobyl_1986.jpg",
  "assets/news/news_gulf_war_1990.jpg",
  "assets/news/news_iran_iraq_war_1980.jpg",
  "assets/news/news_oil_crash_1986.jpg",
  "assets/news/news_ussr_dissolution_1991.jpg",
  "assets/news/summit_geneva_1985.jpg",
  "assets/news/summit_reykjavik_1986.jpg",
  "assets/portraits/portrait_chn_deng.jpg",
  "assets/portraits/portrait_cub_castro.jpg",
  "assets/portraits/portrait_ddr_honecker.jpg",
  "assets/portraits/portrait_deu_kohl.jpg",
  "assets/portraits/portrait_egy_mubarak.jpg",
  "assets/portraits/portrait_fra_mitterrand.jpg",
  "assets/portraits/portrait_gbr_thatcher.jpg",
  "assets/portraits/portrait_ind_gandhi.jpg",
  "assets/portraits/portrait_irn_khomeini.jpg",
  "assets/portraits/portrait_irq_saddam.jpg",
  "assets/portraits/portrait_isr_begin.jpg",
  "assets/portraits/portrait_jpn_nakasone.jpg",
  "assets/portraits/portrait_pol_jaruzelski.jpg",
  "assets/portraits/portrait_sau_fahd.jpg",
  "assets/portraits/portrait_sun_andropov.jpg",
  "assets/portraits/portrait_sun_brezhnev.jpg",
  "assets/portraits/portrait_sun_gorbachev.jpg",
  "assets/portraits/portrait_usa_bush.jpg",
  "assets/portraits/portrait_usa_carter.jpg",
  "assets/portraits/portrait_usa_reagan.jpg",
  "assets/pwa/icon-192.png",
  "assets/pwa/icon-512.png",
  "assets/pwa/icon-maskable-512.png",
  "assets/ui/stamp_ratified.png",
  "assets/ui/stamp_soviet_secret.png",
  "assets/ui/stamp_top_secret.png",
  "assets/ui/stamp_vetoed.png",
  "data/afghan.js",
  "data/agenda-conditions.js",
  "data/agendas.js",
  "data/ai.js",
  "data/assets.js",
  "data/borders_country.json",
  "data/borders_province.json",
  "data/checksum.json",
  "data/cities.js",
  "data/countries.js",
  "data/country_id.png",
  "data/cr.js",
  "data/crises.js",
  "data/effects.js",
  "data/embargo.js",
  "data/estimates.js",
  "data/events.js",
  "data/ideology.js",
  "data/intel.js",
  "data/news.js",
  "data/nuke.js",
  "data/playable_id.png",
  "data/polecon.js",
  "data/prestige.js",
  "data/probes.js",
  "data/province_id.png",
  "data/provinces.js",
  "data/resources.js",
  "data/sim.js",
  "data/sound.js",
  "data/trade.js",
  "data/wars.js",
  "engine/sim.js",
  "index.html",
  "manifest.webmanifest",
  "style.css"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // addAll is atomic: one 404 aborts the install. Add individually so a single
    // missing optional asset cannot break offline support entirely.
    await Promise.all(PRECACHE.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { /* optional asset: ignore */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // let cross-origin pass through

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (e) {
      // offline and not cached: fall back to the app shell for navigations
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
