import http from 'k6/http';
import { sleep, check } from 'k6';
import { SharedArray } from 'k6/data';

// ==========================
// LOAD USER
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

// ==========================
// CONFIG (LEBIH RINGAN)
// ==========================
export let options = {
    stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 100 },
        // { duration: '1m', target: 200 },
        // { duration: '1m', target: 300 },
        // { duration: '30s', target: 0 },
    ],
};

const BASE_URL = 'http://localhost:8081';

// ==========================
// MAIN
// ==========================
export default function () {
    let user = users[(__VU - 1) % users.length];

    // ==========================
    // LOGIN PAGE
    // ==========================
    let loginPage = http.get(`${BASE_URL}/login/index.php`);
    let logintoken = loginPage.body.match(/name="logintoken" value="(.+?)"/)?.[1];

    if (!logintoken) return;

    // ==========================
    // LOGIN
    // ==========================
    let loginRes = http.post(`${BASE_URL}/login/index.php`, {
        username: user.username,
        password: user.password,
        logintoken: logintoken,
    });

    let isLogin = loginRes.url.includes('/my/') || loginRes.body.includes('Dashboard');
    if (!isLogin) return;

    sleep(1);

    // ==========================
    // AKSES MATERI (COURSE ID = 3)
    // ==========================
    let res = http.get(`${BASE_URL}/course/view.php?id=3`);
    check(res, {
        'materi kebuka': (r) => r.status === 200,
        'materi < 3s': (r) => r.timings.duration < 3000,
    });
    sleep(2);

    // ==========================
    // BUKA FILE MATERI (PDF)
    // ==========================
    let materiRes = http.get(`${BASE_URL}/mod/resource/view.php?id=4`);
    check(materiRes, {
        'materi pdf kebuka': (r) => r.status === 200,
        'pdf < 3s': (r) => r.timings.duration < 3000,
    });
}