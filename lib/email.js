function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DOMAIN_PRESETS = {
  "naver.com": "naver",
  "outlook.com": "outlook",
  "outlook.kr": "outlook",
  "hotmail.com": "outlook",
  "live.com": "outlook",
  "gmail.com": "gmail",
  "googlemail.com": "gmail",
};

const SMTP_PROFILES = {
  naver: [
    {
      host: "smtp.naver.com",
      port: 587,
      secure: false,
      requireTLS: true,
      fromPlain: true,
    },
    {
      host: "smtp.naver.com",
      port: 465,
      secure: true,
      fromPlain: true,
    },
  ],
  outlook: [
    {
      host: "smtp-mail.outlook.com",
      port: 587,
      secure: false,
      requireTLS: true,
      fromPlain: false,
    },
  ],
  gmail: [
    {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      fromPlain: false,
    },
  ],
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

function buildReportText(report, query) {
  const sections = (report.sections || [])
    .map((section) => `[${section.heading}]\n${section.content}`)
    .join("\n\n");

  const takeaways = (report.keyTakeaways || []).map((item) => `- ${item}`).join("\n");

  return [
    report.title,
    "",
    report.executiveSummary,
    "",
    `검색 주제: ${query}`,
    "",
    sections,
    "",
    "핵심 포인트",
    takeaways,
  ].join("\n");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function detectSmtpPreset(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  return DOMAIN_PRESETS[domain] || null;
}

function normalizePassword(password) {
  return String(password || "").replace(/\s/g, "");
}

function formatSmtpError(err, preset) {
  const message = err?.response || err?.message || String(err);

  if (/535|534|EAUTH|Authentication failed|Username and Password not accepted/i.test(message)) {
    if (preset === "naver") {
      return (
        "네이버 인증에 실패했습니다. ① POP3/IMAP·SMTP '사용함' ② 2단계 인증 ③ 애플리케이션 비밀번호(공백 없이) 를 확인해 주세요. " +
        "네이버 메일 환경설정에서 POP3/SMTP를 '사용 안 함'으로 바꿨다가 다시 '사용함'으로 저장해야 할 수 있습니다."
      );
    }
    return "메일 앱 비밀번호가 올바르지 않습니다. 앱 비밀번호를 다시 발급해 입력해 주세요.";
  }

  if (/ECONNECTION|ETIMEDOUT|ESOCKET|connect|timeout/i.test(message)) {
    if (preset === "naver") {
      return (
        "네이버 메일 서버에 연결하지 못했습니다. Vercel(클라우드) 환경에서 네이버 SMTP가 차단될 수 있습니다. " +
        "아래 '보고서 파일 저장'으로 받거나 Outlook/Gmail으로 시도해 보세요."
      );
    }
    return "메일 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return message;
}

function createTransporter(profile, email, password) {
  const nodemailer = require("nodemailer");

  return nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    requireTLS: profile.requireTLS,
    auth: { user: email, pass: password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      minVersion: "TLSv1.2",
    },
  });
}

async function trySendWithProfile(profile, email, password, mailOptions) {
  const transporter = createTransporter(profile, email, password);
  await transporter.verify();
  return transporter.sendMail(mailOptions);
}

async function sendReportEmail({ toEmail, smtpPassword, report, query }) {
  if (!isValidEmail(toEmail)) {
    throw new Error("올바른 이메일 주소를 입력해 주세요.");
  }

  const password = normalizePassword(smtpPassword);
  if (!password || password.length < 4) {
    throw new Error("메일 앱 비밀번호를 입력해 주세요.");
  }

  const preset = detectSmtpPreset(toEmail);
  if (!preset) {
    throw new Error("지원하는 메일 주소만 사용할 수 있습니다. (네이버, Outlook, Gmail)");
  }

  const profiles = SMTP_PROFILES[preset];
  const html = buildReportHtml(report, query);
  const text = buildReportText(report, query);

  const mailOptions = {
    to: toEmail,
    subject: `[AI 뉴스] ${report.title}`,
    html,
    text,
  };

  let lastError = null;

  for (const profile of profiles) {
    mailOptions.from = profile.fromPlain ? toEmail : `"AI 뉴스" <${toEmail}>`;

    try {
      const info = await trySendWithProfile(profile, toEmail, password, mailOptions);
      return {
        provider: "smtp",
        preset,
        port: profile.port,
        messageId: info.messageId,
        accepted: info.accepted,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(formatSmtpError(lastError, preset));
}

module.exports = {
  buildReportHtml,
  buildReportText,
  isValidEmail,
  detectSmtpPreset,
  sendReportEmail,
};
