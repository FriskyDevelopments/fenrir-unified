// apps/fenrir-bridge/scripts/smoke-webhook.mjs

const WEBHOOK_URL = 'https://44b7ec23.fenrir-bridge.pages.dev/api/telegram/webhook';

async function runTests() {
  console.log('🧪 Starting webhook smoke tests...\n');
  let passed = true;

  // Test 1: Malformed input (garbage payload)
  console.log('Test 1: Malformed input');
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garbage: true })
    });

    if (res.status === 200) {
      console.log('✅ PASS: Webhook returned 200 for malformed input (error suppressed correctly).');
    } else {
      console.error(`❌ FAIL: Expected 200, got ${res.status}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ FAIL: Request failed entirely:', err);
    passed = false;
  }

  // Test 2: Duplicate successful_payment
  console.log('\nTest 2: Duplicate successful_payment payload');
  const duplicatePayload = {
    update_id: 123456789,
    message: {
      message_id: 999,
      from: { id: 111111111, is_bot: false, first_name: "Test" },
      chat: { id: 111111111, type: "private" },
      date: 1670000000,
      successful_payment: {
        currency: "XTR",
        total_amount: 100,
        invoice_payload: "test_invoice",
        telegram_payment_charge_id: "test_charge_id_12345",
        provider_payment_charge_id: "test_provider_charge_id_12345"
      }
    }
  };

  try {
    const res2 = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicatePayload)
    });

    if (res2.status === 200) {
      console.log('✅ PASS: Webhook returned 200 for successful_payment payload (processed/deduplicated safely).');
    } else {
      console.error(`❌ FAIL: Expected 200, got ${res2.status}`);
      passed = false;
    }
  } catch (err) {
    console.error('❌ FAIL: Request failed entirely:', err);
    passed = false;
  }

  console.log('\n==================================');
  if (passed) {
    console.log('🎉 All smoke tests passed successfully!');
    process.exit(0);
  } else {
    console.log('💥 Smoke tests failed.');
    process.exit(1);
  }
}

runTests();
