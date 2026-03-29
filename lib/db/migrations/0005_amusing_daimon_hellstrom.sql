CREATE TABLE `document_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`source_url` text NOT NULL,
	`normalized_url` text,
	`provider` text,
	`source_type` text DEFAULT 'web' NOT NULL,
	`meta_json` text,
	`fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`request_payload` text,
	`response_summary` text,
	`trace` text,
	`error_code` text,
	`error_message` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_url` text NOT NULL,
	`normalized_url` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`entry_point` text DEFAULT 'frontstage' NOT NULL,
	`source_type` text DEFAULT 'web' NOT NULL,
	`preferred_mode` text DEFAULT 'auto' NOT NULL,
	`forced_provider` text,
	`selected_provider` text,
	`submitted_by_user_id` text,
	`auto_create` integer DEFAULT true NOT NULL,
	`preview_payload` text,
	`trace` text,
	`result_document_id` text,
	`dedupe_document_id` text,
	`error_code` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`result_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dedupe_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_sources_document_idx` ON `document_sources` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_sources_normalized_url_idx` ON `document_sources` (`normalized_url`);--> statement-breakpoint
CREATE INDEX `import_attempts_job_idx` ON `import_attempts` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_attempts_job_attempt_unique` ON `import_attempts` (`job_id`,`attempt_number`);--> statement-breakpoint
CREATE INDEX `import_jobs_created_at_idx` ON `import_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `import_jobs_status_idx` ON `import_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `import_jobs_submitted_by_idx` ON `import_jobs` (`submitted_by_user_id`);