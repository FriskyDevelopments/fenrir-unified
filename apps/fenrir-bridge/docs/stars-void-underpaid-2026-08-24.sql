-- Fenrir Bridge — apagar (no borrar) el rastro del agujero de ⭐5.
--
-- Contexto, para quien lea esto dentro de un año:
--
-- isValidStarsPayment comparaba el pago contra `order.amount` y nada más. Eso
-- demuestra que el comprador pagó lo que la orden pedía, nunca que la orden
-- pidiera el precio correcto. Cualquier fila de orden con importe bajo seguía
-- siendo pagable y compraba el mismo acceso que ⭐1,150.
--
-- Lo que había en producción el 2026-08-24:
--   amount=   5  status=paid     n=1    ← payload TEST5STARSONLY0001, hecho a mano
--   amount= 250  status=paid     n=3    ← LEGÍTIMOS: ⭐250 fue el precio real en julio 2026
--   amount= 250  status=pending  n=89   ← cobrables por ~$3.50 → Pack completo
--   amount=1150  status=pending  n=5    ← precio vigente, se dejan intactas
--
-- El código ya cerró la puerta: el pago debe cuadrar con su orden Y esa orden
-- con el precio del catálogo. Estas filas ya son impagables. Se apagan igual
-- para que no vuelvan a aparecer como demanda real en ningún reporte.
--
-- NADA SE BORRA. `void` sale de toda consulta de acceso (todas filtran por
-- 'active' o 'pending') y la fila queda como registro de lo que pasó.
--
-- NO se tocan:
--   * las 3 órdenes pagadas a ⭐250 — pagaron el precio vigente entonces;
--   * la orden pagada a ⭐5 — es el registro del incidente;
--   * las 5 órdenes pendientes a ⭐1,150 — precio correcto, siguen cobrables;
--   * ninguna fila de billing_subscriptions — nadie pierde acceso hoy.
--
-- Aplicar con:
--   wrangler d1 execute fenrir-bridge --remote --file=docs/stars-void-underpaid-2026-08-24.sql

-- 1. El entitlement de ⭐5. La fila mentía: decía `active` y reportaba
--    "Access: unlocked" por unos diez centavos. Ya no otorga nada (el piso de
--    otorgamiento es ⭐250), pero mientras diga `active` sigue mintiendo.
UPDATE telegram_stars_entitlements
   SET status = 'void',
       updated_at = '2026-08-24T13:20:00.000Z'
 WHERE telegram_user_id = '8581086019'
   AND payload = 'fenrir_stars:8581086019:TEST5STARSONLY0001'
   AND stars_amount = 5
   AND status = 'active';

-- 2. Las órdenes pendientes por debajo del precio vigente. Acotado a
--    status='pending' y amount < 1150 para no rozar ninguna orden pagada ni
--    ninguna emitida al precio correcto.
UPDATE telegram_stars_orders
   SET status = 'void'
 WHERE status = 'pending'
   AND amount < 1150;
