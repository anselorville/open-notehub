ALTER TABLE users ADD `display_name` text;--> statement-breakpoint
ALTER TABLE users ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE users ADD `last_login_at` integer;--> statement-breakpoint
ALTER TABLE users ADD `updated_at` integer DEFAULT (unixepoch()) NOT NULL;--> statement-breakpoint
UPDATE users
SET role = 'editor'
WHERE role NOT IN ('owner', 'editor');--> statement-breakpoint
UPDATE users
SET status = 'active'
WHERE status IS NULL;--> statement-breakpoint
UPDATE users
SET updated_at = COALESCE(updated_at, created_at, unixepoch())
WHERE updated_at IS NULL;
