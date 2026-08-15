# 🚀 Binary Fund Global — VPS Deployment Guide

VPS: **194.233.75.222** (Contabo)
Domain: **api.binaryfundglobal.com**
Stack: **FastAPI + PostgreSQL + Redis + Nginx + Let's Encrypt SSL**

---

## ⚡ Quick Deployment (30 min total)

### Step 1 — DNS Setup (once, ~5 min propagation)

Tomar DNS provider (Cloudflare / Namecheap / GoDaddy) e ei A record add koro:

| Type | Host                     | Value           | TTL  |
|------|--------------------------|-----------------|------|
| A    | `api.binaryfundglobal.com` | `194.233.75.222` | Auto |

Verify (jekono machine theke):
```bash
dig api.binaryfundglobal.com +short
# Expected output: 194.233.75.222
```

### Step 2 — Package the backend (run on YOUR local machine or Emergent sandbox)

```bash
cd /app
tar --exclude='backend/venv' --exclude='backend/__pycache__' \
    --exclude='backend/**/__pycache__' --exclude='backend/tests' \
    -czf /tmp/bfg-backend.tar.gz backend/

# Upload to VPS
scp -P 2222 /tmp/bfg-backend.tar.gz bfg@194.233.75.222:/tmp/
```

> **Note:** VPS er SSH port `2222` (initial setup e change kora hoyeche). User `bfg` (sudo access ache).

### Step 3 — SSH kore VPS e giye deploy

```bash
ssh -p 2222 bfg@194.233.75.222
sudo su -

# Extract to /opt/bfg-backend
mkdir -p /opt/bfg-backend
tar -xzf /tmp/bfg-backend.tar.gz -C /tmp
rsync -a --delete /tmp/backend/ /opt/bfg-backend/
cd /opt/bfg-backend

# Copy production .env template and edit
cp deploy/.env.production.example .env
nano .env
# ↑ Verify: DATABASE_URL, REDIS_URL, GOOGLE creds, CORS_ORIGINS all correct.
#   For localhost DB on VPS itself, use 127.0.0.1 (already in the template).

# Make deploy script executable and run
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

The script will:
- ✅ Install Python 3.11, Nginx, Certbot
- ✅ Create `bfg` service user
- ✅ Create Python venv and install requirements
- ✅ Setup systemd service `bfg-backend.service`
- ✅ Configure Nginx reverse proxy for `api.binaryfundglobal.com`
- ✅ Request Let's Encrypt SSL cert (HTTPS auto-redirect)
- ✅ Open UFW firewall ports 80/443

### Step 4 — Verify deployment

```bash
# Service status
systemctl status bfg-backend

# Live logs
journalctl -u bfg-backend -f

# Health check
curl -s https://api.binaryfundglobal.com/api/health
# Expected: {"status":"healthy"}

# Market instruments
curl -s https://api.binaryfundglobal.com/api/market/instruments | head -c 200
```

### Step 5 — Frontend update (Emergent side)

Emergent chat e bolo:
> "Frontend REACT_APP_BACKEND_URL update koro to `https://api.binaryfundglobal.com`"

---

## 🔄 Re-deployment (updates)

```bash
# Local
tar --exclude='backend/venv' -czf /tmp/bfg-backend.tar.gz backend/
scp -P 2222 /tmp/bfg-backend.tar.gz bfg@194.233.75.222:/tmp/

# VPS
ssh -p 2222 bfg@194.233.75.222
sudo su -
tar -xzf /tmp/bfg-backend.tar.gz -C /tmp
rsync -a --delete --exclude='.env' --exclude='venv' /tmp/backend/ /opt/bfg-backend/
sudo -u bfg /opt/bfg-backend/venv/bin/pip install -r /opt/bfg-backend/requirements.txt
systemctl restart bfg-backend
```

---

## 🛠️ Common issues

| Issue | Fix |
|-------|-----|
| Certbot fails | DNS ekhono propagate hoy nai — 5-10 min wait koro, tarpor `certbot --nginx -d api.binaryfundglobal.com` |
| `502 Bad Gateway` | `journalctl -u bfg-backend -n 50` → error dekhbe |
| WebSocket disconnect | Nginx already handles this (`Upgrade` + `Connection` headers set) |
| Port 5432 blocked | `ufw status` check, run `ufw allow from <emergent-ip> to any port 5432` if remote access needed |

---

## 📊 Post-deployment monitoring

```bash
# Real-time backend logs
journalctl -u bfg-backend -f

# Nginx access logs
tail -f /var/log/nginx/access.log

# PostgreSQL slow queries
sudo -u postgres psql binaryfund -c "SELECT * FROM pg_stat_activity WHERE state='active';"

# Redis stats
redis-cli -a $REDIS_PASSWORD INFO stats
```
