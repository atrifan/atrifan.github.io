-- QA follow-up on 20261201_qa.sql (already applied). Unqualified names, like the other gigs migrations.

-- GitHub's permissions.admin on GET /repos is the user's role on the repo, not the PAT's
-- scope, so a repo owner always sees admin: true. It is recorded, not rejected.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS owner_admin BOOLEAN NOT NULL DEFAULT FALSE;
