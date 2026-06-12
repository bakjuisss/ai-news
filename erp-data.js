/** ERP 4-table data layer (products / customers / sales_orders / sales_order_items) */

const ERP_STORAGE_KEY = "erp-multi-v1";

const ERP_TABLES = {
  products: {
    key: "products",
    label: "상품",
    file: "products.csv",
    required: [
      "product_id",
      "product_name",
      "category",
      "brand",
      "unit_cost_krw",
      "unit_price_krw",
      "stock_qty",
      "status",
    ],
    numeric: ["product_id", "unit_cost_krw", "unit_price_krw", "stock_qty"],
  },
  customers: {
    key: "customers",
    label: "고객",
    file: "customers.csv",
    required: [
      "customer_id",
      "customer_name",
      "customer_type",
      "city",
      "phone",
      "email",
      "join_date",
      "tier",
    ],
    numeric: ["customer_id"],
  },
  sales_orders: {
    key: "sales_orders",
    label: "주문",
    file: "sales_orders.csv",
    required: [
      "order_no",
      "customer_id",
      "order_date",
      "status",
      "channel",
      "payment_method",
      "total_amount_krw",
    ],
    numeric: ["order_no", "customer_id", "total_amount_krw"],
  },
  sales_order_items: {
    key: "sales_order_items",
    label: "주문상세",
    file: "sales_order_items.csv",
    required: [
      "order_item_id",
      "order_no",
      "product_id",
      "qty",
      "unit_price_krw",
      "discount_pct",
      "amount_krw",
    ],
    numeric: [
      "order_item_id",
      "order_no",
      "product_id",
      "qty",
      "unit_price_krw",
      "discount_pct",
      "amount_krw",
    ],
  },
};

const SAMPLE_BASE = "/data/sample/";

function parseCSV(text) {
  const cleaned = String(text).replace(/^\uFEFF/, "");
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

function parseNumber(value) {
  const cleaned = String(value ?? "").replace(/[,\s₩원%]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function parseTableFromCSV(text) {
  const parsed = parseCSV(text);
  if (!parsed.length) {
    return { headers: [], rows: [], objects: [] };
  }
  const headers = parsed[0].map((h) => String(h).trim());
  const rows = parsed.slice(1);
  const objects = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
  return { headers, rows, objects };
}

function validateTable(def, table) {
  const errors = [];
  const warnings = [];

  if (!table?.headers?.length || !table?.objects?.length) {
    errors.push(`${def.label}: 데이터 행이 없습니다.`);
    return { errors, warnings, rowCount: 0 };
  }

  const missingCols = def.required.filter((col) => !table.headers.includes(col));
  if (missingCols.length) {
    errors.push(`${def.label}: 필수 열 누락 — ${missingCols.join(", ")}`);
  }

  const checkRows = Math.min(table.objects.length, 500);
  for (let i = 0; i < checkRows; i++) {
    const row = table.objects[i];
    for (const col of def.numeric) {
      if (row[col] === "" || row[col] == null) continue;
      if (Number.isNaN(parseNumber(row[col]))) {
        warnings.push(`${def.label} ${i + 2}행: ${col} 숫자 형식 오류`);
        break;
      }
    }
  }

  return { errors, warnings, rowCount: table.objects.length };
}

function validateReferentialIntegrity(dataset) {
  const errors = [];
  const warnings = [];

  const productIds = new Set(dataset.products.objects.map((r) => String(r.product_id)));
  const customerIds = new Set(dataset.customers.objects.map((r) => String(r.customer_id)));
  const orderNos = new Set(dataset.sales_orders.objects.map((r) => String(r.order_no)));

  let missingProduct = 0;
  let missingCustomer = 0;
  let missingOrder = 0;

  for (const item of dataset.sales_order_items.objects) {
    if (!orderNos.has(String(item.order_no))) missingOrder++;
    if (!productIds.has(String(item.product_id))) missingProduct++;
  }

  for (const order of dataset.sales_orders.objects) {
    if (!customerIds.has(String(order.customer_id))) missingCustomer++;
  }

  if (missingOrder) errors.push(`주문상세 → 주문 참조 오류 ${missingOrder}건`);
  if (missingProduct) errors.push(`주문상세 → 상품 참조 오류 ${missingProduct}건`);
  if (missingCustomer) errors.push(`주문 → 고객 참조 오류 ${missingCustomer}건`);

  return { errors, warnings };
}

function validateDataset(dataset) {
  const result = {
    ok: true,
    errors: [],
    warnings: [],
    tables: {},
    totalRows: 0,
  };

  for (const def of Object.values(ERP_TABLES)) {
    const table = dataset[def.key];
    const v = validateTable(def, table);
    result.tables[def.key] = { label: def.label, rowCount: v.rowCount };
    result.totalRows += v.rowCount;
    result.errors.push(...v.errors);
    result.warnings.push(...v.warnings);
  }

  const allPresent = Object.values(ERP_TABLES).every(
    (def) => dataset[def.key]?.objects?.length > 0
  );

  if (allPresent) {
    const ref = validateReferentialIntegrity(dataset);
    result.errors.push(...ref.errors);
    result.warnings.push(...ref.warnings);
  } else {
    result.warnings.push("4개 CSV를 모두 업로드하면 참조 무결성 검사가 실행됩니다.");
  }

  result.ok = result.errors.length === 0 && allPresent;
  return result;
}

function buildAnalytics(dataset) {
  const products = dataset.products.objects;
  const customers = dataset.customers.objects;
  const orders = dataset.sales_orders.objects;
  const items = dataset.sales_order_items.objects;

  const productMap = new Map(products.map((p) => [String(p.product_id), p]));
  const customerMap = new Map(customers.map((c) => [String(c.customer_id), c]));
  const orderMap = new Map(orders.map((o) => [String(o.order_no), o]));

  const activeOrders = orders.filter((o) => o.status !== "취소");
  const activeOrderNos = new Set(activeOrders.map((o) => String(o.order_no)));
  const activeItems = items.filter((i) => activeOrderNos.has(String(i.order_no)));

  let totalRevenue = 0;
  let totalCost = 0;
  const monthly = {};
  const byCategory = {};
  const byChannel = {};
  const byProduct = {};
  const byCustomer = {};

  for (const item of activeItems) {
    const amount = parseNumber(item.amount_krw) || 0;
    const qty = parseNumber(item.qty) || 0;
    const product = productMap.get(String(item.product_id));
    const order = orderMap.get(String(item.order_no));
    const unitCost = product ? parseNumber(product.unit_cost_krw) || 0 : 0;

    totalRevenue += amount;
    totalCost += qty * unitCost;

    if (order?.order_date) {
      const month = String(order.order_date).slice(0, 7);
      if (month) monthly[month] = (monthly[month] || 0) + amount;
    }

    const category = product?.category || "미분류";
    byCategory[category] = (byCategory[category] || 0) + amount;

    const channel = order?.channel || "미분류";
    byChannel[channel] = (byChannel[channel] || 0) + amount;

    const productName = product?.product_name || item.product_id;
    byProduct[productName] = (byProduct[productName] || 0) + amount;

    const customerId = order?.customer_id;
    if (customerId) {
      byCustomer[String(customerId)] = (byCustomer[String(customerId)] || 0) + amount;
    }
  }

  const grossProfit = totalRevenue - totalCost;
  const marginPct = totalRevenue ? (grossProfit / totalRevenue) * 100 : 0;
  const orderCount = activeOrders.length;
  const avgOrderValue = orderCount ? totalRevenue / orderCount : 0;

  const tierDist = {};
  for (const c of customers) {
    tierDist[c.tier || "미지정"] = (tierDist[c.tier || "미지정"] || 0) + 1;
  }

  const lowStock = products
    .filter((p) => (parseNumber(p.stock_qty) || 0) < 80)
    .sort((a, b) => (parseNumber(a.stock_qty) || 0) - (parseNumber(b.stock_qty) || 0))
    .slice(0, 8);

  const totalStock = products.reduce((sum, p) => sum + (parseNumber(p.stock_qty) || 0), 0);

  const topProducts = Object.entries(byProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const topCustomers = Object.entries(byCustomer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({
      name: customerMap.get(id)?.customer_name || id,
      value,
    }));

  const monthlyTrend = Object.entries(monthly)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, value]) => ({ month, value }));

  const categoryBreakdown = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const channelBreakdown = Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const tierBreakdown = Object.entries(tierDist)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  return {
    kpis: {
      totalRevenue,
      grossProfit,
      marginPct,
      orderCount,
      customerCount: customers.length,
      productCount: products.length,
      avgOrderValue,
      totalStock,
      totalRows:
        products.length +
        customers.length +
        orders.length +
        items.length,
    },
    monthlyTrend,
    categoryBreakdown,
    channelBreakdown,
    tierBreakdown,
    topProducts,
    topCustomers,
    lowStock,
  };
}

async function loadSampleTables() {
  const dataset = { source: "sample", loadedAt: new Date().toISOString() };

  for (const def of Object.values(ERP_TABLES)) {
    const res = await fetch(`${SAMPLE_BASE}${def.file}`);
    if (!res.ok) throw new Error(`샘플 파일을 불러오지 못했습니다: ${def.file}`);
    const text = await res.text();
    dataset[def.key] = parseTableFromCSV(text);
  }

  return dataset;
}

function isExcelFile(fileName) {
  return /\.(xlsx|xls)$/i.test(fileName || "");
}

function isCsvFile(fileName) {
  return /\.csv$/i.test(fileName || "");
}

function rowsToTable(headers, rows) {
  const cleanHeaders = headers.map((h) => String(h ?? "").trim());
  const cleanRows = rows
    .map((row) => cleanHeaders.map((_, i) => String(row[i] ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  const objects = cleanRows.map((row) => {
    const obj = {};
    cleanHeaders.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
  return { headers: cleanHeaders, rows: cleanRows, objects };
}

let xlsxLoadPromise = null;

function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLoadPromise) return xlsxLoadPromise;

  xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error("Excel 라이브러리 초기화에 실패했습니다."));
    };
    script.onerror = () => reject(new Error("Excel 라이브러리를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });

  return xlsxLoadPromise;
}

async function parseTableFromExcel(file) {
  const XLSX = await loadXlsxLib();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`${file.name}: 시트가 비어 있습니다.`);
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (!matrix.length) {
    throw new Error(`${file.name}: 데이터가 없습니다.`);
  }
  const headers = matrix[0].map((h) => String(h).trim());
  const rows = matrix.slice(1);
  return rowsToTable(headers, rows);
}

async function parseTableFromFile(file) {
  const name = file.name || "";
  if (isExcelFile(name)) {
    return parseTableFromExcel(file);
  }
  if (isCsvFile(name) || !/\.[a-z0-9]+$/i.test(name)) {
    const text = await file.text();
    const parsed = parseTableFromCSV(text);
    return {
      headers: parsed.headers,
      rows: parsed.rows,
      objects: parsed.objects,
    };
  }
  throw new Error(`${name}: CSV 또는 Excel(.xlsx, .xls) 파일만 지원합니다.`);
}

function detectFileTable(fileName) {
  const base = String(fileName || "")
    .toLowerCase()
    .replace(/\.(csv|xlsx|xls)$/i, "");

  if (base === "products" || base === "product" || base.includes("product")) return "products";
  if (base === "customers" || base === "customer" || base.includes("customer")) return "customers";
  if (
    base === "sales_order_items" ||
    base.includes("order_item") ||
    base.includes("order-item") ||
    base.includes("orderitems")
  ) {
    return "sales_order_items";
  }
  if (base === "sales_orders" || base.includes("sales_order") || base.includes("order")) {
    return "sales_orders";
  }
  return null;
}

function getEmptyDataset() {
  const dataset = { source: null, loadedAt: null };
  for (const def of Object.values(ERP_TABLES)) {
    dataset[def.key] = { headers: [], rows: [], objects: [] };
  }
  return dataset;
}

function getTableSummary(dataset) {
  const summary = {};
  for (const def of Object.values(ERP_TABLES)) {
    const count = dataset[def.key]?.objects?.length || 0;
    summary[def.key] = {
      label: def.label,
      file: def.file,
      loaded: count > 0,
      rowCount: count,
    };
  }
  return summary;
}

window.ErpData = {
  ERP_TABLES,
  ERP_STORAGE_KEY,
  SAMPLE_BASE,
  parseCSV,
  parseTableFromCSV,
  parseTableFromFile,
  isExcelFile,
  isCsvFile,
  validateDataset,
  buildAnalytics,
  loadSampleTables,
  detectFileTable,
  getEmptyDataset,
  getTableSummary,
  parseNumber,
};
