import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "../../../workos";

export const dynamic = "force-dynamic";

// Sends the user to WorkOS AuthKit with the VALID client id + a REGISTERED
// redirect URI. This is the fix for the "Invalid client ID" error.
export function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") || "authkit";
  return NextResponse.redirect(authorizeUrl(provider));
}
