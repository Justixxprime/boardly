# Setting up: Post Preview fixes (the one inside the edit form)

This is the OTHER post preview — the small eye icon next to "Caption /
notes" inside a ticket's edit screen, not the Content Calendar one
(that one was fixed separately, see CONTENT_CALENDAR_FIXES_SETUP.md).
No migration needed — copy the files in.

## Step 1: copy the files in

- `dashboard.html` (updated)
- `js/dashboard.js` (updated)
- `css/style.css` (updated)

## Step 2: push it to GitHub

```
git add .
git commit -m "Fix the edit-form post preview: layering, copy button, vertical gating"
git push
```

---

## What was actually wrong, and what I found

**1. The "two things on screen" bug — a real, confirmed cause.**
Opening this preview never closed the ticket edit screen underneath
it — both were open and visible at the same time. The X you saw
floating above the card was the edit screen's OWN close button,
peeking out from behind the smaller preview card sitting on top of
it. Fixed: opening the preview now properly closes the edit screen
first, and closing the preview brings it back — you never have two
full-screen things open together.

**2. Also found and fixed while investigating: a z-index inconsistency.**
This modal was set to a one-off `z-60` value instead of using the
same shared rule every other modal in Boardly uses — not the direct
cause of the layering issue (a plain ID rule elsewhere was actually
already overriding it correctly), but a genuine inconsistency that
could have caused real problems later, so it's cleaned up now to match
every other modal exactly.

**3. No copy or download option.** Fixed — the preview now has a
"Copy caption" button and, when the task has a supported image
attachment, a working "Download media" button. The download uses the
same cross-origin-safe download helper as task attachments, with a
new-tab fallback when a source blocks downloading.

**4. Showing up on every board type.** You were right. The Platform
dropdown and the Preview button now only appear when a task's real
type is Social Media (same rule as the Environment/Git fix from
earlier). The plain **Caption / notes** text box itself stays
available on every task, though — that field is genuinely used
everywhere in Boardly (task descriptions, AI actions, the share
sheet), not just for social posts, so narrowing that specifically
would have been a real loss, not a fix.

**5. Escape could leave the preview open after hiding the edit form.**
Fixed — Escape now closes the preview and restores the editor just like
the visible close button and backdrop do.
