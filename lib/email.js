function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SMTP_PRESETS = {
  naver: { host: "smtp.naver.com", port: 465, secure: true },
  outlook: { host: "smtp-mail.outlook.com", port: 587, secure: false },
  gmail: { host: "smtp.gmail.com", port: 587, secure: false },
};

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

function getSmtpConfig() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const preset = (process.env.SMTP_PRESET || "custom").toLowerCase();
  const presetConfig = SMTP_PRESETS[preset] || {};

  const host = process.env.SMTP_HOST || presetConfig.host;
  const port = Number(process.env.SMTP_PORT || presetConfig.port);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === "true"
      : presetConfig.secure ?? false;

  if (!host || !port) {
    return null;
  }

  const fromName = process.env.SMTP_FROM_NAME || "AI 뉴스";

  return {
    host,
    port,
    secure,
    auth: { user, pass },
    from: `"${fromName}" <${user}>`,
    preset,
  };
}

function formatSmtpError(err) {
  const message = err?.message || String(err);

  if (/Invalid login|Authentication failed|535|534/i.test(message)) {
    return (
      "SMTP 로그인에 실패했습니다. SMTP_USER·SMTP_PASS(앱 비밀번호)를 확인해 주세요. " +
      "네이버는 POP3/IMAP 설정 후 앱 비밀번호, Outlook/Gmail은 2단계 인증 후 앱 비밀번호가 필요합니다."
    );
  }

  if (/ECONNECTION|ETIMEDOUT|ESOCKET|connect/i.test(message)) {
    return (
      "SMTP 서버에 연결하지 못했습니다. SMTP_PRESET(naver/outlook/gmail) 또는 SMTP_HOST·SMTP_PORT 설정을 확인해 주세요."
    );
  }

  return message;
}

async function sendReportEmail({ toEmail, report, query }) {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig) {
    throw new Error(
      "SMTP가 설정되지 않았습니다. Vercel에 SMTP_USER, SMTP_PASS, SMTP_PRESET(naver/outlook/gmail)을 추가한 뒤 Redeploy해 주세요."
    );
  }

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  const html = buildReportHtml(report, query);

  try {
    const info = await transporter.sendMail({
      from: smtpConfig.from,
      to: toEmail,
      subject: `[AI 뉴스] ${report.title}`,
      html,
    });

    return { provider: "smtp", messageId: info.messageId, preset: smtpConfig.preset };
  } catch (err) {
    throw new Error(formatSmtpError(err));
  }
}

module.exports = {
  buildReportHtml,
  isValidEmail,
  getSmtpConfig,
  sendReportEmail,
};
