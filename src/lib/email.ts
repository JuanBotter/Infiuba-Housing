const MAX_EMAIL_LENGTH = 320;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_PART_LENGTH = 255;
const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase();
}

export function isStrictEmail(value: string) {
  const email = normalizeEmailInput(value);
  if (!email || email.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) {
    return false;
  }

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (
    !local ||
    !domain ||
    local.length > MAX_LOCAL_PART_LENGTH ||
    domain.length > MAX_DOMAIN_PART_LENGTH
  ) {
    return false;
  }

  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return false;
  }
  if (!LOCAL_PART_PATTERN.test(local) || !DOMAIN_PATTERN.test(domain)) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return false;
  }
  if (labels.some((label) => !label || label.startsWith("-") || label.endsWith("-"))) {
    return false;
  }

  return true;
}

export function buildSafeMailtoHref(email: string) {
  return `mailto:${encodeURIComponent(normalizeEmailInput(email))}`;
}
