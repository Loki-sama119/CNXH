const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));

test('Current Word browser regression: filters, shuffle, all answers, navigation, history and offline mode', { timeout: 120000 }, async () => {
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
      localStorage.setItem('cnx_current_lesson', '6');
      localStorage.setItem('cnxhkh_player_name', 'Người học');
      localStorage.setItem('cnx_theme', 'dark');
    });
    await page.goto(url);
    console.log('Browser loaded');
    await page.waitForFunction(() => allQuestions.length > 0);
    await page.locator('.toggle-label').filter({ has: page.locator('#autoadvance-toggle') }).click();
    await page.evaluate(() => { soundEnabled = false; });
    assert.equal(await page.locator('#count-all').textContent(), String(bank.length));
    assert.deepEqual(await page.evaluate(() => getHistoryList()), []);
    assert.deepEqual(await page.evaluate(() => getLeaderboardEntries()), []);
    assert.equal(await page.evaluate(() => currentLesson), 'all');
    assert.equal(await page.evaluate(() => getPlayerName()), 'Người học');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('cnxhkh_bank_version')), await page.locator('meta[name="quiz-bank-version"]').getAttribute('content'));
    const retained = await browser.newPage();
    await retained.goto(url);
    await retained.waitForFunction(() => allQuestions.length > 0);
    await retained.evaluate(() => saveHistoryEntry({id:'new-source-result',wrongQIds:[],totalQuestions:1}));
    await retained.reload();
    await retained.waitForFunction(() => allQuestions.length > 0);
    assert.equal(await retained.evaluate(() => getHistoryList()[0]?.id), 'new-source-result');
    await retained.close();

    // The approved correction must accept B, reject the old C, and survive shuffling.
    for (const [selected, expected] of [[1, true], [2, false]]) {
      const accepted = await page.evaluate(index => {
        isShuffled = false;
        startQuestionSession([allQuestions.find(q => q.body_index === 46)]);
        document.getElementById(`qz-opt-${index}`).click();
        cancelPendingTransitions();
        return questionStates[activeQuestions[0].id]?.isCorrect;
      }, selected);
      assert.equal(accepted, expected, `Approved question 10: option ${selected}`);
    }

    // Screenshot evidence places women in column one; both correct and incorrect drops must grade properly.
    for (const [wrongColumn, expected] of [[false, true], [true, false]]) {
      const accepted = await page.evaluate(useWrongColumn => {
        isShuffled = false;
        startQuestionSession([allQuestions.find(q => q.body_index === 855)]);
        const q = activeQuestions[0];
        if (q.all_items.length !== 8 || q.categories.some(c => c.items.length !== 4)) throw new Error('Question 40 lost a category item');
        if (document.querySelector('.source-warning')) throw new Error('Stale missing-answer warning');
        for (const item of q.all_items) {
          const category = useWrongColumn && item.text === 'Tầng lớp phụ nữ' ? q.categories[1].title : item.category;
          [...document.querySelectorAll('.dnd-qz-pool .dnd-qz-chip')].find(chip => chip.textContent === item.text).click();
          [...document.querySelectorAll('.cat-box-header')].find(header => header.querySelector('.cat-box-title').textContent === category).parentElement.click();
        }
        document.querySelector('#hero-body .btn-check-dnd').click();
        cancelPendingTransitions();
        return questionStates[q.id]?.isCorrect;
      }, wrongColumn);
      assert.equal(accepted, expected, 'Question 40 must assign women to column one');
    }

    // Reproduce dropping the third/fourth chip onto the bottom padding of a full-looking column.
    await page.evaluate(() => startQuestionSession([allQuestions.find(q => q.body_index === 855)]));
    const categories = bank.find(q => q.body_index === 855).categories;
    for (let column = 0; column < categories.length; column++) {
      for (let item = 0; item < categories[column].items.length; item++) {
        const chip = page.locator('.dnd-qz-pool .dnd-qz-chip').filter({ hasText: categories[column].items[item] });
        const box = page.locator('.cat-box-header').nth(column).locator('..');
        if (item < 2) {
          await chip.click();
          await box.locator('.cat-box-header').click();
        } else {
          const bounds = await box.boundingBox();
          await chip.dragTo(box, { targetPosition: { x: bounds.width / 2, y: bounds.height - 5 } });
        }
        assert.equal(await page.locator('.cat-dropzone').nth(column).locator('.dnd-qz-chip').count(), item + 1, `Column ${column + 1} must accept item ${item + 1}`);
      }
    }
    await page.locator('#hero-body .btn-check-dnd').click();
    assert.equal(await page.evaluate(() => questionStates[activeQuestions[0].id]?.isCorrect), true);
    await page.evaluate(() => cancelPendingTransitions());

    // Every filter combination must contain exactly its eligible questions, each once.
    const filterChecks = await page.evaluate(() => {
      let checks = 0;
      for (const lesson of ['all', 'tx', '1', '2', '3', '4', '5', '6']) {
        for (const type of ['all', 'single_choice', 'multiple_choice', 'true_false', 'drag_drop']) {
          currentLesson = lesson; currentType = type; applyFiltersAndReset();
          const expected = allQuestions.filter(q => (lesson === 'all' || (lesson === 'tx' ? q.is_thuong_xuyen : q.lesson_num === Number(lesson))) && (type === 'all' || (type === 'drag_drop' ? q.type.startsWith(type) : q.type === type)));
          if (JSON.stringify(activeQuestions.map(q => q.id)) !== JSON.stringify(expected.map(q => q.id))) throw new Error(`Wrong distribution ${lesson}/${type}`);
          if (new Set(activeQuestions.map(q => q.id)).size !== activeQuestions.length) throw new Error('Duplicate in filter');
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
      if (uniqueQuestions([tf, { ...tf, id: tf.id }]).length !== 1) throw new Error('Duplicate question not filtered');
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
      if (source) {
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
      }
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
      const ids = [allQuestions[0].id, allQuestions[0].id, allQuestions[1].id];
      saveHistoryEntry({ id: 'current-bank-check', wrongQIds: ids, lesson: 'all' });
      practiceWrongFromHistory('current-bank-check');
      if (activeQuestions.length !== 2) throw new Error('History repeated or lost current-bank questions');
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
    for (const width of [320, 390, 768]) {
      await offline.setViewportSize({width, height:844});
      const overflowing = await offline.evaluate(() => {
        const failures = [];
        startQuestionSession(allQuestions);
        for (let i=0; i<activeQuestions.length; i++) {
          currentIndex=i; renderCurrentQuestion();
          if (document.documentElement.scrollWidth > window.innerWidth) failures.push(activeQuestions[i].id);
          if (document.getElementById('hero-body').textContent.includes('\uFFFD')) throw new Error('Broken Unicode');
        }
        return failures;
      });
      assert.deepEqual(overflowing, [], `Horizontal overflow at ${width}px`);
    }
    await offline.setViewportSize({width:390, height:844});
    const resultDir = path.join(__dirname, 'results');
    fs.mkdirSync(resultDir, { recursive: true });
    await page.evaluate(() => { startQuestionSession([allQuestions.find(q => q.body_index === 855)]); window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(resultDir, 'lesson4-question40-fixed.png'), fullPage: true });
    for (const type of new Set(bank.map(q => q.type))) {
      await offline.evaluate(t => { startQuestionSession([allQuestions.find(q => q.type === t)]); window.scrollTo(0,0); }, type);
      await offline.screenshot({path:path.join(resultDir, `mobile-${type}.png`),fullPage:true});
    }
    await offline.evaluate(() => { startQuestionSession([allQuestions.find(q => q.body_index === 179)]); window.scrollTo(0,0); });
    await offline.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    await offline.screenshot({ path: path.join(resultDir, 'word-mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(resultDir, 'word-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Validated ${bank.length} questions, all five types, 40 filter combinations, 100 shuffles, desktop and mobile/offline.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
