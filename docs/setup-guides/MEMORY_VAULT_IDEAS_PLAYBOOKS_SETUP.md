# Setting up: Memory Vault now covers Ideas + Playbooks

Idea Vault and Playbooks were both built after Memory Vault ("search
everything you've ever written in Boardly") - so until now, neither
one actually showed up in that search, even though the description
promised "everything." This closes that gap.

## Step 1: run the database update

1. Supabase dashboard -> SQL Editor -> New query.
2. Open `supabase/schema_v43_memory_vault_ideas_playbooks.sql`, copy
   all of it, paste, click Run.

This needs `schema_v29_memory_vault_embeddings.sql` to have already
been run (it adds one column to the same two tables and updates the
shared search function - if v29 hasn't been run yet, this will fail
clearly rather than half-apply).

Even without smart (semantic) search turned on, plain keyword search
now covers ideas and playbooks too - that part doesn't need embeddings
at all and works the moment you copy the files in.

## Step 2: copy the files in, then push

```
git add .
git commit -m "Memory Vault now covers Ideas and Playbooks"
git push
```

## Step 3: (optional) re-index

If you already have ideas or playbooks saved from before this update
and you use smart search, open Memory Vault and click "Build search
index" once - it only processes rows that don't have an embedding yet,
so this is fast and safe to run any time.

## Step 4: test it

1. Save an idea or a playbook with a distinctive word in it.
2. Open Memory Vault, search for that word.
3. It should show up under a new "Ideas" or "Playbooks" section -
   clicking it opens that panel.
