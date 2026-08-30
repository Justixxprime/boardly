# Board Health

No setup or database migration is required.

Open a board name menu and select **Board health**. Boardly calculates
the status from data already stored on that board:

- overdue active tickets;
- tickets blocked by an unfinished ticket;
- active tickets due within three days; and
- active tickets missing a due date.

The result is deterministic: green means none of the tracked risk
signals are present, yellow means something needs watching, and red
means there is overdue work or multiple unresolved blockers.
