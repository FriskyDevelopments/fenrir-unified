export function founderCheckoutParams(input: {
  priceId: string;
  userId: string;
  origin: string;
}) {
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", input.priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", input.userId);
  params.set("metadata[community_user_id]", input.userId);
  params.set("metadata[offer]", "founder_pack_1499");
  params.set("subscription_data[metadata][community_user_id]", input.userId);
  params.set("subscription_data[metadata][offer]", "founder_pack_1499");
  params.set("success_url", `${input.origin}/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${input.origin}/upgrade?checkout=cancel`);
  params.set("allow_promotion_codes", "false");
  return params;
}
