const {
  getRecentNewsDateRange,
  callGeminiWithSearch,
  setCorsHeaders,
  handlePreflight,
} = require("./lib/gemini");

function buildReportPrompt(query, today, fromDate, articles) {
  const articleContext = articles
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.title}\n   URL: ${a.url}\n   요약: ${a.summary}`
    )
    .join("\n\n");

  return `다음 주제에 대한 종합 뉴스 분석 보고서를 작성하세요.

주제: ${query}
오늘 날짜(한국): ${today}
분석 기간: ${fromDate} ~ ${today} (최근 2주 이내)

이미 수집된 기사 목록:
${articleContext || "(기사 없음 — Google 검색으로 추가 정보를 수집하세요)"}

요구사항:
1. 위 기사들과 추가 검색 결과를 종합한 분석 보고서를 작성하세요.
2. 추가 검색 시 ${fromDate} 이후, ${today} 이전에 발행된 기사만 참고하세요.
3. sections에는 "현황", "핵심 쟁점", "향후 전망" 섹션을 포함하세요.
4. executiveSummary는 전체를 2~3문장으로 요약하세요.
5. keyTakeaways는 핵심 포인트 3~5개를 나열하세요.
6. 사실과 추론을 구분하고, 한국어로 작성하세요.

반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 포함하지 마세요.
{
  "title": "보고서 제목",
  "executiveSummary": "전체 2~3문장 요약",
  "sections": [
    { "heading": "현황", "content": "..." },
    { "heading": "핵심 쟁점", "content": "..." },
    { "heading": "향후 전망", "content": "..." }
  ],
  "keyTakeaways": ["핵심 포인트 1", "핵심 포인트 2"]
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
      error:
        "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Vercel Settings → Environment Variables에서 추가한 뒤, 반드시 Redeploy(재배포)를 실행해 주세요. 환경변수 추가만으로는 기존 배포에 반영되지 않습니다.",
    });
  }

  try {
    const { query, articles = [] } = req.body || {};
    const trimmedQuery = String(query || "").trim();

    if (!trimmedQuery) {
      return res.status(400).json({ error: "검색 주제가 필요합니다." });
    }

    const { today, fromDate } = getRecentNewsDateRange();
    const result = await callGeminiWithSearch(apiKey, {
      systemInstruction:
        `당신은 뉴스 분석 보고서 작성 전문가입니다. Google 검색과 제공된 기사를 바탕으로 객관적이고 구조화된 분석 보고서를 작성합니다. 오늘(${today}) 기준 최근 2주(${fromDate}~${today}) 이내 기사만 참고하세요. 응답은 반드시 JSON만 출력하세요.`,
      prompt: buildReportPrompt(trimmedQuery, today, fromDate, articles),
    });

    if (!result.ok) {
      return res.status(result.error.status).json(result.error.body);
    }

    return res.status(200).json({
      query: trimmedQuery,
      title: result.parsed.title,
      executiveSummary: result.parsed.executiveSummary,
      sections: result.parsed.sections || [],
      keyTakeaways: result.parsed.keyTakeaways || [],
      sources: result.grounding.sources,
      searchEntryPoint: result.grounding.searchEntryPoint,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "서버 오류가 발생했습니다.",
    });
  }
};
