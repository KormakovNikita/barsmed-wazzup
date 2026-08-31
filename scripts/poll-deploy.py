#!/usr/bin/env python3
import paramiko
import sys
import time

HOST = "161.104.18.207"
PASSWORD = sys.argv[1]

for i in range(20):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=30)
    _, out, _ = c.exec_command(
        "tail -5 /tmp/hubdesk-build.log 2>/dev/null; "
        "docker compose -f /opt/hubdesk/docker-compose.yml ps 2>/dev/null; "
        "curl -s -o /dev/null -w 'HTTP:%{http_code}' http://127.0.0.1:3000/inbox 2>/dev/null; echo"
    )
    text = out.read().decode()
    print(f"--- poll {i+1} ---")
    print(text)
    c.close()
    if "BUILD_DONE" in text or "HTTP:200" in text:
        print("SUCCESS")
        sys.exit(0)
    time.sleep(30)

print("TIMEOUT")
sys.exit(1)
