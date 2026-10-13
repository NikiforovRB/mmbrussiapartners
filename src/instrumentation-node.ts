import { startSiteSyncScheduler } from "@/lib/site-dealers";
import { startPaymentSyncScheduler } from "@/lib/payments/service";

export function startSchedulers(): void {
  startSiteSyncScheduler();
  startPaymentSyncScheduler();
}
