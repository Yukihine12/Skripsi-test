import http from 'k6/http';
import { sleep, check } from 'k6';
import { SharedArray } from 'k6/data';

const users = new SharedArray('users', function () {
  const raw = open('./akunMoodle.txt');
  const lines = raw.split('\n').filter(l => l.trim() !== '');
  const header = lines[0].split(',');
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    let obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j].trim()] = values[j]?.trim();
    }
    data.push(obj);
  }
  return data.filter(u => u.username && u.password);
});

// SAMA PERSIS dengan k6.js agar perbandingan fair
export let options = {
  stages: [
    { duration: '30s', target: 50  },
    // { duration: '1m',  target: 100 },
    // { duration: '1m',  target: 200 },
    // { duration: '1m',  target: 300 },
    // { duration: '30s', target: 0   },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = 'http://localhost:8081';

function formatCookies(cookies) {
  let result = [];
  for (let name in cookies) {
    result.push(`${name}=${cookies[name][0].value}`);
  }
  return result.join('; ');
}

export default function () {
  let user = users[(__VU - 1) % users.length];

  // 1. GET LOGIN PAGE
  let loginPage = http.get(`${BASE_URL}/login/index.php`);
  let logintoken = loginPage.body.match(/name="logintoken" value="(.+?)"/)?.[1];
  if (!logintoken) {
    console.error("Token login tidak ditemukan");
    return;
  }

  // 2. LOGIN
  let loginRes = http.post(
    `${BASE_URL}/login/index.php`,
    { username: user.username, password: user.password, logintoken: logintoken },
    { redirects: 5 }
  );

  // PENTING: ambil cookies setelah login
  let cookieString = formatCookies(loginRes.cookies);

  let isLogin = loginRes.url.includes('/my/') || loginRes.body.includes('Dashboard');
  if (!isLogin) {
    console.error(`Login gagal: ${user.username}`);
    return;
  }

  sleep(1);

  // 3. AKSES HALAMAN KURSUS
  let courseRes = http.get(`${BASE_URL}/course/view.php?id=3`, {
    headers: { Cookie: cookieString }, // ← wajib ada
  });

  check(courseRes, {
    'halaman kursus terbuka': (r) => r.status === 200,
    'kursus < 3s':            (r) => r.timings.duration < 3000,
  });

  sleep(1);

  // 4. BUKA FILE MATERI (PDF)
  let materiRes = http.get(`${BASE_URL}/mod/resource/view.php?id=4`, {
    headers: { Cookie: cookieString }, // ← wajib ada
  });

  check(materiRes, {
    'materi pdf terbuka': (r) => r.status === 200,
    'pdf < 3s':           (r) => r.timings.duration < 3000,
  });

  sleep(1);
}