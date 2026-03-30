CREATE TABLE `groups_annual` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`activeGroups` int NOT NULL DEFAULT 0,
	`totalMembers` int NOT NULL DEFAULT 0,
	`totalLeaders` int NOT NULL DEFAULT 0,
	`avgAttendance` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `groups_annual_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups_monthly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`campus` varchar(64) NOT NULL,
	`activeGroups` int NOT NULL DEFAULT 0,
	`totalMembers` int NOT NULL DEFAULT 0,
	`totalLeaders` int NOT NULL DEFAULT 0,
	`avgAttendance` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	CONSTRAINT `groups_monthly_id` PRIMARY KEY(`id`)
);
