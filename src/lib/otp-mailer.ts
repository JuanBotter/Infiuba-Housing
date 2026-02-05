const RESEND_API_URL = "https://api.resend.com/emails";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_DEV_CONSOLE_ONLY_EMAIL = "mock@email.com";

type OtpEmailFailureReason = "provider_unavailable" | "send_failed";

export interface SendLoginOtpInput {
  email: string;
  code: string;
  expiresMinutes: number;
}

export type SendLoginOtpResult =
  | { ok: true }
  | { ok: false; reason: OtpEmailFailureReason };

function resolveOtpProvider() {
  const configuredProvider = process.env.OTP_EMAIL_PROVIDER?.trim().toLowerCase();
  if (configuredProvider) {
    return configuredProvider;
  }

  return process.env.NODE_ENV === "production" ? "" : "console";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function redactEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!domain) {
    return value;
  }
  const visible = local ? local[0] : "";
  return `${visible}***@${domain}`;
}

function resolveConsoleOnlyOtpEmail() {
  const configured = process.env.OTP_CONSOLE_ONLY_EMAIL?.trim();
  if (configured) {
    return normalizeEmail(configured);
  }

  return process.env.NODE_ENV === "production" ? "" : DEFAULT_DEV_CONSOLE_ONLY_EMAIL;
}

function shouldForceConsoleDelivery(email: string) {
  const consoleOnlyEmail = resolveConsoleOnlyOtpEmail();
  if (!consoleOnlyEmail) {
    return false;
  }

  return normalizeEmail(email) === consoleOnlyEmail;
}

function buildOtpEmailContent(input: SendLoginOtpInput) {
  const subject = `Your Infiuba Housing access code: ${input.code}`;
  const text = [
    `Your one-time access code is: ${input.code}`,
    `This code expires in ${input.expiresMinutes} minutes.`,
    "",
    "If you did not request this code, you can safely ignore this email.",
    "",
    "Infiuba Housing Hub",
  ].join("\n");

  const html = [
    "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;\">",
    "  <p>Your one-time access code is:</p>",
    `  <p style=\"font-size:28px;font-weight:700;letter-spacing:0.22em;margin:8px 0 14px;\">${input.code}</p>`,
    `  <p>This code expires in <strong>${input.expiresMinutes} minutes</strong>.</p>`,
    "  <p>If you did not request this code, you can safely ignore this email.</p>",
    "  <p style=\"margin-top:18px;\">Infiuba Housing Hub</p>",
    "</div>",
  ].join("\n");

  return { subject, text, html };
}

function parseFromIdentity(rawValue: string | undefined) {
  const value = rawValue?.trim();
  if (!value) {
    return null;
  }

  const bracketMatch = /^(.*)<([^<>]+)>$/.exec(value);
  if (bracketMatch) {
    const name = bracketMatch[1]?.trim().replace(/^"(.*)"$/, "$1");
    const email = bracketMatch[2]?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return null;
    }
    return {
      name: name || undefined,
      email,
    };
  }

  const email = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return {
    name: undefined,
    email,
  };
}

async function sendViaResend(input: SendLoginOtpInput): Promise<SendLoginOtpResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromIdentity = parseFromIdentity(
    process.env.RESEND_FROM_EMAIL?.trim() || process.env.OTP_FROM_EMAIL?.trim(),
  );
  if (!apiKey || !fromIdentity) {
    console.warn("[OTP] Resend provider unavailable", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(fromIdentity),
    });
    return { ok: false, reason: "provider_unavailable" };
  }

  const content = buildOtpEmailContent(input);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromIdentity.name ? `${fromIdentity.name} <${fromIdentity.email}>` : fromIdentity.email,
      to: [input.email],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    const errorBody = await response?.text().catch(() => "");
    console.warn("[OTP] Resend send failed", {
      to: redactEmail(input.email),
      status: response?.status,
      statusText: response?.statusText,
      response: errorBody?.slice(0, 500),
    });
    return { ok: false, reason: "send_failed" };
  }

  return { ok: true };
}

async function sendViaBrevo(input: SendLoginOtpInput): Promise<SendLoginOtpResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const fromIdentity = parseFromIdentity(
    process.env.BREVO_FROM_EMAIL?.trim() || process.env.OTP_FROM_EMAIL?.trim(),
  );
  if (!apiKey || !fromIdentity) {
    console.warn("[OTP] Brevo provider unavailable", {
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(fromIdentity),
    });
    return { ok: false, reason: "provider_unavailable" };
  }

  const content = buildOtpEmailContent(input);
  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        email: fromIdentity.email,
        ...(fromIdentity.name ? { name: fromIdentity.name } : {}),
      },
      to: [{ email: input.email }],
      subject: content.subject,
      textContent: content.text,
      htmlContent: content.html,
    }),
  }).catch(() => null);

  if (!response || !response.ok) {
    const errorBody = await response?.text().catch(() => "");
    console.warn("[OTP] Brevo send failed", {
      to: redactEmail(input.email),
      status: response?.status,
      statusText: response?.statusText,
      response: errorBody?.slice(0, 500),
    });
    return { ok: false, reason: "send_failed" };
  }

  return { ok: true };
}

function sendToConsole(input: SendLoginOtpInput): SendLoginOtpResult {
  console.info(
    `[OTP console delivery] email=${input.email} code=${input.code} expiresInMinutes=${input.expiresMinutes}`,
  );
  return { ok: true };
}

export async function sendLoginOtp(input: SendLoginOtpInput): Promise<SendLoginOtpResult> {
  if (shouldForceConsoleDelivery(input.email)) {
    return sendToConsole(input);
  }

  const provider = resolveOtpProvider();
  if (provider === "brevo") {
    return sendViaBrevo(input);
  }
  if (provider === "resend") {
    return sendViaResend(input);
  }
  if (provider === "console") {
    return sendToConsole(input);
  }

  console.warn("[OTP] No OTP email provider configured", {
    provider: provider || "unset",
  });
  return { ok: false, reason: "provider_unavailable" };
}
