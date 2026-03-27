const { io } = require("socket.io-client");
const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json());

const UPTIME_KUMA_URL = process.env.UPTIME_KUMA_URL;
const USERNAME = process.env.UPTIME_USER;
const PASSWORD = process.env.UPTIME_PASS;
const PORT = 3000; // Port for your Express server

// State variable to ensure we are logged in before trying to create a monitor
let isKumaReady = false;

const socket = io(UPTIME_KUMA_URL, {
  transports: ["websocket"],
});

// --- SOCKET.IO LOGIC ---
socket.on("connect", () => {
  console.log("✅ Connected to Uptime Kuma Socket.IO");

  // Step 1: Login automatically when connected
  socket.emit(
    "login",
    { username: USERNAME, password: PASSWORD, token: "" },
    (res) => {
      if (!res.ok) {
        console.error("❌ Login failed:", res.msg);
        isKumaReady = false;
        return;
      }
      console.log("✅ Logged in. Token:", res.token);
      isKumaReady = true; // Mark as ready for REST requests
    },
  );
});

socket.on("disconnect", () => {
  console.log("⚠️ Disconnected from Uptime Kuma");
  isKumaReady = false;
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
  isKumaReady = false;
});

// --- REST API ENDPOINT ---
app.post("/api/monitors", (req, res) => {
  // 1. Check if the socket is connected and authenticated
  if (!isKumaReady) {
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Not connected to Uptime Kuma socket yet.",
    });
  }

  // 2. Extract dynamic data from the REST POST body
  const { name, url, method, interval } = req.body;

  // Basic validation
  if (!name || !url) {
    return res.status(400).json({
      error: "Missing required fields: 'name' and 'url' are required.",
    });
  }

  // 3. Construct the monitor object
  // We merge default values with whatever the user passes in
  const monitor = {
    type: "http",
    name: name,
    url: url,
    method: method || "GET",
    interval: interval || 60, // Default 60 seconds
    retryInterval: 60,
    maxretries: 3,
    timeout: 30,
    active: true,
    conditions: [], // Critical field
    accepted_statuscodes: ["200-299"],
    notificationIDList: {},
    ignoreTls: false,
    upsideDown: false,
    maxredirects: 10,
    expiryNotification: false,
    description: req.body.description || "",
  };

  // 4. Send creation request via Socket.io
  socket.emit("add", monitor, (kumaRes) => {
    // 5. Respond back to the REST client based on Uptime Kuma's response
    if (kumaRes.ok) {
      console.log(`✅ Monitor created! ID: ${kumaRes.monitorID}`);
      return res.status(201).json({
        success: true,
        message: "Monitor created successfully",
        monitorID: kumaRes.monitorID,
      });
    } else {
      console.error(`❌ Failed to create monitor:`, kumaRes.msg);
      return res.status(500).json({
        success: false,
        error: kumaRes.msg,
      });
    }
  });
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Express REST API running on http://localhost:${PORT}`);
});
