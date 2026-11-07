import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, update } from "firebase/database";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL:
        import.meta.env.VITE_FIREBASE_DATABASE_URL ||
        "https://edisonpj-e2c2d-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "edisonpj-e2c2d",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
    firebaseConfig.databaseURL || (firebaseConfig.apiKey && firebaseConfig.projectId)
);

let app = null;
let db = null;

try {
    app = initializeApp(firebaseConfig);
    if (firebaseConfig.databaseURL) {
        db = getDatabase(app);
    }
} catch (e) {
    console.warn("Firebase初期化エラー:", e);
}

/**
 * 緯度・経度から実際の住所・周辺エリア名を取得する（逆ジオコーディング）
 * これにより「名古屋工業大学（昭和区御器所町）」などの正確な現在地をGeminiに渡せます
 */
export async function reverseGeocodeLocation(lat, lng) {
    // 1. Google Maps JS SDKがロード済みならGeocoderを使用
    if (typeof window !== "undefined" && window.google && window.google.maps) {
        try {
            const geocoder = new window.google.maps.Geocoder();
            const response = await geocoder.geocode({ location: { lat, lng }, language: "ja" });
            if (response.results && response.results.length > 0) {
                const formatted = response.results[0].formatted_address.replace(/^日本、〒\d{3}-\d{4}\s*/, "");
                return formatted;
            }
        } catch (e) {
            // フォールバックへ進む
        }
    }

    // 2. オープンな逆ジオコーディングAPI（Nominatim）で町名・施設名を取得
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&accept-language=ja`
        );
        if (res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
                return data.display_name;
            }
        }
    } catch (e) {
        // 取得失敗時は座標文字列を返す
    }

    return `北緯${lat.toFixed(5)}度, 東経${lng.toFixed(5)}度 周辺`;
}

/**
 * Gemini API 呼び出し（多重接続でも干渉しない独立リクエスト・Google検索グラウンディング付き）
 * ※APIキーは環境変数 VITE_GEMINI_API_KEY のみを使用し、画面には一切表示しません
 */
export async function generateQuizViaFirebase(promptText) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

    if (!apiKey) {
        throw new Error("環境変数 VITE_GEMINI_API_KEY が設定されていません。");
    }

    // 最新の gemini-3.8-flash に Google検索グラウンディングとシステム指示を付与
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const body = {
        systemInstruction: {
            parts: [
                {
                    text: `あなたは位置情報連動フィールドワークゲーム「EdisonPJ」の専属出題AIです。
必ずGoogle検索ツールを使って、指定された「プレイヤーの現在地座標」と「宝箱の座標」の周辺（半径50m〜1km圏内）に実在する大学、公園、歴史スポット、商店街、または周辺で評判の飲食店・カフェのおすすめメニューや名物を調べて出題してください。
名古屋城が近くにない場合（例：昭和区や名古屋工業大学周辺など）に名古屋城の問題を出すことは固く禁じます。
名古屋市内の観光・歴史・グルメについては公式観光情報「名古屋コンシェルジュ (https://www.nagoya-info.jp/)」の情報も積極的に参考にしてください。`
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
        const errText = await res.text();
        throw new Error(`クイズ生成通信エラー (${res.status}): しばらく待ってから再度お試しください。`);
    }

    const data = await res.json();
    const text =
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    // 検索グラウンディングの出典URLを抽出
    const groundingChunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const groundingUrls = groundingChunks
        .map((c) => c.web?.title || c.web?.uri)
        .filter(Boolean);

    return { text, groundingUrls };
}

/**
 * ESP32（宝箱）からのGPSリアルタイム購読
 */
export function subscribeChestGps(areaId, callback) {
    const targetId = areaId || "anywhere";

    if (db) {
        const chestRef = ref(db, `chests/${targetId}`);
        return onValue(chestRef, (snapshot) => {
            const data = snapshot.val();
            if (data && typeof data.lat === "number" && typeof data.lng === "number") {
                callback(data);
            }
        });
    }

    const baseUrl = firebaseConfig.databaseURL.replace(/\/$/, "");
    const timer = setInterval(async () => {
        try {
            const res = await fetch(`${baseUrl}/chests/${targetId}.json`);
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data.lat === "number" && typeof data.lng === "number") {
                    callback(data);
                }
            }
        } catch (e) { }
    }, 3000);

    return () => clearInterval(timer);
}

/**
 * Web側で南京錠を開けた際（またはリセット時）にESP32へ解錠フラグを送信
 */
export async function setChestUnlocked(areaId, isUnlocked = true) {
    const targetId = areaId || "anywhere";
    const payload = { unlocked: isUnlocked, unlockedAt: Date.now() };

    if (db) {
        try {
            await update(ref(db, `chests/${targetId}`), payload);
            return true;
        } catch (e) {
            console.warn("Firebase SDK 書き込みエラー:", e);
        }
    }

    const baseUrl = firebaseConfig.databaseURL.replace(/\/$/, "");
    try {
        await fetch(`${baseUrl}/chests/${targetId}.json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return true;
    } catch (e) {
        return false;
    }
}