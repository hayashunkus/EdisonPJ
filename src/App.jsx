import React, { useState, useEffect, useRef } from 'react';
import {
    Map, Compass, BookOpen, Key, Settings, Navigation,
    RefreshCw, Lock, Unlock, Radio, RotateCcw, MapPin, Utensils, Landmark, Sparkles
} from 'lucide-react';

// ==========================================
// 0. 環境変数取得（APIキーは画面に表示せず裏側でのみ使用）
// ==========================================
const getEnv = (key, fallback = '') => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
            return import.meta.env[key];
        }
    } catch (e) { }
    return fallback;
};

const DEFAULT_FIREBASE_DB_URL = "https://edisonpj-e2c2d-default-rtdb.asia-southeast1.firebasedatabase.app";

// 2点間の距離（メートル）を正確に計算するHaversine公式
function calcDistanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * 座標から実際の住所・施設名を取得（名古屋工業大学・鶴舞などを正確に特定）
 */
async function reverseGeocodeLocation(lat, lng) {
    if (typeof window !== "undefined" && window.google && window.google.maps) {
        try {
            const geocoder = new window.google.maps.Geocoder();
            const response = await geocoder.geocode({ location: { lat, lng }, language: "ja" });
            if (response.results && response.results.length > 0) {
                return response.results[0].formatted_address.replace(/^日本、〒\d{3}-\d{4}\s*/, "");
            }
        } catch (e) { }
    }
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`
        );
        if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) return data.display_name;
        }
    } catch (e) { }
    return `北緯${lat.toFixed(5)}度, 東経${lng.toFixed(5)}度 周辺`;
}

/**
 * ESP32のGPS購読
 */
function subscribeChestGps(areaId, callback) {
    const targetId = areaId || "anywhere";
    const baseUrl = (getEnv("VITE_FIREBASE_DATABASE_URL") || DEFAULT_FIREBASE_DB_URL).replace(/\/$/, "");

    const poll = async () => {
        try {
            const res = await fetch(`${baseUrl}/chests/${targetId}.json`);
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
                    callback(data);
                }
            }
        } catch (e) { }
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
}

/**
 * ESP32へ解錠/施錠ステータスを送信
 */
async function setChestUnlocked(areaId, isUnlocked = true) {
    const targetId = areaId || "anywhere";
    const baseUrl = (getEnv("VITE_FIREBASE_DATABASE_URL") || DEFAULT_FIREBASE_DB_URL).replace(/\/$/, "");
    try {
        await fetch(`${baseUrl}/chests/${targetId}.json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unlocked: isUnlocked, updatedAt: Date.now() }),
        });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Gemini API 呼び出し（多重接続対応・Google検索グラウンディング付き）
 */
async function generateQuizViaGemini(promptText) {
    const apiKey = getEnv("VITE_GEMINI_API_KEY");
    if (!apiKey) {
        throw new Error("環境変数 VITE_GEMINI_API_KEY が設定されていません。.env.local または GitHub Secrets を確認してください。");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const body = {
        systemInstruction: {
            parts: [
                {
                    text: `あなたは位置情報連動フィールドワークゲーム「EdisonPJ」の専属クイズ作成AIです。
必ずGoogle検索を使って、指定された「プレイヤーの現在地」と「宝箱の座標」の周辺（徒歩圏内・同じ区や町内）に実在する大学、公園、施設、歴史・豆知識、または近くの実在する飲食店・カフェのおすすめメニューや名物を調べて4択問題を作成してください。
現在地から離れた「名古屋城」などの無関係な定番観光地の問題を出すことは厳禁です（現在地が名古屋城のすぐ近くである場合を除く）。
名古屋市内の観光・歴史・名物については【公式】名古屋市観光情報「名古屋コンシェルジュ」(https://www.nagoya-info.jp/) の情報も積極的に参照してください。`
                }
            ]
        },
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            temperature: 0.75,
        },
        tools: [{ google_search: {} }],
    };

    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`問題生成サーバーが混雑しています (${res.status})。数秒後にもう一度お試しください。`);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const groundingChunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingSources = groundingChunks
        .map((c) => c.web?.title || c.web?.uri)
        .filter(Boolean);

    return { rawText, groundingSources };
}

// ==========================================
// 1. 距離に応じたフェーズ判定関数
// ==========================================
export function choosePhase(distanceM) {
    const d = Number(distanceM);
    if (d > 500) {
        return {
            phase: "regional",
            name: "広域エリア探索",
            circleRadius: 500,
            topic: "現在地の区・市町村の歴史、ご当地文化、有名な通りや駅の特徴",
            hint: "現在地周辺のエリア全体に関する手がかり"
        };
    }
    if (d > 150) {
        return {
            phase: "area",
            name: "周辺エリア探索",
            circleRadius: 200,
            topic: "現在地と宝箱周辺（徒歩5〜10分圏内）の大学、公園、商店街、人気飲食店の名物メニュー",
            hint: "現在地周辺の具体的なランドマークやお店の手がかり"
        };
    }
    if (d > 30) {
        return {
            phase: "nearby",
            name: "近距離スポット探索",
            circleRadius: 60,
            topic: "すぐ近く（徒歩1〜3分圏内）の建物、キャンパス・公園内の施設、すぐそばのカフェや店の特徴",
            hint: "周囲を見渡すと確認できる詳しい手がかり"
        };
    }
    return {
        phase: "final",
        name: "最終接近フェーズ",
        circleRadius: 20,
        topic: "宝箱の目と鼻の先にあるスポットの豆知識・特徴",
        hint: "宝箱はすぐそこ！最後の手がかり"
    };
}

// ==========================================
// 2. 現在地＆宝箱位置に基づく高精度プロンプト構築
// ==========================================
export function buildLocationBasedPrompt({
    playerCoords,
    playerAddress,
    chestCoords,
    chestAddress,
    distanceM,
    phaseInfo,
    difficulty,
    category,
    pastQuestions = []
}) {
    const categoryInstructions = {
        auto: "「現在地周辺の歴史・豆知識」「すぐ近くの飲食店・カフェのおすすめメニュー」「周辺の大学・公園・施設のトリビア」の中から、その場所に最もふさわしい面白いテーマを1つ選んで出題してください。",
        history: "現在地または宝箱のすぐ近くにある場所の「歴史・由来・地理の豆知識」に関する問題を作成してください（名古屋コンシェルジュ https://www.nagoya-info.jp/ や地域の公式史実を参考にすること）。",
        gourmet: "現在地または宝箱の近く（徒歩圏内）に実在する「飲食店・カフェ・老舗・学生に人気の店」の看板メニューや名物、またはその地域の食文化に関する問題を作成してください。",
        spot: "現在地または宝箱のすぐ近くにある「大学（名古屋工業大学など）・公園（鶴舞公園など）・建物・駅・施設」の具体的な特徴や豆知識に関する問題を作成してください。"
    };

    const avoidList =
        pastQuestions.length > 0
            ? `\n【重複禁止：以下の過去に出題した問題とは全く異なる新しいトピック・店舗・施設について出題してください】\n${pastQuestions
                .slice(0, 8)
                .map((q, i) => `${i + 1}. ${q}`)
                .join("\n")}`
            : "";

    return `以下の「プレイヤーの現在地」と「宝箱の位置」の実際の地理情報に基づいて、現地にいる人がワクワクする4択クイズを1問作成してください。

【現在の正確な位置データ】
- プレイヤーの現在地：${playerAddress}（北緯 ${playerCoords.lat.toFixed(5)}, 東経 ${playerCoords.lng.toFixed(5)}）
- 宝箱（ESP32）の位置：${chestAddress}（北緯 ${chestCoords.lat.toFixed(5)}, 東経 ${chestCoords.lng.toFixed(5)}）
- 宝箱までの距離：約 ${distanceM}m
- 探索フェーズ：${phaseInfo.name}
- 難易度：${difficulty}

【出題ジャンル指示】
${categoryInstructions[category] || categoryInstructions.auto}

【厳守ルール】
1. 必ず上記の座標・住所の周辺（${chestAddress} または ${playerAddress} の周辺）に特化した問題を出すこと。現在地が名古屋城でない限り、名古屋城の問題は絶対に出さないこと。
2. Google検索で裏付けが取れる「実在する施設・大学・公園・店舗・メニュー・歴史」のみを出題し、架空の店名や不確かな情報は作らないこと。
3. 名古屋市内の場合は「名古屋コンシェルジュ (https://www.nagoya-info.jp/)」や現地の公式情報も参考にすること。
4. 4択問題（choicesは4つ、answerIndexは0〜3）にし、3段階のヒント（hints配列に3つ）をつけること。
5. 宝箱の直接の緯度経度数値は問題文に出さないこと。${avoidList}

以下のJSON形式のみで出力してください（Markdownのコードブロック記号は不要）：
{
  "question": "問題文",
  "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
  "answerIndex": 0,
  "explanation": "詳しい解説文（場所やお店の魅力・豆知識も紹介）",
  "hints": ["ヒント1（少し抽象的）", "ヒント2（具体的な特徴）", "ヒント3（答えにかなり近いヒント）"],
  "targetArea": "出題対象の具体的な場所・エリア名（例：昭和区・名古屋工業大学周辺 など）",
  "sources": ["参考にした施設名・店舗名・公式サイト名"]
}`;
}

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
    { featureType: "poi.business", stylers: [{ visibility: "on" }] },
    { featureType: "transit", elementType: "labels.icon", stylers: [{ saturation: -40 }] }
];

// デフォルト座標を名古屋工業大学・鶴舞エリアに設定
const DEFAULT_COORDS = { lat: 35.1566, lng: 136.9248 };
const STORAGE_KEY = "edison_pj_save_v2";

// ==========================================
// 3. マップコンポーネント（タップで現在地補正対応）
// ==========================================
function TreasureGoogleMap({
    apiKey,
    chestCoords,
    fuzzyOffset,
    distanceM,
    playerCoords,
    isGpsLive,
    onManualPlayerMove
}) {
    const mapContainerRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const circlesRef = useRef([]);
    const playerMarkerRef = useRef(null);
    const [mapLoaded, setMapLoaded] = useState(false);

    const phaseInfo = choosePhase(distanceM);

    useEffect(() => {
        if (!apiKey) return;
        if (typeof window !== 'undefined' && window.google && window.google.maps) {
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
            const map = new window.google.maps.Map(mapContainerRef.current, {
                center: fuzzyCenter,
                zoom: 16,
                styles: FIELD_NOTE_MAP_STYLE,
                disableDefaultUI: true,
                zoomControl: true,
            });

            // ★Safari/Edge等でWeb位置情報がズレた際、マップをタップして現在地を直接補正できる機能
            map.addListener("click", (e) => {
                if (e.latLng && onManualPlayerMove) {
                    onManualPlayerMove({
                        lat: e.latLng.lat(),
                        lng: e.latLng.lng(),
                    });
                }
            });

            mapInstanceRef.current = map;
        }

        const map = mapInstanceRef.current;
        circlesRef.current.forEach(c => c.setMap(null));
        circlesRef.current = [];

        const baseRadius = phaseInfo.circleRadius;
        const strokeColor = isGpsLive ? "#059669" : "#b45309";
        const fillColor = isGpsLive ? "#10b981" : "#d97706";

        [
            { radius: baseRadius, fillOpacity: 0.14, strokeOpacity: 0.5 },
            { radius: baseRadius * 0.65, fillOpacity: 0.18, strokeOpacity: 0.35 },
            { radius: baseRadius * 0.3, fillOpacity: 0.25, strokeOpacity: 0.2 },
        ].forEach(ring => {
            const circle = new window.google.maps.Circle({
                strokeColor,
                strokeOpacity: ring.strokeOpacity,
                strokeWeight: 2,
                fillColor,
                fillOpacity: ring.fillOpacity,
                map,
                center: fuzzyCenter,
                radius: ring.radius,
                clickable: false,
            });
            circlesRef.current.push(circle);
        });

        if (playerMarkerRef.current) playerMarkerRef.current.setMap(null);
        playerMarkerRef.current = new window.google.maps.Marker({
            position: playerCoords,
            map,
            title: "あなたの現在地（ドラッグまたは地図タップで補正可能）",
            draggable: true,
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: "#2563eb",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
            }
        });

        playerMarkerRef.current.addListener("dragend", (e) => {
            if (e.latLng && onManualPlayerMove) {
                onManualPlayerMove({
                    lat: e.latLng.lat(),
                    lng: e.latLng.lng(),
                });
            }
        });
    }, [mapLoaded, chestCoords, fuzzyOffset, distanceM, playerCoords, isGpsLive]);

    if (!apiKey || !mapLoaded) {
        return (
            <div className="relative rounded-2xl overflow-hidden border-2 border-[#d6c9b4] bg-[#efe9dd] h-80 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="relative w-28 h-28 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-amber-700/30 animate-ping" />
                    <div className="absolute inset-3 rounded-full border-2 border-amber-800/40" />
                    <div className="w-12 h-12 rounded-full bg-amber-800 text-amber-50 flex items-center justify-center font-bold shadow-md">
                        <Compass className="w-6 h-6 animate-spin" style={{ animationDuration: '8s' }} />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-bold text-[#2e251d]">
                        {isGpsLive ? "● ESP32 GPS受信中" : "● 探索レーダー待機中"}
                    </p>
                    <p className="text-[11px] text-[#8c7a66] mt-1">
                        波紋エリア半径: 約{phaseInfo.circleRadius}m
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative rounded-2xl overflow-hidden border-2 border-[#d6c9b4] shadow-inner">
            <div ref={mapContainerRef} className="w-full h-96 bg-[#efe9dd]" />
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(92,77,60,0.25)]" />
            <div className="absolute top-3 left-3 bg-[#fdfbf7]/95 backdrop-blur-sm border border-[#d6c9b4] px-3 py-1.5 rounded-lg text-xs text-[#4a3f35] shadow-sm">
                <span className={`font-bold ${isGpsLive ? "text-emerald-700" : "text-amber-800"}`}>
                    {isGpsLive ? "● 宝箱GPSリアルタイム同期中" : "● 待機座標モード"}
                </span>
                <span className="block text-[10px] text-[#786856]">
                    波紋半径: 約{phaseInfo.circleRadius}m / 青ピン: あなたの現在地
                </span>
            </div>
            <div className="absolute bottom-3 left-3 right-3 bg-[#2e251d]/85 text-[#fdfbf7] px-3 py-1.5 rounded-lg text-[11px] flex items-center justify-between">
                <span>💡 位置がズレている時は地図をタップして現在地を補正できます</span>
            </div>
        </div>
    );
}

// ==========================================
// 4. メインアプリケーション
// ==========================================
export default function App() {
    // APIキーは環境変数からのみ取得（画面表示・手入力なし）
    const mapsKey = getEnv("VITE_GOOGLE_MAPS_API_KEY");

    // localStorageから前回のセーブデータを復元（再起動しても消えない）
    const savedData = (() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    })();

    const [activeTab, setActiveTab] = useState("home");
    const [showSettings, setShowSettings] = useState(false);

    // ESP32（宝箱）のGPSデータ
    const [liveChestData, setLiveChestData] = useState(null);
    const isChestGpsLive = Boolean(liveChestData);
    const effectiveChestCoords = liveChestData
        ? { lat: liveChestData.lat, lng: liveChestData.lng }
        : DEFAULT_COORDS;

    // プレイヤーの現在地（スマホGPS または 手動補正）
    const [playerCoords, setPlayerCoords] = useState(
        savedData?.playerCoords || { lat: 35.1558, lng: 136.9240 }
    );
    const [gpsAccuracy, setGpsAccuracy] = useState(null);
    const [useBrowserGps, setUseBrowserGps] = useState(true);
    const [manualOverride, setManualOverride] = useState(false);

    // 逆ジオコーディングで特定した実際の住所・エリア名
    const [playerAddress, setPlayerAddress] = useState("現在地を取得中...");
    const [chestAddress, setChestAddress] = useState("宝箱周辺エリアを取得中...");

    // クイズ設定（ジャンル・難易度）
    const [difficulty, setDifficulty] = useState(savedData?.difficulty || "ふつう");
    const [quizCategory, setQuizCategory] = useState(savedData?.quizCategory || "auto");

    // 解いた問題・鍵の進捗（localStorageで永続化）
    const [quizzes, setQuizzes] = useState(() => savedData?.quizzes || []);
    const [unlockedDigits, setUnlockedDigits] = useState(
        () => savedData?.unlockedDigits || [false, false, false, false]
    );
    const [chestOpened, setChestOpened] = useState(() => savedData?.chestOpened || false);
    const padCode = ["2", "0", "2", "6"];

    const [isGenerating, setIsGenerating] = useState(false);
    const [genError, setGenError] = useState("");

    // プレイヤーと宝箱の実際の距離（m）
    const distanceM = calcDistanceMeters(
        playerCoords.lat,
        playerCoords.lng,
        effectiveChestCoords.lat,
        effectiveChestCoords.lng
    );
    const phaseInfo = choosePhase(distanceM);

    // 状態が変わるたびに localStorage に自動保存（リロードしても消えない）
    useEffect(() => {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    quizzes,
                    unlockedDigits,
                    chestOpened,
                    playerCoords,
                    difficulty,
                    quizCategory,
                })
            );
        } catch (e) { }
    }, [quizzes, unlockedDigits, chestOpened, playerCoords, difficulty, quizCategory]);

    // 1. ESP32の宝箱GPSをFirebaseからリアルタイム購読
    useEffect(() => {
        const unsubscribe = subscribeChestGps("anywhere", (data) => {
            setLiveChestData(data);
        });
        return () => unsubscribe();
    }, []);

    // 2. スマホ/ブラウザの高精度GPS追跡（Safari/Edge対策としてキャッシュを無効化）
    useEffect(() => {
        if (!useBrowserGps || manualOverride || !navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const acc = Math.round(pos.coords.accuracy || 0);
                setGpsAccuracy(acc);
                // Safari/Edgeで基地局キャッシュによる極端な誤差（3000m以上）が来た場合は無視
                if (acc > 3000 && gpsAccuracy !== null && gpsAccuracy < 500) return;

                setPlayerCoords({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                });
            },
            (err) => {
                console.warn("ブラウザ位置情報エラー:", err);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0, // キャッシュされた古い位置情報を禁止（Safari/Edge対策）
                timeout: 10000,
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [useBrowserGps, manualOverride]);

    // 3. プレイヤーと宝箱の座標から実際の町名・ランドマーク名を取得
    useEffect(() => {
        let active = true;
        reverseGeocodeLocation(playerCoords.lat, playerCoords.lng).then((addr) => {
            if (active) setPlayerAddress(addr);
        });
        return () => { active = false; };
    }, [playerCoords.lat.toFixed(4), playerCoords.lng.toFixed(4)]);

    useEffect(() => {
        let active = true;
        reverseGeocodeLocation(effectiveChestCoords.lat, effectiveChestCoords.lng).then((addr) => {
            if (active) setChestAddress(addr);
        });
        return () => { active = false; };
    }, [effectiveChestCoords.lat.toFixed(4), effectiveChestCoords.lng.toFixed(4)]);

    // マップタップやピン移動で現在地を手動補正したとき
    const handleManualPlayerMove = (newCoords) => {
        setManualOverride(true);
        setPlayerCoords(newCoords);
    };

    // 現在地と宝箱位置をもとにGemini APIで新しいご当地・周辺スポット問題を生成
    const handleGenerateQuiz = async () => {
        setIsGenerating(true);
        setGenError("");
        try {
            const pastQuestions = quizzes.map((q) => q.question);
            const prompt = buildLocationBasedPrompt({
                playerCoords,
                playerAddress,
                chestCoords: effectiveChestCoords,
                chestAddress,
                distanceM,
                phaseInfo,
                difficulty,
                category: quizCategory,
                pastQuestions,
            });

            const { rawText, groundingSources } = await generateQuizViaGemini(prompt);
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("問題データの解析に失敗しました。もう一度お試しください。");
            const parsed = JSON.parse(jsonMatch[0]);

            const mergedSources =
                groundingSources && groundingSources.length > 0
                    ? Array.from(new Set([...(parsed.sources || []), ...groundingSources])).slice(0, 4)
                    : parsed.sources || ["現地スポット情報"];

            setQuizzes((prev) => [
                {
                    ...parsed,
                    id: Date.now(),
                    sources: mergedSources,
                    phaseName: phaseInfo.name,
                    distanceAtGen: distanceM,
                    solved: false,
                    selectedChoice: null,
                    unlockedHintLevel: 0,
                },
                ...prev,
            ]);
            setActiveTab("quiz");
        } catch (err) {
            setGenError(err.message || "問題の生成に失敗しました。");
        } finally {
            setIsGenerating(false);
        }
    };

    // クイズ回答処理（正解するごとに4桁の鍵が1つずつ開く）
    const handleAnswer = (qIndex, choiceIndex) => {
        setQuizzes((prev) =>
            prev.map((q, idx) => {
                if (idx !== qIndex) return q;
                const isCorrect = choiceIndex === q.answerIndex;
                if (isCorrect && !q.solved) {
                    setUnlockedDigits((dPrev) => {
                        const next = [...dPrev];
                        const firstLocked = next.findIndex((v) => !v);
                        if (firstLocked !== -1) next[firstLocked] = true;
                        return next;
                    });
                }
                return { ...q, selectedChoice: choiceIndex, solved: q.solved || isCorrect };
            })
        );
    };

    // ヒントを1段階ずつ開く
    const handleRevealHint = (qIndex) => {
        setQuizzes((prev) =>
            prev.map((q, idx) => {
                if (idx !== qIndex) return q;
                return { ...q, unlockedHintLevel: Math.min(3, (q.unlockedHintLevel || 0) + 1) };
            })
        );
    };

    // 南京錠を開ける（Firebaseに unlocked: true を送り、ESP32の距離センサーを有効化）
    const handleUnlockChest = async () => {
        setChestOpened(true);
        await setChestUnlocked("anywhere", true);
    };

    // 進捗とFirebaseの鍵状態を完全に初期化するリセット処理
    const handleResetAll = async () => {
        if (!window.confirm("これまでに解いた問題と鍵の進捗をリセットし、宝箱を再ロックしますか？")) {
            return;
        }
        setQuizzes([]);
        setUnlockedDigits([false, false, false, false]);
        setChestOpened(false);
        localStorage.removeItem(STORAGE_KEY);
        await setChestUnlocked("anywhere", false);
    };

    return (
        <div className="min-h-screen bg-[#f6f2e9] text-[#3d332a] font-sans pb-24">
            {/* ヘッダー */}
            <header className="sticky top-0 z-20 bg-[#efe8d8]/95 backdrop-blur border-b border-[#d8cbb8] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-800 text-amber-50 flex items-center justify-center font-bold shadow-sm">
                        <Compass className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-[#2e251d]">Edison フィールド手帳</h1>
                        <p className="text-[11px] text-[#756554] flex items-center gap-1">
                            <Radio className={`w-3 h-3 ${isChestGpsLive ? "text-emerald-700 animate-pulse" : "text-amber-700"}`} />
                            {isChestGpsLive ? "宝箱GPSリアルタイム受信中" : "宝箱GPS待機中"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-full px-3 py-1 text-xs font-bold text-amber-900 flex items-center gap-1.5 shadow-sm">
                        <Navigation className="w-3.5 h-3.5 text-amber-700" />
                        <span>残り {distanceM}m</span>
                    </div>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2 rounded-full bg-[#fdfbf7] border border-[#d8cbb8] text-[#5c4d3c] hover:bg-amber-50"
                        title="位置情報・ゲーム設定"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* 設定・位置補正パネル（APIキーは一切表示しない） */}
            {showSettings && (
                <div className="max-w-md mx-auto mt-3 px-4">
                    <div className="bg-[#fdfbf7] border-2 border-amber-800/30 rounded-2xl p-4 shadow-md space-y-4 text-xs">
                        <div className="flex items-center justify-between border-b border-[#e5dec9] pb-2">
                            <span className="font-bold text-sm flex items-center gap-1.5 text-amber-950">
                                <Settings className="w-4 h-4" /> 探索・位置補正オプション
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowSettings(false)}
                                className="text-[#8c7a66] font-bold"
                            >
                                閉じる
                            </button>
                        </div>

                        {/* Safari / Edge 向け位置情報ステータス＆補正 */}
                        <div className="bg-[#f6f1e6] border border-[#dfd5c0] rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-[#2e251d]">現在地の取得モード</span>
                                <span className="text-[11px] text-amber-900 font-bold">
                                    {manualOverride
                                        ? "手動補正中"
                                        : gpsAccuracy
                                            ? `GPS誤差 ±${gpsAccuracy}m`
                                            : "GPS測位中"}
                                </span>
                            </div>
                            <p className="text-[11px] text-[#5c4d3c]">
                                現在の判定場所: <strong>{playerAddress}</strong>
                            </p>
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setManualOverride(false);
                                        setUseBrowserGps(true);
                                    }}
                                    className={`flex-1 py-1.5 rounded-lg font-bold border ${!manualOverride
                                        ? "bg-amber-800 text-white border-amber-800"
                                        : "bg-white text-[#4a3f35] border-[#d8cbb8]"
                                        }`}
                                >
                                    スマホGPS自動追従
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setManualOverride(true);
                                        setPlayerCoords({
                                            lat: effectiveChestCoords.lat - 0.0012,
                                            lng: effectiveChestCoords.lng,
                                        });
                                    }}
                                    className={`flex-1 py-1.5 rounded-lg font-bold border ${manualOverride
                                        ? "bg-amber-800 text-white border-amber-800"
                                        : "bg-white text-[#4a3f35] border-[#d8cbb8]"
                                        }`}
                                >
                                    宝箱の近くへ位置補正
                                </button>
                            </div>
                            <p className="text-[10px] text-[#756554]">
                                ※SafariやEdgeで位置情報がズレる場合は、「周辺マップ」タブで地図上の自分のいる場所をタップすると正確に補正できます。
                            </p>
                        </div>

                        {/* クイズの難易度＆リセット */}
                        <div className="flex items-center justify-between pt-1">
                            <span className="font-bold">クイズの難易度</span>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value)}
                                className="bg-white border border-[#d8cbb8] rounded-lg px-3 py-1.5 font-bold"
                            >
                                <option value="やさしめ">やさしめ</option>
                                <option value="ふつう">ふつう</option>
                                <option value="難しめ">難しめ</option>
                            </select>
                        </div>

                        <div className="pt-2 border-t border-[#e5dec9] flex justify-between items-center">
                            <span className="text-[11px] text-[#756554]">前回の解錠状態や履歴を消す場合</span>
                            <button
                                type="button"
                                onClick={handleResetAll}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 font-bold hover:bg-red-100"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>データ＆宝箱ロック初期化</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* メインコンテンツ */}
            <main className="max-w-md mx-auto p-4 space-y-4">
                {/* ① ホーム・ミッション画面 */}
                {activeTab === "home" && (
                    <div className="space-y-4">
                        {/* 現在地＆宝箱エリア情報カード */}
                        <section className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-4 shadow-sm space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
                                    <MapPin className="w-3.5 h-3.5" /> リアルタイム位置連動フィールド
                                </span>
                                <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                                    {phaseInfo.name}
                                </span>
                            </div>
                            <div className="text-xs space-y-1 pt-1">
                                <p className="text-[#2e251d]">
                                    <span className="font-bold text-[#756554]">あなたの現在地：</span>
                                    {playerAddress}
                                </p>
                                <p className="text-[#2e251d]">
                                    <span className="font-bold text-[#756554]">宝箱の検知エリア：</span>
                                    {chestAddress}
                                </p>
                            </div>
                        </section>

                        {/* 木箱と真鍮の南京錠カード */}
                        <section className="bg-[#efe8d8] border-2 border-[#cbbba0] rounded-2xl p-5 text-center space-y-4 shadow-sm">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-900/10 border border-amber-900/20 flex items-center justify-center text-amber-900">
                                {chestOpened ? (
                                    <Unlock className="w-7 h-7 text-emerald-700" />
                                ) : (
                                    <Lock className="w-7 h-7" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">
                                    {chestOpened
                                        ? "南京錠を解錠しました！宝箱に手を近づけてください"
                                        : "探索木箱の南京錠（4問正解で解錠）"}
                                </h3>
                                <p className="text-xs text-[#6e5f4f] mt-0.5">
                                    {chestOpened
                                        ? "ESP32の距離センサー（30cm以内）が有効になりました！"
                                        : `あと ${unlockedDigits.filter((v) => !v).length} 問正解すると宝箱のロックが解除されます`}
                                </p>
                            </div>

                            <div className="flex justify-center gap-2.5">
                                {padCode.map((digit, i) => {
                                    const isVisible = unlockedDigits[i];
                                    return (
                                        <div
                                            key={i}
                                            className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold shadow-inner ${isVisible
                                                ? "bg-[#fdfbf7] border-amber-700 text-amber-950"
                                                : "bg-[#e2d9c5] border-[#c2b49a] text-[#8c7a66]"
                                                }`}
                                        >
                                            {isVisible ? digit : "?"}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleUnlockChest}
                                    disabled={!unlockedDigits.every(Boolean)}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-amber-800 text-white disabled:bg-[#cfc4b0] disabled:text-[#7d7060] shadow-sm"
                                >
                                    {chestOpened ? "ESP32解錠送信済み（30cmセンサー有効）" : "南京錠を開ける"}
                                </button>
                                {chestOpened && (
                                    <button
                                        onClick={() => {
                                            setChestOpened(false);
                                            setChestUnlocked("anywhere", false);
                                        }}
                                        className="px-3 py-2.5 rounded-xl font-bold text-xs bg-white border border-[#cbbba0] text-[#5c4d3c]"
                                        title="宝箱を再ロックする"
                                    >
                                        再施錠
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* 現在地・宝箱位置に基づくクイズ出題セクション */}
                        <section className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-4 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-[#2e251d]">
                                    現在地＆宝箱周辺のリアル問題を作成
                                </h3>
                                <span className="text-[11px] text-amber-800 font-bold">
                                    過去 {quizzes.length} 問記録済
                                </span>
                            </div>

                            {/* ジャンル選択ピル */}
                            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                {[
                                    { id: "auto", label: "おまかせ（周辺全般）", icon: Sparkles },
                                    { id: "spot", label: "周辺の施設・大学・公園", icon: MapPin },
                                    { id: "gourmet", label: "近くの店・おすすめ名物", icon: Utensils },
                                    { id: "history", label: "地域の歴史・豆知識", icon: Landmark },
                                ].map((cat) => {
                                    const Icon = cat.icon;
                                    const active = quizCategory === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setQuizCategory(cat.id)}
                                            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border font-bold text-left transition ${active
                                                ? "bg-amber-800 text-white border-amber-800"
                                                : "bg-[#f6f1e6] text-[#4a3f35] border-[#dfd5c0]"
                                                }`}
                                        >
                                            <Icon className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate">{cat.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {genError && (
                                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                                    {genError}
                                </p>
                            )}

                            <button
                                onClick={handleGenerateQuiz}
                                disabled={isGenerating}
                                className="w-full py-3 rounded-xl font-bold text-xs bg-[#3d332a] text-[#fdfbf7] hover:bg-[#2e251d] flex items-center justify-center gap-2 shadow-sm"
                            >
                                <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                                <span>
                                    {isGenerating
                                        ? "現在地周辺のスポット・店舗を検索して出題中..."
                                        : "この場所に関する新しい問題を出題する"}
                                </span>
                            </button>
                        </section>
                    </div>
                )}

                {/* ② マップ画面 */}
                {activeTab === "map" && (
                    <div className="space-y-3">
                        <div className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-3 flex items-center justify-between text-xs">
                            <div className="pr-2">
                                <span className="font-bold text-[#2e251d]">探索レーダー地図</span>
                                <p className="text-[11px] text-[#756554] truncate max-w-[210px]">
                                    現在地: {playerAddress}
                                </p>
                            </div>
                            <button
                                onClick={handleGenerateQuiz}
                                disabled={isGenerating}
                                className="bg-amber-800 text-white px-3 py-2 rounded-xl font-bold text-xs shrink-0"
                            >
                                {isGenerating ? "作成中..." : "この場所の問題"}
                            </button>
                        </div>

                        <TreasureGoogleMap
                            apiKey={mapsKey}
                            chestCoords={effectiveChestCoords}
                            fuzzyOffset={{ lat: -0.0005, lng: 0.0006 }}
                            distanceM={distanceM}
                            playerCoords={playerCoords}
                            isGpsLive={isChestGpsLive}
                            onManualPlayerMove={handleManualPlayerMove}
                        />
                    </div>
                )}

                {/* ③ 手がかり問題帳画面 */}
                {activeTab === "quiz" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-[#2e251d]">
                                手がかり問題帳（自動保存・全{quizzes.length}問）
                            </h2>
                            <button
                                onClick={handleGenerateQuiz}
                                disabled={isGenerating}
                                className="text-xs bg-amber-800 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                                <span>{isGenerating ? "検索中..." : "新しい問題を追加"}</span>
                            </button>
                        </div>

                        {quizzes.length === 0 ? (
                            <div className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-6 text-center space-y-3">
                                <BookOpen className="w-8 h-8 text-amber-800 mx-auto" />
                                <p className="text-sm font-bold text-[#2e251d]">まだ問題がありません</p>
                                <p className="text-xs text-[#6e5f4f]">
                                    下のボタンを押すと、あなたの現在地（{playerAddress}）と宝箱周辺の実在スポット・お店・歴史から問題が出題されます。
                                </p>
                                <button
                                    onClick={handleGenerateQuiz}
                                    disabled={isGenerating}
                                    className="px-4 py-2.5 rounded-xl font-bold text-xs bg-amber-800 text-white"
                                >
                                    {isGenerating ? "現在地周辺を検索中..." : "最初の問題を作成する"}
                                </button>
                            </div>
                        ) : (
                            quizzes.map((q, qIdx) => (
                                <article
                                    key={q.id || qIdx}
                                    className="bg-[#fdfbf7] border border-[#d8cbb8] rounded-2xl p-4 space-y-3 shadow-sm"
                                >
                                    <div className="flex items-center justify-between text-[11px] text-[#756554]">
                                        <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md">
                                            {q.phaseName}（残り{q.distanceAtGen}m）
                                        </span>
                                        <span className="truncate max-w-[160px] font-bold">{q.targetArea}</span>
                                    </div>

                                    <p className="text-sm font-bold leading-relaxed text-[#2e251d]">{q.question}</p>

                                    <div className="space-y-2">
                                        {(q.choices || []).map((choice, cIdx) => {
                                            const labels = ["A", "B", "C", "D"];
                                            const isSelected = q.selectedChoice === cIdx;
                                            const isCorrect = cIdx === q.answerIndex;
                                            let btnStyle = "bg-white border-[#d8cbb8] text-[#3d332a]";
                                            if (q.selectedChoice !== null) {
                                                if (isCorrect)
                                                    btnStyle = "bg-emerald-50 border-emerald-600 text-emerald-950 font-bold";
                                                else if (isSelected)
                                                    btnStyle = "bg-red-50 border-red-400 text-red-900";
                                            }
                                            return (
                                                <button
                                                    key={cIdx}
                                                    onClick={() => handleAnswer(qIdx, cIdx)}
                                                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs flex items-center gap-2 transition ${btnStyle}`}
                                                >
                                                    <span className="w-5 h-5 rounded-full bg-[#efe8d8] text-[#4a3f35] font-bold flex items-center justify-center text-[11px]">
                                                        {labels[cIdx]}
                                                    </span>
                                                    <span className="flex-1">{choice}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* 3段階ヒント */}
                                    <div className="pt-2 border-t border-[#ece4d4] space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-[#5c4d3c]">
                                                ヒント（{q.unlockedHintLevel || 0} / 3）
                                            </span>
                                            {(q.unlockedHintLevel || 0) < 3 && (
                                                <button
                                                    onClick={() => handleRevealHint(qIdx)}
                                                    className="text-xs text-amber-800 font-bold hover:underline"
                                                >
                                                    ＋ 次のヒントを見る
                                                </button>
                                            )}
                                        </div>

                                        {(q.hints || []).slice(0, q.unlockedHintLevel || 0).map((h, hIdx) => (
                                            <div
                                                key={hIdx}
                                                className="bg-[#f6f1e6] border border-[#dfd5c0] rounded-xl px-3 py-2 text-xs text-[#4a3f35]"
                                            >
                                                <span className="font-bold text-amber-900">ヒント{hIdx + 1}：</span>
                                                {h}
                                            </div>
                                        ))}
                                    </div>

                                    {q.selectedChoice !== null && (
                                        <div className="bg-[#efe8d8]/60 rounded-xl p-3 text-xs space-y-1.5 border border-[#d8cbb8]">
                                            <p className="font-bold text-[#2e251d]">
                                                {q.selectedChoice === q.answerIndex
                                                    ? "◎ 正解！南京錠の番号が1つアンロックされました"
                                                    : "× 惜しい！別の選択肢も試してみよう"}
                                            </p>
                                            <p className="text-[#4a3f35] leading-relaxed">{q.explanation}</p>
                                            {q.sources && q.sources.length > 0 && (
                                                <div className="text-[10px] text-[#756554] pt-1">
                                                    参考・出典: {q.sources.join(" / ")}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </article>
                            ))
                        )}
                    </div>
                )}
            </main>

            {/* 下部ナビゲーションバー */}
            <nav className="fixed bottom-0 inset-x-0 bg-[#efe8d8] border-t border-[#d8cbb8] px-6 py-2 flex justify-around max-w-md mx-auto z-20">
                <button
                    onClick={() => setActiveTab("home")}
                    className={`flex flex-col items-center gap-0.5 text-xs font-bold ${activeTab === "home" ? "text-amber-900" : "text-[#8c7a66]"
                        }`}
                >
                    <Key className="w-5 h-5" />
                    <span>木箱・記録</span>
                </button>
                <button
                    onClick={() => setActiveTab("map")}
                    className={`flex flex-col items-center gap-0.5 text-xs font-bold ${activeTab === "map" ? "text-amber-900" : "text-[#8c7a66]"
                        }`}
                >
                    <Map className="w-5 h-5" />
                    <span>周辺マップ</span>
                </button>
                <button
                    onClick={() => setActiveTab("quiz")}
                    className={`flex flex-col items-center gap-0.5 text-xs font-bold ${activeTab === "quiz" ? "text-amber-900" : "text-[#8c7a66]"
                        }`}
                >
                    <BookOpen className="w-5 h-5" />
                    <span>手がかり帳</span>
                </button>
            </nav>
        </div>
    );
}