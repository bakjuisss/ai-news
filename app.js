const PANELS = {
  news: {
    el: document.getElementById("panel-news"),
    title: "News Report · AI Platform",
    subtitle: "News Report · 뉴스 검색 · 번역 · 종합 보고서",
    footer: "AI가 생성한 요약 및 보고서는 참고용이며, 원문 기사를 반드시 확인하세요.",
  },
  erp: {
    el: document.getElementById("panel-erp"),
    title: "ERP 분석 시스템 · AI Platform",
    subtitle: "ERP 분석 시스템 · 데이터 입력 · 대시보드 · AI 보고서",
    footer: "ERP 데이터는 브라우저에 저장되며, AI 분석 보고서는 참고용입니다.",
  },
};

let activePanel = "news";

function switchPanel(name) {
  if (!PANELS[name]) return;

  activePanel = name;
  const meta = PANELS[name];

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.panel === name);
  });

  Object.entries(PANELS).forEach(([key, panel]) => {
    const isActive = key === name;
    panel.el.classList.toggle("hidden", !isActive);
    panel.el.classList.toggle("panel-active", isActive);
  });

  document.title = meta.title;
  document.getElementById("brand-subtitle").textContent = meta.subtitle;
  document.getElementById("footer-text").textContent = meta.footer;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchPanel(tab.dataset.panel));
});

window.AppShell = { switchPanel, getActivePanel: () => activePanel };
