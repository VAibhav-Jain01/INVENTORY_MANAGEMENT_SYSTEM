import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ✅ IMPORTANT: server-only Supabase admin client
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

app.get("/check-user", async (req, res) => {
  try {
    const email = req.query.email?.toString().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // ✅ ONLY supported admin-safe way
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });

    if (error) {
      console.error("Admin listUsers error:", error);
      return res.status(500).json({ error: "admin_error" });
    }

    const exists = data.users.some(
      (u) => u.email?.toLowerCase() === email
    );

    return res.json({ exists });

  } catch (err) {
    console.error("check-user exception:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Local check-user running on http://localhost:${PORT}/check-user`);
});
