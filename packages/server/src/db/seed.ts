/**
 * OpenEstimate Database Seeder
 * Run with: npm run db:seed
 */

import bcrypt from 'bcryptjs';
import { db } from './index';
import {
  users,
  companySettings,
  costCategories,
  costItems,
  projects,
  estimates,
  estimateSections,
  estimateLineItems,
  subcontractors,
  templates,
  templateSections,
  templateLineItems,
  projectActivityLog,
} from './schema';
import { eq } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────────────────────
// Guard: skip if already seeded
// ─────────────────────────────────────────────────────────────────────────────
async function isAlreadySeeded(): Promise<boolean> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'admin@openestimate.local'))
    .limit(1);
  return existing.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main seed function
// ─────────────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('🌱  Starting database seed...');

  if (await isAlreadySeeded()) {
    console.log('✅  Database already seeded – skipping.');
    process.exit(0);
  }

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  console.log('  → Creating admin user...');
  const passwordHash = await bcrypt.hash('changeme123', 12);
  const [adminUser] = await db
    .insert(users)
    .values({
      name: 'Admin User',
      email: 'admin@openestimate.local',
      passwordHash,
      role: 'admin',
      isActive: true,
    })
    .returning();

  // ── 2. Company settings ────────────────────────────────────────────────────
  console.log('  → Creating company settings...');
  await db.insert(companySettings).values({
    companyName: 'Acme Construction LLC',
    address: '1234 Builder Way, Austin, TX 78701',
    phone: '(512) 555-0100',
    email: 'estimates@acmeconstruction.example',
    licenseNumber: 'TX-GC-20240001',
    defaultOverheadPct: 15,
    defaultProfitPct: 10,
    defaultTaxPct: 0,
    defaultBondPct: 1,
    defaultLaborRate: 65,
    defaultWasteFactorPct: 5,
    currency: 'USD',
    timezone: 'America/Chicago',
    fiscalYearStartMonth: 1,
    customUnitsJson: JSON.stringify(['SQ', 'MSF', 'BF']),
    termsAndConditions:
      'All estimates are valid for 30 days. Prices subject to change based on material availability. ' +
      'A 10% deposit is required to commence work. Payment terms: Net 30.',
  });

  // ── 3. Cost database categories & items ───────────────────────────────────
  console.log('  → Seeding cost database...');
  const catIds = await seedCostDatabase(adminUser.id);

  // ── 4. Subcontractors ──────────────────────────────────────────────────────
  console.log('  → Creating subcontractors...');
  const subIds = await seedSubcontractors();

  // ── 5. Templates ───────────────────────────────────────────────────────────
  console.log('  → Creating estimate templates...');
  await seedTemplates(adminUser.id);

  // ── 6. Sample projects & estimates ────────────────────────────────────────
  console.log('  → Creating sample projects...');
  await seedProjects(adminUser.id, catIds);

  console.log('✅  Seed complete!');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost database
// ─────────────────────────────────────────────────────────────────────────────
async function seedCostDatabase(_userId: number): Promise<Map<string, number>> {
  const catIds = new Map<string, number>();

  // Helper: insert category and return its id
  async function cat(name: string, parent?: string, sortOrder = 0): Promise<number> {
    const [row] = await db
      .insert(costCategories)
      .values({ name, parentId: parent ? catIds.get(parent) : null, sortOrder })
      .returning();
    catIds.set(name, row.id);
    return row.id;
  }

  // Helper: insert cost item
  async function item(
    categoryName: string,
    name: string,
    unit: string,
    matCost: number,
    laborCost: number,
    laborHours: number,
    description?: string,
    source = '2024 RSMeans'
  ) {
    await db.insert(costItems).values({
      categoryId: catIds.get(categoryName)!,
      name,
      description: description ?? null,
      unit,
      defaultMaterialCost: matCost,
      defaultLaborCost: laborCost,
      defaultLaborHours: laborHours,
      lastPriceUpdate: '2024-01-01',
      source,
      needsPriceUpdate: false,
    });
  }

  // ── Division 03 – Concrete ────────────────────────────────────────────────
  await cat('Concrete', undefined, 10);
  await cat('Concrete Footings', 'Concrete', 0);
  await cat('Concrete Slabs', 'Concrete', 1);
  await cat('Concrete Walls', 'Concrete', 2);
  await cat('Concrete Misc', 'Concrete', 3);

  await item('Concrete Footings', 'Continuous Footing 12"x8" (3000 PSI)', 'LF', 18.50, 12.00, 0.18, 'Continuous wall footing, 12" wide x 8" deep');
  await item('Concrete Footings', 'Spread Footing 2\'x2\'x10" (3000 PSI)', 'EA', 145.00, 85.00, 1.30, 'Isolated column footing');
  await item('Concrete Footings', 'Continuous Footing 16"x10" (3500 PSI)', 'LF', 26.00, 16.50, 0.25);
  await item('Concrete Footings', 'Footing Rebar #4 @ 12" OC', 'LF', 0.62, 0.30, 0.005);

  await item('Concrete Slabs', '4" Concrete Slab on Grade (3000 PSI)', 'SF', 3.20, 1.85, 0.028, '4" thick unreinforced slab on grade');
  await item('Concrete Slabs', '6" Concrete Slab on Grade (3500 PSI)', 'SF', 4.80, 2.10, 0.032, '6" thick slab on grade with WWF');
  await item('Concrete Slabs', '4" Slab w/ #3 Rebar 12" OC', 'SF', 4.10, 2.20, 0.033);
  await item('Concrete Slabs', 'Concrete Driveway 4"', 'SF', 3.40, 1.95, 0.030);
  await item('Concrete Slabs', 'Concrete Patio 4"', 'SF', 3.20, 1.85, 0.028);
  await item('Concrete Slabs', 'Vapor Barrier 6-mil Poly', 'SF', 0.12, 0.04, 0.001);

  await item('Concrete Walls', '8" Poured Concrete Foundation Wall', 'SF', 8.50, 6.20, 0.095, '8" thick foundation wall, formed');
  await item('Concrete Walls', '10" Poured Concrete Foundation Wall', 'SF', 10.80, 7.00, 0.107);
  await item('Concrete Walls', '12" Poured Concrete Retaining Wall', 'SF', 13.50, 8.50, 0.130);

  await item('Concrete Misc', 'Concrete Curb & Gutter', 'LF', 22.00, 14.00, 0.21);
  await item('Concrete Misc', 'Concrete Steps, 4\' wide, per riser', 'EA', 185.00, 95.00, 1.45);
  await item('Concrete Misc', 'Anchor Bolts 1/2"x12" (in concrete)', 'EA', 1.85, 1.20, 0.018);

  // ── Division 04 – Masonry ─────────────────────────────────────────────────
  await cat('Masonry', undefined, 20);
  await cat('Brick Masonry', 'Masonry', 0);
  await cat('CMU Block', 'Masonry', 1);
  await cat('Stone Masonry', 'Masonry', 2);

  await item('Brick Masonry', 'Face Brick, Standard Running Bond', 'SF', 7.20, 8.50, 0.130, 'Standard red face brick, running bond pattern');
  await item('Brick Masonry', 'Face Brick, Common Bond', 'SF', 7.20, 9.50, 0.145);
  await item('Brick Masonry', 'Brick Chimney, 16"x16" flue', 'VLF', 95.00, 145.00, 2.22);
  await item('Brick Masonry', 'Brick Steps, per riser', 'LF', 32.00, 28.00, 0.43);
  await item('Brick Masonry', 'Tuckpointing Brick', 'SF', 0.85, 3.80, 0.058);

  await item('CMU Block', '8"x8"x16" CMU Block Wall', 'SF', 4.80, 6.20, 0.095, 'Standard weight CMU, running bond');
  await item('CMU Block', '12"x8"x16" CMU Block Wall', 'SF', 6.50, 7.00, 0.107);
  await item('CMU Block', 'CMU Block, Reinforced w/ Grout (8")', 'SF', 7.20, 8.50, 0.130);
  await item('CMU Block', 'CMU Lintel Block, 8"', 'LF', 12.50, 9.00, 0.138);

  await item('Stone Masonry', 'Fieldstone Veneer', 'SF', 18.50, 22.00, 0.338);
  await item('Stone Masonry', 'Cultured Stone Veneer', 'SF', 12.00, 14.50, 0.222);

  // ── Division 05 – Metals ──────────────────────────────────────────────────
  await cat('Metals', undefined, 30);
  await cat('Structural Steel', 'Metals', 0);
  await cat('Metal Deck', 'Metals', 1);
  await cat('Misc Metals', 'Metals', 2);

  await item('Structural Steel', 'W8x31 Steel Beam (erected)', 'LF', 48.00, 32.00, 0.49, 'Wide flange beam, erected in place');
  await item('Structural Steel', 'W10x49 Steel Beam (erected)', 'LF', 76.00, 38.00, 0.58);
  await item('Structural Steel', 'W12x72 Steel Beam (erected)', 'LF', 112.00, 45.00, 0.69);
  await item('Structural Steel', 'HSS 4x4x1/4 Column', 'LF', 22.00, 28.00, 0.43);
  await item('Structural Steel', 'HSS 6x6x3/8 Column', 'LF', 36.00, 32.00, 0.49);
  await item('Structural Steel', 'Steel Angle 3x3x1/4', 'LF', 4.80, 3.20, 0.049);

  await item('Metal Deck', '1-1/2" Type B Metal Roof Deck, 20ga', 'SF', 2.20, 1.45, 0.022);
  await item('Metal Deck', '3" Type B Metal Floor Deck, 18ga', 'SF', 3.80, 1.85, 0.028);

  await item('Misc Metals', 'Steel Pipe Railing, 1-1/2"', 'LF', 18.00, 22.00, 0.338);
  await item('Misc Metals', 'Anchor Bolt 3/4"x12"', 'EA', 3.50, 2.00, 0.031);

  // ── Division 06 – Wood & Plastics ─────────────────────────────────────────
  await cat('Wood & Plastics', undefined, 40);
  await cat('Framing Lumber', 'Wood & Plastics', 0);
  await cat('Sheathing', 'Wood & Plastics', 1);
  await cat('Finish Carpentry', 'Wood & Plastics', 2);
  await cat('Engineered Wood', 'Wood & Plastics', 3);

  await item('Framing Lumber', '2x4 Wall Framing (16" OC)', 'SF', 1.42, 1.20, 0.018, 'Wall framing per SF of wall area');
  await item('Framing Lumber', '2x6 Wall Framing (16" OC)', 'SF', 1.95, 1.35, 0.021);
  await item('Framing Lumber', '2x8 Floor Joist (16" OC)', 'SF', 2.80, 1.65, 0.025);
  await item('Framing Lumber', '2x10 Floor Joist (16" OC)', 'SF', 3.60, 1.75, 0.027);
  await item('Framing Lumber', '2x12 Floor Joist (16" OC)', 'SF', 4.50, 1.85, 0.028);
  await item('Framing Lumber', '2x6 Roof Rafter (24" OC)', 'SF', 2.10, 1.80, 0.028);
  await item('Framing Lumber', '2x8 Roof Rafter (24" OC)', 'SF', 2.80, 1.95, 0.030);
  await item('Framing Lumber', 'Sill Plate, Pressure Treated 2x6', 'LF', 1.85, 0.85, 0.013);
  await item('Framing Lumber', 'Stud, 2x4x8\' (each)', 'EA', 4.20, 0.60, 0.009);
  await item('Framing Lumber', 'Stud, 2x6x8\' (each)', 'EA', 6.80, 0.65, 0.010);

  await item('Sheathing', '7/16" OSB Sheathing', 'SF', 0.72, 0.55, 0.008, 'Structural wall or roof sheathing');
  await item('Sheathing', '1/2" CDX Plywood Sheathing', 'SF', 0.95, 0.58, 0.009);
  await item('Sheathing', '3/4" T&G Plywood Subfloor', 'SF', 1.45, 0.75, 0.012);
  await item('Sheathing', '1/2" Plywood Roof Sheathing', 'SF', 0.95, 0.60, 0.009);

  await item('Finish Carpentry', 'Base Molding, 3-1/2"', 'LF', 1.85, 2.20, 0.034);
  await item('Finish Carpentry', 'Crown Molding, 3-5/8"', 'LF', 3.20, 3.85, 0.059);
  await item('Finish Carpentry', 'Window Casing Set', 'EA', 28.00, 32.00, 0.49);
  await item('Finish Carpentry', 'Door Casing Set', 'EA', 22.00, 28.00, 0.43);
  await item('Finish Carpentry', 'Closet Shelf & Rod, 12"', 'LF', 8.50, 6.00, 0.092);

  await item('Engineered Wood', 'LVL Beam 3-1/2"x9-1/2"', 'LF', 14.50, 9.00, 0.138);
  await item('Engineered Wood', 'LVL Beam 3-1/2"x11-7/8"', 'LF', 18.00, 10.00, 0.153);
  await item('Engineered Wood', 'TJI 360 Floor Joist 11-7/8" (16" OC)', 'SF', 3.20, 1.55, 0.024);
  await item('Engineered Wood', 'Parallam PSL 3-1/2"x9-1/2"', 'LF', 22.00, 9.50, 0.146);

  // ── Division 07 – Thermal & Moisture ──────────────────────────────────────
  await cat('Thermal & Moisture', undefined, 50);
  await cat('Insulation', 'Thermal & Moisture', 0);
  await cat('Roofing', 'Thermal & Moisture', 1);
  await cat('Waterproofing', 'Thermal & Moisture', 2);
  await cat('Air Barriers', 'Thermal & Moisture', 3);

  await item('Insulation', 'Batt Insulation R-13 (2x4 wall)', 'SF', 0.55, 0.28, 0.004);
  await item('Insulation', 'Batt Insulation R-21 (2x6 wall)', 'SF', 0.88, 0.32, 0.005);
  await item('Insulation', 'Batt Insulation R-38 (ceiling)', 'SF', 1.45, 0.38, 0.006);
  await item('Insulation', 'Blown Fiberglass R-38 (attic)', 'SF', 1.10, 0.45, 0.007);
  await item('Insulation', 'Rigid Foam 2" XPS (R-10)', 'SF', 1.20, 0.55, 0.008);
  await item('Insulation', 'Spray Foam Closed Cell 2" (R-12)', 'SF', 2.80, 1.20, 0.018);
  await item('Insulation', 'Spray Foam Open Cell 3-1/2"', 'SF', 1.85, 0.95, 0.015);

  await item('Roofing', 'Asphalt Shingle, Architectural 30yr', 'SQ', 98.00, 75.00, 1.15, 'Architectural shingle, installed per square (100 SF)');
  await item('Roofing', 'Asphalt Shingle, 3-Tab 25yr', 'SQ', 72.00, 65.00, 1.00);
  await item('Roofing', 'Roofing Felt #15', 'SQ', 12.00, 8.50, 0.130);
  await item('Roofing', 'Ice & Water Shield', 'SQ', 85.00, 18.00, 0.28);
  await item('Roofing', 'TPO Membrane Roofing 60-mil', 'SF', 3.80, 2.20, 0.034);
  await item('Roofing', 'EPDM Roofing 60-mil', 'SF', 3.20, 2.00, 0.031);
  await item('Roofing', 'Metal Standing Seam Roof (16")', 'SF', 8.50, 4.50, 0.069);
  await item('Roofing', 'Ridge Vent, Continuous', 'LF', 4.50, 3.20, 0.049);
  await item('Roofing', 'Drip Edge Metal', 'LF', 1.20, 1.00, 0.015);
  await item('Roofing', 'Roof Flashing, Lead', 'LF', 8.50, 6.50, 0.100);

  await item('Waterproofing', 'Dampproofing Foundation Wall', 'SF', 0.65, 0.45, 0.007);
  await item('Waterproofing', 'Sheet Waterproofing (below grade)', 'SF', 3.20, 1.85, 0.028);
  await item('Waterproofing', 'Drain Board (below grade)', 'SF', 1.45, 0.65, 0.010);

  await item('Air Barriers', 'House Wrap (Tyvek or equal)', 'SF', 0.22, 0.18, 0.003);
  await item('Air Barriers', 'Sill Seal Gasket 3-1/2"', 'LF', 0.28, 0.10, 0.002);

  // ── Division 08 – Openings ────────────────────────────────────────────────
  await cat('Openings', undefined, 60);
  await cat('Doors', 'Openings', 0);
  await cat('Windows', 'Openings', 1);
  await cat('Door Hardware', 'Openings', 2);

  await item('Doors', 'Ext. Fiberglass Entry Door 3070, Pre-hung', 'EA', 485.00, 185.00, 2.84, 'Fiberglass entry door, 3\'0"x7\'0"');
  await item('Doors', 'Ext. Steel Entry Door 3068, Pre-hung', 'EA', 320.00, 175.00, 2.69);
  await item('Doors', 'Int. Hollow Core Door 2868, Pre-hung', 'EA', 145.00, 95.00, 1.46);
  await item('Doors', 'Int. Solid Core Door 2868, Pre-hung', 'EA', 285.00, 110.00, 1.69);
  await item('Doors', 'Bi-fold Door 4068 (double)', 'EA', 185.00, 85.00, 1.30);
  await item('Doors', 'Pocket Door 2868', 'EA', 320.00, 185.00, 2.84);
  await item('Doors', 'Overhead Garage Door 9\'x7\' Insulated', 'EA', 985.00, 285.00, 4.38);
  await item('Doors', 'Overhead Garage Door 16\'x7\' Insulated', 'EA', 1650.00, 385.00, 5.92);
  await item('Doors', 'Sliding Patio Door 6\'0" Vinyl', 'EA', 685.00, 245.00, 3.77);

  await item('Windows', 'Double-Hung Vinyl Window 2\'x3\'', 'EA', 185.00, 95.00, 1.46);
  await item('Windows', 'Double-Hung Vinyl Window 3\'x4\'', 'EA', 285.00, 110.00, 1.69);
  await item('Windows', 'Double-Hung Vinyl Window 3\'x5\'', 'EA', 345.00, 120.00, 1.84);
  await item('Windows', 'Casement Window 2\'x4\' Vinyl', 'EA', 310.00, 115.00, 1.77);
  await item('Windows', 'Picture Window 4\'x4\' Vinyl', 'EA', 385.00, 130.00, 2.00);
  await item('Windows', 'Bay Window 5\'x4\' Vinyl', 'EA', 985.00, 285.00, 4.38);
  await item('Windows', 'Skylight Fixed 24"x24"', 'EA', 485.00, 185.00, 2.84);

  await item('Door Hardware', 'Passage Lockset, Lever Handle', 'EA', 45.00, 28.00, 0.43);
  await item('Door Hardware', 'Privacy Lockset, Lever Handle', 'EA', 55.00, 28.00, 0.43);
  await item('Door Hardware', 'Entry Lockset with Deadbolt', 'EA', 185.00, 42.00, 0.65);
  await item('Door Hardware', 'Door Hinges (set of 3)', 'EA', 18.00, 12.00, 0.18);
  await item('Door Hardware', 'Door Stop', 'EA', 8.50, 5.00, 0.077);

  // ── Division 09 – Finishes ────────────────────────────────────────────────
  await cat('Finishes', undefined, 70);
  await cat('Drywall', 'Finishes', 0);
  await cat('Painting', 'Finishes', 1);
  await cat('Flooring', 'Finishes', 2);
  await cat('Tile', 'Finishes', 3);
  await cat('Ceilings', 'Finishes', 4);

  await item('Drywall', '1/2" Drywall (labor & material)', 'SF', 0.48, 0.85, 0.013, 'Hang and tape, walls and ceilings');
  await item('Drywall', '5/8" Type X Fire-Rated Drywall', 'SF', 0.62, 0.90, 0.014);
  await item('Drywall', '5/8" Moisture-Resistant Drywall', 'SF', 0.75, 0.90, 0.014);
  await item('Drywall', 'Drywall Finish Level 5 (skim coat)', 'SF', 0.15, 0.85, 0.013);
  await item('Drywall', 'Corner Bead Metal', 'LF', 0.35, 0.45, 0.007);

  await item('Painting', 'Interior Paint – Walls (2 coats)', 'SF', 0.28, 0.55, 0.008, 'Primer + 2 finish coats, latex');
  await item('Painting', 'Interior Paint – Ceilings (2 coats)', 'SF', 0.28, 0.62, 0.010);
  await item('Painting', 'Interior Trim Paint (2 coats)', 'LF', 0.18, 0.65, 0.010);
  await item('Painting', 'Exterior Paint – Siding (2 coats)', 'SF', 0.32, 0.72, 0.011);
  await item('Painting', 'Exterior Trim Paint (2 coats)', 'LF', 0.20, 0.70, 0.011);
  await item('Painting', 'Spray Paint – Doors & Frames', 'EA', 18.00, 45.00, 0.69);
  await item('Painting', 'Epoxy Floor Coating (2 coats)', 'SF', 0.85, 0.65, 0.010);

  await item('Flooring', 'LVP Flooring (3/8" click)', 'SF', 2.85, 1.45, 0.022, 'Luxury vinyl plank, floating installation');
  await item('Flooring', 'Hardwood Floor 3/4" Red Oak', 'SF', 5.50, 3.85, 0.059, 'Solid hardwood, nail-down');
  await item('Flooring', 'Carpet with 7/16" Pad', 'SY', 28.00, 9.00, 0.138, 'Medium grade carpet, glue-down pad');
  await item('Flooring', 'Carpet Tile, 24"x24"', 'SY', 32.00, 6.50, 0.100);
  await item('Flooring', 'Sheet Vinyl Flooring', 'SY', 14.00, 7.50, 0.115);

  await item('Tile', 'Ceramic Floor Tile 12"x12"', 'SF', 3.50, 4.85, 0.075, 'Standard ceramic, thin-set installation');
  await item('Tile', 'Porcelain Floor Tile 12"x24"', 'SF', 5.80, 5.20, 0.080);
  await item('Tile', 'Natural Stone Travertine 12"x12"', 'SF', 9.50, 6.50, 0.100);
  await item('Tile', 'Ceramic Wall Tile 4"x4" (shower)', 'SF', 3.20, 5.50, 0.085);
  await item('Tile', 'Subway Tile 3"x6" (backsplash)', 'SF', 4.50, 5.80, 0.089);
  await item('Tile', 'Tile Grout & Sealer', 'SF', 0.55, 0.45, 0.007);
  await item('Tile', 'Schluter KERDI Waterproofing Membrane', 'SF', 3.50, 1.85, 0.028);

  await item('Ceilings', 'Acoustical Tile Ceiling 2\'x4\' Grid', 'SF', 2.80, 2.20, 0.034);
  await item('Ceilings', 'Acoustical Tile Ceiling 2\'x2\' Grid', 'SF', 3.20, 2.50, 0.038);

  // ── Division 15 – Mechanical ──────────────────────────────────────────────
  await cat('Mechanical', undefined, 80);
  await cat('HVAC', 'Mechanical', 0);
  await cat('Plumbing', 'Mechanical', 1);

  await item('HVAC', 'Split System AC 3-ton (condensing unit)', 'EA', 1850.00, 485.00, 7.46, '3-ton split system, installed');
  await item('HVAC', 'Split System AC 4-ton (condensing unit)', 'EA', 2350.00, 545.00, 8.38);
  await item('HVAC', 'Gas Furnace 80,000 BTU 80% AFUE', 'EA', 1250.00, 485.00, 7.46);
  await item('HVAC', 'Gas Furnace 100,000 BTU 96% AFUE', 'EA', 1850.00, 545.00, 8.38);
  await item('HVAC', 'Air Handler (fan coil) 3-ton', 'EA', 985.00, 385.00, 5.92);
  await item('HVAC', 'Flex Duct 6" diameter', 'LF', 3.20, 3.50, 0.054);
  await item('HVAC', 'Rigid Ductwork, galvanized, 12"x6"', 'LF', 8.50, 9.00, 0.138);
  await item('HVAC', 'Supply Register 4"x10"', 'EA', 12.00, 18.00, 0.28);
  await item('HVAC', 'Return Air Grille 16"x20"', 'EA', 22.00, 22.00, 0.34);
  await item('HVAC', 'Thermostat, programmable', 'EA', 85.00, 55.00, 0.85);
  await item('HVAC', 'Thermostat, Smart WiFi', 'EA', 185.00, 65.00, 1.00);

  await item('Plumbing', 'Water Heater, Gas 40-gal 40,000 BTU', 'EA', 585.00, 285.00, 4.38, 'Gas water heater, installed');
  await item('Plumbing', 'Water Heater, Tankless Gas', 'EA', 985.00, 385.00, 5.92);
  await item('Plumbing', 'Bathroom Rough-in (3-fixture)', 'EA', 485.00, 685.00, 10.54, 'Supply, drain, vent for toilet, lav, shower');
  await item('Plumbing', 'Kitchen Sink Rough-in', 'EA', 185.00, 285.00, 4.38);
  await item('Plumbing', 'Copper Pipe 3/4" Type L', 'LF', 4.80, 5.50, 0.085);
  await item('Plumbing', 'PEX Tubing 3/4"', 'LF', 1.20, 2.85, 0.044);
  await item('Plumbing', 'PVC DWV Pipe 3"', 'LF', 2.80, 4.50, 0.069);
  await item('Plumbing', 'PVC DWV Pipe 4"', 'LF', 3.50, 4.85, 0.075);
  await item('Plumbing', 'Bathroom Faucet, single handle', 'EA', 145.00, 85.00, 1.31);
  await item('Plumbing', 'Kitchen Faucet, pull-out spray', 'EA', 285.00, 95.00, 1.46);
  await item('Plumbing', 'Toilet, elongated 1.28 gpf', 'EA', 285.00, 145.00, 2.23);
  await item('Plumbing', 'Bathtub, alcove 5\' fiberglass', 'EA', 485.00, 245.00, 3.77);
  await item('Plumbing', 'Shower Pan 36"x36" fiberglass', 'EA', 285.00, 195.00, 3.00);

  // ── Division 16 – Electrical ──────────────────────────────────────────────
  await cat('Electrical', undefined, 90);
  await cat('Service & Panels', 'Electrical', 0);
  await cat('Wiring & Devices', 'Electrical', 1);
  await cat('Lighting', 'Electrical', 2);

  await item('Service & Panels', '200A Main Panel with breakers', 'EA', 685.00, 485.00, 7.46, '200 amp residential service panel');
  await item('Service & Panels', '100A Sub-panel', 'EA', 385.00, 285.00, 4.38);
  await item('Service & Panels', '400A Service Entrance', 'EA', 1850.00, 1250.00, 19.23);
  await item('Service & Panels', 'Ground Rod & Clamp', 'EA', 22.00, 55.00, 0.85);

  await item('Wiring & Devices', '14/2 NM Cable (per LF)', 'LF', 0.38, 0.45, 0.007);
  await item('Wiring & Devices', '12/2 NM Cable (per LF)', 'LF', 0.55, 0.48, 0.007);
  await item('Wiring & Devices', '10/3 NM Cable (per LF)', 'LF', 1.45, 0.55, 0.008);
  await item('Wiring & Devices', 'Duplex Receptacle 15A', 'EA', 3.50, 28.00, 0.43);
  await item('Wiring & Devices', 'GFCI Receptacle 20A', 'EA', 18.00, 32.00, 0.49);
  await item('Wiring & Devices', 'AFCI Receptacle', 'EA', 38.00, 32.00, 0.49);
  await item('Wiring & Devices', 'Single Pole Switch 15A', 'EA', 4.50, 22.00, 0.34);
  await item('Wiring & Devices', '3-Way Switch 15A', 'EA', 8.50, 28.00, 0.43);
  await item('Wiring & Devices', 'Dimmer Switch', 'EA', 38.00, 28.00, 0.43);
  await item('Wiring & Devices', 'Dedicated Circuit 20A', 'EA', 85.00, 145.00, 2.23, 'Home run circuit, panel to device');
  await item('Wiring & Devices', 'Smoke Detector, Hardwired', 'EA', 38.00, 45.00, 0.69);
  await item('Wiring & Devices', 'CO Detector, Hardwired', 'EA', 55.00, 45.00, 0.69);

  await item('Lighting', 'Recessed Light 6" LED', 'EA', 45.00, 65.00, 1.00, '6" LED recessed light, trim & lamp');
  await item('Lighting', 'Recessed Light 4" LED', 'EA', 38.00, 55.00, 0.85);
  await item('Lighting', 'Ceiling Fan w/ Light Kit', 'EA', 185.00, 95.00, 1.46);
  await item('Lighting', 'Exterior Wall Sconce', 'EA', 85.00, 65.00, 1.00);
  await item('Lighting', 'LED Strip Light (per LF)', 'LF', 8.50, 5.50, 0.085);
  await item('Lighting', 'Fluorescent 2x4 Troffer (2-lamp)', 'EA', 85.00, 65.00, 1.00);

  // ── Division 12 – Specialties ──────────────────────────────────────────────
  await cat('Specialties', undefined, 100);
  await cat('Cabinets', 'Specialties', 0);
  await cat('Countertops', 'Specialties', 1);
  await cat('Accessories', 'Specialties', 2);

  await item('Cabinets', 'Kitchen Base Cabinet 24" wide', 'EA', 185.00, 95.00, 1.46, 'Semi-custom base cabinet, installed');
  await item('Cabinets', 'Kitchen Upper Cabinet 24" wide', 'EA', 145.00, 75.00, 1.15);
  await item('Cabinets', 'Kitchen Base Cabinet, per LF (incl. uppers)', 'LF', 285.00, 145.00, 2.23);
  await item('Cabinets', 'Bathroom Vanity 30" w/ sink top', 'EA', 485.00, 145.00, 2.23);
  await item('Cabinets', 'Bathroom Vanity 48" w/ sink top', 'EA', 685.00, 185.00, 2.84);
  await item('Cabinets', 'Linen Closet Cabinet', 'EA', 385.00, 125.00, 1.92);
  await item('Cabinets', 'Laundry Room Cabinet (upper/lower pair)', 'EA', 285.00, 95.00, 1.46);

  await item('Countertops', 'Laminate Countertop (per LF)', 'LF', 38.00, 18.00, 0.28);
  await item('Countertops', 'Granite Countertop 3/4" (per SF)', 'SF', 55.00, 22.00, 0.34);
  await item('Countertops', 'Quartz Countertop 3/4" (per SF)', 'SF', 72.00, 22.00, 0.34);
  await item('Countertops', 'Butcher Block Countertop (per LF)', 'LF', 68.00, 18.00, 0.28);
  await item('Countertops', 'Concrete Countertop (per SF)', 'SF', 95.00, 35.00, 0.54);

  await item('Accessories', 'Toilet Paper Holder', 'EA', 28.00, 18.00, 0.28);
  await item('Accessories', 'Towel Bar 24"', 'EA', 45.00, 22.00, 0.34);
  await item('Accessories', 'Medicine Cabinet Recessed 16"x20"', 'EA', 145.00, 65.00, 1.00);
  await item('Accessories', 'Mirror 24"x36"', 'EA', 85.00, 35.00, 0.54);

  return catIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcontractors
// ─────────────────────────────────────────────────────────────────────────────
async function seedSubcontractors(): Promise<number[]> {
  const rows = await db
    .insert(subcontractors)
    .values([
      {
        companyName: 'Lone Star Electrical Services',
        contactName: 'Bob Martinez',
        email: 'bob@lonestarelectric.example',
        phone: '(512) 555-0201',
        trade: 'Electrical',
        isPreferred: true,
        notes: 'Reliable, competitive pricing. License: TX-EC-11234.',
      },
      {
        companyName: 'Hill Country Plumbing Co.',
        contactName: 'Sarah Johnson',
        email: 'sarah@hcplumbing.example',
        phone: '(512) 555-0202',
        trade: 'Plumbing',
        isPreferred: true,
        notes: 'Fast turnaround. Available weekends.',
      },
      {
        companyName: 'Austin HVAC Pros',
        contactName: 'Mike Chen',
        email: 'mike@austinhvac.example',
        phone: '(512) 555-0203',
        trade: 'HVAC',
        isPreferred: false,
        notes: 'Good on commercial work. Call 2 weeks out.',
      },
      {
        companyName: 'Capitol Drywall & Framing',
        contactName: 'Tony Ramirez',
        email: 'tony@capitoldrywall.example',
        phone: '(512) 555-0204',
        trade: 'Framing / Drywall',
        isPreferred: true,
        notes: 'Large crews available. Best price on big jobs.',
      },
      {
        companyName: 'Texas Tile & Stone',
        contactName: 'Dana Willis',
        email: 'dana@texastile.example',
        phone: '(512) 555-0205',
        trade: 'Tile / Flooring',
        isPreferred: false,
        notes: 'High-end finishes. Long lead times.',
      },
      {
        companyName: 'Central Texas Roofing',
        contactName: 'Jeff Parker',
        email: 'jeff@ctroofing.example',
        phone: '(512) 555-0206',
        trade: 'Roofing',
        isPreferred: true,
        notes: '30-year warranty on labor. Preferred vendor.',
      },
    ])
    .returning();

  return rows.map((r) => r.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────
async function seedTemplates(userId: number) {
  // ── Helper ─────────────────────────────────────────────────────────────────
  async function makeTemplate(
    name: string,
    tradeCategory: string,
    description: string,
    sections: Array<{
      name: string;
      color?: string;
      items: Array<{
        description: string;
        quantity: number;
        unit: string;
        matCost: number;
        laborCost: number;
        laborHours: number;
        wastePct?: number;
        laborRate?: number;
      }>;
    }>
  ) {
    const [tpl] = await db
      .insert(templates)
      .values({ name, tradeCategory, description, createdBy: userId, isPublic: true })
      .returning();

    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      const [sect] = await db
        .insert(templateSections)
        .values({ templateId: tpl.id, name: sec.name, sortOrder: si, color: sec.color ?? null })
        .returning();

      for (let ii = 0; ii < sec.items.length; ii++) {
        const it = sec.items[ii];
        await db.insert(templateLineItems).values({
          sectionId: sect.id,
          description: it.description,
          quantity: it.quantity,
          unit: it.unit,
          unitMaterialCost: it.matCost,
          unitLaborCost: it.laborCost,
          laborHours: it.laborHours,
          laborRate: it.laborRate ?? 65,
          wasteFactorPct: it.wastePct ?? 5,
          sortOrder: ii,
        });
      }
    }
  }

  // ── 1. Residential Remodel ─────────────────────────────────────────────────
  await makeTemplate(
    'Residential Remodel',
    'General',
    'Full home interior remodel – demo through finish.',
    [
      {
        name: 'Demolition & Site Prep',
        color: '#ef4444',
        items: [
          { description: 'Selective Demo – Non-bearing walls', quantity: 1, unit: 'LS', matCost: 0, laborCost: 850, laborHours: 13.08, wastePct: 0 },
          { description: 'Haul Away Debris (per load)', quantity: 3, unit: 'EA', matCost: 0, laborCost: 385, laborHours: 5.92, wastePct: 0 },
          { description: 'Dumpster Rental 20-yd (2 weeks)', quantity: 1, unit: 'EA', matCost: 485, laborCost: 0, laborHours: 0, wastePct: 0 },
        ],
      },
      {
        name: 'Framing & Rough Carpentry',
        color: '#f97316',
        items: [
          { description: '2x4 Partition Walls', quantity: 350, unit: 'SF', matCost: 1.42, laborCost: 1.20, laborHours: 0.018 },
          { description: 'Header LVL 3-1/2"x9-1/2"', quantity: 24, unit: 'LF', matCost: 14.50, laborCost: 9.00, laborHours: 0.138 },
          { description: 'Blocking & Backing', quantity: 1, unit: 'LS', matCost: 285, laborCost: 485, laborHours: 7.46 },
        ],
      },
      {
        name: 'Plumbing',
        color: '#3b82f6',
        items: [
          { description: 'Kitchen Plumbing Rough-in', quantity: 1, unit: 'EA', matCost: 485, laborCost: 685, laborHours: 10.54 },
          { description: 'Master Bath Rough-in (3-fixture)', quantity: 1, unit: 'EA', matCost: 685, laborCost: 985, laborHours: 15.15 },
          { description: 'Laundry Stub-outs', quantity: 1, unit: 'EA', matCost: 185, laborCost: 285, laborHours: 4.38 },
        ],
      },
      {
        name: 'Electrical',
        color: '#eab308',
        items: [
          { description: 'Electrical Rough-in – 200A Panel', quantity: 1, unit: 'EA', matCost: 685, laborCost: 485, laborHours: 7.46 },
          { description: '14/2 NM Cable – General Lighting', quantity: 800, unit: 'LF', matCost: 0.38, laborCost: 0.45, laborHours: 0.007 },
          { description: '12/2 NM Cable – Outlet Circuits', quantity: 600, unit: 'LF', matCost: 0.55, laborCost: 0.48, laborHours: 0.007 },
          { description: 'Dedicated Circuits (appliances)', quantity: 6, unit: 'EA', matCost: 85, laborCost: 145, laborHours: 2.23 },
        ],
      },
      {
        name: 'Insulation',
        color: '#22c55e',
        items: [
          { description: 'Batt Insulation R-13 (exterior walls)', quantity: 1400, unit: 'SF', matCost: 0.55, laborCost: 0.28, laborHours: 0.004 },
          { description: 'Blown Fiberglass R-38 (attic)', quantity: 1200, unit: 'SF', matCost: 1.10, laborCost: 0.45, laborHours: 0.007 },
        ],
      },
      {
        name: 'Drywall',
        color: '#a855f7',
        items: [
          { description: '1/2" Drywall – Hang & Tape', quantity: 4200, unit: 'SF', matCost: 0.48, laborCost: 0.85, laborHours: 0.013 },
          { description: '5/8" Moisture-Resistant (baths)', quantity: 420, unit: 'SF', matCost: 0.75, laborCost: 0.90, laborHours: 0.014 },
          { description: 'Level 5 Finish (high-gloss areas)', quantity: 800, unit: 'SF', matCost: 0.15, laborCost: 0.85, laborHours: 0.013 },
        ],
      },
      {
        name: 'Paint',
        color: '#ec4899',
        items: [
          { description: 'Interior Paint – Walls (2 coats)', quantity: 3200, unit: 'SF', matCost: 0.28, laborCost: 0.55, laborHours: 0.008 },
          { description: 'Interior Paint – Ceilings', quantity: 1200, unit: 'SF', matCost: 0.28, laborCost: 0.62, laborHours: 0.010 },
          { description: 'Interior Trim Paint', quantity: 480, unit: 'LF', matCost: 0.18, laborCost: 0.65, laborHours: 0.010 },
        ],
      },
      {
        name: 'Flooring',
        color: '#14b8a6',
        items: [
          { description: 'LVP Flooring – Living Areas', quantity: 950, unit: 'SF', matCost: 2.85, laborCost: 1.45, laborHours: 0.022 },
          { description: 'Ceramic Tile – Baths', quantity: 280, unit: 'SF', matCost: 3.50, laborCost: 4.85, laborHours: 0.075 },
          { description: 'Carpet – Bedrooms', quantity: 48, unit: 'SY', matCost: 28, laborCost: 9.00, laborHours: 0.138 },
        ],
      },
    ]
  );

  // ── 2. Commercial Tenant Improvement ──────────────────────────────────────
  await makeTemplate(
    'Commercial Tenant Improvement',
    'Commercial',
    'Office/retail TI – shell to finished space.',
    [
      {
        name: 'Demolition',
        color: '#ef4444',
        items: [
          { description: 'Demo Existing Partitions', quantity: 1, unit: 'LS', matCost: 0, laborCost: 2850, laborHours: 43.85, wastePct: 0 },
          { description: 'Remove Existing Ceiling Grid & Tile', quantity: 3200, unit: 'SF', matCost: 0, laborCost: 0.35, laborHours: 0.005, wastePct: 0 },
          { description: 'Remove Flooring', quantity: 3200, unit: 'SF', matCost: 0, laborCost: 0.45, laborHours: 0.007, wastePct: 0 },
        ],
      },
      {
        name: 'Framing & Drywall',
        color: '#f97316',
        items: [
          { description: 'Metal Stud Partition Walls 3-5/8"', quantity: 1850, unit: 'SF', matCost: 1.65, laborCost: 1.45, laborHours: 0.022 },
          { description: '5/8" Type X Drywall (2-sides)', quantity: 3700, unit: 'SF', matCost: 0.62, laborCost: 0.90, laborHours: 0.014 },
          { description: 'Drywall Finish Level 4', quantity: 3700, unit: 'SF', matCost: 0.12, laborCost: 0.75, laborHours: 0.012 },
        ],
      },
      {
        name: 'Ceiling',
        color: '#a855f7',
        items: [
          { description: 'Acoustical Tile 2\'x4\' Grid System', quantity: 3200, unit: 'SF', matCost: 2.80, laborCost: 2.20, laborHours: 0.034 },
          { description: 'Drywall Soffits / Bulkheads', quantity: 280, unit: 'SF', matCost: 1.20, laborCost: 2.50, laborHours: 0.038 },
        ],
      },
      {
        name: 'Flooring',
        color: '#14b8a6',
        items: [
          { description: 'Carpet Tile 24"x24" (office areas)', quantity: 240, unit: 'SY', matCost: 32, laborCost: 6.50, laborHours: 0.100 },
          { description: 'Porcelain Tile 12"x24" (entry/break)', quantity: 320, unit: 'SF', matCost: 5.80, laborCost: 5.20, laborHours: 0.080 },
          { description: 'Epoxy Floor Coating (warehouse)', quantity: 800, unit: 'SF', matCost: 0.85, laborCost: 0.65, laborHours: 0.010 },
        ],
      },
      {
        name: 'Paint',
        color: '#ec4899',
        items: [
          { description: 'Interior Paint – Walls', quantity: 5200, unit: 'SF', matCost: 0.28, laborCost: 0.55, laborHours: 0.008 },
          { description: 'Interior Paint – Accent Walls (2 colors)', quantity: 480, unit: 'SF', matCost: 0.32, laborCost: 0.60, laborHours: 0.009 },
        ],
      },
      {
        name: 'Electrical',
        color: '#eab308',
        items: [
          { description: '12/2 NM Cable – Office Circuits', quantity: 1200, unit: 'LF', matCost: 0.55, laborCost: 0.48, laborHours: 0.007 },
          { description: 'GFCI Receptacles (break room)', quantity: 8, unit: 'EA', matCost: 18, laborCost: 32, laborHours: 0.49 },
          { description: 'Duplex Receptacles', quantity: 48, unit: 'EA', matCost: 3.50, laborCost: 28, laborHours: 0.43 },
          { description: 'Fluorescent Troffer 2x4 (2-lamp LED)', quantity: 42, unit: 'EA', matCost: 85, laborCost: 65, laborHours: 1.00 },
          { description: 'Emergency / Exit Lighting', quantity: 8, unit: 'EA', matCost: 145, laborCost: 65, laborHours: 1.00 },
        ],
      },
      {
        name: 'Mechanical',
        color: '#3b82f6',
        items: [
          { description: 'VAV Box with Controls', quantity: 8, unit: 'EA', matCost: 850, laborCost: 485, laborHours: 7.46 },
          { description: 'Flex Duct 8"', quantity: 480, unit: 'LF', matCost: 4.20, laborCost: 4.00, laborHours: 0.062 },
          { description: 'Supply Register 6"x10"', quantity: 24, unit: 'EA', matCost: 18, laborCost: 22, laborHours: 0.34 },
        ],
      },
    ]
  );

  // ── 3. New Residential Construction ───────────────────────────────────────
  await makeTemplate(
    'New Residential Construction',
    'Residential',
    'New single-family home from foundation to finish.',
    [
      {
        name: 'Site Work & Foundation',
        color: '#78716c',
        items: [
          { description: 'Excavation & Backfill', quantity: 1, unit: 'LS', matCost: 0, laborCost: 3850, laborHours: 59.23, wastePct: 0 },
          { description: 'Continuous Footing 16"x10"', quantity: 320, unit: 'LF', matCost: 26, laborCost: 16.50, laborHours: 0.25 },
          { description: '8" Poured Foundation Wall', quantity: 1280, unit: 'SF', matCost: 8.50, laborCost: 6.20, laborHours: 0.095 },
          { description: 'Damp-proofing Foundation', quantity: 1280, unit: 'SF', matCost: 0.65, laborCost: 0.45, laborHours: 0.007 },
          { description: '4" Basement Slab on Grade', quantity: 1400, unit: 'SF', matCost: 3.20, laborCost: 1.85, laborHours: 0.028 },
        ],
      },
      {
        name: 'Framing',
        color: '#f97316',
        items: [
          { description: '2x6 First Floor Walls (16" OC)', quantity: 2800, unit: 'SF', matCost: 1.95, laborCost: 1.35, laborHours: 0.021 },
          { description: 'TJI 360 Floor Joist 11-7/8"', quantity: 1600, unit: 'SF', matCost: 3.20, laborCost: 1.55, laborHours: 0.024 },
          { description: '3/4" T&G Plywood Subfloor', quantity: 1600, unit: 'SF', matCost: 1.45, laborCost: 0.75, laborHours: 0.012 },
          { description: '2x6 Second Floor Walls (16" OC)', quantity: 2200, unit: 'SF', matCost: 1.95, laborCost: 1.35, laborHours: 0.021 },
          { description: '2x6 Roof Rafters (24" OC)', quantity: 1800, unit: 'SF', matCost: 2.10, laborCost: 1.80, laborHours: 0.028 },
          { description: '7/16" OSB Roof Sheathing', quantity: 1800, unit: 'SF', matCost: 0.72, laborCost: 0.55, laborHours: 0.008 },
        ],
      },
      {
        name: 'Roofing',
        color: '#7c3aed',
        items: [
          { description: 'Ice & Water Shield (eaves & valleys)', quantity: 3, unit: 'SQ', matCost: 85, laborCost: 18, laborHours: 0.28 },
          { description: 'Roofing Felt #15', quantity: 16, unit: 'SQ', matCost: 12, laborCost: 8.50, laborHours: 0.130 },
          { description: 'Architectural Shingle 30yr', quantity: 18, unit: 'SQ', matCost: 98, laborCost: 75, laborHours: 1.15 },
          { description: 'Ridge Vent Continuous', quantity: 52, unit: 'LF', matCost: 4.50, laborCost: 3.20, laborHours: 0.049 },
          { description: 'Drip Edge Metal', quantity: 180, unit: 'LF', matCost: 1.20, laborCost: 1.00, laborHours: 0.015 },
        ],
      },
      {
        name: 'Windows & Doors',
        color: '#0ea5e9',
        items: [
          { description: 'Double-Hung Window 3\'x4\'', quantity: 14, unit: 'EA', matCost: 285, laborCost: 110, laborHours: 1.69 },
          { description: 'Casement Window 2\'x4\'', quantity: 6, unit: 'EA', matCost: 310, laborCost: 115, laborHours: 1.77 },
          { description: 'Ext. Fiberglass Entry Door', quantity: 2, unit: 'EA', matCost: 485, laborCost: 185, laborHours: 2.84 },
          { description: 'Sliding Patio Door 6\'0"', quantity: 1, unit: 'EA', matCost: 685, laborCost: 245, laborHours: 3.77 },
          { description: 'Overhead Garage Door 16\'x7\'', quantity: 1, unit: 'EA', matCost: 1650, laborCost: 385, laborHours: 5.92 },
        ],
      },
    ]
  );

  // ── 4. Roofing ─────────────────────────────────────────────────────────────
  await makeTemplate(
    'Roofing – Full Replacement',
    'Roofing',
    'Complete tear-off and replace asphalt shingle roof.',
    [
      {
        name: 'Tear-Off & Disposal',
        color: '#ef4444',
        items: [
          { description: 'Shingle Tear-off (1 layer)', quantity: 1, unit: 'LS', matCost: 0, laborCost: 1250, laborHours: 19.23, wastePct: 0 },
          { description: 'Dumpster Rental', quantity: 1, unit: 'EA', matCost: 385, laborCost: 0, laborHours: 0, wastePct: 0 },
        ],
      },
      {
        name: 'Sheathing Repairs',
        color: '#f97316',
        items: [
          { description: 'Replace Damaged Sheathing 1/2"', quantity: 120, unit: 'SF', matCost: 0.95, laborCost: 1.20, laborHours: 0.018, wastePct: 10 },
          { description: 'Ridge Board Replacement', quantity: 1, unit: 'LS', matCost: 185, laborCost: 285, laborHours: 4.38, wastePct: 0 },
        ],
      },
      {
        name: 'New Roofing',
        color: '#7c3aed',
        items: [
          { description: 'Drip Edge Metal', quantity: 320, unit: 'LF', matCost: 1.20, laborCost: 1.00, laborHours: 0.015 },
          { description: 'Ice & Water Shield (eaves)', quantity: 2, unit: 'SQ', matCost: 85, laborCost: 18, laborHours: 0.28 },
          { description: 'Roofing Felt #15', quantity: 25, unit: 'SQ', matCost: 12, laborCost: 8.50, laborHours: 0.130 },
          { description: 'Architectural Shingle 30yr', quantity: 28, unit: 'SQ', matCost: 98, laborCost: 75, laborHours: 1.15, wastePct: 10 },
          { description: 'Ridge Cap Shingles', quantity: 4, unit: 'SQ', matCost: 115, laborCost: 85, laborHours: 1.31 },
          { description: 'Ridge Vent Continuous', quantity: 62, unit: 'LF', matCost: 4.50, laborCost: 3.20, laborHours: 0.049 },
          { description: 'Lead Pipe Flashing', quantity: 4, unit: 'EA', matCost: 45, laborCost: 38, laborHours: 0.58 },
          { description: 'Step Flashing (chimney)', quantity: 1, unit: 'LS', matCost: 185, laborCost: 245, laborHours: 3.77, wastePct: 0 },
        ],
      },
    ]
  );

  // ── 5. Concrete Flatwork ────────────────────────────────────────────────────
  await makeTemplate(
    'Concrete Flatwork',
    'Concrete',
    'Driveway, patio, walkway, and slab flatwork.',
    [
      {
        name: 'Prep & Subgrade',
        color: '#78716c',
        items: [
          { description: 'Excavation to depth 6" (machine)', quantity: 1, unit: 'LS', matCost: 0, laborCost: 985, laborHours: 15.15, wastePct: 0 },
          { description: 'Compact Subgrade', quantity: 1, unit: 'LS', matCost: 0, laborCost: 385, laborHours: 5.92, wastePct: 0 },
          { description: '4" Compacted Gravel Base', quantity: 850, unit: 'SF', matCost: 0.65, laborCost: 0.45, laborHours: 0.007 },
          { description: '6-mil Vapor Barrier', quantity: 850, unit: 'SF', matCost: 0.12, laborCost: 0.04, laborHours: 0.001 },
        ],
      },
      {
        name: 'Forming & Reinforcing',
        color: '#f97316',
        items: [
          { description: 'Form Boards & Stakes', quantity: 185, unit: 'LF', matCost: 2.20, laborCost: 2.80, laborHours: 0.043 },
          { description: 'WWF 6"x6" W2.9xW2.9', quantity: 850, unit: 'SF', matCost: 0.38, laborCost: 0.18, laborHours: 0.003 },
        ],
      },
      {
        name: 'Concrete Placement',
        color: '#78716c',
        items: [
          { description: '4" Concrete Driveway (3500 PSI)', quantity: 600, unit: 'SF', matCost: 3.40, laborCost: 1.95, laborHours: 0.030 },
          { description: '4" Concrete Patio (3000 PSI)', quantity: 250, unit: 'SF', matCost: 3.20, laborCost: 1.85, laborHours: 0.028 },
          { description: 'Exposed Aggregate Finish (patio)', quantity: 250, unit: 'SF', matCost: 0.65, laborCost: 1.20, laborHours: 0.018 },
          { description: 'Broom Finish (driveway)', quantity: 600, unit: 'SF', matCost: 0, laborCost: 0.38, laborHours: 0.006, wastePct: 0 },
          { description: 'Control Joints (saw-cut)', quantity: 185, unit: 'LF', matCost: 0, laborCost: 0.85, laborHours: 0.013, wastePct: 0 },
          { description: 'Concrete Sealer', quantity: 850, unit: 'SF', matCost: 0.28, laborCost: 0.22, laborHours: 0.003 },
        ],
      },
    ]
  );

  // ── 6. Electrical Rough-In ─────────────────────────────────────────────────
  await makeTemplate(
    'Electrical Rough-In',
    'Electrical',
    'New construction electrical rough-in for single-family home.',
    [
      {
        name: 'Service & Panel',
        color: '#eab308',
        items: [
          { description: '200A Main Service Panel', quantity: 1, unit: 'EA', matCost: 685, laborCost: 485, laborHours: 7.46 },
          { description: 'Ground Rod & Clamp', quantity: 2, unit: 'EA', matCost: 22, laborCost: 55, laborHours: 0.85 },
          { description: 'Service Entrance Conduit', quantity: 1, unit: 'LS', matCost: 285, laborCost: 385, laborHours: 5.92 },
        ],
      },
      {
        name: 'Circuits & Wiring',
        color: '#eab308',
        items: [
          { description: '14/2 NM Cable – Lighting Circuits', quantity: 1200, unit: 'LF', matCost: 0.38, laborCost: 0.45, laborHours: 0.007 },
          { description: '12/2 NM Cable – General Receptacles', quantity: 800, unit: 'LF', matCost: 0.55, laborCost: 0.48, laborHours: 0.007 },
          { description: '10/3 NM Cable – Dryer Circuit', quantity: 45, unit: 'LF', matCost: 1.45, laborCost: 0.55, laborHours: 0.008 },
          { description: 'Dedicated Circuit 20A (appliances)', quantity: 8, unit: 'EA', matCost: 85, laborCost: 145, laborHours: 2.23 },
          { description: 'Dedicated Circuit 20A (HVAC disconnect)', quantity: 2, unit: 'EA', matCost: 85, laborCost: 145, laborHours: 2.23 },
        ],
      },
      {
        name: 'Devices (Rough-In Boxes)',
        color: '#eab308',
        items: [
          { description: 'Single Gang Box – Switches', quantity: 28, unit: 'EA', matCost: 1.20, laborCost: 8.50, laborHours: 0.130 },
          { description: 'Single Gang Box – Receptacles', quantity: 42, unit: 'EA', matCost: 1.20, laborCost: 8.50, laborHours: 0.130 },
          { description: 'Smoke Detector Box & Run', quantity: 8, unit: 'EA', matCost: 38, laborCost: 45, laborHours: 0.69 },
          { description: 'CO Detector Box & Run', quantity: 2, unit: 'EA', matCost: 55, laborCost: 45, laborHours: 0.69 },
        ],
      },
    ]
  );

  // ── 7. Painting – Interior ─────────────────────────────────────────────────
  await makeTemplate(
    'Interior Painting',
    'Painting',
    'Full interior repaint – prep, prime, and finish.',
    [
      {
        name: 'Preparation',
        color: '#ec4899',
        items: [
          { description: 'Patch & Repair – Drywall', quantity: 1, unit: 'LS', matCost: 185, laborCost: 285, laborHours: 4.38, wastePct: 0 },
          { description: 'Caulking – Trim & Gaps', quantity: 480, unit: 'LF', matCost: 0.18, laborCost: 0.35, laborHours: 0.005 },
          { description: 'Masking & Drop Cloths', quantity: 1, unit: 'LS', matCost: 65, laborCost: 185, laborHours: 2.85, wastePct: 0 },
          { description: 'Primer Coat – Walls', quantity: 2800, unit: 'SF', matCost: 0.18, laborCost: 0.35, laborHours: 0.005 },
        ],
      },
      {
        name: 'Wall Paint',
        color: '#ec4899',
        items: [
          { description: 'Interior Paint – Walls (2 coats)', quantity: 2800, unit: 'SF', matCost: 0.28, laborCost: 0.55, laborHours: 0.008 },
          { description: 'Accent Wall – Walls (3 coats)', quantity: 320, unit: 'SF', matCost: 0.38, laborCost: 0.70, laborHours: 0.011 },
        ],
      },
      {
        name: 'Ceilings',
        color: '#ec4899',
        items: [
          { description: 'Interior Paint – Ceilings (2 coats)', quantity: 1200, unit: 'SF', matCost: 0.28, laborCost: 0.62, laborHours: 0.010 },
        ],
      },
      {
        name: 'Trim & Doors',
        color: '#ec4899',
        items: [
          { description: 'Trim Paint – Baseboards (2 coats)', quantity: 480, unit: 'LF', matCost: 0.18, laborCost: 0.65, laborHours: 0.010 },
          { description: 'Trim Paint – Door Casings (2 coats)', quantity: 220, unit: 'LF', matCost: 0.18, laborCost: 0.65, laborHours: 0.010 },
          { description: 'Door Paint – Hollow Core (2 coats)', quantity: 14, unit: 'EA', matCost: 18, laborCost: 45, laborHours: 0.69 },
        ],
      },
    ]
  );

  // ── 8. HVAC Install ────────────────────────────────────────────────────────
  await makeTemplate(
    'HVAC Installation',
    'HVAC',
    'Full HVAC system install – split system with ductwork.',
    [
      {
        name: 'Equipment',
        color: '#3b82f6',
        items: [
          { description: 'Split System AC 3-ton Condensing Unit', quantity: 1, unit: 'EA', matCost: 1850, laborCost: 485, laborHours: 7.46 },
          { description: 'Air Handler 3-ton (fan coil)', quantity: 1, unit: 'EA', matCost: 985, laborCost: 385, laborHours: 5.92 },
          { description: 'Gas Furnace 80,000 BTU 80% AFUE', quantity: 1, unit: 'EA', matCost: 1250, laborCost: 485, laborHours: 7.46 },
          { description: 'Smart Thermostat WiFi', quantity: 1, unit: 'EA', matCost: 185, laborCost: 65, laborHours: 1.00 },
        ],
      },
      {
        name: 'Ductwork',
        color: '#3b82f6',
        items: [
          { description: 'Rigid Ductwork 12"x6" Main Trunk', quantity: 48, unit: 'LF', matCost: 8.50, laborCost: 9.00, laborHours: 0.138 },
          { description: 'Flex Duct 6" Branches', quantity: 320, unit: 'LF', matCost: 3.20, laborCost: 3.50, laborHours: 0.054 },
          { description: 'Supply Register 4"x10"', quantity: 18, unit: 'EA', matCost: 12, laborCost: 18, laborHours: 0.28 },
          { description: 'Return Air Grille 16"x20"', quantity: 4, unit: 'EA', matCost: 22, laborCost: 22, laborHours: 0.34 },
          { description: 'Return Air Plenum Box', quantity: 1, unit: 'EA', matCost: 185, laborCost: 285, laborHours: 4.38 },
          { description: 'Duct Insulation (flex duct wrap)', quantity: 320, unit: 'LF', matCost: 1.20, laborCost: 0.85, laborHours: 0.013 },
        ],
      },
      {
        name: 'Connections & Startup',
        color: '#3b82f6',
        items: [
          { description: 'Refrigerant Line Set 3/8"x3/4" 25\'', quantity: 1, unit: 'EA', matCost: 285, laborCost: 185, laborHours: 2.85 },
          { description: 'Condensate Drain Line', quantity: 25, unit: 'LF', matCost: 1.80, laborCost: 2.20, laborHours: 0.034 },
          { description: 'Electrical Disconnect 60A', quantity: 1, unit: 'EA', matCost: 85, laborCost: 65, laborHours: 1.00 },
          { description: 'System Startup & Commissioning', quantity: 1, unit: 'LS', matCost: 0, laborCost: 485, laborHours: 7.46, wastePct: 0 },
          { description: 'Refrigerant Charge (R-410A, per lb)', quantity: 12, unit: 'LB', matCost: 18, laborCost: 12, laborHours: 0.18 },
        ],
      },
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample Projects
// ─────────────────────────────────────────────────────────────────────────────
async function seedProjects(userId: number, _catIds: Map<string, number>) {
  // ── Project 1: Won – Kitchen & Bath Remodel ────────────────────────────────
  const [proj1] = await db
    .insert(projects)
    .values({
      name: 'Hernandez Kitchen & Bath Remodel',
      clientName: 'Carlos Hernandez',
      clientEmail: 'carlos.h@example.com',
      clientPhone: '(512) 555-1001',
      siteAddress: '4521 Oak Creek Dr, Austin, TX 78745',
      description: 'Full kitchen gut-remodel plus master bath renovation. Client wants high-end finishes – quartz counters, custom cabinets, tile shower.',
      status: 'won',
      bidDueDate: '2024-02-15T17:00:00Z',
      startDate: '2024-03-01T08:00:00Z',
      endDate: '2024-05-31T17:00:00Z',
      createdBy: userId,
    })
    .returning();

  const [est1] = await db
    .insert(estimates)
    .values({
      projectId: proj1.id,
      name: 'Base Estimate v1',
      version: 1,
      isActive: true,
      overheadPct: 15,
      profitPct: 12,
      taxPct: 0,
      bondPct: 0,
      notes: 'Includes allowance for custom cabinets. Tile allowance $7/SF.',
      createdBy: userId,
    })
    .returning();

  // Sections and line items for project 1
  const [sec1a] = await db.insert(estimateSections).values({ estimateId: est1.id, name: 'Demolition', sortOrder: 0, color: '#ef4444' }).returning();
  const [sec1b] = await db.insert(estimateSections).values({ estimateId: est1.id, name: 'Framing & Rough Carpentry', sortOrder: 1, color: '#f97316' }).returning();
  const [sec1c] = await db.insert(estimateSections).values({ estimateId: est1.id, name: 'Plumbing', sortOrder: 2, color: '#3b82f6' }).returning();
  const [sec1d] = await db.insert(estimateSections).values({ estimateId: est1.id, name: 'Electrical', sortOrder: 3, color: '#eab308' }).returning();
  const [sec1e] = await db.insert(estimateSections).values({ estimateId: est1.id, name: 'Finishes', sortOrder: 4, color: '#a855f7' }).returning();

  type LI = { description: string; qty: number; unit: string; matCost: number; laborCost: number; laborHours: number; wastePct?: number };
  const li = async (sectionId: number, items: LI[]) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await db.insert(estimateLineItems).values({
        sectionId,
        estimateId: est1.id,
        description: it.description,
        quantity: it.qty,
        unit: it.unit,
        unitMaterialCost: it.matCost,
        unitLaborCost: it.laborCost,
        laborHours: it.laborHours,
        laborRate: 65,
        wasteFactorPct: it.wastePct ?? 5,
        sortOrder: i,
      });
    }
  };

  await li(sec1a.id, [
    { description: 'Remove Existing Kitchen Cabinets', qty: 1, unit: 'LS', matCost: 0, laborCost: 385, laborHours: 5.92, wastePct: 0 },
    { description: 'Remove Existing Countertops', qty: 1, unit: 'LS', matCost: 0, laborCost: 185, laborHours: 2.85, wastePct: 0 },
    { description: 'Remove Existing Tile Flooring', qty: 220, unit: 'SF', matCost: 0, laborCost: 0.85, laborHours: 0.013, wastePct: 0 },
    { description: 'Demo Existing Bath Tile', qty: 185, unit: 'SF', matCost: 0, laborCost: 1.20, laborHours: 0.018, wastePct: 0 },
    { description: 'Dumpster Rental 15-yd', qty: 1, unit: 'EA', matCost: 385, laborCost: 0, laborHours: 0, wastePct: 0 },
  ]);
  await li(sec1b.id, [
    { description: '2x4 Partition Wall – Kitchen', qty: 48, unit: 'SF', matCost: 1.42, laborCost: 1.20, laborHours: 0.018 },
    { description: 'LVL Header 3-1/2"x9-1/2"', qty: 8, unit: 'LF', matCost: 14.50, laborCost: 9.00, laborHours: 0.138 },
    { description: 'Cabinet Backing & Blocking', qty: 1, unit: 'LS', matCost: 185, laborCost: 285, laborHours: 4.38, wastePct: 0 },
  ]);
  await li(sec1c.id, [
    { description: 'Kitchen Sink Rough-in', qty: 1, unit: 'EA', matCost: 185, laborCost: 285, laborHours: 4.38, wastePct: 0 },
    { description: 'Dishwasher Supply & Drain', qty: 1, unit: 'EA', matCost: 85, laborCost: 145, laborHours: 2.23, wastePct: 0 },
    { description: 'Master Bath Rough-in (3-fixture)', qty: 1, unit: 'EA', matCost: 685, laborCost: 985, laborHours: 15.15, wastePct: 0 },
    { description: 'Toilet Supply & Wax Ring', qty: 1, unit: 'EA', matCost: 285, laborCost: 145, laborHours: 2.23, wastePct: 0 },
    { description: 'Kitchen Pull-out Faucet', qty: 1, unit: 'EA', matCost: 285, laborCost: 95, laborHours: 1.46, wastePct: 0 },
    { description: 'Bath Single-Handle Faucet', qty: 2, unit: 'EA', matCost: 145, laborCost: 85, laborHours: 1.31, wastePct: 0 },
  ]);
  await li(sec1d.id, [
    { description: 'Kitchen Dedicated Circuits (4)', qty: 4, unit: 'EA', matCost: 85, laborCost: 145, laborHours: 2.23 },
    { description: 'Under-cabinet LED Lighting', qty: 18, unit: 'LF', matCost: 8.50, laborCost: 5.50, laborHours: 0.085 },
    { description: 'Recessed Light 6" LED – Kitchen', qty: 8, unit: 'EA', matCost: 45, laborCost: 65, laborHours: 1.00 },
    { description: 'Bath Exhaust Fan w/ Light', qty: 2, unit: 'EA', matCost: 95, laborCost: 85, laborHours: 1.31 },
    { description: 'GFCI Receptacles', qty: 6, unit: 'EA', matCost: 18, laborCost: 32, laborHours: 0.49 },
  ]);
  await li(sec1e.id, [
    { description: 'Kitchen Cabinet – Base (per LF)', qty: 22, unit: 'LF', matCost: 285, laborCost: 145, laborHours: 2.23 },
    { description: 'Quartz Countertop 3/4"', qty: 68, unit: 'SF', matCost: 72, laborCost: 22, laborHours: 0.34 },
    { description: 'Subway Tile Backsplash 3"x6"', qty: 42, unit: 'SF', matCost: 4.50, laborCost: 5.80, laborHours: 0.089 },
    { description: 'Porcelain Floor Tile 12"x24" – Kitchen', qty: 220, unit: 'SF', matCost: 5.80, laborCost: 5.20, laborHours: 0.080 },
    { description: 'Bathroom Vanity 48"', qty: 1, unit: 'EA', matCost: 685, laborCost: 185, laborHours: 2.84, wastePct: 0 },
    { description: 'KERDI Waterproof Membrane – Shower', qty: 85, unit: 'SF', matCost: 3.50, laborCost: 1.85, laborHours: 0.028 },
    { description: 'Ceramic Wall Tile 4"x4" – Shower', qty: 145, unit: 'SF', matCost: 3.20, laborCost: 5.50, laborHours: 0.085 },
    { description: 'Interior Paint – Kitchen/Bath', qty: 1200, unit: 'SF', matCost: 0.28, laborCost: 0.55, laborHours: 0.008 },
  ]);

  await db.insert(projectActivityLog).values([
    { projectId: proj1.id, userId, action: 'project_created', detail: 'Project created' },
    { projectId: proj1.id, userId, action: 'estimate_created', detail: 'Estimate "Base Estimate v1" created' },
    { projectId: proj1.id, userId, action: 'status_changed', detail: 'Status changed from submitted to won' },
  ]);

  // ── Project 2: Submitted – Office TI ──────────────────────────────────────
  const [proj2] = await db
    .insert(projects)
    .values({
      name: 'Lakeline Office TI – Suite 200',
      clientName: 'Bright Horizons Consulting',
      clientEmail: 'facilities@brighthorizons.example',
      clientPhone: '(512) 555-2001',
      siteAddress: '12500 Lakeline Blvd, Suite 200, Cedar Park, TX 78613',
      description: '3,200 SF office TI in existing shell. Open office plan, 2 private offices, conference room, break room.',
      status: 'submitted',
      bidDueDate: '2024-03-22T17:00:00Z',
      startDate: null,
      endDate: null,
      createdBy: userId,
    })
    .returning();

  const [est2] = await db
    .insert(estimates)
    .values({
      projectId: proj2.id,
      name: 'Base Bid',
      version: 1,
      isActive: true,
      overheadPct: 15,
      profitPct: 10,
      taxPct: 0,
      bondPct: 1,
      notes: 'Bid per issued drawings dated 2024-02-28. Excludes FF&E.',
      createdBy: userId,
    })
    .returning();

  const [sec2a] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'General Conditions', sortOrder: 0, color: '#64748b' }).returning();
  const [sec2b] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'Framing & Drywall', sortOrder: 1, color: '#f97316' }).returning();
  const [sec2c] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'Ceiling', sortOrder: 2, color: '#a855f7' }).returning();
  const [sec2d] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'Flooring', sortOrder: 3, color: '#14b8a6' }).returning();
  const [sec2e] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'Paint', sortOrder: 4, color: '#ec4899' }).returning();
  const [sec2f] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'Electrical', sortOrder: 5, color: '#eab308' }).returning();
  const [sec2g] = await db.insert(estimateSections).values({ estimateId: est2.id, name: 'Mechanical', sortOrder: 6, color: '#3b82f6' }).returning();

  const li2 = async (sectionId: number, items: LI[]) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await db.insert(estimateLineItems).values({
        sectionId,
        estimateId: est2.id,
        description: it.description,
        quantity: it.qty,
        unit: it.unit,
        unitMaterialCost: it.matCost,
        unitLaborCost: it.laborCost,
        laborHours: it.laborHours,
        laborRate: 65,
        wasteFactorPct: it.wastePct ?? 5,
        sortOrder: i,
      });
    }
  };

  await li2(sec2a.id, [
    { description: 'Project Management / Supervision (8 weeks)', qty: 8, unit: 'WK', matCost: 0, laborCost: 850, laborHours: 13.08, wastePct: 0 },
    { description: 'Permits & Fees', qty: 1, unit: 'LS', matCost: 2850, laborCost: 0, laborHours: 0, wastePct: 0 },
    { description: 'Temporary Protection & Hoarding', qty: 1, unit: 'LS', matCost: 485, laborCost: 385, laborHours: 5.92, wastePct: 0 },
    { description: 'Dumpster Rental (2x 20-yd)', qty: 2, unit: 'EA', matCost: 485, laborCost: 0, laborHours: 0, wastePct: 0 },
  ]);
  await li2(sec2b.id, [
    { description: 'Metal Stud Partition Wall 3-5/8"', qty: 1850, unit: 'SF', matCost: 1.65, laborCost: 1.45, laborHours: 0.022 },
    { description: '5/8" Type X Drywall (2-sides)', qty: 3700, unit: 'SF', matCost: 0.62, laborCost: 0.90, laborHours: 0.014 },
    { description: 'Drywall Finish Level 4', qty: 3700, unit: 'SF', matCost: 0.12, laborCost: 0.75, laborHours: 0.012 },
    { description: 'Corner Bead Metal', qty: 185, unit: 'LF', matCost: 0.35, laborCost: 0.45, laborHours: 0.007 },
    { description: 'Int. Solid Core Door 3068 w/ frame', qty: 5, unit: 'EA', matCost: 285, laborCost: 110, laborHours: 1.69, wastePct: 0 },
    { description: 'Passage Lockset – Lever', qty: 5, unit: 'EA', matCost: 45, laborCost: 28, laborHours: 0.43, wastePct: 0 },
  ]);
  await li2(sec2c.id, [
    { description: 'Acoustical Tile 2\'x4\' (existing grid reuse)', qty: 2800, unit: 'SF', matCost: 1.80, laborCost: 1.45, laborHours: 0.022 },
    { description: 'New Grid System 2\'x4\'', qty: 400, unit: 'SF', matCost: 2.80, laborCost: 2.20, laborHours: 0.034 },
    { description: 'Drywall Soffit – Reception', qty: 185, unit: 'SF', matCost: 1.20, laborCost: 2.50, laborHours: 0.038 },
  ]);
  await li2(sec2d.id, [
    { description: 'Carpet Tile 24"x24" – Open Office', qty: 210, unit: 'SY', matCost: 32, laborCost: 6.50, laborHours: 0.100 },
    { description: 'Porcelain Tile 12"x24" – Entry/Break', qty: 285, unit: 'SF', matCost: 5.80, laborCost: 5.20, laborHours: 0.080 },
    { description: 'Epoxy Floor – Server Room', qty: 120, unit: 'SF', matCost: 0.85, laborCost: 0.65, laborHours: 0.010 },
    { description: 'Tile Grout & Sealer', qty: 285, unit: 'SF', matCost: 0.55, laborCost: 0.45, laborHours: 0.007 },
  ]);
  await li2(sec2e.id, [
    { description: 'Interior Paint – Walls (2 coats)', qty: 4800, unit: 'SF', matCost: 0.28, laborCost: 0.55, laborHours: 0.008 },
    { description: 'Accent Color – Feature Wall', qty: 320, unit: 'SF', matCost: 0.38, laborCost: 0.60, laborHours: 0.009 },
    { description: 'Interior Trim Paint', qty: 380, unit: 'LF', matCost: 0.18, laborCost: 0.65, laborHours: 0.010 },
  ]);
  await li2(sec2f.id, [
    { description: 'Fluorescent 2x4 Troffer (LED retrofit)', qty: 42, unit: 'EA', matCost: 85, laborCost: 65, laborHours: 1.00 },
    { description: 'Emergency / Exit Lighting', qty: 8, unit: 'EA', matCost: 145, laborCost: 65, laborHours: 1.00 },
    { description: 'Duplex Receptacle 15A', qty: 48, unit: 'EA', matCost: 3.50, laborCost: 28, laborHours: 0.43 },
    { description: 'GFCI Receptacle (break room)', qty: 8, unit: 'EA', matCost: 18, laborCost: 32, laborHours: 0.49 },
    { description: '12/2 NM Cable – Office', qty: 1200, unit: 'LF', matCost: 0.55, laborCost: 0.48, laborHours: 0.007 },
    { description: 'Single Pole Switch 15A', qty: 18, unit: 'EA', matCost: 4.50, laborCost: 22, laborHours: 0.34 },
  ]);
  await li2(sec2g.id, [
    { description: 'VAV Box with Controls', qty: 8, unit: 'EA', matCost: 850, laborCost: 485, laborHours: 7.46 },
    { description: 'Flex Duct 8" Branches', qty: 480, unit: 'LF', matCost: 4.20, laborCost: 4.00, laborHours: 0.062 },
    { description: 'Supply Register 6"x10"', qty: 24, unit: 'EA', matCost: 18, laborCost: 22, laborHours: 0.34 },
    { description: 'Return Air Grille 16"x20"', qty: 6, unit: 'EA', matCost: 22, laborCost: 22, laborHours: 0.34 },
  ]);

  await db.insert(projectActivityLog).values([
    { projectId: proj2.id, userId, action: 'project_created', detail: 'Project created' },
    { projectId: proj2.id, userId, action: 'estimate_created', detail: 'Estimate "Base Bid" created' },
    { projectId: proj2.id, userId, action: 'status_changed', detail: 'Status changed from bidding to submitted' },
  ]);

  // ── Project 3: Draft – New Garage ──────────────────────────────────────────
  const [proj3] = await db
    .insert(projects)
    .values({
      name: 'Wilson Detached Garage 24\'x24\'',
      clientName: 'James Wilson',
      clientEmail: 'jwilson@example.com',
      clientPhone: '(512) 555-3001',
      siteAddress: '8822 Mopac Expy, Austin, TX 78759',
      description: 'Detached 2-car garage, slab on grade, framed, drywalled interior, one service door and one 16\' overhead door.',
      status: 'draft',
      bidDueDate: '2024-04-30T17:00:00Z',
      startDate: null,
      endDate: null,
      createdBy: userId,
    })
    .returning();

  const [est3] = await db
    .insert(estimates)
    .values({
      projectId: proj3.id,
      name: 'Preliminary Estimate',
      version: 1,
      isActive: true,
      overheadPct: 15,
      profitPct: 10,
      taxPct: 0,
      bondPct: 0,
      notes: 'Draft – pending site visit confirmation.',
      createdBy: userId,
    })
    .returning();

  const [sec3a] = await db.insert(estimateSections).values({ estimateId: est3.id, name: 'Foundation', sortOrder: 0, color: '#78716c' }).returning();
  const [sec3b] = await db.insert(estimateSections).values({ estimateId: est3.id, name: 'Framing', sortOrder: 1, color: '#f97316' }).returning();
  const [sec3c] = await db.insert(estimateSections).values({ estimateId: est3.id, name: 'Roofing', sortOrder: 2, color: '#7c3aed' }).returning();
  const [sec3d] = await db.insert(estimateSections).values({ estimateId: est3.id, name: 'Siding & Trim', sortOrder: 3, color: '#22c55e' }).returning();
  const [sec3e] = await db.insert(estimateSections).values({ estimateId: est3.id, name: 'Electrical', sortOrder: 4, color: '#eab308' }).returning();

  const li3 = async (sectionId: number, items: LI[]) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await db.insert(estimateLineItems).values({
        sectionId,
        estimateId: est3.id,
        description: it.description,
        quantity: it.qty,
        unit: it.unit,
        unitMaterialCost: it.matCost,
        unitLaborCost: it.laborCost,
        laborHours: it.laborHours,
        laborRate: 65,
        wasteFactorPct: it.wastePct ?? 5,
        sortOrder: i,
      });
    }
  };

  await li3(sec3a.id, [
    { description: 'Excavation & Grading', qty: 1, unit: 'LS', matCost: 0, laborCost: 985, laborHours: 15.15, wastePct: 0 },
    { description: 'Continuous Footing 12"x8"', qty: 96, unit: 'LF', matCost: 18.50, laborCost: 12.00, laborHours: 0.18 },
    { description: '4" Slab on Grade (3500 PSI)', qty: 576, unit: 'SF', matCost: 3.40, laborCost: 1.95, laborHours: 0.030 },
    { description: '6-mil Vapor Barrier', qty: 576, unit: 'SF', matCost: 0.12, laborCost: 0.04, laborHours: 0.001 },
    { description: 'Anchor Bolts 1/2"x12"', qty: 24, unit: 'EA', matCost: 1.85, laborCost: 1.20, laborHours: 0.018 },
  ]);
  await li3(sec3b.id, [
    { description: 'Pressure Treated Sill Plate 2x6', qty: 96, unit: 'LF', matCost: 1.85, laborCost: 0.85, laborHours: 0.013 },
    { description: '2x6 Wall Framing (16" OC)', qty: 1280, unit: 'SF', matCost: 1.95, laborCost: 1.35, laborHours: 0.021 },
    { description: '7/16" OSB Wall Sheathing', qty: 1280, unit: 'SF', matCost: 0.72, laborCost: 0.55, laborHours: 0.008 },
    { description: '2x6 Roof Rafters (24" OC)', qty: 650, unit: 'SF', matCost: 2.10, laborCost: 1.80, laborHours: 0.028 },
    { description: '1/2" Plywood Roof Sheathing', qty: 650, unit: 'SF', matCost: 0.95, laborCost: 0.60, laborHours: 0.009 },
    { description: 'Overhead Garage Door 16\'x7\' Insulated', qty: 1, unit: 'EA', matCost: 1650, laborCost: 385, laborHours: 5.92, wastePct: 0 },
    { description: 'Ext. Steel Service Door 3068', qty: 1, unit: 'EA', matCost: 320, laborCost: 175, laborHours: 2.69, wastePct: 0 },
  ]);
  await li3(sec3c.id, [
    { description: 'Drip Edge Metal', qty: 120, unit: 'LF', matCost: 1.20, laborCost: 1.00, laborHours: 0.015 },
    { description: 'Roofing Felt #15', qty: 7, unit: 'SQ', matCost: 12, laborCost: 8.50, laborHours: 0.130 },
    { description: 'Architectural Shingle 30yr', qty: 7.5, unit: 'SQ', matCost: 98, laborCost: 75, laborHours: 1.15 },
    { description: 'Ridge Cap Shingles', qty: 1, unit: 'SQ', matCost: 115, laborCost: 85, laborHours: 1.31 },
  ]);
  await li3(sec3d.id, [
    { description: 'House Wrap (Tyvek)', qty: 1280, unit: 'SF', matCost: 0.22, laborCost: 0.18, laborHours: 0.003 },
    { description: 'Vinyl Lap Siding', qty: 1280, unit: 'SF', matCost: 1.85, laborCost: 1.65, laborHours: 0.025 },
    { description: 'Corner Trim Vinyl', qty: 40, unit: 'LF', matCost: 2.20, laborCost: 1.50, laborHours: 0.023 },
    { description: 'Fascia Board 2x8 painted', qty: 96, unit: 'LF', matCost: 3.50, laborCost: 2.20, laborHours: 0.034 },
  ]);
  await li3(sec3e.id, [
    { description: 'Sub-panel 100A', qty: 1, unit: 'EA', matCost: 385, laborCost: 285, laborHours: 4.38, wastePct: 0 },
    { description: '12/2 NM Cable – General', qty: 180, unit: 'LF', matCost: 0.55, laborCost: 0.48, laborHours: 0.007 },
    { description: 'Duplex Receptacles 15A', qty: 6, unit: 'EA', matCost: 3.50, laborCost: 28, laborHours: 0.43, wastePct: 0 },
    { description: 'Garage Door Opener Circuit', qty: 1, unit: 'EA', matCost: 85, laborCost: 145, laborHours: 2.23, wastePct: 0 },
    { description: 'Fluorescent 2x4 Troffer (LED)', qty: 3, unit: 'EA', matCost: 85, laborCost: 65, laborHours: 1.00, wastePct: 0 },
  ]);

  await db.insert(projectActivityLog).values([
    { projectId: proj3.id, userId, action: 'project_created', detail: 'Project created' },
    { projectId: proj3.id, userId, action: 'estimate_created', detail: 'Estimate "Preliminary Estimate" created' },
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
