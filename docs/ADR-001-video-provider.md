# ADR-001: Use Daily for Boardly Video Workrooms

**Status:** Accepted

**Date:** 2026-08-30

**Decider:** Boardly product owner

## Context

Boardly needs task-linked video workrooms that are quick to launch,
professional in the browser, secure enough for client collaboration,
and free to begin. The existing application is vanilla JavaScript and
Supabase Edge Functions, so a provider with a lightweight REST API and
an embeddable ready-made interface is preferable.

## Decision

Use Daily Video with Daily Prebuilt and the Daily REST API. Boardly
creates short-lived private rooms from a Supabase Edge Function,
issues expiring meeting tokens, and embeds the provider's call UI in a
dedicated Boardly page.

## Options considered

| Provider | Setup and integration | Free start | Decision |
| --- | --- | --- | --- |
| Daily | Small REST API plus a polished embedded call UI | 10,000 free participant-minutes monthly | Selected |
| Twilio Video | Flexible, but needs more custom client-side call UI | Trial credit, then usage billing | More engineering and less generous free entry |
| Zoom Video SDK | Strong brand and broad SDK support | 20 free credits monthly | More account/billing complexity for this first release |

## Consequences

- Fast integration with camera, microphone, chat, screen sharing, and
  pre-join checks supplied by Daily Prebuilt.
- The provider API key stays only in Supabase secrets; browsers receive
  limited, expiring room tokens.
- Calls above the included 10,000 participant-minutes are usage billed,
  so Daily's dashboard should be monitored before rolling this out to
  high-volume workspaces.
