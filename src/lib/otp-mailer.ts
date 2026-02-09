import type { Lang } from "@/types";

const RESEND_API_URL = "https://api.resend.com/emails";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_DEV_CONSOLE_ONLY_EMAIL = "mock@email.com";

type OtpEmailFailureReason = "provider_unavailable" | "send_failed";

export interface SendLoginOtpInput {
  email: string;
  code: string;
  expiresMinutes: number;
  lang?: Lang;
  magicLinkUrl?: string;
  logoUrl?: string;
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface OtpEmailCopy {
  subjectPrefix: string;
  heading: string;
  magicLinkCta: string;
  magicLinkHint: string;
  codeLabel: string;
  expiresText: string;
  ignoreText: string;
  signature: string;
}

function buildOtpEmailCopy(lang: Lang | undefined, expiresMinutes: number): OtpEmailCopy {
  switch (lang) {
    case "es":
      return {
        subjectPrefix: "Tu código de acceso de Infiuba Housing",
        heading: "Usá este link para iniciar sesión con un clic:",
        magicLinkCta: "Entrar ahora",
        magicLinkHint: "Este link es válido una sola vez.",
        codeLabel: "Si el link no funciona, usá este código:",
        expiresText: `Este código vence en ${expiresMinutes} minutos.`,
        ignoreText: "Si no solicitaste este código, podés ignorar este email.",
        signature: "Infiuba Housing Hub",
      };
    case "fr":
      return {
        subjectPrefix: "Votre code d'accès Infiuba Housing",
        heading: "Utilisez ce lien pour vous connecter en un clic :",
        magicLinkCta: "Se connecter",
        magicLinkHint: "Ce lien est valable une seule fois.",
        codeLabel: "Si le lien ne fonctionne pas, utilisez ce code :",
        expiresText: `Ce code expire dans ${expiresMinutes} minutes.`,
        ignoreText: "Si vous n'avez pas demandé ce code, vous pouvez ignorer cet e-mail.",
        signature: "Infiuba Housing Hub",
      };
    case "de":
      return {
        subjectPrefix: "Dein Infiuba Housing Zugangscode",
        heading: "Verwende diesen Link für die Anmeldung mit einem Klick:",
        magicLinkCta: "Jetzt anmelden",
        magicLinkHint: "Dieser Link ist nur einmal gültig.",
        codeLabel: "Wenn der Link nicht funktioniert, nutze diesen Code:",
        expiresText: `Dieser Code läuft in ${expiresMinutes} Minuten ab.`,
        ignoreText: "Wenn du diesen Code nicht angefordert hast, kannst du diese E-Mail ignorieren.",
        signature: "Infiuba Housing Hub",
      };
    case "pt":
      return {
        subjectPrefix: "Seu código de acesso do Infiuba Housing",
        heading: "Use este link para entrar com um clique:",
        magicLinkCta: "Entrar agora",
        magicLinkHint: "Este link é válido apenas uma vez.",
        codeLabel: "Se o link não funcionar, use este código:",
        expiresText: `Este código expira em ${expiresMinutes} minutos.`,
        ignoreText: "Se você não solicitou este código, pode ignorar este e-mail.",
        signature: "Infiuba Housing Hub",
      };
    case "it":
      return {
        subjectPrefix: "Il tuo codice di accesso Infiuba Housing",
        heading: "Usa questo link per accedere con un clic:",
        magicLinkCta: "Accedi ora",
        magicLinkHint: "Questo link è valido una sola volta.",
        codeLabel: "Se il link non funziona, usa questo codice:",
        expiresText: `Questo codice scade tra ${expiresMinutes} minuti.`,
        ignoreText: "Se non hai richiesto questo codice, puoi ignorare questa email.",
        signature: "Infiuba Housing Hub",
      };
    case "no":
      return {
        subjectPrefix: "Din tilgangskode for Infiuba Housing",
        heading: "Bruk denne lenken for å logge inn med ett klikk:",
        magicLinkCta: "Logg inn nå",
        magicLinkHint: "Denne lenken kan bare brukes én gang.",
        codeLabel: "Hvis lenken ikke fungerer, bruk denne koden:",
        expiresText: `Denne koden utløper om ${expiresMinutes} minutter.`,
        ignoreText: "Hvis du ikke ba om denne koden, kan du ignorere denne e-posten.",
        signature: "Infiuba Housing Hub",
      };
    case "en":
    default:
      return {
        subjectPrefix: "Your Infiuba Housing access code",
        heading: "Use this link to sign in with one click:",
        magicLinkCta: "Sign in now",
        magicLinkHint: "This link can only be used once.",
        codeLabel: "If the link does not work, use this code:",
        expiresText: `This code expires in ${expiresMinutes} minutes.`,
        ignoreText: "If you did not request this code, you can safely ignore this email.",
        signature: "Infiuba Housing Hub",
      };
  }
}

function buildOtpEmailContent(input: SendLoginOtpInput) {
  const copy = buildOtpEmailCopy(input.lang, input.expiresMinutes);
  const subject = `${copy.subjectPrefix}: ${input.code}`;
  const code = escapeHtml(input.code);
  const magicLink = input.magicLinkUrl ? escapeHtml(input.magicLinkUrl) : "";
  const logoUrl = input.logoUrl ? escapeHtml(input.logoUrl) : "";

  const textParts = [
    `${copy.codeLabel} ${input.code}`,
    copy.expiresText,
  ];

  if (input.magicLinkUrl) {
    textParts.unshift(copy.magicLinkHint);
    textParts.unshift(input.magicLinkUrl);
    textParts.unshift(copy.heading);
  }

  const text = [
    ...textParts,
    "",
    copy.ignoreText,
    "",
    copy.signature,
  ].join("\n");

  const contentColumnOpen = logoUrl
    ? "      <td style=\"width:62%;vertical-align:top;padding:0 16px 0 0;\">"
    : "      <td style=\"vertical-align:top;padding:0;\">";
  const logoColumn = logoUrl
    ? `      <td style="width:38%;vertical-align:top;padding:0 0 0 16px;text-align:right;">
        <img src="${logoUrl}" alt="Infiuba Housing Hub" width="220" style="display:block;width:100%;max-width:220px;height:auto;max-height:220px;border:0;outline:none;text-decoration:none;margin-left:auto;" />
      </td>`
    : "";

  const html = [
    "<div style=\"font-family:'Avenir Next',Avenir,'Segoe UI',Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:20px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;\">",
    "  <table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:collapse;table-layout:fixed;\">",
    "    <tr>",
    contentColumnOpen,
    logoUrl ? "" : `  <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#0f172a;">${copy.signature}</p>`,
    input.magicLinkUrl
      ? `  <p style="margin:0 0 10px;">${escapeHtml(copy.heading)}</p>`
      : "",
    input.magicLinkUrl
      ? `  <p style="margin:0 0 10px;"><a href="${magicLink}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;">${escapeHtml(copy.magicLinkCta)}</a></p>`
      : "",
    input.magicLinkUrl
      ? `  <p style="margin:0 0 16px;color:#475569;font-size:13px;">${escapeHtml(copy.magicLinkHint)}</p>`
      : "",
    `  <p style="margin:0 0 4px;">${escapeHtml(copy.codeLabel)}</p>`,
    `  <p style="font-size:28px;font-weight:700;letter-spacing:0.24em;margin:8px 0 12px;">${code}</p>`,
    `  <p style="margin:0 0 12px;">${escapeHtml(copy.expiresText)}</p>`,
    `  <p style="margin:0 0 6px;color:#64748b;font-size:13px;">${escapeHtml(copy.ignoreText)}</p>`,
    "      </td>",
    logoColumn,
    "    </tr>",
    "  </table>",
    "</div>",
  ]
    .filter(Boolean)
    .join("\n");

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
