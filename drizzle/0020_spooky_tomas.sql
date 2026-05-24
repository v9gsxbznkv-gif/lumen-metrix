ALTER TABLE `attendance_weekly` ADD `cancelled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `giving_weekly` ADD `cancelled` boolean DEFAULT false NOT NULL;