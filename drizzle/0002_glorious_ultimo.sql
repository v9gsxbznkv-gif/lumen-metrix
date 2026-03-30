CREATE TABLE `pco_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`tokenType` varchar(64) NOT NULL DEFAULT 'Bearer',
	`expiresAt` timestamp NOT NULL,
	`scope` text,
	`organizationName` varchar(255),
	`organizationId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pco_tokens_id` PRIMARY KEY(`id`)
);
