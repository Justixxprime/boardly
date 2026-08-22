// ==========================================================================
// BOARDLY - google-oauth-callback Edge Function
// Deploy with:  supabase functions deploy google-oauth-callback --no-verify-jwt
//
// This is where Google sends the person back to after they approve
// connecting their calendar. Needs --no-verify-jwt because Google
// redirects the browser here directly - there's no Boardly session
// token attached to that request the normal way, so who the person is
// gets carried through the "state" parameter instead (their own user
// id, put there by the browser right before sending them to Google -
// see the "Connect" button code in settings.js).
//
// Needs THREE new secrets, on top of what every function already has:
//   GOOGLE_CLIENT_ID       - from Google Cloud Console
//   GOOGLE_CLIENT_SECRET   - from Google Cloud Console
//   GOOGLE_REDIRECT_URI    - the exact URL this function is deployed at
// See GOOGLE_CALENDAR_SETUP.md for exactly where to get these.
// ==========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state"); // the person's Boardly user id, passed through by the Connect button
  const errorParam = url.searchParams.get("error");

  const redirectBackTo = (message: string, ok: boolean) =>
    Response.redirect(
      `${Deno.env.get("PUBLIC_SETTINGS_URL") || "https://justixxprime.github.io/boardly/settings.html"}?calendar=${ok ? "connected" : "error"}&msg=${encodeURIComponent(message)}`,
      302
    );

  if (errorParam) return redirectBackTo("Google sign-in was cancelled.", false);
  if (!code || !userId) return redirectBackTo("Something went wrong starting the connection - please try again.", false);

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    return redirectBackTo("Google Calendar isn't fully set up yet - see GOOGLE_CALENDAR_SETUP.md", false);
  }

  // Exchange the one-time code for real tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token || !tokens.refresh_token) {
    // A missing refresh_token here almost always means the person had
    // already connected once before and Google didn't hand out a new
    // one - Google only gives a refresh_token the FIRST time an app is
    // approved, unless the approval is revoked first. Told to the
    // person plainly rather than as a raw error code.
    return redirectBackTo(
      tokens.refresh_token === undefined
        ? "Google didn't send a long-term connection this time - if you've connected before, remove Boardly's access in your Google Account settings, then try Connect again."
        : "Google didn't approve the connection - please try again.",
      false
    );
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("calendar_connections").upsert(
    {
      user_id: userId,
      provider: "google",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) return redirectBackTo("Connected to Google, but couldn't save it - please try again.", false);

  return redirectBackTo("Google Calendar connected.", true);
});
