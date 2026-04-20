import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const queue = [];
const MAX_WORKERS = 10; // proses 10 request sekaligus
let activeWorkers = 0;

async function processQueue() {
  // Jalankan worker selama masih ada item dan belum mencapai batas
  while (queue.length > 0 && activeWorkers < MAX_WORKERS) {
    const { body, cookies, resolve } = queue.shift();
    activeWorkers++;

    // Jalankan secara async tanpa menunggu (fire and manage)
    (async () => {
      try {
        const response = await fetch(
          "http://localhost:8081/mod/quiz/processattempt.php",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Cookie": cookies,
            },
            body: new URLSearchParams(body),
            redirect: "manual",
          }
        );
        resolve({
          status: response.status,
          headers: Object.fromEntries(response.headers)
        });
      } catch (err) {
        resolve({ status: 500, error: err.message });
      } finally {
        activeWorkers--;
        processQueue(); // cek apakah ada item baru setelah worker selesai
      }
    })();
  }
}

app.post("/process-attempt", (req, res) => {
  console.log(`📥 Queue: ${queue.length + 1} | Workers aktif: ${activeWorkers}`);

  new Promise((resolve) => {
    queue.push({
      body: req.body,
      cookies: req.headers.cookie || "",
      resolve,
    });
    processQueue();
  }).then(({ status, headers }) => {
    if (headers?.location) {
      res.setHeader("Location", headers.location);
    }
    res.status(status).send("processed");
  });
});

app.get("/health", (req, res) => res.json({
  status: "OK",
  queue_length: queue.length,
  active_workers: activeWorkers
}));

app.listen(3000, () => console.log("🚀 Grading service jalan di port 3000"));