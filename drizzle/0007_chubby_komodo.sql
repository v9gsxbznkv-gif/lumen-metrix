CREATE TABLE `sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`syncType` varchar(64) NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`message` text,
	`recordsProcessed` int NOT NULL DEFAULT 0,
	`error` text,
	`results` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sync_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_jobs_jobId_unique` UNIQUE(`jobId`)
);
