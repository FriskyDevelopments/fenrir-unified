import { describe, expect, it } from "vitest";
import { isMatchingStarsPayment } from "../api/telegram/webhook";

const payment = {
  currency: "XTR",
  total_amount: 1150,
  invoice_payload: "fenrir_stars:123:order",
  telegram_payment_charge_id: "charge-1",
};

const order = {
  payload: payment.invoice_payload,
  telegram_user_id: "123",
  telegram_chat_id: "123",
  amount: 1150,
  status: "pending",
  telegram_payment_charge_id: null,
  created_at: new Date().toISOString(),
  paid_at: null,
};

describe("Telegram Stars webhook idempotency", () => {
  it("accepts a pending order", () => {
    expect(isMatchingStarsPayment(order, payment, "123")).toBe(true);
  });

  it("accepts a retry of the same recorded Telegram charge", () => {
    expect(
      isMatchingStarsPayment(
        { ...order, status: "paid", telegram_payment_charge_id: "charge-1" },
        payment,
        "123",
      ),
    ).toBe(true);
  });

  it("rejects a different charge against an already-paid order", () => {
    expect(
      isMatchingStarsPayment(
        { ...order, status: "paid", telegram_payment_charge_id: "other-charge" },
        payment,
        "123",
      ),
    ).toBe(false);
  });
});
