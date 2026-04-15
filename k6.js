import http from 'k6/http';
import { sleep, check } from 'k6';
import { SharedArray } from 'k6/data';

// ==========================
// LOAD USER DATA
// ==========================
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

console.log(`TOTAL USER TERLOAD: ${users.length}`);

export let options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 300 },
    { duration: '30s', target: 0 }, 
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = 'http://localhost:8081';

// ==========================
// HELPER COOKIE
// ==========================
function formatCookies(cookies) {
  let result = [];
  for (let name in cookies) {
    result.push(`${name}=${cookies[name][0].value}`);
  }
  return result.join('; ');
}

// ==========================
// MAIN
// ==========================
export default function () {

  let user = users[(__VU - 1) % users.length];

  // ==========================
  // 1. GET LOGIN PAGE
  // ==========================
  let loginPage = http.get(`${BASE_URL}/login/index.php`);
  let logintoken = loginPage.body.match(/name="logintoken" value="(.+?)"/)?.[1];

  if (!logintoken) {
    console.warn("Token tidak ditemukan");
    return;
  }

  // ==========================
  // 2. LOGIN
  // ==========================
  let loginRes = http.post(`${BASE_URL}/login/index.php`, {
    username: user.username,
    password: user.password,
    logintoken: logintoken,
  }, { redirects: 5 });

  let isLogin = loginRes.url.includes('/my/') || loginRes.body.includes('Dashboard');

  if (!isLogin) {
    console.error(`Login gagal: ${user.username}`);
    return;
  }


  let cookieHeader = formatCookies(loginRes.cookies);

  sleep(1);

  // ==========================
  // 3. OPEN QUIZ
  // ==========================
  let quizRes = http.get(`${BASE_URL}/mod/quiz/view.php?id=2`, {
    headers: {
      "Cookie": cookieHeader,
    },
  });

  if (quizRes.url.includes('login')) {
    console.error(`Redirect login: ${user.username}`);
    return;
  }

  check(quizRes, {
    'quiz kebuka': (r) => r.status === 200,
    'response < 3s': (r) => r.timings.duration < 3000,
  });

  // ==========================
  // 4. AMBIL SESSKEY
  // ==========================
  let sesskey = quizRes.body.match(/"sesskey":"(.*?)"/)?.[1];

  if (!sesskey) {
    console.error("Sesskey tidak ditemukan");
    return;
  }

  sleep(1);

  // ==========================
  // 5. START ATTEMPT (via microservice)
  // ==========================
  let startRes = http.post(`http://localhost:3000/start-attempt`, {
    cmid: 2,
    sesskey: sesskey,
  }, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader,
    },
    redirects: 0,
  });

  check(startRes, {
    'start attempt success': (r) =>
    r.status === 303 ||
    r.body.includes('attempt='),
  });

  sleep(1);
}