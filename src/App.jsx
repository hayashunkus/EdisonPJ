import React, { useState } from 'react';
import {
    MapPin, Compass, Lock, Unlock,
    CheckCircle2, XCircle, ChevronRight, RefreshCw,
    Radio, Award, Settings, BookOpen, Navigation, Footprints, KeyRound
} from 'lucide-react';

// 愛知県（名古屋・尾張エリア）のプリセット宝箱スポット
const PRESET_LOCATIONS = [
    {
        id: 'tsurumai',
        name: '鶴舞公園（名古屋市昭和区）',
        area: '名古屋市昭和区',
        lat: 35.1556,
        lng: 136.9206,
        landmarks: ['噴水塔', '奏楽堂', '名古屋工業大学', '公会堂'],
        pinCode: '1909', // 鶴舞公園開園年
        defaultTitle: '鶴舞に眠る明治の設計図と古びた木箱',
        defaultStory: '明治42年に開園した鶴舞公園。かつてこの地を訪れた技術者が、ある記録を収めた小箱を公園のどこかに残したという。微弱な電波の波紋をたどり、周辺の歴史や風景から4桁の南京錠の番号を解き明かしてほしい。'
    },
    {
        id: 'nagoyacastle',
        name: '名古屋城周辺（名古屋市中区）',
        area: '名古屋市中区・名城エリア',
        lat: 35.1850,
        lng: 136.8997,
        landmarks: ['金のシャチホコ', '本丸御殿', '金シャチ横丁', '名城公園'],
        pinCode: '1610', // 名古屋城築城開始年
        defaultTitle: '尾張徳川の隠し蔵と金鯱の暗号',
        defaultStory: '慶長15年（1610年）より築城が始まった名古屋城。城下を見守る石垣の近くに、当時の棟梁が仕掛けた4桁の錠前付き宝箱が眠っている。城郭の周囲を歩き、手がかりを集めて開錠しよう。'
    },
    {
        id: 'inuyama',
        name: '犬山城下町（尾張・犬山市）',
        area: '愛知県犬山市（尾張エリア）',
        lat: 35.3883,
        lng: 136.9392,
        landmarks: ['国宝犬山城', '三光稲荷神社', '木曽川', '本町通り'],
        pinCode: '1537', // 犬山城創建年説
        defaultTitle: '木曽川のほとりに響く城下町の記憶',
        defaultStory: '現存最古の天守を誇る犬山城と、古い町並みが残る本町通り。商人たちが代々受け継いできた「秘密の箱」の反応が、このエリアから検知された。街を散策しながら4つの数字を見つけ出そう。'
    },
    {
        id: 'osu',
        name: '大須観音・商店街（名古屋市中区）',
        area: '名古屋市中区・大須エリア',
        lat: 35.1594,
        lng: 136.9001,
        landmarks: ['大須観音', '招き猫広場', '万松寺', '仁王門通'],
        pinCode: '1612',
        defaultTitle: '門前町の路地裏とからくり職人の箱',
        defaultStory: '江戸時代から賑わう大須の門前町。歴史ある寺社と商店街が交差するこの街のどこかに、からくり職人が仕立てた宝箱が隠されている。通りを歩いて目印を探し、錠前を外そう。'
    }
];

// 距離フェーズ定義（落ち着いたアースカラー・フィールドワーク調）
const getDistancePhase = (distance) => {
    if (distance > 500) {
        return {
            id: 'far',
            label: '広域エリア調査',
            rangeText: '500m超',
            interval: 300,
            badgeStyle: 'bg-slate-200 text-slate-800 border-slate-300',
            accentColor: '#3b82f6',
            rippleRadius: Math.max(250, Math.min(800, Math.round(distance * 0.12))),
            theme: '地域の歴史・大学・広域の名所',
            description: 'まだ距離があります。移動しながらこの地域の歴史や名所に関する手がかりを集めましょう。'
        };
    } else if (distance > 150) {
        return {
            id: 'mid',
            label: '周辺エリア調査',
            rangeText: '150m〜500m',
            interval: 150,
            badgeStyle: 'bg-emerald-100 text-emerald-900 border-emerald-300',
            accentColor: '#059669',
            rippleRadius: 120,
            theme: '周辺の公園・建物・飲食店・地域の特徴',
            description: '宝箱のあるエリアに近づいてきました。周辺の建物や特徴に目を向けてみましょう。'
        };
    } else if (distance > 30) {
        return {
            id: 'near',
            label: '近隣スポット観察',
            rangeText: '30m〜150m',
            interval: 50,
            badgeStyle: 'bg-amber-100 text-amber-900 border-amber-300',
            accentColor: '#d97706',
            rippleRadius: 45,
            theme: '近隣の施設や目印・現地観察型の問題',
            description: 'かなり近くまで来ています。実際の風景や案内板・目印を観察しながら進みましょう。'
        };
    } else {
        return {
            id: 'final',
            label: '最終探索エリア',
            rangeText: '30m以下（最大3問）',
            interval: 10,
            badgeStyle: 'bg-rose-100 text-rose-900 border-rose-300',
            accentColor: '#e11d48',
            rippleRadius: 15,
            theme: '最後の手がかり・周囲の観察・宝箱の発見',
            description: '宝箱はすぐ近くにあります！周囲を注意深く観察し、最後の謎を解いて南京錠を開けましょう。'
        };
    }
};

// フォールバック用のモック問題データ
const FALLBACK_QUIZZES = {
    far: {
        question: '名古屋市昭和区にある「鶴舞公園」のすぐ東側に隣接し、明治時代から多くの技術者を輩出してきた国立の工業大学はどこでしょう？',
        options: ['名古屋工業大学', '愛知工業大学', '豊田工業大学', '中部大学'],
        correctIndex: 0,
        explanation: '名古屋工業大学（名工大）は鶴舞公園に隣接しており、古くから地域のものづくりを支えています。'
    },
    mid: {
        question: '鶴舞公園の正面付近にあり、明治43年（1910年）に建てられた大理石の円柱が並ぶローマ風のシンボル的建造物は何でしょう？',
        options: ['噴水塔', '時計台', '展望タワー', '凱旋門'],
        correctIndex: 0,
        explanation: '建築家・鈴木禎次が設計した「噴水塔」は名古屋市指定文化財であり、公園の象徴として親しまれています。'
    },
    near: {
        question: '【現地観察】噴水塔の奥へ進むと見えてくる、丸い赤い屋根と美しいアーチが特徴的なステージ施設の名前は「〇〇堂」？',
        options: ['奏楽堂（そうがくどう）', '音楽堂（おんがくどう）', '合唱堂（がっしょうどう）', '交響堂（こうきょうどう）'],
        correctIndex: 0,
        explanation: 'ルネサンス風の「奏楽堂」は、開園当初から音楽演奏の場として親しまれてきた歴史的建築です。'
    },
    final: {
        question: '【最終探索】奏楽堂周辺の案内板や石碑を確認してください。鶴舞公園が名古屋市最初の公園として開園したのは「190〇年」？',
        options: ['9（明治42年）', '5（明治38年）', '2（明治35年）', '8（明治41年）'],
        correctIndex: 0,
        explanation: '鶴舞公園は1909年（明治42年）11月19日に開園しました。これで4桁の番号が揃いました！'
    }
};

export default function App() {
    // アプリ全体のフロー状態: 'onboarding' | 'gps_sync' | 'main'
    const [appState, setAppState] = useState('onboarding');
    // メイン画面のタブ: 'home' | 'map' | 'quests'
    const [activeTab, setActiveTab] = useState('home');

    // 選択されたターゲット場所
    const [selectedLocation, setSelectedLocation] = useState(PRESET_LOCATIONS[0]);

    // 距離と移動シミュレーション状態
    const [distance, setDistance] = useState(850); // 初期850m
    const [walkedSinceLastQuiz, setWalkedSinceLastQuiz] = useState(0);
    const [finalQuizCount, setFinalQuizCount] = useState(0);
    const [showSimPanel, setShowSimPanel] = useState(false);

    // ミッションストーリー（裏で自動生成するがUI上は「調査概要」として自然に表示）
    const [missionStory, setMissionStory] = useState({
        title: PRESET_LOCATIONS[0].defaultTitle,
        story: PRESET_LOCATIONS[0].defaultStory,
        loading: false
    });

    // クイズ履歴＆ポップアップ状態
    const [quizzes, setQuizzes] = useState([]);
    const [activeQuizModal, setActiveQuizModal] = useState(null);
    const [selectedOption, setSelectedOption] = useState(null);
    const [quizAnswered, setQuizAnswered] = useState(false);
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

    // 宝箱・南京錠の開錠状態
    const [unlockedDigits, setUnlockedDigits] = useState(['-', '-', '-', '-']);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [inputPin, setInputPin] = useState(['', '', '', '']);
    const [isBoxOpened, setIsBoxOpened] = useState(false);
    const [unlockError, setUnlockError] = useState('');

    // トースト通知
    const [toastMessage, setToastMessage] = useState(null);

    const currentPhase = getDistancePhase(distance);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3200);
    };

    // バックグラウンドAPI呼び出しヘルパー
    const callGeminiJSON = async (prompt, schema) => {
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        };

        const delays = [1000, 2000, 4000];
        for (let attempt = 0; attempt <= delays.length; attempt++) {
            try {
                const res = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return JSON.parse(text);
            } catch (e) {
                if (attempt === delays.length) throw e;
                await new Promise(r => setTimeout(r, delays[attempt]));
            }
        }
    };

    // 宝箱のGPS位置情報に基づいてストーリーを裏で自動設定
    const generateStoryForLocation = async (loc = selectedLocation) => {
        setMissionStory({
            title: loc.defaultTitle,
            story: loc.defaultStory,
            loading: true
        });
        try {
            const prompt = `あなたは愛知県（名古屋市および尾張地方）の街歩き・フィールドワーク型宝探しゲームのストーリー作家です。
宝箱の設置エリアは「${loc.name}（${loc.area}、周辺の名所：${loc.landmarks.join('、')}）」です。
AIっぽさや大げさなSF表現を避け、その土地の歴史や街並みに馴染む落ち着いた「調査記録・導入ストーリー（110文字程度）」と「タイトル」を作成してください。`;

            const schema = {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    story: { type: "STRING" }
                },
                propertyOrdering: ["title", "story"]
            };

            const res = await callGeminiJSON(prompt, schema);
            if (res && res.title && res.story) {
                setMissionStory({ title: res.title, story: res.story, loading: false });
            } else {
                setMissionStory(prev => ({ ...prev, loading: false }));
            }
        } catch (err) {
            setMissionStory(prev => ({ ...prev, loading: false }));
        }
    };

    // 距離フェーズに応じて問題を生成
    const triggerQuizGeneration = async (targetDist = distance) => {
        const phase = getDistancePhase(targetDist);

        if (phase.id === 'final' && finalQuizCount >= 3) {
            showToast('最終探索エリアの3つの手がかりはすべて出揃いました。宝箱を開錠しましょう！');
            return;
        }

        setIsGeneratingQuiz(true);
        setSelectedOption(null);
        setQuizAnswered(false);

        const nextDigitIndex = unlockedDigits.findIndex(d => d === '-');
        const targetPinDigit = nextDigitIndex !== -1
            ? selectedLocation.pinCode[nextDigitIndex]
            : selectedLocation.pinCode[3];

        try {
            const prompt = `愛知県（尾張・名古屋エリア）の街歩き宝探しゲームの問題を作成してください。
現在の対象エリア：「${selectedLocation.name}（${selectedLocation.area}）」、周辺の目印：「${selectedLocation.landmarks.join('、')}」
宝箱までの残り距離：「${targetDist}m」（${phase.label}）

以下の基準で、自然で人間が作ったような良質な4択問題を1問作成してください：
- テーマ：${phase.theme}
- 500m超：地域の歴史、大学（名古屋工業大学など）、名所など移動中に地域を知ってもらう問題
- 150〜500m：周辺の公園、建物、飲食店、地域の特徴など具体的な問題
- 30〜150m：近隣の施設や目印、現地で周囲を見ながら解ける観察型の問題
- 30m以下：最後の手がかり、周囲の観察、宝箱の発見に繋がる問題`;

            const schema = {
                type: "OBJECT",
                properties: {
                    question: { type: "STRING" },
                    options: { type: "ARRAY", items: { type: "STRING" } },
                    correctIndex: { type: "INTEGER" },
                    explanation: { type: "STRING" }
                },
                propertyOrdering: ["question", "options", "correctIndex", "explanation"]
            };

            const result = await callGeminiJSON(prompt, schema);
            const newQuiz = {
                id: Date.now(),
                phaseId: phase.id,
                phaseLabel: phase.label,
                distanceAtTrigger: targetDist,
                question: result.question,
                options: result.options.slice(0, 4),
                correctIndex: Math.min(3, Math.max(0, result.correctIndex)),
                explanation: result.explanation,
                clueDigitIndex: nextDigitIndex !== -1 ? nextDigitIndex : 3,
                clueDigit: targetPinDigit,
                solved: false
            };

            setQuizzes(prev => [newQuiz, ...prev]);
            setActiveQuizModal(newQuiz);
            if (phase.id === 'final') {
                setFinalQuizCount(prev => prev + 1);
            }
        } catch (error) {
            const fb = FALLBACK_QUIZZES[phase.id];
            const newQuiz = {
                id: Date.now(),
                phaseId: phase.id,
                phaseLabel: phase.label,
                distanceAtTrigger: targetDist,
                question: fb.question,
                options: fb.options,
                correctIndex: fb.correctIndex,
                explanation: fb.explanation,
                clueDigitIndex: nextDigitIndex !== -1 ? nextDigitIndex : 3,
                clueDigit: targetPinDigit,
                solved: false
            };
            setQuizzes(prev => [newQuiz, ...prev]);
            setActiveQuizModal(newQuiz);
            if (phase.id === 'final') {
                setFinalQuizCount(prev => prev + 1);
            }
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    // 歩行シミュレート
    const simulateWalk = (stepMeters) => {
        const newDist = Math.max(5, distance - stepMeters);
        const newWalked = walkedSinceLastQuiz + stepMeters;
        const phase = getDistancePhase(newDist);

        setDistance(newDist);

        if (newWalked >= phase.interval) {
            setWalkedSinceLastQuiz(0);
            triggerQuizGeneration(newDist);
        } else {
            setWalkedSinceLastQuiz(newWalked);
        }
    };

    // クイズ回答処理
    const handleSelectAnswer = (idx) => {
        if (quizAnswered) return;
        setSelectedOption(idx);
        setQuizAnswered(true);

        const isCorrect = idx === activeQuizModal.correctIndex;
        if (isCorrect) {
            const updatedDigits = [...unlockedDigits];
            updatedDigits[activeQuizModal.clueDigitIndex] = activeQuizModal.clueDigit;
            setUnlockedDigits(updatedDigits);

            const updatedPin = [...inputPin];
            updatedPin[activeQuizModal.clueDigitIndex] = activeQuizModal.clueDigit;
            setInputPin(updatedPin);

            setQuizzes(prev => prev.map(q => q.id === activeQuizModal.id ? { ...q, solved: true } : q));
        }
    };

    // ゲーム開始時のGPS同期フロー
    const startMissionFlow = () => {
        setAppState('gps_sync');
        generateStoryForLocation(selectedLocation);
        setTimeout(() => {
            setAppState('main');
        }, 1800);
    };

    // 南京錠の開錠チェック
    const handleUnlockAttempt = () => {
        const code = inputPin.join('');
        if (code === selectedLocation.pinCode) {
            setIsBoxOpened(true);
            setUnlockError('');
        } else {
            setUnlockError(`番号が一致しません（ヒント: 謎を解くか、宝箱の30m以内へ近づいてください）`);
        }
    };

    // ==========================================
    // 1. スタート（開始）画面：フィールドノート風
    // ==========================================
    if (appState === 'onboarding') {
        return (
            <div className="min-h-screen bg-[#F5F2EB] text-stone-800 flex flex-col justify-between p-6 max-w-md mx-auto border-x border-stone-300/80 select-none">
                <div className="pt-4">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-stone-200/80 border border-stone-300 text-stone-700 text-xs font-semibold mb-4">
                        <Compass className="w-3.5 h-3.5 text-amber-700" />
                        FIELD ARCHIVE / 尾張・名古屋 街歩き探索
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 font-serif">
                        Edison Project
                    </h1>
                    <p className="text-stone-600 text-sm mt-2 leading-relaxed">
                        街のどこかに置かれた「木箱」の微弱な位置信号を頼りに現地を歩き、その土地にまつわる謎を解いて4桁の南京錠を開けるフィールドワークです。
                    </p>
                </div>

                {/* エリア選択カード */}
                <div className="my-6 bg-white border border-stone-300 rounded-2xl p-5 shadow-sm">
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-3">
                        探索するエリアを選択
                    </label>
                    <div className="space-y-2.5">
                        {PRESET_LOCATIONS.map(loc => {
                            const isSelected = selectedLocation.id === loc.id;
                            return (
                                <button
                                    key={loc.id}
                                    onClick={() => {
                                        setSelectedLocation(loc);
                                        setUnlockedDigits(['-', '-', '-', '-']);
                                        setInputPin(['', '', '', '']);
                                        setIsBoxOpened(false);
                                    }}
                                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${isSelected
                                        ? 'bg-amber-50/90 border-amber-700 text-stone-900 shadow-sm'
                                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                                        }`}
                                >
                                    <div>
                                        <div className="font-bold text-sm">{loc.name}</div>
                                        <div className="text-xs text-stone-500 mt-0.5">
                                            目印: {loc.landmarks.slice(0, 3).join('・')}
                                        </div>
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-amber-700 bg-amber-700' : 'border-stone-400'
                                        }`}>
                                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="mt-4 pt-4 border-t border-stone-200 grid grid-cols-2 gap-2.5 text-xs text-stone-600">
                        <div className="bg-[#F9F7F2] p-2.5 rounded-lg border border-stone-200">
                            <span className="text-stone-900 font-bold block mb-0.5">📍 おおよその波紋表示</span>
                            ピンではなく、距離に応じた半円と波紋で気配を表示します
                        </div>
                        <div className="bg-[#F9F7F2] p-2.5 rounded-lg border border-stone-200">
                            <span className="text-stone-900 font-bold block mb-0.5">🔑 4桁の南京錠</span>
                            移動中に出題される地域の問題を解くと番号が判明します
                        </div>
                    </div>
                </div>

                <div className="pb-4">
                    <button
                        onClick={startMissionFlow}
                        className="w-full py-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-[#F5F2EB] font-bold text-sm shadow-md flex items-center justify-center gap-2 transition active:scale-99"
                    >
                        <Navigation className="w-4 h-4 text-amber-400" />
                        現在地を取得して探索をはじめる
                    </button>
                </div>
            </div>
        );
    }

    // ==========================================
    // 2. GPS取得中画面：落ち着いたコンパス表現
    // ==========================================
    if (appState === 'gps_sync') {
        return (
            <div className="min-h-screen bg-[#F5F2EB] text-stone-800 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto border-x border-stone-300/80">
                <div className="relative w-32 h-32 flex items-center justify-center mb-6">
                    <div className="absolute inset-0 rounded-full border-2 border-amber-700/30 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="absolute inset-4 rounded-full border border-stone-400/50" />
                    <div className="w-16 h-16 rounded-full bg-white border border-stone-300 flex items-center justify-center shadow-sm">
                        <Compass className="w-8 h-8 text-amber-700 animate-spin" style={{ animationDuration: '4s' }} />
                    </div>
                </div>

                <h2 className="text-lg font-bold text-stone-900 mb-1 font-serif">現在地と宝箱の距離を測っています...</h2>
                <p className="text-xs text-stone-600 max-w-xs mb-6 leading-relaxed">
                    「{selectedLocation.name}」に設置された宝箱のGPS信号を受信しています
                </p>

                <div className="w-full max-w-xs bg-white border border-stone-300 rounded-xl p-4 text-left space-y-2 text-xs shadow-sm">
                    <div className="flex items-center justify-between text-emerald-800 font-medium">
                        <span>・スマートフォンの現在地</span>
                        <span className="font-mono">取得完了</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-800 font-medium">
                        <span>・宝箱からのGPS信号</span>
                        <span className="font-mono">受信中</span>
                    </div>
                    <div className="flex items-center justify-between text-amber-800 font-medium">
                        <span>・周辺エリアの手がかり準備</span>
                        <span className="font-mono">完了</span>
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================
    // 3. メイン画面（ホーム / マップ / 手がかり帳）
    // ==========================================
    return (
        <div className="min-h-screen bg-[#F5F2EB] text-stone-800 flex flex-col max-w-md mx-auto border-x border-stone-300 relative shadow-lg">

            {/* トースト通知 */}
            {toastMessage && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-stone-900 text-stone-100 px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg flex items-center gap-2 max-w-xs">
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* 上部ヘッダー（現在距離とステータス） */}
            <header className="sticky top-0 z-30 bg-[#F5F2EB]/95 backdrop-blur-sm border-b border-stone-300 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-600" />
                            <span className="text-xs font-bold text-stone-900">{selectedLocation.name}</span>
                        </div>
                        <div className="text-[11px] text-stone-600 mt-0.5 flex items-center gap-1">
                            <Footprints className="w-3 h-3 text-stone-500" />
                            次の手がかり出現まで あと <strong className="text-amber-800">{Math.max(0, currentPhase.interval - walkedSinceLastQuiz)}m</strong>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="px-3 py-1 rounded-lg bg-white border border-stone-300 text-xs font-bold text-stone-900 shadow-sm">
                            残り約 {distance}m
                        </div>
                        <button
                            onClick={() => setShowSimPanel(!showSimPanel)}
                            title="歩行テスト用パネル"
                            className={`p-1.5 rounded-lg border text-xs transition ${showSimPanel ? 'bg-stone-800 border-stone-800 text-white' : 'bg-white border-stone-300 text-stone-600'
                                }`}
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* テスト用の歩行操作バー（設定アイコンを押したときのみ表示、または折りたたみ） */}
                {showSimPanel && (
                    <div className="mt-3 pt-2.5 border-t border-stone-300 bg-stone-200/70 rounded-xl p-3 text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-stone-700">テスト用：距離・移動シミュレーター</span>
                            <span className="text-[11px] text-stone-600">{currentPhase.label}</span>
                        </div>
                        <input
                            type="range"
                            min="5"
                            max="2000"
                            step="5"
                            value={distance}
                            onChange={(e) => {
                                setDistance(Number(e.target.value));
                                setWalkedSinceLastQuiz(0);
                            }}
                            className="w-full accent-amber-700 cursor-pointer h-1.5 bg-stone-300 rounded-lg"
                        />
                        <div className="flex items-center justify-between gap-2 mt-2">
                            <button
                                onClick={() => simulateWalk(currentPhase.interval)}
                                className="flex-1 py-1.5 px-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 rounded-lg font-semibold transition shadow-sm"
                            >
                                {currentPhase.interval}m歩いたことにする（問題出現）
                            </button>
                            <button
                                onClick={() => {
                                    setDistance(20);
                                    setWalkedSinceLastQuiz(0);
                                    showToast('宝箱の半径20m以内に入りました');
                                }}
                                className="py-1.5 px-2.5 bg-amber-800 text-white rounded-lg font-semibold transition"
                            >
                                残り20mへ移動
                            </button>
                        </div>
                    </div>
                )}
            </header>

            {/* メインコンテンツ領域 */}
            <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4 space-y-4">

                {/* ==========================================
            TAB 1: ホーム・ミッション画面
        ========================================== */}
                {activeTab === 'home' && (
                    <>
                        {/* 調査ミッション概要（ストーリー） */}
                        <div className="rounded-2xl bg-white border border-stone-300 p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
                                    <BookOpen className="w-3.5 h-3.5" />
                                    調査記録・ストーリー
                                </span>
                                <button
                                    onClick={() => setAppState('onboarding')}
                                    className="text-[11px] text-stone-500 hover:text-stone-800 underline"
                                >
                                    エリア変更
                                </button>
                            </div>
                            <h2 className="text-base font-extrabold text-stone-900 font-serif mb-1.5">
                                {missionStory.title}
                            </h2>
                            <p className="text-xs text-stone-600 leading-relaxed">
                                {missionStory.story}
                            </p>
                        </div>

                        {/* 宝箱の様子＆南京錠カード */}
                        <div className="rounded-2xl bg-white border border-stone-300 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${currentPhase.badgeStyle}`}>
                                    {currentPhase.label}（{currentPhase.rangeText}）
                                </span>
                                <span className="text-xs text-stone-500 font-medium">
                                    状態：{isBoxOpened ? '開錠済み' : '施錠中'}
                                </span>
                            </div>

                            {/* 木箱・宝箱のクラフト風イラスト表現 */}
                            <div className="my-4 flex flex-col items-center justify-center">
                                <div className="relative w-36 h-28 flex items-center justify-center">
                                    {/* 木箱のSVGグラフィック */}
                                    <svg viewBox="0 0 160 120" className="w-full h-full drop-shadow-sm">
                                        {/* 箱の下部 */}
                                        <rect x="25" y="50" width="110" height="55" rx="6" fill="#78350f" stroke="#451a03" strokeWidth="3" />
                                        {/* 木目ライン */}
                                        <line x1="25" y1="68" x2="135" y2="68" stroke="#451a03" strokeWidth="2" />
                                        <line x1="25" y1="86" x2="135" y2="86" stroke="#451a03" strokeWidth="2" />
                                        {/* 真鍮の金具バンド */}
                                        <rect x="42" y="50" width="12" height="55" fill="#d97706" stroke="#451a03" strokeWidth="2" />
                                        <rect x="106" y="50" width="12" height="55" fill="#d97706" stroke="#451a03" strokeWidth="2" />

                                        {/* 箱のフタ（開いているか閉じているか） */}
                                        {isBoxOpened ? (
                                            <g transform="translate(0, -18)">
                                                <path d="M 22 50 Q 80 18 138 50 Z" fill="#92400e" stroke="#451a03" strokeWidth="3" />
                                                <rect x="20" y="45" width="120" height="8" rx="3" fill="#b45309" stroke="#451a03" strokeWidth="2" />
                                            </g>
                                        ) : (
                                            <g>
                                                <path d="M 22 50 Q 80 20 138 50 Z" fill="#92400e" stroke="#451a03" strokeWidth="3" />
                                                <rect x="20" y="46" width="120" height="8" rx="3" fill="#b45309" stroke="#451a03" strokeWidth="2" />
                                            </g>
                                        )}

                                        {/* 中央の南京錠 */}
                                        <g transform={isBoxOpened ? "translate(80, 62) rotate(25)" : "translate(80, 62)"}>
                                            {/* 南京錠のツル */}
                                            <path
                                                d={isBoxOpened ? "M -8 -6 V -18 A 8 8 0 0 1 8 -18 V -12" : "M -8 -6 V -15 A 8 8 0 0 1 8 -15 V -6"}
                                                fill="none"
                                                stroke="#e2e8f0"
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                            />
                                            {/* 南京錠のボディ */}
                                            <rect x="-14" y="-6" width="28" height="24" rx="4" fill="#f59e0b" stroke="#451a03" strokeWidth="2.5" />
                                            <circle cx="0" cy="4" r="2.5" fill="#451a03" />
                                            <path d="M -1.5 4 L -2.5 11 L 2.5 11 L 1.5 4 Z" fill="#451a03" />
                                        </g>
                                    </svg>
                                </div>

                                {/* 南京錠の4桁ダイヤル控え */}
                                <div className="mt-2 text-center w-full">
                                    <div className="text-xs text-stone-500 mb-2 flex items-center justify-center gap-1">
                                        <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                                        <span>判明している南京錠の番号（問題を解くと埋まります）</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-2.5">
                                        {unlockedDigits.map((digit, i) => (
                                            <div
                                                key={i}
                                                className={`w-11 h-12 rounded-xl border-2 flex items-center justify-center text-lg font-black font-mono ${digit !== '-'
                                                    ? 'bg-amber-50 border-amber-700 text-stone-900 shadow-sm'
                                                    : 'bg-stone-100 border-stone-300 text-stone-400'
                                                    }`}
                                            >
                                                {digit}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 宝箱を開けるボタン */}
                            <div className="mt-5">
                                <button
                                    onClick={() => setShowUnlockModal(true)}
                                    className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-sm ${isBoxOpened
                                        ? 'bg-emerald-700 text-white'
                                        : distance <= 30
                                            ? 'bg-amber-700 hover:bg-amber-800 text-white'
                                            : 'bg-stone-900 hover:bg-stone-800 text-white'
                                        }`}
                                >
                                    {isBoxOpened ? (
                                        <>
                                            <Unlock className="w-4 h-4" />
                                            宝箱は開錠済みです（番号を確認する）
                                        </>
                                    ) : distance <= 30 ? (
                                        <>
                                            <Unlock className="w-4 h-4" />
                                            宝箱が近くにあります！南京錠を開ける
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="w-4 h-4" />
                                            南京錠の番号を入力して開ける
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* マップ・問題画面への遷移ボタン（ホームからの導線） */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setActiveTab('map')}
                                className="p-4 rounded-2xl bg-white hover:bg-stone-50 border border-stone-300 text-left transition shadow-sm"
                            >
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800 mb-2">
                                    <MapPin className="w-5 h-5" />
                                </div>
                                <div className="font-bold text-sm text-stone-900 flex items-center justify-between">
                                    周辺マップを見る
                                    <ChevronRight className="w-4 h-4 text-stone-400" />
                                </div>
                                <p className="text-[11px] text-stone-500 mt-1">
                                    半円と波紋で宝箱のおおよその範囲を確認
                                </p>
                            </button>

                            <button
                                onClick={() => setActiveTab('quests')}
                                className="p-4 rounded-2xl bg-white hover:bg-stone-50 border border-stone-300 text-left transition shadow-sm"
                            >
                                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 mb-2">
                                    <BookOpen className="w-5 h-5" />
                                </div>
                                <div className="font-bold text-sm text-stone-900 flex items-center justify-between">
                                    問題・手がかり帳
                                    <ChevronRight className="w-4 h-4 text-stone-400" />
                                </div>
                                <p className="text-[11px] text-stone-500 mt-1">
                                    現在地の問題に挑戦 / 解いた履歴（{quizzes.filter(q => q.solved).length}件）
                                </p>
                            </button>
                        </div>
                    </>
                )}

                {/* ==========================================
            TAB 2: マップ画面（明るい紙地図風＋半円と波紋）
        ========================================== */}
                {activeTab === 'map' && (
                    <div className="space-y-4">
                        <div className="bg-white border border-stone-300 rounded-2xl overflow-hidden shadow-sm">
                            {/* マップヘッダー */}
                            <div className="p-3.5 border-b border-stone-200 flex items-center justify-between">
                                <div>
                                    <h2 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
                                        <MapPin className="w-4 h-4 text-emerald-700" />
                                        周辺探索マップ（{selectedLocation.name}）
                                    </h2>
                                    <p className="text-[11px] text-stone-500 mt-0.5">
                                        ※宝箱の正確な場所はピンで示さず、おおよその半円と波紋で表示しています
                                    </p>
                                </div>
                                <span className="text-xs font-mono font-bold bg-stone-100 text-stone-700 border border-stone-300 px-2.5 py-1 rounded-lg shrink-0">
                                    半径 ~{currentPhase.rippleRadius}m
                                </span>
                            </div>

                            {/* 明るいGoogle Map風の地図キャンバス */}
                            <div className="relative h-80 bg-[#EAE6DF] overflow-hidden select-none">
                                <svg className="w-full h-full" viewBox="0 0 400 320">
                                    <defs>
                                        <radialGradient id="warmRipple" cx="50%" cy="50%" r="50%">
                                            <stop offset="0%" stopColor="#d97706" stopOpacity="0.32" />
                                            <stop offset="65%" stopColor="#d97706" stopOpacity="0.12" />
                                            <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
                                        </radialGradient>
                                    </defs>

                                    {/* ベース背景（明るい地図色） */}
                                    <rect width="400" height="320" fill="#EFECE6" />

                                    {/* 公園・緑地エリア */}
                                    <path d="M 165 25 Q 285 15 340 90 T 315 215 Q 215 235 160 155 Z" fill="#D5E6D0" />
                                    {/* 水辺・池 */}
                                    <ellipse cx="255" cy="105" rx="22" ry="14" fill="#B8D8E8" />

                                    {/* 街区・道路網 */}
                                    <g stroke="#FFFFFF" strokeWidth="8" fill="none">
                                        <path d="M 0 85 L 400 115" />
                                        <path d="M 0 245 L 400 205" />
                                        <path d="M 105 0 L 135 320" />
                                        <path d="M 275 0 L 245 320" />
                                    </g>
                                    <g stroke="#D6D1C7" strokeWidth="1.5" fill="none">
                                        <path d="M 0 85 L 400 115" />
                                        <path d="M 0 245 L 400 205" />
                                        <path d="M 105 0 L 135 320" />
                                        <path d="M 275 0 L 245 320" />
                                    </g>

                                    {/* 周辺ランドマーク表示 */}
                                    {selectedLocation.landmarks.map((lm, idx) => {
                                        const coords = [
                                            { x: 205, y: 72 },
                                            { x: 280, y: 128 },
                                            { x: 162, y: 158 },
                                            { x: 252, y: 185 }
                                        ][idx % 4];
                                        return (
                                            <g key={lm} transform={`translate(${coords.x}, ${coords.y})`}>
                                                <circle r="3.5" fill="#57534e" />
                                                <text x="7" y="3.5" fill="#44403c" fontSize="10" fontWeight="bold">{lm}</text>
                                            </g>
                                        );
                                    })}

                                    {/* スマホの現在地から見た「半円（扇形）のおおよその探索領域」 */}
                                    <path
                                        d="M 150 118 A 90 90 0 0 1 310 118 L 230 148 Z"
                                        fill="url(#warmRipple)"
                                        stroke="#b45309"
                                        strokeWidth="1.5"
                                        strokeDasharray="6 4"
                                    />

                                    {/* 中心を少しぼかした波紋エフェクト */}
                                    <g transform="translate(236, 115)">
                                        <circle r={Math.min(90, Math.max(26, distance / 12))} fill="url(#warmRipple)" />
                                        <circle
                                            r={Math.min(80, Math.max(22, distance / 14))}
                                            fill="none"
                                            stroke="#b45309"
                                            strokeWidth="1.5"
                                            strokeOpacity="0.55"
                                            className="animate-ping"
                                            style={{ animationDuration: '3.2s', transformOrigin: 'center' }}
                                        />
                                        <circle
                                            r={Math.min(50, Math.max(15, distance / 22))}
                                            fill="none"
                                            stroke="#92400e"
                                            strokeWidth="1.2"
                                            strokeDasharray="5 4"
                                        />
                                        <rect x="-58" y="-22" width="116" height="18" rx="4" fill="#FFFFFF" fillOpacity="0.88" stroke="#d6d3d1" />
                                        <text x="0" y="-10" textAnchor="middle" fill="#78350f" fontSize="9.5" fontWeight="bold">
                                            この周辺エリアから信号反応
                                        </text>
                                    </g>

                                    {/* 現在地と波紋エリアを結ぶ目安ライン */}
                                    <line
                                        x1="95"
                                        y1="265"
                                        x2="230"
                                        y2="130"
                                        stroke="#57534e"
                                        strokeWidth="1.5"
                                        strokeDasharray="4 4"
                                    />

                                    {/* スマホの現在地マーカー */}
                                    <g transform="translate(95, 265)">
                                        <circle r="13" fill="#2563eb" fillOpacity="0.18" />
                                        <circle r="6" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
                                        <rect x="-32" y="10" width="64" height="16" rx="4" fill="#ffffff" stroke="#d6d3d1" />
                                        <text x="0" y="21" textAnchor="middle" fill="#1e293b" fontSize="9" fontWeight="bold">
                                            現在地
                                        </text>
                                    </g>
                                </svg>

                                {/* マップ下部の操作カード */}
                                <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-sm border border-stone-300 rounded-xl p-3 flex items-center justify-between shadow-md">
                                    <div>
                                        <div className="text-xs font-bold text-stone-900">
                                            宝箱の反応エリアまで 約{distance}m
                                        </div>
                                        <div className="text-[11px] text-stone-500">
                                            {currentPhase.interval}m進むごとに周辺の手がかり問題が出現します
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => simulateWalk(currentPhase.interval)}
                                        className="px-3 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shrink-0 shadow-sm transition"
                                    >
                                        {currentPhase.interval}m進む
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 距離に応じた出題ルール表 */}
                        <div className="bg-white border border-stone-300 rounded-2xl p-4 space-y-2 shadow-sm">
                            <h3 className="text-xs font-bold text-stone-700">
                                距離に応じた出題ルール
                            </h3>
                            {[
                                { id: 'far', title: '遠距離（500m超）', freq: '300m移動ごとに1問', desc: '地域の歴史、名古屋工業大学、地域の名所など' },
                                { id: 'mid', title: '中距離（150〜500m）', freq: '150m移動ごとに1問', desc: '周辺の公園、建物、飲食店、地域の特徴' },
                                { id: 'near', title: '近距離（30〜150m）', freq: '50m移動ごとに1問', desc: '近隣の施設や目印、現地で周囲を見る観察型の問題' },
                                { id: 'final', title: '最終探索（30m以下）', freq: '10m移動ごと・最大3問', desc: '最後の手がかり、周囲の観察、宝箱の発見' }
                            ].map(rule => {
                                const isCurrent = currentPhase.id === rule.id;
                                return (
                                    <div
                                        key={rule.id}
                                        className={`p-3 rounded-xl border text-xs ${isCurrent
                                            ? 'bg-amber-50/80 border-amber-600 text-stone-900'
                                            : 'bg-stone-50 border-stone-200 text-stone-600'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between font-bold">
                                            <span>{isCurrent ? `● ${rule.title}（現在）` : rule.title}</span>
                                            <span className="text-[11px] text-stone-500">{rule.freq}</span>
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-stone-600">{rule.desc}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ==========================================
            TAB 3: 問題＆手がかり帳画面
        ========================================== */}
                {activeTab === 'quests' && (
                    <div className="space-y-4">
                        {/* 現在地の問題出題カード */}
                        <div className="bg-white border border-stone-300 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${currentPhase.badgeStyle}`}>
                                    現在：{currentPhase.label}（残り約{distance}m）
                                </span>
                                {currentPhase.id === 'final' && (
                                    <span className="text-xs text-rose-800 font-bold">
                                        最終探索：{finalQuizCount} / 3問
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-stone-600 mb-3 leading-relaxed">
                                {currentPhase.description}
                            </p>

                            <button
                                onClick={() => triggerQuizGeneration(distance)}
                                disabled={isGeneratingQuiz || (currentPhase.id === 'final' && finalQuizCount >= 3)}
                                className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                            >
                                <RefreshCw className={`w-4 h-4 ${isGeneratingQuiz ? 'animate-spin' : ''}`} />
                                {isGeneratingQuiz
                                    ? '現在地の問題を用意しています...'
                                    : currentPhase.id === 'final' && finalQuizCount >= 3
                                        ? '最終探索の3問はすべて出題済みです'
                                        : '現在地の距離に応じた問題に挑戦する'}
                            </button>
                        </div>

                        {/* これまでの問題履歴リスト */}
                        <div className="space-y-2.5">
                            <h3 className="text-xs font-bold text-stone-600 px-1">
                                これまでの問題と手がかり（{quizzes.length}件）
                            </h3>

                            {quizzes.length === 0 ? (
                                <div className="bg-white border border-stone-300 rounded-2xl p-8 text-center text-xs text-stone-500 leading-relaxed">
                                    まだ問題が出題されていません。<br />
                                    歩を進めるか、上のボタンを押すと現在地の距離に応じた問題が表示されます。
                                </div>
                            ) : (
                                quizzes.map((q) => (
                                    <div
                                        key={q.id}
                                        onClick={() => {
                                            setActiveQuizModal(q);
                                            setSelectedOption(q.solved ? q.correctIndex : null);
                                            setQuizAnswered(q.solved);
                                        }}
                                        className="p-4 rounded-2xl bg-white hover:bg-stone-50 border border-stone-300 cursor-pointer transition flex items-start justify-between gap-3 shadow-sm"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 border border-stone-300 text-stone-700">
                                                    {q.phaseLabel}（残り{q.distanceAtTrigger}m地点）
                                                </span>
                                                {q.solved ? (
                                                    <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> 解決済（番号: {q.clueDigit}）
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-amber-700 font-semibold">未回答</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-stone-800 font-medium line-clamp-2">{q.question}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0 mt-1" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* ==========================================
          距離連動・問題出題ポップアップモーダル
      ========================================== */}
            {activeQuizModal && (
                <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-[#FAF8F5] border border-stone-300 rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold">
                                    {activeQuizModal.phaseLabel}の問題
                                </span>
                                <span className="text-xs text-stone-500">残り {activeQuizModal.distanceAtTrigger}m地点</span>
                            </div>
                            <button
                                onClick={() => setActiveQuizModal(null)}
                                className="text-xs text-stone-500 hover:text-stone-800 font-medium px-2 py-1"
                            >
                                閉じる
                            </button>
                        </div>

                        <div className="text-sm font-bold text-stone-900 leading-relaxed">
                            問. {activeQuizModal.question}
                        </div>

                        <div className="space-y-2">
                            {activeQuizModal.options.map((opt, idx) => {
                                const isSelected = selectedOption === idx;
                                const isCorrect = idx === activeQuizModal.correctIndex;
                                let btnStyle = 'bg-white hover:bg-stone-100 border-stone-300 text-stone-800';
                                if (quizAnswered) {
                                    if (isCorrect) {
                                        btnStyle = 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold';
                                    } else if (isSelected) {
                                        btnStyle = 'bg-rose-50 border-rose-500 text-rose-900';
                                    }
                                }
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectAnswer(idx)}
                                        disabled={quizAnswered}
                                        className={`w-full text-left p-3.5 rounded-xl border text-xs transition flex items-center justify-between ${btnStyle}`}
                                    >
                                        <span>{idx + 1}. {opt}</span>
                                        {quizAnswered && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />}
                                        {quizAnswered && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                                    </button>
                                );
                            })}
                        </div>

                        {quizAnswered && (
                            <div className="p-3.5 rounded-xl bg-stone-100 border border-stone-300 space-y-2 text-xs">
                                <div className="font-bold text-stone-900">
                                    {selectedOption === activeQuizModal.correctIndex
                                        ? `正解！南京錠の${activeQuizModal.clueDigitIndex + 1}つ目の数字「${activeQuizModal.clueDigit}」が判明しました。`
                                        : '不正解です。解説を読んで手がかりを確認しましょう。'}
                                </div>
                                <p className="text-stone-600 leading-relaxed">{activeQuizModal.explanation}</p>
                                <button
                                    onClick={() => setActiveQuizModal(null)}
                                    className="w-full mt-2 py-2.5 rounded-xl bg-stone-900 text-white font-bold"
                                >
                                    探索に戻る
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ==========================================
          宝箱の開錠・南京錠ナンバー入力モーダル
      ========================================== */}
            {showUnlockModal && (
                <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-[#FAF8F5] border border-stone-300 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 text-center">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto text-amber-800">
                            {isBoxOpened ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                        </div>

                        <h3 className="text-base font-extrabold text-stone-900 font-serif">
                            {isBoxOpened ? '宝箱の開錠に成功しました！' : '南京錠の4桁番号を入力'}
                        </h3>
                        <p className="text-xs text-stone-600 leading-relaxed">
                            {isBoxOpened
                                ? `見事すべての手がかりを解き明かしました！実物の南京錠を「${selectedLocation.pinCode}」に合わせて木箱を開けてください。`
                                : '問題を解いて集めた4桁の数字を入力してください。宝箱の近く（30m以内）まで近づくと最終ヒントが表示されます。'}
                        </p>

                        {/* 4桁ダイヤル入力 */}
                        <div className="flex items-center justify-center gap-2.5 my-2">
                            {inputPin.map((val, idx) => (
                                <input
                                    key={idx}
                                    type="text"
                                    maxLength={1}
                                    value={val}
                                    onChange={(e) => {
                                        const next = [...inputPin];
                                        next[idx] = e.target.value.replace(/[^0-9]/g, '');
                                        setInputPin(next);
                                    }}
                                    className="w-12 h-14 rounded-xl bg-white border-2 border-stone-400 text-center text-xl font-black text-stone-900 focus:outline-none focus:border-amber-700"
                                    placeholder="-"
                                />
                            ))}
                        </div>

                        {distance <= 30 && !isBoxOpened && (
                            <div className="text-xs bg-emerald-50 border border-emerald-300 text-emerald-900 p-3 rounded-xl">
                                宝箱から30m以内に接近したため、南京錠の番号「<strong>{selectedLocation.pinCode}</strong>」が判明しました！
                                <button
                                    onClick={() => setInputPin(selectedLocation.pinCode.split(''))}
                                    className="ml-2 underline font-bold text-amber-800"
                                >
                                    番号をセットする
                                </button>
                            </div>
                        )}

                        {unlockError && (
                            <div className="text-xs text-rose-700 font-medium">{unlockError}</div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => {
                                    setShowUnlockModal(false);
                                    setUnlockError('');
                                }}
                                className="flex-1 py-3 rounded-xl bg-stone-200 text-stone-700 text-xs font-bold"
                            >
                                閉じる
                            </button>
                            {!isBoxOpened && (
                                <button
                                    onClick={handleUnlockAttempt}
                                    className="flex-1 py-3 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-sm"
                                >
                                    南京錠を開ける
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 下部ナビゲーションバー */}
            <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#FAF8F5]/95 backdrop-blur-sm border-t border-stone-300 px-6 py-2.5 flex items-center justify-around z-30">
                {[
                    { id: 'home', label: 'ホーム・宝箱', icon: Compass },
                    { id: 'map', label: '周辺マップ', icon: MapPin },
                    { id: 'quests', label: '問題・手がかり', icon: BookOpen }
                ].map(item => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${active ? 'text-amber-800 font-bold' : 'text-stone-500 hover:text-stone-800'
                                }`}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[11px]">{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}