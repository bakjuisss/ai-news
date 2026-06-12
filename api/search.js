const {
  getRecentNewsDateRange,
  normalizePublishedDate,
  isWithinRecentNewsRange,
  callGeminiWithSearch,
  setCorsHeaders,
  handlePreflight,
} = require("../lib/gemini");

function buildSearchPrompt(query, today, fromDate) {
  return `다음 주제에 대한 최신 뉴스를 Google 검색으로 찾아 분석하세요.

검색 주제: ${query}
오늘 날짜(한국): ${today}
수집 기간: ${fromDate} ~ ${today} (최근 2주 이내)

요구사항:
1. 해당 주제와 관련된 최신 뉴스 기사 5~8건을 찾으세요.
2. 가능하면 발행일(publishedAt)이 ${fromDate}~${today} 사이인 최신 기사를 우선하세요.
3. 한국어·영문 뉴스 모두 포함할 수 있습니다.
4. title과 summary는 항상 한국어로 작성하세요. 영문 기사는 번역하고 originalTitle에 원문 제목, language에 "en"을 넣으세요.
5. 한국어 기사는 language를 "ko", originalTitle은 빈 문자열로 하세요.
6. url은 실제 기사 URL, source는 언론사명, publishedAt은 YYYY-MM-DD(모르면 빈 문자열).

반드시 아래 JSON 형식만 출력하세요. articles 배열에 최소 3건 이상 넣으세요.
{
  "query": "검색 주제",
  "articles": [
    {
      "title": "한국어 제목",
      "originalTitle": "",
      "language": "ko",
      "url": "https://...",
      "source": "언론사명",
      "publishedAt": "YYYY-MM-DD",
      "summary": "한국어 1~2문장 요약"
    }
  ]
}`;
}

function enrichArticlesWithSources(articles, groundingSources) {
  return articles.map((article, index) => {
    const fallback = groundingSources[index] || groundingSources[0];
    const language = String(article.language || "ko").toLowerCase();
    const originalTitle = String(article.originalTitle || "").trim();

    return {
      title: article.title || fallback?.title || "제목 없음",
      originalTitle: language !== "ko" && originalTitle ? originalTitle : "",
      language,
      translated: language !== "ko" && Boolean(originalTitle),
      url: article.url || fallback?.uri || "#",
      source: article.source || "출처 미상",
      publishedAt: normalizePublishedDate(article.publishedAt) || "",
      summary: article.summary || "",
    };
  });
}

function applyRecentFilter(articles, fromDate, toDate) {
  const inRange = articles.filter((article) =>
    isWithinRecentNewsRange(article.publishedAt, fromDate, toDate)
  );

  if (inRange.length > 0) {
    return inRange;
  }

  const withoutDate = articles.filter(
    (article) => !normalizePublishedDate(article.publishedAt) && article.title
  );

  if (withoutDate.length > 0) {
    return withoutDate;
  }

  return articles;
}

function buildArticlesFromGrounding(groundingSources) {
  return groundingSources.slice(0, 8).map((source) => {
    let hostname = "출처 미상";
    try {
      hostname = new URL(source.uri).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }

    return {
      title: source.title || "제목 없음",
      originalTitle: "",
      language: "ko",
      translated: false,
      url: source.uri || "#",
      source: hostname,
      publishedAt: "",
      summary: "AI 요약을 생성하지 못했습니다. 원문 링크에서 기사를 확인해 주세요.",
    };
  });
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
        `당신은 한국어 뉴스 검색·번역·요약 전문가입니다. Google 검색 도구를 사용해 최신 뉴스를 찾고, 영문 기사는 한국어로 번역한 뒤 사실에 기반한 간결한 요약을 제공합니다. 오늘(${today}) 기준 최근 2주(${fromDate}~${today}) 이내 기사만 수집하세요. 응답은 반드시 JSON만 출력하세요.`,
      prompt: buildSearchPrompt(trimmedQuery, today, fromDate),
    });

    if (!result.ok) {
      return res.status(result.error.status).json(result.error.body);
    }

    let enriched = enrichArticlesWithSources(
      result.parsed.articles || [],
      result.grounding.sources
    );

    if (!enriched.length && result.grounding.sources?.length) {
      enriched = buildArticlesFromGrounding(result.grounding.sources);
    }

    const articles = applyRecentFilter(enriched, fromDate, today);

    return res.status(200).json({
      query: trimmedQuery,
      dateRange: { from: fromDate, to: today },
      articles,
      totalFound: enriched.length,
      filteredCount: enriched.length - articles.length,
      sources: result.grounding.sources,
      searchEntryPoint: result.grounding.searchEntryPoint,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "서버 오류가 발생했습니다.",
    });
  }
};
