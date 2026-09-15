CREATE TABLE `whatsapp_bot_connections` (
	`id` text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	`instance_name` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`phone` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_bot_connections_instance_name_unique` ON `whatsapp_bot_connections` (`instance_name`);
--> statement-breakpoint
CREATE TABLE `whatsapp_user_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`verified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_user_links_phone_unique` ON `whatsapp_user_links` (`phone`);
--> statement-breakpoint
CREATE TABLE `whatsapp_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_link_tokens_token_hash_unique` ON `whatsapp_link_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_whatsapp_link_tokens_user` ON `whatsapp_link_tokens` (`user_id`,`expires_at`);
--> statement-breakpoint
INSERT INTO `whatsapp_bot_connections` (`id`, `instance_name`, `status`, `phone`)
SELECT 'primary', `instance_name`, `status`, `phone` FROM `whatsapp_connections`
ORDER BY `created_at` ASC LIMIT 1
ON CONFLICT(`id`) DO NOTHING;
