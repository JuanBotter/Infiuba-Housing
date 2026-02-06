function parseBooleanEnvFlag(raw) {
  if (!raw) {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeCaCert(raw) {
  if (!raw) {
    return undefined;
  }

  const trimmed = String(raw).trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\\n/g, "\n");
}

export function resolvePgSslConfig() {
  if (!parseBooleanEnvFlag(process.env.PGSSL)) {
    return undefined;
  }

  const allowInsecure = parseBooleanEnvFlag(process.env.PGSSL_ALLOW_INSECURE);
  if (allowInsecure) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PGSSL_ALLOW_INSECURE cannot be enabled in production.");
    }

    console.warn(
      "[DB] PGSSL_ALLOW_INSECURE=true disables TLS certificate verification. Use only for local development.",
    );
    return { rejectUnauthorized: false };
  }

  const ca = normalizeCaCert(process.env.PGSSL_CA_CERT);
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}
