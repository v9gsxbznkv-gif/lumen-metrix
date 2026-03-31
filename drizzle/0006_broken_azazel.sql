CREATE TABLE `attendance_weekly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`weekNumber` int NOT NULL,
	`weekStartDate` varchar(10) NOT NULL,
	`campus` varchar(64) NOT NULL,
	`subgroup` varchar(128) NOT NULL,
	`headcount` int NOT NULL DEFAULT 0,
	`regularCount` int NOT NULL DEFAULT 0,
	`guestCount` int NOT NULL DEFAULT 0,
	`volunteerCount` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'pco',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_weekly_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `giving_weekly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`weekNumber` int NOT NULL,
	`weekStartDate` varchar(10) NOT NULL,
	`campus` varchar(64) NOT NULL,
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`general` decimal(12,2) NOT NULL DEFAULT '0',
	`designated` decimal(12,2) NOT NULL DEFAULT '0',
	`donationCount` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'pco',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `giving_weekly_id` PRIMARY KEY(`id`)
);
