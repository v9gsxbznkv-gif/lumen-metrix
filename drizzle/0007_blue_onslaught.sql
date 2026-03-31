CREATE TABLE `sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(128) NOT NULL,
	`syncType` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'running',
	`progress` int NOT NULL DEFAULT 0,
	`message` varchar(512) NOT NULL DEFAULT '',
	`recordsProcessed` int NOT NULL DEFAULT 0,
	`results` text,
	`error` varchar(1024),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `sync_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_jobs_jobId_unique` UNIQUE(`jobId`)
);
