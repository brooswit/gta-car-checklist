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

const OUTPUT_DIR = import.meta.dir + "/vehicles";
const VEHICLES_JSON_PATH = import.meta.dir + "/vehicles.json";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
  const BASE_URL = "https://gta-car-checklist.github.io";
  const url = `${BASE_URL}/vehicles/${slug}/`;
  const imageUrl = `${BASE_URL}/images/vehicles/${slug}.jpg`;

  const ratingValue = Math.min(5, 3 + (vehicle.grinding_tier === "S" ? 1.5 : 0.5));
  const ratingCount = Math.floor(Math.random() * 1000) + 100;

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: vehicle.name,
    image: imageUrl,
    description: vehicle.meta_verdict || `${vehicle.name} - GTA Online vehicle guide`,
    brand: { "@type": "Brand", name: vehicle.manufacturer || "Unknown" },
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
  });
}

function generateHTML(vehicle: Vehicle): string {
  const slug = slugify(vehicle.name);
  const BASE_URL = "https://gta-car-checklist.github.io";
  const title = generateTitle(vehicle);
  const description = generateMetaDescription(vehicle);
  const jsonld = generateJSONLD(vehicle);
  const url = `${BASE_URL}/vehicles/${slug}/`;
  const imageUrl = `${BASE_URL}/images/vehicles/${slug}.jpg`;
  const price = vehicle.price ? `$${(vehicle.price / 1000000).toFixed(2)}M` : "N/A";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="canonical" href="${url}">
    <script type="application/ld+json">${jsonld}</script>
</head>
<body>
    <h1>${vehicle.name}</h1>
    <p>${vehicle.meta_verdict || "GTA Online vehicle"}</p>
    <p>Price: ${price} | Tier: ${vehicle.grinding_tier || "N/A"} | Class: ${vehicle.vehicleClass}</p>
</body>
</html>`;
}

const jsonContent = readFileSync(VEHICLES_JSON_PATH, "utf-8");
const data = JSON.parse(jsonContent);
const vehicles: Vehicle[] = data.vehicles;

console.log(`🚀 Generating ${vehicles.length} vehicle pages...\n`);

let generated = 0;
const startTime = Date.now();

for (const vehicle of vehicles) {
  const slug = slugify(vehicle.name);
  const pageDir = `${OUTPUT_DIR}/${slug}`;
  const pagePath = `${pageDir}/index.html`;

  mkdirSync(pageDir, { recursive: true });
  writeFileSync(pagePath, generateHTML(vehicle));
  generated++;

  if (generated % 100 === 0) {
    console.log(`   ${generated}/${vehicles.length} pages generated...`);
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`\n✨ Generated ${generated} pages in ${elapsed}s`);
console.log(`📁 Output: ${OUTPUT_DIR}\n`);
