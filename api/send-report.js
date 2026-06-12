const { setCorsHeaders, handlePreflight } = require("../lib/gemini");
const { isValidEmail, sendReportEmail } = require("../lib/email");

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  try {
    const { email, report, query } = req.body || {};
    const trimmedEmail = String(email || "").trim().toLowerCase();
    const trimmedQuery = String(query || "").trim();

    if (!trimmedEmail) {
      return res.status(400).json({ error: "이메일 주소를 입력해 주세요." });
    }

    if (!isValidEmail(trimmedEmail)) {
      return res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
    }

    if (!report?.title || !report?.executiveSummary) {
      return res.status(400).json({ error: "전송할 보고서가 없습니다. 먼저 종합 보고서를 생성해 주세요." });
    }

    const result = await sendReportEmail({
      toEmail: trimmedEmail,
      report,
      query: trimmedQuery || report.title,
    });

    return res.status(200).json({
      success: true,
      message: `${trimmedEmail}(으)로 보고서를 전송했습니다. 메일함과 스팸함을 확인해 주세요.`,
      provider: result.provider,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "이메일 전송 중 오류가 발생했습니다.",
    });
  }
};
