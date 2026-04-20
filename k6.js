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

export let options = {
  stages: [
    { duration: '30s', target: 50  },
    // { duration: '1m',  target: 100 },
    // { duration: '1m',  target: 150 },
    // { duration: '1m',  target: 200 },
    // { duration: '1m',  target: 250 },
    // { duration: '1m',  target: 300 },
    // { duration: '30s', target: 0   },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = 'http://localhost:8081';
const CMID     = 2;
const SLOTS    = 10;

function formatCookies(cookies) {
  let result = [];
  for (let name in cookies) {
    result.push(`${name}=${cookies[name][0].value}`);
  }
  return result.join('; ');
}

// Jawaban simulasi
// 0=A, 1=B, 2=C, 3=D (tergantung konfigurasi Moodle)
const ANSWERS = ['1', '3', '2', '1', '3', '1', '2', '3', '0', '3'];

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

  let cookieString = formatCookies(loginRes.cookies);
  let isLogin = loginRes.url.includes('/my/') || loginRes.body.includes('Dashboard');
  if (!isLogin) {
    console.error(`Login gagal: ${user.username}`);
    return;
  }

  sleep(1);

  // 3. OPEN QUIZ
  let quizPage = http.get(`${BASE_URL}/mod/quiz/view.php?id=${CMID}`, {
    headers: { Cookie: cookieString },
  });
  check(quizPage, { 'quiz kebuka': (r) => r.status === 200 });

  // 4. AMBIL SESSKEY
  let sesskey = quizPage.body.match(/"sesskey":"(.*?)"/)?.[1];
  if (!sesskey) {
    console.error("Sesskey tidak ditemukan");
    return;
  }

  sleep(1);

  // 5. START ATTEMPT
  let startRes = http.post(
    `${BASE_URL}/mod/quiz/startattempt.php`,
    { cmid: CMID, sesskey: sesskey },
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookieString,
      },
      redirects: 0,
    }
  );

  let location  = startRes.headers['Location'];
  if (!location) { console.error("Start attempt gagal, tidak ada Location"); return; }

  let attemptMatch = location.match(/attempt=(\d+)/);
  let attemptId    = attemptMatch ? attemptMatch[1] : null;
  if (!attemptId) { console.error("Attempt ID tidak ditemukan"); return; }

  sleep(1);

  // 6. PROCESS ATTEMPT (submit jawaban)
  // ini payload dinamis
  let payload = {
    attempt:        attemptId,
    cmid:           CMID,
    sesskey:        sesskey,
    finishattempt:  1,
    timeup:         0,
    slots:          Array.from({length: SLOTS}, (_, i) => i + 1).join(','),
    nextpage:       -1,
    thispage:       0,
  };

  // Menambahkan MetaData untuk playload
  for (let i = 1; i <= SLOTS; i++) {
    payload[`q${attemptId}:${i}_:flagged`]       = 0;
    payload[`q${attemptId}:${i}_:sequencecheck`] = 1;
    payload[`q${attemptId}:${i}_answer`]         = ANSWERS[i - 1] || '0';
  }

  let processRes = http.post(
    `http://localhost:3000/process-attempt`, 
    payload,
    { headers: { "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": cookieString }, redirects: 0 }
  );

  check(processRes, {
    'submit berhasil (303)':     (r) => r.status === 303,
    'redirect ke summary/review': (r) =>
      r.headers["Location"]?.includes("summary") ||
      r.headers["Location"]?.includes("review"),
    'response < 3s':             (r) => r.timings.duration < 3000,
  });

  sleep(1);
}
