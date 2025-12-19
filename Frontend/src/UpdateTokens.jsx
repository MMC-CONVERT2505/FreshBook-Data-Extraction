import { useState } from "react";
import axios from "axios";

function UpdateTokens() {
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const backend = import.meta.env.VITE_BACKEND;

  const handleUpdate = async () => {
    if (!accessToken || !refreshToken)
      return alert("Please enter Access and Refresh tokens!");
    try {
      const res = await axios.post(`${backend}/api/update-tokens`, {
        access_token: accessToken,
        refresh_token: refreshToken,
        account_id: accountId,
        business_id: businessId,
      });
      alert("✅ Tokens updated successfully!");
      console.log(res.data);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to update tokens!");
    }
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "12px", margin: "20px" }}>
      <h2>🔑 Update FreshBooks Tokens</h2>
      <input
        type="text"
        placeholder="Access Token"
        value={accessToken}
        onChange={(e) => setAccessToken(e.target.value)}
        style={{ display: "block", marginBottom: "10px", width: "100%" }}
      />
      <input
        type="text"
        placeholder="Refresh Token"
        value={refreshToken}
        onChange={(e) => setRefreshToken(e.target.value)}
        style={{ display: "block", marginBottom: "10px", width: "100%" }}
      />
      <input
        type="text"
        placeholder="Account ID (optional)"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        style={{ display: "block", marginBottom: "10px", width: "100%" }}
      />
      <input
        type="text"
        placeholder="Business ID (optional)"
        value={businessId}
        onChange={(e) => setBusinessId(e.target.value)}
        style={{ display: "block", marginBottom: "10px", width: "100%" }}
      />
      <button onClick={handleUpdate}>🚀 Update Tokens</button>
    </div>
  );
}

export default UpdateTokens;
