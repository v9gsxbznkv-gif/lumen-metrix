CREATE TABLE `weekly_report_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dayOfWeek` int NOT NULL DEFAULT 1,
	`hour` int NOT NULL DEFAULT 8,
	`minute` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT false,
	`lastGeneratedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weekly_report_config_id` PRIMARY KEY(`id`)
);
