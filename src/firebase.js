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
 * Gemini 2.5 Flash を直接REST APIで呼び出し
 */
export async function generateQuizViaFirebase(promptText, overrideApiKey = "") {
    const apiKey =
        overrideApiKey ||
        import.meta.env.VITE_GEMINI_API_KEY ||
        localStorage.getItem("edison_gemini_key") ||
        "";

    if (!apiKey) {
        throw new Error(
            "Gemini APIキーが未設定です。右上の歯車アイコンから入力してください。"
        );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            temperature: 0.4,
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
        throw new Error(`Gemini APIエラー (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return (
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
    );
}

/**
 * ESP32（宝箱）からのGPSリアルタイム購読
 * 選択エリアだけでなく `chests/anywhere` も監視します
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

    // RESTフォールバック
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
        } catch (e) {
            // リトライ
        }
    }, 3000);

    return () => clearInterval(timer);
}

/**
 * Web側で南京錠を開けた際にESP32へ解錠を通知する
 */
export async function setChestUnlocked(areaId, isUnlocked = true) {
    const targetId = areaId || "anywhere";
    const payload = { unlocked: isUnlocked };

    if (db) {
        try {
            await update(ref(db, `chests/${targetId}`), payload);
            return true;
        } catch (e) {
            console.warn("Firebase SDK 解錠書き込みエラー:", e);
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
        console.warn("REST 解錠書き込みエラー:", e);
        return false;
    }
}