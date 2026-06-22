#!/usr/bin/env bash
set -euo pipefail

# deploy.sh - Automates installing Docker, cloning the repo, configuring env, and bringing up the compose stack
# Usage: run as a non-root user with sudo privileges on a fresh Ubuntu 22.04 server

REPO_URL="https://github.com/nayenithulasi06-sudo/Vps.git"
INSTALL_DIR="/opt/vps-hosting"

echo "Starting VPS hosting deploy script"

if [ "$(id -u)" -eq 0 ]; then
  echo "This script should NOT be run as root. Please run under your normal sudo-capable user account." >&2
  exit 1
fi

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  rm get-docker.sh
else
  echo "Docker already installed"
fi

# Add user to docker group
echo "Adding $USER to docker group (you may need to re-login after this)..."
sudo usermod -aG docker $USER || true

# Install docker-compose plugin if not present
if ! docker compose version >/dev/null 2>&1; then
  echo "Installing docker compose plugin..."
  sudo apt-get update
  sudo apt-get install -y libffi-dev libssl-dev
  # Use the Docker official plugin (install via apt-get may be enough on Ubuntu, but fallback to latest release)
  sudo apt-get install -y docker-compose-plugin || true
fi

# Install git
if ! command -v git >/dev/null 2>&1; then
  echo "Installing git..."
  sudo apt-get install -y git
fi

# Create install directory
echo "Preparing install directory: ${INSTALL_DIR}"
sudo mkdir -p ${INSTALL_DIR}
sudo chown "$USER":"$USER" ${INSTALL_DIR}

# Clone or update repository
if [ -d "${INSTALL_DIR}/.git" ]; then
  echo "Repository already cloned. Pulling latest changes..."
  git -C "${INSTALL_DIR}" pull
else
  echo "Cloning repository ${REPO_URL} into ${INSTALL_DIR}"
  git clone ${REPO_URL} "${INSTALL_DIR}"
fi

cd "${INSTALL_DIR}"

# Copy env and prompt for ADMIN_TOKEN
if [ ! -f api/.env ]; then
  if [ -f api/.env.example ]; then
    cp api/.env.example api/.env
  else
    touch api/.env
  fi
fi

echo "Configuring API environment (api/.env)"

read -p "Enter OWNER_EMAIL (default: abhinavkanni6@gmail.com): " owner_email
owner_email=${owner_email:-abhinavkanni6@gmail.com}

read -p "Would you like to (1) provide ADMIN_TOKEN or (2) generate a secure token for you? [1/2]: " tok_choice
if [ "${tok_choice}" = "1" ]; then
  read -s -p "Enter ADMIN_TOKEN (will not echo): " admin_token
  echo
else
  admin_token=$(openssl rand -hex 32)
  echo "Generated ADMIN_TOKEN: ${admin_token}"
  echo "Make sure to save this token securely."
fi

# Write to api/.env
cat > api/.env <<EOF
ADMIN_TOKEN=${admin_token}
OWNER_EMAIL=${owner_email}
PORT=4000
EOF

# Set permissions
chmod 600 api/.env || true

# Build and start compose stack
echo "Building & starting services with docker compose..."
# Use docker compose plugin
sudo docker compose build --pull --no-cache || sudo docker compose build
sudo docker compose up -d

# Configure UFW
if command -v ufw >/dev/null 2>&1; then
  echo "Configuring UFW firewall: allow 22, 80, 443, 3000, 4000"
  sudo ufw allow OpenSSH
  sudo ufw allow 3000/tcp
  sudo ufw allow 4000/tcp
  sudo ufw --force enable
else
  echo "UFW not installed; skipping firewall setup"
fi

# Create a systemd service to start the stack on boot
SERVICE_FILE="/etc/systemd/system/vps-hosting.service"
if [ ! -f "$SERVICE_FILE" ]; then
  echo "Creating systemd service to keep docker compose running on boot"
  sudo bash -c "cat > ${SERVICE_FILE}" <<'SYSTEMD'
[Unit]
Description=VPS Hosting docker-compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/vps-hosting
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
SYSTEMD

  sudo systemctl daemon-reload
  sudo systemctl enable vps-hosting.service
  sudo systemctl start vps-hosting.service || true
else
  echo "Systemd service already exists"
fi

# Final checks
echo "Deployment finished. Services status:"
sudo docker compose ps

IP_ADDR="$(curl -s ifconfig.me || curl -s https://ipinfo.io/ip || echo '127.0.0.1')"

cat <<EOF

Access the web UI at: http://${IP_ADDR}:3000
API endpoint: http://${IP_ADDR}:4000
Admin token: ${admin_token}

IMPORTANT: Save the ADMIN_TOKEN securely. Do NOT share it.

Next steps:
 - Visit the web UI and paste the ADMIN_TOKEN in the Admin Token field.
 - Create bots using the UI and supply Discord bot tokens (do not share tokens publicly).
 - For production, secure the API, add TLS with a domain + Caddy or nginx+certbot, and replace docker socket approach.

EOF
