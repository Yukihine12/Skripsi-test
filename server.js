import express from "express";
import fetch from "node-fetch";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// simulasi proses berat
function simulateProcessing() {
  return new Promise((resolve) => {
    setTimeout(resolve, 500); // delay 0.5 detik
  });
}

// endpoint utama
app.post("/start-attempt", async (req, res) => {
  try {
    console.log("📥 Request masuk ke service");

    await simulateProcessing();

    const response = await fetch(
      "http://localhost:8081/mod/quiz/startattempt.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": req.headers.cookie || "",
        },
        body: new URLSearchParams(req.body),
      }
    );

    const text = await response.text();

    console.log("✅ Forward ke Moodle selesai");

    res.status(response.status).send(text);

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send("Service error");
  }
});

// health check
app.get("/", (req, res) => {
  res.send("Service OK");
});

app.listen(3000, () => {
  console.log("🚀 Service jalan di port 3000");
});