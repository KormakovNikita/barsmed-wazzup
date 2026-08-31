#!/usr/bin/env python3
import paramiko
import sys
import time

HOST = "161.104.18.207"
USER = "root"
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else ""

INSTALL_SCRIPT = r"""set -e
export DEBIAN_FRONTEND=noninteractive

echo "=== Updating system ==="
apt-get update -qq
apt-get install -y -qq git curl ca-certificates 2>/dev/null || apt-get install -y git curl ca-certificates

echo "=== Installing Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

echo "=== Cloning/updating app ==="
if [ -d /opt/hubdesk/.git ]; then
  git -C /opt/hubdesk fetch origin main
  git -C /opt/hubdesk reset --hard origin/main
else
  rm -rf /opt/hubdesk
  git clone https://github.com/KormakovNikita/barsmed-wazzup.git /opt/hubdesk
fi

cd /opt/hubdesk

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  cat >> .env.local << 'ENVEOF'

TELEGRAM_MODE=user
WEBHOOK_BASE_URL=
ENVEOF
fi

echo "=== Building Docker image ==="
docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

echo "=== Firewall ==="
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp 2>/dev/null || true
  ufw allow 3000/tcp 2>/dev/null || true
  echo "y" | ufw enable 2>/dev/null || true
fi

sleep 3
docker compose ps
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}" http://127.0.0.1:3000/inbox || true
echo ""
echo "=== DONE ==="
"""


def main():
    if not PASSWORD:
        print("Password required", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print(f"Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    print("Running install script (may take 3-5 min)...")
    stdin, stdout, stderr = client.exec_command(INSTALL_SCRIPT, get_pty=True, timeout=600)

    for line in stdout:
        print(line, end="")

    err = stderr.read().decode()
    if err:
        print("STDERR:", err, file=sys.stderr)

    exit_code = stdout.channel.recv_exit_status()
    client.close()
    print(f"Exit code: {exit_code}")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
