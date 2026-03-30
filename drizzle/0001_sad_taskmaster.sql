CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`subgroup` varchar(64) NOT NULL,
	`avgWeekly` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_monthly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`subgroup` varchar(64) NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`avgWeekly` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `attendance_monthly_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `giving` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`general` decimal(12,2) NOT NULL DEFAULT '0',
	`designated` decimal(12,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `giving_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `giving_monthly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`subgroup` varchar(64) NOT NULL,
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `giving_monthly_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `next_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`metric` varchar(64) NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `next_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `next_steps_monthly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`metric` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `next_steps_monthly_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pco_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pcoId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`location` varchar(255),
	`campus` varchar(64),
	`eventType` varchar(128),
	`registrationCount` int DEFAULT 0,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pco_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `pco_events_pcoId_unique` UNIQUE(`pcoId`)
);
--> statement-breakpoint
CREATE TABLE `pco_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pcoId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`groupType` varchar(128),
	`membersCount` int DEFAULT 0,
	`schedule` varchar(255),
	`campus` varchar(64),
	`isArchived` boolean NOT NULL DEFAULT false,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pco_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `pco_groups_pcoId_unique` UNIQUE(`pcoId`)
);
--> statement-breakpoint
CREATE TABLE `pco_people` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pcoId` varchar(64) NOT NULL,
	`firstName` varchar(128),
	`lastName` varchar(128),
	`email` varchar(320),
	`campus` varchar(64),
	`membershipType` varchar(64),
	`status` varchar(64),
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pco_people_id` PRIMARY KEY(`id`),
	CONSTRAINT `pco_people_pcoId_unique` UNIQUE(`pcoId`)
);
--> statement-breakpoint
CREATE TABLE `pco_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` varchar(255) NOT NULL,
	`secret` varchar(255) NOT NULL,
	`churchName` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`lastValidated` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pco_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serving` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`avgWeekly` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `serving_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serving_monthly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `serving_monthly_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncType` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`recordsProcessed` int DEFAULT 0,
	`recordsCreated` int DEFAULT 0,
	`recordsUpdated` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`durationMs` int,
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
