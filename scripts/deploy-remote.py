#!/usr/bin/env python3
import paramiko
import sys

HOST = sys.argv[1]
PASSWORD = sys.argv[2]
TARBALL = "/tmp/hubdesk-deploy.tar.gz"

REMOTE = r"""
set -e
bash /tmp/full-deploy.sh 2>&1 | tee /tmp/hubdesk-deploy.log
"""

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {HOST}...")
    c.connect(HOST, username="root", password=PASSWORD, timeout=60, banner_timeout=120)

    sftp = c.open_sftp()
    sftp.put(TARBALL, "/tmp/hubdesk-deploy.tar.gz")
    with sftp.open("/tmp/full-deploy.sh", "w") as f:
        with open("/workspace/scripts/full-deploy.sh") as local:
            f.write(local.read())
    sftp.close()
    print("Files uploaded. Deploy running (~5-10 min)...")

    stdin, stdout, stderr = c.exec_command(
        "chmod +x /tmp/full-deploy.sh && bash /tmp/full-deploy.sh 2>&1 | tee /tmp/hubdesk-deploy.log",
        get_pty=True,
        timeout=900,
    )
    for line in stdout:
        # filter noisy docker progress escape codes for readability
        clean = line.replace("\r", "")
        if clean.strip():
            print(clean, end="" if clean.endswith("\n") else "\n")

    code = stdout.channel.recv_exit_status()
    c.close()
    sys.exit(code)


if __name__ == "__main__":
    main()
