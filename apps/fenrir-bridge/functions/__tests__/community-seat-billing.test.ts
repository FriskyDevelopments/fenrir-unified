import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  STRIPE_CHECKOUT_MIN_QUANTITY,
  billedSeatQuantity,
  checkoutSeatQuantity,
  isStripeSubscriptionId,
  seatProrationBehavior,
  syncCommunitySeatQuantity
} from "../../workers/fenrir-stars-payments.js";

/**
 * EJE DE COBRO. The Pack se vende como "$14.99/mes por comunidad ENLAZADA" en
 * pack-rails.tsx, plan-catalog.ts, i18n.ts (cuatro idiomas) y
 * FENRIR_STARS_DESCRIPTION. Antes de este archivo el código cobraba plano:
 * `quantity: 1` clavado a mano en los dos rieles, sin que nada volviera a
 * tocarlo. Con cero comunidades enlazadas cobraba $14.99; con tres, también.
 *
 * Estas pruebas existen para que nadie vuelva a clavar el 1.
 */
describe("cantidad facturada = comunidades enlazadas", () => {
  it("con cero comunidades enlazadas la cantidad facturada es cero", () => {
    // El corazón del bug: Francisco tenía 5 Gates, 0 destinos verificados, y una
    // suscripción con quantity 1. Cero enlazadas debe facturar cero.
    expect(billedSeatQuantity(0)).toBe(0);
  });

  it("la cantidad sigue al número de enlazadas, no a un 1 fijo", () => {
    expect(billedSeatQuantity(1)).toBe(1);
    expect(billedSeatQuantity(3)).toBe(3);
    expect(billedSeatQuantity(12)).toBe(12);
  });

  it("cualquier conteo ilegible cuenta como cero — ante la duda, no cobrar", () => {
    for (const bad of [undefined, null, "", "tres", NaN, Infinity, -1, -0.5]) {
      expect(billedSeatQuantity(bad as never)).toBe(0);
    }
  });

  it("nunca redondea hacia arriba", () => {
    expect(billedSeatQuantity(2.9)).toBe(2);
    expect(billedSeatQuantity(0.9)).toBe(0);
  });
});

describe("el alta de Checkout respeta el piso que impone Stripe", () => {
  /**
   * Comprobado contra la API en vivo, no supuesto. Crear una Checkout Session
   * en modo `subscription` con quantity 0 devuelve:
   *   HTTP 400 · invalid_request_error · parameter_invalid_integer
   *   param=line_items[0][quantity]
   *   "This value must be greater than or equal to 1."
   * Un subscription item, en cambio, SÍ acepta 0 (previsualización de factura:
   * HTTP 200, subtotal 0, "0 × MyFenrir Pack … | amount: 0").
   */
  it("el alta nunca nace en 0 porque Stripe lo rechaza", () => {
    expect(STRIPE_CHECKOUT_MIN_QUANTITY).toBe(1);
    expect(checkoutSeatQuantity(0)).toBe(1);
  });

  it("pero el alta tampoco infla: con enlazadas reales usa ese número", () => {
    expect(checkoutSeatQuantity(1)).toBe(1);
    expect(checkoutSeatQuantity(4)).toBe(4);
  });
});

describe("prorrateo asimétrico: los dos errores apuntan a no cobrar de más", () => {
  it("desenlazar acredita de inmediato", () => {
    expect(seatProrationBehavior(3, 1)).toBe("create_prorations");
    expect(seatProrationBehavior(1, 0)).toBe("create_prorations");
  });

  it("enlazar no dispara un cargo sorpresa a mitad de ciclo", () => {
    expect(seatProrationBehavior(0, 1)).toBe("none");
    expect(seatProrationBehavior(1, 3)).toBe("none");
  });

  it("sin cambio no hay llamada a Stripe", () => {
    expect(seatProrationBehavior(0, 0)).toBeNull();
    expect(seatProrationBehavior(2, 2)).toBeNull();
  });
});

describe("sólo se tocan suscripciones que son objetos Stripe de verdad", () => {
  it("acepta ids de Stripe", () => {
    expect(isStripeSubscriptionId("sub_1U7xLJLxUF54S071BAbDmGEX")).toBe(true);
  });

  it("rechaza los ids sintéticos de los otros rieles", () => {
    // Pedirle la cantidad a Stripe con uno de éstos es un 404 garantizado.
    expect(isStripeSubscriptionId("stars:8581086019")).toBe(false);
    expect(isStripeSubscriptionId("courtesy:welcome-pack-8581086019")).toBe(false);
    expect(isStripeSubscriptionId("referral:abc123")).toBe(false);
    expect(isStripeSubscriptionId("")).toBe(false);
    expect(isStripeSubscriptionId(null)).toBe(false);
  });
});

describe("el interruptor protege las suscripciones vivas", () => {
  it("apagado no llama a Stripe ni a Neon", async () => {
    // Encender esto REESCRIBE suscripciones con tarjeta en archivo. Se despliega
    // apagado a propósito. Sin binding DB ni NEON_DATABASE_URL: si tocara
    // cualquiera de los dos, esta prueba explotaría en vez de pasar.
    const result = await syncCommunitySeatQuantity({}, { telegramUserId: "8581086019" });
    expect(result).toEqual({ ok: true, changed: false, reason: "seat_billing_disabled" });
  });

  it("encendido pero sin identidad facturable no toca nada", async () => {
    const env = { COMMUNITY_SEAT_BILLING_ENABLED: "true" };
    const result = await syncCommunitySeatQuantity(env, {});
    expect(result.changed).toBe(false);
  });
});

describe("ningún riel vuelve a clavar la cantidad a mano", () => {
  const worker = readFileSync(
    new URL("../../workers/fenrir-stars-payments.js", import.meta.url),
    "utf8"
  );

  it("el riel de tarjeta de The Pack calcula la cantidad, no la escribe", () => {
    // Regresión textual: así se veía el bug.
    expect(worker).not.toContain('"line_items[0][quantity]": "1"');
    expect(worker).toContain('"line_items[0][quantity]": String(await checkoutSeatQuantityFor(');
  });

  it("el enlace de un grupo reconcilia la cantidad después de enlazar", () => {
    expect(worker).toContain("syncCommunitySeatQuantity(env, {");
    expect(worker).toContain("communityId: telegramCommunityId(chat.id)");
  });
});
