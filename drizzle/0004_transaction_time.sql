ALTER TABLE `transactions` ADD `transaction_time` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `transactions`
SET `transaction_time` = substr(`created_at`, 12, 5)
WHERE `transaction_time` = '' AND length(`created_at`) >= 16;
