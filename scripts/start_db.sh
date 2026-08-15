#!/bin/bash
# Bootstrap + run PostgreSQL (persistent data in /app/pgdata) and Redis.
# Runs in the foreground under supervisor (execs postgres last).
set -e

export DEBIAN_FRONTEND=noninteractive
PGBIN=/usr/lib/postgresql/15/bin
PGDATA=/app/pgdata
DB_USER=bfg_admin
DB_PASS=bfg_local_pw
DB_NAME=binaryfund
SCHEMA=/app/vps-setup/schema.sql

echo "[start_db] ensuring postgres + redis are installed..."
if [ ! -x "$PGBIN/pg_ctl" ] || ! command -v redis-server >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq postgresql postgresql-contrib redis-server
fi

# Redis (daemonized, no auth for local use)
echo "[start_db] starting redis..."
redis-server --daemonize yes --bind 127.0.0.1 --port 6379

# Initialize persistent data dir once
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[start_db] initializing postgres data dir at $PGDATA..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -E UTF8"
fi
chown -R postgres:postgres "$PGDATA"
mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql

# Temp start to ensure role/db/schema exist (idempotent)
echo "[start_db] temp-starting postgres for provisioning..."
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-c listen_addresses=127.0.0.1 -p 5432' -w -t 60 start"

su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'\"" | grep -q 1 || \
  su postgres -c "psql -c \"CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" | grep -q 1 || \
  su postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\""

# Apply schema if the users table is missing
HAS_TABLE=$(PGPASSWORD=$DB_PASS psql -h 127.0.0.1 -U $DB_USER -d $DB_NAME -tAc "SELECT to_regclass('public.users');" 2>/dev/null || true)
if [ "$HAS_TABLE" != "users" ]; then
  echo "[start_db] applying schema..."
  PGPASSWORD=$DB_PASS psql -h 127.0.0.1 -U $DB_USER -d $DB_NAME -f "$SCHEMA" || true
fi

echo "[start_db] stopping temp postgres..."
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -w -t 60 stop"

echo "[start_db] exec postgres in foreground..."
exec su postgres -c "$PGBIN/postgres -D $PGDATA -c listen_addresses=127.0.0.1 -p 5432"
