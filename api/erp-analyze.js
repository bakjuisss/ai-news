const {
  callGemini,
  getTodayKST,
  setCorsHeaders,
  handlePreflight,
} = require("../lib/gemini");

const MAX_SAMPLE_ROWS = 80;

function buildErpPrompt(datasetName, today, stats, sampleRows, focus) {
  const columnSummary = (stats.columns || [])
    .map((col) => {
      let detail = `- ${col.name} (${col.type})`;
      if (col.type === "number") {
        detail += `: 합계 ${col.sum}, 평균 ${col.avg}, 최소 ${col.min}, 최대 ${col.max}`;
      } else if (col.topValues?.length) {
        detail += `: 상위값 ${col.topValues.map((v) => `${v.value}(${v.count})`).join(", ")}`;
      } else {
        detail += `: 고유값 ${col.uniqueCount}개`;
      }
      return detail;
    })
    .join("\n");

  const rowsPreview = sampleRows
    .slice(0, MAX_SAMPLE_ROWS)
    .map((row, i) => `${i + 1}. ${row.join(" | ")}`)
    .join("\n");

  const focusLine = focus ? `\n분석 초점: ${focus}` : "";

  return `다음 ERP/경영 데이터를 분석하여 경영 보고서를 작성하세요.

데이터셋 이름: ${datasetName || "미지정"}
분석 기준일(한국): ${today}
총 행 수: ${stats.rowCount}
컬럼 수: ${stats.columnCount}
${focusLine}

컬럼 통계:
${columnSummary || "(없음)"}

샘플 데이터 (최대 ${MAX_SAMPLE_ROWS}행):
${rowsPreview || "(없음)"}

요구사항:
1. 제공된 통계와 샘플 데이터만 근거로 분석하세요. 없는 수치를 만들지 마세요.
2. sections에는 "데이터 개요", "핵심 지표 분석", "리스크 및 이상 징후", "개선 제안"을 포함하세요.
3. executiveSummary는 2~3문장으로 작성하세요.
4. keyTakeaways는 3~5개 핵심 인사이트를 나열하세요.
5. recommendations는 실행 가능한 제안 3~5개를 구체적으로 작성하세요.
6. 전체를 한국어로 작성하세요.

반드시 아래 JSON 형식만 출력하세요.
{
  "title": "보고서 제목",
  "executiveSummary": "전체 요약",
  "sections": [
    { "heading": "데이터 개요", "content": "..." },
    { "heading": "핵심 지표 분석", "content": "..." },
    { "heading": "리스크 및 이상 징후", "content": "..." },
    { "heading": "개선 제안", "content": "..." }
  ],
  "keyTakeaways": ["...", "..."],
  "recommendations": ["...", "..."]
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
        "GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Vercel Settings → Environment Variables에서 추가한 뒤 Redeploy 해 주세요.",
    });
  }

  try {
    const { datasetName, stats, sampleRows = [], focus = "" } = req.body || {};

    if (!stats?.rowCount || stats.rowCount < 1) {
      return res.status(400).json({ error: "분석할 데이터가 없습니다. 먼저 데이터를 입력하거나 업로드해 주세요." });
    }

    const today = getTodayKST();
    const result = await callGemini(apiKey, {
      systemInstruction:
        "당신은 ERP 및 경영 데이터 분석 전문가입니다. 제공된 데이터 통계와 샘플만을 근거로 객관적인 분석 보고서를 작성합니다. JSON만 출력하세요.",
      prompt: buildErpPrompt(datasetName, today, stats, sampleRows, String(focus || "").trim()),
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
