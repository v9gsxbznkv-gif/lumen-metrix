CREATE TABLE `volunteer_roster` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campus` varchar(64) NOT NULL,
	`uniqueVolunteers` int NOT NULL DEFAULT 0,
	`totalTeams` int NOT NULL DEFAULT 0,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `volunteer_roster_id` PRIMARY KEY(`id`),
	CONSTRAINT `volunteer_roster_campus_idx` UNIQUE(`campus`)
);
