#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Xeno CRM Full Setup ==="

# 1. Docker
echo ""
echo "[1/6] Starting Docker services (PostgreSQL + Redis)..."
docker compose up -d
echo "Waiting for PostgreSQL..."
sleep 3

# 2. Backend deps
echo ""
echo "[2/6] Installing backend dependencies..."
cd backend
npm install

# 3. Prisma
echo ""
echo "[3/6] Generating Prisma client + running migrations..."
npx prisma generate
npx prisma migrate dev --name init

# 4. Seed
echo ""
echo "[4/6] Seeding database (2000 customers, 8000 orders)..."
npm run db:seed
cd ..

# 5. Frontend deps
echo ""
echo "[5/6] Installing frontend dependencies..."
cd frontend
npm install
cd ..

# 6. Channel service
echo ""
echo "[6/6] Building Rust channel service..."
cd channel-service
cargo build --release
cd ..

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start services:"
echo "  Backend:         cd backend && npm run dev"
echo "  Frontend:        cd frontend && npm run dev"
echo "  Channel Service: cd channel-service && cargo run --release"
