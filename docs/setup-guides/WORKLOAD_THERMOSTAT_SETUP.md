# Setting up the Workload banner

## Nothing to run in Supabase

This one reads due dates you already have - no new table, no Edge
Function, no secrets. It just needed writing.

## What it does

Quietly checks how many open tasks are due in the next 3 days
(including anything already overdue). If that number looks
manageable, it says nothing at all - no banner, no badge, nothing. It
only speaks up once things start looking genuinely heavy:

| Tasks due in next 3 days | Level | Shown? |
|---|---|---|
| 0–2 | Healthy | No banner |
| 3–5 | Rising | Small heads-up |
| 6–9 | Heavy | Stronger heads-up |
| 10+ | Overloaded | Clear warning |

Tap **Plan it out** on the banner and it hands straight off to
Emergency Mode, asking the AI for a realistic plan for the rest of
today - same feature, just reached from a different door.

Tap the **×** to dismiss it for today - it comes back tomorrow if
things are still heavy, rather than staying silenced forever.

## If the thresholds don't match how you actually work

They're a reasonable starting guess, not tuned to your specific
workload. Open `js/workload.js`, find `WORKLOAD_LEVELS` near the top,
and adjust the `max` numbers - for example, if you handle 15 tasks a
week comfortably, you might raise "Heavy" from 9 to 14.
