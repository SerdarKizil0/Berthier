CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`subscription_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`received_at` text,
	`http_status` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_dedupe` ON `notification_deliveries` (`owner`,`subscription_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_notification_deliveries_owner_device` ON `notification_deliveries` (`owner`,`subscription_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_runtime` (
	`id` text PRIMARY KEY NOT NULL,
	`last_started_at` text NOT NULL,
	`last_completed_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_owner` ON `push_subscriptions` (`owner`);