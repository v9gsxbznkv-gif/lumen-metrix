CREATE TABLE `event_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventName` varchar(128) NOT NULL,
	`year` int NOT NULL,
	`attendance` int,
	`giving` decimal(12,2),
	`ftg` int,
	`salvations` int,
	`baptisms` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `event_overrides_id` PRIMARY KEY(`id`)
);
