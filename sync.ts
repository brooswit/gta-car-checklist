/**
 * Syncs vehicle data from DurtyFree's GTA V data dumps on GitHub
 * and enriches it with store/feature data from the GTA Wiki MediaWiki API.
 *
 * Run: bun run sync
 */

const DURTYFREE_URL =
  "https://raw.githubusercontent.com/DurtyFree/gta-v-data-dumps/master/vehicles.json";
const WIKI_API = "https://gta.fandom.com/api.php";

interface DurtyFreeVehicle {
  Name: string;
  DisplayName: Record<string, string>;
  Hash: number;
  ManufacturerDisplayName: Record<string, string> | null;
  Class: string;
  DlcName?: string;
  [key: string]: unknown;
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

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Static lists for flags the Wiki doesn't categorize ───────────────────────
// Benny's Custom Vehicle — vehicles that can receive the "Custom" conversion at Benny's
// Custom Vehicle — verified list from Koni (Benny's conversions + Arena/Workshop variants)
const BENNYS_CUSTOM = new Set(
  [
    "Brioso 300 Widebody", "Issi (Arena)", "Diabolus Custom", "FCR 1000 Custom",
    "Deathbike (Arena)", "Dominator (Arena)", "Faction Custom", "Impaler (Arena)",
    "Slamvan (Arena)", "Buccaneer Custom", "Chino Custom", "Faction Custom Donk",
    "Gauntlet Classic Custom", "Manana Custom", "Moonbeam Custom", "Sabre Turbo Custom",
    "Slamvan Custom", "Virgo Classic Custom", "Voodoo Custom", "Weevil Custom",
    "Insurgent Pick-Up Custom", "Technical Custom", "Yosemite Rancher", "Bruiser (Arena)",
    "Sasquatch (Arena)", "Glendale Custom", "Primo Custom", "10F Widebody",
    "Comet Retro Custom", "Elegy Retro Custom", "Sentinel Classic Widebody",
    "Specter Custom", "Peyote Custom", "Tornado Custom", "Banshee 900R",
    "Itali GTB Custom", "Nero Custom", "Sultan RS", "Minivan Custom",
    "Youga Classic 4x4",
  ].map(n => normalize(n))
);

// Vehicles that function as mobile operations / businesses
const SERVICE_VEHICLES = new Set(
  [
    "Kosatka Submarine HQ", "Terrorbyte", "Avenger",
    "Mobile Operations Center Trailer", "Mobile Operations Center",
    "Brickade 6x6", "Hauler Custom", "Phantom Custom",
    "Sparrow", "Manchez Scout C", "Speedo Custom",
    "Mule Custom", "Pounder Custom",
  ].map(n => normalize(n))
);

// Stores that indicate not-purchasable
const NON_STORE_PATTERNS = [
  /cannot be acquired/i,
  /can be stolen/i,
  /bonus reward/i,
  /currently unavailable/i,
];

// ── Wiki API helpers ──────────────────────────────────────────────────────────

async function fetchCategoryMembers(category: string): Promise<Set<string>> {
  const members = new Set<string>();
  let cmcontinue: string | undefined;
  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
      cmnamespace: "0",
      format: "json",
      ...(cmcontinue ? { cmcontinue } : {}),
    });
    const res = await fetch(`${WIKI_API}?${params}`);
    const data = await res.json();
    for (const m of data.query?.categorymembers ?? []) {
      members.add(m.title as string);
    }
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);
  return members;
}

async function wikiSearch(query: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "3",
    srnamespace: "0",
    format: "json",
  });
  const res = await fetch(`${WIKI_API}?${params}`);
  const data = await res.json();
  const results = data.query?.search ?? [];
  return results.length > 0 ? (results[0].title as string) : null;
}

async function fetchWikiPages(
  titles: string[]
): Promise<Map<string, { wikitext: string; thumbnail: string }>> {
  const result = new Map<string, { wikitext: string; thumbnail: string }>();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      titles: batch.join("|"),
      prop: "revisions|pageimages",
      rvprop: "content",
      pithumbsize: "300",
      format: "json",
    });
    const res = await fetch(`${WIKI_API}?${params}`);
    const data = await res.json();
    for (const page of Object.values(data.query?.pages ?? {}) as any[]) {
      if (page.missing !== undefined) continue;
      result.set(page.title, {
        wikitext: page.revisions?.[0]?.["*"] ?? "",
        thumbnail: page.thumbnail?.source ?? "",
      });
    }
  }
  return result;
}

// Parse an infobox field — handles multi-line values and nested [[...|...]] links
function parseInfoboxField(wikitext: string, field: string): string {
  // Match from |field= to next |fieldname = (lookahead) or end of infobox
  const re = new RegExp(
    `\\|\\s*${field}\\s*=((?:(?!\\n\\|)[\\s\\S])*)`,
    "i"
  );
  const m = wikitext.match(re);
  return m ? m[1].trim() : "";
}

function stripWikiMarkup(text: string): string {
  return text
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'{2,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStores(wikitext: string): string[] {
  const stores = new Set<string>();
  for (const field of ["price", "trade_price"]) {
    const raw = parseInfoboxField(wikitext, field);
    const linkRe = /\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(raw)) !== null) {
      const candidate = m[1].trim();
      if (
        candidate === "Money" ||
        candidate.startsWith("Category:") ||
        candidate.startsWith("File:") ||
        candidate.length < 3
      ) continue;
      if (NON_STORE_PATTERNS.some(p => p.test(candidate))) continue;
      stores.add(candidate);
    }
  }
  return [...stores];
}

// Manual overrides: normalized display name → Wiki page title (or null to skip)
// null = not a real GTA Online purchasable vehicle
const WIKI_TITLE_OVERRIDES: Record<string, string | null> = {
  "feltzer classic": null,  // not a GTA Online vehicle (beta/cut content)
  "trailer": null,          // generic trailer, not purchasable
};

// Expand numeric Mk suffixes to Roman numerals for Wiki title matching
function buildWikiTitleGuess(displayName: string): string {
  return displayName.replace(/\bMk\s*(\d+)\b/gi, (_, n) => {
    const roman = ["I", "II", "III", "IV", "V", "VI"][parseInt(n) - 1] ?? n;
    return `Mk ${roman}`;
  });
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function sync() {
  console.log("Fetching DurtyFree vehicle data...");
  const dfRes = await fetch(DURTYFREE_URL);
  const dfData: DurtyFreeVehicle[] = await dfRes.json();
  const dfVehicles = dfData.filter(
    v => v.DisplayName?.English && !EXCLUDED_CLASSES.has(v.Class)
  );
  console.log(`  Got ${dfVehicles.length} vehicles from DurtyFree`);

  // Pre-fetch feature flag category sets in parallel
  console.log("Fetching Wiki feature flag categories...");
  const [weaponizedSet, imaniSet, driftSet, hswSet] = await Promise.all([
    fetchCategoryMembers("Weaponized_Vehicles_in_GTA_Online"),
    fetchCategoryMembers("Vehicles_eligible_for_Imani_Tech_upgrades"),
    fetchCategoryMembers("Vehicles_eligible_for_Drift_Tune_conversion"),
    fetchCategoryMembers("Vehicles_eligible_for_Hao's_Special_Works_conversion"),
  ]);
  console.log(
    `  Weaponized: ${weaponizedSet.size}, Imani: ${imaniSet.size}, ` +
    `Drift: ${driftSet.size}, HSW: ${hswSet.size}`
  );

  // Build wiki title guesses for all unique display names
  console.log("Resolving Wiki page titles...");
  const guessMap = new Map<string, string>(); // displayName → guessed wiki title
  const titleToDisplayNames = new Map<string, string[]>();
  const seenKeys = new Set<string>();

  for (const v of dfVehicles) {
    const name = v.DisplayName.English;
    const key = normalize(name);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    // Check manual override table first
    if (key in WIKI_TITLE_OVERRIDES) {
      const override = WIKI_TITLE_OVERRIDES[key];
      if (override === null) continue; // skip — not a real GTA Online vehicle
      guessMap.set(name, override);
      if (!titleToDisplayNames.has(override)) titleToDisplayNames.set(override, []);
      titleToDisplayNames.get(override)!.push(name);
      seenKeys.add(key);
      continue;
    }
    const guess = buildWikiTitleGuess(name);
    guessMap.set(name, guess);
    if (!titleToDisplayNames.has(guess)) titleToDisplayNames.set(guess, []);
    titleToDisplayNames.get(guess)!.push(name);
  }

  const allGuessedTitles = [...titleToDisplayNames.keys()];
  console.log(`  Fetching ${allGuessedTitles.length} Wiki pages...`);
  const wikiPages = await fetchWikiPages(allGuessedTitles);
  console.log(`  Got ${wikiPages.size} pages`);

  // Search fallback for missing pages
  const missingTitles = allGuessedTitles.filter(t => !wikiPages.has(t));
  if (missingTitles.length > 0) {
    console.log(`  ${missingTitles.length} missing — trying search fallback...`);
    const resolvedGuesses = new Map<string, string>();
    for (const missing of missingTitles) {
      const displayName = titleToDisplayNames.get(missing)?.[0] ?? missing;
      const resolved = await wikiSearch(displayName);
      if (resolved) {
        resolvedGuesses.set(missing, resolved);
        console.log(`    "${missing}" → "${resolved}"`);
      }
    }
    if (resolvedGuesses.size > 0) {
      const resolvedPages = await fetchWikiPages([...new Set(resolvedGuesses.values())]);
      for (const [orig, resolved] of resolvedGuesses) {
        const page = resolvedPages.get(resolved);
        if (page) {
          wikiPages.set(orig, page);
          for (const dn of titleToDisplayNames.get(orig) ?? []) {
            guessMap.set(dn, resolved);
          }
        }
      }
    }
  }

  // Build final vehicle list — include ALL DurtyFree vehicles, enrich from Wiki where possible
  console.log("Building output...");
  const vehicles: OutputVehicle[] = [];
  const seenFinal = new Set<string>();

  for (const v of dfVehicles) {
    const displayName = v.DisplayName.English;
    const key = normalize(displayName);
    if (seenFinal.has(key)) continue;
    seenFinal.add(key);

    const wikiTitle = guessMap.get(displayName) ?? displayName;
    const page = wikiPages.get(wikiTitle);

    let stores: string[] = [];
    let features: string[] = [];
    let image = `https://gtav-vehicle-database.vercel.app/vehicle-images/${v.Name.toLowerCase()}.png`;
    let source = "durtyfree";

    if (page) {
      const { wikitext, thumbnail } = page;
      stores = extractStores(wikitext);
      if (thumbnail) image = thumbnail;
      source = "wiki";

      if (weaponizedSet.has(wikiTitle)) features.push("Weaponized Vehicle");
      if (imaniSet.has(wikiTitle)) features.push("Imani Tech");
      if (driftSet.has(wikiTitle)) features.push("Drift Tuning");
      if (hswSet.has(wikiTitle)) features.push("HSW Performance Upgrade");
      if (BENNYS_CUSTOM.has(key)) features.push("Custom Vehicle");
      if (SERVICE_VEHICLES.has(key)) features.push("Service Vehicle");
      if (wikitext.includes("Missile Lock-On Jammer")) features.push("Missile Lock-On Jammer");
    }

    vehicles.push({
      name: displayName,
      manufacturer: v.ManufacturerDisplayName?.English ?? "",
      vehicleClass: v.Class,
      hash: v.Hash,
      internalName: v.Name,
      image,
      stores,
      features,
      source,
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

  const withStores = vehicles.filter(v => v.stores.length > 0).length;
  const withFeatures = vehicles.filter(v => v.features.length > 0).length;
  const fromWiki = vehicles.filter(v => v.source === "wiki").length;

  console.log(`\nSync complete!`);
  console.log(`  Total vehicles: ${vehicles.length}`);
  console.log(`  Enriched from Wiki: ${fromWiki}`);
  console.log(`  With store info: ${withStores}`);
  console.log(`  With features: ${withFeatures}`);
  console.log(`  Written to: ${outPath}`);
}

sync().catch(err => {
  console.error("Sync failed:", err);
  process.exit(1);
});
