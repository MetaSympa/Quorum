# Server Hardening Guide — LunaNode VPS

This guide documents every hardening step for the Quorum deployment on a LunaNode Cloud VPS running Ubuntu 22.04 LTS. Follow the steps in order. The app runs under a dedicated non-root `dps` user.

**Threat model**: Internet-facing VPS running Docker Compose (Next.js + PostgreSQL + Caddy). Primary risks are brute-force SSH login, exposed services, and secrets leakage. This guide addresses all three.

---

## 1. Create Non-Root User

Connect to the server as root initially, then create the `dps` user immediately.

```bash
adduser dps
usermod -aG sudo dps
usermod -aG docker dps
```

Test the new account:

```bash
su - dps
sudo whoami   # should print: root
```

All subsequent steps are run as `dps` unless noted.

---

## 2. SSH Hardening

**Step 1 — Generate an ed25519 key on your local machine (not on the server):**

```bash
ssh-keygen -t ed25519 -C "dps-dashboard"
# Accept defaults or specify a path, e.g. ~/.ssh/id_ed25519_dps
```

**Step 2 — Copy the public key to the server:**

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub dps@your-server-ip
```

Or manually append the public key:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat your-public-key >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

**Step 3 — Verify key-based login works before disabling password auth:**

Open a NEW terminal window and test:

```bash
ssh -i ~/.ssh/id_ed25519 dps@your-server-ip
```

**IMPORTANT: Do NOT close your current session until the test succeeds. If you lock yourself out, you will need LunaNode's emergency console.**

**Step 4 — Disable password authentication:**

```bash
sudo nano /etc/ssh/sshd_config
```

Set these values (uncomment if needed):

```
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

Restart SSH:

```bash
sudo systemctl restart sshd
```

**Step 5 — Back up your private key** to at least two locations (USB drive, password manager, secure cloud storage). Loss of the private key with no backup means locked out permanently.

---

## 3. Firewall (UFW)

Allow only the three ports the application needs:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Caddy handles redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
sudo ufw status verbose
```

Expected output:

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
```

PostgreSQL (port 5432) is bound only to the Docker internal network — it is never exposed to the host network interface and does not need a firewall rule.

---

## 4. Fail2ban

Install and configure Fail2ban to ban IPs after repeated failed SSH login attempts.

```bash
sudo apt install -y fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Find the `[sshd]` section (or add it at the bottom) and set:

```ini
[sshd]
enabled = true
port = 22
maxretry = 5
bantime = 600
findtime = 600
```

These settings ban an IP for 10 minutes after 5 failed attempts within any 10-minute window. The short ban time means a misconfigured client will only be temporarily blocked, reducing lockout risk.

Enable and start:

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Check status:

```bash
sudo fail2ban-client status sshd
```

To unban an IP manually:

```bash
sudo fail2ban-client set sshd unbanip <ip-address>
```

---

## 5. Automatic Security Updates

Install and configure `unattended-upgrades` to apply only security patches automatically. Major version upgrades are left to the operator.

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# Select "Yes" when prompted for automatic security updates
```

Verify the configuration:

```bash
cat /etc/apt/apt.conf.d/20auto-upgrades
```

Expected content:

```
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

Security updates apply daily. Kernel updates requiring a reboot are not applied automatically — check `/var/run/reboot-required` periodically.

---

## 6. File Permissions

### .env file

The `.env` file contains all application secrets (database password, Razorpay keys, encryption key, NextAuth secret). It must be readable only by the `dps` user.

```bash
chmod 600 /home/dps/dps-dashboard/.env
ls -la /home/dps/dps-dashboard/.env
# Expected: -rw------- 1 dps dps ...
```

### Backup directory

```bash
sudo mkdir -p /var/backups/dps-dashboard
sudo chown dps:dps /var/backups/dps-dashboard
sudo chmod 700 /var/backups/dps-dashboard
ls -la /var/backups/ | grep dps-dashboard
# Expected: drwx------ 2 dps dps ...
```

### Application directory

```bash
sudo chown -R dps:dps /home/dps/dps-dashboard
```

---

## 7. Docker Security

The Docker setup is already hardened in `docker-compose.yml` and `Dockerfile`. This section documents the controls in place and what to verify.

**App runs as non-root inside the container:**
The `Dockerfile` creates a `nextjs` user (UID 1001) and switches to it before the `CMD`. The process inside the container never has root privileges.

```bash
# Verify after docker compose up:
docker compose exec app whoami
# Expected: nextjs
```

**Docker socket is not mounted in any container:**
Check `docker-compose.yml` — no volume should mount `/var/run/docker.sock` into the `app` or `db` container. Caddy does not need it either.

**No `--privileged` flag:**
No container in `docker-compose.yml` uses `privileged: true`. Verify:

```bash
grep -i privileged /home/dps/dps-dashboard/docker-compose.yml
# Expected: no output
```

**PostgreSQL is not port-forwarded to the host:**
The `db` service in `docker-compose.yml` exposes port 5432 only within the Docker internal network. It is not bound to `0.0.0.0:5432` on the host. Verify:

```bash
docker compose ps
# The db service should show no published ports (or only 5432/tcp without host binding)
```

**Resource limits (optional):**
If the VPS is small (e.g. 2 GB RAM), consider adding memory limits to `docker-compose.yml` to prevent any single container from consuming all available memory:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 512M
  db:
    deploy:
      resources:
        limits:
          memory: 256M
```

---

## 8. Backup Cron

The backup script (`scripts/backup.sh`) takes a `pg_dump` of the PostgreSQL database and saves a compressed timestamped file to `/var/backups/dps-dashboard/`. It retains the last 30 days and deletes older files automatically.

**Configure the cron job as the `dps` user:**

```bash
crontab -e
```

Add this line to run backups daily at 2 AM:

```
0 2 * * * /home/dps/dps-dashboard/scripts/backup.sh >> /var/log/dps-backup.log 2>&1
```

**Verify cron is installed:**

```bash
crontab -l
# Should show the backup line
```

**Test the backup script manually:**

```bash
/home/dps/dps-dashboard/scripts/backup.sh
ls -lh /var/backups/dps-dashboard/
# Should show a .sql.gz file with today's timestamp
```

**Test restore from backup:**

```bash
# List available backups
ls /var/backups/dps-dashboard/

# Restore (replace BACKUP_FILE with actual filename)
/home/djs/dps-dashboard/scripts/restore.sh /var/backups/dps-dashboard/BACKUP_FILE.sql.gz
```

See `scripts/restore.sh` for full restore instructions.

**Monitor backup log:**

```bash
tail -20 /var/log/dps-backup.log
```

---

## 9. HTTPS / SSL Certificate

Caddy automatically provisions a Let's Encrypt TLS certificate when a domain name is configured. No manual certificate management is needed.

**For production with a domain:**

1. Point your domain's A record to the VPS IP address.
2. Update `Caddyfile` — replace the IP address block with:

```
yourdomain.com {
    reverse_proxy app:3000
}
```

3. Restart Caddy:

```bash
docker compose restart caddy
```

Caddy will obtain the certificate automatically and configure HTTPS. HTTP requests are redirected to HTTPS automatically.

**For initial deployment without a domain:**
The default `Caddyfile` serves HTTP on port 80 at the IP address. This is sufficient for internal testing. Do not enter production secrets until HTTPS is active.

---

## 10. Monitoring

Routine checks to run after deployment and periodically:

```bash
# Check container status
docker compose -f /home/dps/dps-dashboard/docker-compose.yml ps

# View live logs (last 100 lines, follow)
docker compose -f /home/dps/dps-dashboard/docker-compose.yml logs -f --tail 100

# View logs for a specific service
docker compose -f /home/dps/dps-dashboard/docker-compose.yml logs app
docker compose -f /home/dps/dps-dashboard/docker-compose.yml logs db

# Check disk usage (backups accumulate)
df -h

# Check backup directory size and most recent backup
ls -lht /var/backups/dps-dashboard/ | head -5

# Check Fail2ban ban list
sudo fail2ban-client status sshd

# Check UFW status
sudo ufw status verbose

# Check for reboot-required (kernel update pending)
cat /var/run/reboot-required 2>/dev/null && echo "REBOOT REQUIRED" || echo "No reboot needed"
```

---

## 11. Initial Deployment Checklist

Run these steps in order on first deployment:

```bash
# 1. Clone the repo
cd /home/dps
git clone <repo-url> dps-dashboard
cd dps-dashboard

# 2. Copy and fill in the .env file
cp .env.example .env
nano .env
# Fill in: DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY,
#          RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
#          (WhatsApp vars are optional — app works without them)

# 3. Lock down the .env file
chmod 600 .env

# 4. Start the stack
docker compose up -d

# 5. Wait for database to be ready (~10 seconds), then run migrations and seed
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed

# 6. Verify all containers are running
docker compose ps

# 7. Check logs for errors
docker compose logs --tail 50
```

---

## Security Checklist

Before going live, verify every item:

- [ ] Non-root `dps` user created and added to `sudo` and `docker` groups
- [ ] SSH key-based login working (tested from new terminal)
- [ ] Password authentication disabled (`PasswordAuthentication no`)
- [ ] Root login disabled (`PermitRootLogin no`)
- [ ] Private SSH key backed up to at least two locations
- [ ] UFW enabled — allows only ports 22, 80, 443
- [ ] Fail2ban running and watching SSH (`fail2ban-client status sshd`)
- [ ] Automatic security updates enabled
- [ ] `.env` file is `chmod 600` (readable only by `dps`)
- [ ] Backup directory `/var/backups/dps-dashboard/` is `chmod 700`, owned by `dps`
- [ ] Backup cron configured (`crontab -l`)
- [ ] Backup script tested manually (file appears in backup directory)
- [ ] Docker running without root (containers do not run as root)
- [ ] Docker socket not mounted in any container
- [ ] PostgreSQL not exposed on host network
- [ ] SSL certificate active and HTTPS working (once domain configured)
- [ ] Application loads at expected URL with no console errors
- [ ] All seeded test accounts log in successfully
