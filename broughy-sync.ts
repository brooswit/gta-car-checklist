/**
 * broughy-sync.ts
 *
 * Fetches Broughy1322 racing data from gtaboom.com/vehicles/racing-analytics
 * and writes broughy-data.json to the repo root.
 *
 * The page is Next.js SSR — vehicle data is embedded in self.__next_f.push()
 * script tags as escaped JSON objects with fields:
 *   display_name, base_model_name, vehicle_class_label,
 *   tested_lap_time_seconds, tested_top_speed_mph,
 *   tested_race_tier, tested_class_rank, tested_overall_rank
 */

interface BroughyVehicle {
  name: string;           // display_name without manufacturer prefix
  manufacturer: string;   // first word(s) before the model name
  displayName: string;    // full display_name as on GTABoom
  internalName: string;   // base_model_name
  vehicleClass: string;   // vehicle_class_label
  lapTimeSeconds: number | null;
  lapTime: string | null; // formatted "M:SS.mmm"
  topSpeedMph: number | null;
  tier: string | null;    // Broughy tier: S–G or null
  classRank: number | null;
  overallRank: number | null;
}

// Known manufacturer prefixes (longest-match first)
const MANUFACTURERS = [
  "Albany", "Annis", "Benefactor", "BF", "Bollokan", "Bravado", "Brute",
  "Buckingham", "Canis", "Chariot", "Cheval", "Classique", "Coil", "Declasse",
  "Dewbauchee", "Dinka", "Dundreary", "Enus", "Fathom", "Gallivanter",
  "Grotti", "HVY", "Hijak", "Imponte", "Invetero", "Jobuilt", "Karin",
  "Lampadati", "LCC", "Mammoth", "Maibatsu", "MTL", "Nagasaki", "Obey",
  "Ocelot", "Overflod", "Pegen", "Pegassi", "Pfister", "Principle",
  "Progen", "Schyster", "Shitzu", "Speedophile", "Stanley", "Stelle",
  "Truffade", "Ubermacht", "Übelharst", "Vapid", "Vulcar", "Weeny",
  "Western", "Willard", "Zirconium",
];

function splitManufacturer(displayName: string): { manufacturer: string; name: string } {
  for (const mfr of MANUFACTURERS) {
    if (displayName.startsWith(mfr + " ")) {
      return { manufacturer: mfr, name: displayName.slice(mfr.length + 1) };
    }
  }
  return { manufacturer: "", name: displayName };
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

async function fetchBroughyData(): Promise<void> {
  console.log("Fetching GTABoom racing analytics...");
  const res = await fetch("https://www.gtaboom.com/vehicles/racing-analytics", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; gta-car-checklist/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  console.log(`  Page size: ${(html.length / 1024).toFixed(0)}KB`);

  // Extract all self.__next_f.push([1,"..."]) payloads
  const pushRe = /self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g;
  let match: RegExpExecArray | null;
  const chunks: string[] = [];
  while ((match = pushRe.exec(html)) !== null) {
    // Unescape the JSON string value
    try {
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      chunks.push(match[1]);
    }
  }
  const payload = chunks.join("");
  console.log(`  RSC chunks: ${chunks.length}, combined length: ${(payload.length / 1024).toFixed(0)}KB`);

  // Extract vehicle point objects — match on "point_id" anchor
  const vehicleRe = /\{"point_id":"[^"]+","base_model_name":"([^"]+)","state_type":"base"[^}]*"display_name":"([^"]+)"[^}]*"vehicle_class_label":"([^"]+)"[^}]*"tested_lap_time_seconds":([\d.]+|null)[^}]*"tested_race_tier":"?([^",}]*)"?[^}]*"tested_class_rank":([\d]+|null)[^}]*"tested_overall_rank":([\d]+|null)[^}]*"tested_top_speed_mph":([\d.]+|null)/g;

  // Simpler approach: find all objects containing tested_lap_time_seconds
  const vehicles: BroughyVehicle[] = [];
  const seen = new Set<string>();

  // Parse by finding point objects in the payload
  const pointRe = /"point_id":"([^"]+)"/g;
  let pm: RegExpExecArray | null;

  while ((pm = pointRe.exec(payload)) !== null) {
    // Only process base state entries
    const pointId = pm[1];
    if (!pointId.startsWith("base:")) continue;

    // Extract the object slice starting at this point_id
    const start = payload.lastIndexOf("{", pm.index);
    if (start === -1) continue;

    // Find matching closing brace
    let depth = 0;
    let end = start;
    for (let i = start; i < Math.min(start + 2000, payload.length); i++) {
      if (payload[i] === "{") depth++;
      else if (payload[i] === "}") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    const objStr = payload.slice(start, end);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(objStr);
    } catch {
      continue;
    }

    const displayName = obj.display_name as string;
    if (!displayName || seen.has(displayName)) continue;
    seen.add(displayName);

    const { manufacturer, name } = splitManufacturer(displayName);
    const lapSec = obj.tested_lap_time_seconds != null ? Number(obj.tested_lap_time_seconds) : null;

    vehicles.push({
      name,
      manufacturer,
      displayName,
      internalName: obj.base_model_name as string,
      vehicleClass: (obj.vehicle_class_label as string) ?? "",
      lapTimeSeconds: lapSec,
      lapTime: lapSec != null ? formatLapTime(lapSec) : null,
      topSpeedMph: obj.tested_top_speed_mph != null ? Number(obj.tested_top_speed_mph) : null,
      tier: (obj.tested_race_tier as string | null) ?? null,
      classRank: obj.tested_class_rank != null ? Number(obj.tested_class_rank) : null,
      overallRank: obj.tested_overall_rank != null ? Number(obj.tested_overall_rank) : null,
    });
  }

  // Sort by overall rank (nulls last)
  vehicles.sort((a, b) => {
    if (a.overallRank == null && b.overallRank == null) return 0;
    if (a.overallRank == null) return 1;
    if (b.overallRank == null) return -1;
    return a.overallRank - b.overallRank;
  });

  console.log(`  Extracted: ${vehicles.length} vehicles`);

  // Sample output
  const tiered = vehicles.filter(v => v.tier && v.tier !== "—");
  console.log(`  With tier: ${tiered.length}`);
  console.log(`  Sample S-tier: ${tiered.filter(v => v.tier === "S").slice(0, 3).map(v => v.displayName).join(", ")}`);

  const outPath = import.meta.dir + "/broughy-data.json";
  await Bun.write(outPath, JSON.stringify(vehicles, null, 2));
  console.log(`  Written to: ${outPath}`);
}

fetchBroughyData().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
