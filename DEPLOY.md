# Xeno CRM — Deploy Configuration
# For Railway / Render / Fly.io deployment

# This file documents the required services and their configurations.
# Use docker-compose.yml for container-based deployment.

# ─── Required Services ───────────────────────────────────
# 1. CRM Backend      → backend/         (Node.js, port 3001)
# 2. Poller Worker     → backend/         (same image, different entrypoint)
# 3. Channel Service   → channel-service/ (Rust binary, port 4000)
# 4. PostgreSQL        → managed service
# 5. Redis             → managed service
# 6. Frontend          → frontend/        (Next.js, port 3000)

# ─── Environment Variables ────────────────────────────────
# DATABASE_URL=postgresql://user:pass@host:5432/xeno?schema=public
# REDIS_URL=redis://host:6379
# ANTHROPIC_API_KEY=sk-ant-...
# CHANNEL_SERVICE_URL=http://channel-service:4000
# CRM_CALLBACK_URL=http://backend:3001
# PORT=3001  (backend)
# NEXT_PUBLIC_API_URL=https://your-backend.railway.app  (frontend)
