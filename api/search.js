const {
  getRecentNewsDateRange,
  isWithinRecentNewsRange,
  callGeminiWithSearch,
  setCorsHeaders,
  handlePreflight,
} = require("./lib/gemini");

function buildSearchPrompt(query, today, fromDate) {
  return `다음 주제에 대한 최신 뉴스를 Google 검색으로 찾아 분석하세요.

검색 주제: ${query}
오늘 날짜(한국): ${today}
수집 기간: ${fromDate} ~ ${today} (최근 2주 이내)

요구사항:
1. 해당 주제와 관련된 최신 뉴스 기사 5~8건을 찾으세요.
2. 반드시 발행일(publishedAt)이 ${fromDate} 이후이고 ${today} 이전인 기사만 포함하세요. 2주보다 오래된 기사는 제외하세요.
3. 한국어 뉴스를 우선하되, 주제에 따라 해외 뉴스도 포함할 수 있습니다.
4. 각 기사마다 한국어로 핵심 1~2문장 요약(summary)을 작성하세요.
5. url은 실제 기사 URL을 사용하세요. grounding 검색 결과의 출처 URL을 활용하세요.
6. source는 언론사명, publishedAt은 YYYY-MM-DD 형식(반드시 기재, 알 수 없으면 해당 기사는 제외).

반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 포함하지 마세요.
{
  "query": "검색 주제",
  "articles": [
    {
      "title": "기사 제목",
      "url": "https://...",
      "source": "언론사명",
      "publishedAt": "YYYY-MM-DD",
      "summary": "핵심 1~2문장 요약"
    }
  ]
}`;
}

function enrichArticlesWithSources(articles, groundingSources) {
  return articles.map((article, index) => {
    const fallback = groundingSources[index] || groundingSources[0];
    return {
      title: article.title || fallback?.title || "제목 없음",
      url: article.url || fallback?.uri || "#",
      source: article.source || "출처 미상",
      publishedAt: article.publishedAt || "",
      summary: article.summary || "",
    };
  });
}

function filterRecentArticles(articles, fromDate, toDate) {
  return articles.filter((article) =>
    isWithinRecentNewsRange(article.publishedAt, fromDate, toDate)
  );
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
      error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Vercel Settings → Environment Variables에서 추가해 주세요.",
    });
  }

  try {
    const { query } = req.body || {};
    const trimmedQuery = String(query || "").trim();

    if (!trimmedQuery) {
      return res.status(400).json({ error: "검색어를 입력해 주세요." });
    }

    if (trimmedQuery.length > 200) {
      return res.status(400).json({ error: "검색어는 200자 이내로 입력해 주세요." });
    }

    const { today, fromDate } = getRecentNewsDateRange();
    const result = await callGeminiWithSearch(apiKey, {
      systemInstruction:
        `당신은 한국어 뉴스 검색 및 요약 전문가입니다. Google 검색 도구를 사용해 최신 뉴스를 찾고, 사실에 기반한 간결한 요약을 제공합니다. 오늘(${today}) 기준 최근 2주(${fromDate}~${today}) 이내 기사만 수집하세요. 응답은 반드시 JSON만 출력하세요.`,
      prompt: buildSearchPrompt(trimmedQuery, today, fromDate),
    });

    if (!result.ok) {
      return res.status(result.error.status).json(result.error.body);
    }

    const articles = filterRecentArticles(
      enrichArticlesWithSources(result.parsed.articles || [], result.grounding.sources),
      fromDate,
      today
    );

    return res.status(200).json({
      query: trimmedQuery,
      dateRange: { from: fromDate, to: today },
      articles,
      sources: result.grounding.sources,
      searchEntryPoint: result.grounding.searchEntryPoint,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "서버 오류가 발생했습니다.",
    });
  }
};
