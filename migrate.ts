/**
 * Migration script: Load vehicles.json into SQLite database
 *
 * Run: bun run migrate.ts
 *
 * Creates database.db with vehicles table, stores arrays as JSON.
 * No data loss - all fields preserved as-is.
 */

import { Database } from "bun:sqlite";
import { readFileSync } from "fs";

const DB_PATH = import.meta.dir + "/database.db";
const VEHICLES_JSON_PATH = import.meta.dir + "/vehicles.json";

interface VehicleData {
  name: string;
  manufacturer: string;
  vehicleClass: string;
  hash: number;
  internalName: string;
  image: string;
  stores: string[];
  features: string[];
  source: string;
  racing_tier?: string | null;
  racing_lap_time?: number | null;
  top_speed_mph?: number | null;
  stat_acceleration?: number | null;
  stat_braking?: number | null;
  stat_traction?: number | null;
  stat_handling?: number | null;
  price?: number;
  trade_price?: number;
  trade_price_condition?: string;
  unlock_methods?: string[];
  unlock_condition_note?: string;
  use_case?: string[];
  grinding_tier?: string;
  meta_verdict?: string;
  meta_note?: string;
  storage_type?: string;
  removed_from_stores?: boolean;
  removal_update?: string;
  removal_date?: string;
}

interface VehiclesJsonFile {
  generated_at: string;
  vehicles: VehicleData[];
}

async function migrate() {
  console.log("Starting migration...");

  const db = new Database(DB_PATH);
  console.log(`Database: ${DB_PATH}`);

  db.exec("DROP TABLE IF EXISTS vehicles");

  console.log("Creating vehicles table...");
  db.exec(`
    CREATE TABLE vehicles (
      hash INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      manufacturer TEXT,
      vehicleClass TEXT NOT NULL,
      internalName TEXT NOT NULL UNIQUE,
      image TEXT,
      stores TEXT NOT NULL DEFAULT '[]',
      features TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      price INTEGER,
      trade_price INTEGER,
      trade_price_condition TEXT,
      unlock_methods TEXT NOT NULL DEFAULT '[]',
      unlock_condition_note TEXT,
      racing_tier TEXT,
      racing_lap_time REAL,
      top_speed_mph REAL,
      stat_acceleration INTEGER,
      stat_braking INTEGER,
      stat_traction INTEGER,
      stat_handling INTEGER,
      use_case TEXT NOT NULL DEFAULT '[]',
      grinding_tier TEXT,
      meta_verdict TEXT,
      meta_note TEXT,
      storage_type TEXT,
      removed_from_stores INTEGER DEFAULT 0,
      removal_update TEXT,
      removal_date TEXT
    );

    CREATE INDEX idx_vehicles_class ON vehicles(vehicleClass);
    CREATE INDEX idx_vehicles_manufacturer ON vehicles(manufacturer);
    CREATE INDEX idx_vehicles_grinding_tier ON vehicles(grinding_tier);
    CREATE INDEX idx_vehicles_racing_tier ON vehicles(racing_tier);
    CREATE INDEX idx_vehicles_price ON vehicles(price);
    CREATE INDEX idx_vehicles_name ON vehicles(name);
  `);

  console.log("Reading vehicles.json...");
  const jsonContent = readFileSync(VEHICLES_JSON_PATH, "utf-8");
  const data: VehiclesJsonFile = JSON.parse(jsonContent);
  const vehicles = data.vehicles;

  console.log(`Found ${vehicles.length} vehicles to migrate`);

  const insertStmt = db.prepare(`
    INSERT INTO vehicles (
      hash, name, manufacturer, vehicleClass, internalName, image,
      stores, features, source, price, trade_price, trade_price_condition,
      unlock_methods, unlock_condition_note, racing_tier, racing_lap_time,
      top_speed_mph, stat_acceleration, stat_braking, stat_traction, stat_handling,
      use_case, grinding_tier, meta_verdict, meta_note, storage_type,
      removed_from_stores, removal_update, removal_date
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  console.log("Inserting vehicles...");
  let inserted = 0;
  let errors = 0;

  for (const vehicle of vehicles) {
    try {
      insertStmt.run(
        vehicle.hash,
        vehicle.name,
        vehicle.manufacturer || "",
        vehicle.vehicleClass,
        vehicle.internalName,
        vehicle.image || "",
        JSON.stringify(vehicle.stores || []),
        JSON.stringify(vehicle.features || []),
        vehicle.source || "unknown",
        vehicle.price ?? null,
        vehicle.trade_price ?? null,
        vehicle.trade_price_condition ?? null,
        JSON.stringify(vehicle.unlock_methods || []),
        vehicle.unlock_condition_note ?? null,
        vehicle.racing_tier ?? null,
        vehicle.racing_lap_time ?? null,
        vehicle.top_speed_mph ?? null,
        vehicle.stat_acceleration ?? null,
        vehicle.stat_braking ?? null,
        vehicle.stat_traction ?? null,
        vehicle.stat_handling ?? null,
        JSON.stringify(vehicle.use_case || []),
        vehicle.grinding_tier ?? null,
        vehicle.meta_verdict ?? null,
        vehicle.meta_note ?? null,
        vehicle.storage_type ?? null,
        vehicle.removed_from_stores ? 1 : 0,
        vehicle.removal_update ?? null,
        vehicle.removal_date ?? null
      );
      inserted++;
    } catch (error) {
      console.error(`Error inserting ${vehicle.name}:`, error);
      errors++;
    }
  }

  console.log("\nMigration complete!");
  console.log(`   Inserted: ${inserted} vehicles`);
  console.log(`   Errors: ${errors}`);

  const rowCount = db.query("SELECT COUNT(*) as count FROM vehicles").get() as { count: number };
  console.log(`   Total in DB: ${rowCount.count}`);

  console.log("\nSpot check (sample vehicles):");
  const samples = db.query(`
    SELECT name, vehicleClass, manufacturer, stores, features, use_case
    FROM vehicles
    LIMIT 3
  `).all();

  for (const v of samples as any[]) {
    console.log(`   ${v.name}:`);
    console.log(`     - Class: ${v.vehicleClass}`);
    console.log(`     - Stores: ${v.stores}`);
    console.log(`     - Features: ${v.features}`);
  }

  db.close();
  console.log("\nDone!");
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
