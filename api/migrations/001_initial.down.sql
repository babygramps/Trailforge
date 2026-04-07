-- Drop tables in reverse dependency order.
DROP TABLE IF EXISTS fitbit_tokens;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS waypoints;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS users;

-- Drop extensions.
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS postgis;
