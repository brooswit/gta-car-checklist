/**
 * Syncs vehicle data from DurtyFree's GTA V data dumps on GitHub
 * and enriches it with store/feature data from GTABase.
 *
 * Run: bun run sync
 */

const DURTYFREE_URL =
  "https://raw.githubusercontent.com/DurtyFree/gta-v-data-dumps/master/vehicles.json";
const GTABASE_URL =
  "https://www.gtabase.com/media/com_jamegafilter/en_gb/1.json";

interface DurtyFreeVehicle {
  Name: string;
  DisplayName: Record<string, string>;
  Hash: number;
  ManufacturerDisplayName: Record<string, string> | null;
  Class: string;
  [key: string]: unknown;
}

interface GtaBaseItem {
  name: string;
  slug: string;
  thumbnail: string;
  attr: Record<
    string,
    { value: unknown; frontend_value: unknown; title: string }
  >;
}

interface OutputVehicle {
  name: string;
  manufacturer: string;
  vehicleClass: string;
  hash: number;
  internalName: string;
  image: string;
  stores: string[];
  features: string[];
  source: string;
}

const EXCLUDED_CLASSES = new Set(["RAIL"]);

// Normalize a vehicle name for fuzzy matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttrList(item: GtaBaseItem, code: string): string[] {
  const attr = item.attr?.[code];
  if (!attr) return [];
  const val = attr.frontend_value;
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val) return [val];
  return [];
}

function getAttrStr(item: GtaBaseItem, code: string): string {
  const attr = item.attr?.[code];
  if (!attr) return "";
  const val = attr.frontend_value;
  if (Array.isArray(val)) return val[0] || "";
  return typeof val === "string" ? val : "";
}

async function sync() {
  console.log("Fetching DurtyFree vehicle data...");
  const dfRes = await fetch(DURTYFREE_URL);
  const dfData: DurtyFreeVehicle[] = await dfRes.json();
  console.log(`  Got ${dfData.length} vehicles from DurtyFree`);

  console.log("Fetching GTABase vehicle data...");
  const gbCachePath = import.meta.dir + "/gtabase_raw.json";
  let gbRaw: Record<string, GtaBaseItem>;

  // Try fetching fresh data via curl (Cloudflare requires browser-like headers)
  const gbProc = Bun.spawn([
    "curl", "-s", "--max-time", "15",
    "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-H", "Accept: application/json",
    GTABASE_URL + "?t=" + Date.now(),
  ]);
  await gbProc.exited;
  const gbText = await new Response(gbProc.stdout).text();

  if (gbText.startsWith("{")) {
    console.log("  Fetched fresh GTABase data");
    gbRaw = JSON.parse(gbText);
    await Bun.write(gbCachePath, gbText);
  } else {
    // Fall back to cached file
    const cached = Bun.file(gbCachePath);
    if (await cached.exists()) {
      console.log("  Cloudflare blocked fetch, using cached GTABase data");
      gbRaw = await cached.json();
    } else {
      throw new Error(
        "GTABase blocked by Cloudflare and no cached data found.\n" +
        "Run manually: curl -s -H 'User-Agent: Mozilla/5.0' '" + GTABASE_URL + "' -o gtabase_raw.json"
      );
    }
  }
  const gbItems = Object.values(gbRaw);
  console.log(`  Got ${gbItems.length} vehicles from GTABase`);

  // Build GTABase lookup by normalized name
  const gbByName = new Map<string, GtaBaseItem>();
  for (const item of gbItems) {
    if (item.name) gbByName.set(normalize(item.name), item);
  }

  // Features we care about from GTABase ct30
  const FEATURE_KEYS = new Set([
    "HSW Performance Upgrade",
    "Drift Tuning",
    "Missile Lock-On Jammer",
    "Weaponized Vehicle",
    "Custom Vehicle",
    "Imani Tech",
  ]);

  // Stores that mean "not purchasable"
  const NON_STORE = new Set([
    "Cannot be acquired",
    "Can be stolen / found",
    "Bonus Reward",
    "Reward",
    "Currently unavailable",
  ]);

  const vehicles: OutputVehicle[] = [];
  const seen = new Set<string>();

  // Process DurtyFree vehicles, enriched with GTABase data
  for (const df of dfData) {
    const name = df.DisplayName?.English;
    if (!name || EXCLUDED_CLASSES.has(df.Class)) continue;

    const key = normalize(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const gb = gbByName.get(key);

    const allFeatures = gb ? getAttrList(gb, "ct30") : [];
    const features = allFeatures.filter((f) => FEATURE_KEYS.has(f));
    const isCustomVehicle = features.includes("Custom Vehicle");
    const stores = gb
      ? getAttrList(gb, "ct12").filter((s) => {
          if (NON_STORE.has(s)) return false;
          // Only list Benny's as a store for actual custom upgrades, not base vehicles
          if (s === "Benny's Original Motor Works" && !isCustomVehicle) return false;
          return true;
        })
      : [];

    const image = gb?.thumbnail
      ? `https://www.gtabase.com/${gb.thumbnail}`
      : `https://gtav-vehicle-database.vercel.app/vehicle-images/${df.Name.toLowerCase()}.png`;

    vehicles.push({
      name,
      manufacturer: df.ManufacturerDisplayName?.English || "",
      vehicleClass: df.Class,
      hash: df.Hash,
      internalName: df.Name,
      image,
      stores,
      features,
      source: gb ? "both" : "durtyfree",
    });

    // Remove from GTABase map so we can find GTABase-only vehicles after
    if (gb) gbByName.delete(key);
  }

  // Add GTABase-only vehicles (ones DurtyFree doesn't have)
  let gbOnly = 0;
  for (const [, gb] of gbByName) {
    const name = gb.name;
    const key = normalize(name);
    if (seen.has(key)) continue;

    // Only include GTA Online vehicles
    const edition = getAttrStr(gb, "ct5");
    if (edition && !edition.includes("GTA Online")) continue;

    const cls = getAttrStr(gb, "ct1");
    const allFeatures = getAttrList(gb, "ct30");
    const features = allFeatures.filter((f) => FEATURE_KEYS.has(f));
    const isCustomVehicle = features.includes("Custom Vehicle");
    const stores = getAttrList(gb, "ct12").filter((s) => {
      if (NON_STORE.has(s)) return false;
      if (s === "Benny's Original Motor Works" && !isCustomVehicle) return false;
      return true;
    });
    const mfg = getAttrStr(gb, "ct2");
    const image = gb.thumbnail
      ? `https://www.gtabase.com/${gb.thumbnail}`
      : "";

    // Use slug-based hash as a stable identifier
    const hash = hashCode(key);

    seen.add(key);
    gbOnly++;

    vehicles.push({
      name,
      manufacturer: mfg,
      vehicleClass: cls || "Unknown",
      hash,
      internalName: gb.slug,
      image,
      stores,
      features,
      source: "gtabase",
    });
  }

  // Sort by class, then name
  vehicles.sort((a, b) => {
    const cc = a.vehicleClass.localeCompare(b.vehicleClass);
    if (cc !== 0) return cc;
    return a.name.localeCompare(b.name);
  });

  const outPath = import.meta.dir + "/vehicles.json";
  await Bun.write(outPath, JSON.stringify(vehicles, null, 2));

  const withStores = vehicles.filter((v) => v.stores.length > 0).length;
  const withFeatures = vehicles.filter((v) => v.features.length > 0).length;

  console.log(`\nSync complete!`);
  console.log(`  Total vehicles: ${vehicles.length}`);
  console.log(`  With store info: ${withStores}`);
  console.log(`  With features: ${withFeatures}`);
  console.log(`  GTABase-only additions: ${gbOnly}`);
  console.log(`  Written to: ${outPath}`);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

sync().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
