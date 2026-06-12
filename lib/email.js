function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(report, query) {
  const sectionsHtml = (report.sections || [])
    .map(
      (section) => `
      <div style="margin-bottom:20px;">
        <h3 style="margin:0 0 8px;color:#1d4ed8;font-size:16px;">${escapeHtml(section.heading)}</h3>
        <p style="margin:0;line-height:1.6;color:#333;">${escapeHtml(section.content)}</p>
      </div>
    `
    )
    .join("");

  const takeawaysHtml = (report.keyTakeaways || [])
    .map((item) => `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`)
    .join("");

  const sourcesHtml = (report.sources || [])
    .map(
      (source) =>
        `<li style="margin-bottom:4px;"><a href="${escapeHtml(source.uri)}" style="color:#1d4ed8;">${escapeHtml(source.title)}</a></li>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#f5f4f0;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e0da;border-radius:12px;padding:28px;">
    <p style="margin:0 0 4px;font-size:13px;color:#5c5c5c;">AI 뉴스 검색 · 종합 보고서</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a1a;">${escapeHtml(report.title)}</h1>
    <p style="margin:0 0 20px;padding:12px 16px;background:#eff6ff;border-radius:8px;font-size:14px;line-height:1.6;">
      ${escapeHtml(report.executiveSummary)}
    </p>
    <p style="margin:0 0 20px;font-size:13px;color:#5c5c5c;">검색 주제: ${escapeHtml(query)}</p>
    ${sectionsHtml}
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e0da;">
      <h3 style="margin:0 0 10px;font-size:15px;">핵심 포인트</h3>
      <ul style="margin:0;padding-left:20px;">${takeawaysHtml}</ul>
    </div>
    ${
      sourcesHtml
        ? `<div style="margin-top:24px;padding-top:20px;border-top:1px solid #e2e0da;">
      <h3 style="margin:0 0 10px;font-size:15px;">참고 출처</h3>
      <ul style="margin:0;padding-left:20px;">${sourcesHtml}</ul>
    </div>`
        : ""
    }
    <p style="margin:24px 0 0;font-size:12px;color:#888;">
      AI가 생성한 요약 및 보고서는 참고용이며, 원문 기사를 반드시 확인하세요.
    </p>
  </div>
</body>
</html>`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendReportEmail({ apiKey, fromEmail, toEmail, report, query }) {
  const html = buildReportHtml(report, query);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `[AI 뉴스] ${report.title}`,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.message || data?.error || "이메일 전송에 실패했습니다.";
    throw new Error(message);
  }

  return data;
}

module.exports = {
  buildReportHtml,
  isValidEmail,
  sendReportEmail,
};
