const express = require("express");
const { io } = require("socket.io-client");

const app = express();
app.use(express.json());

const UPTIME_URL = process.env.UPTIME_KUMA_URL; // from .env
const USERNAME = process.env.UPTIME_USER;
const PASSWORD = process.env.UPTIME_PASS;

// ── helper: get an authenticated socket ──────────────────────────
function getSocket() {
  return new Promise((resolve, reject) => {
    const socket = io(UPTIME_URL, { transports: ["websocket"] });

    socket.on("connect", () => {
      socket.emit(
        "login",
        { username: USERNAME, password: PASSWORD, token: "" },
        (res) => {
          if (res.ok) resolve(socket);
          else reject(new Error(res.msg));
        },
      );
    });

    socket.on("connect_error", (err) => reject(err));
  });
}

// ── GET /monitors ─────────────────────────────────────────────────
app.get("/monitors", async (req, res) => {
  try {
    const socket = await getSocket();
    socket.emit("getMonitorList", {}, (data) => {
      socket.disconnect();
      res.json(data);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /monitors ────────────────────────────────────────────────
app.post("/monitors", async (req, res) => {
  try {
    const socket = await getSocket();

    const monitor = {
      type: "http",
      name: req.body.name,
      url: req.body.url,
      method: req.body.method || "GET",
      interval: req.body.interval || 60,
      retryInterval: 60,
      maxretries: 3,
      timeout: 30,
      active: true,
      conditions: [], // ← the critical field
      accepted_statuscodes: ["200-299"],
      notificationIDList: {},
      ignoreTls: false,
      upsideDown: false,
      maxredirects: 10,
      expiryNotification: false,
      description: req.body.description || "",
    };

    socket.emit("add", monitor, (result) => {
      socket.disconnect();
      if (result.ok) res.json({ success: true, monitorID: result.monitorID });
      else res.status(400).json({ error: result.msg });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /monitors/:id ──────────────────────────────────────────
app.delete("/monitors/:id", async (req, res) => {
  try {
    const socket = await getSocket();
    socket.emit("deleteMonitor", parseInt(req.params.id), (result) => {
      socket.disconnect();
      res.json(result);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log("✅ Uptime API running on :3000"));
