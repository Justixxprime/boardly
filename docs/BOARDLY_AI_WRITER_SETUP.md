# Setting up "Write with AI" (Proposals and CV Builder)

Two new buttons: "Write with AI" on the Proposal Builder, and "Write
with AI" on the CV Builder. Both work the exact same way as the
existing "Ask AI" panel on your boards: you give it a short brief, it
writes a draft, you review and edit it, then you save it yourself.
Nothing is ever sent to a client or saved to your account by the AI
step itself.

## Do you need to do anything?

**Probably not.** Both new features reuse the exact same free API key
your board's "Ask AI" panel already uses (`GROQ_API_KEY`, and
optionally `OPENROUTER_API_KEY` as a backup). If the "Ask AI" panel on
your boards already works today, these two new buttons will just work
too, no new setup at all.

## How to check

1. Open any board, click the AI panel (the sparkle icon), and ask it
   something simple. If it answers, you're already set up, skip the
   rest of this doc.
2. If it says something like "GROQ_API_KEY isn't set yet," follow
   `docs/setup-guides/AI_SETUP_BABY_STEPS.md`, Part A only (getting a
   free Groq key and adding it as a Supabase secret). That's the only
   step needed, Part B and Part C in that doc are about the board chat
   panel and daily email, not required for the new writer features.

## What each button actually does

**Proposal Builder, "Write with AI":** you type a couple of sentences
describing the project (like "a website for a social club with
membership registration, events, and online dues payment"). It writes
a full draft: title, intro, a feature list grouped by category, a real
line-item cost breakdown, a paragraph explaining why the price makes
sense, a timeline estimate, and a payment-stage schedule (like 40% at
commencement, 30% after design, and so on). All of it lands in the
Proposal Builder's own fields, exactly as if you'd typed it yourself,
so you can change anything before saving.

**CV Builder, "Write with AI":** you paste in whatever you already
have (an old CV, a bullet list of jobs and skills, or just a few rough
sentences), optionally add a target role, and it drafts your summary,
work experience, education, skills, and so on straight into the CV
Builder's sections. It's told explicitly not to invent employers,
dates, or achievements that weren't in what you pasted, if something
is missing, it leaves that field blank instead of guessing.

## Why Groq, and is it really free

Groq's API has a genuinely free tier, no credit card, with rate limits
generous enough for one person's day-to-day use. It's the same
provider Boardly's board "Ask AI" panel has used since before this
feature existed. If Groq's free tier is ever unavailable, and you've
also set up `OPENROUTER_API_KEY` (see
`docs/setup-guides/OPENROUTER_BACKUP_SETUP.md`), the same two new
functions automatically fall back to OpenRouter's own free models
(Llama 3.3 70B, then DeepSeek), with no code changes needed, same
fallback chain the board assistant already uses.

## What was added (for reference)

- `supabase/schema_v72_proposal_richness.sql`: adds `prepared_by_role`,
  `feature_groups`, `why_price_text`, `timeline_text`,
  `payment_stages`, `notes_text`, and `closing_text` to the `proposals`
  table. All new columns, nothing about existing proposals changes.
- `supabase/functions/generate-proposal-draft`: writes the proposal
  draft described above.
- `supabase/functions/generate-cv-draft`: writes the CV draft described
  above.
- `get-proposal-info` now also returns the new proposal fields, so the
  public proposal page a client opens shows the full document, not
  just the old line-item table.
