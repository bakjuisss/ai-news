const MODEL = "gemini-2.5-flash";

function getTodayKST() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getDaysAgoKST(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getRecentNewsDateRange() {
  const today = getTodayKST();
  const fromDate = getDaysAgoKST(14);
  return { today, fromDate };
}

function isWithinRecentNewsRange(publishedAt, fromDate, toDate) {
  if (!publishedAt || !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    return false;
  }
  return publishedAt >= fromDate && publishedAt <= toDate;
}

function parseGeminiError(status, geminiData) {
  const message = geminiData?.error?.message || "Gemini API 호출에 실패했습니다.";
  const isRateLimit =
    status === 429 ||
    /quota exceeded|rate limit|resource_exhausted/i.test(message);

  if (isRateLimit) {
    const match = message.match(/retry in ([\d.]+)s/i);
    const retryAfterSeconds = match ? Math.ceil(parseFloat(match[1])) : 60;

    return {
      status: 429,
      body: {
        error: `AI 사용 한도에 도달했습니다. 약 ${retryAfterSeconds}초 후에 다시 시도해 주세요.`,
        code: "RATE_LIMIT",
        retryAfterSeconds,
      },
    };
  }

  return {
    status: status >= 400 && status < 600 ? status : 502,
    body: { error: message, code: "API_ERROR" },
  };
}

function parseGeminiResponse(text) {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("AI 응답을 파싱할 수 없습니다.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function extractGroundingMetadata(candidate) {
  const metadata = candidate?.groundingMetadata || {};
  const chunks = metadata.groundingChunks || [];
  const sources = chunks
    .filter((chunk) => chunk.web?.uri)
    .map((chunk) => ({
      title: chunk.web.title || chunk.web.uri,
      uri: chunk.web.uri,
    }));

  const uniqueSources = [];
  const seen = new Set();
  for (const source of sources) {
    if (!seen.has(source.uri)) {
      seen.add(source.uri);
      uniqueSources.push(source);
    }
  }

  const searchEntryPoint = metadata.searchEntryPoint?.renderedContent || null;

  return { sources: uniqueSources, searchEntryPoint };
}

async function callGeminiWithSearch(apiKey, { systemInstruction, prompt }) {
  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.4,
    },
  };

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  const geminiData = await geminiRes.json();

  if (!geminiRes.ok) {
    const parsedError = parseGeminiError(geminiRes.status, geminiData);
    return { ok: false, error: parsedError };
  }

  const candidate = geminiData?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;

  if (!text) {
    return {
      ok: false,
      error: {
        status: 502,
        body: { error: "AI 응답이 비어 있습니다.", code: "EMPTY_RESPONSE" },
      },
    };
  }

  const parsed = parseGeminiResponse(text);
  const grounding = extractGroundingMetadata(candidate);

  return { ok: true, parsed, grounding };
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function handlePreflight(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = {
  MODEL,
  getTodayKST,
  getDaysAgoKST,
  getRecentNewsDateRange,
  isWithinRecentNewsRange,
  parseGeminiError,
  parseGeminiResponse,
  extractGroundingMetadata,
  callGeminiWithSearch,
  setCorsHeaders,
  handlePreflight,
};
