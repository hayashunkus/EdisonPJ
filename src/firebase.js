// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
//import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Firebaseの設定が入っているか判定
export const isFirebaseConfigured = Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId
);

let app = null;
let db = null;
//let aiModel = null;

if (isFirebaseConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        if (firebaseConfig.databaseURL) {
            db = getDatabase(app);
        }
    } catch (e) {
        console.warn("Firebase初期化エラー:", e);
    }
}

/**
 * Gemini 2.5 Flash を直接REST APIで呼び出し（App Check不要）
 * APIキーは .env.local の VITE_GEMINI_API_KEY または 引数/localStorage から取得
 */
export async function generateQuizViaFirebase(promptText, overrideApiKey = "") {
    const apiKey =
        overrideApiKey ||
        import.meta.env.VITE_GEMINI_API_KEY ||
        localStorage.getItem("edison_gemini_key") ||
        "";

    if (!apiKey) {
        throw new Error("Gemini APIキーが未設定です。右上の歯車アイコンから入力してください。");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            temperature: 0.4,
        },
        // Colabと同じGoogle検索グラウンディング
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
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    return text;
}

/**
 * ESP32（宝箱）からのGPSリアルタイム購読（Realtime Database）
 */
export function subscribeChestGps(areaId, callback) {
    if (!db) return () => { };
    const chestRef = ref(db, `chests/${areaId}`);
    return onValue(chestRef, (snapshot) => {
        const data = snapshot.val();
        if (data && typeof data.lat === "number" && typeof data.lng === "number") {
            callback(data);
        }
    });
}

/**
 * Firebase経由でGemini 2.5 Flashを呼び出してクイズを生成

export async function generateQuizViaFirebase(promptText) {
    if (!aiModel) {
        throw new Error("Firebase AI Logicが初期化されていません。.env.localの設定を確認してください。");
    }
    const result = await aiModel.generateContent(promptText);
    return result.response.text();
}

/* 
 * ESP32（宝箱）からFirebase Realtime Databaseに送られるGPS座標をリアルタイム購読
 * パス例: /chests/nagoyacastle -> { lat: 35.185, lng: 136.8996, updatedAt: 1730000000 }
export function subscribeChestGps(areaId, callback) {
    if (!db) return () => { };
    const chestRef = ref(db, `chests/${areaId}`);
    return onValue(chestRef, (snapshot) => {
        const data = snapshot.val();
        if (data && typeof data.lat === "number" && typeof data.lng === "number") {
            callback(data);
        }
    });
}
*/