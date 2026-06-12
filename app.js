const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const reportBtn = document.getElementById("report-btn");
const statusEl = document.getElementById("status");
const welcomeEl = document.getElementById("welcome");
const resultsSection = document.getElementById("results-section");
const resultsTitle = document.getElementById("results-title");
const articlesEl = document.getElementById("articles");
const reportSection = document.getElementById("report-section");
const reportContent = document.getElementById("report-content");
const sourcesSection = document.getElementById("sources-section");
const sourcesList = document.getElementById("sources-list");
const searchEntryPoint = document.getElementById("search-entry-point");

let currentQuery = "";
let currentArticles = [];
let currentSources = [];

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "status";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderSources(sources, entryPointHtml) {
  if (!sources?.length && !entryPointHtml) {
    sourcesSection.classList.add("hidden");
    return;
  }

  sourcesSection.classList.remove("hidden");
  sourcesList.innerHTML = sources
    .map(
      (s) =>
        `<li><a href="${escapeHtml(s.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a></li>`
    )
    .join("");

  if (entryPointHtml) {
    searchEntryPoint.innerHTML = entryPointHtml;
  } else {
    searchEntryPoint.innerHTML = "";
  }
}

function renderArticleSkeletons(count = 3) {
  articlesEl.innerHTML = Array.from({ length: count }, () => `
    <article class="article-card">
      <div class="skeleton title"></div>
      <div class="skeleton"></div>
      <div class="skeleton summary"></div>
    </article>
  `).join("");
}

function renderArticles(articles) {
  if (!articles.length) {
    articlesEl.innerHTML = `<p class="article-meta">관련 뉴스를 찾지 못했습니다. 다른 검색어를 시도해 보세요.</p>`;
    return;
  }

  articlesEl.innerHTML = articles
    .map(
      (article) => `
    <article class="article-card">
      <div class="article-card-header">
        <h3 class="article-title">
          <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(article.title)}
          </a>
        </h3>
        <a class="external-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" aria-label="원문 보기">↗</a>
      </div>
      <p class="article-meta">
        ${escapeHtml(article.source)}${article.publishedAt ? ` · ${escapeHtml(article.publishedAt)}` : ""}
      </p>
      <p class="article-summary">${escapeHtml(article.summary)}</p>
    </article>
  `
    )
    .join("");
}

function renderReportSkeleton() {
  reportSection.classList.remove("hidden");
  reportContent.innerHTML = `
    <div class="skeleton title"></div>
    <div class="skeleton summary"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  `;
}

function renderReport(report) {
  reportSection.classList.remove("hidden");

  const sectionsHtml = (report.sections || [])
    .map(
      (section) => `
      <div class="report-section-block">
        <h3>${escapeHtml(section.heading)}</h3>
        <p>${escapeHtml(section.content)}</p>
      </div>
    `
    )
    .join("");

  const takeawaysHtml = (report.keyTakeaways || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  reportContent.innerHTML = `
    <h2>${escapeHtml(report.title)}</h2>
    <p class="report-executive">${escapeHtml(report.executiveSummary)}</p>
    ${sectionsHtml}
    <div class="report-takeaways">
      <h3>핵심 포인트</h3>
      <ul>${takeawaysHtml}</ul>
    </div>
  `;

  if (report.sources?.length) {
    const merged = [...currentSources];
    for (const s of report.sources) {
      if (!merged.some((m) => m.uri === s.uri)) {
        merged.push(s);
      }
    }
    currentSources = merged;
    renderSources(currentSources, report.searchEntryPoint || searchEntryPoint.innerHTML);
  }
}

async function apiPost(endpoint, body) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || "요청에 실패했습니다.");
    err.code = data.code;
    err.retryAfterSeconds = data.retryAfterSeconds;
    throw err;
  }

  return data;
}

async function handleSearch(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    setStatus("검색어를 입력해 주세요.", "error");
    return;
  }

  currentQuery = trimmed;
  currentArticles = [];
  currentSources = [];

  welcomeEl.classList.add("hidden");
  resultsSection.classList.remove("hidden");
  reportSection.classList.add("hidden");
  reportContent.innerHTML = "";

  resultsTitle.textContent = `"${trimmed}" 검색 결과`;
  searchBtn.disabled = true;
  reportBtn.disabled = true;
  setStatus("뉴스를 검색하고 요약하는 중...", "loading");
  renderArticleSkeletons(4);

  try {
    const data = await apiPost("/api/search", { query: trimmed });

    resultsTitle.textContent = data.dateRange
      ? `"${trimmed}" 검색 결과 (최근 2주: ${data.dateRange.from} ~ ${data.dateRange.to})`
      : `"${trimmed}" 검색 결과`;

    currentArticles = data.articles || [];
    currentSources = data.sources || [];

    renderArticles(currentArticles);
    renderSources(currentSources, data.searchEntryPoint);
    clearStatus();

    if (!currentArticles.length) {
      const hint =
        data.totalFound > 0
          ? "최근 2주 이내 기사만 표시합니다. 해당 기간에 맞는 결과가 없습니다."
          : "검색 결과가 없습니다.";
      setStatus(hint, "error");
    }
  } catch (err) {
    renderArticles([]);
    sourcesSection.classList.add("hidden");
    setStatus(err.message, "error");
  } finally {
    searchBtn.disabled = false;
    reportBtn.disabled = false;
  }
}

async function handleReport() {
  if (!currentQuery) return;

  reportBtn.disabled = true;
  searchBtn.disabled = true;
  setStatus("종합 보고서를 생성하는 중...", "loading");
  renderReportSkeleton();

  try {
    const data = await apiPost("/api/report", {
      query: currentQuery,
      articles: currentArticles,
    });

    renderReport(data);
    clearStatus();
    reportSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    reportSection.classList.add("hidden");
    setStatus(err.message, "error");
  } finally {
    reportBtn.disabled = false;
    searchBtn.disabled = false;
  }
}

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSearch(searchInput.value);
});

reportBtn.addEventListener("click", handleReport);

document.querySelectorAll(".suggestion-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const query = chip.dataset.query;
    searchInput.value = query;
    handleSearch(query);
  });
});
