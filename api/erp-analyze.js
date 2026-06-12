const {
  callGemini,
  getTodayKST,
  setCorsHeaders,
  handlePreflight,
} = require("../lib/gemini");

function formatKRW(n) {
  if (n == null || Number.isNaN(n)) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(n)) + "원";
}

function buildErpPrompt(datasetName, today, stats, focus) {
  const tables = stats.tables || {};
  const tableSummary = Object.entries(tables)
    .map(([key, t]) => `- ${t.label || key}: ${t.rowCount}행`)
    .join("\n");

  const a = stats.analytics || {};
  const k = a.kpis || {};

  const kpiBlock = `
총 매출: ${formatKRW(k.totalRevenue)}
매출총이익: ${formatKRW(k.grossProfit)} (이익률 ${k.marginPct?.toFixed?.(1) || "-"}%)
주문 건수: ${k.orderCount || "-"}
평균 객단가: ${formatKRW(k.avgOrderValue)}
고객 수: ${k.customerCount || "-"} / 상품 수: ${k.productCount || "-"}
총 재고 수량: ${k.totalStock || "-"}
`;

  const topProducts = (a.topProducts || [])
    .slice(0, 5)
    .map((p) => `${p.name}: ${formatKRW(p.value)}`)
    .join(", ");

  const topCustomers = (a.topCustomers || [])
    .slice(0, 5)
    .map((c) => `${c.name}: ${formatKRW(c.value)}`)
    .join(", ");

  const monthly = (a.monthlyTrend || [])
    .slice(-6)
    .map((m) => `${m.month}: ${formatKRW(m.value)}`)
    .join(", ");

  const focusLine = focus ? `\n분석 초점: ${focus}` : "";

  return `다음 ERP 4-테이블 데이터(상품·고객·주문·주문상세) 분석 보고서를 작성하세요.

데이터셋: ${datasetName || "ERP 데이터"}
분석 기준일(한국): ${today}
총 행 수: ${stats.rowCount || "-"}
${focusLine}

테이블별 행 수:
${tableSummary}

핵심 KPI:
${kpiBlock}

월별 매출(최근): ${monthly || "없음"}
상위 상품: ${topProducts || "없음"}
상위 고객: ${topCustomers || "없음"}

요구사항:
1. 위 수치만 근거로 분석하세요. 없는 수치를 만들지 마세요.
2. sections: "경영 요약", "매출·수익성 분석", "고객·채널 인사이트", "재고·리스크", "개선 제안"
3. executiveSummary 2~3문장, keyTakeaways 3~5개, recommendations 3~5개
4. 한국어로 작성

JSON만 출력:
{
  "title": "보고서 제목",
  "executiveSummary": "...",
  "sections": [{"heading":"...","content":"..."}],
  "keyTakeaways": ["..."],
  "recommendations": ["..."]
}`;
}

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY가 설정되지 않았습니다. Vercel에서 추가 후 Redeploy 해 주세요.",
    });
  }

  try {
    const { datasetName, stats, focus = "" } = req.body || {};

    if (!stats?.analytics?.kpis) {
      return res.status(400).json({
        error: "분석할 ERP 데이터가 없습니다. 4개 CSV를 업로드하고 검증을 완료해 주세요.",
      });
    }

    const today = getTodayKST();
    const result = await callGemini(apiKey, {
      systemInstruction:
        "당신은 ERP 경영 데이터 분석 전문가입니다. 제공된 KPI와 집계만 근거로 객관적인 보고서를 작성합니다. JSON만 출력하세요.",
      prompt: buildErpPrompt(datasetName, today, stats, String(focus || "").trim()),
      temperature: 0.3,
    });

    if (!result.ok) {
      return res.status(result.error.status).json(result.error.body);
    }

    return res.status(200).json({
      datasetName: datasetName || "ERP 데이터",
      analyzedAt: today,
      title: result.parsed.title,
      executiveSummary: result.parsed.executiveSummary,
      sections: result.parsed.sections || [],
      keyTakeaways: result.parsed.keyTakeaways || [],
      recommendations: result.parsed.recommendations || [],
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "서버 오류가 발생했습니다.",
    });
  }
};
