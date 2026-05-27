import { communitySessionClearCookie } from "../../_lib/community-auth";
import { noStoreJson } from "../../_lib/responses";

export async function onRequestPost() {
  return noStoreJson({ ok: true }, {
    headers: {
      "Set-Cookie": communitySessionClearCookie()
    }
  });
}
