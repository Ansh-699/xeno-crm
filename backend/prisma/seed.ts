import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ========== Seeded PRNG (Mulberry32) ==========
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ========== Data Constants ==========
const FIRST_NAMES = [
  "Aarav", "Aditi", "Aisha", "Amit", "Ananya", "Arjun", "Bhavna", "Chetan",
  "Deepa", "Devika", "Dhruv", "Divya", "Gaurav", "Hari", "Ishaan", "Jaya",
  "Karan", "Kavya", "Lakshmi", "Manish", "Meera", "Mohit", "Neha", "Nikhil",
  "Pallavi", "Pooja", "Priya", "Rahul", "Rajesh", "Ravi", "Rekha", "Rohit",
  "Sakshi", "Sandeep", "Sanjay", "Shreya", "Sneha", "Sonal", "Sunil", "Tanvi",
  "Usha", "Varun", "Vidya", "Vikram", "Vinay", "Vivek", "Yash", "Zara",
  "Aditya", "Anjali", "Ashwin", "Bharat", "Chandni", "Daksha", "Esha", "Farhan",
  "Gauri", "Himanshu", "Isha", "Jayesh", "Kiara", "Lata", "Madhav", "Nandini",
  "Om", "Padma", "Radhika", "Sahil", "Tara", "Uma", "Vani", "Wasim",
  "Yashika", "Zoya", "Abhi", "Bindu", "Chirag", "Diya", "Ekta", "Firoz",
  "Gita", "Harsh", "Ira", "Jai", "Komal", "Lalit", "Mira", "Naveen",
  "Ojas", "Preeti", "Qasim", "Rina", "Siddharth", "Trisha", "Urvi", "Ved",
  "Waris", "Yamini", "Zubin", "Akash",
];

const LAST_NAMES = [
  "Agarwal", "Bhat", "Chakraborty", "Das", "Deshmukh", "Dutta", "Ghosh",
  "Gupta", "Iyer", "Jain", "Joshi", "Kapoor", "Khan", "Kumar", "Malhotra",
  "Mehta", "Mishra", "Mukherjee", "Nair", "Patel", "Pillai", "Rao", "Reddy",
  "Roy", "Saxena", "Sharma", "Singh", "Sinha", "Srivastava", "Thakur",
  "Tiwari", "Trivedi", "Verma", "Yadav", "Banerjee", "Bhatt", "Choudhury",
  "Dubey", "Fernandez", "Gill", "Hegde", "Iyengar", "Kulkarni", "Menon",
  "Naidu", "Pandey", "Rajan", "Sethi", "Talwar", "Uppal",
];

const CITIES = [
  "Delhi", "Mumbai", "Bangalore", "Hyderabad", "Pune", "Chennai", "Kolkata", "Jaipur",
];

const PRODUCTS = [
  { name: "Latte", price: 280 },
  { name: "Cold Brew", price: 320 },
  { name: "Cappuccino", price: 250 },
  { name: "Croissant", price: 180 },
  { name: "Espresso", price: 200 },
  { name: "Mocha", price: 300 },
  { name: "Flat White", price: 290 },
];

const CHANNELS = ["online", "in-store", "app"];

// ========== Generate Customers ==========
function generateCustomers(count: number) {
  const customers: any[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const city = pick(CITIES);

    // Determine contact info distribution
    const r = rand();
    let email: string | null = null;
    let phone: string | null = null;

    if (r < 0.15) {
      // Phone only (15%)
      phone = `+91${randInt(7000000000, 9999999999)}`;
    } else if (r < 0.25) {
      // Email only (10%)
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 999)}@${pick(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"])}`;
    } else {
      // Both (75%)
      email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 999)}@${pick(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"])}`;
      phone = `+91${randInt(7000000000, 9999999999)}`;
    }

    // ~8% opted out
    const optedOut = rand() < 0.08;

    customers.push({
      name,
      email,
      phone,
      city,
      optedOut,
      attributes: {
        source: pick(["walk-in", "instagram", "google", "referral", "zomato"]),
        tier: pick(["bronze", "silver", "gold"]),
      },
    });
  }

  return customers;
}

// ========== Generate Orders ==========
function generateOrders(customerIds: string[], count: number) {
  const orders: any[] = [];
  const now = new Date("2025-06-01T00:00:00Z");
  const sixMonthsAgo = new Date("2024-12-01T00:00:00Z");
  const threeMonthsAgo = new Date("2025-03-01T00:00:00Z");
  const oneMonthAgo = new Date("2025-05-01T00:00:00Z");

  // Behavioral segments
  // ~200 loyalists: 50+ orders each → ~200 * 50 = 10000 (we'll cap to fit 8000 total)
  // ~500 regulars: 6-12 orders each → ~500 * 9 = 4500
  // ~800 at-risk: 1-3 orders, all before 3 months ago
  // ~300 new: 1-5 orders in last 30 days
  // ~200 one-time: exactly 1 order
  // Total customers assigned: 200+500+800+300+200 = 2000

  const shuffled = shuffle(customerIds);

  const loyalists = shuffled.slice(0, 200);
  const regulars = shuffled.slice(200, 700);
  const atRisk = shuffled.slice(700, 1500);
  const newCustomers = shuffled.slice(1500, 1800);
  const oneTime = shuffled.slice(1800, 2000);

  // Helper to generate a random date in range
  function randomDate(start: Date, end: Date): Date {
    const s = start.getTime();
    const e = end.getTime();
    return new Date(s + rand() * (e - s));
  }

  function makeOrder(customerId: string, date: Date) {
    const numProducts = randInt(1, 3);
    const selectedProducts: string[] = [];
    let amount = 0;
    for (let p = 0; p < numProducts; p++) {
      const product = pick(PRODUCTS);
      selectedProducts.push(product.name);
      amount += product.price;
    }
    orders.push({
      customerId,
      amount,
      products: selectedProducts,
      channel: pick(CHANNELS),
      orderedAt: date,
    });
  }

  // Loyalists: distribute orders to hit target count
  for (const cid of loyalists) {
    const numOrders = randInt(20, 30); // Will get us ~200*25 = 5000
    for (let j = 0; j < numOrders; j++) {
      makeOrder(cid, randomDate(sixMonthsAgo, now));
    }
  }

  // Regulars: 6-12 orders spread over 6 months
  for (const cid of regulars) {
    const numOrders = randInt(4, 7);
    for (let j = 0; j < numOrders; j++) {
      makeOrder(cid, randomDate(sixMonthsAgo, now));
    }
  }

  // At-risk: 1-3 orders, all before 3 months ago
  for (const cid of atRisk) {
    const numOrders = randInt(1, 2);
    for (let j = 0; j < numOrders; j++) {
      makeOrder(cid, randomDate(sixMonthsAgo, threeMonthsAgo));
    }
  }

  // New: 1-5 orders in the last 30 days
  for (const cid of newCustomers) {
    const numOrders = randInt(1, 3);
    for (let j = 0; j < numOrders; j++) {
      makeOrder(cid, randomDate(oneMonthAgo, now));
    }
  }

  // One-time: exactly 1 order
  for (const cid of oneTime) {
    makeOrder(cid, randomDate(sixMonthsAgo, now));
  }

  // Trim or pad to exactly `count` orders
  if (orders.length > count) {
    orders.length = count;
  } else {
    // If we need more orders, add to loyalists
    let idx = 0;
    while (orders.length < count) {
      const cid = loyalists[idx % loyalists.length];
      makeOrder(cid, randomDate(sixMonthsAgo, now));
      idx++;
    }
  }

  return orders;
}

// ========== Main Seed ==========
async function main() {
  console.log("Seeding database for Brewcraft Coffee...");

  // Clear existing data
  await prisma.commEvent.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.outbox.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.channelDecision.deleteMany();

  console.log("Cleared existing data.");

  // Generate and insert customers
  const customerData = generateCustomers(2000);
  console.log(`Generated ${customerData.length} customers.`);

  // Insert in batches of 500 to avoid issues
  const BATCH_SIZE = 500;
  const customerIds: string[] = [];

  for (let i = 0; i < customerData.length; i += BATCH_SIZE) {
    const batch = customerData.slice(i, i + BATCH_SIZE);
    const created = await prisma.$transaction(
      batch.map((c) =>
        prisma.customer.create({
          data: c,
          select: { id: true },
        })
      )
    );
    customerIds.push(...created.map((c) => c.id));
    console.log(`  Inserted customers ${i + 1}-${i + batch.length}`);
  }

  console.log(`Total customers inserted: ${customerIds.length}`);

  // Generate and insert orders
  const orderData = generateOrders(customerIds, 8000);
  console.log(`Generated ${orderData.length} orders.`);

  for (let i = 0; i < orderData.length; i += BATCH_SIZE) {
    const batch = orderData.slice(i, i + BATCH_SIZE);
    await prisma.order.createMany({ data: batch });
    console.log(`  Inserted orders ${i + 1}-${i + batch.length}`);
  }

  console.log("Seed complete!");
  console.log(`  Customers: ${customerIds.length}`);
  console.log(`  Orders: ${orderData.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
