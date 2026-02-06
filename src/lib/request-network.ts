import { isIP } from "node:net";

const UNKNOWN_NETWORK_KEY = "unknown";

export interface RequestNetworkFingerprint {
  ipKey: string;
  subnetKey: string;
}

function parseIpv4TailToHextets(value: string) {
  const octets = value.split(".");
  if (octets.length !== 4) {
    return null;
  }

  const numbers = octets.map((segment) => {
    if (!/^\d+$/.test(segment)) {
      return Number.NaN;
    }
    const parsed = Number(segment);
    if (parsed < 0 || parsed > 255) {
      return Number.NaN;
    }
    return parsed;
  });

  if (numbers.some((value) => Number.isNaN(value))) {
    return null;
  }

  return [
    ((numbers[0] << 8) | numbers[1]).toString(16).padStart(4, "0"),
    ((numbers[2] << 8) | numbers[3]).toString(16).padStart(4, "0"),
  ];
}

function expandIpv6Address(value: string) {
  const split = value.toLowerCase().split("::");
  if (split.length > 2) {
    return null;
  }

  const expandParts = (parts: string[]) => {
    const expanded: string[] = [];
    for (const part of parts) {
      if (!part) {
        continue;
      }
      if (part.includes(".")) {
        const ipv4Tail = parseIpv4TailToHextets(part);
        if (!ipv4Tail) {
          return null;
        }
        expanded.push(...ipv4Tail);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) {
        return null;
      }
      expanded.push(part.padStart(4, "0"));
    }
    return expanded;
  };

  const headParts = split[0] ? split[0].split(":") : [];
  const tailParts = split.length === 2 && split[1] ? split[1].split(":") : [];
  const head = expandParts(headParts);
  const tail = expandParts(tailParts);
  if (!head || !tail) {
    return null;
  }

  const missing = 8 - (head.length + tail.length);
  if (split.length === 2) {
    if (missing < 1) {
      return null;
    }
    return [...head, ...Array.from({ length: missing }, () => "0000"), ...tail];
  }

  if (missing !== 0) {
    return null;
  }
  return [...head, ...tail];
}

function normalizeIpCandidate(value: string) {
  let candidate = value.trim();
  if (!candidate) {
    return "";
  }

  if (candidate.toLowerCase().startsWith("for=")) {
    candidate = candidate.slice(4);
  }
  candidate = candidate.replace(/^"(.*)"$/, "$1").trim();
  if (!candidate || candidate.toLowerCase() === "unknown") {
    return "";
  }

  if (candidate.startsWith("[")) {
    const closingBracket = candidate.indexOf("]");
    if (closingBracket > 0) {
      candidate = candidate.slice(1, closingBracket);
    }
  } else if (candidate.includes(".") && candidate.includes(":")) {
    const maybeIpv4 = candidate.slice(0, candidate.lastIndexOf(":"));
    if (isIP(maybeIpv4) === 4) {
      candidate = maybeIpv4;
    }
  }

  const withoutZone = candidate.split("%")[0].trim().toLowerCase();
  return isIP(withoutZone) ? withoutZone : "";
}

function getIpCandidates(request: Request) {
  const candidates: string[] = [];

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    candidates.push(...forwardedFor.split(",").map((part) => part.trim()));
  }

  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    candidates.push(cfConnectingIp);
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    candidates.push(realIp);
  }

  const forwarded = request.headers.get("forwarded");
  if (forwarded) {
    for (const segment of forwarded.split(",")) {
      const match = segment.match(/for=([^;]+)/i);
      if (match?.[1]) {
        candidates.push(match[1].trim());
      }
    }
  }

  return candidates;
}

function resolveClientIp(request: Request) {
  for (const candidate of getIpCandidates(request)) {
    const normalized = normalizeIpCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return UNKNOWN_NETWORK_KEY;
}

function buildIpv4SubnetKey(ip: string) {
  const octets = ip.split(".");
  if (octets.length !== 4) {
    return UNKNOWN_NETWORK_KEY;
  }
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function buildIpv6SubnetKey(ip: string) {
  const expanded = expandIpv6Address(ip);
  if (!expanded) {
    return ip;
  }
  return `${expanded.slice(0, 4).join(":")}::/64`;
}

export function getRequestNetworkFingerprint(request: Request): RequestNetworkFingerprint {
  const clientIp = resolveClientIp(request);
  if (clientIp === UNKNOWN_NETWORK_KEY) {
    return {
      ipKey: UNKNOWN_NETWORK_KEY,
      subnetKey: UNKNOWN_NETWORK_KEY,
    };
  }

  const version = isIP(clientIp);
  if (version === 4) {
    return {
      ipKey: `ipv4:${clientIp}`,
      subnetKey: `ipv4-subnet:${buildIpv4SubnetKey(clientIp)}`,
    };
  }
  if (version === 6) {
    return {
      ipKey: `ipv6:${clientIp}`,
      subnetKey: `ipv6-subnet:${buildIpv6SubnetKey(clientIp)}`,
    };
  }

  return {
    ipKey: UNKNOWN_NETWORK_KEY,
    subnetKey: UNKNOWN_NETWORK_KEY,
  };
}
