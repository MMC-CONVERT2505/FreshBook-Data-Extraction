import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE;
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_CLIENT_SECRET;
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI;

// ✅ Correct FreshBooks OAuth URL
export const getAuthURL = () => {
  const url = `https://auth.freshbooks.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=${encodeURIComponent(
    "user:profile:read user:business:read user:clients:read user:invoices:read user:expenses:read user:payments:read user:bills:read"
  )}`;
  console.log("Generated Auth URL:", url);
  return url;
};

// ✅ Exchange code for access token
export const fetchAccessToken = async (code) => {
  const res = await axios.post(`${API_BASE}/auth/oauth/token`, {
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  });
  return res.data.access_token;
};

// ✅ Fetch FreshBooks data
export const fetchFreshbooksData = async (
  accessToken,
  type,
  start,
  end,
  accountId,
  businessId
) => {
  const endpoints = {
    invoices: `/accounting/account/${accountId}/invoices/invoices`,
    expenses: `/accounting/account/${accountId}/expenses/expenses`,
    payments: `/accounting/account/${accountId}/payments/payments`,
    bills: `/accounting/account/${accountId}/bills/bills`,
    clients: `/accounting/account/${accountId}/clients/clients`,
    projects: `/projects/business/${businessId}/projects`,
  };

  const endpoint = endpoints[type];
  if (!endpoint) throw new Error("Invalid data type selected");

  const url = `${API_BASE}${endpoint}?search[start_date]=${start}&search[end_date]=${end}`;
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.data;
};
