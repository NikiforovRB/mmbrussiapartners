import "server-only";

/**
 * Atol Online — заглушка под платежи.
 *
 * Когда вы получите рабочие учётные данные (ATOL_LOGIN/PASSWORD/GROUP),
 * замените тело методов реальными HTTP-вызовами к ATOL Online API v5.
 * Интерфейс уже завязан в UI и серверных экшенах — менять остальной код
 * не потребуется.
 */

export type AtolCreatePaymentInput = {
  paymentId: string;
  amount: number;
  description: string;
  email?: string | null;
  phone?: string | null;
  returnUrl: string;
};

export type AtolCreatePaymentResult = {
  externalId: string;
  payUrl: string;
  raw?: unknown;
};

export type AtolPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export const atol = {
  isConfigured(): boolean {
    return Boolean(process.env.ATOL_LOGIN && process.env.ATOL_PASSWORD && process.env.ATOL_GROUP);
  },

  async createPayment(input: AtolCreatePaymentInput): Promise<AtolCreatePaymentResult> {
    if (!this.isConfigured()) {
      const externalId = `mock_${input.paymentId}`;
      return {
        externalId,
        payUrl: `${input.returnUrl}?status=mock-paid&pid=${encodeURIComponent(input.paymentId)}`,
      };
    }
    throw new Error("ATOL real integration not implemented yet — fill credentials and add HTTP call here");
  },

  async getStatus(externalId: string): Promise<AtolPaymentStatus> {
    if (!this.isConfigured()) {
      return externalId.startsWith("mock_") ? "PAID" : "PENDING";
    }
    throw new Error("ATOL getStatus not implemented yet");
  },

  async handleWebhook(payload: unknown): Promise<{ paymentId: string; status: AtolPaymentStatus } | null> {
    if (typeof payload !== "object" || !payload) return null;
    const obj = payload as Record<string, unknown>;
    const paymentId = typeof obj.payment_id === "string" ? obj.payment_id : null;
    const status = typeof obj.status === "string" ? obj.status.toUpperCase() : null;
    if (!paymentId || !status) return null;
    const map: Record<string, AtolPaymentStatus> = {
      PAID: "PAID",
      DONE: "PAID",
      FAIL: "FAILED",
      FAILED: "FAILED",
      CANCEL: "CANCELLED",
      CANCELLED: "CANCELLED",
      PENDING: "PENDING",
    };
    return { paymentId, status: map[status] ?? "PENDING" };
  },
};
