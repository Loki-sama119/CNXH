const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));

test('v6 browser regression: filters, shuffle, all answers, navigation, history and offline mode', { timeout: 120000 }, async () => {
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
    await page.goto(url);
    console.log('Browser loaded');
    await page.waitForFunction(() => allQuestions.length > 0);
    await page.locator('.toggle-label').filter({ has: page.locator('#autoadvance-toggle') }).click();
    await page.evaluate(() => { soundEnabled = false; });
    assert.equal(await page.locator('#count-all').textContent(), String(bank.length));

    // Every filter combination must contain exactly its eligible questions, each once.
    const filterChecks = await page.evaluate(() => {
      let checks = 0;
      for (const lesson of ['all', 'tx', '1', '2', '3', '4', '5', '6']) {
        for (const type of ['all', 'single_choice', 'multiple_choice', 'true_false', 'drag_drop']) {
          currentLesson = lesson; currentType = type; applyFiltersAndReset();
          const expected = allQuestions.filter(q => (lesson === 'all' || (lesson === 'tx' ? q.is_thuong_xuyen : q.lesson_num === Number(lesson))) && (type === 'all' || (type === 'drag_drop' ? q.type.startsWith(type) : q.type === type)));
          if (JSON.stringify(activeQuestions.map(q => q.id)) !== JSON.stringify(expected.map(q => q.id))) throw new Error(`Wrong distribution ${lesson}/${type}`);
          if (new Set(activeQuestions.map(questionContentKey)).size !== activeQuestions.length) throw new Error('Duplicate in filter');
          if (document.querySelectorAll('.nav-cell').length !== activeQuestions.length) throw new Error('Wrong drawer count');
          checks++;
        }
      }
      currentLesson = 'all'; currentType = 'all'; applyFiltersAndReset();
      const original = JSON.stringify(allQuestions);
      isShuffled = true;
      for (let i = 0; i < 100; i++) {
        applyFiltersAndReset();
        if (new Set(activeQuestions.map(q => q.id)).size !== allQuestions.length) throw new Error('Shuffle repeated or lost question');
        for (const q of activeQuestions.filter(q => q.options)) {
          const source = allQuestions.find(x => x.id === q.id);
          const answers = x => x.correct_answers.map(a => x.options[a].replace(/^[A-Z]\.\s*/, '')).sort();
          if (JSON.stringify(answers(q)) !== JSON.stringify(answers(source))) throw new Error('Shuffle changed correct answers');
        }
      }
      if (original !== JSON.stringify(allQuestions)) throw new Error('Source bank mutated');
      isShuffled = false;
      const tf = allQuestions.find(q => q.items);
      if (uniqueQuestions([tf, { ...tf, id: 'duplicate', items: [...tf.items].reverse() }]).length !== 1) throw new Error('Reordered true/false duplicate');
      return checks;
    });
    assert.equal(filterChecks, 40);
    console.log('Filters and shuffles passed');

    // Partially selected multiple choice answers survive navigating away and never leak.
    await page.evaluate(() => {
      startQuestionSession(allQuestions.filter(q => q.type === 'multiple_choice').slice(0, 2));
    });
    await page.locator('#qz-opt-0').click();
    await page.locator('#btn-next-q').click();
    assert.equal(await page.locator('.qz-multi-selected').count(), 0);
    await page.locator('#btn-prev-q').click();
    assert.equal(await page.locator('.qz-multi-selected').count(), 1);
    console.log('Partial selections passed');

    // Alternative Word phrasings remain playable within one canonical question.
    for (const source of bank.filter(q => q.variants)) {
      for (let index = 0; index < source.variants.length; index++) {
        await page.evaluate(id => {
          isShuffled = true;
          startQuestionSession([allQuestions.find(q => q.id === id)]);
        }, source.id);
        await page.locator('#question-variant-select').selectOption(String(index));
        const accepted = await page.evaluate(() => {
          const q = activeQuestions[0];
          const expected = q.variants[q.variantIndex || 0];
          const clean = s => s.replace(/^[A-Z]\.\s*/, '');
          const answers = q.correct_answers.map(i => clean(q.options[i])).sort();
          const sourceAnswers = expected.correct_answers.map(i => clean(expected.options[i])).sort();
          if (JSON.stringify(answers) !== JSON.stringify(sourceAnswers)) throw new Error('Variant shuffle changed answers');
          for (const answer of q.correct_answers) document.getElementById(`qz-opt-${answer}`).click();
          cancelPendingTransitions();
          return questionStates[q.id]?.isCorrect;
        });
        assert.equal(accepted, true, `Variant ${source.id}/${index}`);
        assert.equal(await page.locator('#question-variant-select').isDisabled(), true);
      }
    }
    await page.evaluate(() => {
      isShuffled = false;
      const source = allQuestions.find(q => q.variants && q.type === 'single_choice');
      startQuestionSession([source]);
      applyQuestionVariant(activeQuestions[0], 1); renderCurrentQuestion();
      const q = activeQuestions[0];
      handleSingleChoiceAnswer(q, q.options.findIndex((_, i) => !q.correct_answers.includes(i)));
      showCompletionScreen();
      const attempt = getHistoryList()[0];
      practiceWrongFromHistory(attempt.id);
      if (activeQuestions[0].variantIndex !== 1) throw new Error('History lost selected Word variant');
      cancelPendingTransitions();
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      localStorage.removeItem(LEADERBOARD_STORAGE_KEY);
    });
    console.log('Word variants and variant history passed');

    // Exercise every imported question through its DOM event handlers and grading code.
    const graded = await page.evaluate(() => {
      startQuestionSession(allQuestions);
      const counts = {};
      for (let i = 0; i < activeQuestions.length; i++) {
        currentIndex = i; renderCurrentQuestion();
        const q = activeQuestions[i];
        if (q.options) {
          for (const answer of q.correct_answers) document.getElementById(`qz-opt-${answer}`).click();
        } else if (q.items) {
          q.items.forEach((it, idx) => document.getElementById(`tf-btn-${idx}-${it.correct}`).click());
          document.getElementById(`btn-check-tf-${q.id}`).click();
        } else if (q.pairs) {
          q.pairs.forEach((pair, idx) => {
            [...document.querySelectorAll('.dnd-qz-chip')].find(chip => chip.textContent === pair.right).click();
            document.getElementById(`qz-slot-${idx}`).click();
          });
          document.querySelector('#hero-body .btn-check-dnd').click();
        } else {
          q.all_items.forEach(it => {
            [...document.querySelectorAll('.dnd-qz-pool .dnd-qz-chip')].find(chip => chip.textContent === it.text).click();
            [...document.querySelectorAll('.cat-box-header')].find(h => h.querySelector('.cat-box-title').textContent === it.category).parentElement.click();
          });
          document.querySelector('#hero-body .btn-check-dnd').click();
        }
        if (!questionStates[q.id]?.isAnswered || !questionStates[q.id]?.isCorrect) throw new Error(`Correct answer failed: ${q.lesson}/${q.q_num}/${q.type}`);
        counts[q.type] = (counts[q.type] || 0) + 1;
      }
      showCompletionScreen(); showCompletionScreen();
      if (getHistoryList().length !== 1 || getLeaderboardEntries().length !== 1) throw new Error('Duplicate history or leaderboard');
      if (getHistoryList()[0].correctCount !== allQuestions.length) throw new Error('Wrong summary score');
      return counts;
    });
    assert.equal(Object.values(graded).reduce((a, b) => a + b, 0), bank.length);
    assert.equal(await page.locator('#summary-screen').isVisible(), true);
    console.log('All correct answers passed');

    // Wrong answers for every type, review, retry, and history must use canonical IDs.
    const wrongCount = await page.evaluate(() => {
      const examples = [...new Set(allQuestions.map(q => q.type))].map(t => allQuestions.find(q => q.type === t));
      startQuestionSession(examples);
      for (let i = 0; i < activeQuestions.length; i++) {
        currentIndex = i; renderCurrentQuestion();
        const q = activeQuestions[i];
        if (q.type === 'single_choice') {
          document.getElementById(`qz-opt-${q.options.findIndex((_, n) => !q.correct_answers.includes(n))}`).click();
        } else if (q.type === 'multiple_choice') {
          document.getElementById(`qz-opt-${q.options.findIndex((_, n) => !q.correct_answers.includes(n))}`).click();
          document.getElementById('btn-check-multi').click();
        } else if (q.items) {
          q.items.forEach((it, idx) => document.getElementById(`tf-btn-${idx}-${!it.correct}`).click());
          handleTrueFalseSubmit(q);
        } else if (q.pairs) {
          q.pairs.forEach((pair, idx) => assignMatchOption(q, idx, q.pairs[(idx + 1) % q.pairs.length].right, document.getElementById('hero-body')));
          handleMatchSubmit(q);
        } else {
          q.all_items.forEach(it => { questionStates[q.id].userSelection[it.text] = q.categories.find(c => c.title !== it.category).title; });
          handleCategorizeSubmit(q);
        }
        if (!questionStates[q.id]?.isAnswered || questionStates[q.id]?.isCorrect) throw new Error(`Wrong answer accepted: ${q.type}`);
      }
      showCompletionScreen();
      return getHistoryList()[0].wrongCount;
    });
    assert.equal(wrongCount, 5);
    assert.equal(await page.locator('.wrong-review-card').count(), 5);
    await page.locator('.btn-retry-single-q').first().click();
    assert.equal(await page.evaluate(() => activeQuestions.length), 1);
    await page.evaluate(() => practiceWrongFromHistory(getHistoryList()[0].id));
    assert.equal(await page.evaluate(() => activeQuestions.length), 5);
    console.log('Wrong answers and history passed');
    await page.evaluate(() => {
      saveHistoryEntry({ id: 'legacy-check', wrongQIds: [50, 50, 92], lesson: 'all' });
      practiceWrongFromHistory('legacy-check');
      if (activeQuestions.length !== 2 || activeQuestions.some(q => typeof q.id !== 'string')) throw new Error('Legacy history migration failed');
    });

    // Complete a one-question session then immediately change lessons: no stale summary.
    await page.clock.install();
    await page.evaluate(() => {
      const q = allQuestions.find(q => q.type === 'single_choice');
      autoAdvanceEnabled = true; startQuestionSession([q]);
      handleSingleChoiceAnswer(activeQuestions[0], activeQuestions[0].correct_answers[0]);
      currentLesson = '2'; currentType = 'all'; applyFiltersAndReset();
    });
    await page.clock.runFor(5000);
    assert.equal(await page.locator('#summary-screen').isVisible(), false);
    assert.equal(await page.evaluate(() => currentIndex), 0);
    // Last-question navigation cannot finish while earlier questions are unanswered.
    await page.evaluate(() => { currentIndex = activeQuestions.length - 1; renderCurrentQuestion(); goToNextQuestion(); });
    assert.equal(await page.evaluate(() => currentIndex), 0);
    assert.equal(await page.locator('#summary-screen').isVisible(), false);
    await page.evaluate(() => startQuestionSession([]));
    assert.equal(await page.locator('#progress-text').textContent(), '0 / 0 (0%)');
    assert.equal(await page.locator('#btn-next-q').isDisabled(), true);
    await page.evaluate(() => {
      currentType = 'drag_drop';
      retakeLessonFromHistory('2');
      if (currentType !== 'all' || activeQuestions.length !== allQuestions.filter(q => q.lesson_num === 2).length) throw new Error('History retake kept stale type filter');
    });

    const fallback = await browser.newPage();
    fallback.on('pageerror', e => errors.push(e.message));
    await fallback.route('**/questions-data.js*', route => route.abort());
    await fallback.goto(url);
    await fallback.waitForFunction(() => activeQuestions.length > 0);
    assert.equal(await fallback.evaluate(() => allQuestions.length), bank.length);
    await fallback.close();

    // Offline double-click entry point loads the same bank; invalid saved preferences recover.
    const offline = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    offline.on('pageerror', e => errors.push(e.message));
    await offline.addInitScript(() => { localStorage.setItem('cnx_current_lesson', '99'); localStorage.setItem('cnx_current_type', 'broken'); });
    await offline.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await offline.waitForFunction(() => activeQuestions.length > 0);
    assert.equal(await offline.locator('#count-all').textContent(), String(bank.length));
    assert.equal(await offline.evaluate(() => currentLesson), 'all');
    for (const type of new Set(bank.map(q => q.type))) {
      await offline.evaluate(t => startQuestionSession([allQuestions.find(q => q.type === t)]), type);
      assert.equal(await offline.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Mobile overflow: ${type}`);
    }
    const resultDir = path.join(__dirname, 'results');
    fs.mkdirSync(resultDir, { recursive: true });
    await offline.evaluate(() => startQuestionSession([allQuestions.find(q => q.variants)]));
    await offline.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    await offline.screenshot({ path: path.join(resultDir, 'v6-mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(resultDir, 'v6-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Validated ${bank.length} questions, all five types, 40 filter combinations, 100 shuffles, desktop and mobile/offline.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
