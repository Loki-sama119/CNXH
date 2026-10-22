const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));

test('Nghiệp Vụ Thư Ký browser regression: 276 questions, tabs, navigation, answers, history, leaderboard', { timeout: 120000 }, async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, new URL(req.url, 'http://localhost').pathname === '/' ? 'index.html' : decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404).end(); return; }
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
      res.setHeader('Content-Type', `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`);
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.dismiss());
    const url = `http://127.0.0.1:${server.address().port}/`;

    await page.addInitScript(() => {
      localStorage.setItem('cnxhkh_quiz_history', JSON.stringify([{id:'old-source', wrongQIds:[1,2]}]));
      localStorage.setItem('cnxhkh_leaderboard', JSON.stringify([{id:'old-score',score:100}]));
      localStorage.setItem('cnx_current_lesson', '1');
      localStorage.setItem('cnxhkh_player_name', 'Học viên Thư Ký');
      localStorage.setItem('cnx_theme', 'dark');
    });

    await page.goto(url);
    await page.waitForFunction(() => allQuestions.length > 0);
    await page.locator('.toggle-label').filter({ has: page.locator('#autoadvance-toggle') }).click();
    await page.evaluate(() => { soundEnabled = false; });

    // Check bank size and counts
    assert.equal(await page.locator('#count-all').textContent(), '276');
    assert.equal(await page.locator('#count-b1').textContent(), '31');
    assert.equal(await page.locator('#count-b2').textContent(), '34');
    assert.equal(await page.locator('#count-b3').textContent(), '30');
    assert.equal(await page.locator('#count-b4').textContent(), '33');
    assert.equal(await page.locator('#count-b5').textContent(), '30');
    assert.equal(await page.locator('#count-b6').textContent(), '30');
    assert.equal(await page.locator('#count-b7').textContent(), '35');
    assert.equal(await page.locator('#count-b8').textContent(), '32');
    assert.equal(await page.locator('#count-b9').textContent(), '21');

    // Check lesson 1 tab
    await page.locator('button[data-lesson="1"]').click();
    assert.deepEqual(await page.evaluate(() => activeQuestions.map(q => q.q_num)), Array.from({length: 31}, (_, i) => i + 1));
    assert.equal(await page.evaluate(() => getLessonDisplayName('1')), 'Bài 1');
    assert.equal(await page.evaluate(() => getLessonDisplayName('7')), 'Bài 7');
    assert.equal(await page.evaluate(() => getLessonDisplayName('9')), 'Bài 9');

    // Check lesson 7 tab
    await page.locator('button[data-lesson="7"]').click();
    assert.equal(await page.evaluate(() => activeQuestions.length), 35);

    // Check lesson 9 tab
    await page.locator('button[data-lesson="9"]').click();
    assert.equal(await page.evaluate(() => activeQuestions.length), 21);

    // Return to all
    await page.locator('button[data-lesson="all"]').click();
    assert.equal(await page.evaluate(() => activeQuestions.length), 276);

    // Check bank version migration cleared old history and leaderboard
    assert.deepEqual(await page.evaluate(() => getHistoryList()), []);
    assert.deepEqual(await page.evaluate(() => getLeaderboardEntries()), []);
    assert.equal(await page.evaluate(() => getPlayerName()), 'Học viên Thư Ký');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('cnxhkh_bank_version')), await page.locator('meta[name="quiz-bank-version"]').getAttribute('content'));

    // Test answering: correct option produces correct answer
    // Lesson 1 Question 1: correct answer is option B (index 1)
    await page.evaluate(() => {
      isShuffled = false;
      startQuestionSession([allQuestions[0]]);
    });
    // Click option B (index 1)
    await page.locator('#qz-opt-1').click();
    await page.evaluate(() => cancelPendingTransitions());
    assert.equal(await page.evaluate(() => questionStates[activeQuestions[0].id]?.isCorrect), true);

    // Test answering incorrect option
    await page.evaluate(() => {
      isShuffled = false;
      startQuestionSession([allQuestions[1]]);
    });
    // For Q2: correct is A (index 0). Click index 1 (incorrect)
    await page.locator('#qz-opt-1').click();
    await page.evaluate(() => cancelPendingTransitions());
    assert.equal(await page.evaluate(() => questionStates[activeQuestions[0].id]?.isCorrect), false);

    // Test drawer open and navigation
    await page.locator('#drawer-toggle-btn').click();
    assert.equal(await page.locator('.drawer-panel.open').count(), 1);
    await page.locator('#drawer-close-btn').click();
    assert.equal(await page.locator('.drawer-panel.open').count(), 0);

    // Test theme toggle
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

    // Test history persistence across sessions
    const sessionPage = await browser.newPage();
    await sessionPage.goto(url);
    await sessionPage.waitForFunction(() => allQuestions.length > 0);
    await sessionPage.evaluate(() => saveHistoryEntry({id:'nvtk-session', wrongQIds:[], totalQuestions: 10}));
    await sessionPage.reload();
    await sessionPage.waitForFunction(() => allQuestions.length > 0);
    assert.equal(await sessionPage.evaluate(() => getHistoryList()[0]?.id), 'nvtk-session');
    await sessionPage.close();

    // Responsive checks on different screen widths
    for (const width of [1280, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => {
        startQuestionSession([allQuestions[0]]);
      });
      assert.equal(await page.locator('.quiz-card-hero').isVisible(), true);
      assert.equal(await page.locator('.qz-options-grid').isVisible(), true);
    }

    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
