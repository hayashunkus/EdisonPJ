// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
    Map, Compass, BookOpen, Key, Settings, Navigation,
    RefreshCw, Lock, Unlock, Radio
} from 'lucide-react';
import {
    isFirebaseConfigured,
    generateQuizViaFirebase,
    subscribeChestGps
} from './firebase';

// ==========================================
// 1. Colabから移植：距離に応じたフェーズ判定関数
// ==========================================
export function choosePhase(distanceM) {
    const d = Number(distanceM);
    if (d < 0) throw new Error("距離は0以上にしてください。");
    if (d > 500) {
        return {
            phase: "regional",
            name: "地域探索",
            circleRadius: 500,
            topic: "愛知県内の市町村、地域文化、歴史、伝統、自然",
            hint: "広い地域を考える手がかり。正確な場所は明かさない"
        };
    }
    if (d > 150) {
        return {
            phase: "area",
            name: "エリア探索",
            circleRadius: 200,
            topic: "宝箱のある地域や周辺の名所、地域の特徴",
            hint: "地域を絞れる手がかり。座標や正確な住所は明かさない"
        };
    }
    if (d > 30) {
        return {
            phase: "nearby",
            name: "周辺探索",
            circleRadius: 60,
            topic: "周辺の施設、建物、公園、地形、歴史的な場所",
            hint: "周辺の特徴を使った具体的な手がかり"
        };
    }
    return {
        phase: "final",
        name: "最終探索",
        circleRadius: 20,
        topic: "宝箱近くの場所の特徴や地域知識",
        hint: "最後の探索向け。危険な場所や立入禁止区域に誘導しない"
    };
}

// ==========================================
// 2. Colabから移植：プロンプト構築
// ==========================================
export function buildPrompt(region, distanceM, phaseInfo, difficulty = "やさしめ") {
    return `あなたは愛知県を舞台にした位置連動型宝探しゲーム「EdisonPJ」のクイズ作成担当です。

【ゲーム設定】
対象地域：${region}
宝箱までの距離：${distanceM}m
出題フェーズ：${phaseInfo.name} (${phaseInfo.phase})
テーマ：${phaseInfo.topic}
ヒント方針：${phaseInfo.hint}
難易度：${difficulty}
問題数：1

【作成ルール】
- 愛知県の実在する場所、歴史、文化、自然、名所に関係する問題を作る。
- 距離が短いほど、周辺の場所に関する具体的な内容にする。
- 不確かなことを断定しない。実在しない施設や地理情報を作らない。
- 4択問題を作り、正解は1つにする（choices配列に4つ入れ、answerIndexに0〜3の正解インデックスを入れる）。
- ヒントを3段階で作る。ヒント1は控えめ、ヒント2は範囲を絞り、ヒント3は分かりやすくする。
- 宝箱の座標や解錠コードは出力しない。
- 日本語で、子どもにも分かりやすい文章にする。

以下のJSON形式のみで出力してください（Markdownのコードブロック記号は不要です）：
{
  "question": "問題文",
  "choices": ["Aの選択肢", "Bの選択肢", "Cの選択肢", "Dの選択肢"],
  "answerIndex": 1,
  "explanation": "解説文",
  "hints": ["ヒント1", "ヒント2", "ヒント3"],
  "targetArea": "対象地域名",
  "sources": ["参考にした史実や施設名"],
  "notes": "確認事項（特になければ『特になし』）"
}`;
}

// 紙地図・フィールドノート風Googleマップスタイル
const FIELD_NOTE_MAP_STYLE = [
    { elementType: "geometry", stylers: [{ color: "#efe9dd" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#5c4d3c" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#f9f6f0" }, { weight: 3 }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8d6d3" }] },
    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e4dec6" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d5dec2" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f7f1e3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e6c89c" }] },
    { featureType: "poi.business", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ saturation: -70 }] }
];

const PRESET_AREAS = [
    {
        id: "nagoyacastle",
        name: "名古屋市中区・名古屋城エリア",
        regionPrompt: "愛知県尾張地域と名古屋市（名古屋城周辺）",
        chestCoords: { lat: 35.1850, lng: 136.8996 },
        fuzzyOffset: { lat: -0.0008, lng: 0.0010 },
        code: ["1", "6", "1", "0"],
        story: "大名たちが競って運んだ巨石の石垣と、尾張徳川家の歴史が眠る城郭エリア。石垣に刻まれた印を手がかりに、周辺に隠された探索ボックスを調査せよ。"
    },
    {
        id: "tsurumai",
        name: "名古屋市昭和区・鶴舞公園エリア",
        regionPrompt: "愛知県名古屋市昭和区（鶴舞公園・名古屋工業大学周辺）",
        chestCoords: { lat: 35.1554, lng: 136.9204 },
        fuzzyOffset: { lat: 0.0009, lng: -0.0008 },
        code: ["3", "8", "1", "6"],
        story: "明治42年に開園した歴史ある洋風庭園と日本庭園が交差する場所。かつての博覧会の記憶を辿り、噴水塔の近くで発信されている微弱なGPS信号を頼りに木箱を見つけ出そう。"
    },
    {
        id: "inuyama",
        name: "尾張北部・犬山城下町エリア",
        regionPrompt: "愛知県犬山市（国宝犬山城・城下町・木曽川周辺）",
        chestCoords: { lat: 35.3883, lng: 136.9392 },
        fuzzyOffset: { lat: 0.0007, lng: 0.0007 },
        code: ["1", "5", "3", "7"],
        story: "木曽川のほとりにそびえる現存天守と、古い町並みが残る犬山エリア。城下町の通りを歩きながら地域の歴史を紐解き、4桁の南京錠を解錠しよう。"
    }
];

// ==========================================
// 3. Google Maps コンポーネント（波紋オーバーレイ付き）
// ==========================================
function TreasureGoogleMap({ apiKey, chestCoords, fuzzyOffset, distanceM, playerCoords }) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const circlesRef = useRef([]);
    const playerMarkerRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);

    const phaseInfo = choosePhase(distanceM);

    useEffect(() => {
        if (!apiKey) return;
        if (window.google && window.google.maps) {
            setMapLoaded(true);
            return;
        }
        const existingScript = document.getElementById("google-maps-sdk");
        if (existingScript) {
            existingScript.addEventListener("load", () => setMapLoaded(true));
            return;
        }
        const script = document.createElement("script");
        script.id = "google-maps-sdk";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&language=ja`;
        script.async = true;
        script.defer = true;
        script.onload = () => setMapLoaded(true);
        document.head.appendChild(script);
    }, [apiKey]);

    useEffect(() => {
        if (!mapLoaded || !mapContainerRef.current || !window.google) return;

        const scale = Math.min(1, distanceM / 500);
        const fuzzyCenter = {
            lat: chestCoords.lat + fuzzyOffset.lat * scale,
            lng: chestCoords.lng + fuzzyOffset.lng * scale,
        };

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
                center: fuzzyCenter,
                zoom: 15,
                styles: FIELD_NOTE_MAP_STYLE,
                disableDefaultUI: true,
                zoomControl: true,
            });
        } else {
            mapInstanceRef.current.panTo(fuzzyCenter);
        }

        const map = mapInstanceRef.current;
        circlesRef.current.forEach(c => c.setMap(null));
        circlesRef.current = [];

        const baseRadius = phaseInfo.circleRadius;
        [
            { radius: baseRadius, fillOpacity: 0.14, strokeOpacity: 0.5 },
            { radius: baseRadius * 0.65, fillOpacity: 0.18, strokeOpacity: 0.35 },
            { radius: baseRadius * 0.3, fillOpacity: 0.25, strokeOpacity: 0.2 },
        ].forEach(ring => {
            const circle = new window.google.maps.Circle({
                strokeColor: "#b45309",
                strokeOpacity: ring.strokeOpacity,
                strokeWeight: 2,
                fillColor: "#d97706",
                fillOpacity: ring.fillOpacity,
                map,
                center: fuzzyCenter,
                radius: ring.radius,
            });
            circlesRef.current.push(circle);
        });

        if (playerMarkerRef.current) playerMarkerRef.current.setMap(null);
        playerMarkerRef.current = new window.google.maps.Marker({
            position: playerCoords,
            map,
            title: "現在地",
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#2563eb",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
            }
        });
    }, [mapLoaded, chestCoords, fuzzyOffset, distanceM, playerCoords]);

    if (!apiKey) {
        return (
            <div className="bg-[#efe9dd] border-2 border-dashed border-[#c8b99e] rounded-2xl p-6 text-center space-y-2">
                <Map className="w-8 h-8 text-[#8c7355] mx-auto" />
                <p className="text-sm font-bold">Google Maps APIキーが未設定です</p>
                <p className="text-xs text-[#6e5f4f]">
                    <code>.env.local</code> の <code>VITE_GOOGLE_MAPS_API_KEY</code> または右上の歯車から設定してください。
                </p>
            </div>
        );
    }

    return (
        <div className="relative rounded-2xl overflow-hidden border-2 border-[#d6c9b4] shadow-inner">
            <div ref={mapContainerRef} className="w-full h-80 bg-[#efe9dd]" />
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(92,77,60,0.25)]" />
            <div className="absolute top-3 left-3 bg-[#fdfbf7]/90 backdrop-blur-sm border border-[#d6c9b4] px-3 py-1.5 rounded-lg text-xs text-[#4a3f35] shadow-sm">
                <span className="font-bold text-amber-800">● 波紋エリア半径: 約{phaseInfo.circleRadius}m</span>
                <span className="block text-[10px] text-[#786856]">※中心点が宝箱の厳密な位置とは限りません</span>
            </div>
        </div>
    );
}

// ==========================================
// 4. メインアプリケーション
// ==========================================
export default function App() {
    const [mapsKey, setMapsKey] = useState(
        () => import.meta.env.VITE_GOOGLE_MAPS_API_KEY || localStorage.getItem("edison_maps_key") || ""
    );
    const [activeTab, setActiveTab] = useState("home");
    const [showSettings, setShowSettings] = useState(false);

    const [selectedAreaId, setSelectedAreaId] = useState("nagoyacastle");
    const currentArea = PRESET_AREAS.find(a => a.id === selectedAreaId) || PRESET_AREAS[0];

    // ESP32（Firebase Realtime DB）から受信した宝箱座標があれば上書き
    const [liveChestData, setLiveChestData] = useState(null);
    const effectiveChestCoords = liveChestData
        ? { lat: liveChestData.lat, lng: liveChestData.lng }
        : currentArea.chestCoords;

    const [distanceM, setDistanceM] = useState(350);
    const [difficulty, setDifficulty] = useState("やさしめ");

    const [quizzes, setQuizzes] = useState([
        {
            question: "名古屋城の石垣には、お城を作った大名たちが、自分が運んだ石だとわかるように印をつけていました。この石に彫られた印のことを何と呼ぶでしょう？",
            choices: ["落書き (らくがき)", "刻印 (こくいん)", "記号石 (きごういし)", "紋章 (もんしょう)"],
            answerIndex: 1,
            explanation: "名古屋城の石垣には、どの大名が運んだ石かを示すために文字や紋が彫られており、これを「刻印（こくいん）」と呼びます。",
            hints: [
                "石を運んだ人たちが残した特別な印だよ。",
                "大名たちが自分の石とわかるように石垣に彫ったものだよ。",
                "「こく○○」という名前だよ。"
            ],
            targetArea: "愛知県名古屋市（名古屋城周辺）",
            sources: ["名古屋城公式知識"],
            phaseName: "エリア探索",
            distanceAtGen: 350,
            solved: false,
            selectedChoice: null,
            unlockedHintLevel: 0
        }
    ]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genError, setGenError] = useState("");
    const [unlockedDigits, setUnlockedDigits] = useState([true, false, false, false]);
    const [chestOpened, setChestOpened] = useState(false);

    const phaseInfo = choosePhase(distanceM);
    const playerCoords = {
        lat: effectiveChestCoords.lat - (distanceM / 111000),
        lng: effectiveChestCoords.lng,
    };

    // Firebase Realtime DatabaseからESP32の宝箱位置を購読
    useEffect(() => {
        setLiveChestData(null);
        const unsubscribe = subscribeChestGps(selectedAreaId, (data) => {
            setLiveChestData(data);
        });
        return () => unsubscribe();
    }, [selectedAreaId]);

    // Firebase AI Logic (Gemini) でクイズを生成
    const handleGenerateQuiz = async () => {
        setIsGenerating(true);
        setGenError("");
        try {
            const prompt = buildPrompt(currentArea.regionPrompt, distanceM, phaseInfo, difficulty);
            const rawText = await generateQuizViaFirebase(prompt);
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("JSONの抽出に失敗しました");
            const parsed = JSON.parse(jsonMatch[0]);

            setQuizzes(prev => [
                {
                    ...parsed,
                    phaseName: phaseInfo.name,
                    distanceAtGen: distanceM,
                    solved: false,
                    selectedChoice: null,
                    unlockedHintLevel: 0
                },
                ...prev
            ]);
            setActiveTab("quiz");
        } catch (err) {
            setGenError(err.message || "Firebase経由でのクイズ生成に失敗しました。");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAnswer = (qIndex, choiceIndex) => {
        setQuizzes(prev =>
            prev.map((q, idx) => {
                if (idx !== qIndex) return q;
                const isCorrect = choiceIndex === q.answerIndex;
                if (isCorrect && !q.solved) {
                    setUnlockedDigits(dPrev => {
                        const next = [...dPrev];
                        const firstLocked = next.findIndex(v => !v);
                        if (firstLocked !== -1) next[firstLocked] = true;
                        return next;
                    });
                }
                return { ...q, selectedChoice: choiceIndex, solved: q.solved || isCorrect };
            })
        );
    };

    return (
        <div className="min-h-screen bg-[#f6f2e9] text-[#3d332a] font-sans pb-24">
            <header className="sticky top-0 z-20 bg-[#efe8d8]/95 backdrop-blur border-b border-[#d8cbb8] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-800 text-amber-50 flex items-center justify-center font-bold">
                        <Compass className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-[#2e251d]">Edison フィールド手帳</h1>
                        <p className="text-[11px] text-[#756554] flex items-center gap-1">
                            <Radio className={`w-3 h-3 ${isFirebaseConfigured ? "text-emerald-700" : "text-amber-700"}`} />
                            {isFirebaseConfigured
                                ? liveChestData ? "ESP32 GPS受信中 (Firebase)" : "Firebase接続済"
                                : "ローカルデモモード"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-full px-3 py-1 text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5 text-amber-700" />
                        <span>残り {distanceM}m</span>
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                            {phaseInfo.name}
                        </span>
                    </div>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2 rounded-full bg-[#fdfbf7] border border-[#d8cbb8] text-[#5c4d3c]"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {showSettings && (
                <div className="max-w-md mx-auto mt-3 px-4">
                    <div className="bg-[#fdfbf7] border-2 border-amber-800/30 rounded-2xl p-4 shadow-md space-y-3 text-xs">
                        <div className="font-bold text-sm">現地テスト・シミュレーター設定</div>
                        <div className="space-y-1">
                            <div className="flex justify-between font-bold">
                                <span>距離シミュレート: {distanceM}m</span>
                                <span className="text-amber-800">{phaseInfo.name}</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="800"
                                step="10"
                                value={distanceM}
                                onChange={(e) => setDistanceM(Number(e.target.value))}
                                className="w-full accent-amber-700"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                value={selectedAreaId}
                                onChange={(e) => setSelectedAreaId(e.target.value)}
                                className="bg-white border border-[#d8cbb8] rounded-lg px-2 py-1.5"
                            >
                                {PRESET_AREAS.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value)}
                                className="bg-white border border-[#d8cbb8] rounded-lg px-2 py-1.5"
                            >
                                <option value="やさしめ">やさしめ</option>
                                <option value="ふつう">ふつう</option>
                                <option value="難しめ">難しめ</option>
                            </select>
                        </div>
                        <div>
                            <label className="block font-bold mb-1">Google Maps APIキー（未設定時のみ）</label>
                            <input
                                type="password"
                                value={mapsKey}
                                onChange={(e) => {
                                    setMapsKey(e.target.value);
                                    localStorage.setItem("edison_maps_key", e.target.value.trim());
                                }}
                                placeholder=".env.local設定済なら空欄でOK"
                                className="w-full bg-white border border-[#d8cbb8] rounded-lg px-2.5 py-1.5"
                            />
                        </div>
                    </div>
                </div>
            )}

            <main className="max-w-md mx-auto p-4 space-y-4">
                {activeTab === "home" && (
                    <div className="space-y-4">
                        <section className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-4 shadow-sm space-y-2">
                            <span className="text-xs font-bold text-amber-800">調査記録・ミッション</span>
                            <h2 className="text-base font-bold text-[#2e251d]">{currentArea.name}</h2>
                            <p className="text-xs leading-relaxed text-[#5c4d3c]">{currentArea.story}</p>
                        </section>

                        <section className="bg-[#efe8d8] border-2 border-[#cbbba0] rounded-2xl p-5 text-center space-y-4">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-900/10 flex items-center justify-center text-amber-900">
                                {chestOpened ? <Unlock className="w-7 h-7 text-emerald-700" /> : <Lock className="w-7 h-7" />}
                            </div>
                            <div className="flex justify-center gap-2.5">
                                {currentArea.code.map((digit, i) => {
                                    const isVisible = unlockedDigits[i] || distanceM <= 30;
                                    return (
                                        <div
                                            key={i}
                                            className="w-12 h-14 rounded-xl border-2 bg-[#fdfbf7] border-amber-700 flex items-center justify-center text-xl font-bold"
                                        >
                                            {isVisible ? digit : "?"}
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => setChestOpened(true)}
                                disabled={!unlockedDigits.every(Boolean) && distanceM > 30}
                                className="w-full py-2.5 rounded-xl font-bold text-xs bg-amber-800 text-white disabled:bg-[#cfc4b0]"
                            >
                                {chestOpened ? "解錠済み！" : "南京錠を開ける"}
                            </button>
                        </section>

                        <section className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-4 space-y-3">
                            {genError && (
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                                    {genError}
                                </p>
                            )}
                            <button
                                onClick={handleGenerateQuiz}
                                disabled={isGenerating}
                                className="w-full py-3 rounded-xl font-bold text-xs bg-[#3d332a] text-[#fdfbf7] flex items-center justify-center gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                                <span>
                                    {isGenerating
                                        ? "Firebase経由で問題を生成中..."
                                        : `現在地（${phaseInfo.name}）の問題を取得する`}
                                </span>
                            </button>
                        </section>
                    </div>
                )}

                {activeTab === "map" && (
                    <TreasureGoogleMap
                        apiKey={mapsKey}
                        chestCoords={effectiveChestCoords}
                        fuzzyOffset={currentArea.fuzzyOffset}
                        distanceM={distanceM}
                        playerCoords={playerCoords}
                    />
                )}

                {activeTab === "quiz" && (
                    <div className="space-y-4">
                        {quizzes.map((q, qIdx) => (
                            <article key={qIdx} className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-4 space-y-3">
                                <div className="text-[11px] font-bold text-amber-900">
                                    {q.phaseName}（残り{q.distanceAtGen}m地点） / {q.targetArea}
                                </div>
                                <p className="text-sm font-bold">{q.question}</p>
                                <div className="space-y-2">
                                    {q.choices.map((choice, cIdx) => (
                                        <button
                                            key={cIdx}
                                            onClick={() => handleAnswer(qIdx, cIdx)}
                                            className="w-full text-left px-3 py-2 rounded-xl border border-[#d8cbb8] bg-white text-xs"
                                        >
                                            {["A", "B", "C", "D"][cIdx]}. {choice}
                                        </button>
                                    ))}
                                </div>
                                {q.selectedChoice !== null && (
                                    <div className="bg-[#efe8d8]/60 rounded-xl p-3 text-xs space-y-1">
                                        <p className="font-bold">
                                            {q.selectedChoice === q.answerIndex ? "◎ 正解！" : "× 不正解"}
                                        </p>
                                        <p>{q.explanation}</p>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </main>

            <nav className="fixed bottom-0 inset-x-0 bg-[#efe8d8] border-t border-[#d8cbb8] px-6 py-2 flex justify-around max-w-md mx-auto z-20">
                <button onClick={() => setActiveTab("home")} className="flex flex-col items-center text-xs font-bold">
                    <Key className="w-5 h-5" /><span>木箱・記録</span>
                </button>
                <button onClick={() => setActiveTab("map")} className="flex flex-col items-center text-xs font-bold">
                    <Map className="w-5 h-5" /><span>周辺マップ</span>
                </button>
                <button onClick={() => setActiveTab("quiz")} className="flex flex-col items-center text-xs font-bold">
                    <BookOpen className="w-5 h-5" /><span>手がかり帳</span>
                </button>
            </nav>
        </div>
    );
}