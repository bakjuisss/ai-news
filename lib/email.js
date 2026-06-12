function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseFromAddress(from) {
  const value = String(from || "").trim();
  const match = value.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { name: "AI 뉴스", email: value };
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

function formatEmailError(provider, data, status) {
  const raw = data?.message || data?.error || data?.detail || "";

  if (/only send testing emails|your own email address/i.test(raw)) {
    return (
      "Resend 테스트 모드에서는 가입 이메일로만 전송할 수 있습니다. " +
      "네이버·Outlook 등으로 받으려면 Vercel에 BREVO_API_KEY와 BREVO_FROM_EMAIL을 설정해 주세요."
    );
  }

  if (/sender.*not verified|not authorised|unverified/i.test(raw)) {
    return (
      "발신 이메일이 인증되지 않았습니다. " +
      "Brevo(또는 Resend) 대시보드에서 발신 주소 인증 후 Redeploy해 주세요."
    );
  }

  if (status === 401 || status === 403) {
    return `${provider} API 키가 올바르지 않거나 권한이 없습니다. Vercel 환경변수를 확인해 주세요.`;
  }

  return raw || "이메일 전송에 실패했습니다.";
}

async function sendViaBrevo({ apiKey, fromEmail, fromName, toEmail, report, query }) {
  const html = buildReportHtml(report, query);
  const sender = parseFromAddress(fromEmail);
  if (fromName) sender.name = fromName;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: toEmail }],
      subject: `[AI 뉴스] ${report.title}`,
      htmlContent: html,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(formatEmailError("Brevo", data, res.status));
  }

  return { provider: "brevo", data };
}

async function sendViaResend({ apiKey, fromEmail, toEmail, report, query }) {
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
    throw new Error(formatEmailError("Resend", data, res.status));
  }

  return { provider: "resend", data };
}

function getEmailProviderConfig() {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const brevoFromEmail = process.env.BREVO_FROM_EMAIL;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (brevoApiKey && brevoFromEmail) {
    return {
      provider: "brevo",
      apiKey: brevoApiKey,
      fromEmail: brevoFromEmail,
      fromName: process.env.BREVO_FROM_NAME || "AI 뉴스",
    };
  }

  if (resendApiKey) {
    return {
      provider: "resend",
      apiKey: resendApiKey,
      fromEmail: process.env.RESEND_FROM_EMAIL || "AI 뉴스 <onboarding@resend.dev>",
    };
  }

  return null;
}

async function sendReportEmail({ toEmail, report, query }) {
  const config = getEmailProviderConfig();

  if (!config) {
    throw new Error(
      "이메일 API가 설정되지 않았습니다. Vercel에 BREVO_API_KEY와 BREVO_FROM_EMAIL(권장) 또는 RESEND_API_KEY를 추가한 뒤 Redeploy해 주세요."
    );
  }

  if (config.provider === "brevo") {
    return sendViaBrevo({
      apiKey: config.apiKey,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      toEmail,
      report,
      query,
    });
  }

  return sendViaResend({
    apiKey: config.apiKey,
    fromEmail: config.fromEmail,
    toEmail,
    report,
    query,
  });
}

module.exports = {
  buildReportHtml,
  isValidEmail,
  getEmailProviderConfig,
  sendReportEmail,
};
