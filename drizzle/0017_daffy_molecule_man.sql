ALTER TABLE `pco_people` ADD `street` varchar(255);--> statement-breakpoint
ALTER TABLE `pco_people` ADD `city` varchar(128);--> statement-breakpoint
ALTER TABLE `pco_people` ADD `state` varchar(64);--> statement-breakpoint
ALTER TABLE `pco_people` ADD `zip` varchar(20);--> statement-breakpoint
ALTER TABLE `pco_people` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `pco_people` ADD `longitude` double;--> statement-breakpoint
ALTER TABLE `pco_people` ADD `geocodedAt` timestamp;