import { Database } from "bun:sqlite";

const db = new Database(import.meta.dir + "/database.db");

// Helper: Parse JSON columns and return typed vehicle object
function parseVehicle(row: any) {
  return {
    ...row,
    stores: JSON.parse(row.stores || "[]"),
    features: JSON.parse(row.features || "[]"),
    unlock_methods: JSON.parse(row.unlock_methods || "[]"),
    use_case: JSON.parse(row.use_case || "[]"),
    removed_from_stores: row.removed_from_stores === 1,
  };
}

// GET /api/vehicles - List with filters
function handleVehiclesList(url: URL): Response {
  const params = url.searchParams;

  let query = "SELECT * FROM vehicles WHERE 1=1";
  const values: any[] = [];

  if (params.has("class")) {
    query += " AND vehicleClass = ?";
    values.push(params.get("class"));
  }

  if (params.has("manufacturer")) {
    query += " AND manufacturer = ?";
    values.push(params.get("manufacturer"));
  }

  if (params.has("grind")) {
    query += " AND grinding_tier = ?";
    values.push(params.get("grind"));
  }

  if (params.has("race")) {
    query += " AND racing_tier = ?";
    values.push(params.get("race"));
  }

  if (params.has("minPrice")) {
    query += " AND price >= ?";
    values.push(parseInt(params.get("minPrice") || "0"));
  }

  if (params.has("maxPrice")) {
    query += " AND price <= ?";
    values.push(parseInt(params.get("maxPrice") || "9999999999"));
  }

  if (params.has("search")) {
    query += " AND LOWER(name) LIKE LOWER(?)";
    values.push(`%${params.get("search")}%`);
  }

  query += " ORDER BY vehicleClass, name";

  const rows = db.prepare(query).all(...values) as any[];
  let vehicles = rows.map(parseVehicle);

  // Array filters applied in-memory
  if (params.has("store")) {
    const store = params.get("store");
    vehicles = vehicles.filter(v => v.stores.includes(store));
  }

  if (params.has("feature")) {
    const feature = params.get("feature");
    vehicles = vehicles.filter(v => v.features.includes(feature));
  }

  if (params.has("useCase")) {
    const useCase = params.get("useCase");
    vehicles = vehicles.filter(v => v.use_case.includes(useCase));
  }

  return Response.json({ vehicles });
}

// GET /api/vehicles/:hash - Single vehicle lookup
function handleVehicleDetail(hash: number): Response {
  const row = db.prepare("SELECT * FROM vehicles WHERE hash = ?").get(hash) as any;

  if (!row) {
    return new Response(JSON.stringify({ error: "Vehicle not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return Response.json(parseVehicle(row));
}

// Main server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // API routes
    if (url.pathname === "/api/vehicles" && req.method === "GET") {
      return handleVehiclesList(url);
    }

    const vehicleHashMatch = url.pathname.match(/^\/api\/vehicles\/(\d+)$/);
    if (vehicleHashMatch && req.method === "GET") {
      return handleVehicleDetail(parseInt(vehicleHashMatch[1]));
    }

    // Static file serving (existing behavior)
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(import.meta.dir + path);
    if (await file.exists()) return new Response(file);
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
