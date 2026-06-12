const STORAGE_KEY = "erp-dataset-v1";

const DEFAULT_HEADERS = ["날짜", "카테고리", "항목", "금액", "수량"];

const SAMPLE_DATA = {
  name: "2026년 1분기 매출 샘플",
  headers: ["날짜", "카테고리", "항목", "금액", "수량"],
  rows: [
    ["2026-01-05", "제품", "노트북 A", "1250000", "12"],
    ["2026-01-08", "제품", "모니터 B", "680000", "20"],
    ["2026-01-12", "서비스", "유지보수", "320000", "8"],
    ["2026-01-18", "제품", "키보드 C", "240000", "45"],
    ["2026-01-22", "제품", "노트북 A", "980000", "9"],
    ["2026-02-03", "서비스", "컨설팅", "1500000", "3"],
    ["2026-02-10", "제품", "모니터 B", "510000", "15"],
    ["2026-02-15", "제품", "마우스 D", "180000", "60"],
    ["2026-02-20", "서비스", "유지보수", "410000", "10"],
    ["2026-03-01", "제품", "노트북 A", "1420000", "11"],
    ["2026-03-08", "제품", "태블릿 E", "890000", "14"],
    ["2026-03-12", "서비스", "교육", "560000", "6"],
  ],
  source: "sample",
  updatedAt: null,
};

let dataset = null;
let manualHeaders = [...DEFAULT_HEADERS];
let manualRows = [];
let pendingUpload = null;
let currentReport = null;
let computedStats = null;

const statusEl = document.getElementById("erp-status");
const datasetNameInput = document.getElementById("erp-dataset-name");
const manualThead = document.getElementById("erp-manual-thead");
const manualTbody = document.getElementById("erp-manual-tbody");
const columnEditor = document.getElementById("erp-column-editor");
const uploadPreview = document.getElementById("erp-upload-preview");
const fileNameEl = document.getElementById("erp-file-name");
const applyUploadBtn = document.getElementById("erp-apply-upload");
const rawFilterInput = document.getElementById("erp-raw-filter");
const reportContent = document.getElementById("erp-report-content");

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.className = "status";
}

function formatNumber(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(n);
}

function parseCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    const next = cleaned[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);

  return rows;
}

function detectColumnType(values) {
  const nonEmpty = values.filter((v) => v !== "" && v != null);
  if (!nonEmpty.length) return "text";

  const datePattern = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/;
  const dateHits = nonEmpty.filter((v) => datePattern.test(String(v))).length;
  if (dateHits / nonEmpty.length >= 0.7) return "date";

  const numHits = nonEmpty.filter((v) => !Number.isNaN(parseNumber(v))).length;
  if (numHits / nonEmpty.length >= 0.7) return "number";

  return "text";
}

function parseNumber(value) {
  const cleaned = String(value).replace(/[,\s₩원%]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function computeStats(headers, rows) {
  const columns = headers.map((name, colIndex) => {
    const values = rows.map((row) => String(row[colIndex] ?? "").trim());
    const type = detectColumnType(values);
    const col = { name, type, uniqueCount: new Set(values.filter(Boolean)).size };

    if (type === "number") {
      const nums = values.map(parseNumber).filter((n) => !Number.isNaN(n));
      col.sum = nums.reduce((a, b) => a + b, 0);
      col.avg = nums.length ? col.sum / nums.length : 0;
      col.min = nums.length ? Math.min(...nums) : null;
      col.max = nums.length ? Math.max(...nums) : null;
      col.count = nums.length;
    } else {
      const counts = {};
      for (const v of values) {
        if (!v) continue;
        counts[v] = (counts[v] || 0) + 1;
      }
      col.topValues = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
    }

    return col;
  });

  return {
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
  };
}

function saveDataset() {
  if (!dataset) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
}

function loadDataset() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.headers?.length || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function applyDataset(name, headers, rows, source = "manual") {
  dataset = {
    name: name || "ERP 데이터",
    headers: headers.map((h) => String(h).trim() || "열"),
    rows: rows.map((row) => headers.map((_, i) => String(row[i] ?? "").trim())),
    source,
    updatedAt: new Date().toISOString(),
  };

  manualHeaders = [...dataset.headers];
  manualRows = dataset.rows.map((row) => [...row]);
  datasetNameInput.value = dataset.name;
  computedStats = computeStats(dataset.headers, dataset.rows);
  currentReport = null;

  saveDataset();
  renderAllViews();
  setStatus(`데이터 ${dataset.rows.length}행이 적용되었습니다.`, "success");
  setTimeout(clearStatus, 2500);
}

function renderColumnEditor() {
  columnEditor.innerHTML = manualHeaders
    .map(
      (header, i) => `
    <div class="erp-col-field">
      <input type="text" class="erp-header-input" data-col-index="${i}" value="${escapeHtml(header)}" maxlength="50">
      ${manualHeaders.length > 1 ? `<button type="button" class="erp-remove-col" data-col-index="${i}" aria-label="열 삭제">×</button>` : ""}
    </div>
  `
    )
    .join("");
}

function renderManualTable() {
  manualThead.innerHTML = `<tr>${manualHeaders.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}<th class="erp-action-col"></th></tr>`;

  if (!manualRows.length) {
    manualRows.push(manualHeaders.map(() => ""));
  }

  manualTbody.innerHTML = manualRows
    .map(
      (row, rowIndex) => `
    <tr>
      ${manualHeaders
        .map(
          (_, colIndex) => `
        <td><input type="text" class="erp-cell-input" data-row="${rowIndex}" data-col="${colIndex}" value="${escapeHtml(row[colIndex] || "")}"></td>
      `
        )
        .join("")}
      <td class="erp-action-col">
        <button type="button" class="erp-remove-row" data-row="${rowIndex}" aria-label="행 삭제">×</button>
      </td>
    </tr>
  `
    )
    .join("");
}

function renderUploadPreview(headers, rows) {
  const previewRows = rows.slice(0, 8);
  uploadPreview.innerHTML = `
    <table class="erp-table">
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${previewRows
          .map(
            (row) =>
              `<tr>${headers.map((_, i) => `<td>${escapeHtml(row[i] || "")}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${rows.length > 8 ? `<p class="erp-hint">외 ${rows.length - 8}행 더 있음 (총 ${rows.length}행)</p>` : ""}
  `;
  uploadPreview.classList.remove("hidden");
  applyUploadBtn.classList.remove("hidden");
}

function renderDashboard() {
  const emptyEl = document.getElementById("erp-dashboard-empty");
  const contentEl = document.getElementById("erp-dashboard-content");
  const kpiGrid = document.getElementById("erp-kpi-grid");
  const chartsEl = document.getElementById("erp-charts");

  if (!dataset?.rows?.length) {
    emptyEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  contentEl.classList.remove("hidden");

  const stats = computedStats || computeStats(dataset.headers, dataset.rows);
  const numericCols = stats.columns.filter((c) => c.type === "number");
  const textCols = stats.columns.filter((c) => c.type === "text" && c.topValues?.length);

  const kpis = [
    { label: "총 행 수", value: formatNumber(stats.rowCount) },
    { label: "컬럼 수", value: formatNumber(stats.columnCount) },
    ...numericCols.slice(0, 2).map((col) => ({
      label: `${col.name} 합계`,
      value: formatNumber(col.sum),
    })),
  ];

  kpiGrid.innerHTML = kpis
    .map(
      (kpi) => `
    <article class="erp-kpi-card">
      <span class="erp-kpi-label">${escapeHtml(kpi.label)}</span>
      <strong class="erp-kpi-value">${escapeHtml(String(kpi.value))}</strong>
    </article>
  `
    )
    .join("");

  const chartBlocks = [];

  for (const col of numericCols.slice(0, 2)) {
    chartBlocks.push(`
      <article class="erp-chart-card">
        <h3>${escapeHtml(col.name)} 요약</h3>
        <div class="erp-stat-bars">
          <div class="erp-stat-row"><span>합계</span><div class="erp-bar-track"><div class="erp-bar-fill" style="width:100%"></div></div><span>${formatNumber(col.sum)}</span></div>
          <div class="erp-stat-row"><span>평균</span><div class="erp-bar-track"><div class="erp-bar-fill" style="width:${col.max ? (col.avg / col.max) * 100 : 0}%"></div></div><span>${formatNumber(col.avg)}</span></div>
          <div class="erp-stat-row"><span>최소</span><div class="erp-bar-track"><div class="erp-bar-fill erp-bar-muted" style="width:${col.max ? (col.min / col.max) * 100 : 0}%"></div></div><span>${formatNumber(col.min)}</span></div>
          <div class="erp-stat-row"><span>최대</span><div class="erp-bar-track"><div class="erp-bar-fill" style="width:100%"></div></div><span>${formatNumber(col.max)}</span></div>
        </div>
      </article>
    `);
  }

  for (const col of textCols.slice(0, 2)) {
    const maxCount = col.topValues[0]?.count || 1;
    chartBlocks.push(`
      <article class="erp-chart-card">
        <h3>${escapeHtml(col.name)} 분포 (상위 ${col.topValues.length})</h3>
        <div class="erp-stat-bars">
          ${col.topValues
            .map(
              (item) => `
            <div class="erp-stat-row">
              <span class="erp-stat-label">${escapeHtml(item.value)}</span>
              <div class="erp-bar-track"><div class="erp-bar-fill" style="width:${(item.count / maxCount) * 100}%"></div></div>
              <span>${item.count}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </article>
    `);
  }

  if (!chartBlocks.length) {
    chartBlocks.push(`
      <article class="erp-chart-card">
        <h3>데이터 요약</h3>
        <p class="erp-hint">숫자형 또는 분류형 컬럼이 감지되면 차트가 표시됩니다. 현재 ${stats.rowCount}행 · ${stats.columnCount}열 데이터가 등록되어 있습니다.</p>
      </article>
    `);
  }

  chartsEl.innerHTML = chartBlocks.join("");
}

function renderRawData() {
  const emptyEl = document.getElementById("erp-raw-empty");
  const contentEl = document.getElementById("erp-raw-content");
  const thead = document.getElementById("erp-raw-thead");
  const tbody = document.getElementById("erp-raw-tbody");
  const countEl = document.getElementById("erp-raw-count");

  if (!dataset?.rows?.length) {
    emptyEl.classList.remove("hidden");
    contentEl.classList.add("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  contentEl.classList.remove("hidden");

  const filter = rawFilterInput.value.trim().toLowerCase();
  const filtered = filter
    ? dataset.rows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(filter)))
    : dataset.rows;

  thead.innerHTML = `<tr>${dataset.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  tbody.innerHTML = filtered
    .map(
      (row) =>
        `<tr>${dataset.headers.map((_, i) => `<td>${escapeHtml(row[i] || "")}</td>`).join("")}</tr>`
    )
    .join("");

  countEl.textContent = filter
    ? `${filtered.length} / ${dataset.rows.length}행`
    : `총 ${dataset.rows.length}행`;
}

function renderReportPanel() {
  const emptyEl = document.getElementById("erp-report-empty");
  const controlsEl = document.getElementById("erp-report-controls");
  const actionsEl = document.getElementById("erp-report-actions");

  if (!dataset?.rows?.length) {
    emptyEl.classList.remove("hidden");
    controlsEl.classList.add("hidden");
    reportContent.classList.add("hidden");
    actionsEl.classList.add("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  controlsEl.classList.remove("hidden");

  if (currentReport) {
    renderReport(currentReport);
    reportContent.classList.remove("hidden");
    actionsEl.classList.remove("hidden");
  } else {
    reportContent.classList.add("hidden");
    actionsEl.classList.add("hidden");
    reportContent.innerHTML = "";
  }
}

function renderReport(report) {
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

  const takeawaysHtml = (report.keyTakeaways || [])
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");

  const recsHtml = (report.recommendations || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");

  reportContent.innerHTML = `
    <h2>${escapeHtml(report.title)}</h2>
    <p class="report-meta">데이터셋: ${escapeHtml(report.datasetName || dataset.name)} · 분석일: ${escapeHtml(report.analyzedAt || "-")}</p>
    <p class="report-executive">${escapeHtml(report.executiveSummary)}</p>
    ${sectionsHtml}
    <div class="report-takeaways">
      <h3>핵심 인사이트</h3>
      <ul>${takeawaysHtml}</ul>
    </div>
    ${
      recsHtml
        ? `<div class="report-takeaways"><h3>실행 제안</h3><ul>${recsHtml}</ul></div>`
        : ""
    }
  `;
}

function renderAllViews() {
  renderDashboard();
  renderRawData();
  renderReportPanel();
}

function switchErpTab(tabName) {
  document.querySelectorAll(".erp-subtab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.erpTab === tabName);
  });

  document.querySelectorAll(".erp-tab-panel").forEach((panel) => {
    panel.classList.add("hidden");
  });

  const panel = document.getElementById(`erp-tab-${tabName}`);
  if (panel) panel.classList.remove("hidden");

  if (tabName === "dashboard") renderDashboard();
  if (tabName === "raw") renderRawData();
  if (tabName === "report") renderReportPanel();
}

function switchInputMode(mode) {
  document.querySelectorAll(".erp-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.inputMode === mode);
  });
  document.getElementById("erp-manual-panel").classList.toggle("hidden", mode !== "manual");
  document.getElementById("erp-upload-panel").classList.toggle("hidden", mode !== "upload");
}

function syncManualFromInputs() {
  document.querySelectorAll(".erp-header-input").forEach((input) => {
    const i = Number(input.dataset.colIndex);
    manualHeaders[i] = input.value.trim() || `열${i + 1}`;
  });

  manualRows = [];
  const rowCount = manualTbody.querySelectorAll("tr").length;
  for (let r = 0; r < rowCount; r++) {
    const row = manualHeaders.map((_, c) => {
      const cell = manualTbody.querySelector(`.erp-cell-input[data-row="${r}"][data-col="${c}"]`);
      return cell ? cell.value.trim() : "";
    });
    manualRows.push(row);
  }
}

function exportCSV() {
  if (!dataset?.rows?.length) return;

  const escape = (val) => {
    const s = String(val ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    dataset.headers.map(escape).join(","),
    ...dataset.rows.map((row) => dataset.headers.map((_, i) => escape(row[i])).join(",")),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${dataset.name || "erp-data"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("CSV 파일을 저장했습니다.", "success");
  setTimeout(clearStatus, 2000);
}

async function apiPost(endpoint, body) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다.");
  }

  const rawText = await res.text();
  let data = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error("서버 응답을 해석할 수 없습니다.");
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || "요청에 실패했습니다.");
  }

  return data;
}

async function generateReport() {
  if (!dataset?.rows?.length) {
    setStatus("먼저 데이터를 등록해 주세요.", "error");
    return;
  }

  const btn = document.getElementById("erp-generate-report");
  btn.disabled = true;
  setStatus("AI가 ERP 데이터를 분석하는 중...", "loading");
  reportContent.classList.remove("hidden");
  reportContent.innerHTML = `
    <div class="skeleton title"></div>
    <div class="skeleton summary"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  `;

  try {
    const stats = computedStats || computeStats(dataset.headers, dataset.rows);
    const data = await apiPost("/api/erp-analyze", {
      datasetName: dataset.name,
      stats,
      sampleRows: dataset.rows,
      focus: document.getElementById("erp-focus-input").value.trim(),
    });

    currentReport = data;
    renderReport(data);
    document.getElementById("erp-report-actions").classList.remove("hidden");
    clearStatus();
  } catch (err) {
    reportContent.classList.add("hidden");
    setStatus(err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function downloadReportHtml() {
  if (!currentReport) return;
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${escapeHtml(currentReport.title)}</title></head><body>${reportContent.innerHTML}</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ERP분석보고서_${dataset?.name || "report"}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

function initManualEditor() {
  if (dataset) {
    manualHeaders = [...dataset.headers];
    manualRows = dataset.rows.map((r) => [...r]);
  } else {
    manualHeaders = [...DEFAULT_HEADERS];
    manualRows = [manualHeaders.map(() => "")];
  }
  renderColumnEditor();
  renderManualTable();
}

document.querySelectorAll(".erp-subtab").forEach((tab) => {
  tab.addEventListener("click", () => switchErpTab(tab.dataset.erpTab));
});

document.querySelectorAll(".erp-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchInputMode(btn.dataset.inputMode));
});

document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchErpTab(btn.dataset.gotoTab));
});

document.getElementById("erp-add-column").addEventListener("click", () => {
  syncManualFromInputs();
  manualHeaders.push(`열${manualHeaders.length + 1}`);
  manualRows = manualRows.map((row) => [...row, ""]);
  renderColumnEditor();
  renderManualTable();
});

document.getElementById("erp-add-row").addEventListener("click", () => {
  syncManualFromInputs();
  manualRows.push(manualHeaders.map(() => ""));
  renderManualTable();
});

columnEditor.addEventListener("click", (e) => {
  const btn = e.target.closest(".erp-remove-col");
  if (!btn || manualHeaders.length <= 1) return;
  syncManualFromInputs();
  const index = Number(btn.dataset.colIndex);
  manualHeaders.splice(index, 1);
  manualRows = manualRows.map((row) => row.filter((_, i) => i !== index));
  renderColumnEditor();
  renderManualTable();
});

manualTbody.addEventListener("click", (e) => {
  const btn = e.target.closest(".erp-remove-row");
  if (!btn) return;
  syncManualFromInputs();
  manualRows.splice(Number(btn.dataset.row), 1);
  if (!manualRows.length) manualRows.push(manualHeaders.map(() => ""));
  renderManualTable();
});

document.getElementById("erp-apply-manual").addEventListener("click", () => {
  syncManualFromInputs();
  const nonEmptyRows = manualRows.filter((row) => row.some((cell) => cell !== ""));
  if (!nonEmptyRows.length) {
    setStatus("최소 1행 이상의 데이터를 입력해 주세요.", "error");
    return;
  }
  applyDataset(datasetNameInput.value.trim() || "ERP 데이터", manualHeaders, nonEmptyRows, "manual");
});

document.getElementById("erp-file-trigger").addEventListener("click", () => {
  document.getElementById("erp-file-input").click();
});

document.getElementById("erp-file-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  fileNameEl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseCSV(String(reader.result || ""));
    if (parsed.length < 2) {
      setStatus("CSV에 헤더와 데이터 행이 필요합니다.", "error");
      pendingUpload = null;
      uploadPreview.classList.add("hidden");
      applyUploadBtn.classList.add("hidden");
      return;
    }
    const headers = parsed[0];
    const rows = parsed.slice(1);
    pendingUpload = { headers, rows };
    renderUploadPreview(headers, rows);
    clearStatus();
  };
  reader.readAsText(file, "UTF-8");
});

document.getElementById("erp-apply-upload").addEventListener("click", () => {
  if (!pendingUpload) return;
  applyDataset(
    datasetNameInput.value.trim() || pendingUpload.headers.join("_"),
    pendingUpload.headers,
    pendingUpload.rows,
    "upload"
  );
  pendingUpload = null;
});

document.getElementById("erp-sample-btn").addEventListener("click", () => {
  applyDataset(SAMPLE_DATA.name, SAMPLE_DATA.headers, SAMPLE_DATA.rows, "sample");
  initManualEditor();
});

document.getElementById("erp-clear-btn").addEventListener("click", () => {
  if (!dataset && !manualRows.some((r) => r.some(Boolean))) return;
  if (!confirm("등록된 ERP 데이터를 모두 삭제할까요?")) return;
  dataset = null;
  computedStats = null;
  currentReport = null;
  pendingUpload = null;
  manualHeaders = [...DEFAULT_HEADERS];
  manualRows = [manualHeaders.map(() => "")];
  datasetNameInput.value = "";
  localStorage.removeItem(STORAGE_KEY);
  initManualEditor();
  renderAllViews();
  uploadPreview.classList.add("hidden");
  applyUploadBtn.classList.add("hidden");
  fileNameEl.textContent = "선택된 파일 없음";
  clearStatus();
});

rawFilterInput.addEventListener("input", renderRawData);
document.getElementById("erp-export-csv").addEventListener("click", exportCSV);
document.getElementById("erp-generate-report").addEventListener("click", generateReport);
document.getElementById("erp-download-report").addEventListener("click", downloadReportHtml);

const saved = loadDataset();
if (saved) {
  dataset = saved;
  computedStats = computeStats(saved.headers, saved.rows);
  datasetNameInput.value = saved.name || "";
}
initManualEditor();
renderAllViews();
