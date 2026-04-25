CREATE TABLE `next_steps_weekly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`weekNumber` int NOT NULL,
	`weekStartDate` varchar(10) NOT NULL,
	`campus` varchar(64) NOT NULL,
	`metric` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `next_steps_weekly_id` PRIMARY KEY(`id`),
	CONSTRAINT `next_steps_weekly_unique_idx` UNIQUE(`year`,`weekNumber`,`campus`,`metric`)
);
--> statement-breakpoint
CREATE TABLE `serving_weekly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`weekNumber` int NOT NULL,
	`weekStartDate` varchar(10) NOT NULL,
	`campus` varchar(64) NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`source` varchar(32) NOT NULL DEFAULT 'spreadsheet',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serving_weekly_id` PRIMARY KEY(`id`),
	CONSTRAINT `serving_weekly_year_week_campus_idx` UNIQUE(`year`,`weekNumber`,`campus`)
);
