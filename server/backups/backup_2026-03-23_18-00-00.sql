-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: crop_management
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activities`
--

DROP TABLE IF EXISTS `activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `planting_id` int(11) NOT NULL,
  `activity_type` enum('land_preparation','seeding','transplanting','fertilizing','irrigation','pest_control','weeding','harvesting','other') NOT NULL,
  `activity_date` date NOT NULL,
  `notes` text DEFAULT NULL,
  `performed_by` int(11) DEFAULT NULL,
  `status` enum('pending','ongoing','completed') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_activities_planting` (`planting_id`),
  KEY `fk_activities_user` (`performed_by`),
  CONSTRAINT `fk_activities_planting` FOREIGN KEY (`planting_id`) REFERENCES `plantings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_activities_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activities`
--

LOCK TABLES `activities` WRITE;
/*!40000 ALTER TABLE `activities` DISABLE KEYS */;
INSERT INTO `activities` VALUES (1,1,'fertilizing','2024-06-15','Applied complete fertilizer',1,'pending','2026-03-19 13:47:12','2026-03-19 19:49:02',NULL);
/*!40000 ALTER TABLE `activities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity` varchar(50) DEFAULT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `status` enum('success','failed') NOT NULL DEFAULT 'success',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `activity_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=130 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_logs`
--

LOCK TABLES `activity_logs` WRITE;
/*!40000 ALTER TABLE `activity_logs` DISABLE KEYS */;
INSERT INTO `activity_logs` VALUES (1,NULL,'REGISTER_SUCCESS','users',3,'::1','success','2026-03-19 19:57:21'),(2,NULL,'LOGIN_SUCCESS','users',2,'::1','success','2026-03-19 19:59:07'),(3,NULL,'REGISTER_SUCCESS','users',4,'::1','success','2026-03-19 20:17:27'),(4,NULL,'EMAIL_VERIFIED','users',4,NULL,'success','2026-03-19 20:20:42'),(5,NULL,'LOGIN_SUCCESS','users',4,'::1','success','2026-03-19 21:27:08'),(6,NULL,'LOGOUT_ALL_DEVICES',NULL,NULL,'::1','success','2026-03-19 21:29:22'),(7,NULL,'PASSWORD_RESET_REQUESTED',NULL,NULL,'::1','success','2026-03-19 21:34:21'),(8,NULL,'REGISTER_SUCCESS','users',5,'::1','success','2026-03-20 03:41:46'),(9,NULL,'REGISTER_SUCCESS','users',6,'::1','success','2026-03-20 03:43:35'),(10,NULL,'EMAIL_VERIFIED','users',6,NULL,'success','2026-03-20 03:43:47'),(11,NULL,'LOGIN_SUCCESS','users',6,'::1','success','2026-03-20 03:44:07'),(12,NULL,'LOGIN_SUCCESS','users',6,'::1','success','2026-03-20 03:44:41'),(13,NULL,'LOGIN_SUCCESS','users',6,'::1','success','2026-03-20 03:52:51'),(14,NULL,'REGISTER_SUCCESS','users',7,'::1','success','2026-03-20 04:09:08'),(15,NULL,'EMAIL_VERIFIED','users',7,NULL,'success','2026-03-20 04:09:24'),(16,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 04:09:42'),(17,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 04:10:58'),(18,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 04:18:55'),(19,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 06:56:16'),(20,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-20 07:07:04'),(21,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:07:20'),(22,NULL,'CREATE_FARM','farms',2,'::1','success','2026-03-20 07:09:06'),(23,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:11:03'),(24,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:16:38'),(25,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-20 07:16:47'),(26,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:17:00'),(27,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:17:25'),(28,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-20 07:17:29'),(29,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-20 07:17:50'),(30,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:17:58'),(31,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:23:38'),(32,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-20 07:23:49'),(33,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:24:58'),(34,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-20 07:26:12'),(35,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 07:27:31'),(36,NULL,'LOGIN_SUCCESS','users',7,'::1','success','2026-03-20 09:24:59'),(37,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-20 09:25:09'),(38,NULL,'REGISTER_SUCCESS','users',8,'::1','success','2026-03-20 09:27:06'),(39,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-20 09:27:25'),(40,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-20 10:03:21'),(41,NULL,'REGISTER_SUCCESS','users',9,'::1','success','2026-03-20 10:05:53'),(42,NULL,'EMAIL_VERIFIED','users',9,NULL,'success','2026-03-20 10:06:05'),(43,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-20 10:06:49'),(44,NULL,'LOGIN_SUCCESS','users',9,'::1','success','2026-03-20 10:06:59'),(45,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-20 10:07:32'),(46,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 03:29:04'),(47,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 03:41:00'),(48,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 03:41:07'),(49,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 03:41:09'),(50,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-21 03:41:17'),(51,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-21 03:41:24'),(52,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-21 03:41:32'),(53,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-21 03:41:37'),(54,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-21 03:41:43'),(55,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-21 03:42:49'),(56,NULL,'REGISTER_SUCCESS','users',10,'::1','success','2026-03-21 03:44:59'),(57,NULL,'REGISTER_SUCCESS','users',11,'::1','success','2026-03-21 03:48:10'),(58,NULL,'REGISTER_SUCCESS','users',12,'::1','success','2026-03-21 03:53:43'),(59,NULL,'REGISTER_SUCCESS','users',13,'::1','success','2026-03-21 06:37:40'),(60,NULL,'REGISTER_SUCCESS','users',14,'::1','success','2026-03-21 06:41:55'),(61,NULL,'EMAIL_VERIFIED','users',14,NULL,'success','2026-03-21 06:42:16'),(62,NULL,'REGISTER_SUCCESS','users',15,'::1','success','2026-03-21 06:48:17'),(63,NULL,'EMAIL_VERIFIED','users',15,NULL,'success','2026-03-21 06:48:36'),(64,NULL,'LOGIN_SUCCESS','users',15,'::1','success','2026-03-21 06:48:48'),(65,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 07:01:20'),(66,NULL,'LOGIN_SUCCESS','users',15,'::1','success','2026-03-21 07:09:43'),(67,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 07:09:54'),(68,NULL,'REGISTER_SUCCESS','users',16,'::1','success','2026-03-21 07:12:19'),(69,NULL,'EMAIL_VERIFIED','users',16,NULL,'success','2026-03-21 07:14:01'),(70,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 07:14:17'),(71,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 07:29:56'),(72,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 07:29:59'),(73,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 07:42:02'),(74,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 08:08:26'),(75,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 08:13:36'),(76,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 08:19:33'),(77,1,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 08:33:21'),(78,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 08:33:40'),(79,1,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 08:36:09'),(80,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 08:38:20'),(81,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 08:47:36'),(82,NULL,'LOGIN_SUCCESS','users',16,'::1','success','2026-03-21 12:42:04'),(83,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 12:43:19'),(84,NULL,'REGISTER_SUCCESS','users',17,'::1','success','2026-03-21 12:45:26'),(85,NULL,'REGISTER_SUCCESS','users',18,'::1','success','2026-03-21 15:39:04'),(86,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 15:57:07'),(87,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-21 15:57:11'),(88,NULL,'REGISTER_SUCCESS','users',19,'::1','success','2026-03-21 16:00:07'),(89,NULL,'REGISTER_SUCCESS','users',20,'::1','success','2026-03-21 16:10:11'),(90,NULL,'EMAIL_VERIFIED','users',20,NULL,'success','2026-03-21 16:11:01'),(91,NULL,'LOGIN_SUCCESS','users',20,'::1','success','2026-03-21 16:11:19'),(92,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 16:11:31'),(93,NULL,'LOGIN_SUCCESS','users',20,'::1','success','2026-03-21 16:14:17'),(94,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 16:14:28'),(95,NULL,'LOGIN_SUCCESS','users',20,'::1','success','2026-03-21 16:14:55'),(96,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 16:14:59'),(97,NULL,'LOGIN_SUCCESS','users',20,'::1','success','2026-03-21 16:16:26'),(98,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 16:16:32'),(99,NULL,'LOGIN_SUCCESS','users',20,'::1','success','2026-03-21 16:20:07'),(100,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 16:20:12'),(101,NULL,'LOGIN_SUCCESS','users',20,'::1','success','2026-03-21 16:24:51'),(102,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-21 16:24:58'),(103,NULL,'REGISTER_SUCCESS','users',21,'::1','success','2026-03-22 15:27:40'),(104,NULL,'EMAIL_VERIFIED','users',21,NULL,'success','2026-03-22 15:27:54'),(105,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-22 15:28:49'),(106,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-22 15:29:14'),(107,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-22 15:29:22'),(108,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-22 15:29:44'),(109,NULL,'ACCOUNT_LOCKED',NULL,NULL,'::1','failed','2026-03-22 15:30:12'),(110,NULL,'REGISTER_SUCCESS','users',22,'::1','success','2026-03-22 15:31:58'),(111,NULL,'EMAIL_VERIFIED','users',22,NULL,'success','2026-03-22 15:32:07'),(112,NULL,'LOGIN_SUCCESS','users',22,'::1','success','2026-03-22 15:32:47'),(113,NULL,'LOGOUT',NULL,NULL,'::1','success','2026-03-22 15:33:12'),(114,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-23 11:55:35'),(115,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-23 11:55:58'),(116,NULL,'LOGIN_FAILED',NULL,NULL,'::1','failed','2026-03-23 11:56:05'),(117,NULL,'REGISTER_SUCCESS','users',23,'::1','success','2026-03-23 11:57:04'),(118,NULL,'EMAIL_VERIFIED','users',23,NULL,'success','2026-03-23 11:57:28'),(119,NULL,'LOGIN_SUCCESS','users',23,'::1','success','2026-03-23 11:57:59'),(120,NULL,'LOGIN_SUCCESS','users',23,'::1','success','2026-03-23 11:58:38'),(121,24,'REGISTER_SUCCESS','users',24,'::1','success','2026-03-23 16:56:29'),(122,24,'EMAIL_VERIFIED','users',24,NULL,'success','2026-03-23 16:56:48'),(123,24,'LOGIN_SUCCESS','users',24,'::1','success','2026-03-23 16:57:01'),(124,24,'LOGIN_SUCCESS','users',24,'::1','success','2026-03-23 17:04:28'),(125,24,'LOGOUT',NULL,NULL,'::1','success','2026-03-23 17:13:00'),(126,24,'LOGIN_SUCCESS','users',24,'::1','success','2026-03-23 17:13:18'),(127,24,'LOGIN_SUCCESS','users',24,'::1','success','2026-03-23 17:33:08'),(128,24,'LOGIN_SUCCESS','users',24,'::1','success','2026-03-23 17:34:32'),(129,24,'LOGIN_SUCCESS','users',24,'::1','success','2026-03-23 17:51:30');
/*!40000 ALTER TABLE `activity_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `api_keys`
--

DROP TABLE IF EXISTS `api_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `api_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `api_key` varchar(255) NOT NULL,
  `user_id` int(11) NOT NULL,
  `permissions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`permissions`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_used` timestamp NULL DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_key` (`api_key`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `api_keys_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `api_keys`
--

LOCK TABLES `api_keys` WRITE;
/*!40000 ALTER TABLE `api_keys` DISABLE KEYS */;
/*!40000 ALTER TABLE `api_keys` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `farms`
--

DROP TABLE IF EXISTS `farms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `farms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner_id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `location` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_farms_owner` (`owner_id`),
  CONSTRAINT `fk_farms_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `farms`
--

LOCK TABLES `farms` WRITE;
/*!40000 ALTER TABLE `farms` DISABLE KEYS */;
INSERT INTO `farms` VALUES (1,1,'Dela Cruz Farm','Nueva Ecija','2026-03-19 13:45:33','2026-03-19 19:49:02',NULL),(2,1,'Dela Cruz Farm','Nueva Ecija','2026-03-20 07:09:06','2026-03-20 07:09:06',NULL);
/*!40000 ALTER TABLE `farms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fields`
--

DROP TABLE IF EXISTS `fields`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fields` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `farm_id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `size` decimal(5,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_fields_farm` (`farm_id`),
  CONSTRAINT `fk_fields_farm` FOREIGN KEY (`farm_id`) REFERENCES `farms` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `chk_field_size` CHECK (`size` > 0)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fields`
--

LOCK TABLES `fields` WRITE;
/*!40000 ALTER TABLE `fields` DISABLE KEYS */;
INSERT INTO `fields` VALUES (1,1,'Plot A',2.50,'2026-03-19 13:46:16','2026-03-19 19:49:02',NULL);
/*!40000 ALTER TABLE `fields` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `harvests`
--

DROP TABLE IF EXISTS `harvests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `harvests` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `planting_id` int(11) NOT NULL,
  `harvest_date` date NOT NULL,
  `yield_kg` decimal(10,2) NOT NULL,
  `quality_grade` enum('A','B','C','rejected') DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `planting_id` (`planting_id`),
  CONSTRAINT `fk_harvests_planting` FOREIGN KEY (`planting_id`) REFERENCES `plantings` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `chk_yield_positive` CHECK (`yield_kg` > 0)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `harvests`
--

LOCK TABLES `harvests` WRITE;
/*!40000 ALTER TABLE `harvests` DISABLE KEYS */;
INSERT INTO `harvests` VALUES (1,1,'2024-09-15',850.50,'A','Good harvest this season','2026-03-19 13:47:29','2026-03-19 19:49:02',NULL);
/*!40000 ALTER TABLE `harvests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `login_attempts`
--

DROP TABLE IF EXISTS `login_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `login_attempts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ip_address` varchar(45) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `attempted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `success` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_ip_attempted` (`ip_address`,`attempted_at`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `login_attempts`
--

LOCK TABLES `login_attempts` WRITE;
/*!40000 ALTER TABLE `login_attempts` DISABLE KEYS */;
INSERT INTO `login_attempts` VALUES (1,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:57:06',0),(2,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:57:07',0),(3,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:57:11',0),(4,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:57:11',0),(5,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:57:14',0),(6,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:58:07',0),(7,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 15:58:24',0),(8,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:10:34',0),(9,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:11:18',0),(10,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:11:19',1),(11,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:14:17',0),(12,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:14:17',1),(13,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:14:46',0),(14,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:14:54',0),(15,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:14:55',1),(16,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:16:18',0),(17,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:16:25',0),(18,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:16:26',1),(19,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:20:07',0),(20,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:20:07',1),(21,'::1','pangilinanamarkkhian@gmail.com','2026-03-21 16:20:32',0),(22,'::1','pangilinanamarkkhian@gmail.com','2026-03-21 16:20:44',0),(23,'::1','pangilinanamarkkhian@gmail.com','2026-03-21 16:20:44',0),(24,'::1','pangilinanamarkkhian@gmail.com','2026-03-21 16:21:07',0),(25,'::1','pangilinanamarkkhian@gmail.com','2026-03-21 16:21:07',0),(26,'::1','pangilinanmarkkhian@gmail.com','2026-03-21 16:24:51',1),(27,'::1','pangilinanmarkkhian@gmail.com','2026-03-22 15:28:49',0),(28,'::1','pangilinanmarkkhian@gmail.com','2026-03-22 15:29:14',0),(29,'::1','pangilinanmarkkhian@gmail.com','2026-03-22 15:29:22',0),(30,'::1','pangilinanmarkkhian@gmail.com','2026-03-22 15:29:44',0),(31,'::1','pangilinanmarkkhian@gmail.com','2026-03-22 15:30:08',0),(32,'::1','pangilinanmarkkhian@gmail.com','2026-03-22 15:32:47',1),(33,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 11:55:35',0),(34,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 11:55:58',0),(35,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 11:56:05',0),(36,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 11:57:59',1),(37,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 11:58:38',1),(38,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 16:57:00',1),(39,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 17:04:28',1),(40,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 17:13:18',1),(41,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 17:33:08',1),(42,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 17:34:32',1),(43,'::1','pangilinanmarkkhian@gmail.com','2026-03-23 17:51:30',1);
/*!40000 ALTER TABLE `login_attempts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_history`
--

DROP TABLE IF EXISTS `password_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `password_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_history`
--

LOCK TABLES `password_history` WRITE;
/*!40000 ALTER TABLE `password_history` DISABLE KEYS */;
INSERT INTO `password_history` VALUES (20,24,'$2b$12$TLpo9m53wgtCa7X6Yj9p7epoHoFkJAcXd88W15I4Fz7IMrjPtT5Z.','2026-03-23 16:56:25');
/*!40000 ALTER TABLE `password_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `plantings`
--

DROP TABLE IF EXISTS `plantings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `plantings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `field_id` int(11) NOT NULL,
  `variety` varchar(100) NOT NULL,
  `planting_date` date NOT NULL,
  `expected_harvest` date NOT NULL,
  `season` enum('wet','dry') NOT NULL,
  `growth_stage` enum('land_preparation','seeding','transplanting','tillering','booting','heading','ripening','harvested') NOT NULL DEFAULT 'land_preparation',
  `status` enum('active','completed','failed') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_field_planting` (`field_id`,`planting_date`),
  CONSTRAINT `fk_plantings_field` FOREIGN KEY (`field_id`) REFERENCES `fields` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `chk_harvest_after_planting` CHECK (`expected_harvest` > `planting_date`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `plantings`
--

LOCK TABLES `plantings` WRITE;
/*!40000 ALTER TABLE `plantings` DISABLE KEYS */;
INSERT INTO `plantings` VALUES (1,1,'NSIC Rc222','2024-06-01','2024-09-15','wet','harvested','completed','2026-03-19 13:46:57','2026-03-19 19:49:02',NULL);
/*!40000 ALTER TABLE `plantings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sessions`
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `device_type` varchar(50) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sessions`
--

LOCK TABLES `sessions` WRITE;
/*!40000 ALTER TABLE `sessions` DISABLE KEYS */;
INSERT INTO `sessions` VALUES (43,24,'6d75969fbcd20c005e209ce7079e8e450b9d763349cac34adc3add8dc58f703b','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36','desktop — Chrome on Windows',0,'2026-03-23 16:57:01','2026-03-24 08:57:01'),(44,24,'f2f261f91286f2e6f3a42db7b96cb1596d2da9919d495744b5ae9b855b6a2cad','::1','PostmanRuntime/7.52.0','desktop — Unknown on Unknown',1,'2026-03-23 17:04:28','2026-03-24 09:04:28'),(45,24,'c3809565dacaee1e57dafea58017202dff684699f89f78e980b7980b011a0eb4','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36','desktop — Chrome on Windows',1,'2026-03-23 17:13:18','2026-03-24 09:13:18'),(46,24,'6154ea2efd4f1daa456d0a042991bac58991cd4f88658e2b1495593855e6fac6','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36','desktop — Chrome on Windows',1,'2026-03-23 17:33:08','2026-03-24 09:33:08'),(47,24,'30d65926935a662f164d253aae48bc50e99fd67546dbc56989d0b0d47857cb65','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36','desktop — Chrome on Windows',1,'2026-03-23 17:34:32','2026-03-24 09:34:32'),(48,24,'2370ce7facd0e3b8c338f5e05f6b29b99ca42bb7042723ee1d3e147404f23757','::1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36','desktop — Chrome on Windows',1,'2026-03-23 17:51:30','2026-03-24 09:51:30');
/*!40000 ALTER TABLE `sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_crops`
--

DROP TABLE IF EXISTS `tbl_crops`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tbl_crops` (
  `crop_id` int(11) NOT NULL AUTO_INCREMENT,
  `crop_name` varchar(255) DEFAULT NULL,
  `planting_start` varchar(255) DEFAULT NULL,
  `planting_end` varchar(255) DEFAULT NULL,
  `harvest_start` varchar(255) DEFAULT NULL,
  `harvest_end` varchar(255) DEFAULT NULL,
  `irrigation_required` int(11) DEFAULT NULL,
  `irrigation_type` varchar(255) DEFAULT NULL,
  `irrigation_frequency` varchar(255) DEFAULT NULL,
  `days_to_maturity` int(11) DEFAULT NULL,
  `plant_spacing_cm` varchar(50) DEFAULT NULL,
  `row_spacing_cm` varchar(50) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  PRIMARY KEY (`crop_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_crops`
--

LOCK TABLES `tbl_crops` WRITE;
/*!40000 ALTER TABLE `tbl_crops` DISABLE KEYS */;
INSERT INTO `tbl_crops` VALUES (1,'Rice','2026-05-01','2026-06-15','2026-09-01','2026-10-15',1,'Flooded','Daily',120,'1','1','Best planted in wet season',1),(2,'Wheat','2026-11-01','2026-12-15','2027-03-01','2027-04-10',1,'Moderate','2–3 times/week',120,NULL,NULL,'Requires cool months',1),(3,'Corn','2026-05-15','2026-07-01','2026-09-15','2026-11-01',1,'Moderate','2 times/week',100,'30','30','Irrigate during tasseling stage',1),(4,'Tomato','2026-10-01','2026-12-01','2026-12-30','2027-02-15',1,'Drip','3 times/week',90,'25','25','Avoid overwatering',1),(5,'Pechay','2026-01-01','2026-12-31','2026-01-30','2026-12-30',1,'Light','Daily',40,NULL,NULL,'Can grow year-round in cool months',1),(6,'Mung Bean','2026-06-01','2026-07-15','2026-08-01','2026-09-15',0,'None','None',65,'1','1','Minimal irrigation required',1);
/*!40000 ALTER TABLE `tbl_crops` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_farm_data`
--

DROP TABLE IF EXISTS `tbl_farm_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tbl_farm_data` (
  `farm_id` int(11) NOT NULL AUTO_INCREMENT,
  `farm_name` varchar(255) DEFAULT NULL,
  `farm_size` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `crops` varchar(255) DEFAULT NULL,
  `latitude` varchar(255) DEFAULT NULL,
  `longitude` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  PRIMARY KEY (`farm_id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_farm_data`
--

LOCK TABLES `tbl_farm_data` WRITE;
/*!40000 ALTER TABLE `tbl_farm_data` DISABLE KEYS */;
INSERT INTO `tbl_farm_data` VALUES (1,'data test','13','Hectares','3,6','16.673689','121.782074','Salvacion, Echague, Isabela, Cagayan Valley, Philippines',NULL,'2026-02-21 11:22:58','2026-02-24 17:53:53',1),(2,'testdata','1','Hectares','5','14.437340','120.571518','Maharlika Street, Doña Nene Subdivision, Sitio Bakery, Mountain View, Mariveles, Bataan, Central Luzon, 2105, Philippines',NULL,'2026-02-21 11:44:51','2026-02-24 17:51:19',1),(3,'testdata222','1','Hectares','1','15.469563','119.984436','Pangolingan, Zambales, Central Luzon, Philippines',2,'2026-02-21 11:58:14','2026-02-24 18:06:40',1),(4,'aweawe','3','Hectares','2','12.399024','122.618408','Cajidiocan, Romblon, Mimaropa, Philippines',2,'2026-02-21 11:59:13','2026-02-24 17:51:34',1),(5,'aweawe','3','Hectares','1','37.160317','64.248047','Halach District, Lebap Region, 326402, Turkmenistan',2,'2026-02-21 11:59:29','2026-02-24 17:51:40',1),(6,'awe','13','Hectares','5','11.574216','122.319031','Badiangan, Banga, Aklan, Western Visayas, Philippines',NULL,'2026-02-21 12:33:31','2026-02-24 17:50:46',1),(7,'test31123','5','Hectares','6','13.672676','124.255371','Kilikilihan, San Miguel, Catanduanes, Bicol Region, Philippines',2,'2026-02-21 16:43:36','2026-02-24 17:50:31',1),(8,'tetetet','33','Hectares','3,6','11.135287','122.706299','Passi, Iloilo, Western Visayas, Philippines',2,'2026-02-21 16:48:10','2026-02-24 18:06:08',1),(9,'aweawe','33','Hectares','Corn,Rice,Wheat','15.220589','120.816650','San Vicente, Cabiao, Nueva Ecija, Central Luzon, 3107, Philippines',2,'2026-02-21 16:49:24','2026-02-21 16:49:33',0),(10,'123123','22','Hectares','Mung Bean,Pechay','15.538376','120.739746','*, Villarosa, Licab, Nueva Ecija, Central Luzon, 3112, Philippines',2,'2026-02-22 03:26:06','2026-02-22 04:50:18',0),(11,'Olivers Farm','200','SquareMeters','1,2','15.621192','121.162350','Cruz, Bongabon, Nueva Ecija, Central Luzon, 3128, Philippines',7,'2026-02-28 14:24:37','2026-02-28 14:25:47',1),(12,'Florikas Farm','1','Hectares','4','15.614853','121.161840','Bongabon Dingalan Road, Tulay na Bato, Curva, Bongabon, Nueva Ecija, Central Luzon, 3128, Philippines',7,'2026-02-28 14:26:41',NULL,1),(13,'Elon Musk Farm','100','SquareMeters','6','15.603466','121.143504','DITO Cellsite Tower, Nueva Ecija-Aurora Road, Lusok, Bongabon, Nueva Ecija, Central Luzon, 3128, Philippines',7,'2026-02-28 14:48:36',NULL,1),(14,'bahay ko to ','150','SquareMeters','3','15.602102','121.140715','Nueva Ecija-Aurora Road, Lusok, Bongabon, Nueva Ecija, Central Luzon, 3128, Philippines',7,'2026-02-28 14:51:55',NULL,1);
/*!40000 ALTER TABLE `tbl_farm_data` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_farming`
--

DROP TABLE IF EXISTS `tbl_farming`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tbl_farming` (
  `farming_id` int(11) NOT NULL AUTO_INCREMENT,
  `farm_id` varchar(255) DEFAULT NULL,
  `crop_id` varchar(255) DEFAULT NULL,
  `qty` varchar(255) DEFAULT NULL,
  `uom` varchar(255) DEFAULT NULL,
  `statis` int(11) DEFAULT 1,
  PRIMARY KEY (`farming_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_farming`
--

LOCK TABLES `tbl_farming` WRITE;
/*!40000 ALTER TABLE `tbl_farming` DISABLE KEYS */;
INSERT INTO `tbl_farming` VALUES (1,'8','3','100','6',1),(2,'8','6','100','6',1),(3,'12','4','1000','6',1);
/*!40000 ALTER TABLE `tbl_farming` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_groups`
--

DROP TABLE IF EXISTS `tbl_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tbl_groups` (
  `group_code` int(11) NOT NULL AUTO_INCREMENT,
  `group_name` varchar(255) DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  PRIMARY KEY (`group_code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_groups`
--

LOCK TABLES `tbl_groups` WRITE;
/*!40000 ALTER TABLE `tbl_groups` DISABLE KEYS */;
INSERT INTO `tbl_groups` VALUES (1,'Admin',1);
/*!40000 ALTER TABLE `tbl_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_uom`
--

DROP TABLE IF EXISTS `tbl_uom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tbl_uom` (
  `uom_id` int(11) NOT NULL AUTO_INCREMENT,
  `uom_code` varchar(255) DEFAULT NULL,
  `uom_name` varchar(255) DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  PRIMARY KEY (`uom_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_uom`
--

LOCK TABLES `tbl_uom` WRITE;
/*!40000 ALTER TABLE `tbl_uom` DISABLE KEYS */;
INSERT INTO `tbl_uom` VALUES (1,'KG','Kilogram',1),(2,'G','Gram',1),(3,'MT','Metric Ton',1),(4,'HA','Hectare',1),(5,'SQM','Square Meter',1),(6,'SEED','Seed',1),(7,'PLT','Plant',1),(8,'L','Liter',1);
/*!40000 ALTER TABLE `tbl_uom` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tbl_users`
--

DROP TABLE IF EXISTS `tbl_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tbl_users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(255) DEFAULT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `group_code` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT 1,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tbl_users`
--

LOCK TABLES `tbl_users` WRITE;
/*!40000 ALTER TABLE `tbl_users` DISABLE KEYS */;
INSERT INTO `tbl_users` VALUES (1,'Oliver','Dela Fuente','gunsterpsp','1234','maebear143@gmail.com',1,1),(2,'Oliver','Dela Fuente','farmer1','1234','maebear143@gmail.com',2,1),(3,'testuser','testuser','testuser','testuser','testuser@gmail.com',2,1),(4,'aweawe','aweawe','aweawe','222','aweawe@gmail.com',2,1),(5,'test22233','test222','test222','1234','test222@gmail.com',2,0),(6,'','','','1234','',2,0),(7,'oliver','dela fuente','oliverdelafuente','123123','oliverdelafuente93@gmail.com',2,1);
/*!40000 ALTER TABLE `tbl_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `token_blacklist`
--

DROP TABLE IF EXISTS `token_blacklist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `token_blacklist` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` text NOT NULL,
  `expired_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `token_blacklist`
--

LOCK TABLES `token_blacklist` WRITE;
/*!40000 ALTER TABLE `token_blacklist` DISABLE KEYS */;
INSERT INTO `token_blacklist` VALUES (1,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Nywicm9sZSI6ImZhcm1lciIsImlhdCI6MTc3Mzk5MDk5OCwiZXhwIjoxNzc0MDE5Nzk4fQ.nZuSDW81wVCEGgbQbK2QV4eBH25mTbK_lOPA2iktVGD5Y_9_Q62KYOUHTue_Ct2ZHzWevyCvK3UB0AkJk-3U8nNnkca2VZfEBZ1PNSQBoP9HlGvnr0s6n15NftY4z6XzAzMGWWBRfVfAa6xlF3O4XSU1H3xVX4SG8Kfz9qFZPWo8e2zmj4C9zpbJvoXLPP2zuS-bUHwElDX5DWbPYYG8Z-o7KTPjSgclkruy9ugmxAZ4qKJAwq_suDpWQphUuXTZQoeiSMAOlWeriohLxkQbrV9D8Tt_f5QWNPigN7h5HVZtaqOMIuTWkN5WAvY2l9MtyTZuBYuaI28GeKHavK3kiA','2026-03-20 23:16:38','2026-03-20 07:16:46'),(2,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Nywicm9sZSI6ImZhcm1lciIsImlhdCI6MTc3Mzk5MTA0NSwiZXhwIjoxNzc0MDE5ODQ1fQ.P5o7GnriwWnFNG0dQ8xmxNigAP2Rz_Wn2if8AM8WJt1IxHNWYESTdcKg1mZ4Nfzdn1P7cav-XtBXUgk3FTMgGrDISnXIzyC0OjJ5SK9andHGRX2hZVnLJjwoxdmVkRbjc2P5Cwav3BfqZeTFhU8BkoR_xWqOXk4jRLtBtiLoIjsrv-lblqf1gGCqxQS-opYBvv-NRxKCCHYNUI7H-RQtKxP3i4CZUdRD39TUGjKygl1tit6YSZjE_Y333_p3Ucynzgyo5wTiMM-r_gn2BzKxRNJxBpdi4t3Gc1xVDbutHtjxHY2zzsQX-590xLrobrE9STMaTaIIHyXuh4uc6X9rLw','2026-03-20 23:17:25','2026-03-20 07:17:29'),(3,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Nywicm9sZSI6ImZhcm1lciIsImlhdCI6MTc3Mzk5MTQxOCwiZXhwIjoxNzc0MDIwMjE4fQ.WAwv61CtxOHPlzhOmEPLbhO_qm_mWVPuthMy0X8YOHdh6t0wXLrlqTI41-wG7D47iEkAQ_Zh3OMEVwdvjfMStC5SgfvIRRM1Bqc_rremuyGPFvdG9joApip5x_fez7ETGjxDQBJ0Ss_-nX9vUjQsOvfOeQPsn9mBE2nD_63-ZGiPyXZaMtBMcoc9jfp4u9MKnkUGaKbdEPI-zGnp4IgaUyV8mwliT5HqQDrAbfI4xY5MACpkWecXm-oGNaWz5a9tfWEfjlcXKLzrYiNCiw6UFumJjIOIuPws4cl7x12s7WOapE3bk9hKVWnDKcyqpw8fPBuFUQ5W3bn2WD3rkcyCBQ','2026-03-20 23:23:38','2026-03-20 07:23:49'),(4,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Nywicm9sZSI6ImZhcm1lciIsImlhdCI6MTc3Mzk5MTQ5OCwiZXhwIjoxNzc0MDIwMjk4fQ.UZHR2bA18rGYxall7bzb2grMy9GB8eINzs32aKE_M_wtEtBt5Ek0KXSyxQpCI1kTjWBNS0hjYRSvPhs_f9Er84blMTuGP9aWVBD7ftlJT5Nc86FGS2BC-TCJwq1Q10dFLwhoz0nS6X7QkfWTU3mZY2J3SW9DuzKDWx5SpPrH5BQG6-CU4uAEQFCsxdd49ZibLmeSOW936JqqgDHw3bU658JuGS67_hqNoEhoGc5GJG-Ruq22BD6ematg8DYznoO1yeu1uuWh6ZJtN3JDWoZW58VxXM80aOBSeckn9j-qKdyeRrMgML6rvaLYI6Cqm1JuM5VHzwxFSdjmhUAAoh-rvA','2026-03-20 23:24:58','2026-03-20 07:26:12'),(5,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Nywicm9sZSI6ImZhcm1lciIsImlhdCI6MTc3Mzk5ODY5OSwiZXhwIjoxNzc0MDI3NDk5fQ.Qec19_fla1y1AYZ3J_5HhVxv8FsUEL18WTHfc_v9G8ihSoVJUehl0GxY5xvzdrOEYCbFwleZmbd7tICf8a3z3BocB9YnOnR8Z9hf2fBrZxJFO_NSXFT1bh_XkXZ1bM-I2qgVaYpdjx-qJBpTrzMgt4YfepyuNHD6_JfEQeCpy4OKV-Gpc7Nu9pZCMCEwNCIe6HupklnWyhNx_A1uV6cDAJww18vfuKLUPX9_ZJsFSdotYoJ1xvgkraYLI4bNHxU1y8J7_hHDDrXOObJovQAbEkN1RYq6OvFlRnMQFhBNyYeHcUJMDBUuWGYgsp5R0r1GGEuinR_ekM9daiFgbwqV8w','2026-03-21 01:24:59','2026-03-20 09:25:09'),(6,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OSwicm9sZSI6ImZhcm1lciIsImlhdCI6MTc3NDAwMTIxOSwiZXhwIjoxNzc0MDMwMDE5fQ.TlIcOFMIWYyuA9FRgj5t8an1zKeICDgn2JQuVW04HotQiyhV5-rSiJSY2tfuGe-s3vc_RkFI-r1ne8cihgtJjh1J_LqLyLzQjKwYe0lG6tvrAjoRXTas-EaJaGDlgYK0rkvAZJVLK4guPIGfmc01emdlnChBb_VR5Pz3qQWq1BXKaxNVd8lRF4meFh1wn6d1iapr4NuHkmiTsZBx7V7JJUMKXGhngm8EDoxA0P2FXebbKseqlkp2Nc3t_NCGuIjD7GQw6lqDR04AWFxyoiAKNLws05V6AukNhPJIkacKGuTyPcLGDt4cUqEqSXS89DbAD-Do6E0ogF9PyIHi9reOdg','2026-03-21 02:06:59','2026-03-20 10:07:32'),(7,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTUsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQwNzU3MjgsImV4cCI6MTc3NDEwNDUyOH0.asp3Pi0jgUVT6mI08Rsiv8fJgT3Xyqh9VqeEQn_b07IlPZzYoktj2kjZjbnONhNo5MtE9UuLP0tdkAeG2LKvIvsE77UU28_ZNC9YhCKtIq4x2UHxrr48yYEVyPHbI6LSdEWhnsrsRYeUSa4mA96skQB1N0IgyrXV8_J-rbLIqsgBQYcMM8I7LhuFZBxMM413ntQPesJ1-F-HJLj67ueDWKJx-o6xl8H3bfix58rw0k3P104IH3192uSgLMv7SC6qcFXTZjhOjTmkOjsdvMsRZrv6k1KpAGF3EZC5D020JmNOoJMI8P4gRLFOwo6l6tKQWXMkgNvEWPoqB5AUkTF_Hw','2026-03-21 22:48:48','2026-03-21 07:01:20'),(8,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTUsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQwNzY5ODMsImV4cCI6MTc3NDEwNTc4M30.DmMSe4JUranaEJD-3g2cQ6tlGYYV6kc3DXj6IR1_9AV5_wROdZFrrg-aUST9-FklXeNhvAqWBDJQZLcfQzDt7SawzwfLXnRRIko_eyimofeidBYJp2jyfM-qBu91sPWljcgTEbrhodIY2UvnTccBYJH7e99ZNIod27E0ngwe3jzD4QvQaCQVH_f9oyol563u3Z1vtWRJY3D6qGjicwXTVScW5BdUue0KaBcWdd6e8vLqeAaTCoZRJgM-WKG6ozgy2a5SUlzZnUTh7OkZ22LNFK-4bZ-eo8R6l8WGiDBZ8hrZB90L5GmYTgVs5eAV1GX5bYH6gVUqoKNKyAvNxI78Tg','2026-03-21 23:09:43','2026-03-21 07:09:54'),(9,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTYsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQwNzgxOTYsImV4cCI6MTc3NDEwNjk5Nn0.Qwgoh_ONKpS5_Awv4rUzYkM6Uyi2ZMzRJSSl2--RLeyRCqbZmem1aGFaEAz_C9KOdDN_S4F2oLi3RtW5JwvuJLJEW5ucw0z0GKC0wayp-4VvfsVn1eR3K2yC432cD6NxXBondIMkYf3_-FxddbjPf7uJHHOvZ36FeepijVi8jLA3U-_wk8zqs7-aAw_kmtygr3qFrgkuj4Tx1TKcvxrtRCOJbuHlt0T1vFNsjgK_IluMOkBJ9sC8RKzLT9WSEqR9AyCtFdtQHs9juQ13ggV5eaU2CdsU2DWkhSDfev4BnVncvvUw0RevLWANJ4PQuVDU_yJdynFJF5G8_ZqtCK5y3Q','2026-03-21 23:29:56','2026-03-21 07:29:59'),(10,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTYsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc3NDA5NjkyNCwiZXhwIjoxNzc0MTI1NzI0fQ.h_GEXo5L0rse8iMBm0AGDIzBdxNs7uLWgSQ2jHubOqsBxU2oSc2IQDEjYc6kDyM03zZaNdCKJYI8ureW9qrMp4uLuSgKe4EoMUx9NVsXYFlWwuEkfMzbAVnjL7dzU4jHzGsAuRV9Ib-eT0ZX--dc0T7SBFGhOZ9pQLaBU1XlvjWgusSfyVeGPRXniE8EI7ilUsZQgAUeWJr3mWfW6xpX7xln4nVBjnJQZanBgCM-cGxETCnJFCEN2qrDaH7aK8xEHxdC2DCWqxCerkWZP_qLuecSFeMOchHyhtTdBJCxZXP1SSD8UkF97CfMcj-TIF9D9E03s6vxSHgo2fUZib_y6A','2026-03-22 04:42:04','2026-03-21 12:43:19'),(11,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjAsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxMDk0NzksImV4cCI6MTc3NDEzODI3OX0.aMasJawF1mP3YQtLIb65VuGKXY66q06SWEPnNr0OUbkBiaqAgQHx_GYP5F4FIOvze0_8BSI75Xt4-CBJFBGRxfct25J3wOUw3_VS-C2UfV5F7PY_Rak_CIiBh4Pw7BiS-6m0DgHyOs9Tsli8umOxK85_PQnWMbh4hryA4DWP_SPyT2Z2LfAQHZrASEfVHhObjJBnXbO94rpIJFRpZSvjzFafislTtonDgIAJasjE3lSrLwuUFQFYBkSOEtUJtRV_w3tckgwN1sBU_ulQfH6PP_F0PFLgmqKZkG66W_YJKx8ykvfM0pvbK1qA9r9rFs-zl5CWfIeHFz0ihkvSZZk1RA','2026-03-22 08:11:19','2026-03-21 16:11:31'),(12,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjAsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxMDk2NTcsImV4cCI6MTc3NDEzODQ1N30.YHL63fSEbwqaU_p-4jYKrV1J2xoQ-SmWEc-h7fkz3-8IL_sm_2jCHUOCTw3ngx_Qn-2J0e1CfVTI4UlRUiNpCDJWzqsMYk60S4WUQDVW1rmuF68PYNbq1H8e0mIxf3oevjakiBrJcWw4myWGPgHWSiuu64SUKzwYlfpDM4TGwvCQvKpNoZ2eH0UkiYgm40n7GPj4R1kI_0IPvjLyb7RtMW9Imn6wE93xxjxin-rVeP_-ksJHTrshPwgKaUV-Dg5j5PMRIZWVoMimxE6pb03dMxQ3J0ERAlrcvuRUp5t0PD4WVg6EglMo5xxCjpR7n2LJrNKmRgtgbnFdiX35_Sy5jg','2026-03-22 08:14:17','2026-03-21 16:14:28'),(13,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjAsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxMDk2OTUsImV4cCI6MTc3NDEzODQ5NX0.GQbBvo9NHQ60pk3vOie3uFi65D1PJf96a3P4s-XDU7yVHu-suUFoyTcTS5Hj-Yz5pCdOL1gRsVhaLD5HIVX23CZlCiPN723aE0MCKqZ3EcpMEeHC246w3nljq1V88mQDD4tw5-vgEvDdzWJTJuEfkdVnQ9NdOmhhcKmfS2ikQhltciQEpt6wBK0vKJnF1HbPTmyMS3TiQ5ldgV8vY7XCy9qdNPmizDjuwsd3QfOfBPBfQ03z4y1pGKoCXkaqYGr8kI57Tk9IpQw_ae4dNXFJUctEtWvAr-U02cSS_n5X3cnoup7wcm2-hXiFEC-zhLO926wBxda4vPcjDyvkrKN9ow','2026-03-22 08:14:55','2026-03-21 16:14:59'),(14,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjAsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxMDk3ODYsImV4cCI6MTc3NDEzODU4Nn0.QKDCQJyukhIESNHAIlNRop3Tc-KWi2FzpDC0565-eM7MNrU3yU5_TFqIeVAQYWMPdSrG-_bfs45havvfmFjQsoBt6OBxa12s8w39nW23VkfvYMUPgrJ7nMhKZYsjFFeZUd_tNpawJWIOZfnXhNl7dmOLO66_R100wMNcw7hpIM7VuQdAob4QVvME4o-f_pi9y-t9K0KY3wf1u2q1lPHIUz8daikDk0Fz_5a9-VYF6tuDgbXTadbv_oQUCIHBqlMANn0F03TVqo-0ySR3RYFfEKbjKV6pvKleBG7ueY0EvO9jwdOgwjm25ffdta0ea1LF8lWMWm0zUUgtSfo_sYAp1Q','2026-03-22 08:16:26','2026-03-21 16:16:32'),(15,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjAsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxMTAwMDcsImV4cCI6MTc3NDEzODgwN30.I4VCUU4BRmuWRjWbwkW6Og6VKIuUOAj2UD6nn58BukaxyzUh-WLZeMa3mvJ0tItCHh7Wod1Gce7eMwuz14oHMAvaszogybjypSf4_y-d8iQeBdF83GDe288iSWf_KMFfrFeGBnTN_lUn8d8INQ0WZmL-3AThxXFsf7PPVC0kamlJAARb7UYK1t_9ggNArIewCYprLu0aA4hF5Q70KOHAHD2IQlz8-5kYcIwTygc_4iagOZaRNO83lu9ufj1IaZSWMGjC4K08S-opLUOfXaQRwNukENR7HH7wS9cuGOe1UztsEEmu7jwnQ4FqeADVCnceiAaxJGDwDJH71msZRabrCg','2026-03-22 08:20:07','2026-03-21 16:20:12'),(16,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjAsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxMTAyOTEsImV4cCI6MTc3NDEzOTA5MX0.iPqvZAd6GTjUdtCTUIzoZPFHXQJLFkgc7K42rDb01KiRCZmsXj_KYpYrZC6dILHMHuQnKZW3sFlZ_G_aCP6Rj1CBqpTGKW2UEkTXnZnpFUdsUui3r3ISuJpsbPQ4SfQyZjKaJp2w9QUe8YdYpfjJnUnshmwwmByPVz4PrKR9m_2iFw76jZK6iqGHzgAf8LQK2LOeQTx0Fa1h7ycRlphp95zAHq83DDMd5a6r8IFgnhu5kEbiP4Whx7bmaUM4L_0AuvE8g84k_f2FJ22JNLcZtEYv8_p_vZR9hh-GGDX83gPyLZ8pZ_9EvJc9GRKSLFbTZDbxMfk_73MBFHLlJKZv8A','2026-03-22 08:24:51','2026-03-21 16:24:58'),(17,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjIsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQxOTM1NjcsImV4cCI6MTc3NDIyMjM2N30.PsvoWmCtNKMN7vT7hLqxT0zWBfxl2VMR7bpLYk0sBatn1pb5vtprHSK_gWBLqNtUOm_HMQSOaZ9HGZ55ECdoiOAIGxJkEJkameZoZmkiOJ0rsu-xHF7LVGmpJqgFSZfyxKSCSWvy0nlYvyx03vP8pNA9YQLewRjOc60MXbugioWz1uYrf5_zfXBPJa2Ob-VWkWnvXEXVr1rf15OEZb-s7P2udFkRJ6bsQvS_foaW6WLzraTslgzzEbwZJzjqgoEwno94ZOYVkJg8ZXmDQMFEFbSZRzxeGvGEWPWbePEm0psmZCPMFhdVRxh0vaoftf_PZIFLcl3uLeqj3qmrobEH5w','2026-03-23 07:32:47','2026-03-22 15:33:12'),(18,'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjQsInJvbGUiOiJmYXJtZXIiLCJpYXQiOjE3NzQyODUwMjAsImV4cCI6MTc3NDMxMzgyMH0.ZWA6ImQtXYRt7stdE8pmRU4RaJDiXtty6hfU1VbpzGaw8CKPScqjxXhao3Uqs6_3mT8KkCDGkEqbZ32Z12ohPMzK3qxY1_qGoM_umM9EBQIvRyb-H0kj57qYLV4DwKAAdhpey8B7lidC_e7_7XCbCQF40KxnQpTRL224vQ7y2lbbzd89eKrYqN3km85IcX_DQHob7jLK4V8Vu61feeFz-3vaFPDAjmxZd4yEfLfp5HcEjWxyk96vwf4KpmKeavhjhp2FJ9WZLlOtTOWpIN_T8YJ0NrSOfQgNwPawr_9TuKTfmFT-BS_n9sa3GDBc58RfG7yC3yYOGm-gVaCyAQslgw','2026-03-24 08:57:00','2026-03-23 17:13:00');
/*!40000 ALTER TABLE `token_blacklist` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('admin','manager','farmer') NOT NULL DEFAULT 'farmer',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_verified` tinyint(1) NOT NULL DEFAULT 0,
  `verification_token` varchar(255) DEFAULT NULL,
  `token_expires_at` datetime DEFAULT NULL,
  `failed_attempts` int(11) NOT NULL DEFAULT 0,
  `captcha_required` tinyint(1) NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Juan Dela Cruz','juan@gmail.com','$2b$10$vXx30CTkpwaE7evSV83zS./U41Me4dmIGQe/O0g.E6cx7SocioioW','admin',1,0,NULL,NULL,2,0,NULL,'2026-03-19 13:33:20','2026-03-21 08:36:08'),(24,'Mark Khian Pangilinan','pangilinanmarkkhian@gmail.com','$2b$12$TLpo9m53wgtCa7X6Yj9p7epoHoFkJAcXd88W15I4Fz7IMrjPtT5Z.','farmer',1,1,NULL,NULL,0,0,NULL,'2026-03-23 16:56:25','2026-03-23 16:56:48');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-24  2:00:00
