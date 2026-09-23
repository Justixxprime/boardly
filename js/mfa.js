// ==========================================================================
// BOARDLY - MFA (TOTP) helpers, shared by login.html and settings.html.
//
// This is a thin wrapper around Supabase Auth's own MFA API. Supabase
// already stores and manages the actual factors (auth.mfa_factors),
// there is no Boardly table for this - nothing here talks to the
// database directly.
//
// The real enforcement does NOT live in this file. It lives in
// schema_v93_mfa_enforcement.sql, as a set of "restrictive" Row Level
// Security policies that require an aal2 session for any user who has
// a verified factor, on the database itself. This file only builds
// the enrollment and challenge screens - a user could delete this
// whole file from their browser's dev tools and the database would
// still refuse to hand back money data without a second factor.
// (F6, 23 Sep 2026.)
// ==========================================================================

async function mfaGetLevel() {
  const { data, error } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { currentLevel: "aal1", nextLevel: "aal1", error: error || null };
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel, error: null };
}

async function mfaListFactors() {
  const { data, error } = await supabaseClient.auth.mfa.listFactors();
  if (error) return { totp: [], error };
  return { totp: (data && data.totp) || [], error: null };
}

// Returns the first verified TOTP factor, if any. Boardly only supports
// one active authenticator at a time (simpler to explain and to test) -
// a user enrolling a new one should remove the old one first.
async function mfaGetVerifiedFactor() {
  const { totp, error } = await mfaListFactors();
  if (error) return { factor: null, error };
  return { factor: totp.find((f) => f.status === "verified") || null, error: null };
}

async function mfaStartEnroll() {
  const { data, error } = await supabaseClient.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Boardly ${new Date().toISOString().slice(0, 10)}`,
  });
  return { data, error };
}

// Used both to finish enrolling a brand new factor and to answer a
// login challenge for an already-verified one - Supabase's challenge
// + verify pair works the same way for both.
async function mfaChallengeAndVerify(factorId, code) {
  const { data: challenge, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId });
  if (challengeError) return { data: null, error: challengeError };
  const { data, error } = await supabaseClient.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  return { data, error };
}

async function mfaUnenroll(factorId) {
  return await supabaseClient.auth.mfa.unenroll({ factorId });
}

// An unenrolled or never-completed factor left over from an abandoned
// enrollment attempt - safe to remove without a code, Supabase only
// blocks unenroll-without-a-fresh-challenge for VERIFIED factors used
// to reach aal2, not for ones still sitting unverified.
async function mfaCancelUnverifiedFactor(factorId) {
  return await supabaseClient.auth.mfa.unenroll({ factorId });
}
