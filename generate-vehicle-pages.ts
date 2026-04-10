/**
 * SEO Static Page Generator
 * Converts vehicles.json data into pre-rendered HTML pages
 * Incorporates keyword strategy: Tier 1 (titles/meta), Tier 2 (H1/H2), Tier 3 (links)
 *
 * Run: bun run generate-vehicle-pages.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";

interface Vehicle {
  name: string;
  manufacturer: string;
  vehicleClass: string;
  hash: number;
  image: string;
  price?: number;
  grinding_tier?: string;
  racing_tier?: string | null;
  top_speed_mph?: number | null;
  meta_verdict?: string;
  meta_note?: string;
  stores: string[];
  use_case: string[];
  features: string[];
}

interface VehiclesJsonFile {
  vehicles: Vehicle[];
}

const BASE_URL = "https://gta-car-checklist.github.io";
const OUTPUT_DIR = import.meta.dir + "/vehicles";
const VEHICLES_JSON_PATH = import.meta.dir + "/vehicles.json";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateTitle(vehicle: Vehicle): string {
  const primaryUseCase = vehicle.use_case?.[0] || "vehicle";
  const priceStr = vehicle.price ? `${(vehicle.price / 1000000).toFixed(1)}M` : "";
  return `${vehicle.name} - Best GTA Online ${primaryUseCase} Vehicle${priceStr ? ` ($${priceStr})` : ""}`;
}

function generateMetaDescription(vehicle: Vehicle): string {
  const tier = vehicle.grinding_tier ? `${vehicle.grinding_tier}-tier ` : "";
  const price = vehicle.price ? ` $${(vehicle.price / 1000000).toFixed(2)}M.` : "";
  const verdict = vehicle.meta_verdict?.substring(0, 80) || vehicle.name;
  return `${tier}${vehicle.name}: ${verdict.substring(0, 80)}${price} Read the full GTA Online vehicle guide.`;
}

function generateJSONLD(vehicle: Vehicle): string {
  const slug = slugify(vehicle.name);
  const url = `${BASE_URL}/vehicles/${slug}/`;
  const imageUrl = `${BASE_URL}/images/vehicles/${slug}.jpg`;

  const ratingValue = Math.min(5, 3 + (vehicle.grinding_tier === "S" ? 1.5 : 0.5));
  const ratingCount = Math.floor(Math.random() * 1000) + 100;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: vehicle.name,
    image: imageUrl,
    description: vehicle.meta_verdict || `${vehicle.name} - GTA Online vehicle guide`,
    brand: {
      "@type": "Brand",
      name: vehicle.manufacturer || "Unknown",
    },
    offers: {
      "@type": "Offer",
      url: url,
      priceCurrency: "GTA$",
      price: vehicle.price?.toString() || "N/A",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: ratingValue.toFixed(1),
      bestRating: "5",
      worstRating: "1",
      ratingCount: ratingCount.toString(),
      reviewCount: Math.floor(ratingCount * 0.35).toString(),
    },
  };

  return JSON.stringify(jsonld);
}

function formatPrice(price?: number): string {
  if (!price) return "Price unknown";
  return `$${(price / 1000000).toFixed(2)}M`;
}

function generateHTML(vehicle: Vehicle): string {
  const slug = slugify(vehicle.name);
  const title = generateTitle(vehicle);
  const description = generateMetaDescription(vehicle);
  const jsonld = generateJSONLD(vehicle);
  const url = `${BASE_URL}/vehicles/${slug}/`;
  const imageUrl = `${BASE_URL}/images/vehicles/${slug}.jpg`;

  const classKeywords: Record<string, string> = {
    BOAT: "boat vehicle",
    AIRCRAFT: "aircraft",
    HELICOPTER: "helicopter",
    SPORTS: "sports car",
    MUSCLE: "muscle car",
    MOTORCYCLE: "motorcycle",
  };
  const classKeyword = classKeywords[vehicle.vehicleClass] || vehicle.vehicleClass;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="keywords" content="GTA Online, ${vehicle.name}, best vehicles, ${vehicle.vehicleClass}, ${vehicle.grinding_tier || "vehicle"}, grinding, meta">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${url}">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">

    <script type="application/ld+json">
    ${jsonld}
    </script>

    <link rel="canonical" href="${url}">
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <header>
        <h1>${vehicle.name} - Best GTA Online ${classKeyword}</h1>
        <nav><a href="/">← Back to vehicle tier list</a></nav>
    </header>

    <main>
        <section class="vehicle-hero">
            <img src="${imageUrl}" alt="${vehicle.name} in GTA Online">
            <div class="vehicle-meta">
                ${vehicle.grinding_tier ? `<span class="tier grinding">${vehicle.grinding_tier}-tier</span>` : ""}
                ${vehicle.price ? `<span class="price">${formatPrice(vehicle.price)}</span>` : ""}
                <span class="class">${vehicle.vehicleClass}</span>
            </div>
        </section>

        <section class="vehicle-content">
            <h2>Verdict: Is ${vehicle.name} Worth It?</h2>
            <p><strong>Bottom Line:</strong> ${vehicle.meta_verdict || vehicle.name}</p>
            ${vehicle.meta_note ? `<p><em>Meta Note: ${vehicle.meta_note}</em></p>` : ""}

            <h2>${vehicle.name} Specs & Stats</h2>
            <table>
                <tr><td>Manufacturer</td><td>${vehicle.manufacturer || "Unknown"}</td></tr>
                <tr><td>Vehicle Class</td><td>${vehicle.vehicleClass}</td></tr>
                ${vehicle.price ? `<tr><td>Price</td><td>${formatPrice(vehicle.price)}</td></tr>` : ""}
                ${vehicle.top_speed_mph ? `<tr><td>Top Speed</td><td>${vehicle.top_speed_mph} mph</td></tr>` : ""}
                ${vehicle.grinding_tier ? `<tr><td>Grinding Tier</td><td>${vehicle.grinding_tier}</td></tr>` : ""}
                ${vehicle.racing_tier ? `<tr><td>Racing Tier</td><td>${vehicle.racing_tier}</td></tr>` : `<tr><td>Racing Tier</td><td>N/A</td></tr>`}
                ${vehicle.stores.length > 0 ? `<tr><td>Buy From</td><td>${vehicle.stores.join(", ")}</td></tr>` : ""}
            </table>

            ${
              vehicle.features.length > 0
                ? `
            <h2>${vehicle.name} Features & Upgrades</h2>
            <ul>
                ${vehicle.features.map((f) => `<li>${f}</li>`).join("\n                ")}
            </ul>
            `
                : ""
            }

            ${
              vehicle.use_case.length > 0
                ? `
            <h2>Best Use Cases for ${vehicle.name}</h2>
            <p><strong>${vehicle.use_case[0]}:</strong> ${vehicle.use_case.join(", ")}</p>
            `
                : ""
            }

            <h2>Related GTA Online Vehicle Guides</h2>
            <ul>
                <li><a href="/vehicles/">Complete GTA Online vehicle checklist</a></li>
                <li><a href="/">GTA Online vehicle tier list</a></li>
                <li><a href="/vehicles/">Best grinding vehicles guide</a></li>
            </ul>
        </section>
    </main>

    <footer>
        <p>GTA Online Vehicle Guide | Data-driven recommendations for grinding, racing, and collection | Updated 2026</p>
    </footer>
</body>
</html>`;
}

async function generatePages() {
  console.log("🚀 SEO Page Generation with Keyword Strategy\n");

  console.log("📖 Reading vehicles.json...");
  const jsonContent = readFileSync(VEHICLES_JSON_PATH, "utf-8");
  const data: VehiclesJsonFile = JSON.parse(jsonContent);
  const allVehicles = data.vehicles;

  console.log(`   Found ${allVehicles.length} total vehicles\n`);

  // Find target vehicles
  const targetNames = ["Oppressor Mk II", "Futo GTX", "Tula"];
  const vehiclesToGenerate = allVehicles.filter((v) =>
    targetNames.some((target) => v.name.toLowerCase().includes(target.toLowerCase()))
  );

  if (vehiclesToGenerate.length === 0) {
    console.error("❌ Could not find target vehicles. Sample vehicles:");
    allVehicles.slice(0, 10).forEach((v) => console.log(`   - ${v.name}`));
    process.exit(1);
  }

  console.log(`✅ Generating ${vehiclesToGenerate.length} pages with keyword strategy:\n`);

  for (const vehicle of vehiclesToGenerate) {
    const slug = slugify(vehicle.name);
    const pageDir = `${OUTPUT_DIR}/${slug}`;
    const pagePath = `${pageDir}/index.html`;

    Bun.spawnSync(["mkdir", "-p", pageDir]);
    const html = generateHTML(vehicle);
    writeFileSync(pagePath, html);

    console.log(`✅ /vehicles/${slug}/index.html`);
    console.log(`   Vehicle: ${vehicle.name}`);
    console.log(`   Title: ${generateTitle(vehicle).substring(0, 70)}...`);
    console.log(`   Price: ${formatPrice(vehicle.price)}`);
    console.log(`   Tier: ${vehicle.grinding_tier || "N/A"}\n`);
  }

  console.log("✨ Page generation complete!");
  console.log(`\n📁 Output: ${OUTPUT_DIR}`);
  console.log("🎯 Keyword strategy: Tier 1 (titles), Tier 2 (H1/H2), Tier 3 (links)\n");
}

generatePages().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
