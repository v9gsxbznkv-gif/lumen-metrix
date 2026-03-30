CREATE TABLE `report_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` varchar(64) NOT NULL,
	`frequency` varchar(32) NOT NULL,
	`dayOfWeek` int,
	`dayOfMonth` int,
	`email` varchar(320) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`lastSentAt` timestamp,
	`nextRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `report_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_schedules_reportId_unique` UNIQUE(`reportId`)
);
--> statement-breakpoint
CREATE TABLE `saved_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`campus` varchar(64) NOT NULL,
	`yearStart` int NOT NULL,
	`yearEnd` int NOT NULL,
	`sections` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_reports_reportId_unique` UNIQUE(`reportId`)
);
