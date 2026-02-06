import { canAccessAdmin, getAuthSessionFromRequest } from "@/lib/auth";
import { jsonNoStore } from "@/lib/http-cache";
import { getSecurityTelemetrySnapshot } from "@/lib/security-telemetry";

export async function GET(request: Request) {
  const session = await getAuthSessionFromRequest(request);
  if (!canAccessAdmin(session.role)) {
    return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
  }

  const telemetry = await getSecurityTelemetrySnapshot();
  if (!telemetry.ok) {
    return jsonNoStore({ error: "Security telemetry is unavailable" }, { status: 503 });
  }

  return jsonNoStore(telemetry.snapshot);
}
