// start.js
import { spawn } from "child_process";
import dotenv from "dotenv";
import path from "path";
import localtunnelModule from "localtunnel";

const localtunnel = localtunnelModule.default || localtunnelModule;

// .env load
dotenv.config({ path: path.resolve(".env") });

// Port (backend ka)
const PORT = process.env.PORT || 5050;

// If we're using ngrok externally, skip localtunnel attempts
const SKIP_LOCALTUNNEL =
  (process.env.SKIP_LOCALTUNNEL || "").toLowerCase() === "true" ||
  (process.env.SKIP_TUNNEL || "").toLowerCase() === "true" ||
  (process.env.USE_NGROK || "").toLowerCase() === "true";

// Optional: auto-start ngrok from this script (so you don't run it separately)
const RUN_NGROK =
  (process.env.RUN_NGROK || "").toLowerCase() === "true" ||
  (process.env.START_NGROK || "").toLowerCase() === "true";
const NGROK_BIN = process.env.NGROK_BIN || "ngrok";
const NGROK_REGION = process.env.NGROK_REGION || "";

// ---------- Subdomain decide karna (REDIRECT_URI se) ----------
let SUBDOMAIN = process.env.TUNNEL_SUBDOMAIN || "freshbookapi";

try {
  if (process.env.REDIRECT_URI) {
    const u = new URL(process.env.REDIRECT_URI);
    const hostParts = u.hostname.split(".");
    if (hostParts.length >= 3 && hostParts[0]) {
      SUBDOMAIN = hostParts[0];
    }
  }
} catch (err) {
  console.warn(
    "[Start] Could not parse REDIRECT_URI, using default subdomain:",
    SUBDOMAIN
  );
}

// ---------- Helpers ----------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let tunnel = null;
let isStartingTunnel = false;
let stopRequested = false;
const HANDSHAKE_TIMEOUT_MS = 15000;
const SHORT_RETRY_MS = 3000;
const LONG_RETRY_MS = 20000;
const MAX_BACKOFF_STEPS = 5;
const MAX_FIXED_SUBDOMAIN_ATTEMPTS = 3;
const ORIGINAL_SUBDOMAIN = SUBDOMAIN;
const TUNNEL_HOSTS = (
  process.env.TUNNEL_HOSTS ||
  process.env.TUNNEL_HOST ||
  "https://loca.lt,https://localtunnel.me"
)
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const TUNNEL_LOCAL_HOST =
  process.env.TUNNEL_LOCAL_HOST?.trim() || "127.0.0.1";
const TUNNEL_VERIFY_PATH =
  process.env.TUNNEL_VERIFY_PATH?.trim() || "/test";
const KEEPALIVE_INTERVAL_MS = Number(
  process.env.TUNNEL_KEEPALIVE_INTERVAL_MS || 30000
);
let keepAliveTimer = null;
const VERIFY_TIMEOUT_MS = 10000;
let hostIndex = 0;

// ---------- Backend start ----------
console.log("Starting FreshBooks backend server...");

const backend = spawn("node", ["server.js"], {
  shell: true,
  stdio: ["inherit", "inherit", "inherit"],
});

backend.on("exit", (code) => {
  console.log(`[Backend] exited with code ${code}`);
});

// ---------- Optional: start ngrok tunnel automatically ----------
let ngrokProc = null;
function startNgrok() {
  if (ngrokProc) return;
  const args = ["http", String(PORT)];
  if (NGROK_REGION) args.push("--region", NGROK_REGION);
  console.log(`[Ngrok] Starting: ${NGROK_BIN} ${args.join(" ")}`);
  ngrokProc = spawn(NGROK_BIN, args, {
    shell: true,
    stdio: ["inherit", "inherit", "inherit"],
  });
  ngrokProc.on("exit", (code) => {
    console.log(`[Ngrok] exited with code ${code}`);
    ngrokProc = null;
  });
}

const startTunnelWithRetries = async () => {
  if (isStartingTunnel || stopRequested) return;
  isStartingTunnel = true;

  let attempt = 1;
  let fixedSubAttempts = 0;
  while (!stopRequested) {
    try {
      const host = TUNNEL_HOSTS[hostIndex % TUNNEL_HOSTS.length];
      console.log(
        `[Tunnel] Attempt ${attempt} on https://${SUBDOMAIN}.loca.lt (host ${host}, port ${PORT})...`
      );

      const tunnelPromise = (async () => {
        const t = await localtunnel({
          port: Number(PORT),
          subdomain: SUBDOMAIN,
          host,
          local_host: TUNNEL_LOCAL_HOST,
        });
        // Prevent unhandled errors on the tunnel instance
        t.on("error", (err) => {
          console.error(
            "[Tunnel] error event during connection:",
            err?.message || err
          );
        });
        return t;
      })();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Tunnel handshake timed out after ${
                  HANDSHAKE_TIMEOUT_MS / 1000
                }s`
              )
            ),
          HANDSHAKE_TIMEOUT_MS
        )
      );

      tunnel = await Promise.race([tunnelPromise, timeoutPromise]);

      // Verify tunnel reaches backend before announcing ready
      const ok = await verifyTunnel(tunnel.url);
      if (!ok) {
        console.warn(
          "[Tunnel] health check failed right after connect, closing and retrying..."
        );
        tunnel.close();
        tunnel = null;
        throw new Error("Initial tunnel health check failed");
      }

      console.log("[Tunnel Ready]", tunnel.url);
      startKeepAlive(tunnel.url);

      tunnel.on("close", () => {
        tunnel = null;
        stopKeepAlive();
        if (stopRequested) return;
        console.warn("[Tunnel] closed. Retrying in 3s...");
        setTimeout(startTunnelWithRetries, SHORT_RETRY_MS);
      });

      tunnel.on("error", (err) => {
        console.error("[Tunnel] error:", err?.message || err);
        if (tunnel) {
          tunnel.close();
          tunnel = null;
        }
      });

      isStartingTunnel = false;
      return;
    } catch (err) {
      fixedSubAttempts += 1;
      hostIndex = (hostIndex + 1) % TUNNEL_HOSTS.length;

      const shouldSwapSubdomain =
        fixedSubAttempts >= MAX_FIXED_SUBDOMAIN_ATTEMPTS &&
        SUBDOMAIN === ORIGINAL_SUBDOMAIN;
      if (shouldSwapSubdomain) {
        const randSuffix = Math.random().toString(36).slice(2, 8);
        SUBDOMAIN = `${ORIGINAL_SUBDOMAIN}-${randSuffix}`;
        console.warn(
          `[Tunnel] Switching to random subdomain ${SUBDOMAIN}.loca.lt because ${ORIGINAL_SUBDOMAIN}.loca.lt seems blocked/busy.`
        );
        attempt = 1;
        fixedSubAttempts = 0;
      }

      const isBackoffReset = attempt >= MAX_BACKOFF_STEPS;
      const waitMs = isBackoffReset
        ? LONG_RETRY_MS
        : Math.min(SHORT_RETRY_MS * attempt, HANDSHAKE_TIMEOUT_MS);

      console.error("[Tunnel Error]", err?.message || err);
      console.log(
        `[Tunnel] retrying in ${Math.round(waitMs / 1000)}s...${
          isBackoffReset ? " (slow backoff)" : ""
        }`
      );

      await sleep(waitMs);
      attempt = isBackoffReset ? 1 : attempt + 1;
    }
  }

  isStartingTunnel = false;
};

const shutdown = () => {
  stopRequested = true;
  stopKeepAlive();
  if (tunnel) {
    try {
      tunnel.close();
    } catch (err) {
      console.warn("[Tunnel] close failed:", err?.message || err);
    }
  }
  if (backend && !backend.killed) {
    backend.kill();
  }
  if (ngrokProc && !ngrokProc.killed) {
    ngrokProc.kill();
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  stopRequested = true;
  stopKeepAlive();
  if (tunnel) {
    try {
      tunnel.close();
    } catch {
      /* ignore */
    }
  }
});

// ---------- LocalTunnel with retries + cleanup ----------
if (SKIP_LOCALTUNNEL) {
  console.log(
    "[Tunnel] Skipping localtunnel because SKIP_LOCALTUNNEL=true (using ngrok)."
  );
  if (RUN_NGROK) startNgrok();
} else {
  startTunnelWithRetries();
}

// ---------- Health check + keepalive helpers ----------
function buildVerifyUrl(tunnelUrl) {
  try {
    const url = new URL(tunnelUrl);
    url.pathname = TUNNEL_VERIFY_PATH;
    return url.toString();
  } catch {
    return `${tunnelUrl}${TUNNEL_VERIFY_PATH}`;
  }
}

async function verifyTunnel(tunnelUrl) {
  const target = buildVerifyUrl(tunnelUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "freshbooks-backend-tunnel-check" },
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    return true;
  } catch (err) {
    clearTimeout(timer);
    console.warn("[Tunnel] verify failed:", err?.message || err);
    return false;
  }
}

function startKeepAlive(tunnelUrl) {
  stopKeepAlive();
  if (!KEEPALIVE_INTERVAL_MS || KEEPALIVE_INTERVAL_MS < 10000) return;

  keepAliveTimer = setInterval(async () => {
    if (stopRequested) return stopKeepAlive();
    const ok = await verifyTunnel(tunnelUrl);
    if (!ok && tunnel) {
      console.warn("[Tunnel] keepalive failed, restarting tunnel...");
      tunnel.close();
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}
