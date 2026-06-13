import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn("Warning: OPENROUTER_API_KEY is not set. Please set it in your .env file.");
}

// Simple rate limiting (optional)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20; // Adjust as needed

function rateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  // Clean old entries (simple cleanup - in production use a proper store)
  for (const [timestamp, count] of requestCounts.entries()) {
    if (timestamp < windowStart) {
      requestCounts.delete(timestamp);
    }
  }

  // For simplicity, we're doing global rate limiting here
  // In production, you'd want per-IP or per-user rate limiting
  let totalRequests = 0;
  for (const count of requestCounts.values()) {
    totalRequests += count;
  }

  if (totalRequests >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  requestCounts.set(now, (requestCounts.get(now) || 0) + 1);
  return true;
}

// Proxy endpoint that forwards requests to OpenRouter
app.post("/api/analyze", async (req, res) => {
  try {
    // Check if API key is configured
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OpenRouter API key not configured on server" });
    }

    // Optional: Rate limiting
    // const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // if (!rateLimit(ip)) {
    //   return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
    // }

    // Forward the request to OpenRouter
    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          // Forward any other headers that might be needed
          ...(req.headers['x-forwarded-for'] ? { 'X-Forwarded-For': req.headers['x-forwarded-for'] } : {}),
        },
        body: JSON.stringify(req.body),
      }
    );

    // If OpenRouter returns an error, forward it
    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `OpenRouter API error: HTTP ${openRouterResponse.status}`;
      return res.status(openRouterResponse.status).json({ error: errorMessage });
    }

    // Forward the successful response from OpenRouter
    const data = await openRouterResponse.json();
    res.json(data);
  } catch (e) {
    console.error("Server error:", e);
    res.status(500).json({ error: e.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    hasApiKey: !!OPENROUTER_API_KEY
  });
});

const PORT = process.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  if (!OPENROUTER_API_KEY) {
    console.log("⚠️  Warning: OPENROUTER_API_KEY is not set. Please set it in your .env file.");
  }
});