import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// =====================================================
// 🧠 GLOBAL VARIABLES (Stores Access + Refresh Tokens)
// =====================================================
let accessToken = "";
let refreshToken = "";
let tokenExpiry = 0; // UNIX time in seconds

// =====================================================
// 🔁 FUNCTION: Automatically Refresh Token if Expired
// =====================================================
async function ensureAccessTokenValid() {
  const now = Math.floor(Date.now() / 1000);

  // ✅ Token still valid? Use it
  if (accessToken && now < tokenExpiry - 60) {
    return accessToken;
  }

  // ❌ No refresh token means user must reauthorize
  if (!refreshToken) {
    throw new Error("No refresh token available — please reauthorize.");
  }

  console.log("🔄 Refreshing access token...");

  try {
    const res = await axios.post("https://api.freshbooks.com/auth/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
    });

    accessToken = res.data.access_token;
    refreshToken = res.data.refresh_token;
    tokenExpiry = Math.floor(Date.now() / 1000) + res.data.expires_in;

    console.log("✅ Token refreshed successfully!");
    console.log("⏱ New Expiry:", res.data.expires_in, "seconds");
    return accessToken;
  } catch (err) {
    console.error("❌ Token refresh failed:", err.response?.data || err.message);
    throw new Error("Token refresh failed, please reauthorize manually.");
  }
}

// =====================================================
// ✅ ROOT CHECK
// =====================================================
app.get("/", (req, res) => {
  res.send("✅ FreshBooks API Backend is running fine!");
});

// =====================================================
// ✅ STEP 1: REDIRECT USER TO FRESHBOOKS AUTH
// =====================================================
app.get("/auth", (req, res) => {
  const authUrl = `https://auth.freshbooks.com/oauth/authorize?client_id=${
    process.env.CLIENT_ID
  }&response_type=code&redirect_uri=${encodeURIComponent(
    process.env.REDIRECT_URI
  )}&scope=${encodeURIComponent(process.env.SCOPE)}`;

  console.log("Redirecting user to:", authUrl);
  res.redirect(authUrl);
});

// =====================================================
// ✅ STEP 2: HANDLE FRESHBOOKS CALLBACK (GET TOKENS)
// =====================================================
app.get("/callback", async (req, res) => {
  const { code } = req.query;
  console.log("🔹 Callback received with code:", code);

  if (!code) return res.send("❌ Missing authorization code");

  try {
    const tokenRes = await axios.post(
      "https://api.freshbooks.com/auth/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
        code: code,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    // ✅ Save tokens + expiry time
    accessToken = tokenRes.data.access_token;
    refreshToken = tokenRes.data.refresh_token;
    tokenExpiry = Math.floor(Date.now() / 1000) + tokenRes.data.expires_in;

    console.log("✅ Access Token:", accessToken);
    console.log("🔁 Refresh Token:", refreshToken);
    console.log("⏱ Expires In:", tokenRes.data.expires_in, "seconds");

    res.send(`
      <h2>✅ Authorized Successfully!</h2>
      <p>Your backend now has a valid access token.</p>
      <p>Check your Render logs for token details.</p>
    `);
  } catch (error) {
    console.error("Auth Error:", error.response?.data || error.message);
    res.send(
      `<pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>`
    );
  }
});

// =====================================================
// ✅ STEP 3: FETCH DATA FROM FRESHBOOKS
// =====================================================
app.get("/api/extract", async (req, res) => {
  const { start_date, end_date, type } = req.query;
  const accountId = process.env.ACCOUNT_ID;
  const businessId = process.env.BUSINESS_ID;
  const base = process.env.FRESHBOOKS_API;

  const endpoints = {
    invoices: `/accounting/account/${accountId}/invoices/invoices`,
    expenses: `/accounting/account/${accountId}/expenses/expenses`,
    payments: `/accounting/account/${accountId}/payments/payments`,
    bills: `/accounting/account/${accountId}/bills/bills`,
    clients: `/accounting/account/${accountId}/clients/clients`,
    projects: `/projects/business/${businessId}/projects`,
  };

  const endpoint = endpoints[type];
  if (!endpoint)
    return res.status(400).json({ error: "Invalid data type selected" });

  try {
    // ✅ Make sure token is valid or refreshed
    const validToken = await ensureAccessTokenValid();

    const url = `${base}${endpoint}?search[start_date]=${start_date}&search[end_date]=${end_date}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Data Fetch Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// =====================================================
// ✅ SERVER START
// =====================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
