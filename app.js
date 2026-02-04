/* Vocab Study - clean build
   - Imported decks: saved in localStorage
   - Built-in decks (decks.json): fetched online, cached as "last known good"
   - Offline: uses last known good built-in decks + imported decks
   - Service worker caches app shell only (NOT decks.json)
*/

// ---------- LocalStorage keys ----------
const LS_IMPORTED = "vocabStudyImportedDecks_v2";
const LS_LAST_BUILTIN = "vocabStudyLastBuiltinDecks_v2";
const LS_LAST_BUILTIN_AT = "vocabStudyLastBuiltinLoadedAt_v2";

// ---------- Storage helpers ----------
function safeJSONParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function getImportedDecks() {
  return safeJSONParse(localStorage.getItem(LS_IMPORTED), []);
}

function setImportedDecks(decks) {
  localStorage.setItem(LS_IMPORTED, JSON.stringify(decks));
}

function setLastBuiltinDecks(decks) {
  localStorage.setItem(LS_LAST_BUILTIN, JSON.stringify(decks));
  localStorage.setItem(LS_LAST_BUILTIN_AT, new Date().toISOString());
}

function getLastBuiltinDecks() {
  return safeJSONParse(localStorage.getItem(LS_LAST_BUILTIN), []);
}

function getLastBuiltinAt() {
  return localStorage.getItem(LS_LAST_BUILTIN_AT);
}

// ---------- App state ----------
let builtinDecks = [];
let decks = [];
let currentDeck = null;
let shuffleOn = true;

// flashcards
let flashOrder = [];
let flashIndex = 0;
let flashFlipped = false;

// quiz
let quizMode = null; // "def" | "use"
let quizOrder = [];
let quizIndex = 0;
let quizScore = 0;
let quizLocked = false;

// ---------- DOM ----------
const views = {
  home: document.getElementById("homeView"),
  deck: document.getElementById("deckView"),
  flash: document.getElementById("flashView"),
  quiz: document.getElementById("quizView"),
  parent: document.getElementById("parentView"),
};

const titleEl = document.getElementById("title");
const backBtn = document.getElementById("backBtn");
const parentBtn = document.getElementById("parentBtn");
const statusLine = document.getElementById("statusLine");

const deckList = document.getElementById("deckList");
const deckTitle = document.getElementById("deckTitle");
const shuffleToggle = document.getElementById("shuffleToggle");
const flashBtn = document.getElementById("flashBtn");
const defQuizBtn = document.getElementById("defQuizBtn");
const useQuizBtn = document.getElementById("useQuizBtn");

const flashCounter = document.getElementById("flashCounter");
const flashCard = document.getElementById("flashCard");
const prevCardBtn = document.getElementById("prevCardBtn");
const nextCardBtn = document.getElementById("nextCardBtn");

const quizCounter = document.getElementById("quizCounter");
const quizScoreEl = document.getElementById("quizScore");
const quizPrompt = document.getElementById("quizPrompt");
const quizChoices = document.getElementById("quizChoices");
const quizExplanation = document.getElementById("quizExplanation");
const nextQuestionBtn = document.getElementById("nextQuestionBtn");

const fileInput = document.getElementById("fileInput");
const importedList = document.getElementById("importedList");
const resetImportedBtn = document.getElementById("resetImportedBtn");

// ---------- Navigation helpers ----------
function show(viewName, headerTitle) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
  titleEl.textContent = headerTitle || "Vocab Study";
  backBtn.classList.toggle("hidden", viewName === "home");
}

function showHome() {
  currentDeck = null;
  show("home", "Vocab Study");
}

function showDeck() {
  deckTitle.textContent = currentDeck.title;
  shuffleToggle.checked = shuffleOn;
  show("deck", "Deck");
}

// Back button logic
backBtn.addEventListener("click", () => {
  if (!views.flash.classList.contains("hidden")) showDeck();
  else if (!views.quiz.classList.contains("hidden")) showDeck();
  else if (!views.parent.classList.contains("hidden")) showHome();
  else if (!views.deck.classList.contains("hidden")) showHome();
});

// Parent button
parentBtn.addEventListener("click", () => {
  renderImportedList();
  show("parent", "Parent Mode");
});

// ---------- Deck loading ----------
async function loadBuiltinDecks() {
  // Try online first; if that fails, use last-known-good from localStorage
  try {
    const res = await fetch("./decks.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("decks.json must be an array of decks");
    setLastBuiltinDecks(data);
    return { decks: data, source: "online" };
  } catch {
    const cached = getLastBuiltinDecks();
    return { decks: cached, source: cached.length ? "offline-cache" : "empty" };
  }
}

function rebuildDeckList() {
  const imported = getImportedDecks();
  decks = [...imported, ...builtinDecks];

  deckList.innerHTML = "";
  if (decks.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No decks available yet. (Try importing a deck in Parent Mode.)";
    deckList.appendChild(p);
    return;
  }

  decks.forEach(d => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = d.title;
    btn.onclick = () => { currentDeck = d; showDeck(); };
    deckList.appendChild(btn);
  });
}

function updateStatusLine(source) {
  const at = getLastBuiltinAt();
  const importedCount = getImportedDecks().length;
  let msg = "";

  if (source === "online") msg = "Loaded latest built-in decks (online).";
  else if (source === "offline-cache") msg = "Offline: using last saved built-in decks.";
  else msg = "No built-in decks loaded yet.";

  if (at) {
    const short = new Date(at).toLocaleString();
    msg += ` Last built-in update: ${short}.`;
  }
  if (importedCount) msg += ` Imported decks on device: ${importedCount}.`;

  statusLine.textContent = msg;
}

// ---------- Flashcards ----------
function startFlashcards() {
  const cards = currentDeck.cards || [];
  flashOrder = [...cards];
  if (shuffleOn) flashOrder.sort(() => Math.random() - 0.5);
  flashIndex = 0;
  flashFlipped = false;
  renderFlashcard();
  show("flash", "Flashcards");
}

function renderFlashcard() {
  const total = flashOrder.length;
  if (total === 0) {
    flashCounter.textContent = "No flashcards in this deck.";
    flashCard.textContent = "No cards";
    prevCardBtn.disabled = true;
    nextCardBtn.disabled = true;
    return;
  }

  const c = flashOrder[flashIndex];
  flashCounter.textContent = `${flashIndex + 1} / ${total}  •  Shuffle: ${shuffleOn ? "ON" : "OFF"}`;
  flashCard.textContent = flashFlipped ? c.meaning : c.word;

  prevCardBtn.disabled = flashIndex === 0;
  nextCardBtn.disabled = flashIndex === total - 1;
}

flashCard.addEventListener("click", () => {
  flashFlipped = !flashFlipped;
  renderFlashcard();
});

prevCardBtn.addEventListener("click", () => {
  flashIndex = Math.max(0, flashIndex - 1);
  flashFlipped = false;
  renderFlashcard();
});

nextCardBtn.addEventListener("click", () => {
  flashIndex = Math.min(flashOrder.length - 1, flashIndex + 1);
  flashFlipped = false;
  renderFlashcard();
});

// ---------- Quiz ----------
function getQuizSource(mode) {
  if (mode === "def") return currentDeck.definitionMCQs || [];
  if (mode === "use") return currentDeck.usageMCQs || [];
  return [];
}

function startQuiz(mode) {
  quizMode = mode;
  const src = getQuizSource(mode);
  quizOrder = [...src];
  if (shuffleOn) quizOrder.sort(() => Math.random() - 0.5);

  quizIndex = 0;
  quizScore = 0;

  if (quizOrder.length === 0) {
    // Show a simple "no questions" screen
    quizCounter.textContent = "";
    quizScoreEl.textContent = "";
    quizPrompt.textContent = "No questions in this deck yet.";
    quizChoices.innerHTML = "";
    quizExplanation.classList.add("hidden");
    nextQuestionBtn.disabled = true;
    show("quiz", mode === "def" ? "Definition Quiz" : "Usage Quiz");
    return;
  }

  renderQuizQuestion();
  show("quiz", mode === "def" ? "Definition Quiz" : "Usage Quiz");
}

function renderQuizQuestion() {
  const q = quizOrder[quizIndex];
  quizLocked = false;
  nextQuestionBtn.disabled = true;

  quizExplanation.classList.add("hidden");
  quizExplanation.textContent = "";

  quizCounter.textContent = `Question ${quizIndex + 1} / ${quizOrder.length}`;
  quizScoreEl.textContent = `Score: ${quizScore}`;

  const promptText = quizMode === "def" ? q.question : q.prompt;
  quizPrompt.textContent = promptText;

  quizChoices.innerHTML = "";
  q.choices.forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = choice;
    btn.onclick = () => handleAnswer(idx);
    quizChoices.appendChild(btn);
  });
}

function handleAnswer(selectedIndex) {
  if (quizLocked) return;
  quizLocked = true;

  const q = quizOrder[quizIndex];
  const buttons = Array.from(quizChoices.querySelectorAll("button"));

  buttons.forEach((b, i) => {
    if (i === q.correctIndex) b.classList.add("correct");
    else if (i === selectedIndex) b.classList.add("wrong");
    b.disabled = true;
  });

  if (selectedIndex === q.correctIndex) quizScore += 1;
  quizScoreEl.textContent = `Score: ${quizScore}`;

  if (q.explanation) {
    quizExplanation.textContent = q.explanation;
    quizExplanation.classList.remove("hidden");
  }

  nextQuestionBtn.disabled = false;
}

nextQuestionBtn.addEventListener("click", () => {
  if (quizOrder.length === 0) return;

  if (quizIndex < quizOrder.length - 1) {
    quizIndex += 1;
    renderQuizQuestion();
  } else {
    // restart same mode
    startQuiz(quizMode);
  }
});

// ---------- Parent Mode: import ----------
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const newDecks = Array.isArray(parsed) ? parsed : [parsed];

    // very light validation
    newDecks.forEach(d => {
      if (!d || typeof d.id !== "string" || typeof d.title !== "string") {
        throw new Error("Each deck must have id and title");
      }
      if (!Array.isArray(d.cards)) d.cards = [];
      if (!Array.isArray(d.definitionMCQs)) d.definitionMCQs = [];
      if (!Array.isArray(d.usageMCQs)) d.usageMCQs = [];
    });

    const imported = getImportedDecks();
    newDecks.forEach(nd => {
      const idx = imported.findIndex(d => d.id === nd.id);
      if (idx >= 0) imported[idx] = nd;
      else imported.unshift(nd);
    });

    setImportedDecks(imported);
    renderImportedList();
    rebuildDeckList();
    alert("Imported deck successfully.");
  } catch {
    alert("Import failed. Make sure the file is valid JSON in the expected format.");
  } finally {
    fileInput.value = "";
  }
});

function renderImportedList() {
  const imported = getImportedDecks();
  importedList.innerHTML = "";

  if (imported.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No imported decks yet.";
    importedList.appendChild(p);
    return;
  }

  imported.forEach(d => {
    const row = document.createElement("div");
    row.className = "row";

    const name = document.createElement("div");
    name.textContent = d.title;

    const del = document.createElement("button");
    del.className = "link";
    del.type = "button";
    del.textContent = "Delete";
    del.onclick = () => {
      const next = getImportedDecks().filter(x => x.id !== d.id);
      setImportedDecks(next);
      renderImportedList();
      rebuildDeckList();
    };

    row.appendChild(name);
    row.appendChild(del);
    importedList.appendChild(row);
  });
}

resetImportedBtn.addEventListener("click", () => {
  const ok = confirm("Delete ALL imported decks on this device?");
  if (!ok) return;
  setImportedDecks([]);
  renderImportedList();
  rebuildDeckList();
});

// ---------- Wire up buttons ----------
shuffleToggle.addEventListener("change", () => { shuffleOn = shuffleToggle.checked; });
flashBtn.addEventListener("click", startFlashcards);
defQuizBtn.addEventListener("click", () => startQuiz("def"));
useQuizBtn.addEventListener("click", () => startQuiz("use"));

// ---------- Boot ----------
(async function init() {
  const result = await loadBuiltinDecks();
  builtinDecks = result.decks;
  rebuildDeckList();
  updateStatusLine(result.source);
  showHome();
})();
