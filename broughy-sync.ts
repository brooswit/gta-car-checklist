/**
 * broughy-sync.ts
 *
 * Fetches GTABoom racing analytics page, extracts Broughy1322 vehicle data
 * from the embedded Next.js RSC payload, and writes broughy-data.json.
 *
 * Usage: bun broughy-sync.ts
 */

const URL = "https://www.gtaboom.com/vehicles/racing-analytics";
const OUTPUT = import.meta.dir + "/broughy-data.json";

interface BroughyVehicle {
  name: string;           // display name with manufacturer prefix (e.g. "Benefactor BR8")
  manufacturer: string;   // extracted from display name
  vehicleClass: string;   // e.g. "Open Wheel", "Super"
  lapTime: string | null; // "M:SS.mmm" format, null if not tested
  lapTimeSeconds: number | null;
  topSpeed: number | null; // mph
  tier: string | null;    // S/A/B/C/D/E/F/G or null
  classRank: number | null;
  overallRank: number | null;
}

// Known manufacturer prefixes — used to split "Manufacturer Model" display names.
const KNOWN_MANUFACTURERS = new Set([
  "Albany", "Annis", "Benefactor", "BF", "Bravado", "Brute", "Buckingham",
  "Canis", "Chariot", "Cheval", "Declasse", "Dewbauchee", "Dinka", "Dundreary",
  "Emperor", "Enus", "Fathom", "Gallivanter", "Grotti", "HVY", "Hijak",
  "Imponte", "Invetero", "Jobuilt", "Karin", "Lampadati", "LCC", "Maibatsu",
  "Mammoth", "Maxwell", "MTL", "Nagasaki", "Obey", "Ocelot", "Overflod",
  "Pegassi", "Pfister", "Principe", "Rockstar", "Schyster",
  "Shitzu", "Stanley", "Truffade", "Ubermacht", "Vapid",
  "Vulcar", "Weeny", "Western", "Willard", "Zirconium",
]);

function splitManufacturer(displayName: string): { manufacturer: string; model: string } {
  const parts = displayName.split(" ");
  if (parts.length > 1 && KNOWN_MANUFACTURERS.has(parts[0])) {
    return { manufacturer: parts[0], model: parts.slice(1).join(" ") };
  }
  return { manufacturer: "", model: displayName };
}

function secondsToLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

async function sync() {
  console.log(`Fetching ${URL}...`);
  const resp = await fetch(URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; gta-car-checklist/1.0)" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  console.log(`  Got ${Math.round(html.length / 1024)}KB`);

  // Vehicle data is embedded in self.__next_f.push() RSC chunks as double-escaped JSON.
  // Each vehicle object matches: {\"point_id\":\"...\", ...}
  const rawObjects = html.match(/\{\\"point_id\\":[^]*?\}/g) ?? [];
  console.log(`  Found ${rawObjects.length} raw vehicle objects`);

  const vehicles: BroughyVehicle[] = [];
  let skipped = 0;

  for (const raw of rawObjects) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw.replace(/\\"/g, '"'));
    } catch {
      skipped++;
      continue;
    }

    const displayName = obj.display_name as string;
    if (!displayName) { skipped++; continue; }

    // Only include "base" state entries to avoid duplicates (upgrades, variants)
    if ((obj.state_type as string) !== "base") continue;

    const { manufacturer } = splitManufacturer(displayName);
    const lapSecs = (obj.tested_lap_time_seconds as number | null) ?? null;
    const tier = (obj.tested_race_tier as string | null) ?? null;

    vehicles.push({
      name: displayName,
      manufacturer,
      vehicleClass: (obj.vehicle_class_label as string) ?? "",
      lapTime: lapSecs != null ? secondsToLapTime(lapSecs) : null,
      lapTimeSeconds: lapSecs,
      topSpeed: (obj.tested_top_speed_mph as number | null) ?? null,
      tier: tier === "—" ? null : tier,
      classRank: (obj.tested_class_rank as number | null) ?? null,
      overallRank: (obj.tested_overall_rank as number | null) ?? null,
    });
  }

  // Sort by overall rank (nulls last)
  vehicles.sort((a, b) => {
    if (a.overallRank == null && b.overallRank == null) return 0;
    if (a.overallRank == null) return 1;
    if (b.overallRank == null) return -1;
    return a.overallRank - b.overallRank;
  });

  console.log(`\nBroughy data:`);
  console.log(`  Total vehicles: ${vehicles.length}`);
  console.log(`  With lap time: ${vehicles.filter(v => v.lapTimeSeconds != null).length}`);
  console.log(`  With tier: ${vehicles.filter(v => v.tier != null).length}`);
  console.log(`  Skipped (parse errors): ${skipped}`);

  const samples = vehicles.filter(v => v.lapTimeSeconds != null).slice(0, 3);
  console.log(`\nSample (fastest 3 with lap times):`);
  for (const v of samples) {
    console.log(`  ${v.name}: ${v.lapTime} | ${v.topSpeed}mph | Tier ${v.tier} | Class rank #${v.classRank}`);
  }

  await Bun.write(OUTPUT, JSON.stringify(vehicles, null, 2));
  console.log(`\nWritten to: ${OUTPUT}`);
}

sync().catch(console.error);
