#!/usr/bin/env python3
import paramiko
import sys
import time

HOST = "161.104.18.207"
USER = "root"
PASSWORD = sys.argv[1]
TARBALL = "/tmp/hubdesk-deploy.tar.gz"

REMOTE_SETUP = r"""set -e
mkdir -p /opt/hubdesk
cd /opt/hubdesk
tar xzf /tmp/hubdesk-deploy.tar.gz
rm -f /tmp/hubdesk-deploy.tar.gz

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  printf '\nTELEGRAM_MODE=user\nWEBHOOK_BASE_URL=\n' >> .env.local
fi

docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp 2>/dev/null || true
  ufw allow 3000/tcp 2>/dev/null || true
  echo "y" | ufw enable 2>/dev/null || true
fi

sleep 5
docker compose ps
curl -s -o /dev/null -w "INBOX_HTTP:%{http_code}\n" http://127.0.0.1:3000/inbox
echo DEPLOY_OK
"""


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    print("Uploading files...")
    sftp = client.open_sftp()
    sftp.put(TARBALL, "/tmp/hubdesk-deploy.tar.gz")
    sftp.close()
    print("Upload done.")

    print("Building and starting (3-5 min)...")
    stdin, stdout, stderr = client.exec_command(REMOTE_SETUP, get_pty=True, timeout=900)
    for line in stdout:
        print(line, end="")

    code = stdout.channel.recv_exit_status()
    client.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
