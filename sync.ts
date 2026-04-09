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
  price?: number;
  trade_price?: number;
  trade_price_condition?: string;
  unlock_methods?: string[];
  unlock_condition_note?: string;
  use_case?: string[];
  racing_tier?: string | null;
  racing_lap_time?: number | null;
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

// Note: Weaponized Vehicle detection uses DurtyFree's Weapons array (not Wiki category)
// Wiki's Weaponized category is incomplete (e.g. Oppressor Mk II absent)

// HSW vehicles where Wiki category title doesn't match DurtyFree display name,
// or vehicle is absent from DurtyFree entirely — keyed by normalized display name
const HSW_OVERRIDES = new Set(
  ["Sentinel XS", "Hakuchou Drag Bike", "Banshee", "Stinger TT", "Stirling GT"].map(n => normalize(n))
);

// Missile Lock-On Jammer — static set from GTABase (Wiki page text misses most vehicles)
// Source: GTABase ct30 cache, bootstrapped 2026-03-04
const MISSILE_JAMMER_VEHICLES = new Set(
  [
    "10F","10F Widebody","300R","811","9F","9F Cabrio","Akuma","Aleutian","Alpha-Z1",
    "Ardent","Astrale","Avenger","BF400","Bagger","Baller LE (Armored)","Baller LE LWB",
    "Baller LE LWB (Armored)","Baller ST-D","Banshee GTS","Bati 801","Bati 801RR",
    "Besra","Blade","Blazer","Bodhi","Brawler","Broadway","Buffalo EVX","Buffalo S",
    "Buffalo S Cruiser","Buffalo STX","Buffalo STX Pursuit","Bullet","Calico GTF",
    "Caracara 4x4","Caracara Pursuit","Cargobob","Cargobob Jetsam","Cavalcade XL",
    "Champion","Chavos V6","Cheburek","Cheetah","Cognoscenti","Cognoscenti (Armored)",
    "Cognoscenti 55","Cognoscenti 55 (Armored)","Comet","Comet S2","Comet S2 Cabrio",
    "Comet SR","Conada","Contender","Coquette D10 Pursuit","Coquette D5","Cyclone",
    "DH-7 Iron Mule","Deity","Deveste Eight","Deviant","Dodo","Dominator","Dominator ASP",
    "Dominator FX Interceptor","Dominator GTT","Dorado Cruiser","Double-T",
    "Drift Walton L35","Dubsta 6x6","Duke O'Death","ETR1","Elegy RH8","Entity MT",
    "Envisage","Eudora","Euros","Everon RS","FMJ","FMJ MK V","Firebolt ASP","Futo",
    "Futo GTX","GP1","GT750","Gauntlet","Gauntlet Hellfire","Gauntlet Interceptor",
    "Granger 3600LX","Greenwood","Greenwood Cruiser","Hakuchou","Hakuchou Drag Bike",
    "Hardy","Hellion","Hermes","Hexer","Howard NX-25","Ignus","Imorgon","Impaler LX",
    "Impaler LX Cruiser","Impaler SZ Cruiser","Infernus","Issi","Issi Sport",
    "Itali Classic","JB 700W","Jester RR","Jubilee","Jugular","Komoda","Krieger",
    "Kuruma","LSCM Cheetah Classic","LSCM Jester RR (Widebody)","La Coureuse","Locust",
    "Luiva","Luxor","Luxor Deluxe","Manchez","Manchez Scout","Massacro",
    "Massacro (Racecar)","Maverick","Mesa (Merryweather)","MonstroCiti","Neo","Niobe",
    "Omnis e-GT","Outreach Faction","Paragon R","Paragon S","Patriot","Patriot Mil-Spec",
    "Peyote Gasser","Pipistrello","Pizza Boy","Police Bike","Police Cruiser (Stanier LE)",
    "RE-7B","Raiden","Rapid GT X","Raptor","Reever","Remus","Revolter","Rumpo Custom",
    "S80RR","SC1","Sanchez","Sanchez (Livery)","Savestra","Schafter LWB",
    "Schafter LWB (Armored)","Schafter V12","Schafter V12 (Armored)","Sentinel",
    "Sentinel GTS","Sentinel XS4","Shinobi","Shotaro","Stanier","Stinger GT","Stinger TT",
    "Stirling GT","SuperVolito","SuperVolito Carbon","Swift Deluxe","Swinger","Tampa GT",
    "Terminus","Terminus Patrol","Terrorbyte","Tigon","Torero","Torero XO",
    "Turismo Omaggio","Tyrus","Unmarked Cruiser","Uranus LozSpeed","V-STR","Vacca",
    "Vigero ZX","Virtue","Viseris","Volatus","Vortex","Weaponized Ignus","Weevil Custom",
    "Woodlander","X-Treme","XA-21","XLS","XLS (Armored)","Z-Type","Zentorno",
    "Zion Classic","Zombie Chopper","Zorrusso",
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
        candidate.includes("#") ||
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

// Deterministic hash for supplement-only vehicles (no DurtyFree hash available)
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

interface Supplement {
  // For existing pipeline vehicles:
  features_add?: string[];
  features_remove?: string[];
  stores?: string[];
  stores_add?: string[];
  stores_remove?: string[];
  price?: number;
  trade_price?: number;
  trade_price_condition?: string;
  unlock_methods?: string[];
  unlock_condition_note?: string;
  use_case?: string[];
  racing_tier?: string | null;
  racing_lap_time?: number | null;
  image?: string;
  // For vehicles missing from DurtyFree:
  _missing_from_pipeline?: boolean;
  _note?: string;
  _added?: string;
  _reason?: string;
  _source_issue?: string;
  _missing_from_durtyfree?: boolean;
  _review_after?: string;
  vehicleClass?: string;
  manufacturer?: string;
  features?: string[];  // complete list when _missing_from_pipeline
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
  // Weaponized uses DurtyFree Weapons array — no Wiki category needed
  const [imaniSet, driftSet, hswSet] = await Promise.all([
    fetchCategoryMembers("Vehicles_eligible_for_Imani_Tech_upgrades"),
    fetchCategoryMembers("Vehicles_eligible_for_Drift_Tune_conversion"),
    fetchCategoryMembers("Vehicles_eligible_for_Hao's_Special_Works_conversion"),
  ]);
  console.log(
    `  Imani: ${imaniSet.size}, Drift: ${driftSet.size}, HSW: ${hswSet.size}`
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

      // Imani Tech: Wiki category is broader than GTABase (any Imani upgrade vs. full menu)
      // We accept the broader definition — ~186 vehicles is correct for "Imani Tech eligible"
      if (imaniSet.has(wikiTitle)) features.push("Imani Tech");
      if (driftSet.has(wikiTitle)) features.push("Drift Tuning");
      // HSW: wiki category + overrides for title mismatches (e.g. "Banshee (HD Universe)" vs "Banshee")
      if (hswSet.has(wikiTitle) || HSW_OVERRIDES.has(key)) features.push("HSW Performance Upgrade");
      if (BENNYS_CUSTOM.has(key)) features.push("Custom Vehicle");
      if (SERVICE_VEHICLES.has(key)) features.push("Service Vehicle");
      // Missile Jammer: static set bootstrapped from GTABase cache (Wiki text misses most vehicles)
      if (MISSILE_JAMMER_VEHICLES.has(key)) features.push("Missile Lock-On Jammer");
    }

    // Weaponized: use DurtyFree Weapons array — more complete than Wiki category
    // (Wiki's Weaponized_Vehicles_in_GTA_Online omits Oppressor Mk II and others)
    const weapons = v.Weapons as unknown[] | undefined;
    if (Array.isArray(weapons) && weapons.length > 0) features.push("Weaponized Vehicle");

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

  // ── Merge Broughy racing data ─────────────────────────────────────────────
  const broughyPath = import.meta.dir + "/broughy-data.json";
  const broughyFile = Bun.file(broughyPath);
  if (await broughyFile.exists()) {
    console.log("Merging Broughy racing data...");
    interface BroughyEntry {
      internalName: string;
      tier: string | null;
      lapTimeSeconds: number | null;
      topSpeedMph: number | null;
      classRank: number | null;
      overallRank: number | null;
    }
    const broughyData: BroughyEntry[] = await broughyFile.json();
    const broughyByInternal = new Map(broughyData.map(b => [b.internalName.toLowerCase(), b]));

    let broughyMatched = 0;
    for (const vehicle of vehicles) {
      const key = vehicle.internalName.toLowerCase();
      const b = broughyByInternal.get(key);
      if (b) {
        vehicle.racing_tier = b.tier;
        vehicle.racing_lap_time = b.lapTimeSeconds;
        broughyMatched++;
      }
    }
    console.log(`  Matched: ${broughyMatched} / ${vehicles.length} vehicles`);
  } else {
    console.log("No broughy-data.json found — skipping Broughy merge");
  }

  // ── Apply supplements ─────────────────────────────────────────────────────
  const supplementsPath = import.meta.dir + "/supplements.json";
  const supplementsFile = Bun.file(supplementsPath);
  let supplementsApplied = 0;
  let supplementsAdded = 0;

  if (await supplementsFile.exists()) {
    console.log("Applying supplements...");
    const supplements: Record<string, Supplement> = await supplementsFile.json();
    const vehicleByName = new Map(vehicles.map(v => [v.name.toLowerCase(), v]));

    for (const [name, sup] of Object.entries(supplements)) {
      if (name.startsWith("_")) continue; // skip meta-keys (_comment, _format, etc.)
      const existing = vehicleByName.get(name.toLowerCase());

      if (sup._missing_from_pipeline) {
        // Add vehicle that DurtyFree doesn't know about
        if (!existing) {
          const newVehicle: OutputVehicle = {
            name,
            manufacturer: sup.manufacturer ?? "",
            vehicleClass: sup.vehicleClass ?? "Unknown",
            hash: hashCode(normalize(name)),
            internalName: normalize(name).replace(/ /g, ""),
            image: sup.image ?? "",
            stores: sup.stores ?? [],
            features: sup.features ?? [],
            price: sup.price,
            trade_price: sup.trade_price,
            trade_price_condition: sup.trade_price_condition,
            unlock_methods: sup.unlock_methods,
            unlock_condition_note: sup.unlock_condition_note,
            use_case: sup.use_case,
            racing_tier: sup.racing_tier,
            racing_lap_time: sup.racing_lap_time,
            source: "supplement",
          };
          vehicles.push(newVehicle);
          vehicleByName.set(name.toLowerCase(), newVehicle);
          supplementsAdded++;
        }
      } else if (existing) {
        // Patch existing pipeline vehicle
        if (sup.stores !== undefined) existing.stores = sup.stores;
        if (sup.stores_add) {
          for (const s of sup.stores_add) {
            if (!existing.stores.includes(s)) existing.stores.push(s);
          }
        }
        if (sup.stores_remove) {
          existing.stores = existing.stores.filter(s => !sup.stores_remove!.includes(s));
        }
        if (sup.image !== undefined) existing.image = sup.image;
        if (sup.features_add) {
          for (const f of sup.features_add) {
            if (!existing.features.includes(f)) existing.features.push(f);
          }
        }
        if (sup.features_remove) {
          existing.features = existing.features.filter(f => !sup.features_remove!.includes(f));
        }
        if (sup.price !== undefined) existing.price = sup.price;
        if (sup.trade_price !== undefined) existing.trade_price = sup.trade_price;
        if (sup.trade_price_condition !== undefined) existing.trade_price_condition = sup.trade_price_condition;
        if (sup.unlock_methods !== undefined) existing.unlock_methods = sup.unlock_methods;
        if (sup.unlock_condition_note !== undefined) existing.unlock_condition_note = sup.unlock_condition_note;
        if (sup.use_case !== undefined) existing.use_case = sup.use_case;
        if (sup.racing_tier !== undefined) existing.racing_tier = sup.racing_tier;
        if (sup.racing_lap_time !== undefined) existing.racing_lap_time = sup.racing_lap_time;
        supplementsApplied++;
      } else {
        console.log(`  Warning: supplement "${name}" not found in pipeline output`);
      }
    }

    console.log(`  Applied: ${supplementsApplied} patches, ${supplementsAdded} new vehicles`);
  } else {
    console.log("No supplements.json found — skipping supplement layer");
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
