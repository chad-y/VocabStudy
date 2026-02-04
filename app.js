// ---------- Storage helpers ----------
const LS_IMPORTED = "vocabStudyImportedDecks_v1";

function getImportedDecks() {
  try { return JSON.parse(localStorage.getItem(LS_IMPORTED)) || []; }
  catch { return []; }
}
function setImportedDecks(decks) {
  localStorage.setItem(LS_IMPORTED, JSON.stringify(decks));
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

// ---------- Navigation ----------
function show(viewName, headerTitle) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
  titleEl.textContent = headerTitle || "Vocab Study";

  // back button rules
  backBtn.classList.toggle("hidden", viewName === "home");
}

backBtn.addEventListener("click", () => {
  // simple back stack:
  if (views.flash.classList.contains("hidden") === false) showDeck();
  else if (views.quiz.classList.contains("hidden") === false) showDeck();
  else if (views.parent.classList.contains("hidden") === false) showHome();
  else if (views.deck.classList.contains("hidden") === false) showHome();
});

parentBtn.addEventListener("click", () => {
  renderImportedList();
  show("parent", "Parent Mode");
});

// ---------- Load decks ----------
async function loadBuiltinDecks() {
  // old const res = await fetch("./decks.json", { cache: "no-store" });
  const BUILD = "2026-02-03-11.0"; // change this whenever you update decks
  const res = await fetch(`./decks.json?v=${BUILD}`, { cache: "no-store" });

  return await res.json();
}

function rebuildDeckList() {
  const imported = getImportedDecks();
  decks = [...imported, ...builtinDecks];

  deckList.innerHTML = "";
  decks.forEach(d => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = d.title;
    btn.onclick = () => { currentDeck = d; showDeck(); };
    deckList.appendChild(btn);
  });
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

// ---------- Flashcards ----------
function startFlashcards() {
  flashOrder = [...currentDeck.cards];
  if (shuffleOn) flashOrder.sort(() => Math.random() - 0.5);
  flashIndex = 0;
  flashFlipped = false;
  renderFlashcard();
  show("flash", "Flashcards");
}

function renderFlashcard() {
  const total = flashOrder.length;
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
function startQuiz(mode) {
  quizMode = mode; // "def" or "use"
  const src = mode === "def" ? (currentDeck.definitionMCQs || []) : (currentDeck.usageMCQs || []);
  quizOrder = [...src];
  if (shuffleOn) quizOrder.sort(() => Math.random() - 0.5);

  quizIndex = 0;
  quizScore = 0;
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

  const promptText = (quizMode === "def") ? q.question : q.prompt;
  quizPrompt.textContent = promptText;

  quizChoices.innerHTML = "";
  q.choices.forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.className = "choiceBtn";
    btn.textContent = choice;
    btn.onclick = () => handleAnswer(idx, btn);
    quizChoices.appendChild(btn);
  });
}

function handleAnswer(selectedIndex, clickedBtn) {
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
  if (quizIndex < quizOrder.length - 1) {
    quizIndex += 1;
    renderQuizQuestion();
  } else {
    // restart
    startQuiz(quizMode);
  }
});

// ---------- Parent Mode import ----------
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    // Accept either a single deck object or an array of decks
    const newDecks = Array.isArray(parsed) ? parsed : [parsed];

    const imported = getImportedDecks();
    // replace if same id exists
    newDecks.forEach(nd => {
      const idx = imported.findIndex(d => d.id === nd.id);
      if (idx >= 0) imported[idx] = nd;
      else imported.unshift(nd);
    });

    setImportedDecks(imported);
    renderImportedList();
    rebuildDeckList();
    alert("Imported deck successfully.");
  } catch (err) {
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

// ---------- Wire up buttons ----------
shuffleToggle.addEventListener("change", () => { shuffleOn = shuffleToggle.checked; });

flashBtn.addEventListener("click", startFlashcards);
defQuizBtn.addEventListener("click", () => startQuiz("def"));
useQuizBtn.addEventListener("click", () => startQuiz("use"));

// ---------- Boot ----------
(async function init() {
  builtinDecks = await loadBuiltinDecks();
  rebuildDeckList();
  showHome();
})();
