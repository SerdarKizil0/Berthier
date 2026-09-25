CREATE TABLE `dictations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`raw` text NOT NULL,
	`context` text,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text
);
--> statement-breakpoint
CREATE TABLE `notebooks` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL
);
