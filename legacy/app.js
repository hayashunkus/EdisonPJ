const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const questions = [
    {
        q: "名古屋城の屋根に輝く、金色の飾りは何と呼ばれる？",
        a: ["金のしゃちほこ", "金の鯉", "黄金の鳥", "金の龍"],
        c: 0,
        e: "名古屋城の金鯱（きんしゃち）は、名古屋を象徴する存在です。",
    },
    {
        q: "愛知県にある、焼き物の産地として知られる市はどこ？",
        a: ["常滑市", "高山市", "熱海市", "松本市"],
        c: 0,
        e: "常滑市は常滑焼で知られ、やきもの散歩道も人気です。",
    },
    {
        q: "名古屋めしとして知られる、平たい麺料理は？",
        a: ["きしめん", "ほうとう", "讃岐うどん", "盛岡冷麺"],
        c: 0,
        e: "きしめんは平たい麺が特徴の、名古屋を代表する料理です。",
    },
    {
        q: "愛知県にある、江戸時代の城下町の面影を残す犬山の名所は？",
        a: ["犬山城", "松本城", "彦根城", "姫路城"],
        c: 0,
        e: "犬山城は現存天守の一つとして知られる国宝の城です。",
    },
];

const clues = [
    "名古屋城周辺に伝わる伝説",
    "北東方向に反応あり",
    "探索範囲が半径500mに縮小",
    "宝箱の最終エリアを特定",
];

let screen = "home";
let qi = 0;
let selected = null;
let answered = false;
let score = 0;
let cluesFound = 0;

const radius = [1000, 750, 500, 250, 50];

function show(name) {
    screen = name;

    ["home", "mapScreen", "quizScreen", "rewardScreen"].forEach((id) => {
        $("#" + id).classList.toggle(
            "hidden",
            id !==
            (name === "map"
                ? "mapScreen"
                : name === "quiz"
                    ? "quizScreen"
                    : name === "reward"
                        ? "rewardScreen"
                        : "home")
        );
    });

    $$("[data-screen]").forEach(() => { });

    $$(".navbtn").forEach((b) => {
        b.classList.toggle("active", b.dataset.screen === name);
    });

    $(".nav").classList.toggle("hidden", name === "reward");

    if (name === "map") renderClues();

    window.scrollTo({ top: 0, behavior: "smooth" });
}

$$("[data-screen]").forEach((b) => {
    b.addEventListener("click", () => show(b.dataset.screen));
});

$("#sound").onclick = () => toast("効果音は今後追加予定です");

function toast(s) {
    const t = $("#toast");
    t.textContent = s;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2100);
}

function renderClues() {
    $("#clueCount").textContent = `${cluesFound} / 4`;
    $("#clueStat").innerHTML = `${cluesFound} <span>/ 4</span>`;
    $("#areaStat").textContent = cluesFound === 0 ? "広域" : cluesFound === 4 ? "最終地点" : "縮小中";
    $("#distanceStat").innerHTML =
        cluesFound === 0 ? '??? <span>m</span>' : `${radius[cluesFound]} <span>m</span>`;
    $("#areaTitle").textContent = `半径 ${radius[cluesFound].toLocaleString()}m`;
    $("#areaDescription").textContent =
        cluesFound === 4
            ? "最終エリアを確認！周囲を安全に探索しよう。"
            : "クイズに正解して探索範囲を絞り込もう。";
    $("#radarRange").textContent = `RANGE: ${(radius[cluesFound] / 1000).toFixed(2)} KM`;
    $("#target").style.left = `${70 - cluesFound * 5}%`;
    $("#target").style.top = `${30 + cluesFound * 7}%`;

    $("#clueList").innerHTML = clues
        .map(
            (c, i) => `
        <div class="clue ${i < cluesFound ? "" : "locked"}">
          <span class="clue-icon">${i < cluesFound ? "✦" : "?"}</span>
          <div>
            <b>${i < cluesFound ? c : "未発見の手がかり"}</b>
            <small>${i < cluesFound ? "手がかりを記録しました" : "クイズに正解すると解放"}</small>
          </div>
        </div>
      `
        )
        .join("");
}

function renderQ() {
    const q = questions[qi];
    selected = null;
    answered = false;

    $("#qbadge").textContent = `${String(qi + 1).padStart(2, "0")} / ${String(questions.length).padStart(2, "0")}`;
    $("#progress").style.width = `${((qi + 1) / questions.length) * 100}%`;
    $("#question").textContent = q.q;
    $("#feedback").textContent = "";
    $("#submit").disabled = true;
    $("#submit").innerHTML = "回答を選択してください <span>→</span>";
    $("#answers").innerHTML = "";

    q.a.forEach((a, i) => {
        const b = document.createElement("button");
        b.className = "answer";
        b.innerHTML = `<span class="letter">${"ABCD"[i]}</span><span></span>`;
        b.querySelector("span:last-child").textContent = a;

        b.onclick = () => {
            if (answered) return;
            selected = i;
            $$(".answer").forEach((x) => x.classList.remove("selected"));
            b.classList.add("selected");
            $("#submit").disabled = false;
            $("#submit").innerHTML = "回答を確定する <span>→</span>";
        };

        $("#answers").appendChild(b);
    });
}

$("#submit").onclick = () => {
    if (selected === null) return;

    if (!answered) {
        answered = true;
        const q = questions[qi];

        $$(".answer").forEach((b, i) => {
            b.disabled = true;
            if (i === q.c) b.classList.add("correct");
            else if (i === selected) b.classList.add("wrong");
        });

        if (selected === q.c) {
            score++;
            cluesFound = Math.min(4, cluesFound + 1);
            $("#feedback").textContent = "正解！ " + q.e;
            $("#submit").innerHTML = "手がかりを確認する <span>→</span>";
        } else {
            $("#feedback").textContent = "不正解。" + q.e;
            $("#submit").innerHTML = "探索に戻る <span>→</span>";
        }

        return;
    }

    if (selected === questions[qi].c) {
        $("#newArea").textContent = `半径 ${radius[cluesFound]}m`;
    }

    if (selected === questions[qi].c) {
        $("#rewardText").textContent =
            cluesFound === 4
                ? "すべての手がかりがそろいました。宝箱を探しに行こう！"
                : "正解で新しい手がかりを獲得。探索エリアが狭まりました。";
        $("#rewardProgress").style.width = `${(cluesFound / 4) * 100}%`;
        show("reward");
    } else {
        show("map");
    }

    renderClues();
};

$("#mapQuiz").onclick = () => {
    qi = Math.min(cluesFound, questions.length - 1);
    renderQ();
    show("quiz");
};

$("#continue").onclick = () => {
    renderClues();
    show("map");
};

$$(".mission").forEach((b) => {
    b.addEventListener("click", () => {
        if (b.dataset.screen === "quiz") {
            qi = Math.min(cluesFound, questions.length - 1);
            renderQ();
        }
        show(b.dataset.screen);
    });
});

renderClues();
renderQ();

// Production integration notes:
// 1) Browser Geolocation API obtains the player's position after permission.
// 2) Google Maps JS API displays player and clue/search area. Treasure coordinates should not be sent to the client in full until game logic permits.
// 3) Call a Python backend for Gemini-generated questions. Never embed GEMINI_API_KEY in this file.
// 4) Verify answers server-side before returning the next clue or lock code.

