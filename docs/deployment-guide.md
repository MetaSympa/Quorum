# Deployment Guide

This guide covers deploying Quorum to a LunaNode VPS using Docker Compose and Caddy as the reverse proxy.

---

## Prerequisites

- A LunaNode VPS (or any Ubuntu 22.04+ server)
- A domain name pointed at the VPS IP (optional but recommended for HTTPS)
- SSH access to the VPS

---

## 1. Provision the VPS

Log into LunaNode and create a new instance:
- **Image**: Ubuntu 22.04 LTS
- **Flavour**: m1.small or larger (1 vCPU, 2 GB RAM minimum)
- **Region**: closest to your users

Add your SSH public key during provisioning. Note the assigned IP address.

---

## 2. Initial Server Setup

SSH into the server as root:

```bash
ssh root@YOUR_VPS_IP
```

Create a non-root user to run the application:

```bash
adduser dps
usermod -aG sudo dps
usermod -aG docker dps
```

Copy your SSH authorized keys to the new user:

```bash
mkdir -p /home/dps/.ssh
cp ~/.ssh/authorized_keys /home/dps/.ssh/
chown -R dps:dps /home/dps/.ssh
chmod 700 /home/dps/.ssh
chmod 600 /home/dps/.ssh/authorized_keys
```

From this point forward, log in as the `dps` user:

```bash
ssh dps@YOUR_VPS_IP
```

---

## 3. Install Docker and Docker Compose

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Verify:

```bash
docker --version
docker compose version
```

---

## 4. Clone the Repository

```bash
cd /home/dps
git clone <repo-url> dps-dashboard
cd dps-dashboard
```

---

## 5. Configure Environment Variables

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Required values for production:

```env
# Database password (choose a strong password)
DB_PASSWORD=your-strong-db-password

# Generate: openssl rand -base64 32
NEXTAUTH_SECRET=your-nextauth-secret

# Your VPS IP or domain
NEXTAUTH_URL=https://yourdomain.com
APP_URL=https://yourdomain.com

# Razorpay live keys (from dashboard.razorpay.com)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-live-key-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
RAZORPAY_TEST_MODE=false

# WhatsApp (optional)
WHATSAPP_API_TOKEN=your-meta-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id

# Generate: openssl rand -hex 32
ENCRYPTION_KEY=your-64-char-hex-encryption-key

# Generate: openssl rand -base64 24
CRON_SECRET=your-cron-secret

NODE_ENV=production
```

Set the `DOMAIN` variable for Caddy to enable automatic HTTPS:

```bash
echo "DOMAIN=yourdomain.com" >> .env
```

If you do not have a domain yet, leave `DOMAIN` unset. Caddy will serve HTTP only on the VPS IP.

---

## 6. Start the Application

```bash
docker compose up -d
```

On first startup:
1. PostgreSQL initialises (takes 10–20 seconds)
2. The app container runs `prisma migrate deploy` to apply the schema
3. Seed data is loaded automatically
4. Next.js builds and starts on port 3000
5. Caddy proxies traffic to the app

Monitor startup:

```bash
docker compose logs -f
```

Wait for the line: `ready - started server on 0.0.0.0:3000`

---

## 7. Domain and HTTPS

If you set `DOMAIN=yourdomain.com` in `.env` and your DNS A record points to the VPS IP, Caddy handles HTTPS automatically via Let's Encrypt.

Verify the Caddyfile is using the domain:

```bash
cat Caddyfile
# Should show: {$DOMAIN:localhost}
```

Caddy will obtain and auto-renew a TLS certificate. No extra configuration is needed.

To verify HTTPS is working:

```bash
curl -I https://yourdomain.com
# Expect: HTTP/2 200
```

---

## 8. Firewall Setup (UFW)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable
sudo ufw status
```

All other ports are denied by default.

---

## 9. Fail2ban (SSH Protection)

```bash
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Verify SSH is being monitored:

```bash
sudo fail2ban-client status sshd
```

Default configuration bans IPs after 5 failed SSH attempts for 10 minutes.

---

## 10. Automated Backup

Set up a daily PostgreSQL backup cron job:

```bash
# Make the script executable
chmod +x /home/dps/dps-dashboard/scripts/backup.sh

# Create the backup directory
sudo mkdir -p /var/backups/dps-dashboard
sudo chown dps:dps /var/backups/dps-dashboard

# Add cron job (runs at 02:00 every night)
crontab -e
```

Add this line to crontab:

```
0 2 * * * /home/dps/dps-dashboard/scripts/backup.sh >> /var/log/dps-backup.log 2>&1
```

The script keeps 30 days of backups and auto-deletes older files. See [scripts/backup.sh](../scripts/backup.sh).

To send backups offsite via rsync, set `OFFSITE_BACKUP_PATH` in `.env`:

```env
OFFSITE_BACKUP_PATH=user@backup-server:/backups/dps
```

---

## 11. Membership Expiry Cron

The cron endpoint (`POST /api/cron`) runs the daily membership expiry check. Trigger it from crontab:

```
5 2 * * * curl -s -X POST https://yourdomain.com/api/cron \
  -H "x-cron-secret: your-cron-secret" >> /var/log/dps-cron.log 2>&1
```

This checks for memberships expiring in 15 days (sends reminders) and expires memberships that are past their end date.

---

## 12. Monitoring

View live logs:

```bash
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f caddy
```

Check container status:

```bash
docker compose ps
```

Restart a service:

```bash
docker compose restart app
```

---

## 13. Updating the Application

```bash
cd /home/dps/dps-dashboard
git pull
docker compose build app
docker compose up -d app
```

Migrations are applied automatically when the container restarts.

---

## 14. Restoring from Backup

```bash
./scripts/restore.sh /var/backups/dps-dashboard/dps_dashboard_20260315_020000.sql.gz
```

The script prompts for confirmation before dropping and recreating the database. See [Security docs](security.md#backup-and-restore) for the full procedure.

---

## Troubleshooting

**App container exits immediately**
Check logs: `docker compose logs app`. Usually an invalid `.env` value (missing `ENCRYPTION_KEY` or malformed `DATABASE_URL`).

**Caddy returns 502 Bad Gateway**
The app container may not be ready yet. Wait 60 seconds and retry, or check: `docker compose logs app`.

**Cannot connect to database**
Verify `DB_PASSWORD` in `.env` matches the password used by the postgres container. Run `docker compose down -v` to reset volumes (this deletes all data), then `docker compose up -d` to start fresh.

**HTTPS certificate not issued**
Ensure port 80 is open (UFW) and the DNS A record for the domain resolves to the VPS IP. Caddy requires HTTP-01 challenge to work. Check: `docker compose logs caddy`.
