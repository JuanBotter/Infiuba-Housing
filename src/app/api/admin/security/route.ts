import { requireAdminSession } from "@/lib/api-route-helpers";
import { jsonNoStore } from "@/lib/http-cache";
import { getSecurityTelemetrySnapshot } from "@/lib/security-telemetry";

export async function GET(request: Request) {
  const adminSessionResult = await requireAdminSession(request);
  if (!adminSessionResult.ok) {
    return adminSessionResult.response;
  }

  const telemetry = await getSecurityTelemetrySnapshot();
  if (!telemetry.ok) {
    return jsonNoStore({ error: "Security telemetry is unavailable" }, { status: 503 });
  }

  return jsonNoStore(telemetry.snapshot);
}
