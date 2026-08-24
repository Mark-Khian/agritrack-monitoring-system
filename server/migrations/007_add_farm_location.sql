-- Migration: Add farm location to users table
ALTER TABLE users
ADD COLUMN farm_latitude DECIMAL(10,8) DEFAULT NULL,
ADD COLUMN farm_longitude DECIMAL(11,8) DEFAULT NULL,
ADD COLUMN farm_location_name VARCHAR(255) DEFAULT NULL;
