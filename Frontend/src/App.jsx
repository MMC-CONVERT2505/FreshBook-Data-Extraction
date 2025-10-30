import { useState } from "react";
import axios from "axios";
import "./App.css";

import { getAuthURL, fetchAccessToken, fetchFreshbooksData } from "./api";

function App() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [data, setData] = useState(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState("invoices");
  const [loading, setLoading] = useState(false);

  const backend = import.meta.env.VITE_BACKEND;

  const authorize = () => {
  const url = getAuthURL();
  console.log("Redirecting to:", url);
  window.location.href = url;
};


  const extractData = async () => {
    if (!start || !end) return alert("Select start & end dates first!");
    setLoading(true);
    try {
      const res = await axios.get(`${backend}/api/extract`, {
        params: { start_date: start, end_date: end, type },
      });
      setData(res.data);
      setAccessGranted(true);
    } catch (err) {
      alert("❌ Authorization required. Please click 'Authorize with FreshBooks' again.");
    }
    setLoading(false);
  };

  const downloadCSV = () => {
    if (!data) return;
    const items = Object.values(data.response.result)[0];
    if (!items?.length) return alert("No data found!");
    const headers = Object.keys(items[0]);
    const csv = [
      headers.join(","),
      ...items.map((r) => headers.map((h) => JSON.stringify(r[h] || "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${type}_data.csv`;
    link.click();
  };

  return (
    <div className="container">
      <h1>📊 FreshBooks Data Extraction</h1>
      <button className="auth-btn" onClick={authorize}>
        Authorize with FreshBooks
      </button>

      <div className="form">
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="invoices">Invoices</option>
          <option value="payments">Payments</option>
          <option value="expenses">Expenses</option>
          <option value="bills">Bills</option>
          <option value="clients">Clients</option>
          <option value="projects">Projects</option>
          <option value="time_entries">Time Entries</option>
        </select>
        <button onClick={extractData} disabled={loading}>
          {loading ? "Extracting..." : "Extract Data"}
        </button>
      </div>

      {data && (
        <>
          <button className="download-btn" onClick={downloadCSV}>
            ⬇️ Download CSV
          </button>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

export default App;
