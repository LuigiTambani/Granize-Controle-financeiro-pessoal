CREATE TABLE `subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`plan` text DEFAULT 'none' NOT NULL,
	`status` text DEFAULT 'inactive' NOT NULL,
	`customer_id` text,
	`subscription_id` text,
	`checkout_session_id` text,
	`current_period_end` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`transaction_date` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_user_date` ON `transactions` (`user_id`,`transaction_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transactions_user_external` ON `transactions` (`user_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`instance_name` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`phone` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_connections_instance_name_unique` ON `whatsapp_connections` (`instance_name`);