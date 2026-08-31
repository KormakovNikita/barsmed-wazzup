#!/usr/bin/env node

const BASE = process.env.POLL_BASE_URL ?? "http://127.0.0.1:43123";

async function pollOnce() {
  const response = await fetch(`${BASE}/api/integrations/poll`, {
    method: "POST",
  });
  const data = await response.json();
  const timestamp = new Date().toLocaleTimeString("ru-RU");
  if (data.processed > 0) {
    console.log(`[${timestamp}] processed ${data.processed} events`, data.events);
  } else {
    console.log(`[${timestamp}] no new events`);
  }
}

console.log(`Polling ${BASE}/api/integrations/poll every 3s...`);

setInterval(pollOnce, 3000);
pollOnce();
