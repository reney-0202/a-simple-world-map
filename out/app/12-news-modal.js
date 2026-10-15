"use strict";


// ---- R11B: 时代大新闻与重大事件头版特刊系统 (Broadsheet Modal) ----
let newsResumePlay = false;
function openNewsModal(newsId) {
  if (!window.W1980_NEWS) return false;
  const news = window.W1980_NEWS[newsId];
  if (!news) return false;
  const modal = $("news-modal");
  if (!modal) return false;

  ST.lastNewsId = newsId;
  if (window.W1980_SOUND) window.W1980_SOUND.playTeletype();
  if (SIM.playing) {
    newsResumePlay = true;
    SIM.playing = false;
    updateDate();
  }

  const mDate = $("news-date"); if (mDate) mDate.textContent = news.y + "-" + String(news.m).padStart(2, "0");
  const mMast = $("news-masthead"); if (mMast) mMast.textContent = news.paper || "THE GLOBAL CHRONICLE";
  const mIssue = $("news-issue"); if (mIssue) mIssue.textContent = news.issue || "VOL. XLIV NO. 15,420";
  const mHl = $("news-headline"); if (mHl) mHl.textContent = news.headline;
  const mSub = $("news-subhead"); if (mSub) mSub.textContent = news.subhead || "";
  const mLead = $("news-lead"); if (mLead) mLead.textContent = news.lead || "";
  const mEd = $("news-editorial"); if (mEd) mEd.textContent = news.editorial || "";
  const mImp = $("news-impacts");
  if (mImp) {
    mImp.innerHTML = (news.impacts || []).map((imp) =>
      '<div class="news-impact-item">' +
      '<span class="news-impact-icon">' + imp.icon + '</span>' +
      '<div class="news-impact-content">' +
      '<span class="news-impact-title">' + imp.title + '</span>' +
      '<span class="news-impact-desc">' + imp.desc + '</span>' +
      '</div></div>'
    ).join("");
  }

  const bFocus = $("news-btn-focus");
  if (bFocus) {
    bFocus.onclick = () => {
      if (news.focus && Array.isArray(news.focus)) {
        flyTo(news.focus[0], news.focus[1], news.focus[2], news.focus[3], 600);
      }
    };
  }

  const bCont = $("news-btn-continue");
  if (bCont) {
    bCont.onclick = closeNewsModal;
  }

  // R14: 挂载时代历史新闻档案画报与印章
  const photoBox = $("news-photo-box");
  const photoImg = $("news-photo-img");
  const photoCap = $("news-photo-caption");
  const stampImg = $("news-stamp-img");
  if (photoBox && photoImg && photoCap && window.W1980_ASSETS) {
    const p = window.W1980_ASSETS.getNewsPhoto(newsId);
    if (p) {
      photoImg.src = p.url;
      photoCap.textContent = "【时代历史档案】" + p.caption;
      photoBox.style.display = "block";
    } else {
      photoBox.style.display = "none";
    }
    if (stampImg) {
      const isSoviet = (news.paper && news.paper.includes("ПРАВДА")) || (newsId === "ussr_dissolution" || newsId === "perestroika");
      stampImg.src = isSoviet ? "assets/ui/stamp_soviet_secret.png" : "assets/ui/stamp_top_secret.png";
      stampImg.style.display = "block";
    }
  }

  modal.style.display = "flex";
  return true;
}

function closeNewsModal() {
  const modal = $("news-modal");
  if (modal) modal.style.display = "none";
  if (newsResumePlay) {
    SIM.playing = true; simKick();
    newsResumePlay = false;
    updateDate();
  }
}

// ---- R11B: 时代大新闻头版弹窗全链路专用探针 ----
