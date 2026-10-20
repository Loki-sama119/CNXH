/**
 * CNXHKH QUIZIZZ - TRẮC NGHIỆM TƯƠNG TÁC PHẢN HỒI TỨC THÌ
 * Tự động nhận diện đáp án bôi đỏ từ file Word và trả kết quả ngay lập tức khi bấm chọn!
 */

// ================= GLOBAL STATE =================
let allQuestions = [];
let activeQuestions = [];
let currentIndex = 0;

// Answer states per question: { [qid]: { isAnswered: bool, isCorrect: bool, userSelection: any } }
let questionStates = {};

let score = 0;
let streak = 0;
let maxStreak = 0;
let soundEnabled = true;
let isShuffled = false;
let currentLesson = 'all'; // 'all', '1', '2', '3', '4', '5', '6'
let currentType = 'all';
let autoAdvanceEnabled = true;
let hasSavedCurrentSessionHistory = false;
let completionTimeout = null;

function cancelPendingTransitions() {
  clearTimeout(autoNextTimeout);
  clearTimeout(completionTimeout);
  autoNextTimeout = null;
  completionTimeout = null;
  touchSelectedChip = null;
}

function questionContentKey(q) {
  const normalize = text => String(text).normalize('NFC').toLowerCase()
    .replace(/^(?:câu\s*\d+\s*[:.]?|[a-f\d]+[.)])\s*/i, '')
    .replace(/\(chọn\s+[^)]*\)/gi, '').replace(/[\s\p{P}_]+/gu, '');
  let content;
  if (q.options) content = normalize(q.question);
  else if (q.items) content = q.items.map(it => normalize(it.statement)).sort();
  else if (q.pairs) content = q.pairs.map(p => [normalize(p.left), normalize(p.right)]).sort();
  else content = q.all_items.map(it => [normalize(it.text), normalize(it.category)]).sort();
  return JSON.stringify([q.type, content]);
}

function uniqueQuestions(questions) {
  const ids = new Set();
  return questions.filter(q => {
    if (ids.has(q.id)) return false;
    ids.add(q.id);
    return true;
  });
}

// Touch drag state
let touchSelectedChip = null;

// ================= AUDIO SYNTHESIZER (WEB AUDIO API) =================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'correct') {
      // High pleasant 3-tone arpeggio (C5 - E5 - G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.18, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } else if (type === 'wrong') {
      // Gentle low buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.setValueAtTime(130, now + 0.12);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'streak') {
      // High celebratory chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {
    // Fail silently if audio is blocked by browser policy
  }
}

// ================= CONFETTI CANVAS EFFECT =================
const confettiCanvas = document.getElementById('confetti-canvas');
let confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
let confettiParticles = [];
let confettiAnimationId = null;

function resizeConfetti() {
  if (confettiCanvas) {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
}
window.addEventListener('resize', resizeConfetti);
resizeConfetti();

function fireConfetti() {
  if (!confettiCtx) return;
  const count = 45;
  const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4'];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight * 0.4;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    confettiParticles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: 0.015 + Math.random() * 0.02,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10
    });
  }

  if (!confettiAnimationId) {
    animateConfetti();
  }
}

function animateConfetti() {
  if (!confettiCtx) return;
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2; // gravity
    p.alpha -= p.decay;
    p.rotation += p.vRot;

    if (p.alpha <= 0) {
      confettiParticles.splice(i, 1);
      continue;
    }

    confettiCtx.save();
    confettiCtx.globalAlpha = p.alpha;
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate((p.rotation * Math.PI) / 180);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    confettiCtx.restore();
  }

  if (confettiParticles.length > 0) {
    confettiAnimationId = requestAnimationFrame(animateConfetti);
  } else {
    confettiAnimationId = null;
  }
}

// ================= INITIALIZATION =================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadQuestionsData();
  resetPreviousBankStorage();
  restoreSavedPreferences();
  initEventListeners();
  applyFiltersAndReset(0);
});

function resetPreviousBankStorage() {
  const version = document.querySelector('meta[name="quiz-bank-version"]').content;
  try {
    if (localStorage.getItem('cnxhkh_bank_version') === version) return;
    // Scores and numeric question IDs from previous sources have no meaning here.
    for (const key of [HISTORY_STORAGE_KEY, LEADERBOARD_STORAGE_KEY, 'cnx_current_lesson', 'cnx_current_type']) {
      localStorage.removeItem(key);
    }
    localStorage.setItem('cnxhkh_bank_version', version);
  } catch (e) {
    console.warn('Trình duyệt không cho phép lưu dữ liệu cục bộ.', e);
  }
}

function restoreSavedPreferences() {
  const savedLesson = localStorage.getItem('cnx_current_lesson');
  if (savedLesson && ['all', 'tx', '1', '2', '3', '4', '5', '6'].includes(savedLesson)) {
    currentLesson = savedLesson;
    document.querySelectorAll('#lesson-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lesson === savedLesson);
    });
  }

  const savedType = localStorage.getItem('cnx_current_type');
  if (savedType && ['all', 'single_choice', 'multiple_choice', 'true_false', 'drag_drop'].includes(savedType)) {
    currentType = savedType;
    const typeSelect = document.getElementById('type-filter');
    if (typeSelect) typeSelect.value = savedType;
  }
}

// Load questions from window.QUIZ_QUESTIONS or fetch questions.json
async function loadQuestionsData() {
  if (window.QUIZ_QUESTIONS && Array.isArray(window.QUIZ_QUESTIONS) && window.QUIZ_QUESTIONS.length > 0) {
    allQuestions = window.QUIZ_QUESTIONS;
  } else {
    try {
      const version = document.querySelector('meta[name="quiz-bank-version"]').content;
      const response = await fetch(`questions.json?v=${encodeURIComponent(version)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      allQuestions = await response.json();
    } catch (e) {
      console.error('Không thể load file questions.json:', e);
      return;
    }
  }
  allQuestions = uniqueQuestions(allQuestions);
  updateLessonTabCounts();
}

function updateLessonTabCounts() {
  const countAllEl = document.getElementById('count-all');
  if (countAllEl) countAllEl.textContent = allQuestions.length;
  const brandBadge = document.getElementById('brand-total-badge');
  if (brandBadge) brandBadge.textContent = `${allQuestions.length} bài tập`;
  for (let i = 1; i <= 10; i++) {
    const el = document.getElementById(`count-b${i}`);
    if (el) {
      const count = allQuestions.filter(q => q.lesson_num === i).length;
      el.textContent = count;
    }
  }
  const countTxEl = document.getElementById('count-tx');
  const txTabBtn = document.querySelector('button[data-lesson="tx"]');
  const txCount = allQuestions.filter(q => q.is_thuong_xuyen).length;
  if (countTxEl) {
    countTxEl.textContent = txCount;
  }
  if (txTabBtn) {
    txTabBtn.style.display = txCount > 0 ? '' : 'none';
  }
}

// ================= THEME =================
function initTheme() {
  const saved = localStorage.getItem('cnx_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('cnx_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(t) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
}

// ================= FILTER & SHUFFLE =================
function applyFiltersAndReset(targetIndex = 0) {
  let filtered = allQuestions;
  if (currentLesson === 'tx') {
    filtered = filtered.filter(q => q.is_thuong_xuyen);
  } else if (currentLesson !== 'all') {
    const lnum = parseInt(currentLesson);
    filtered = filtered.filter(q => q.lesson_num === lnum);
  }

  if (currentType !== 'all') {
    if (currentType === 'drag_drop') {
      filtered = filtered.filter(q => q.type.startsWith('drag_drop'));
    } else {
      filtered = filtered.filter(q => q.type === currentType);
    }
  }

  startQuestionSession(filtered, targetIndex);
}

function startQuestionSession(questions, targetIndex = 0) {
  cancelPendingTransitions();
  activeQuestions = JSON.parse(JSON.stringify(uniqueQuestions(questions)));

  if (isShuffled) {
    shuffleArray(activeQuestions);
    activeQuestions.forEach(q => {
      if (q.type === 'single_choice' || q.type === 'multiple_choice') {
        shuffleQuestionOptions(q);
      }
      if (q.options_pool) shuffleArray(q.options_pool);
      if (q.all_items) shuffleArray(q.all_items);
    });
  }

  // Reset state for new set
  questionStates = {};
  score = 0;
  streak = 0;
  maxStreak = 0;
  hasSavedCurrentSessionHistory = false;
  updateScoreboard();

  currentIndex = Math.min(targetIndex, Math.max(0, activeQuestions.length - 1));
  document.getElementById('summary-screen').style.display = 'none';
  document.getElementById('quizizz-arena').style.display = 'flex';

  renderCurrentQuestion();
  renderDrawerGrid();
  updateProgressUI();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function shuffleQuestionOptions(q) {
  if (!q.options || q.options.length < 2) return;
  const originalPairs = q.options.map((opt, idx) => ({
    text: opt.replace(/^[A-Z]\.\s*/, ''),
    isCorrect: q.correct_answers.includes(idx)
  }));
  shuffleArray(originalPairs);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  q.options = originalPairs.map((p, idx) => `${letters[idx]}. ${p.text}`);
  q.correct_answers = originalPairs
    .map((p, idx) => p.isCorrect ? idx : -1)
    .filter(idx => idx !== -1);
}

// ================= RENDER CURRENT QUESTION HERO CARD =================
function applyQuestionVariant(q, index) {
  const variant = q.variants?.[index];
  if (!variant) return;
  const copy = JSON.parse(JSON.stringify(variant));
  for (const key of ['type', 'options', 'correct_answers', 'instruction']) q[key] = copy[key];
  q.question = `Câu ${q.q_num}: ${copy.question}`;
  q.variantIndex = index;
  if (isShuffled) shuffleQuestionOptions(q);
}

function renderCurrentQuestion() {
  clearTimeout(autoNextTimeout);
  autoNextTimeout = null;
  touchSelectedChip = null;
  if (activeQuestions.length === 0) {
    document.getElementById('question-hero-card').innerHTML = `
      <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
        <div style="font-size:3rem; margin-bottom:1rem;">🔍</div>
        <h3>Không có câu hỏi nào khớp với bộ lọc</h3>
        <p>Vui lòng chọn bộ lọc khác để làm bài.</p>
      </div>
    `;
    hideFeedbackBanner();
    document.getElementById('btn-prev-q').disabled = true;
    document.getElementById('btn-next-q').disabled = true;
    document.getElementById('arena-counter-text').textContent = 'Câu 0 / 0';
    document.getElementById('header-progress-label').textContent = 'Câu 0 / 0';
    return;
  }

  const q = activeQuestions[currentIndex];
  const heroCard = document.getElementById('question-hero-card');
  const typeLabel = getTypeLabel(q.type);

  // Card Header Meta
  const txBadge = q.is_thuong_xuyen
    ? `<span class="badge-tx-pill">${q.test_group && q.test_group.includes('1') ? '⚡ KT Thường Xuyên 1' : '⚡ KT Thường Xuyên 2'}</span>`
    : '';

  const sourceBadge = (q.source_q_num !== null && q.source_q_num !== undefined && q.source_q_num !== q.q_num)
    ? `<span class="badge-source-pill" title="Số thứ tự câu trong file Word gốc">Gốc: Câu ${q.source_q_num}</span>`
    : (q.source_q_num === null ? `<span class="badge-source-pill" title="Câu này trong file Word gốc chưa đánh số">Gốc: Chưa đánh số</span>` : '');

  heroCard.innerHTML = `
    <div class="hero-meta">
      <div class="hero-meta-left">
        <span class="badge-lesson-pill">${q.lesson} - Câu ${q.q_num}</span>
        ${sourceBadge}
        ${txBadge}
        <span class="badge-type-pill">${typeLabel}</span>
      </div>
      <div class="question-counter-pill">Câu ${currentIndex + 1} / ${activeQuestions.length}</div>
    </div>
    <div class="hero-question-title">${escapeHtml(q.question)}</div>
    <div class="hero-instruction">⚡ ${escapeHtml(q.instruction || '')}</div>
    ${q.source_warning ? `<p class="source-warning">${escapeHtml(q.source_warning)}</p>` : ''}
    <div class="hero-body" id="hero-body"></div>
  `;

  const heroBody = document.getElementById('hero-body');
  if (q.variants?.length > 1) {
    const label = document.createElement('label');
    label.className = 'question-variant-picker';
    label.textContent = 'Các cách hỏi trong tài liệu Word';
    const picker = document.createElement('select');
    picker.id = 'question-variant-select';
    picker.className = 'custom-select';
    q.variants.forEach((v, index) => {
      const option = document.createElement('option');
      option.value = index;
      const sourceNumber = v.sources?.[0]?.question_number;
      option.textContent = `Cách hỏi ${index + 1}${sourceNumber ? ` · Câu ${sourceNumber} trong Word` : ''}`;
      picker.appendChild(option);
    });
    picker.value = q.variantIndex || 0;
    picker.disabled = !!questionStates[q.id]?.isAnswered;
    picker.addEventListener('change', () => {
      if (questionStates[q.id]?.isAnswered) return;
      delete questionStates[q.id];
      applyQuestionVariant(q, Number(picker.value));
      renderCurrentQuestion();
    });
    label.appendChild(picker);
    heroBody.before(label);
  }

  // Render question based on type
  if (q.type === 'single_choice' || q.type === 'multiple_choice') {
    renderQuizizzChoice(heroBody, q);
  } else if (q.type === 'true_false') {
    renderQuizizzTrueFalse(heroBody, q);
  } else if (q.type === 'drag_drop_match') {
    renderQuizizzDragDropMatch(heroBody, q);
  } else if (q.type === 'drag_drop_categorize') {
    renderQuizizzDragDropCategorize(heroBody, q);
  }

  // Check if this question was already answered
  const state = questionStates[q.id];
  if (state && state.isAnswered) {
    showAnsweredState(q, state);
  } else {
    hideFeedbackBanner();
  }

  // Update navigation buttons
  document.getElementById('btn-prev-q').disabled = currentIndex === 0;
  document.getElementById('btn-next-q').disabled = currentIndex === activeQuestions.length - 1;
  document.getElementById('arena-counter-text').textContent = `Câu ${currentIndex + 1} / ${activeQuestions.length}`;
  document.getElementById('header-progress-label').textContent = `Câu ${currentIndex + 1} / ${activeQuestions.length}`;

  updateDrawerCurrentHighlight();
}

function getTypeLabel(t) {
  switch (t) {
    case 'single_choice': return '1 Đáp Án Đúng';
    case 'multiple_choice': return 'Nhiều Đáp Án Đúng';
    case 'true_false': return 'Đúng / Sai Theo Mệnh Đề';
    case 'drag_drop_match': return 'Kéo Thả Ghép Vế';
    case 'drag_drop_categorize': return 'Phân Loại 2 Cột';
    default: return 'Trắc Nghiệm';
  }
}

// ================= TYPE 1: SINGLE & MULTIPLE CHOICE (QUIZIZZ CARDS) =================
function renderQuizizzChoice(container, q) {
  const isMulti = q.type === 'multiple_choice';
  const grid = document.createElement('div');
  grid.className = 'qz-options-grid';

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const userMultiSelections = questionStates[q.id]?.userSelection || [];

  q.options.forEach((optText, optIdx) => {
    const btn = document.createElement('div');
    btn.className = `qz-option-btn opt-${optIdx % 4}`;
    btn.id = `qz-opt-${optIdx}`;
    if (isMulti && !questionStates[q.id]?.isAnswered && userMultiSelections.includes(optIdx)) {
      btn.classList.add('qz-multi-selected');
    }

    // Clean text (remove old label if duplicated)
    const cleanText = optText.replace(/^[A-Z]\.\s*/, '');
    const letter = letters[optIdx] || `${optIdx + 1}`;

    btn.innerHTML = `
      <div class="qz-letter">${letter}</div>
      <div class="qz-text">${escapeHtml(cleanText)}</div>
    `;

    // Click handler: INSTANT FEEDBACK!
    btn.addEventListener('click', () => {
      if (questionStates[q.id]?.isAnswered) return;

      if (!isMulti) {
        // Single Choice: Instant answer!
        handleSingleChoiceAnswer(q, optIdx);
      } else {
        // Multi Choice: toggle selection
        handleMultiChoiceToggle(q, optIdx, btn);
      }
    });

    grid.appendChild(btn);
  });

  container.appendChild(grid);

  // If multiple choice, add Submit Check button
  if (isMulti) {
    const checkBtnWrapper = document.createElement('div');
    checkBtnWrapper.style.marginTop = '1.25rem';
    checkBtnWrapper.style.display = 'flex';
    checkBtnWrapper.style.justifyContent = 'flex-end';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-check-dnd';
    checkBtn.id = 'btn-check-multi';
    checkBtn.textContent = 'Kiểm tra đáp án ➜';
    checkBtn.addEventListener('click', () => {
      handleMultiChoiceSubmit(q);
    });

    checkBtnWrapper.appendChild(checkBtn);
    container.appendChild(checkBtnWrapper);
  }
}

// Handle Single Choice: INSTANT GREEN / RED!
function handleSingleChoiceAnswer(q, selectedIdx) {
  if (questionStates[q.id]?.isAnswered || !Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= q.options.length) return;
  const correctIdx = q.correct_answers[0];
  const isCorrect = selectedIdx === correctIdx;

  // Save state
  questionStates[q.id] = {
    isAnswered: true,
    isCorrect: isCorrect,
    userSelection: selectedIdx
  };

  const selectedBtn = document.getElementById(`qz-opt-${selectedIdx}`);
  const correctBtn = document.getElementById(`qz-opt-${correctIdx}`);

  // Disable all options
  document.querySelectorAll('.qz-option-btn').forEach(b => b.classList.add('qz-disabled'));

  if (isCorrect) {
    // Correct!
    selectedBtn.classList.remove('qz-disabled');
    selectedBtn.classList.add('qz-correct');
    playSound('correct');
    fireConfetti();

    streak++;
    if (streak > maxStreak) maxStreak = streak;
    const pointsWon = 100 + (streak > 1 ? (streak - 1) * 20 : 0);
    score += pointsWon;

    showFeedbackBanner(
      true,
      `🎉 CHÍNH XÁC! +${pointsWon} điểm`,
      streak > 1 ? `🔥 Chuỗi đúng x${streak}! Đang tự động chuyển câu...` : `Chuẩn xác! Đang tự động chuyển câu...`
    );
    scheduleAutoAdvance(1200);
  } else {
    // Wrong!
    selectedBtn.classList.remove('qz-disabled');
    selectedBtn.classList.add('qz-wrong');

    // Highlight the correct answer (BÔI ĐỎ) in green!
    if (correctBtn) {
      correctBtn.classList.remove('qz-disabled');
      correctBtn.classList.add('qz-correct');
    }

    playSound('wrong');
    streak = 0;

    const correctText = q.options[correctIdx];
    const answerLabel = q.answer_correction ? 'Đáp án đã hiệu đính' : 'Đáp án chuẩn (bôi đỏ trong tài liệu)';
    showFeedbackBanner(
      false,
      `💡 CHƯA ĐÚNG!`,
      `${answerLabel} là: <strong>${escapeHtml(correctText)}</strong>. Đang tự chuyển câu...`
    );
    scheduleAutoAdvance(2200);
  }

  updateScoreboard();
  updateProgressUI();
  updateDrawerCell(q.id);
}

// Handle Multi Choice Toggle
function handleMultiChoiceToggle(q, optIdx, btn) {
  if (questionStates[q.id]?.isAnswered) return;
  if (!questionStates[q.id]) questionStates[q.id] = { isAnswered: false, userSelection: [] };
  const multiSelectionBuffer = questionStates[q.id].userSelection;
  const pos = multiSelectionBuffer.indexOf(optIdx);
  if (pos > -1) {
    multiSelectionBuffer.splice(pos, 1);
    btn.classList.remove('qz-multi-selected');
  } else {
    multiSelectionBuffer.push(optIdx);
    btn.classList.add('qz-multi-selected');
  }

  // If user selected enough options, auto-evaluate or prompt
  const reqCount = q.correct_answers.length;
  if (multiSelectionBuffer.length === reqCount) {
    handleMultiChoiceSubmit(q);
  }
}

function handleMultiChoiceSubmit(q) {
  if (questionStates[q.id]?.isAnswered) return;
  const multiSelectionBuffer = questionStates[q.id]?.userSelection || [];
  if (multiSelectionBuffer.length === 0) {
    alert(`Vui lòng chọn các đáp án bạn cho là đúng.`);
    return;
  }

  const sortedUser = [...multiSelectionBuffer].sort();
  const sortedCorrect = [...q.correct_answers].sort();
  const isCorrect = sortedUser.length === sortedCorrect.length && sortedUser.every((v, i) => v === sortedCorrect[i]);

  questionStates[q.id] = {
    isAnswered: true,
    isCorrect: isCorrect,
    userSelection: [...multiSelectionBuffer]
  };

  document.querySelectorAll('.qz-option-btn').forEach((btn, idx) => {
    btn.classList.add('qz-disabled');
    btn.classList.remove('qz-multi-selected');

    const isUserChosen = multiSelectionBuffer.includes(idx);
    const isStandard = q.correct_answers.includes(idx);

    if (isStandard) {
      btn.classList.remove('qz-disabled');
      btn.classList.add('qz-correct');
    } else if (isUserChosen && !isStandard) {
      btn.classList.remove('qz-disabled');
      btn.classList.add('qz-wrong');
    }
  });

  const checkBtn = document.getElementById('btn-check-multi');
  if (checkBtn) checkBtn.style.display = 'none';

  if (isCorrect) {
    playSound('correct');
    fireConfetti();
    streak++;
    if (streak > maxStreak) maxStreak = streak;
    score += 150;
    showFeedbackBanner(true, '🎉 XUẤT SẮC! +150 điểm', 'Bạn đã chọn chính xác tất cả các đáp án! Đang chuyển câu...');
    scheduleAutoAdvance(1500);
  } else {
    playSound('wrong');
    streak = 0;
    const correctAnswersText = q.correct_answers.map(i => q.options[i]).join('; ');
    showFeedbackBanner(false, '💡 CHƯA HOÀN TOÀN ĐÚNG!', `Các đáp án chuẩn (bôi đỏ) là: <strong>${escapeHtml(correctAnswersText)}</strong>. Đang chuyển câu...`);
    scheduleAutoAdvance(2500);
  }

  updateScoreboard();
  updateProgressUI();
  updateDrawerCell(q.id);
}

// ================= TYPE 2: TRUE / FALSE =================
function renderQuizizzTrueFalse(container, q) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tf-qz-card';

  if (!questionStates[q.id]) {
    questionStates[q.id] = { isAnswered: false, isCorrect: false, userSelection: {} };
  }

  const userMap = questionStates[q.id].userSelection || {};
  const isAnswered = questionStates[q.id].isAnswered;

  q.items.forEach((item, itemIdx) => {
    const row = document.createElement('div');
    row.className = 'tf-qz-row';
    row.id = `tf-row-${itemIdx}`;

    const textEl = document.createElement('div');
    textEl.className = 'tf-qz-text';
    textEl.textContent = item.statement;

    const actions = document.createElement('div');
    actions.className = 'tf-qz-actions';

    const btnT = document.createElement('button');
    btnT.className = 'tf-choice-btn';
    btnT.id = `tf-btn-${itemIdx}-true`;
    btnT.textContent = '✓ Đúng';

    const btnF = document.createElement('button');
    btnF.className = 'tf-choice-btn';
    btnF.id = `tf-btn-${itemIdx}-false`;
    btnF.textContent = '✕ Sai';

    const currentChoice = userMap[itemIdx];
    if (isAnswered) {
      btnT.disabled = true;
      btnF.disabled = true;
      if (item.correct === true) {
        btnT.classList.add('qz-correct');
        if (currentChoice === false) btnF.classList.add('qz-wrong');
      } else {
        btnF.classList.add('qz-correct');
        if (currentChoice === true) btnT.classList.add('qz-wrong');
      }
    } else {
      if (currentChoice === true) btnT.classList.add('selected-choice');
      if (currentChoice === false) btnF.classList.add('selected-choice');

      btnT.addEventListener('click', () => {
        userMap[itemIdx] = true;
        btnT.classList.add('selected-choice');
        btnF.classList.remove('selected-choice');
      });

      btnF.addEventListener('click', () => {
        userMap[itemIdx] = false;
        btnF.classList.add('selected-choice');
        btnT.classList.remove('selected-choice');
      });
    }

    actions.appendChild(btnT);
    actions.appendChild(btnF);
    row.appendChild(textEl);
    row.appendChild(actions);
    wrapper.appendChild(row);
  });

  if (!isAnswered) {
    const checkBtnWrapper = document.createElement('div');
    checkBtnWrapper.style.marginTop = '1.25rem';
    checkBtnWrapper.style.display = 'flex';
    checkBtnWrapper.style.justifyContent = 'flex-end';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-check-dnd';
    checkBtn.id = `btn-check-tf-${q.id}`;
    checkBtn.textContent = 'Kiểm tra kết quả ➜';
    checkBtn.addEventListener('click', () => {
      handleTrueFalseSubmit(q);
    });

    checkBtnWrapper.appendChild(checkBtn);
    wrapper.appendChild(checkBtnWrapper);
  }

  container.appendChild(wrapper);
}

function handleTrueFalseSubmit(q) {
  if (questionStates[q.id]?.isAnswered) return;
  const userMap = questionStates[q.id]?.userSelection || {};
  const answeredCount = Object.keys(userMap).length;

  if (answeredCount < q.items.length) {
    alert(`Vui lòng chọn Đúng hoặc Sai cho tất cả ${q.items.length} phát biểu trước khi ấn kiểm tra! (Hiện đã chọn: ${answeredCount}/${q.items.length})`);
    return;
  }

  const allCorrect = q.items.every((it, idx) => userMap[idx] === it.correct);
  questionStates[q.id].isAnswered = true;
  questionStates[q.id].isCorrect = allCorrect;

  q.items.forEach((item, itemIdx) => {
    const btnT = document.getElementById(`tf-btn-${itemIdx}-true`);
    const btnF = document.getElementById(`tf-btn-${itemIdx}-false`);
    if (!btnT || !btnF) return;

    btnT.disabled = true;
    btnF.disabled = true;
    btnT.classList.remove('selected-choice');
    btnF.classList.remove('selected-choice');

    if (item.correct === true) {
      btnT.classList.add('qz-correct');
      if (userMap[itemIdx] === false) btnF.classList.add('qz-wrong');
    } else {
      btnF.classList.add('qz-correct');
      if (userMap[itemIdx] === true) btnT.classList.add('qz-wrong');
    }
  });

  const checkBtn = document.getElementById(`btn-check-tf-${q.id}`);
  if (checkBtn) checkBtn.style.display = 'none';

  if (allCorrect) {
    playSound('correct');
    fireConfetti();
    streak++;
    if (streak > maxStreak) maxStreak = streak;
    score += 150;
    showFeedbackBanner(true, '🎉 XUẤT SẮC! +150 điểm', 'Bạn đã trả lời đúng toàn bộ các mệnh đề! Đang tự chuyển câu...');
    scheduleAutoAdvance(2000);
  } else {
    playSound('wrong');
    streak = 0;
    const keyStr = q.items.map((it, idx) => `(${idx+1}) ${it.correct ? 'ĐÚNG' : 'SAI'}`).join(' | ');
    showFeedbackBanner(false, '💡 ĐÁP ÁN CHUẨN CÁC MỆNH ĐỀ:', `Kết quả chuẩn là: <strong>${escapeHtml(keyStr)}</strong>. Đang tự chuyển câu...`);
    scheduleAutoAdvance(3200);
  }

  updateScoreboard();
  updateProgressUI();
  updateDrawerCell(q.id);
}

// ================= TYPE 3: DRAG & DROP MATCH =================
function renderQuizizzDragDropMatch(container, q) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dnd-qz-container';

  if (!questionStates[q.id]) {
    questionStates[q.id] = { isAnswered: false, isCorrect: false, userSelection: {} };
  }

  const userMatchMap = questionStates[q.id].userSelection || {};
  const isAnswered = questionStates[q.id].isAnswered;

  // Slots
  const slotsContainer = document.createElement('div');
  slotsContainer.className = 'dnd-qz-slots';

  q.pairs.forEach((pair, pairIdx) => {
    const row = document.createElement('div');
    row.className = 'dnd-qz-row';

    const prompt = document.createElement('div');
    prompt.className = 'dnd-qz-prompt';
    prompt.textContent = pair.left;

    const slot = document.createElement('div');
    slot.className = 'dnd-qz-slot';
    slot.id = `qz-slot-${pairIdx}`;
    slot.dataset.pairIdx = pairIdx;

    const currentVal = userMatchMap[pairIdx];

    if (isAnswered) {
      const isSlotRight = (currentVal === pair.right);
      if (isSlotRight) {
        slot.className = 'dnd-qz-slot filled dnd-slot-correct';
        slot.innerHTML = `
          <div class="dnd-slot-result">
            <div class="dnd-slot-user-row">
              <span class="dnd-badge dnd-badge-v">✓ ĐÚNG</span>
              <span class="dnd-chip-text">${escapeHtml(currentVal)}</span>
            </div>
          </div>
        `;
      } else {
        slot.className = 'dnd-qz-slot filled dnd-slot-wrong';
        slot.innerHTML = `
          <div class="dnd-slot-result">
            <div class="dnd-slot-user-row">
              <span class="dnd-badge dnd-badge-x">✕ SAI</span>
              <span class="dnd-chip-text" style="text-decoration:line-through; opacity:0.85;">${escapeHtml(currentVal || '(Chưa ghép)')}</span>
            </div>
            <div class="dnd-slot-correct-row">
              <span class="dnd-badge-v-mini">✓ Chuẩn</span>
              <strong>${escapeHtml(pair.right)}</strong>
            </div>
          </div>
        `;
      }
    } else {
      if (currentVal) {
        slot.classList.add('filled');
        slot.innerHTML = `<span>${escapeHtml(currentVal)}</span> <small style="margin-left:8px; opacity:0.7; font-weight:bold;">✕ Bỏ</small>`;
      } else {
        slot.innerHTML = `<span style="color:var(--primary); font-size:0.82rem; font-weight:600;">👉 Chạm chọn đáp án để gắn vào đây</span>`;
      }

      slot.addEventListener('dragover', (e) => e.preventDefault());
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        if (questionStates[q.id].isAnswered) return;
        const text = e.dataTransfer.getData('text/plain');
        if (text) assignMatchOption(q, pairIdx, text, container);
      });

      slot.addEventListener('click', () => {
        if (questionStates[q.id].isAnswered) return;
        if (userMatchMap[pairIdx]) {
          delete userMatchMap[pairIdx];
          const targetContainer = document.getElementById('hero-body') || container;
          renderQuizizzDragDropMatch(targetContainer, q);
          return;
        }
        if (touchSelectedChip && touchSelectedChip.qid === q.id) {
          const targetContainer = document.getElementById('hero-body') || container;
          assignMatchOption(q, pairIdx, touchSelectedChip.text, targetContainer);
          touchSelectedChip = null;
          document.querySelectorAll('.dnd-qz-slot').forEach(s => s.classList.remove('slot-pulse-ready'));
        }
      });
    }

    row.appendChild(prompt);
    row.appendChild(slot);
    slotsContainer.appendChild(row);
  });

  wrapper.appendChild(slotsContainer);

  // Pool & Check Button (only when not answered)
  if (!isAnswered) {
    const poolWrapper = document.createElement('div');
    poolWrapper.style.display = 'flex';
    poolWrapper.style.flexDirection = 'column';
    poolWrapper.style.gap = '0.4rem';

    const poolTitle = document.createElement('div');
    poolTitle.style.fontSize = '0.82rem';
    poolTitle.style.fontWeight = '700';
    poolTitle.style.color = 'var(--text-secondary)';
    poolTitle.innerHTML = '💡 <strong>Đáp án lựa chọn:</strong> (Bấm chọn đáp án rồi chạm vào ô ở trên để gắn)';
    poolWrapper.appendChild(poolTitle);

    const pool = document.createElement('div');
    pool.className = 'dnd-qz-pool';

    const usedValues = Object.values(userMatchMap);

    q.options_pool.forEach((optText, optIdx) => {
      const isUsed = usedValues.includes(optText);
      const chip = document.createElement('div');
      chip.className = 'dnd-qz-chip';
      chip.textContent = optText;
      chip.draggable = !isUsed;

      if (isUsed) {
        chip.style.opacity = '0.3';
        chip.style.cursor = 'default';
        chip.style.pointerEvents = 'none';
      }

      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', optText);
      });

      chip.addEventListener('click', () => {
        if (isUsed) return;
        document.querySelectorAll('.dnd-qz-chip').forEach(c => c.classList.remove('selected-touch'));
        chip.classList.add('selected-touch');
        touchSelectedChip = { qid: q.id, text: optText };
        document.querySelectorAll('.dnd-qz-slot:not(.filled)').forEach(s => s.classList.add('slot-pulse-ready'));
      });

      pool.appendChild(chip);
    });

    poolWrapper.appendChild(pool);
    wrapper.appendChild(poolWrapper);

    // Check Button
    const checkBtnWrapper = document.createElement('div');
    checkBtnWrapper.style.display = 'flex';
    checkBtnWrapper.style.justifyContent = 'flex-end';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-check-dnd';
    checkBtn.textContent = 'Kiểm tra kết quả ➜';
    checkBtn.addEventListener('click', () => {
      handleMatchSubmit(q);
    });

    checkBtnWrapper.appendChild(checkBtn);
    wrapper.appendChild(checkBtnWrapper);
  }

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function assignMatchOption(q, pairIdx, text, container) {
  if (questionStates[q.id]?.isAnswered || !q.options_pool.includes(text) || !q.pairs[pairIdx]) return;
  if (!questionStates[q.id]) {
    questionStates[q.id] = { isAnswered: false, isCorrect: false, userSelection: {} };
  }
  const map = questionStates[q.id].userSelection;
  Object.keys(map).forEach(k => {
    if (map[k] === text) delete map[k];
  });
  map[pairIdx] = text;
  const targetContainer = document.getElementById('hero-body') || container;
  renderQuizizzDragDropMatch(targetContainer, q);
}

function handleMatchSubmit(q) {
  if (questionStates[q.id]?.isAnswered) return;
  const map = questionStates[q.id]?.userSelection || {};
  if (Object.keys(map).length < q.pairs.length) {
    alert('Vui lòng ghép đầy đủ các vế câu hỏi trước khi kiểm tra.');
    return;
  }

  const isCorrect = q.pairs.every((pair, idx) => map[idx] === pair.right);
  questionStates[q.id].isAnswered = true;
  questionStates[q.id].isCorrect = isCorrect;

  // Re-render immediately to show V and X marks on slots
  const targetContainer = document.getElementById('hero-body');
  if (targetContainer) {
    renderQuizizzDragDropMatch(targetContainer, q);
  }

  if (isCorrect) {
    playSound('correct');
    fireConfetti();
    streak++;
    score += 150;
    showFeedbackBanner(true, '🎉 CHÍNH XÁC! +150 điểm', 'Bạn đã ghép đúng tất cả các vế! Đang tự chuyển câu...');
    scheduleAutoAdvance(2000);
  } else {
    playSound('wrong');
    streak = 0;
    showFeedbackBanner(false, '💡 CHƯA CHÍNH XÁC!', 'Xem chi tiết các ý đúng (✓) và sai (✕) cùng đáp án chuẩn ở trên. Đang tự chuyển câu...');
    scheduleAutoAdvance(4500);
  }

  updateScoreboard();
  updateProgressUI();
  updateDrawerCell(q.id);
}

// ================= TYPE 4: DRAG & DROP CATEGORIZE (2 COLUMNS) =================
function renderQuizizzDragDropCategorize(container, q) {
  if (!questionStates[q.id]) {
    questionStates[q.id] = { isAnswered: false, isCorrect: false, userSelection: {} };
  }
  const userCatMap = questionStates[q.id].userSelection || {};
  const isAnswered = questionStates[q.id].isAnswered;
  const cat1 = q.categories[0];
  const cat2 = q.categories[1];

  const wrapper = document.createElement('div');
  wrapper.className = 'dnd-qz-container';

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
  grid.style.gap = '1rem';

  [cat1, cat2].forEach(cat => {
    const box = document.createElement('div');
    box.style.background = 'var(--bg-tertiary)';
    box.style.border = '2px solid var(--border-color)';
    box.style.borderRadius = 'var(--radius-lg)';
    box.style.padding = '1rem';

    // Header with stats when answered
    const header = document.createElement('div');
    header.className = 'cat-box-header';

    const headerTitle = document.createElement('div');
    headerTitle.className = 'cat-box-title';
    headerTitle.textContent = cat.title;
    header.appendChild(headerTitle);

    const placedTexts = Object.keys(userCatMap).filter(k => userCatMap[k] === cat.title);

    if (isAnswered) {
      const correctCount = placedTexts.filter(text => {
        const itemObj = q.all_items.find(it => it.text === text);
        return itemObj && itemObj.category === cat.title;
      }).length;
      const statBadge = document.createElement('div');
      statBadge.className = `cat-stat-badge ${correctCount === cat.items.length && placedTexts.length === cat.items.length ? 'cat-stat-perfect' : 'cat-stat-partial'}`;
      statBadge.textContent = `${correctCount}/${placedTexts.length} ý đúng`;
      header.appendChild(statBadge);
    }

    box.appendChild(header);

    const dropzone = document.createElement('div');
    dropzone.className = 'cat-dropzone';
    dropzone.style.minHeight = '100px';
    dropzone.style.display = 'flex';
    dropzone.style.flexDirection = 'column';
    dropzone.style.gap = '0.5rem';

    // Placed items in this column
    placedTexts.forEach(itemText => {
      const chip = document.createElement('div');

      if (isAnswered) {
        const itemObj = q.all_items.find(it => it.text === itemText);
        const correctCategory = itemObj ? itemObj.category : '';
        const isItemCorrect = (correctCategory === cat.title);

        chip.className = `dnd-qz-chip dnd-chip-answered ${isItemCorrect ? 'dnd-chip-correct' : 'dnd-chip-wrong'}`;
        chip.draggable = false;

        if (isItemCorrect) {
          chip.innerHTML = `
            <div class="dnd-chip-main">
              <span class="dnd-badge dnd-badge-v">✓ ĐÚNG</span>
              <span class="dnd-chip-text">${escapeHtml(itemText)}</span>
            </div>
          `;
        } else {
          chip.innerHTML = `
            <div class="dnd-chip-main">
              <span class="dnd-badge dnd-badge-x">✕ SAI</span>
              <span class="dnd-chip-text">${escapeHtml(itemText)}</span>
            </div>
            <div class="dnd-chip-hint">
              <span class="dnd-hint-lead">➔ Cột đúng:</span>
              <span class="dnd-hint-target">${escapeHtml(correctCategory)}</span>
            </div>
          `;
        }
      } else {
        chip.className = 'dnd-qz-chip';
        chip.innerHTML = `<span>${escapeHtml(itemText)}</span> <small style="margin-left:8px; opacity:0.7; font-weight:bold;">✕ Bỏ</small>`;
        chip.addEventListener('click', () => {
          if (questionStates[q.id].isAnswered) return;
          delete userCatMap[itemText];
          const targetContainer = document.getElementById('hero-body') || container;
          renderQuizizzDragDropCategorize(targetContainer, q);
        });
      }

      dropzone.appendChild(chip);
    });

    if (!isAnswered) {
      dropzone.addEventListener('dragover', (e) => e.preventDefault());
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (questionStates[q.id].isAnswered) return;
        const text = e.dataTransfer.getData('text/plain');
        if (q.all_items.some(item => item.text === text)) {
          userCatMap[text] = cat.title;
          const targetContainer = document.getElementById('hero-body') || container;
          renderQuizizzDragDropCategorize(targetContainer, q);
        }
      });

      box.addEventListener('click', (e) => {
        if (questionStates[q.id].isAnswered || e.target.closest('.dnd-qz-chip')) return;
        if (touchSelectedChip && touchSelectedChip.qid === q.id) {
          userCatMap[touchSelectedChip.text] = cat.title;
          touchSelectedChip = null;
          document.querySelectorAll('.cat-dropzone').forEach(d => d.classList.remove('slot-pulse-ready'));
          const targetContainer = document.getElementById('hero-body') || container;
          renderQuizizzDragDropCategorize(targetContainer, q);
        }
      });
    }

    box.appendChild(dropzone);
    grid.appendChild(box);
  });

  wrapper.appendChild(grid);

  // Pool
  const assigned = Object.keys(userCatMap);
  const unassigned = q.all_items.filter(itemObj => !assigned.includes(itemObj.text));

  if (!isAnswered) {
    const poolWrapper = document.createElement('div');
    poolWrapper.style.display = 'flex';
    poolWrapper.style.flexDirection = 'column';
    poolWrapper.style.gap = '0.4rem';

    const poolTitle = document.createElement('div');
    poolTitle.style.fontSize = '0.82rem';
    poolTitle.style.fontWeight = '700';
    poolTitle.style.color = 'var(--text-secondary)';
    poolTitle.innerHTML = '💡 <strong>Các mục cần phân loại:</strong> (Bấm chọn mục rồi bấm vào khung cột ở trên để xếp)';
    poolWrapper.appendChild(poolTitle);

    const pool = document.createElement('div');
    pool.className = 'dnd-qz-pool';

    unassigned.forEach((itemObj) => {
      const chip = document.createElement('div');
      chip.className = 'dnd-qz-chip';
      chip.textContent = itemObj.text;
      chip.draggable = true;

      chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', itemObj.text);
      });

      chip.addEventListener('click', () => {
        document.querySelectorAll('.dnd-qz-chip').forEach(c => c.classList.remove('selected-touch'));
        chip.classList.add('selected-touch');
        touchSelectedChip = { qid: q.id, text: itemObj.text };
        document.querySelectorAll('.cat-dropzone').forEach(d => d.classList.add('slot-pulse-ready'));
      });

      pool.appendChild(chip);
    });

    poolWrapper.appendChild(pool);
    wrapper.appendChild(poolWrapper);

    // Check button
    const checkBtnWrapper = document.createElement('div');
    checkBtnWrapper.style.display = 'flex';
    checkBtnWrapper.style.justifyContent = 'flex-end';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn-check-dnd';
    checkBtn.textContent = 'Kiểm tra phân loại ➜';
    checkBtn.addEventListener('click', () => {
      handleCategorizeSubmit(q);
    });

    checkBtnWrapper.appendChild(checkBtn);
    wrapper.appendChild(checkBtnWrapper);
  }

  container.innerHTML = '';
  container.appendChild(wrapper);
}

function handleCategorizeSubmit(q) {
  if (questionStates[q.id]?.isAnswered) return;
  const map = questionStates[q.id]?.userSelection || {};
  if (Object.keys(map).length < q.all_items.length) {
    alert('Vui lòng phân loại hết các mục vào cột trước khi kiểm tra.');
    return;
  }

  const isCorrect = q.all_items.every(it => map[it.text] === it.category);
  questionStates[q.id].isAnswered = true;
  questionStates[q.id].isCorrect = isCorrect;

  // Immediately re-render with V and X marks on chips in columns!
  const targetContainer = document.getElementById('hero-body');
  if (targetContainer) {
    renderQuizizzDragDropCategorize(targetContainer, q);
  }

  if (isCorrect) {
    playSound('correct');
    fireConfetti();
    streak++;
    score += 150;
    showFeedbackBanner(true, '🎉 CHÍNH XÁC! +150 điểm', 'Bạn đã phân loại chính xác toàn bộ các mục vào hai cột! Đang tự chuyển câu...');
    scheduleAutoAdvance(2000);
  } else {
    playSound('wrong');
    streak = 0;
    showFeedbackBanner(false, '💡 CHƯA ĐÚNG HOÀN TOÀN!', 'Xem chi tiết các ý đúng (✓) và sai (✕) cùng cột chuẩn ở bên trên. Đang tự chuyển câu...');
    scheduleAutoAdvance(4500);
  }

  updateScoreboard();
  updateProgressUI();
  updateDrawerCell(q.id);
}

// ================= SHOW PREVIOUSLY ANSWERED STATE =================
function showAnsweredState(q, state) {
  if (q.type === 'single_choice') {
    const correctIdx = q.correct_answers[0];
    document.querySelectorAll('.qz-option-btn').forEach((btn, idx) => {
      btn.classList.add('qz-disabled');
      if (idx === correctIdx) {
        btn.classList.remove('qz-disabled');
        btn.classList.add('qz-correct');
      } else if (idx === state.userSelection && !state.isCorrect) {
        btn.classList.remove('qz-disabled');
        btn.classList.add('qz-wrong');
      }
    });

    if (state.isCorrect) {
      showFeedbackBanner(true, '✓ Câu này bạn đã trả lời ĐÚNG!', 'Bấm Câu tiếp theo để làm câu kế tiếp.');
    } else {
      const correctText = q.options[correctIdx];
      showFeedbackBanner(false, '✕ Câu này bạn đã trả lời SAI', `Đáp án chuẩn (bôi đỏ): <strong>${escapeHtml(correctText)}</strong>`);
    }
  } else if (q.type === 'multiple_choice') {
    document.querySelectorAll('.qz-option-btn').forEach((btn, idx) => {
      btn.classList.add('qz-disabled');
      const isUserChosen = (state.userSelection || []).includes(idx);
      const isStandard = q.correct_answers.includes(idx);
      if (isStandard) {
        btn.classList.remove('qz-disabled');
        btn.classList.add('qz-correct');
      } else if (isUserChosen && !isStandard) {
        btn.classList.remove('qz-disabled');
        btn.classList.add('qz-wrong');
      }
    });
    if (state.isCorrect) {
      showFeedbackBanner(true, '✓ Câu này bạn đã trả lời ĐÚNG!', 'Bấm Câu tiếp theo để làm câu kế tiếp.');
    } else {
      const correctAnswersText = q.correct_answers.map(i => q.options[i]).join('; ');
      showFeedbackBanner(false, '✕ Câu này bạn trả lời CHƯA ĐÚNG', `Các đáp án chuẩn (bôi đỏ) là: <strong>${escapeHtml(correctAnswersText)}</strong>`);
    }
  } else if (q.type === 'true_false') {
    if (state.isCorrect) {
      showFeedbackBanner(true, '✓ Bạn đã trả lời ĐÚNG toàn bộ mệnh đề!', 'Bấm Câu tiếp theo để tiếp tục.');
    } else {
      const keyStr = q.items.map((it, idx) => `(${idx+1}) ${it.correct ? 'ĐÚNG' : 'SAI'}`).join(' | ');
      showFeedbackBanner(false, '✕ Bạn trả lời CHƯA CHÍNH XÁC', `Đáp án chuẩn: <strong>${escapeHtml(keyStr)}</strong>`);
    }
  } else if (q.type === 'drag_drop_categorize') {
    if (state.isCorrect) {
      showFeedbackBanner(true, '✓ Bạn đã phân loại ĐÚNG tất cả các cột!', 'Bấm Câu tiếp theo để tiếp tục.');
    } else {
      showFeedbackBanner(false, '✕ Phân loại CHƯA ĐÚNG HOÀN TOÀN', 'Xem chi tiết các ý đúng (✓) và sai (✕) cùng cột chuẩn ở bên trên.');
    }
  } else if (q.type === 'drag_drop_match') {
    if (state.isCorrect) {
      showFeedbackBanner(true, '✓ Bạn đã ghép ĐÚNG tất cả các vế!', 'Bấm Câu tiếp theo để tiếp tục.');
    } else {
      showFeedbackBanner(false, '✕ Ghép vế CHƯA ĐÚNG HOÀN TOÀN', 'Xem chi tiết các ý đúng (✓) và sai (✕) cùng đáp án chuẩn ở bên trên.');
    }
  } else {
    showFeedbackBanner(state.isCorrect, state.isCorrect ? '✓ Bạn đã làm đúng câu này' : '✕ Bạn làm sai câu này', 'Bấm Câu tiếp theo để tiếp tục.');
  }
}

// ================= FEEDBACK BANNER =================
function showFeedbackBanner(isCorrect, title, sub) {
  const banner = document.getElementById('feedback-banner');
  const icon = document.getElementById('feedback-icon');
  const titleEl = document.getElementById('feedback-title');
  const subEl = document.getElementById('feedback-sub');

  banner.className = `feedback-banner ${isCorrect ? 'show-correct' : 'show-wrong'}`;
  banner.style.display = 'flex';
  icon.textContent = isCorrect ? '🎉' : '💡';
  titleEl.innerHTML = title;
  subEl.innerHTML = sub;
}

function hideFeedbackBanner() {
  const banner = document.getElementById('feedback-banner');
  banner.className = 'feedback-banner';
  banner.style.display = 'none';
}

// ================= SCORE & PROGRESS =================
function updateScoreboard() {
  if (streak > maxStreak) maxStreak = streak;
  document.getElementById('score-counter').textContent = score.toLocaleString();
  const streakPill = document.getElementById('streak-pill');
  const streakCounter = document.getElementById('streak-counter');
  streakCounter.textContent = streak;

  if (streak >= 3) {
    streakPill.classList.add('fire-boost');
    setTimeout(() => streakPill.classList.remove('fire-boost'), 500);
  }
}

function updateProgressUI() {
  const variantPicker = document.getElementById('question-variant-select');
  if (variantPicker) variantPicker.disabled = !!questionStates[activeQuestions[currentIndex]?.id]?.isAnswered;
  const total = activeQuestions.length;
  const answeredCount = activeQuestions.filter(q => questionStates[q.id]?.isAnswered).length;
  const percent = total ? Math.round((answeredCount / total) * 100) : 0;

  const fill = document.getElementById('progress-bar-fill');
  const text = document.getElementById('progress-text');

  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${answeredCount} / ${total} (${percent}%)`;

  // If completed all questions in current filtered set
  if (answeredCount === total && total > 0 && !completionTimeout && !hasSavedCurrentSessionHistory) {
    // Show summary after slight delay
    completionTimeout = setTimeout(() => {
      completionTimeout = null;
      showCompletionScreen();
    }, 1200);
  }
}

// ================= COMPLETION SCREEN =================
function showCompletionScreen() {
  if (!activeQuestions.length || activeQuestions.some(q => !questionStates[q.id]?.isAnswered)) return;
  cancelPendingTransitions();
  document.getElementById('quizizz-arena').style.display = 'none';
  const summaryScreen = document.getElementById('summary-screen');
  summaryScreen.style.display = 'block';

  // Find all questions that are not answered correctly
  const wrongQuestions = activeQuestions.filter(q => !questionStates[q.id]?.isCorrect);
  const correctCount = activeQuestions.length - wrongQuestions.length;
  const wrongCount = wrongQuestions.length;
  const total = activeQuestions.length;
  const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  document.getElementById('final-score').textContent = score.toLocaleString();
  document.getElementById('final-correct').textContent = `${correctCount} / ${total}`;
  document.getElementById('final-wrong').textContent = `${wrongCount} câu`;

  const titleEl = document.getElementById('summary-title');
  const descEl = document.getElementById('summary-desc');
  const btnReview = document.getElementById('btn-review-mistakes');

  if (wrongCount === 0) {
    if (btnReview) btnReview.style.display = 'none';
  } else {
    if (btnReview) {
      btnReview.style.display = 'inline-flex';
      btnReview.innerHTML = `<span>🎯</span> <span>Ôn lại ${wrongCount} câu làm sai</span>`;
    }
  }

  if (percent >= 90) {
    titleEl.textContent = '🌟 Xuất Sắc Tuyệt Vời!';
    descEl.textContent = `Bạn đạt ${percent}% câu đúng. Kiến thức lý luận của bạn vô cùng vững vàng!`;
    fireConfetti();
  } else if (percent >= 70) {
    titleEl.textContent = '🎉 Làm Bài Rất Tốt!';
    descEl.textContent = `Bạn đạt ${percent}% câu đúng. Thành tích rất ấn tượng!`;
    fireConfetti();
  } else {
    titleEl.textContent = '📚 Hoàn Thành Luyện Tập!';
    descEl.textContent = `Bạn đạt ${percent}% câu đúng. Hãy ôn lại những câu làm sai để ghi nhớ tốt hơn nhé!`;
  }

  // Save attempt to history and leaderboard if not already saved for this session
  if (!hasSavedCurrentSessionHistory && total > 0) {
    const wrongQIds = wrongQuestions.map(q => q.id);
    const historyEntry = {
      id: 'att_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      timestamp: Date.now(),
      dateStr: new Date().toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
      score: score,
      correctCount: correctCount,
      wrongCount: wrongCount,
      totalQuestions: total,
      percentage: percent,
      maxStreak: maxStreak,
      lesson: currentLesson,
      lessonName: getLessonDisplayName(currentLesson),
      type: currentType,
      wrongQIds: wrongQIds,
      wrongVariants: Object.fromEntries(wrongQuestions.map(q => [q.id, q.variantIndex || 0]))
    };
    saveHistoryEntry(historyEntry);

    // Save to Leaderboard
    const playerName = getPlayerName();
    const lbEntry = {
      id: 'lb_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      playerName: playerName,
      score: score,
      percentage: percent,
      correctCount: correctCount,
      totalQuestions: total,
      maxStreak: maxStreak,
      lesson: currentLesson,
      lessonName: getLessonDisplayName(currentLesson),
      dateStr: new Date().toLocaleDateString('vi-VN'),
      avatar: '⭐',
      isCurrentPlayer: true,
      timestamp: Date.now()
    };
    saveLeaderboardEntry(lbEntry);

    // Announce Rank on Summary Screen
    const rank = getPlayerRankInLeaderboard(lbEntry.id, currentLesson);
    const rankCallout = document.getElementById('summary-rank-callout');
    if (rankCallout) {
      rankCallout.style.display = 'flex';
      if (rank > 0 && rank <= 3) {
        const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : '🥉');
        rankCallout.innerHTML = `
          <span style="font-size: 1.6rem;">${medal}</span>
          <span>Đỉnh cao! Bạn đạt <strong>Hạng #${rank}</strong> trên Bảng xếp hạng với <strong>${score.toLocaleString()}</strong> điểm!</span>
        `;
        fireConfetti();
      } else if (rank > 0 && rank <= 10) {
        rankCallout.innerHTML = `
          <span style="font-size: 1.5rem;">🎖️</span>
          <span>Xuất sắc! Bạn lọt <strong>Top #${rank}</strong> Bảng xếp hạng với <strong>${score.toLocaleString()}</strong> điểm!</span>
        `;
      } else {
        rankCallout.innerHTML = `
          <span style="font-size: 1.3rem;">📊</span>
          <span>Điểm số <strong>${score.toLocaleString()} điểm</strong> của bạn đã được ghi nhận vào Bảng xếp hạng!</span>
        `;
      }
    }

    hasSavedCurrentSessionHistory = true;
  }

  // Render detailed review of wrong questions
  renderWrongQuestionsReview(wrongQuestions);
}

function renderWrongQuestionsReview(wrongQuestions) {
  const container = document.getElementById('wrong-review-section');
  const listEl = document.getElementById('wrong-review-list');
  const badgeEl = document.getElementById('wrong-review-badge');
  const subtitleEl = document.getElementById('wrong-review-subtitle');

  if (!container || !listEl) return;

  if (wrongQuestions.length === 0) {
    container.style.display = 'block';
    if (badgeEl) {
      badgeEl.textContent = '0 câu sai';
      badgeEl.style.background = 'var(--success-bg)';
      badgeEl.style.color = 'var(--success)';
      badgeEl.style.borderColor = 'var(--success)';
    }
    if (subtitleEl) subtitleEl.textContent = 'Bạn đã trả lời chính xác tất cả các câu hỏi!';
    listEl.innerHTML = `
      <div style="text-align:center; padding: 2rem; background: var(--bg-tertiary); border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
        <div style="font-weight: 800; font-size: 1.15rem; color: var(--success); margin-bottom: 0.25rem;">Tuyệt vời! Không có câu nào làm sai</div>
        <div style="color: var(--text-secondary); font-size: 0.9rem;">Bạn đã nắm vững toàn bộ nội dung ôn tập.</div>
      </div>
    `;
    return;
  }

  container.style.display = 'block';
  if (badgeEl) {
    badgeEl.textContent = `${wrongQuestions.length} câu làm sai`;
    badgeEl.style.background = 'var(--danger-bg)';
    badgeEl.style.color = 'var(--danger)';
    badgeEl.style.borderColor = 'var(--danger)';
  }
  if (subtitleEl) subtitleEl.textContent = `Xem chi tiết đáp án chuẩn (bôi đỏ) cho ${wrongQuestions.length} câu bạn chưa làm đúng`;

  listEl.innerHTML = '';

  wrongQuestions.forEach((q) => {
    const userState = questionStates[q.id];
    const card = document.createElement('div');
    card.className = 'wrong-review-card';

    // Top Meta
    const topDiv = document.createElement('div');
    topDiv.className = 'wrong-card-top';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'wrong-card-meta';
    metaDiv.innerHTML = `
      <span class="meta-tag lesson-tag">${escapeHtml(q.lesson)}</span>
      <span class="meta-tag type-tag">${getTypeLabel(q.type)}</span>
      <span class="meta-tag num-tag">Câu ${q.q_num}</span>
    `;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-retry-single-q';
    retryBtn.innerHTML = `<span>🎯</span> <span>Làm lại câu này</span>`;
    retryBtn.addEventListener('click', () => {
      retrySingleQuestion(q.id, q.variantIndex || 0);
    });

    topDiv.appendChild(metaDiv);
    topDiv.appendChild(retryBtn);
    card.appendChild(topDiv);

    // Question Prompt
    const qText = document.createElement('div');
    qText.className = 'wrong-card-qtext';
    qText.textContent = q.question;
    card.appendChild(qText);

    // Answer Comparison Body
    const answersDiv = document.createElement('div');
    answersDiv.className = 'wrong-card-answers';

    if (q.type === 'single_choice') {
      const correctIdx = q.correct_answers[0];
      const correctText = q.options[correctIdx];
      const hasAnswered = userState && userState.isAnswered;
      const userIdx = userState?.userSelection;

      if (hasAnswered && userIdx !== undefined) {
        const userText = q.options[userIdx] || '(Không rõ)';
        answersDiv.innerHTML = `
          <div class="review-ans-box user-pick">
            <span class="ans-label">❌ Bạn đã chọn:</span>
            <span class="ans-value">${escapeHtml(userText)}</span>
          </div>
          <div class="review-ans-box correct-pick">
            <span class="ans-label">✅ Đáp án đúng chuẩn (bôi đỏ):</span>
            <span class="ans-value">${escapeHtml(correctText)}</span>
          </div>
        `;
      } else {
        answersDiv.innerHTML = `
          <div class="review-ans-box user-pick">
            <span class="ans-label">⚠️ Trạng thái:</span>
            <span class="ans-value">Chưa trả lời (Bỏ qua)</span>
          </div>
          <div class="review-ans-box correct-pick">
            <span class="ans-label">✅ Đáp án đúng chuẩn (bôi đỏ):</span>
            <span class="ans-value">${escapeHtml(correctText)}</span>
          </div>
        `;
      }
    } else if (q.type === 'multiple_choice') {
      const hasAnswered = userState && userState.isAnswered;
      const userPicks = userState?.userSelection || [];
      const correctPicks = q.correct_answers || [];

      const correctHtml = correctPicks.map(i => `<div>• ${escapeHtml(q.options[i])}</div>`).join('');
      const userHtml = userPicks.length > 0 
        ? userPicks.map(i => `<div>• ${escapeHtml(q.options[i])}</div>`).join('') 
        : '(Chưa chọn hoặc chưa chọn đủ đáp án)';

      answersDiv.innerHTML = `
        <div class="review-ans-box user-pick">
          <span class="ans-label">❌ Bạn đã chọn:</span>
          <div class="ans-value">${userHtml}</div>
        </div>
        <div class="review-ans-box correct-pick">
          <span class="ans-label">✅ Các đáp án đúng chuẩn (bôi đỏ):</span>
          <div class="ans-value">${correctHtml}</div>
        </div>
      `;
    } else if (q.type === 'true_false') {
      const userMap = userState?.userSelection || {};
      let rowsHtml = '';
      q.items.forEach((it, itIdx) => {
        const userChoice = userMap[itIdx];
        const userStr = userChoice === true ? 'ĐÚNG' : (userChoice === false ? 'SAI' : 'Chưa chọn');
        const correctStr = it.correct ? 'ĐÚNG' : 'SAI';
        const isThisItemRight = userChoice === it.correct;

        rowsHtml += `
          <tr>
            <td>${escapeHtml(it.statement)}</td>
            <td style="color:${isThisItemRight ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">
              ${isThisItemRight ? '✓' : '✕'} ${userStr}
            </td>
            <td style="color:var(--success); font-weight:800;">
              ✓ ${correctStr}
            </td>
          </tr>
        `;
      });

      answersDiv.innerHTML = `
        <table class="review-sub-table">
          <thead>
            <tr>
              <th>Mệnh đề</th>
              <th>Bạn đã chọn</th>
              <th>Đáp án chuẩn</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;
    } else if (q.type === 'drag_drop_match') {
      const userMap = userState?.userSelection || {};
      let rowsHtml = '';
      q.pairs.forEach((pair, pIdx) => {
        const userMatched = userMap[pIdx] || '(Chưa ghép)';
        const isPairRight = userMap[pIdx] === pair.right;

        rowsHtml += `
          <tr>
            <td><strong>${escapeHtml(pair.left)}</strong></td>
            <td style="color:${isPairRight ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">
              ${isPairRight ? '✓' : '✕'} ${escapeHtml(userMatched)}
            </td>
            <td style="color:var(--success); font-weight:800;">
              ✓ ${escapeHtml(pair.right)}
            </td>
          </tr>
        `;
      });

      answersDiv.innerHTML = `
        <table class="review-sub-table">
          <thead>
            <tr>
              <th>Vế câu hỏi</th>
              <th>Bạn đã ghép</th>
              <th>Đáp án chuẩn ghép đúng</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;
    } else if (q.type === 'drag_drop_categorize') {
      const cat1 = q.categories[0];
      const cat2 = q.categories[1];
      const userMap = userState?.userSelection || {};

      const renderReviewCol = (cat) => {
        const placedInCol = Object.keys(userMap).filter(k => userMap[k] === cat.title);
        const correctItems = cat.items;
        
        let placedHtml = '';
        if (placedInCol.length > 0) {
          placedHtml = placedInCol.map(text => {
            const isRight = correctItems.includes(text);
            const trueCat = q.all_items.find(it => it.text === text)?.category || '';
            return `
              <div style="font-size:0.83rem; margin-bottom:0.35rem; display:flex; align-items:flex-start; gap:0.4rem;">
                <span style="color:${isRight ? 'var(--success)' : 'var(--danger)'}; font-weight:800; font-size:0.9rem;">${isRight ? '✓' : '✕'}</span>
                <div>
                  <span style="${isRight ? 'font-weight:600;' : 'color:var(--danger); text-decoration:line-through;'}">${escapeHtml(text)}</span>
                  ${!isRight ? `<div style="font-size:0.75rem; color:var(--text-secondary);">➔ Thuộc: <strong style="color:var(--success);">${escapeHtml(trueCat)}</strong></div>` : ''}
                </div>
              </div>
            `;
          }).join('');
        } else {
          placedHtml = '<div style="font-size:0.8rem; color:var(--text-muted); font-style:italic;">(Chưa xếp mục nào vào đây)</div>';
        }

        return `
          <div style="background: var(--bg-secondary); border: 1.5px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem;">
            <div style="font-weight: 800; font-size: 0.88rem; margin-bottom: 0.6rem; padding-bottom:0.35rem; border-bottom:1px solid var(--border-color); color:var(--text-primary);">
              ${escapeHtml(cat.title)}
            </div>
            <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary); margin-bottom:0.4rem;">Bạn đã xếp:</div>
            ${placedHtml}
            <div style="margin-top:0.6rem; padding-top:0.4rem; border-top:1px dashed var(--border-color);">
              <div style="font-size:0.78rem; font-weight:700; color:var(--success); margin-bottom:0.3rem;">Đáp án đúng chuẩn (${correctItems.length} mục):</div>
              ${correctItems.map(it => `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.2rem;">✓ ${escapeHtml(it)}</div>`).join('')}
            </div>
          </div>
        `;
      };

      answersDiv.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.75rem; margin-top: 0.5rem;">
          ${renderReviewCol(cat1)}
          ${renderReviewCol(cat2)}
        </div>
      `;
    }

    card.appendChild(answersDiv);
    listEl.appendChild(card);
  });
}

function retrySingleQuestion(targetQid, variantIndex = 0) {
  const targetQ = allQuestions.find(q => q.id === targetQid);
  if (!targetQ) return;

  startQuestionSession([targetQ]);
  if (variantIndex) {
    applyQuestionVariant(activeQuestions[0], variantIndex);
    renderCurrentQuestion();
  }
}

// ================= QUIZ HISTORY =================
const HISTORY_STORAGE_KEY = 'cnxhkh_quiz_history';
const MAX_HISTORY_ITEMS = 50;

function getLessonDisplayName(lessonKey) {
  if (lessonKey === 'all') return 'Tất cả bài học (Toàn bộ)';
  if (lessonKey === 'tx') return 'Bài Kiểm Tra Thường Xuyên';
  if (String(lessonKey) === '6') return 'Bổ sung';
  return `Bài ${lessonKey}`;
}

function getTypeDisplayName(typeKey) {
  switch (typeKey) {
    case 'single_choice': return 'Trắc nghiệm đơn';
    case 'multiple_choice': return 'Nhiều đáp án đúng';
    case 'true_false':
    case 'true_false_group': return 'Đúng / Sai theo mệnh đề';
    case 'drag_drop':
    case 'drag_drop_match':
    case 'drag_drop_categorize': return 'Kéo thả nối vế';
    default: return 'Tất cả dạng câu';
  }
}

function getHistoryList() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Lỗi khi đọc lịch sử làm bài:', e);
    return [];
  }
}

function saveHistoryEntry(entry) {
  try {
    const list = getHistoryList();
    list.unshift(entry);
    if (list.length > MAX_HISTORY_ITEMS) {
      list.length = MAX_HISTORY_ITEMS;
    }
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Lỗi khi lưu lịch sử làm bài:', e);
  }
}

function clearAllHistory() {
  const history = getHistoryList();
  if (history.length === 0) {
    alert('Hiện chưa có lịch sử làm bài nào để xóa.');
    return;
  }
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử các lần làm bài? Dữ liệu đã xóa không thể khôi phục.')) {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    renderHistoryModal();
  }
}

function openHistoryModal() {
  renderHistoryModal();
  const overlay = document.getElementById('history-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeHistoryModal() {
  const overlay = document.getElementById('history-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function renderHistoryModal() {
  const statsContainer = document.getElementById('history-summary-stats');
  const listContainer = document.getElementById('history-list');
  if (!statsContainer || !listContainer) return;

  const history = getHistoryList();

  if (history.length === 0) {
    statsContainer.innerHTML = `
      <div class="history-stat-card"><div class="num">0</div><div class="lbl">Lượt làm</div></div>
      <div class="history-stat-card"><div class="num">0</div><div class="lbl">Điểm cao nhất</div></div>
      <div class="history-stat-card"><div class="num">0%</div><div class="lbl">Độ chính xác TB</div></div>
      <div class="history-stat-card"><div class="num">0</div><div class="lbl">Tổng câu đã làm</div></div>
    `;

    listContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">📭</div>
        <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.4rem;">Chưa có lịch sử làm bài nào</div>
        <div style="font-size: 0.88rem; max-width: 380px; margin: 0 auto; color: var(--text-muted); line-height: 1.5;">
          Hoàn thành một lượt làm bài trắc nghiệm để hệ thống tự động ghi nhận kết quả, điểm số và chuỗi đúng tại đây!
        </div>
      </div>
    `;
    return;
  }

  // Calculate aggregated stats
  const totalAttempts = history.length;
  const bestScore = Math.max(...history.map(h => h.score || 0));
  const sumCorrect = history.reduce((sum, h) => sum + (h.correctCount || 0), 0);
  const sumTotalQ = history.reduce((sum, h) => sum + (h.totalQuestions || 0), 0);
  const avgAccuracy = sumTotalQ > 0 ? Math.round((sumCorrect / sumTotalQ) * 100) : 0;

  statsContainer.innerHTML = `
    <div class="history-stat-card"><div class="num">${totalAttempts}</div><div class="lbl">Lượt làm</div></div>
    <div class="history-stat-card"><div class="num">${bestScore.toLocaleString()}</div><div class="lbl">Điểm cao nhất</div></div>
    <div class="history-stat-card"><div class="num">${avgAccuracy}%</div><div class="lbl">Độ chính xác TB</div></div>
    <div class="history-stat-card"><div class="num">${sumTotalQ}</div><div class="lbl">Tổng câu đã làm</div></div>
  `;

  let listHtml = '';
  history.forEach(item => {
    const badgeClass = item.percentage >= 80 ? 'badge-high' : (item.percentage >= 50 ? 'badge-med' : 'badge-low');
    const hasWrongs = item.wrongQIds && item.wrongQIds.length > 0;

    listHtml += `
      <div class="history-card" data-id="${item.id}">
        <div class="history-card-top">
          <div class="history-card-tags">
            <span class="history-tag">📅 ${escapeHtml(item.dateStr)}</span>
            <span class="history-tag">📖 ${escapeHtml(item.lessonName || getLessonDisplayName(item.lesson))}</span>
            <span class="history-tag">🏷️ ${escapeHtml(getTypeDisplayName(item.type))}</span>
          </div>
          <span class="history-percent-badge ${badgeClass}">${item.percentage}% Chính xác</span>
        </div>

        <div class="history-card-details">
          <span>🎯 Đúng: <strong style="color:var(--success); font-family:var(--font-mono);">${item.correctCount} / ${item.totalQuestions}</strong></span>
          <span>❌ Sai: <strong style="color:var(--danger); font-family:var(--font-mono);">${item.wrongCount}</strong></span>
          <span>🏆 Điểm: <strong style="color:var(--primary); font-family:var(--font-mono);">${(item.score || 0).toLocaleString()}</strong></span>
          <span>🔥 Chuỗi: <strong style="font-family:var(--font-mono);">${item.maxStreak || 0}</strong></span>
        </div>

        <div class="history-card-actions">
          <button class="btn-history-action retake" onclick="retakeLessonFromHistory('${item.lesson}')">
            <span>🔄</span> Luyện lại bài này
          </button>
          ${hasWrongs ? `
            <button class="btn-history-action retry-wrong" onclick="practiceWrongFromHistory('${item.id}')">
              <span>🎯</span> Ôn ${item.wrongQIds.length} câu sai lượt này
            </button>
          ` : ''}
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = listHtml;
}

function retakeLessonFromHistory(lessonKey) {
  closeHistoryModal();
  currentLesson = lessonKey;
  currentType = 'all';
  document.getElementById('type-filter').value = 'all';
  localStorage.setItem('cnx_current_lesson', currentLesson);
  localStorage.setItem('cnx_current_type', currentType);
  // Update lesson tab UI
  document.querySelectorAll('#lesson-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lesson === lessonKey);
  });
  applyFiltersAndReset(0);
}

function practiceWrongFromHistory(attemptId) {
  const list = getHistoryList();
  const attempt = list.find(a => a.id === attemptId);
  if (!attempt || !attempt.wrongQIds || attempt.wrongQIds.length === 0) {
    alert('Không tìm thấy danh sách câu sai của lượt làm này.');
    return;
  }

  // Find matching questions from allQuestions
  const wrongSet = new Set(attempt.wrongQIds.filter(id => typeof id === 'string'));
  const targetQuestions = allQuestions.filter(q => wrongSet.has(q.id));
  if (targetQuestions.length === 0) {
    alert('Không tìm thấy dữ liệu câu hỏi tương ứng trong ngân hàng câu hỏi.');
    return;
  }

  closeHistoryModal();
  startQuestionSession(targetQuestions);
  activeQuestions.forEach(q => {
    if (attempt.wrongVariants?.[q.id]) applyQuestionVariant(q, attempt.wrongVariants[q.id]);
  });
  renderCurrentQuestion();
}

// Expose globally for inline onclick triggers
window.retakeLessonFromHistory = retakeLessonFromHistory;
window.practiceWrongFromHistory = practiceWrongFromHistory;

// ================= LEADERBOARD =================
const LEADERBOARD_STORAGE_KEY = 'cnxhkh_leaderboard';
const PLAYER_NAME_STORAGE_KEY = 'cnxhkh_player_name';
const DEFAULT_PLAYER_NAME = 'Học viên xuất sắc';
let currentLeaderboardScope = 'all';

function getPlayerName() {
  try {
    return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || DEFAULT_PLAYER_NAME;
  } catch (e) {
    return DEFAULT_PLAYER_NAME;
  }
}

function setPlayerName(name) {
  const clean = (name || '').trim();
  if (!clean) return;
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, clean);
    const list = getLeaderboardEntries();
    list.forEach(item => {
      if (item.isCurrentPlayer) {
        item.playerName = clean;
      }
    });
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(list));
    renderLeaderboard();
  } catch (e) {
    console.error('Lỗi khi lưu tên người chơi:', e);
  }
}

function getLeaderboardEntries() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!raw) return [];
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Automatically purge any mock/default entries from previous versions
    const clean = parsed.filter(e => e && e.id && !e.id.startsWith('lb_def_') && e.isCurrentPlayer !== false);
    if (clean.length !== parsed.length) {
      localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch (e) {
    console.error('Lỗi khi đọc bảng xếp hạng:', e);
    return [];
  }
}

function saveLeaderboardEntry(entry) {
  try {
    const list = getLeaderboardEntries();
    list.push(entry);
    list.sort((a, b) => (b.score - a.score) || (b.percentage - a.percentage) || ((b.maxStreak || 0) - (a.maxStreak || 0)));
    if (list.length > 100) {
      list.length = 100;
    }
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Lỗi khi lưu bảng xếp hạng:', e);
  }
}

function resetLeaderboard() {
  const list = getLeaderboardEntries();
  if (list.length === 0) {
    alert('Hiện chưa có dữ liệu bảng xếp hạng nào để xóa.');
    return;
  }
  if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử điểm số trên Bảng xếp hạng?')) {
    try {
      localStorage.removeItem(LEADERBOARD_STORAGE_KEY);
      renderLeaderboard();
    } catch (e) {
      console.error('Lỗi khi xóa bảng xếp hạng:', e);
    }
  }
}

function getPlayerRankInLeaderboard(entryId, scope) {
  const list = getLeaderboardEntries();
  const filtered = scope === 'all' ? list : list.filter(e => e.lesson === scope || e.lesson === 'all');
  filtered.sort((a, b) => (b.score - a.score) || (b.percentage - a.percentage) || ((b.maxStreak || 0) - (a.maxStreak || 0)));
  const idx = filtered.findIndex(e => e.id === entryId);
  return idx >= 0 ? idx + 1 : -1;
}

function openLeaderboardModal() {
  const nameInput = document.getElementById('player-name-input');
  if (nameInput) {
    nameInput.value = getPlayerName();
  }
  if (currentLesson && currentLesson !== 'all') {
    currentLeaderboardScope = currentLesson;
  } else {
    currentLeaderboardScope = 'all';
  }
  updateLeaderboardScopeTabsUI();
  renderLeaderboard();

  const overlay = document.getElementById('leaderboard-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeLeaderboardModal() {
  const overlay = document.getElementById('leaderboard-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function updateLeaderboardScopeTabsUI() {
  document.querySelectorAll('#leaderboard-scope-tabs .scope-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.scope === currentLeaderboardScope);
  });
}

function renderLeaderboard() {
  const podiumEl = document.getElementById('leaderboard-podium');
  const tableBodyEl = document.getElementById('ranking-table-body');
  const tableWrapperEl = document.getElementById('ranking-table-wrapper');
  const emptyStateEl = document.getElementById('leaderboard-empty-state');
  if (!podiumEl || !tableBodyEl) return;

  const allEntries = getLeaderboardEntries();
  let filtered = currentLeaderboardScope === 'all' 
    ? allEntries 
    : allEntries.filter(e => e.lesson === currentLeaderboardScope);

  filtered.sort((a, b) => (b.score - a.score) || (b.percentage - a.percentage) || ((b.maxStreak || 0) - (a.maxStreak || 0)));

  if (filtered.length === 0) {
    podiumEl.innerHTML = '';
    podiumEl.style.display = 'none';
    tableWrapperEl.style.display = 'none';
    if (emptyStateEl) {
      emptyStateEl.style.display = 'block';
      const scopeLabel = currentLeaderboardScope === 'all' ? 'bài học nào' : `Bài ${currentLeaderboardScope}`;
      emptyStateEl.innerHTML = `
        <div style="text-align: center; padding: 3.5rem 1rem; color: var(--text-secondary);">
          <div style="font-size: 3.2rem; margin-bottom: 0.75rem;">🏆</div>
          <div style="font-weight: 800; font-size: 1.15rem; color: var(--text-primary); margin-bottom: 0.4rem;">Chưa có lượt làm bài nào cho ${scopeLabel}</div>
          <div style="font-size: 0.88rem; max-width: 420px; margin: 0 auto; color: var(--text-muted); line-height: 1.5;">
            Hãy hoàn thành bài tập trắc nghiệm để ghi danh điểm số thật của bạn lên Bảng xếp hạng nhé!
          </div>
        </div>
      `;
    }
    return;
  }

  if (emptyStateEl) emptyStateEl.style.display = 'none';
  podiumEl.style.display = 'flex';

  // Render Top 3 Podium
  const top1 = filtered[0];
  const top2 = filtered.length > 1 ? filtered[1] : null;
  const top3 = filtered.length > 2 ? filtered[2] : null;

  let podiumHtml = '';

  // 2nd Place (Silver)
  if (top2) {
    podiumHtml += `
      <div class="podium-card rank-2">
        <div class="podium-avatar">
          ${top2.avatar || '🥈'}
          <span class="podium-badge">🥈</span>
        </div>
        <div class="podium-name" title="${escapeHtml(top2.playerName)}">
          ${escapeHtml(top2.playerName)}
          ${top2.isCurrentPlayer ? '<span class="current-user-tag">Bạn</span>' : ''}
        </div>
        <div class="podium-score">${(top2.score || 0).toLocaleString()}</div>
        <div class="podium-meta">🎯 ${top2.percentage}% • ${escapeHtml(top2.lessonName || ('Bài ' + top2.lesson))}</div>
      </div>
    `;
  }

  // 1st Place (Gold)
  if (top1) {
    podiumHtml += `
      <div class="podium-card rank-1">
        <span class="podium-crown">👑</span>
        <div class="podium-avatar">
          ${top1.avatar || '🥇'}
          <span class="podium-badge">🥇</span>
        </div>
        <div class="podium-name" title="${escapeHtml(top1.playerName)}">
          ${escapeHtml(top1.playerName)}
          ${top1.isCurrentPlayer ? '<span class="current-user-tag">Bạn</span>' : ''}
        </div>
        <div class="podium-score">${(top1.score || 0).toLocaleString()}</div>
        <div class="podium-meta">🎯 ${top1.percentage}% • ${escapeHtml(top1.lessonName || ('Bài ' + top1.lesson))}</div>
      </div>
    `;
  }

  // 3rd Place (Bronze)
  if (top3) {
    podiumHtml += `
      <div class="podium-card rank-3">
        <div class="podium-avatar">
          ${top3.avatar || '🥉'}
          <span class="podium-badge">🥉</span>
        </div>
        <div class="podium-name" title="${escapeHtml(top3.playerName)}">
          ${escapeHtml(top3.playerName)}
          ${top3.isCurrentPlayer ? '<span class="current-user-tag">Bạn</span>' : ''}
        </div>
        <div class="podium-score">${(top3.score || 0).toLocaleString()}</div>
        <div class="podium-meta">🎯 ${top3.percentage}% • ${escapeHtml(top3.lessonName || ('Bài ' + top3.lesson))}</div>
      </div>
    `;
  }

  podiumEl.innerHTML = podiumHtml;

  // Render Table (Rank 4+)
  const tableRows = filtered.slice(3);
  if (tableRows.length === 0) {
    tableWrapperEl.style.display = 'none';
  } else {
    tableWrapperEl.style.display = 'block';
    tableBodyEl.innerHTML = tableRows.map((entry, idx) => {
      const rankNum = idx + 4;
      const isUser = entry.isCurrentPlayer;
      return `
        <tr class="${isUser ? 'current-user-row' : ''}">
          <td style="text-align: center;">
            <span class="rank-pill">${rankNum}</span>
          </td>
          <td>
            <div class="player-cell">
              <span class="player-avatar-small">${entry.avatar || '👤'}</span>
              <span>${escapeHtml(entry.playerName)}</span>
              ${isUser ? '<span class="current-user-tag">Bạn</span>' : ''}
            </div>
          </td>
          <td style="text-align: center;">
            <span class="history-tag" style="font-size:0.75rem;">${escapeHtml(entry.lessonName || ('Bài ' + entry.lesson))}</span>
          </td>
          <td style="text-align: right; font-weight: 800; font-family: var(--font-mono); color: var(--primary);">
            ${(entry.score || 0).toLocaleString()}
          </td>
          <td style="text-align: center; font-weight: 700; color: ${entry.percentage >= 80 ? 'var(--success)' : (entry.percentage >= 50 ? '#f59e0b' : 'var(--danger)')};">
            ${entry.percentage}%
          </td>
          <td style="text-align: center; font-weight: 700;">
            🔥 ${entry.maxStreak || 0}
          </td>
          <td style="text-align: right; color: var(--text-muted); font-size: 0.8rem;">
            ${escapeHtml(entry.dateStr || '')}
          </td>
        </tr>
      `;
    }).join('');
  }
}

// ================= QUESTION NAVIGATOR DRAWER =================
function renderDrawerGrid() {
  const grid = document.getElementById('drawer-grid');
  grid.innerHTML = '';

  activeQuestions.forEach((q, idx) => {
    const cell = document.createElement('div');
    cell.className = 'nav-cell';
    cell.id = `nav-cell-${q.id}`;
    cell.textContent = idx + 1;
    cell.title = `Câu ${idx + 1} (${q.lesson} - Câu ${q.q_num})`;

    const state = questionStates[q.id];
    if (state && state.isAnswered) {
      cell.classList.add(state.isCorrect ? 'qz-done-correct' : 'qz-done-wrong');
    }

    if (idx === currentIndex) {
      cell.classList.add('current');
    }

    cell.addEventListener('click', () => {
      if (autoNextTimeout) {
        clearTimeout(autoNextTimeout);
        autoNextTimeout = null;
      }
      currentIndex = idx;
      renderCurrentQuestion();
      closeDrawer();
    });

    grid.appendChild(cell);
  });
}

function updateDrawerCell(qid) {
  const cell = document.getElementById(`nav-cell-${qid}`);
  if (!cell) return;
  const state = questionStates[qid];
  if (state && state.isAnswered) {
    cell.classList.remove('qz-done-correct', 'qz-done-wrong');
    cell.classList.add(state.isCorrect ? 'qz-done-correct' : 'qz-done-wrong');
  }
}

function updateDrawerCurrentHighlight() {
  document.querySelectorAll('.nav-cell').forEach((c, idx) => {
    if (idx === currentIndex) c.classList.add('current');
    else c.classList.remove('current');
  });
}

function openDrawer() {
  document.getElementById('drawer-overlay').classList.add('active');
  document.getElementById('drawer-panel').classList.add('open');
}

function closeDrawer() {
  document.getElementById('drawer-overlay').classList.remove('active');
  document.getElementById('drawer-panel').classList.remove('open');
}

// ================= NAVIGATION =================
let autoNextTimeout = null;

function scheduleAutoAdvance(delayMs) {
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }

  const nextBtn = document.getElementById('btn-next-question');

  if (!autoAdvanceEnabled) {
    if (nextBtn) {
      nextBtn.innerHTML = `<span>Câu tiếp theo</span> <span>➜</span>`;
    }
    return;
  }

  // Update button label to indicate auto-advancing
  if (nextBtn) {
    const sec = (delayMs / 1000).toFixed(1);
    nextBtn.innerHTML = `<span>Tự chuyển câu (${sec}s)</span> <span>➜</span>`;
  }

  autoNextTimeout = setTimeout(() => {
    autoNextTimeout = null;
    goToNextQuestion();
  }, delayMs);
}

function goToNextQuestion() {
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }
  if (currentIndex < activeQuestions.length - 1) {
    currentIndex++;
    renderCurrentQuestion();
  } else {
    const pendingIndex = activeQuestions.findIndex(q => !questionStates[q.id]?.isAnswered);
    if (pendingIndex >= 0) {
      currentIndex = pendingIndex;
      renderCurrentQuestion();
    } else {
      showCompletionScreen();
    }
  }
}

function goToPrevQuestion() {
  if (autoNextTimeout) {
    clearTimeout(autoNextTimeout);
    autoNextTimeout = null;
  }
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentQuestion();
  }
}

// ================= EVENT LISTENERS =================
function initEventListeners() {
  // Theme Toggle
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // Sound Toggle
  document.getElementById('sound-toggle')?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    const icon = document.getElementById('sound-icon');
    if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
  });

  // Drawer Toggles
  document.getElementById('drawer-toggle-btn')?.addEventListener('click', openDrawer);
  document.getElementById('btn-open-nav-drawer')?.addEventListener('click', openDrawer);
  document.getElementById('drawer-close-btn')?.addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);

  // Next / Prev buttons
  document.getElementById('btn-next-question')?.addEventListener('click', goToNextQuestion);
  document.getElementById('btn-next-q')?.addEventListener('click', goToNextQuestion);
  document.getElementById('btn-prev-q')?.addEventListener('click', goToPrevQuestion);

  // Lesson Tabs
  document.getElementById('lesson-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLesson = btn.dataset.lesson;
    localStorage.setItem('cnx_current_lesson', currentLesson);
    applyFiltersAndReset(0);
  });

  // Type Filter
  document.getElementById('type-filter')?.addEventListener('change', (e) => {
    currentType = e.target.value;
    localStorage.setItem('cnx_current_type', currentType);
    applyFiltersAndReset(0);
  });

  // Shuffle Toggle
  document.getElementById('shuffle-toggle')?.addEventListener('change', (e) => {
    isShuffled = e.target.checked;
    applyFiltersAndReset(0);
  });

  // Summary buttons: reload/restart in place
  document.getElementById('btn-restart-quiz')?.addEventListener('click', () => {
    applyFiltersAndReset(0);
  });

  // Reload button in header: reset & reload questions in place without full page jump
  document.getElementById('reload-page-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('reload-page-btn');
    if (btn) {
      btn.classList.add('spinning');
      setTimeout(() => btn.classList.remove('spinning'), 600);
    }
    applyFiltersAndReset(0);
  });

  // Auto-advance toggle
  document.getElementById('autoadvance-toggle')?.addEventListener('change', (e) => {
    autoAdvanceEnabled = e.target.checked;
    if (!autoAdvanceEnabled && autoNextTimeout) {
      clearTimeout(autoNextTimeout);
      autoNextTimeout = null;
      const nextBtn = document.getElementById('btn-next-question');
      if (nextBtn) nextBtn.innerHTML = `<span>Câu tiếp theo</span> <span>➜</span>`;
    }
  });

  // History Modal
  document.getElementById('history-toggle-btn')?.addEventListener('click', openHistoryModal);
  document.getElementById('btn-open-history-summary')?.addEventListener('click', openHistoryModal);
  document.getElementById('history-modal-close')?.addEventListener('click', closeHistoryModal);
  document.getElementById('btn-close-history-modal')?.addEventListener('click', closeHistoryModal);
  document.getElementById('btn-clear-history')?.addEventListener('click', clearAllHistory);

  document.getElementById('history-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'history-modal-overlay') {
      closeHistoryModal();
    }
  });

  // Leaderboard Modal
  document.getElementById('leaderboard-toggle-btn')?.addEventListener('click', openLeaderboardModal);
  document.getElementById('btn-open-leaderboard-summary')?.addEventListener('click', openLeaderboardModal);
  document.getElementById('leaderboard-modal-close')?.addEventListener('click', closeLeaderboardModal);
  document.getElementById('btn-close-leaderboard-modal')?.addEventListener('click', closeLeaderboardModal);
  document.getElementById('btn-reset-leaderboard')?.addEventListener('click', resetLeaderboard);

  document.getElementById('leaderboard-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'leaderboard-modal-overlay') {
      closeLeaderboardModal();
    }
  });

  // Save Player Name
  document.getElementById('btn-save-player-name')?.addEventListener('click', () => {
    const input = document.getElementById('player-name-input');
    if (input) {
      const val = input.value.trim();
      if (!val) {
        alert('Vui lòng nhập tên của bạn (tối đa 25 ký tự).');
        return;
      }
      setPlayerName(val);
      alert('Đã cập nhật tên người chơi thành công!');
    }
  });

  document.getElementById('player-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim();
      if (val) {
        setPlayerName(val);
        alert('Đã cập nhật tên người chơi thành công!');
      }
    }
  });

  // Leaderboard Scope Tabs
  document.getElementById('leaderboard-scope-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.scope-tab');
    if (!btn) return;
    currentLeaderboardScope = btn.dataset.scope;
    updateLeaderboardScopeTabsUI();
    renderLeaderboard();
  });

  document.getElementById('btn-review-mistakes')?.addEventListener('click', () => {
    const wrongQuestions = activeQuestions.filter(q => !questionStates[q.id]?.isCorrect);
    if (wrongQuestions.length === 0) {
      alert('Tuyệt vời! Bạn không có câu nào làm sai cả.');
      return;
    }
    // Filter to only wrong questions
    startQuestionSession(wrongQuestions);
  });

  // Keyboard Navigation:
  // Escape: Close history modal, leaderboard modal, or question drawer
  // Space or Enter: Next Question if feedback shown
  // Keys 1, 2, 3, 4: Pick options A, B, C, D
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeHistoryModal();
      closeLeaderboardModal();
      closeDrawer();
      return;
    }

    if (e.target.closest('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('.modal-overlay.active') ||
        document.getElementById('quizizz-arena').style.display === 'none') return;

    // If feedback banner is shown and user hits Space or Enter -> Next Question!
    const banner = document.getElementById('feedback-banner');
    if (banner && (banner.classList.contains('show-correct') || banner.classList.contains('show-wrong'))) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextQuestion();
        return;
      }
    }

    if (e.key === 'ArrowLeft') {
      goToPrevQuestion();
      return;
    }

    // Number keys 1-4 for options A-D
    const q = activeQuestions[currentIndex];
    if (q && q.type === 'single_choice' && !questionStates[q.id]?.isAnswered) {
      const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3, 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
      if (e.key in keyMap) {
        const optIdx = keyMap[e.key];
        if (optIdx < q.options.length) {
          handleSingleChoiceAnswer(q, optIdx);
        }
      }
    }
  });
}

// Safe string escaping
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
