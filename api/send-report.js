const { setCorsHeaders, handlePreflight } = require("../lib/gemini");
const { isValidEmail, sendReportEmail } = require("../lib/email");

module.exports = async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return res.status(500).json({
      error:
        "RESEND_API_KEY 환경변수가 설정되지 않았습니다. Vercel Settings → Environment Variables에서 추가한 뒤 Redeploy해 주세요.",
    });
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

    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "AI 뉴스 <onboarding@resend.dev>";

    await sendReportEmail({
      apiKey: resendApiKey,
      fromEmail,
      toEmail: trimmedEmail,
      report,
      query: trimmedQuery || report.title,
    });

    return res.status(200).json({
      success: true,
      message: `${trimmedEmail}(으)로 보고서를 전송했습니다.`,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "이메일 전송 중 오류가 발생했습니다.",
    });
  }
};
