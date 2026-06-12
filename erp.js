/** ERP 분석 UI — erp-five-lemon 스타일 4-table CSV 기반 */

let dataset = ErpData.getEmptyDataset();
let validation = null;
let analytics = null;
let currentReport = null;
let activeRawTab = "products";

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatKRW(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR").format(n);
}

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return `${n.toFixed(1)}%`;
}

function setStatus(message, type = "") {
  const el = $("erp-status");
  if (!el) return;
  el.textContent = message;
  el.className = `status ${type}`.trim();
}

function clearStatus() {
  setStatus("");
}

function isReady() {
  return validation?.ok === true;
}

function refreshState() {
  validation = ErpData.validateDataset(dataset);
  analytics = isReady() ? ErpData.buildAnalytics(dataset) : null;
  renderTableCards();
  renderValidation();
  renderDashboard();
  renderRawData();
  renderReportPanel();
}

function renderTableCards() {
  const grid = $("erp-file-grid");
  if (!grid) return;
  const summary = ErpData.getTableSummary(dataset);

  grid.innerHTML = Object.values(ErpData.ERP_TABLES)
    .map((def) => {
      const s = summary[def.key];
      const statusClass = s.loaded ? "loaded" : "pending";
      const statusText = s.loaded ? `${formatNum(s.rowCount)}행` : "미업로드";
      return `
        <div class="erp-file-card ${statusClass}">
          <div class="erp-file-card-head">
            <span class="erp-file-dot">${s.loaded ? "●" : "○"}</span>
            <span>${escapeHtml(def.label)}</span>
          </div>
          <div class="erp-file-card-meta">${escapeHtml(statusText)}</div>
        </div>
      `;
    })
    .join("");
}

function renderValidation() {
  const box = $("erp-validation");
  if (!box) return;

  if (!validation) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");

  const loadedCount = Object.values(validation.tables).filter((t) => t.rowCount > 0).length;

  if (loadedCount < 4) {
    box.innerHTML = `
      <div class="erp-validation-pending">
        <strong>데이터 대기 중</strong>
        <p>4개 CSV 중 ${loadedCount}개 업로드됨. products · customers · sales_orders · sales_order_items 를 모두 등록해 주세요.</p>
      </div>
    `;
    return;
  }

  if (validation.ok) {
    box.innerHTML = `
      <div class="erp-validation-ok">
        <strong>검증 완료</strong>
        <p>총 ${formatNum(validation.totalRows)}행 · 참조 무결성 통과. 대시보드와 분석 보고서를 이용할 수 있습니다.</p>
        ${validation.warnings.length ? `<ul>${validation.warnings.slice(0, 5).map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul>` : ""}
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="erp-validation-error">
      <strong>검증 실패</strong>
      <ul>${validation.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderBarChart(containerId, title, items, valueFormatter = formatKRW) {
  const el = $(containerId);
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = `<article class="erp-chart-card"><h3>${escapeHtml(title)}</h3><p class="erp-hint">표시할 데이터가 없습니다.</p></article>`;
    return;
  }

  const max = Math.max(...items.map((i) => i.value), 1);
  el.innerHTML = `
    <article class="erp-chart-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="erp-stat-bars">
        ${items
          .map(
            (item) => `
          <div class="erp-stat-row">
            <span class="erp-stat-label">${escapeHtml(item.name || item.month)}</span>
            <div class="erp-bar-track"><div class="erp-bar-fill" style="width:${(item.value / max) * 100}%"></div></div>
            <span>${escapeHtml(valueFormatter(item.value))}</span>
          </div>
        `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderDashboard() {
  const empty = $("erp-dashboard-empty");
  const content = $("erp-dashboard-content");
  if (!empty || !content) return;

  if (!isReady() || !analytics) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  content.classList.remove("hidden");

  const k = analytics.kpis;
  $("erp-kpi-grid").innerHTML = `
    <article class="erp-kpi-card highlight"><span class="erp-kpi-label">총 매출</span><strong class="erp-kpi-value">${formatKRW(k.totalRevenue)}</strong></article>
    <article class="erp-kpi-card"><span class="erp-kpi-label">매출총이익</span><strong class="erp-kpi-value">${formatKRW(k.grossProfit)}</strong><span class="erp-kpi-sub">이익률 ${formatPct(k.marginPct)}</span></article>
    <article class="erp-kpi-card"><span class="erp-kpi-label">주문 건수</span><strong class="erp-kpi-value">${formatNum(k.orderCount)}</strong><span class="erp-kpi-sub">객단가 ${formatKRW(k.avgOrderValue)}</span></article>
    <article class="erp-kpi-card"><span class="erp-kpi-label">고객 / 상품</span><strong class="erp-kpi-value">${formatNum(k.customerCount)} / ${formatNum(k.productCount)}</strong><span class="erp-kpi-sub">재고 ${formatNum(k.totalStock)}개</span></article>
  `;

  const charts = $("erp-charts");
  charts.innerHTML = `
    <div id="erp-chart-monthly"></div>
    <div id="erp-chart-category"></div>
    <div id="erp-chart-channel"></div>
    <div id="erp-chart-products"></div>
    <div id="erp-chart-customers"></div>
    <div id="erp-chart-inventory"></div>
  `;

  renderBarChart("erp-chart-monthly", "월별 매출 추이", analytics.monthlyTrend);
  renderBarChart("erp-chart-category", "카테고리별 매출", analytics.categoryBreakdown);
  renderBarChart("erp-chart-channel", "채널별 매출", analytics.channelBreakdown);
  renderBarChart("erp-chart-products", "상위 상품 매출", analytics.topProducts);
  renderBarChart("erp-chart-customers", "상위 고객 매출", analytics.topCustomers);

  const invEl = $("erp-chart-inventory");
  if (analytics.lowStock.length) {
    const max = Math.max(...analytics.lowStock.map((p) => ErpData.parseNumber(p.stock_qty) || 0), 1);
    invEl.innerHTML = `
      <article class="erp-chart-card">
        <h3>재고 부족 상품 (80개 미만)</h3>
        <div class="erp-stat-bars">
          ${analytics.lowStock
            .map((p) => {
              const qty = ErpData.parseNumber(p.stock_qty) || 0;
              return `
              <div class="erp-stat-row">
                <span class="erp-stat-label">${escapeHtml(p.product_name)}</span>
                <div class="erp-bar-track"><div class="erp-bar-fill erp-bar-warn" style="width:${(qty / max) * 100}%"></div></div>
                <span>${formatNum(qty)}</span>
              </div>
            `;
            })
            .join("")}
        </div>
      </article>
    `;
  } else {
    invEl.innerHTML = `<article class="erp-chart-card"><h3>재고 현황</h3><p class="erp-hint">부족 재고(80개 미만) 상품이 없습니다.</p></article>`;
  }
}

function renderRawData() {
  const empty = $("erp-raw-empty");
  const content = $("erp-raw-content");
  if (!empty || !content) return;

  if (!isReady()) {
    empty.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  content.classList.remove("hidden");

  document.querySelectorAll(".erp-raw-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.rawTable === activeRawTab);
  });

  const def = ErpData.ERP_TABLES[activeRawTab];
  const table = dataset[activeRawTab];
  const filter = ($("erp-raw-filter")?.value || "").trim().toLowerCase();

  const filtered = filter
    ? table.objects.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(filter))
      )
    : table.objects;

  const preview = filtered.slice(0, 200);
  const thead = $("erp-raw-thead");
  const tbody = $("erp-raw-tbody");
  const countEl = $("erp-raw-count");

  thead.innerHTML = `<tr>${table.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  tbody.innerHTML = preview
    .map(
      (row) =>
        `<tr>${table.headers.map((h) => `<td>${escapeHtml(row[h] ?? "")}</td>`).join("")}</tr>`
    )
    .join("");

  const suffix = filtered.length > 200 ? " (상위 200행만 표시)" : "";
  countEl.textContent = filter
    ? `${formatNum(filtered.length)} / ${formatNum(table.objects.length)}행${suffix}`
    : `총 ${formatNum(table.objects.length)}행${suffix}`;
}

function renderReport(report) {
  const el = $("erp-report-content");
  if (!el) return;

  const sectionsHtml = (report.sections || [])
    .map(
      (s) => `
    <div class="report-section-block">
      <h3>${escapeHtml(s.heading)}</h3>
      <p>${escapeHtml(s.content)}</p>
    </div>
  `
    )
    .join("");

  el.innerHTML = `
    <h2>${escapeHtml(report.title)}</h2>
    <p class="report-meta">분석일: ${escapeHtml(report.analyzedAt || "-")}</p>
    <p class="report-executive">${escapeHtml(report.executiveSummary)}</p>
    ${sectionsHtml}
    <div class="report-takeaways"><h3>핵심 인사이트</h3><ul>${(report.keyTakeaways || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></div>
    ${(report.recommendations || []).length ? `<div class="report-takeaways"><h3>실행 제안</h3><ul>${report.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul></div>` : ""}
  `;
}

function renderReportPanel() {
  const empty = $("erp-report-empty");
  const controls = $("erp-report-controls");
  const content = $("erp-report-content");
  const actions = $("erp-report-actions");

  if (!isReady()) {
    empty?.classList.remove("hidden");
    controls?.classList.add("hidden");
    content?.classList.add("hidden");
    actions?.classList.add("hidden");
    return;
  }

  empty?.classList.add("hidden");
  controls?.classList.remove("hidden");

  if (currentReport) {
    renderReport(currentReport);
    content?.classList.remove("hidden");
    actions?.classList.remove("hidden");
  } else {
    content?.classList.add("hidden");
    actions?.classList.add("hidden");
    if (content) content.innerHTML = "";
  }
}

function switchErpTab(tabName) {
  document.querySelectorAll("#panel-erp .erp-subtab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.erpTab === tabName);
  });
  document.querySelectorAll("#panel-erp .erp-tab-panel").forEach((panel) => {
    panel.classList.add("hidden");
  });
  $(`erp-tab-${tabName}`)?.classList.remove("hidden");

  if (tabName === "dashboard") renderDashboard();
  if (tabName === "raw") renderRawData();
  if (tabName === "report") renderReportPanel();
}

async function ingestFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  for (const file of files) {
    const tableKey = ErpData.detectFileTable(file.name);
    if (!tableKey) {
      setStatus(`인식할 수 없는 파일: ${file.name}`, "error");
      continue;
    }
    const text = await file.text();
    dataset[tableKey] = ErpData.parseTableFromCSV(text);
  }

  dataset.source = "upload";
  dataset.loadedAt = new Date().toISOString();
  refreshState();
  clearStatus();

  if (isReady()) {
    setStatus("4개 ERP 데이터 검증 완료. 대시보드를 확인하세요.", "success");
    setTimeout(clearStatus, 3000);
  }
}

async function loadSample() {
  setStatus("샘플 ERP 데이터를 불러오는 중...", "loading");
  try {
    dataset = await ErpData.loadSampleTables();
    refreshState();
    clearStatus();
    setStatus(`샘플 데이터 ${formatNum(validation.totalRows)}행 로드 완료`, "success");
    setTimeout(clearStatus, 2500);
  } catch (err) {
    setStatus(err.message, "error");
  }
}

function clearAll() {
  if (!validation?.totalRows && !dataset.source) return;
  if (!confirm("등록된 ERP 데이터를 모두 삭제할까요?")) return;
  dataset = ErpData.getEmptyDataset();
  validation = null;
  analytics = null;
  currentReport = null;
  refreshState();
  clearStatus();
}

function exportRawCsv() {
  if (!isReady()) return;
  const table = dataset[activeRawTab];
  const def = ErpData.ERP_TABLES[activeRawTab];
  const escape = (val) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    table.headers.map(escape).join(","),
    ...table.objects.map((row) => table.headers.map((h) => escape(row[h])).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = def.file;
  link.click();
  URL.revokeObjectURL(url);
}

async function apiPost(endpoint, body) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("서버 응답을 해석할 수 없습니다.");
    }
  }
  if (!res.ok) throw new Error(data?.error || "요청에 실패했습니다.");
  return data;
}

async function generateReport() {
  if (!isReady() || !analytics) {
    setStatus("먼저 4개 CSV 데이터를 등록하고 검증을 완료해 주세요.", "error");
    return;
  }

  const btn = $("erp-generate-report");
  const content = $("erp-report-content");
  btn.disabled = true;
  setStatus("Gemini가 ERP 경영 보고서를 작성하는 중...", "loading");
  content.classList.remove("hidden");
  content.innerHTML = `<div class="skeleton title"></div><div class="skeleton summary"></div><div class="skeleton"></div>`;

  try {
    currentReport = await apiPost("/api/erp-analyze", {
      datasetName: "ERP 4-Table Dataset",
      stats: {
        rowCount: validation.totalRows,
        columnCount: 4,
        tables: validation.tables,
        analytics,
      },
      sampleRows: [],
      focus: ($("erp-focus-input")?.value || "").trim(),
    });
    renderReport(currentReport);
    $("erp-report-actions")?.classList.remove("hidden");
    clearStatus();
  } catch (err) {
    content.classList.add("hidden");
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function downloadReportHtml() {
  if (!currentReport) return;
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(currentReport.title)}</title></head><body>${$("erp-report-content").innerHTML}</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ERP분석보고서.html";
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  const panel = $("panel-erp");
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    if (!target) return;

    const subtab = target.closest(".erp-subtab");
    if (subtab?.dataset.erpTab) {
      switchErpTab(subtab.dataset.erpTab);
      return;
    }

    const rawTab = target.closest(".erp-raw-tab");
    if (rawTab?.dataset.rawTable) {
      activeRawTab = rawTab.dataset.rawTable;
      renderRawData();
      return;
    }

    if (target.closest("#erp-sample-btn")) {
      e.preventDefault();
      loadSample();
      return;
    }
    if (target.closest("#erp-clear-btn")) {
      e.preventDefault();
      clearAll();
      return;
    }
    if (target.closest("#erp-generate-report")) {
      e.preventDefault();
      generateReport();
      return;
    }
    if (target.closest("#erp-download-report")) {
      e.preventDefault();
      downloadReportHtml();
      return;
    }
    if (target.closest("#erp-export-csv")) {
      e.preventDefault();
      exportRawCsv();
      return;
    }
    if (target.closest("[data-goto-tab]")) {
      switchErpTab(target.closest("[data-goto-tab]").dataset.gotoTab);
    }
  });

  const dropzone = $("erp-dropzone");
  const fileInput = $("erp-file-input");

  dropzone?.addEventListener("click", () => fileInput?.click());
  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    ingestFiles(e.dataTransfer?.files);
  });

  fileInput?.addEventListener("change", (e) => {
    ingestFiles(e.target.files);
    e.target.value = "";
  });

  $("erp-raw-filter")?.addEventListener("input", renderRawData);
}

function bootErp() {
  bindEvents();
  refreshState();
  window.ErpModule = {
    refresh: refreshState,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootErp);
} else {
  bootErp();
}
