const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    phone      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    serial          TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    auth_token      TEXT NOT NULL,
    stamps          INTEGER NOT NULL DEFAULT 0,
    cashback_cents  INTEGER NOT NULL DEFAULT 0,
    pending_rewards INTEGER NOT NULL DEFAULT 0,
    total_rewards   INTEGER NOT NULL DEFAULT 0,
    updated_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS apple_registrations (
    device_id  TEXT NOT NULL,
    serial     TEXT NOT NULL REFERENCES cards(serial) ON DELETE CASCADE,
    push_token TEXT NOT NULL,
    PRIMARY KEY (device_id, serial)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    serial           TEXT NOT NULL REFERENCES cards(serial) ON DELETE CASCADE,
    stamps_added     INTEGER NOT NULL,
    amount_cents     INTEGER NOT NULL DEFAULT 0,
    cashback_cents   INTEGER NOT NULL DEFAULT 0,
    rewards_unlocked INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
