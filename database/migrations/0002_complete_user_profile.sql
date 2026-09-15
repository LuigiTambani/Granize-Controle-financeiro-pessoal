ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `birth_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `country` text DEFAULT 'Brasil' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `currency` text DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `financial_goal` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `preferred_summary_day` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `profile_completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `privacy_accepted_at` text;