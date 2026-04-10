/**
 * SEO Page Generation Test Suite
 * Verifies file structure and metadata validation
 * Run: node SEO.test.js
 */

const fs = require("fs");
const path = require("path");

const VEHICLES_JSON = "./vehicles.json";
const VEHICLES_DIR = "./vehicles";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let passed = 0, failed = 0, errors = [];

function assert(condition, message) {
  if (condition) {
    console.log(`${GREEN}✅${RESET} ${message}`);
    passed++;
  } else {
    console.log(`${RED}❌${RESET} ${message}`);
    failed++;
    errors.push(message);
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

console.log("\n📋 TEST SUITE: SEO Page Generation\n");
console.log("1️⃣  FILE & DATA VALIDATION");
console.log("─".repeat(50));

let vehicles = [];
try {
  const rawData = fs.readFileSync(VEHICLES_JSON, "utf-8");
  const data = JSON.parse(rawData);
  vehicles = data.vehicles || [];
  assert(Array.isArray(vehicles), "vehicles.json loads as array");
  assert(vehicles.length > 0, `Found ${vehicles.length} vehicles`);
} catch (err) {
  console.error(`${RED}❌ Failed to load vehicles.json:${RESET}`, err.message);
  process.exit(1);
}

console.log("\n2️⃣  DIRECTORY STRUCTURE");
console.log("─".repeat(50));

const vehiclesDirExists = fs.existsSync(VEHICLES_DIR);
assert(vehiclesDirExists, `/vehicles directory exists`);

if (!vehiclesDirExists) {
  console.log(`${YELLOW}⚠️  Creating /vehicles directory${RESET}`);
  fs.mkdirSync(VEHICLES_DIR, { recursive: true });
}

console.log("\n3️⃣  PAGE GENERATION VERIFICATION (Sample)");
console.log("─".repeat(50));

const sampleVehicles = vehicles.slice(0, Math.min(5, vehicles.length));
let filesGenerated = 0, validMetadata = 0, validJSON_LD = 0;

for (const vehicle of sampleVehicles) {
  const slug = slugify(vehicle.name);
  const pageFile = path.join(VEHICLES_DIR, slug, "index.html");
  const fileExists = fs.existsSync(pageFile);
  
  if (fileExists) filesGenerated++;
  assert(fileExists, `✓ /vehicles/${slug}/index.html`);

  if (fileExists) {
    const html = fs.readFileSync(pageFile, "utf-8");
    const hasTitle = html.includes(`<title>`);
    const hasOG = html.includes(`og:title`) && html.includes(`og:description`) && html.includes(`og:image`);
    const hasCanonical = html.includes(`rel="canonical"`);
    
    assert(hasTitle, `  └─ <title>`);
    assert(hasOG, `  └─ og:* metadata`);
    assert(hasCanonical, `  └─ canonical`);
    
    if (hasOG) validMetadata++;

    const jsonLDMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (jsonLDMatch) {
      try {
        const jsonLD = JSON.parse(jsonLDMatch[1]);
        const valid = jsonLD["@context"] === "https://schema.org" && 
                     jsonLD["@type"] === "Product" && 
                     jsonLD.name && jsonLD.offers?.price;
        assert(valid, `  └─ JSON-LD`);
        if (valid) validJSON_LD++;
      } catch (e) {
        assert(false, `  └─ JSON-LD parse error`);
      }
    } else {
      assert(false, `  └─ JSON-LD missing`);
    }
  }
}

console.log("\n4️⃣  SLUG GENERATION");
console.log("─".repeat(50));

const slugTests = [
  { input: "Oppressor Mk II", expected: "oppressor-mk-ii" },
  { input: "Futo GTX", expected: "futo-gtx" },
  { input: "Tula", expected: "tula" },
];

for (const test of slugTests) {
  const result = slugify(test.input);
  assert(result === test.expected, `"${test.input}" → "${result}"`);
}

console.log("\n5️⃣  FILE COUNT");
console.log("─".repeat(50));

let fileCount = 0;
if (fs.existsSync(VEHICLES_DIR)) {
  fileCount = fs.readdirSync(VEHICLES_DIR).length;
  assert(fileCount > 0, `Generated ${fileCount} directories`);
  assert(fileCount <= vehicles.length, `Count (${fileCount}) ≤ vehicles (${vehicles.length})`);
}

console.log("\n6️⃣  SUMMARY");
console.log("─".repeat(50));

console.log(`${GREEN}Total Vehicles:${RESET} ${vehicles.length}`);
console.log(`${GREEN}Sample Checked:${RESET} ${sampleVehicles.length}`);
console.log(`${GREEN}Pages Generated:${RESET} ${filesGenerated}/${sampleVehicles.length}`);
console.log(`${GREEN}Valid Metadata:${RESET} ${validMetadata}/${sampleVehicles.length}`);
console.log(`${GREEN}Valid JSON-LD:${RESET} ${validJSON_LD}/${sampleVehicles.length}`);

console.log(`\n${GREEN}Tests Passed:${RESET} ${passed}`);
console.log(`${RED}Tests Failed:${RESET} ${failed}`);

console.log("\n" + "─".repeat(50));
if (failed === 0) {
  console.log(`${GREEN}✅ ALL TESTS PASSED${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}❌ TESTS FAILED${RESET}\n`);
  process.exit(1);
}
