const { useState, useMemo, useEffect, useRef, useId } = React;

// ============ Design tokens — Liquid Glass ============
// bg #0A0A0A · glass border rgba(255,255,255,.08)
// accents: purple #C026D3 · pink #DB2777 · cyan #22D3EE · cyan-light #67E8F9

const QUADRANTS = [
  { id: "q1", label: "فوری و مهم", sub: "همین الان", color: "#DB2777" },
  { id: "q2", label: "مهم، غیرفوری", sub: "برنامه‌ریزی کن", color: "#C026D3" },
  { id: "q3", label: "فوری، غیرمهم", sub: "واگذار یا سریع رد کن", color: "#22D3EE" },
  { id: "q4", label: "غیرفوری و غیرمهم", sub: "بعداً یا حذف", color: "#6B7280" },
];
const DAYPARTS = [
  { id: "morning", label: "صبح" }, { id: "noon", label: "ظهر" },
  { id: "evening", label: "عصر" }, { id: "night", label: "شب" },
];
const PRIORITIES = [
  { level: 1, label: "پایین" }, { level: 2, label: "متوسط" },
  { level: 3, label: "بالا" }, { level: 4, label: "بحرانی" },
];
const STATUS_ORDER = ["todo", "doing", "done"];
const STATUS_LABEL = { todo: "برای انجام", doing: "در حال انجام", done: "انجام‌شده" };
const DURATIONS = [25, 45, 60];

// ============ Recurrence: full scheduling engine ============
// getDay(): 0=یکشنبه ... 6=شنبه
const WEEKDAYS = [
  { id: 6, short: "ش", label: "شنبه" }, { id: 0, short: "ی", label: "یکشنبه" },
  { id: 1, short: "د", label: "دوشنبه" }, { id: 2, short: "س", label: "سه‌شنبه" },
  { id: 3, short: "چ", label: "چهارشنبه" }, { id: 4, short: "پ", label: "پنجشنبه" },
  { id: 5, short: "ج", label: "جمعه" },
];
const GREGORIAN_MONTHS_FA = ["ژانویه", "فوریه", "مارس", "آوریل", "می", "ژوئن", "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر"];
const RECURRENCE_TYPES = [["none", "بدون تکرار"], ["daily", "روزانه"], ["weekly", "هفتگی"], ["monthly", "ماهانه"], ["yearly", "سالانه"]];

// Is this task's current cycle "due" on the given date? (drives both the reset logic and the "today" widgets)
function isTaskDueOn(task, dateObj) {
  if (!task.recurrence || task.recurrence === "none") return true;
  if (task.recurrence === "daily") return true;
  if (task.recurrence === "weekly") {
    const days = task.recurrenceWeekdays && task.recurrenceWeekdays.length ? task.recurrenceWeekdays : [dateObj.getDay()];
    return days.includes(dateObj.getDay());
  }
  if (task.recurrence === "monthly") return dateObj.getDate() === (task.recurrenceDay || 1);
  if (task.recurrence === "yearly") return dateObj.getDate() === (task.recurrenceDay || 1) && (dateObj.getMonth() + 1) === (task.recurrenceMonth || 1);
  return true;
}
// Short human label describing the recurrence pattern, for badges in the task list.
function recurrenceLabel(task) {
  if (!task.recurrence || task.recurrence === "none") return null;
  if (task.recurrence === "daily") return "هر روز";
  if (task.recurrence === "weekly") {
    const days = task.recurrenceWeekdays || [];
    if (!days.length) return "هفتگی";
    return days.slice().sort((a, b) => (WEEKDAYS.findIndex(w => w.id === a)) - (WEEKDAYS.findIndex(w => w.id === b))).map((d) => WEEKDAYS.find((w) => w.id === d)?.label).join("، ");
  }
  if (task.recurrence === "monthly") return `ماهانه · روز ${task.recurrenceDay || 1}`;
  if (task.recurrence === "yearly") return `سالانه · ${task.recurrenceDay || 1} ${GREGORIAN_MONTHS_FA[(task.recurrenceMonth || 1) - 1]}`;
  return null;
}
const BOOK_STATUSES = [
  { id: "want", label: "می‌خوام بخونم", color: "#6B7280" },
  { id: "reading", label: "در حال مطالعه", color: "#22D3EE" },
  { id: "finished", label: "خوانده‌شده", color: "#C026D3" },
];

const dayColor = (id) => ({ morning: "#67E8F9", noon: "#22D3EE", evening: "#C026D3", night: "#DB2777" }[id]);
const dayGlow = (id) => ({ morning: "rgba(103,232,249,.6)", noon: "rgba(34,211,238,.6)", evening: "rgba(192,38,211,.6)", night: "rgba(219,39,119,.6)" }[id]);
const uid = () => Date.now() + Math.random();

function parseYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}
function formatWhen(v) {
  if (!v) return null;
  const [d, t] = v.split("T");
  return `${d} ${t || ""}`.trim();
}

// ============ Storage adapter ============
// Works two ways with zero other code changes:
//  - As a normal website: falls through to plain browser localStorage.
//  - As an Obsidian plugin: the plugin sets `window.__lifeflowObsidianApp = this.app`
//    before mounting, and this adapter transparently switches to Obsidian's
//    vault-scoped app.loadLocalStorage/saveLocalStorage instead — so data stays
//    scoped to that vault rather than leaking across every vault in the install.
const storage = {
  get(key) {
    const obsApp = typeof window !== "undefined" && window.__lifeflowObsidianApp;
    if (obsApp) return obsApp.loadLocalStorage(key);
    return window.localStorage.getItem(key);
  },
  set(key, value) {
    const obsApp = typeof window !== "undefined" && window.__lifeflowObsidianApp;
    try {
      if (obsApp) obsApp.saveLocalStorage(key, value);
      else window.localStorage.setItem(key, value);
      return true;
    } catch (e) { return false; }
  },
};

const STORAGE_KEY = "lifeflow_data_v1";
function loadSavedData() {
  try {
    const raw = storage.get(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// ============ App settings: theme + language ============
const SETTINGS_KEY = "lifeflow_settings_v1";
const LANGUAGES = [
  { id: "fa", label: "فارسی", dir: "rtl" },
  { id: "en", label: "English", dir: "ltr" },
  { id: "fr", label: "Français", dir: "ltr" },
  { id: "ar", label: "العربية", dir: "rtl" },
];
function loadSettings() {
  try {
    const raw = storage.get(SETTINGS_KEY);
    return raw ? { theme: "dark", language: "fa", ...JSON.parse(raw) } : { theme: "dark", language: "fa" };
  } catch (e) { return { theme: "dark", language: "fa" }; }
}
function saveSettings(s) { try { storage.set(SETTINGS_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }

// ---- i18n ----
// Core navigation/chrome is translated across all 4 languages. Deeper per-tab content
// (Study/Fitness/Learning internals, etc.) still shows Persian text and will be extended
// incrementally — see the README roadmap.
const I18N = {
  nav_dashboard: { fa: "داشبورد", en: "Dashboard", fr: "Tableau de bord", ar: "لوحة التحكم" },
  nav_tasks: { fa: "تسک‌ها", en: "Tasks", fr: "Tâches", ar: "المهام" },
  nav_planning: { fa: "برنامه‌ریزی", en: "Planning", fr: "Planification", ar: "التخطيط" },
  nav_study: { fa: "مطالعه", en: "Study", fr: "Étude", ar: "الدراسة" },
  nav_fitness: { fa: "ورزش", en: "Fitness", fr: "Sport", ar: "اللياقة" },
  nav_learning: { fa: "یادگیری", en: "Learning", fr: "Apprentissage", ar: "التعلم" },
  nav_notes: { fa: "یادداشت‌ها", en: "Notes", fr: "Notes", ar: "الملاحظات" },
  notes_lists: { fa: "لیست‌ها", en: "Lists", fr: "Listes", ar: "القوائم" },
  notes_journal: { fa: "یادداشت روزانه", en: "Journal", fr: "Journal", ar: "اليوميات" },
  add_task: { fa: "تسک جدید", en: "New task", fr: "Nouvelle tâche", ar: "مهمة جديدة" },
  backup_manager: { fa: "مدیریت بکاپ", en: "Backup manager", fr: "Sauvegardes", ar: "إدارة النسخ" },
  settings: { fa: "تنظیمات", en: "Settings", fr: "Paramètres", ar: "الإعدادات" },
  save: { fa: "ذخیره", en: "Save", fr: "Enregistrer", ar: "حفظ" },
  cancel: { fa: "انصراف", en: "Cancel", fr: "Annuler", ar: "إلغاء" },
  close: { fa: "بستن", en: "Close", fr: "Fermer", ar: "إغلاق" },
  appearance: { fa: "حالت ظاهری", en: "Appearance", fr: "Apparence", ar: "المظهر" },
  dark_mode: { fa: "تیره", en: "Dark", fr: "Sombre", ar: "داكن" },
  light_mode: { fa: "روشن", en: "Light", fr: "Clair", ar: "فاتح" },
  language: { fa: "زبان", en: "Language", fr: "Langue", ar: "اللغة" },
  ai_provider_section: { fa: "دستیار هوش مصنوعی", en: "AI assistant", fr: "Assistant IA", ar: "مساعد الذكاء الاصطناعي" },
  ai_provider_hint: { fa: "کلید API خودت رو از هر کدوم از این سرویس‌ها وارد کن تا کارت خلاصه‌ی هفتگی کار کنه. کلید فقط رو همین مرورگر ذخیره می‌شه.", en: "Enter your own API key from any of these providers so the weekly AI summary card works. The key is stored only in this browser.", fr: "Entrez votre propre clé API de l'un de ces fournisseurs pour activer le résumé IA hebdomadaire. La clé est stockée uniquement dans ce navigateur.", ar: "أدخل مفتاح API الخاص بك من أحد هذه المزودين لتفعيل ملخص الأسبوع بالذكاء الاصطناعي. يُخزَّن المفتاح في هذا المتصفح فقط." },
  ai_provider: { fa: "ارائه‌دهنده", en: "Provider", fr: "Fournisseur", ar: "المزود" },
  api_key: { fa: "کلید API", en: "API key", fr: "Clé API", ar: "مفتاح API" },
  streak_days: { fa: "روز استریک", en: "day streak", fr: "jours de suite", ar: "أيام متتالية" },
  today_progress: { fa: "پیشرفت امروز", en: "Today's progress", fr: "Progrès du jour", ar: "تقدم اليوم" },
  todays_plan: { fa: "برنامه امروز", en: "Today's plan", fr: "Plan du jour", ar: "خطة اليوم" },
  see_all: { fa: "همه", en: "All", fr: "Tout", ar: "الكل" },
  urgent_important: { fa: "فوری و مهم", en: "Urgent & important", fr: "Urgent et important", ar: "عاجل ومهم" },
  no_tasks_yet: { fa: "هنوز تسکی نداری", en: "No tasks yet", fr: "Aucune tâche pour l'instant", ar: "لا توجد مهام بعد" },
  no_tasks_today: { fa: "امروز تسک زمان‌بندی‌شده‌ای نداری 🎉", en: "Nothing scheduled for today 🎉", fr: "Rien de prévu aujourd'hui 🎉", ar: "لا توجد مهام لهذا اليوم 🎉" },
  ai_summary_title: { fa: "خلاصه هفته با هوش مصنوعی", en: "AI weekly summary", fr: "Résumé IA hebdomadaire", ar: "ملخص الأسبوع بالذكاء الاصطناعي" },
  get_summary: { fa: "دریافت", en: "Get summary", fr: "Obtenir", ar: "احصل عليه" },
  retry: { fa: "دوباره", en: "Retry", fr: "Réessayer", ar: "إعادة المحاولة" },
  ai_no_key: { fa: "برای دریافت خلاصه، اول از بخش تنظیمات یه کلید API وارد کن.", en: "To get a summary, first add an API key in Settings.", fr: "Pour obtenir un résumé, ajoutez d'abord une clé API dans les Paramètres.", ar: "للحصول على ملخص، أضف أولاً مفتاح API في الإعدادات." },
  open_settings: { fa: "برو به تنظیمات", en: "Open settings", fr: "Ouvrir les paramètres", ar: "فتح الإعدادات" },
};
function t(key, lang) {
  const entry = I18N[key];
  if (!entry) return key;
  return entry[lang] || entry.fa || key;
}

// ============ Multi-provider AI (bring-your-own-key) ============
const AI_CONFIG_KEY = "lifeflow_ai_v1";
const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "openai", label: "OpenAI (GPT)" },
  { id: "xai", label: "xAI (Grok)" },
  { id: "kimi", label: "Kimi (Moonshot AI)" },
];
function loadAiConfig() {
  try {
    const raw = storage.get(AI_CONFIG_KEY);
    return raw ? { provider: "anthropic", apiKey: "", ...JSON.parse(raw) } : { provider: "anthropic", apiKey: "" };
  } catch (e) { return { provider: "anthropic", apiKey: "" }; }
}
function saveAiConfig(cfg) { try { storage.set(AI_CONFIG_KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; } }

async function callAiProvider(provider, apiKey, prompt) {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    return (data.content || []).map((c) => c.text || "").join("\n").trim();
  }
  // OpenAI, xAI, and Kimi (Moonshot) all speak the same OpenAI-compatible chat/completions shape
  const ENDPOINTS = {
    openai: { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
    xai: { url: "https://api.x.ai/v1/chat/completions", model: "grok-2-latest" },
    kimi: { url: "https://api.moonshot.ai/v1/chat/completions", model: "moonshot-v1-8k" },
  };
  const cfg = ENDPOINTS[provider];
  if (!cfg) throw new Error("invalid provider");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ model: cfg.model, max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

const savedData = loadSavedData();

// ============ Gamification ============
function computeStats({ tasks, books, videos, podcasts, exercises, projects }) {
  const tasksDone = tasks.filter((t) => t.status === "done").length;
  const booksFinished = books.filter((b) => b.status === "finished").length;
  const videosWatched = videos.filter((v) => v.watched).length;
  const podcastsListened = podcasts.filter((p) => p.listened).length;
  const exercisesDone = exercises.filter((e) => e.done).length;
  const practiceDone = projects.reduce((s, p) => s + p.practice.filter((i) => i.done).length, 0);
  const milestonesDone = projects.reduce((s, p) => s + p.milestones.filter((i) => i.done).length, 0);
  const scheduledTasks = tasks.filter((t) => t.time).length;
  const xp = tasksDone * 10 + booksFinished * 50 + videosWatched * 15 + podcastsListened * 10 + exercisesDone * 15 + practiceDone * 15 + milestonesDone * 20;
  const levelSize = 150;
  const level = Math.floor(xp / levelSize) + 1;
  const xpIntoLevel = xp % levelSize;
  return { tasksDone, booksFinished, videosWatched, podcastsListened, exercisesDone, practiceDone, milestonesDone, scheduledTasks, xp, level, xpIntoLevel, levelSize };
}
const BADGES = [
  { id: "first-task", label: "شروع قدرتمند", icon: "check", test: (s) => s.tasksDone >= 1 },
  { id: "reader", label: "کتاب‌خوان", icon: "book", test: (s) => s.booksFinished >= 1 },
  { id: "streak7", label: "استریک هفتگی", icon: "flame", test: (s) => s.streak >= 7 },
  { id: "athlete", label: "ورزشکار", icon: "dumbbell", test: (s) => s.exercisesDone >= 5 },
  { id: "builder", label: "پروژه‌ساز", icon: "graduation-cap", test: (s) => s.milestonesDone >= 1 },
  { id: "organizer", label: "سازمان‌ده", icon: "clock", test: (s) => s.scheduledTasks >= 3 },
];
function GamificationCard({ stats, streak }) {
  const s = { ...stats, streak };
  const pct = Math.round((stats.xpIntoLevel / stats.levelSize) * 100);
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)" }}>{stats.level}</div>
          <div>
            <p className="text-sm font-bold text-white">سطح {stats.level}</p>
            <p className="text-[10px] text-slate-400">{stats.xp} امتیاز کل</p>
          </div>
        </div>
        <span className="text-[10px] text-slate-500">{stats.xpIntoLevel}/{stats.levelSize} تا سطح بعد</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mb-3">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#C026D3,#22D3EE)" }} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {BADGES.map((b) => {
          const unlocked = b.test(s);
          const glyph = unlocked ? b.icon : "lock";
          return (
            <div key={b.id} className="shrink-0 flex flex-col items-center gap-1 w-14">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: unlocked ? "rgba(192,38,211,.18)" : "rgba(255,255,255,.04)" }}>
                <Ic name={glyph} size={16} />
              </div>
              <span className="text-[9px] text-center leading-tight" style={{ color: unlocked ? "#cbd5e1" : "#475569" }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ============ AI weekly summary (calls Claude via the Anthropic API) ============
function AiSummaryCard({ stats, streak, lang, onOpenSettings }) {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [err, setErr] = useState("");
  const [aiCfg] = useState(() => loadAiConfig());

  const getSummary = async () => {
    setLoading(true);
    setSummary("");
    setErr("");
    try {
      const prompt = `این آمار هفته‌ی من در اپ مدیریت زندگی «زندگی‌آرام» است: ${stats.tasksDone} تسک انجام‌شده، ${stats.booksFinished} کتاب تمام‌شده، ${stats.exercisesDone} تمرین انجام‌شده، استریک ${streak} روز. لطفاً یک خلاصه‌ی کوتاه، صمیمی و انگیزشی (حداکثر ۳ جمله) به فارسی بنویس و یک پیشنهاد عملی و مشخص برای هفته بعد بده. فقط متن فارسی، بدون مقدمه اضافه.`;
      const text = await callAiProvider(aiCfg.provider, aiCfg.apiKey, prompt);
      setSummary(text || "چیزی برنگشت، دوباره امتحان کن.");
    } catch (e) {
      setErr(e.message || "خطای نامشخص");
    }
    setLoading(false);
  };

  const hasKey = !!aiCfg.apiKey;

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-slate-200 flex items-center gap-1.5"><Ic name="sparkles" size={15} className="text-fuchsia-300" /> {t("ai_summary_title", lang)}</p>
        {hasKey && (
          <button onClick={getSummary} disabled={loading} className="text-[11px] px-3 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 font-medium flex items-center gap-1.5 disabled:opacity-50">
            {loading && <span className="w-3 h-3 border-2 border-fuchsia-300/40 border-t-violet-300 rounded-full animate-spin inline-block" />} {summary ? t("retry", lang) : t("get_summary", lang)}
          </button>
        )}
      </div>
      {!hasKey && (
        <div className="text-[11px] text-slate-500">
          <p className="mb-2">{t("ai_no_key", lang)}</p>
          <button onClick={onOpenSettings} className="text-fuchsia-300 font-medium">{t("open_settings", lang)} ←</button>
        </div>
      )}
      {hasKey && err && <p className="text-xs text-rose-400">{err}</p>}
      {hasKey && summary && <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{summary}</p>}
      {hasKey && !summary && !err && !loading && <p className="text-[11px] text-slate-500">برای دریافت خلاصه و پیشنهاد این هفته، دکمه رو بزن</p>}
    </GlassCard>
  );
}

// ============ Global search ============
function GlobalSearchModal({ onClose, onNavigate, tasks, books, videos, podcasts, exercises, projects }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const match = (s) => s && s.toLowerCase().includes(query);

  const results = query.length < 1 ? [] : [
    ...tasks.filter((t) => match(t.title)).map((t) => ({ id: "t" + t.id, label: t.title, sub: "تسک", tab: "tasks", icon: "clipboard", color: "#C026D3" })),
    ...books.filter((b) => match(b.title) || match(b.author)).map((b) => ({ id: "b" + b.id, label: b.title, sub: "کتاب · " + b.author, tab: "study", icon: "book", color: "#C026D3" })),
    ...videos.filter((v) => match(v.title)).map((v) => ({ id: "v" + v.id, label: v.title, sub: "ویدیو", tab: "study", icon: "play", color: "#C026D3" })),
    ...podcasts.filter((p) => match(p.title)).map((p) => ({ id: "p" + p.id, label: p.title, sub: "پادکست", tab: "study", icon: "headphones", color: "#22D3EE" })),
    ...exercises.filter((e) => match(e.name)).map((e) => ({ id: "e" + e.id, label: e.name, sub: "تمرین", tab: "fitness", icon: "dumbbell", color: "#DB2777" })),
    ...projects.filter((p) => match(p.title)).map((p) => ({ id: "pr" + p.id, label: p.title, sub: "پروژه یادگیری", tab: "learning", icon: "graduation-cap", color: "#C026D3" })),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div className="max-w-md mx-auto w-full px-4 pt-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2.5">
            <Ic name="search" size={16} className="text-slate-400 shrink-0" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی سراسری — تسک، کتاب، ویدیو، تمرین..."
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-500" />
          </div>
          <button onClick={onClose} className="text-slate-400"><Ic name="x" size={22} /></button>
        </div>
        <div className="space-y-2 overflow-y-auto max-h-[70vh]">
          {query.length > 0 && results.length === 0 && <p className="text-xs text-slate-500 text-center py-6">نتیجه‌ای پیدا نشد</p>}
          {results.map((r) => {
            const glyph = r.icon;
            return (
              <button key={r.id} onClick={() => { onNavigate(r.tab); onClose(); }} className="w-full flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2.5 text-right">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${r.color}22` }}><Ic name={glyph} size={14} /></div>
                <div className="min-w-0 flex-1"><p className="text-xs text-slate-100 truncate">{r.label}</p><p className="text-[10px] text-slate-500">{r.sub}</p></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============ Shared bits ============
// ============ Shared bits ============
const ICON_PATHS = {
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7",
  "check-square": "M9 12l2 2 4-4 M5 5h14v14H5Z",
  flame: "M12 3c1 3-3 4-3 8a3 3 0 0 0 6 0c0-1-1-2-1-3 2 1 3 3 3 5a5 5 0 0 1-10 0c0-4 3-6 5-10Z",
  "book-open": "M12 6c-1.5-1.2-4-2-7-2v13c3 0 5.5.8 7 2 1.5-1.2 4-2 7-2V4c-3 0-5.5.8-7 2ZM12 6v13",
  dumbbell: "M6 8v8M4 10v4M20 10v4M18 8v8M8 12h8",
  "graduation-cap": "M2 9l10-4 10 4-10 4-10-4ZM6 11v4c0 1.5 3 3 6 3s6-1.5 6-3v-4M22 9v6",
  clipboard: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z M9 12h6M9 16h6",
  home: "M4 11 12 4l8 7M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9",
  clock: "M12 7v5l3.5 2",
  tag: "M4 4h8l8 8-8 8-8-8V4Z",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-right": "M9 6l6 6-6 6",
  bell: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 20a2 2 0 0 0 4 0",
  repeat: "M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  play: "M7 5v14l12-7Z",
  headphones: "M4 13v-1a8 8 0 0 1 16 0v1",
  book: "M6 3h11a2 2 0 0 1 2 2v15l-6-2-6 2V5a2 2 0 0 1 2-2Z",
  "external-link": "M9 15 20 4M14 4h6v6M20 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6",
  sparkles: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  search: "M21 21l-4.3-4.3",
  trash: "M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6",
  calendar: "M16 3v4M8 3v4M3 10h18",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M12 15v2",
  sunrise: "M12 3v4M5 12l1.5 1.5M19 12l-1.5 1.5M2 20h20",
  sun: "M12 3v2M12 19v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4",
  sunset: "M12 21v-4M5 12l1.5-1.5M19 12l-1.5-1.5M2 20h20",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  "trending-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
  grid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  columns: "M3 4h6v16H3zM15 4h6v16h-6z",
  location: "M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z",
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14 6.5l3 3",
  cloud: "M7 18a4.2 4.2 0 0 1-.6-8.36A5.5 5.5 0 0 1 16.9 8.2 4.3 4.3 0 0 1 16.3 18H7Z",
  copy: "M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3",
  upload: "M12 21V9M7 13l5-5 5 5M5 4h14",
  settings: "M10.5 3h3l.5 2.2a7 7 0 0 1 2 1.15l2.15-.75 1.5 2.6-1.7 1.5a7 7 0 0 1 0 2.3l1.7 1.5-1.5 2.6-2.15-.75a7 7 0 0 1-2 1.15L13.5 21h-3l-.5-2.2a7 7 0 0 1-2-1.15l-2.15.75-1.5-2.6 1.7-1.5a7 7 0 0 1 0-2.3l-1.7-1.5 1.5-2.6 2.15.75a7 7 0 0 1 2-1.15Z M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z",
};
const ICON_EXTRA = {
  clipboard: <rect x="5" y="6" width="14" height="15" rx="2" />,
  home: null,
  clock: <circle cx="12" cy="12" r="9" />,
  search: <circle cx="11" cy="11" r="7" />,
  folder: null,
  calendar: <rect x="3" y="5" width="18" height="16" rx="2" />,
  lock: <rect x="5" y="10" width="14" height="10" rx="2" />,
  sunrise: <circle cx="12" cy="16" r="3.5" />,
  sun: <circle cx="12" cy="12" r="4" />,
  sunset: <circle cx="12" cy="14" r="3.5" />,
  location: <circle cx="12" cy="9" r="2.3" />,
  copy: <rect x="3" y="8" width="10" height="10" rx="2" />,
};
function Ic({ name, size = 16, className = "", style = {}, color }) {
  if (!name) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, color: color || "currentColor", ...style }}
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICON_EXTRA[name]}
      <path d={ICON_PATHS[name] || ""} />
    </svg>
  );
}
function GlassCard({ children, className = "" }) {
  return (
    <div className={`glass-panel rounded-2xl overflow-hidden ${className}`}>
      <div className="glass-sheen" />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

// ============ Galaxy background: nebula blobs + canvas starfield ============
function GalaxyBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let raf, stars = [], w = 0, h = 0, frame = 0;
    function resize() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(110, Math.floor((w * h) / 8000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.2 + 0.25,
        speed: Math.random() * 0.015 + 0.005,
        phase: Math.random() * Math.PI * 2,
        tint: Math.random() > 0.88 ? "196,181,253" : Math.random() > 0.75 ? "125,211,252" : "255,255,255",
      }));
    }
    resize();
    window.addEventListener("resize", resize);
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0;
    function draw() {
      frame++;
      if (!reduceMotion && frame % 2 === 0) { // ~30fps twinkle, half the GPU/CPU work of 60fps
        t += 1;
        ctx.clearRect(0, 0, w, h);
        for (const s of stars) {
          const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
          ctx.beginPath();
          ctx.fillStyle = `rgba(${s.tint},${tw})`;
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (reduceMotion && frame === 1) {
        ctx.clearRect(0, 0, w, h);
        for (const s of stars) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(${s.tint},0.6)`;
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" style={{ background: "#050308", contain: "strict" }}>
      <div className="nebula nebula-1" />
      <div className="nebula nebula-2" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 90% 60% at 50% 105%, rgba(0,0,0,.75), transparent 60%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 40% at 50% -10%, rgba(0,0,0,.55), transparent 60%)" }} />
    </div>
  );
}

// ============ Page transition: 3D liquid-glass pane swap ============
function PageTransition({ pageKey, children }) {
  return (
    <div style={{ perspective: 1400 }}>
      <div key={pageKey} className="glass-pane-enter">{children}</div>
    </div>
  );
}

function LightBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" style={{ background: "linear-gradient(160deg,#F5F3FB 0%,#EFEAFB 45%,#F7EEF5 100%)" }}>
      <div className="nebula" style={{ width: 480, height: 480, top: -160, left: -120, background: "radial-gradient(circle,#E9A5F1,transparent 70%)", opacity: 0.5, animation: "nebulaDrift 34s ease-in-out infinite alternate" }} />
      <div className="nebula" style={{ width: 520, height: 520, bottom: -220, right: -180, background: "radial-gradient(circle,#93E4F5,transparent 70%)", opacity: 0.45, animation: "nebulaDrift 40s ease-in-out infinite alternate", animationDelay: "-9s" }} />
    </div>
  );
}
function StatPill({ icon, label, value, color }) {
  return (
    <GlassCard className="flex items-center gap-3 px-4 py-3 flex-1 min-w-[130px]">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}22` }}>
        <Ic name={icon} size={18} />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-white font-bold text-base truncate">{value}</span>
        <span className="text-slate-400 text-[11px] truncate">{label}</span>
      </div>
    </GlassCard>
  );
}
function PriorityBars({ level }) {
  return (
    <div className="flex items-center gap-[2px]">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className="w-[3px] rounded-full" style={{ height: 3 + i * 2, background: i <= level ? "#DB2777" : "rgba(255,255,255,0.12)" }} />
      ))}
    </div>
  );
}
function Chip({ active, onClick, children, color = "#C026D3" }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium border transition-all duration-200"
      style={{ borderColor: active ? color : "rgba(255,255,255,.1)", background: active ? `${color}26` : "rgba(255,255,255,.03)", color: active ? color : "#94a3b8", boxShadow: active ? `0 0 12px ${color}44, inset 0 1px 0 rgba(255,255,255,.15)` : "none" }}>
      {children}
    </button>
  );
}
function ModalShell({ title, onClose, onSubmit, footer, children }) {
  const content = (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (onSubmit) onSubmit(); }}
        className="modal-glass-pop"
        style={{
          width: "100%", maxWidth: 440, maxHeight: "85%", display: "flex", flexDirection: "column",
          borderTopLeftRadius: 28, borderTopRightRadius: 28, position: "relative", overflow: "hidden",
          background: "linear-gradient(165deg, rgba(30,14,36,.92), rgba(10,7,16,.96))",
          backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 -10px 50px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.14)",
        }}
      >
        <div className="glass-sheen" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <h3 className="text-white font-bold text-lg" style={{ margin: 0 }}>{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.06] border border-white/10"><Ic name="x" size={18} /></button>
        </div>
        <div style={{ padding: "0 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, position: "relative", zIndex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: "12px 20px 20px", flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.1)", position: "relative", zIndex: 1 }}>
            {footer}
          </div>
        )}
      </form>
    </div>
  );
  // Portal straight to <body>: this guarantees the modal always renders on top,
  // no matter which component/container it was opened from.
  return ReactDOM.createPortal(content, document.body);
}
function TextInput(props) {
  return <input {...props} className={`w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm mb-3 outline-none focus:border-fuchsia-400/60 ${props.className || ""}`} />;
}
const chartTick = { fill: "#64748b", fontSize: 10 };
const chartTooltipStyle = { background: "#120814", border: "1px solid rgba(255,255,255,.12)", borderRadius: 10, fontSize: 11, color: "#e2e8f0" };
function SubTabs({ options, value, onChange }) {
  return (
    <div className="flex bg-white/[0.05] border border-white/10 rounded-xl p-1 overflow-x-auto">
      {options.map(([id, label, Icon]) => (
        <button key={id} onClick={() => onChange(id)} className={`flex-1 shrink-0 flex items-center justify-center gap-1.5 rounded-lg py-2 px-2 text-xs font-medium whitespace-nowrap ${value === id ? "bg-white/10 text-white" : "text-slate-400"}`}>
          {Icon && <Ic name={Icon} size={13} />} {label}
        </button>
      ))}
    </div>
  );
}

// ============ Day Arc ============
function DayArc({ tasks, lang }) {
  const size = 220, stroke = 16, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  const segAngle = 180 / 4, startAngle = 180;
  const polar = (a, radius) => { const rad = (a * Math.PI) / 180; return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)]; };
  const arcPath = (a0, a1, radius) => {
    const [x0, y0] = polar(a0, radius), [x1, y1] = polar(a1, radius);
    return `M ${x0} ${y0} A ${radius} ${radius} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const segments = DAYPARTS.map((dp, i) => {
    const dayTasks = tasks.filter((t) => t.daypart === dp.id);
    const done = dayTasks.filter((t) => t.status === "done").length;
    return { ...dp, ratio: dayTasks.length ? done / dayTasks.length : 0, a0: startAngle + i * segAngle, a1: startAngle + (i + 1) * segAngle };
  });
  const totalDone = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((totalDone / tasks.length) * 100) : 0;

  return (
    <div className="relative flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        <defs>
          <radialGradient id="dayarc-glow" cx="50%" cy="100%" r="70%">
            <stop offset="0%" stopColor="#C026D3" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#C026D3" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={`M 8 ${size / 2 + 8} A ${size / 2 - 2} ${size / 2 - 2} 0 0 1 ${size - 8} ${size / 2 + 8}`} fill="url(#dayarc-glow)" stroke="none" />
        {segments.map((s) => <path key={s.id} d={arcPath(s.a0 + 3, s.a1 - 3, r)} stroke="rgba(255,255,255,.06)" strokeWidth={stroke} fill="none" strokeLinecap="round" />)}
        {segments.map((s) => {
          if (s.ratio <= 0) return null;
          const sweep = s.a0 + 3 + (s.a1 - s.a0 - 6) * s.ratio;
          return <path key={s.id + "f"} d={arcPath(s.a0 + 3, sweep, r)} stroke={dayColor(s.id)} strokeWidth={stroke} fill="none" strokeLinecap="round" pathLength="100" className="chart-line-draw" style={{ filter: `drop-shadow(0 0 6px ${dayGlow(s.id)})` }} />;
        })}
      </svg>
      <div className="absolute top-[62%] flex flex-col items-center">
        <span className="text-4xl font-extrabold leading-none" style={{ background: "linear-gradient(135deg,#fff,#EAB4F2)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{pct}%</span>
        <span className="text-[11px] text-slate-400 mt-1.5">{t("today_progress", lang)}</span>
      </div>
      <div className="flex gap-4 mt-2">
        {segments.map((s) => (
          <div key={s.id} className="flex flex-col items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: dayColor(s.id) }} />
            <span className="text-[10px] text-slate-400">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Task row ============
function TaskRow({ task, onToggle, onSchedule, onDelete, onEdit }) {
  const q = QUADRANTS.find((x) => x.id === task.quad);
  const [openSched, setOpenSched] = useState(false);
  return (
    <div className="py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center gap-3 px-1">
        <button onClick={() => onToggle(task.id)}
          className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0"
          style={{ borderColor: task.status === "done" ? q.color : "rgba(255,255,255,.25)", background: task.status === "done" ? q.color : "transparent" }}>
          {task.status === "done" && <Ic name="check" size={14} color="#0A0A0A" strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${task.status === "done" ? "text-slate-500 line-through" : "text-slate-100"}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: `${q.color}22`, color: q.color }}>{q.label}</span>
            {task.tag && <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Ic name="tag" size={10} />{task.tag}</span>}
            {task.recurrence !== "none" && (
              <span className="text-[10px] text-slate-500 flex items-center gap-0.5 bg-white/[0.04] rounded-md px-1.5 py-0.5">
                <Ic name="repeat" size={10} /> {recurrenceLabel(task)}
              </span>
            )}
            {task.reminder && <Ic name="bell" size={11} className="text-slate-500" />}
            <PriorityBars level={task.priority} />
          </div>
        </div>
        <button onClick={() => setOpenSched((v) => !v)} className="shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-white/10"
          style={{ color: task.time ? "#22D3EE" : "#64748b", background: task.time ? "rgba(34,211,238,.1)" : "transparent" }}>
          <Ic name="clock" size={12} /> {task.time || "زمان‌بندی"}
        </button>
        {onEdit && (
          <button onClick={() => onEdit(task)} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-fuchsia-300 hover:bg-fuchsia-500/10">
            <Ic name="edit" size={14} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(task.id)} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10">
            <Ic name="trash" size={14} />
          </button>
        )}
      </div>
      {openSched && (
        <div className="flex items-center gap-2 mt-2 mr-9">
          <input type="time" defaultValue={task.time || "08:00"}
            onChange={(e) => onSchedule(task.id, e.target.value, task.duration)}
            className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" />
          <div className="flex gap-1">
            {DURATIONS.map((d) => (
              <Chip key={d} active={task.duration === d} color="#22D3EE" onClick={() => onSchedule(task.id, task.time || "08:00", d)}>{d}د</Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Add task modal ============
function AddTaskModal({ onClose, onAdd, initialTask }) {
  const isEdit = !!initialTask;
  const [title, setTitle] = useState(initialTask ? initialTask.title : ""), [desc, setDesc] = useState(initialTask ? initialTask.desc || "" : "");
  const [quad, setQuad] = useState(initialTask ? initialTask.quad : "q2"), [priority, setPriority] = useState(initialTask ? initialTask.priority : 2);
  const [daypart, setDaypart] = useState(initialTask ? initialTask.daypart : "morning"), [tag, setTag] = useState(initialTask ? initialTask.tag || "" : "");
  const [time, setTime] = useState(initialTask ? initialTask.time || "" : ""), [duration, setDuration] = useState(initialTask ? initialTask.duration : 45);
  const [recurrence, setRecurrence] = useState(initialTask ? initialTask.recurrence : "none"), [reminder, setReminder] = useState(initialTask ? initialTask.reminder : false);
  const [weekdays, setWeekdays] = useState(initialTask && initialTask.recurrenceWeekdays ? initialTask.recurrenceWeekdays : [new Date().getDay()]);
  const [monthDay, setMonthDay] = useState(initialTask && initialTask.recurrenceDay ? initialTask.recurrenceDay : new Date().getDate());
  const [yearMonth, setYearMonth] = useState(initialTask && initialTask.recurrenceMonth ? initialTask.recurrenceMonth : new Date().getMonth() + 1);
  const toggleWeekday = (id) => setWeekdays((p) => p.includes(id) ? (p.length > 1 ? p.filter((x) => x !== id) : p) : [...p, id]);
  const [subInput, setSubInput] = useState(initialTask && initialTask.subtasks ? initialTask.subtasks.map((s) => s.title).join(", ") : "");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({
      id: isEdit ? initialTask.id : uid(),
      title: title.trim(), desc: desc.trim(), quad, priority,
      status: isEdit ? initialTask.status : "todo",
      completedDate: isEdit ? initialTask.completedDate : null,
      daypart, tag: tag.trim(),
      time: time || null, duration, recurrence, reminder,
      recurrenceWeekdays: recurrence === "weekly" ? weekdays : undefined,
      recurrenceDay: (recurrence === "monthly" || recurrence === "yearly") ? monthDay : undefined,
      recurrenceMonth: recurrence === "yearly" ? yearMonth : undefined,
      subtasks: subInput.trim() ? subInput.split(",").map((s) => ({ id: uid(), title: s.trim(), done: false })).filter((s) => s.title) : [],
    });
    onClose();
  };

  return (
    <ModalShell title={isEdit ? "ویرایش تسک" : "تسک جدید"} onClose={onClose} onSubmit={submit}
      footer={<button type="submit" disabled={!title.trim()} className="w-full rounded-xl py-3 font-bold text-sm bg-gradient-to-l from-[#C026D3] to-[#DB2777] text-white disabled:opacity-30">{isEdit ? "ذخیره تغییرات" : "افزودن تسک"}</button>}>
      <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان تسک — مثلاً حل نمونه‌سوال فیزیک" />
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="توضیح (اختیاری)" rows={2}
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 text-xs mb-4 outline-none resize-none focus:border-fuchsia-400/60" />

      <p className="text-slate-400 text-xs mb-2">ربع آیزنهاور</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {QUADRANTS.map((q) => <Chip key={q.id} active={quad === q.id} color={q.color} onClick={() => setQuad(q.id)}>{q.label}</Chip>)}
      </div>

      <p className="text-slate-400 text-xs mb-2">اولویت</p>
      <div className="flex gap-2 mb-4">
        {PRIORITIES.map((p) => <Chip key={p.level} active={priority === p.level} color="#DB2777" onClick={() => setPriority(p.level)}>{p.label}</Chip>)}
      </div>

      <p className="text-slate-400 text-xs mb-2">زمان روز</p>
      <div className="flex gap-2 mb-4">
        {DAYPARTS.map((d) => <Chip key={d.id} active={daypart === d.id} onClick={() => setDaypart(d.id)}>{d.label}</Chip>)}
      </div>

      <p className="text-slate-400 text-xs mb-2">زمان‌بندی دقیق (اختیاری — برای Time Blocking)</p>
      <div className="flex items-center gap-2 mb-4">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
        <div className="flex gap-1.5">
          {DURATIONS.map((d) => <Chip key={d} active={duration === d} color="#22D3EE" onClick={() => setDuration(d)}>{d} دقیقه</Chip>)}
        </div>
      </div>

      <p className="text-slate-400 text-xs mb-2">تکرار</p>
      <div className="flex gap-2 mb-3 flex-wrap">
        {RECURRENCE_TYPES.map(([v, l]) => (
          <Chip key={v} active={recurrence === v} onClick={() => setRecurrence(v)}>{l}</Chip>
        ))}
      </div>

      {recurrence === "weekly" && (
        <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-xl p-3">
          <p className="text-slate-500 text-[11px] mb-2">در چه روزهایی از هفته تکرار بشه</p>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAYS.map((w) => (
              <Chip key={w.id} active={weekdays.includes(w.id)} color="#22D3EE" onClick={() => toggleWeekday(w.id)}>{w.label}</Chip>
            ))}
          </div>
        </div>
      )}

      {recurrence === "monthly" && (
        <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-xl p-3">
          <p className="text-slate-500 text-[11px] mb-2">در چندم هر ماه تکرار بشه</p>
          <input type="number" min="1" max="31" value={monthDay}
            onChange={(e) => setMonthDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
            className="w-24 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
          <span className="text-xs text-slate-500 mr-2">هر ماه، روز {monthDay}</span>
        </div>
      )}

      {recurrence === "yearly" && (
        <div className="mb-4 bg-white/[0.03] border border-white/10 rounded-xl p-3">
          <p className="text-slate-500 text-[11px] mb-2">هر سال در چه تاریخی تکرار بشه</p>
          <div className="flex items-center gap-2">
            <input type="number" min="1" max="31" value={monthDay}
              onChange={(e) => setMonthDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className="w-20 bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" />
            <select value={yearMonth} onChange={(e) => setYearMonth(Number(e.target.value))}
              className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none">
              {GREGORIAN_MONTHS_FA.map((m, i) => <option key={i} value={i + 1} className="bg-[#120814]">{m}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5">
        <span className="text-xs text-slate-300 flex items-center gap-1.5"><Ic name="bell" size={13} /> یادآوری</span>
        <button type="button" onClick={() => setReminder((v) => !v)} className="w-10 h-5 rounded-full relative transition-colors" style={{ background: reminder ? "#C026D3" : "rgba(255,255,255,.15)" }}>
          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ right: reminder ? 20 : 2 }} />
        </button>
      </div>

      <TextInput value={tag} onChange={(e) => setTag(e.target.value)} placeholder="برچسب (اختیاری)" />
      <input value={subInput} onChange={(e) => setSubInput(e.target.value)} placeholder="زیرتسک‌ها با کاما جدا کن (اختیاری)"
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-slate-500 text-xs mb-2 outline-none focus:border-fuchsia-400/60" />
    </ModalShell>
  );
}

// ============ Eisenhower board ============
function EisenhowerBoard({ tasks, onToggle, onDelete }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {QUADRANTS.map((q) => {
        const qTasks = tasks.filter((t) => t.quad === q.id);
        return (
          <GlassCard key={q.id} className="p-3 min-h-[150px]">
            <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full" style={{ background: q.color }} /><p className="text-xs font-bold" style={{ color: q.color }}>{q.label}</p></div>
            <p className="text-[10px] text-slate-500 mb-2">{q.sub}</p>
            <div className="space-y-1.5">
              {qTasks.length === 0 && <p className="text-[11px] text-slate-600">تسکی نیست</p>}
              {qTasks.map((t) => (
                <div key={t.id} className={`flex items-center gap-1 rounded-lg border border-white/[0.06] ${t.status === "done" ? "bg-white/[0.02]" : "bg-white/[0.03]"}`}>
                  <button onClick={() => onToggle(t.id)}
                    className={`flex-1 text-right text-[11px] px-2 py-1.5 truncate ${t.status === "done" ? "text-slate-600 line-through" : "text-slate-200"}`}>
                    {t.title}
                  </button>
                  <button onClick={() => onDelete(t.id)} className="shrink-0 px-1.5 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={11} /></button>
                </div>
              ))}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ============ Kanban ============
function KanbanBoard({ tasks, onMove, onDelete }) {
  return (
    <div className="space-y-3">
      {STATUS_ORDER.map((st) => {
        const items = tasks.filter((t) => t.status === st);
        const idx = STATUS_ORDER.indexOf(st);
        return (
          <GlassCard key={st} className="p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-200">{STATUS_LABEL[st]}</p>
              <span className="text-[10px] text-slate-500">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.length === 0 && <p className="text-[11px] text-slate-600 py-1">خالی</p>}
              {items.map((t) => {
                const q = QUADRANTS.find((x) => x.id === t.quad);
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: q.color }} />
                    <p className="text-xs text-slate-200 flex-1 truncate">{t.title}</p>
                    <div className="flex gap-1 shrink-0">
                      {idx > 0 && <button onClick={() => onMove(t.id, STATUS_ORDER[idx - 1])} className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center"><Ic name="chevron-right" size={13} className="text-slate-400" /></button>}
                      {idx < 2 && <button onClick={() => onMove(t.id, STATUS_ORDER[idx + 1])} className="w-6 h-6 rounded-md bg-white/[0.06] flex items-center justify-center"><Ic name="chevron-left" size={13} className="text-slate-400" /></button>}
                      <button onClick={() => onDelete(t.id)} className="w-6 h-6 rounded-md bg-rose-500/10 flex items-center justify-center"><Ic name="trash" size={12} className="text-rose-400" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ============ Time Blocking ============
function TimelineView({ tasks, onSchedule, onSuggest }) {
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  const unscheduled = tasks.filter((t) => !t.time);
  const scheduled = tasks.filter((t) => t.time);
  const rowH = 44;
  const topFor = (time) => { const [h, m] = time.split(":").map(Number); return (h - 6) * rowH + (m / 60) * rowH; };

  return (
    <div className="space-y-3">
      <GlassCard className="p-3 flex items-center justify-between">
        <p className="text-xs text-slate-300 flex items-center gap-1.5"><Ic name="sparkles" size={14} className="text-fuchsia-300" /> پیشنهاد برنامه هوشمند</p>
        <button onClick={onSuggest} className="text-[11px] px-3 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 font-medium">اعمال کن</button>
      </GlassCard>

      {unscheduled.length > 0 && (
        <GlassCard className="p-3">
          <p className="text-[11px] text-slate-400 mb-2">برنامه‌ریزی‌نشده — یک زمان انتخاب کن</p>
          <div className="space-y-1.5">
            {unscheduled.map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1.5">
                <p className="text-xs text-slate-200 flex-1 truncate">{t.title}</p>
                <input type="time" onChange={(e) => onSchedule(t.id, e.target.value, t.duration)}
                  className="bg-white/[0.06] border border-white/10 rounded-md px-1.5 py-1 text-[11px] text-white outline-none w-[85px]" />
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-3">
        <div className="relative" style={{ height: hours.length * rowH }}>
          {hours.map((h, i) => (
            <div key={h} className="absolute left-0 right-0 flex items-start gap-2" style={{ top: i * rowH, height: rowH }}>
              <span className="text-[10px] text-slate-500 w-9 shrink-0">{String(h).padStart(2, "0")}:۰۰</span>
              <div className="flex-1 border-t border-white/[0.05]" />
            </div>
          ))}
          {scheduled.map((t) => {
            const q = QUADRANTS.find((x) => x.id === t.quad);
            const h = t.duration / 60 * rowH;
            return (
              <div key={t.id} className="absolute right-1 rounded-lg px-2 py-1 overflow-hidden"
                style={{ top: topFor(t.time), height: Math.max(h, 22), left: 46, background: `${q.color}22`, borderRight: `3px solid ${q.color}` }}>
                <p className="text-[10px] font-medium truncate" style={{ color: q.color }}>{t.title}</p>
                <p className="text-[9px] text-slate-400">{t.time} · {t.duration}د</p>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

// ============ Study Hub ============
function BookCard({ book, onSetStatus, onAddPages, onDelete }) {
  const st = BOOK_STATUSES.find((s) => s.id === book.status);
  const pct = book.pages ? Math.min(100, Math.round((book.pagesRead / book.pages) * 100)) : 0;
  return (
    <GlassCard className="p-3">
      <div className="flex gap-3">
        <div className="rounded-lg shrink-0 flex items-center justify-center text-lg font-bold" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)", height: 56, width: 42 }}>{book.title[0]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-100 truncate">{book.title}</p>
          <p className="text-[11px] text-slate-500 mb-1.5">{book.author}{book.pages ? ` · ${book.pagesRead}/${book.pages} صفحه` : ""}</p>
          {book.status !== "want" && (
            <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${book.status === "finished" ? 100 : pct}%`, background: "linear-gradient(90deg,#C026D3,#22D3EE)" }} />
            </div>
          )}
        </div>
        {book.status === "reading" && (
          <button onClick={() => onAddPages(book.id)} className="self-center text-[10px] px-2 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 shrink-0">+۱۰ص</button>
        )}
        <button onClick={() => onDelete(book.id)} className="self-center w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/80 hover:bg-rose-500/10 shrink-0"><Ic name="trash" size={14} /></button>
      </div>
      <div className="flex gap-1.5 mt-2.5">
        {BOOK_STATUSES.map((s) => (
          <button key={s.id} onClick={() => onSetStatus(book.id, s.id)} className="flex-1 text-[10px] rounded-lg py-1.5 border transition-all"
            style={{ borderColor: book.status === s.id ? s.color : "rgba(255,255,255,.1)", background: book.status === s.id ? `${s.color}22` : "transparent", color: book.status === s.id ? s.color : "#64748b" }}>
            {s.label}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}
function AddBookModal({ onClose, onAdd }) {
  const [title, setTitle] = useState(""), [author, setAuthor] = useState("");
  const [pages, setPages] = useState(""), [status, setStatus] = useState("want");
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), author: author.trim(), pages: Number(pages) || 0, pagesRead: status === "finished" ? Number(pages) || 0 : 0, status });
    onClose();
  };
  return (
    <ModalShell title="افزودن کتاب" onClose={onClose} onSubmit={submit}
      footer={<button type="submit" disabled={!title.trim()} className="w-full rounded-xl py-3 font-bold text-sm bg-gradient-to-l from-[#C026D3] to-[#DB2777] text-white disabled:opacity-30">افزودن</button>}>
      <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان کتاب" />
      <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="نویسنده" />
      <input type="number" value={pages} onChange={(e) => setPages(e.target.value)} placeholder="تعداد صفحات"
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 text-sm mb-4 outline-none" />
      <p className="text-slate-400 text-xs mb-2">وضعیت</p>
      <div className="flex gap-2 mb-2">
        {BOOK_STATUSES.map((s) => <Chip key={s.id} active={status === s.id} color={s.color} onClick={() => setStatus(s.id)}>{s.label}</Chip>)}
      </div>
    </ModalShell>
  );
}

function VideoCard({ v, onToggleWatched, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <GlassCard className="p-3 flex gap-3 group hover:scale-[1.02] transition-all duration-300">
        {v.videoId ? (
          <div onClick={() => setShowModal(true)} className="shrink-0 relative cursor-pointer group/video">
            <img src={`https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`} alt={v.title} className="w-24 h-16 object-cover rounded-lg" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover/video:opacity-100 transition-opacity">
              <Ic name="play" size={20} className="text-white" />
            </span>
          </div>
        ) : v.fileData ? (
          <video src={v.fileData} controls className="w-24 h-16 object-cover rounded-lg bg-black shrink-0" />
        ) : (
          <div className="w-24 h-16 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0"><Ic name="play" size={18} className="text-red-400" /></div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-100 truncate">{v.title}</p>
          {v.watchAt && <p className="text-[11px] text-cyan-300 mt-0.5 flex items-center gap-1"><Ic name="clock" size={11} />{formatWhen(v.watchAt)}</p>}
          {v.videoId && (
            <button onClick={() => setShowModal(true)} className="text-[11px] text-fuchsia-300 flex items-center gap-1 mt-1 hover:text-fuchsia-200 transition-colors">
              پخش در برنامه <Ic name="play" size={11} />
            </button>
          )}
          {v.fileData && <p className="text-[11px] text-slate-500 mt-1">فایل محلی (روی همین گوشی/مرورگر)</p>}
        </div>
        <div className="flex flex-col items-center gap-2 shrink-0 self-center">
          <button onClick={onToggleWatched} className="w-7 h-7 rounded-full flex items-center justify-center hover:scale-110 transition-transform" style={{ background: v.watched ? "#22D3EE" : "rgba(255,255,255,.08)" }}>
            {v.watched && <Ic name="check" size={14} color="#0A0A0A" strokeWidth={3} />}
          </button>
          <button onClick={() => onDelete(v.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/80 hover:bg-rose-500/10 hover:scale-110 transition-transform"><Ic name="trash" size={13} /></button>
        </div>
      </GlassCard>
      
      {/* مودال پخش ویدیو */}
      {showModal && v.videoId && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-rose-500 flex items-center justify-center transition-colors">
              <Ic name="x" size={20} className="text-white" />
            </button>
            <iframe 
              src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`} 
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={v.title}
            />
          </div>
        </div>
      )}
    </>
  );
}
function AddVideoModal({ onClose, onAdd }) {
  const [source, setSource] = useState("link"); // link | file
  const [url, setUrl] = useState(""), [title, setTitle] = useState(""), [watchAt, setWatchAt] = useState("");
  const [error, setError] = useState("");
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fileTooBig, setFileTooBig] = useState(false);
  const MAX_BYTES = 4 * 1024 * 1024; // ~4MB — safe for localStorage

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setFileTooBig(file.size > MAX_BYTES);
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (source === "link") {
      const videoId = parseYouTubeId(url.trim());
      if (!videoId) { setError("این لینک یوتیوب معتبر به نظر نمی‌رسه"); return; }
      onAdd({ videoId, url: url.trim(), title: title.trim() || "ویدیوی یوتیوب", watchAt, watched: false });
    } else {
      if (!fileData) { setError("یه فایل ویدیویی انتخاب کن"); return; }
      onAdd({ videoId: null, fileData, title: title.trim() || fileName || "ویدیوی محلی", watchAt, watched: false });
    }
    onClose();
  };

  return (
    <ModalShell title="افزودن ویدیو" onClose={onClose} onSubmit={submit}
      footer={<button type="submit" disabled={source === "link" ? !url.trim() : !fileData} className="w-full rounded-xl py-3 font-bold text-sm bg-gradient-to-l from-[#DB2777] to-[#C026D3] text-white disabled:opacity-30">افزودن</button>}>
      <div className="flex gap-2 mb-4">
        <Chip active={source === "link"} onClick={() => { setSource("link"); setError(""); }}>لینک یوتیوب</Chip>
        <Chip active={source === "file"} onClick={() => { setSource("file"); setError(""); }}>فایل از گوشی</Chip>
      </div>

      {source === "link" ? (
        <TextInput autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} placeholder="لینک ویدیوی یوتیوب" />
      ) : (
        <div className="mb-3">
          <label className="flex items-center justify-center gap-2 w-full border border-dashed border-white/15 rounded-xl py-4 text-sm text-slate-300 cursor-pointer">
            <Ic name="folder" size={16} />
            {fileName || "انتخاب ویدیو از گالری گوشی"}
            <input type="file" accept="video/*" onChange={onPickFile} className="hidden" />
          </label>
          {fileTooBig && <p className="text-[11px] text-pink-400 mt-2">این فایل حجمش زیاده — فقط تا وقتی این تب باز باشه قابل پخشه و بعد از بستن مرورگر ذخیره نمی‌مونه. برای ذخیره‌ی همیشگی، یه لینک (مثلاً یوتیوب) بهتره.</p>}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-400 -mt-2 mb-3">{error}</p>}
      <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان ویدیو (اختیاری)" />
      <p className="text-slate-400 text-xs mb-2">چه زمانی می‌خوام ببینم (اختیاری)</p>
      <input type="datetime-local" value={watchAt} onChange={(e) => setWatchAt(e.target.value)}
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-2 outline-none" />
    </ModalShell>
  );
}

function PodcastCard({ p, onToggleListened, onDelete }) {
  return (
    <GlassCard className="p-3 flex items-center gap-3 group hover:scale-[1.02] transition-all duration-300">
      {p.coverImage ? (
        <img src={p.coverImage} alt={p.title} className="w-11 h-11 rounded-lg object-cover shrink-0" onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
      ) : null}
      <div className={`w-11 h-11 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0 ${p.coverImage ? 'hidden' : 'flex'}`}>
        <Ic name="headphones" size={17} className="text-cyan-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-100 truncate">{p.title}</p>
        {p.listenAt && <p className="text-[11px] text-cyan-300 mt-0.5 flex items-center gap-1"><Ic name="clock" size={11} />{formatWhen(p.listenAt)}</p>}
        {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-[11px] text-fuchsia-300 flex items-center gap-1 mt-1">باز در اسپاتیفای <Ic name="external-link" size={11} /></a>}
        {p.fileData && <audio src={p.fileData} controls className="w-full h-8 mt-1.5" />}
      </div>
      <button onClick={onToggleListened} className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 hover:scale-110 transition-transform" style={{ background: p.listened ? "#22D3EE" : "rgba(255,255,255,.08)" }}>
        {p.listened && <Ic name="check" size={14} color="#0A0A0A" strokeWidth={3} />}
      </button>
      <button onClick={() => onDelete(p.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-rose-400/80 hover:bg-rose-500/10 shrink-0 hover:scale-110 transition-transform"><Ic name="trash" size={13} /></button>
    </GlassCard>
  );
}
function AddPodcastModal({ onClose, onAdd }) {
  const [source, setSource] = useState("link");
  const [link, setLink] = useState(""), [title, setTitle] = useState(""), [listenAt, setListenAt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fileTooBig, setFileTooBig] = useState(false);
  const [error, setError] = useState("");
  const MAX_BYTES = 4 * 1024 * 1024;

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setFileTooBig(file.size > MAX_BYTES);
    const reader = new FileReader();
    reader.onload = () => setFileData(reader.result);
    reader.readAsDataURL(file);
  };

  const onPickImage = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCoverImage(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (source === "file" && !fileData) { setError("یه فایل صوتی انتخاب کن"); return; }
    if (source === "link" && !title.trim()) { setError("یه عنوان بنویس"); return; }
    onAdd({ title: title.trim() || fileName || "پادکست", link: source === "link" ? link.trim() : "", fileData: source === "file" ? fileData : null, coverImage, listenAt, listened: false });
    onClose();
  };

  return (
    <ModalShell title="افزودن پادکست" onClose={onClose} onSubmit={submit}
      footer={<button type="submit" disabled={source === "file" ? !fileData : !title.trim()} className="w-full rounded-xl py-3 font-bold text-sm bg-gradient-to-l from-[#22D3EE] to-[#C026D3] text-white disabled:opacity-30">افزودن</button>}>
      <div className="flex gap-2 mb-4">
        <Chip active={source === "link"} onClick={() => { setSource("link"); setError(""); }}>لینک اسپاتیفای</Chip>
        <Chip active={source === "file"} onClick={() => { setSource("file"); setError(""); }}>فایل از گوشی</Chip>
      </div>
      {source === "link" ? (
        <TextInput autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="لینک اسپاتیفای" />
      ) : (
        <div className="mb-3">
          <label className="flex items-center justify-center gap-2 w-full border border-dashed border-white/15 rounded-xl py-4 text-sm text-slate-300 cursor-pointer">
            <Ic name="folder" size={16} />
            {fileName || "انتخاب فایل صوتی از گوشی"}
            <input type="file" accept="audio/*" onChange={onPickFile} className="hidden" />
          </label>
          {fileTooBig && <p className="text-[11px] text-pink-400 mt-2">حجم فایل زیاده — ممکنه بعد از بستن مرورگر ذخیره نمونه.</p>}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-400 mb-3">{error}</p>}
      
      {/* فیلد تصویر کاور */}
      <div className="mb-3">
        <label className="flex items-center justify-center gap-2 w-full border border-dashed border-white/15 rounded-xl py-3 text-sm text-slate-300 cursor-pointer hover:bg-white/5 transition-colors">
          <Ic name="image" size={16} />
          {coverImage ? "تصویر انتخاب شد" : "انتخاب تصویر کاور (اختیاری)"}
          <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
        </label>
        {coverImage && (
          <div className="mt-2 flex items-center gap-2">
            <img src={coverImage} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
            <button onClick={() => setCoverImage("")} className="text-xs text-rose-400 hover:text-rose-300">حذف تصویر</button>
          </div>
        )}
      </div>
      
      <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان اپیزود" />
      <p className="text-slate-400 text-xs mb-2">چه زمانی گوش بدم (اختیاری)</p>
      <input type="datetime-local" value={listenAt} onChange={(e) => setListenAt(e.target.value)}
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-2 outline-none" />
    </ModalShell>
  );
}

// smooth-ish cubic path through points (midpoint control -> gentle curve, cheap & good-looking)
function smoothSvgPath(points) {
  if (points.length < 2) return points.length ? `M ${points[0][0]} ${points[0][1]}` : "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

function SimpleBarChart({ data, xKey, yKey, color = "#C026D3", height = 140 }) {
  const gid = useId();
  const max = Math.max(...data.map((d) => d[yKey]), 1);
  return (
    <div style={{ height }} className="relative flex items-end gap-2.5 px-1">
      <svg width="0" height="0"><defs>
        <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
      </defs></svg>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <div key={f} className="absolute left-0 right-0 border-t border-white/[0.06]" style={{ bottom: `${f * 100}%` }} />
      ))}
      {data.map((d, i) => {
        const pct = Math.max((d[yKey] / max) * 100, 4);
        return (
          <div key={i} className="relative z-[1] flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
            <span className="text-[9px] font-bold text-slate-300">{d[yKey]}</span>
            <div className="w-full rounded-[7px] chart-bar-grow" style={{ height: `${pct}%`, background: `url(#bar-${gid}) ${color}`, backgroundImage: `linear-gradient(180deg, ${color}, ${color}59)`, boxShadow: `0 6px 16px -4px ${color}88, inset 0 1px 0 rgba(255,255,255,.35)`, animationDelay: `${i * 60}ms` }} />
            <span className="text-[9px] text-slate-500">{d[xKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function SimpleLineChart({ data, xKey, yKey, color = "#22D3EE", height = 140 }) {
  const gid = useId();
  const max = Math.max(...data.map((d) => d[yKey]), 1);
  const w = 300, pad = 10;
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const yFor = (v) => height - pad - (v / max) * (height - pad * 2);
  const pts = data.map((d, i) => [pad + i * stepX, yFor(d[yKey])]);
  const linePath = smoothSvgPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]} ${height - pad} L ${pts[0][0]} ${height - pad} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={pad} x2={w - pad} y1={height - pad - f * (height - pad * 2)} y2={height - pad - f * (height - pad * 2)} stroke="rgba(255,255,255,.06)" />
        ))}
        <path d={areaPath} fill={`url(#area-${gid})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color}aa)` }} pathLength="100" className="chart-line-draw" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill="#0A0A0A" stroke={color} strokeWidth="2" />)}
      </svg>
      <div className="flex justify-between mt-1 px-1">
        {data.map((d, i) => <span key={i} className="text-[9px] text-slate-500">{d[xKey]}</span>)}
      </div>
    </div>
  );
}

function SimpleHBarChart({ data }) {
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-[11px] text-slate-300 mb-1.5"><span className="font-medium">{d.name}</span><span className="font-bold" style={{ color: "#EAB4F2" }}>{d.pct}%</span></div>
          <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.04]">
            <div className="h-full rounded-full chart-bar-grow-h" style={{ width: `${d.pct}%`, background: "linear-gradient(90deg,#C026D3,#22D3EE)", boxShadow: "0 0 10px rgba(192,38,211,.5)", animationDelay: `${i * 80}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
function MiniBarChart(data, dataKey, color) {
  return <SimpleBarChart data={data} xKey="day" yKey={dataKey} color={color} height={140} />;
}

function StudyProgress({ books, videos, podcasts }) {
  const weekData = [{ day: "ش", pages: 12 }, { day: "ی", pages: 20 }, { day: "د", pages: 8 }, { day: "س", pages: 25 }, { day: "چ", pages: 15 }, { day: "پ", pages: 30 }, { day: "ج", pages: 18 }];
  const finished = books.filter((b) => b.status === "finished").length;
  const reading = books.filter((b) => b.status === "reading").length;
  const watchedVideos = videos.filter((v) => v.watched).length;
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <StatPill icon="book" label="کتاب تمام‌شده" value={finished} color="#C026D3" />
        <StatPill icon="trending-up" label="در حال مطالعه" value={reading} color="#22D3EE" />
      </div>
      <GlassCard className="p-4">
        <p className="text-xs font-bold text-slate-300 mb-2">صفحات خوانده‌شده — ۷ روز اخیر</p>
        {MiniBarChart(weekData, "pages", "#C026D3")}
      </GlassCard>
      <div className="flex gap-3">
        <StatPill icon="▶️" label="ویدیو دیده‌شده" value={watchedVideos} color="#C026D3" />
        <StatPill icon="headphones" label="پادکست تمام‌شده" value={podcasts.filter((p) => p.listened).length} color="#DB2777" />
      </div>
    </div>
  );
}

function StudyHub({ books, videos, podcasts, setBooks, setVideos, setPodcasts }) {
  const [sub, setSub] = useState("books");
  const [showAdd, setShowAdd] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  // آیتم‌های آرشیو شده (listened/watched)
  const archivedPodcasts = podcasts.filter(p => p.listened);
  const archivedVideos = videos.filter(v => v.watched);
  const activePodcasts = podcasts.filter(p => !p.listened);
  const activeVideos = videos.filter(v => !v.watched);

  return (
    <div className="space-y-4">
      <SubTabs value={sub} onChange={setSub} options={[["books", "کتاب‌ها", "book"], ["videos", "ویدیو", "play"], ["podcasts", "پادکست", "headphones"], ["progress", "پیشرفت", "trending-up"]]} />

      {sub === "books" && (
        <div>
          {books.length === 0 && <p className="text-xs text-slate-500 text-center py-4">هنوز کتابی اضافه نکردی</p>}
          <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
            {books.map((b) => (
              <BookCard key={b.id} book={b}
                onSetStatus={(id, status) => setBooks((p) => p.map((x) => x.id === id ? { ...x, status, pagesRead: status === "finished" ? x.pages : x.pagesRead } : x))}
                onAddPages={(id) => setBooks((p) => p.map((x) => x.id === id ? { ...x, pagesRead: Math.min(x.pages, x.pagesRead + 10) } : x))}
                onDelete={(id) => setBooks((p) => p.filter((x) => x.id !== id))} />
            ))}
          </div>
          <button onClick={() => setShowAdd(true)} className="w-full mt-2.5 rounded-xl py-3 text-sm font-medium text-slate-300 border border-dashed border-white/15 flex items-center justify-center gap-1.5"><Ic name="plus" size={15} /> افزودن کتاب</button>
        </div>
      )}

      {sub === "videos" && (
        <div>
          {activeVideos.length === 0 && archivedVideos.length === 0 && <p className="text-xs text-slate-500 text-center py-4">هنوز ویدیویی اضافه نکردی</p>}
          
          {/* ویدیوهای فعال */}
          {activeVideos.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-200">ویدیوهای در انتظار</h3>
              </div>
              <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
                {activeVideos.map((v) => <VideoCard key={v.id} v={v} onToggleWatched={() => setVideos((p) => p.map((x) => x.id === v.id ? { ...x, watched: !x.watched } : x))} onDelete={(id) => setVideos((p) => p.filter((x) => x.id !== id))} />)}
              </div>
            </>
          )}
          
          {/* دکمه نمایش آرشیو */}
          {archivedVideos.length > 0 && (
            <button onClick={() => setShowArchive(!showArchive)} className="w-full mt-2.5 rounded-xl py-2.5 text-sm font-medium text-cyan-300 border border-cyan-500/20 flex items-center justify-center gap-1.5 hover:bg-cyan-500/10 transition-colors">
              <Ic name={showArchive ? "eye-off" : "eye"} size={15} />
              {showArchive ? 'مخفی کردن ویدیوهای دیده‌شده' : `مشاهده ویدیوهای دیده‌شده (${archivedVideos.length})`}
            </button>
          )}
          
          {/* آرشیو ویدیوها */}
          {showArchive && archivedVideos.length > 0 && (
            <div className="mt-4 opacity-70">
              <h3 className="text-xs font-semibold text-slate-400 mb-2">آرشیو ویدیوهای دیده‌شده</h3>
              <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
                {archivedVideos.map((v) => <VideoCard key={v.id} v={v} onToggleWatched={() => setVideos((p) => p.map((x) => x.id === v.id ? { ...x, watched: !x.watched } : x))} onDelete={(id) => setVideos((p) => p.filter((x) => x.id !== id))} />)}
              </div>
            </div>
          )}
          
          <button onClick={() => setShowAdd(true)} className="w-full mt-2.5 rounded-xl py-3 text-sm font-medium text-slate-300 border border-dashed border-white/15 flex items-center justify-center gap-1.5"><Ic name="plus" size={15} /> افزودن ویدیو</button>
        </div>
      )}

      {sub === "podcasts" && (
        <div>
          {activePodcasts.length === 0 && archivedPodcasts.length === 0 && <p className="text-xs text-slate-500 text-center py-4">هنوز پادکستی اضافه نکردی</p>}
          
          {/* پادکست‌های فعال */}
          {activePodcasts.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-200">پادکست‌های در انتظار</h3>
              </div>
              <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
                {activePodcasts.map((p) => <PodcastCard key={p.id} p={p} onToggleListened={() => setPodcasts((prev) => prev.map((x) => x.id === p.id ? { ...x, listened: !x.listened } : x))} onDelete={(id) => setPodcasts((prev) => prev.filter((x) => x.id !== id))} />)}
              </div>
            </>
          )}
          
          {/* دکمه نمایش آرشیو */}
          {archivedPodcasts.length > 0 && (
            <button onClick={() => setShowArchive(!showArchive)} className="w-full mt-2.5 rounded-xl py-2.5 text-sm font-medium text-cyan-300 border border-cyan-500/20 flex items-center justify-center gap-1.5 hover:bg-cyan-500/10 transition-colors">
              <Ic name={showArchive ? "eye-off" : "eye"} size={15} />
              {showArchive ? 'مخفی کردن پادکست‌های شنیده‌شده' : `مشاهده پادکست‌های شنیده‌شده (${archivedPodcasts.length})`}
            </button>
          )}
          
          {/* آرشیو پادکست‌ها */}
          {showArchive && archivedPodcasts.length > 0 && (
            <div className="mt-4 opacity-70">
              <h3 className="text-xs font-semibold text-slate-400 mb-2">آرشیو پادکست‌های شنیده‌شده</h3>
              <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3">
                {archivedPodcasts.map((p) => <PodcastCard key={p.id} p={p} onToggleListened={() => setPodcasts((prev) => prev.map((x) => x.id === p.id ? { ...x, listened: !x.listened } : x))} onDelete={(id) => setPodcasts((prev) => prev.filter((x) => x.id !== id))} />)}
              </div>
            </div>
          )}
          
          <button onClick={() => setShowAdd(true)} className="w-full mt-2.5 rounded-xl py-3 text-sm font-medium text-slate-300 border border-dashed border-white/15 flex items-center justify-center gap-1.5"><Ic name="plus" size={15} /> افزودن پادکست</button>
        </div>
      )}

      {sub === "progress" && <StudyProgress books={books} videos={videos} podcasts={podcasts} />}

      {showAdd && sub === "books" && <AddBookModal onClose={() => setShowAdd(false)} onAdd={(b) => setBooks((p) => [{ id: uid(), ...b }, ...p])} />}
      {showAdd && sub === "videos" && <AddVideoModal onClose={() => setShowAdd(false)} onAdd={(v) => setVideos((p) => [{ id: uid(), ...v }, ...p])} />}
      {showAdd && sub === "podcasts" && <AddPodcastModal onClose={() => setShowAdd(false)} onAdd={(pc) => setPodcasts((p) => [{ id: uid(), ...pc }, ...p])} />}
    </div>
  );
}

// ============ Fitness (bug fixes: fields now match exercise type; separate strength/cardio stats) ============
const EXERCISE_TYPES = [
  { id: "قدرتی", mode: "sets" }, { id: "کششی", mode: "sets" },
  { id: "کاردیو", mode: "duration" }, { id: "دویدن", mode: "duration" },
];
function FitnessProgress({ exercises }) {
  const weekData = [{ day: "ش", volume: 240 }, { day: "ی", volume: 300 }, { day: "د", volume: 180 }, { day: "س", volume: 420 }, { day: "چ", volume: 260 }, { day: "پ", volume: 500 }, { day: "ج", volume: 320 }];
  const strengthVolume = exercises.reduce((s, e) => s + (e.mode === "sets" ? e.sets * e.reps : 0), 0);
  const cardioMinutes = exercises.reduce((s, e) => s + (e.mode === "duration" ? e.duration : 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <StatPill icon="dumbbell" label="حجم قدرتی" value={strengthVolume} color="#C026D3" />
        <StatPill icon="flame" label="دقایق کاردیو" value={cardioMinutes} color="#DB2777" />
      </div>
      <GlassCard className="p-4">
        <p className="text-xs font-bold text-slate-300 mb-2">حجم تمرین هفتگی</p>
        <SimpleLineChart data={weekData} xKey="day" yKey="volume" color="#22D3EE" height={140} />
      </GlassCard>
    </div>
  );
}
function FitnessHub({ exercises, setExercises }) {
  const [sub, setSub] = useState("log");
  const [showAdd, setShowAdd] = useState(false);
  const [moodFor, setMoodFor] = useState(null);
  const streak = 5;

  return (
    <div className="space-y-4">
      <SubTabs value={sub} onChange={setSub} options={[["log", "تمرین", "dumbbell"], ["progress", "پیشرفت", "trending-up"]]} />

      {sub === "log" && (
        <div className="space-y-4">
          <StatPill icon="flame" label="استریک ورزش" value={`${streak} روز`} color="#DB2777" />
          <GlassCard className="p-4">
            {exercises.length === 0 && <p className="text-xs text-slate-500 text-center py-4">هنوز تمرینی اضافه نکردی</p>}
            {exercises.map((e) => (
              <div key={e.id} className="py-2.5 border-b border-white/[0.05] last:border-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => { const willBeDone = !e.done; setExercises((p) => p.map((x) => x.id === e.id ? { ...x, done: willBeDone } : x)); if (willBeDone) setMoodFor(e.id); }}
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: e.done ? "#22D3EE" : "rgba(255,255,255,.25)", background: e.done ? "#22D3EE" : "transparent" }}>
                    {e.done && <Ic name="check" size={14} color="#0A0A0A" strokeWidth={3} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${e.done ? "text-slate-500 line-through" : "text-slate-100"}`}>{e.name}</p>
                    <p className="text-[11px] text-slate-500">{e.mode === "sets" ? `${e.sets}×${e.reps}` : `${e.duration} دقیقه`}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-md bg-white/[0.05] text-slate-400">{e.type}</span>
                  <button onClick={() => setExercises((p) => p.filter((x) => x.id !== e.id))} className="w-6 h-6 rounded-md flex items-center justify-center text-rose-400/80 hover:bg-rose-500/10 shrink-0"><Ic name="trash" size={12} /></button>
                </div>
                {moodFor === e.id && (
                  <div className="flex items-center gap-2 mt-2 mr-9">
                    <span className="text-[11px] text-slate-400">حس بعد از تمرین:</span>
                    {["😞", "😐", "🙂", "💪", "🔥"].map((em, i) => (
                      <button key={i} onClick={() => { setExercises((p) => p.map((x) => x.id === e.id ? { ...x, mood: i + 1 } : x)); setMoodFor(null); }} className="text-lg">{em}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </GlassCard>
          <button onClick={() => setShowAdd(true)} className="w-full rounded-xl py-3 text-sm font-medium text-slate-300 border border-dashed border-white/15 flex items-center justify-center gap-1.5"><Ic name="plus" size={15} /> افزودن تمرین</button>
        </div>
      )}

      {sub === "progress" && <FitnessProgress exercises={exercises} />}

      {showAdd && <AddExerciseModal onClose={() => setShowAdd(false)} onAdd={(ex) => setExercises((p) => [{ id: uid(), done: false, mood: null, ...ex }, ...p])} />}
    </div>
  );
}
function AddExerciseModal({ onClose, onAdd }) {
  const [name, setName] = useState(""), [type, setType] = useState("قدرتی");
  const [sets, setSets] = useState(3), [reps, setReps] = useState(10), [duration, setDuration] = useState(20);
  const mode = EXERCISE_TYPES.find((t) => t.id === type).mode;
  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), type, mode, sets: mode === "sets" ? sets : 0, reps: mode === "sets" ? reps : 0, duration: mode === "duration" ? duration : 0 });
    onClose();
  };
  return (
    <ModalShell title="تمرین جدید" onClose={onClose} onSubmit={submit}
      footer={<button type="submit" disabled={!name.trim()} className="w-full rounded-xl py-3 font-bold text-sm bg-gradient-to-l from-[#67E8F9] to-[#22D3EE] text-white disabled:opacity-30">افزودن</button>}>
      <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="نام تمرین — مثلاً بارفیکس" />
      <div className="flex gap-2 mb-4 flex-wrap">
        {EXERCISE_TYPES.map((t) => <Chip key={t.id} active={type === t.id} onClick={() => setType(t.id)}>{t.id}</Chip>)}
      </div>
      {mode === "sets" ? (
        <div className="flex gap-2 mb-2">
          <div className="flex-1"><p className="text-slate-400 text-[11px] mb-1">تعداد ست</p><input type="number" value={sets} onChange={(e) => setSets(Number(e.target.value))} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" /></div>
          <div className="flex-1"><p className="text-slate-400 text-[11px] mb-1">تکرار در هر ست</p><input type="number" value={reps} onChange={(e) => setReps(Number(e.target.value))} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" /></div>
        </div>
      ) : (
        <div className="mb-2"><p className="text-slate-400 text-[11px] mb-1">مدت زمان (دقیقه)</p><input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" /></div>
      )}
    </ModalShell>
  );
}

// ============ Learning projects ============
function ChecklistSection({ items, onToggle, onAdd, onDelete, placeholder }) {
  const [val, setVal] = useState("");
  const done = items.filter((i) => i.done).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-2"><span className="text-[11px] text-slate-500">{done}/{items.length} تکمیل‌شده</span></div>
      <div className="space-y-1.5 mb-2">
        {items.map((i) => (
          <div key={i.id} className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
            <button onClick={() => onToggle(i.id)} className="flex items-center gap-2 flex-1 text-right min-w-0">
              <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: i.done ? "#22D3EE" : "rgba(255,255,255,.25)", background: i.done ? "#22D3EE" : "transparent" }}>
                {i.done && <Ic name="check" size={10} color="#0A0A0A" strokeWidth={3} />}
              </span>
              <span className={`text-xs flex-1 truncate ${i.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{i.title}</span>
            </button>
            <button onClick={() => onDelete(i.id)} className="shrink-0 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={12} /></button>
          </div>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (val.trim()) { onAdd(val.trim()); setVal(""); } }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder}
          className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none" />
        <button type="submit" className="px-3 rounded-lg bg-fuchsia-500/20 text-fuchsia-300"><Ic name="plus" size={14} /></button>
      </form>
    </div>
  );
}
function ResourceAdder({ onAdd }) {
  const [title, setTitle] = useState(""), [link, setLink] = useState(""), [type, setType] = useState("video"), [watchAt, setWatchAt] = useState("");
  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), link: link.trim(), type, watchAt });
    setTitle(""); setLink(""); setWatchAt("");
  };
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex gap-2 flex-wrap">
        {[["video", "ویدیو"], ["playlist", "پلی‌لیست"], ["book", "کتاب"], ["podcast", "پادکست"], ["article", "مقاله"]].map(([v, l]) => <Chip key={v} active={type === v} onClick={() => setType(v)}>{l}</Chip>)}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان منبع"
        className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none" />
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="لینک (اختیاری)"
        className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none" />
      <div className="flex items-center gap-2">
        <input type="datetime-local" value={watchAt} onChange={(e) => setWatchAt(e.target.value)} className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none" />
        <button type="submit" className="px-3 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 shrink-0"><Ic name="plus" size={14} /></button>
      </div>
    </form>
  );
}
function LearningProgress({ projects }) {
  const data = projects.map((p) => {
    const all = [...p.practice, ...p.milestones];
    const pct = all.length ? Math.round((all.filter((i) => i.done).length / all.length) * 100) : 0;
    return { name: p.title.length > 8 ? p.title.slice(0, 8) + "…" : p.title, pct };
  });
  return (
    <GlassCard className="p-4">
      <p className="text-xs font-bold text-slate-300 mb-2">پیشرفت پروژه‌ها</p>
      <SimpleHBarChart data={data} />
    </GlassCard>
  );
}
function LearningHub({ projects, setProjects }) {
  const [activeId, setActiveId] = useState(projects[0]?.id ?? null);
  const [sub, setSub] = useState("resources");
  const [showNewProject, setShowNewProject] = useState(false);
  const project = projects.find((p) => p.id === activeId);
  const updateProject = (fn) => setProjects((prev) => prev.map((p) => (p.id === activeId ? fn(p) : p)));
  const progress = (p) => { const all = [...p.practice, ...p.milestones]; return all.length ? Math.round((all.filter((i) => i.done).length / all.length) * 100) : 0; };

  if (!project) {
    return (
      <div className="space-y-3">
        <GlassCard className="p-8 flex flex-col items-center text-center"><Ic name="graduation-cap" size={26} className="text-fuchsia-300 mb-2" /><p className="text-slate-300 text-sm">هنوز پروژه یادگیری نساختی</p></GlassCard>
        <button onClick={() => setShowNewProject(true)} className="w-full rounded-xl py-3 text-sm font-medium text-slate-300 border border-dashed border-white/15 flex items-center justify-center gap-1.5"><Ic name="plus" size={15} /> پروژه جدید</button>
        {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onAdd={(title) => { const p = { id: uid(), title, resources: [], practice: [], milestones: [] }; setProjects([p]); setActiveId(p.id); setShowNewProject(false); }} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {projects.map((p) => (
          <button key={p.id} onClick={() => setActiveId(p.id)} className="shrink-0 rounded-xl px-3 py-2 text-xs font-medium border"
            style={{ borderColor: p.id === activeId ? "#C026D3" : "rgba(255,255,255,.1)", background: p.id === activeId ? "rgba(192,38,211,.15)" : "rgba(255,255,255,.03)", color: p.id === activeId ? "#EAB4F2" : "#94a3b8" }}>
            {p.title}
          </button>
        ))}
        <button onClick={() => setShowNewProject(true)} className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center"><Ic name="plus" size={15} className="text-slate-400" /></button>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-white">{project.title}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fuchsia-300 font-bold">{progress(project)}%</span>
            <button onClick={() => { setProjects((prev) => prev.filter((p) => p.id !== project.id)); setActiveId(null); }} className="text-rose-400/80 hover:text-rose-400"><Ic name="trash" size={14} /></button>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${progress(project)}%`, background: "linear-gradient(90deg,#C026D3,#22D3EE)" }} /></div>
      </GlassCard>

      <SubTabs value={sub} onChange={setSub} options={[["resources", "آموزش"], ["practice", "تمرین"], ["milestones", "نقاط عطف"], ["progress", "پیشرفت", "trending-up"]]} />

      {sub === "resources" && (
        <GlassCard className="p-4">
          <div className="space-y-1.5 mb-3">
            {project.resources.length === 0 && <p className="text-[11px] text-slate-600">منبعی اضافه نشده</p>}
            {project.resources.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
                {r.type === "video" || r.type === "playlist" ? <Ic name="play" size={13} className="text-red-400 shrink-0" /> : r.type === "podcast" ? <Ic name="headphones" size={13} className="text-cyan-300 shrink-0" /> : <Ic name="book" size={13} className="text-fuchsia-300 shrink-0" />}
                <span className="text-xs text-slate-200 flex-1 truncate">{r.title}</span>
                {r.watchAt && <span className="text-[10px] text-cyan-300 shrink-0">{formatWhen(r.watchAt)}</span>}
                {r.link && <a href={r.link} target="_blank" rel="noreferrer" className="shrink-0"><Ic name="external-link" size={12} className="text-slate-400" /></a>}
                <button onClick={() => updateProject((p) => ({ ...p, resources: p.resources.filter((x) => x.id !== r.id) }))} className="shrink-0 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={12} /></button>
              </div>
            ))}
          </div>
          <ResourceAdder onAdd={(r) => updateProject((p) => ({ ...p, resources: [{ id: uid(), ...r }, ...p.resources] }))} />
        </GlassCard>
      )}
      {sub === "practice" && (
        <GlassCard className="p-4">
          <ChecklistSection items={project.practice} placeholder="تمرین جدید — مثلاً ساخت اسکریپت پورت‌اسکنر"
            onToggle={(id) => updateProject((p) => ({ ...p, practice: p.practice.map((i) => i.id === id ? { ...i, done: !i.done } : i) }))}
            onAdd={(title) => updateProject((p) => ({ ...p, practice: [...p.practice, { id: uid(), title, done: false }] }))}
            onDelete={(id) => updateProject((p) => ({ ...p, practice: p.practice.filter((i) => i.id !== id) }))} />
        </GlassCard>
      )}
      {sub === "milestones" && (
        <GlassCard className="p-4">
          <ChecklistSection items={project.milestones} placeholder="نقطه عطف جدید — مثلاً ساخت پروژه اول"
            onToggle={(id) => updateProject((p) => ({ ...p, milestones: p.milestones.map((i) => i.id === id ? { ...i, done: !i.done } : i) }))}
            onAdd={(title) => updateProject((p) => ({ ...p, milestones: [...p.milestones, { id: uid(), title, done: false }] }))}
            onDelete={(id) => updateProject((p) => ({ ...p, milestones: p.milestones.filter((i) => i.id !== id) }))} />
        </GlassCard>
      )}
      {sub === "progress" && <LearningProgress projects={projects} />}

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onAdd={(title) => { const p = { id: uid(), title, resources: [], practice: [], milestones: [] }; setProjects((prev) => [...prev, p]); setActiveId(p.id); setShowNewProject(false); }} />}
    </div>
  );
}
function NewProjectModal({ onClose, onAdd }) {
  const [title, setTitle] = useState("");
  const submit = () => { if (title.trim()) onAdd(title.trim()); };
  return (
    <ModalShell title="پروژه یادگیری جدید" onClose={onClose} onSubmit={submit}
      footer={<button type="submit" disabled={!title.trim()} className="w-full rounded-xl py-3 font-bold text-sm bg-gradient-to-l from-[#C026D3] to-[#DB2777] text-white disabled:opacity-30">ایجاد پروژه</button>}>
      <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً یادگیری امنیت شبکه" />
    </ModalShell>
  );
}

// ============ Planning (nested: daypart -> group/context -> tasks) + Goals ============
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = ["ی", "د", "س", "چ", "پ", "ج", "ش"][d.getDay()];
    out.push({ key, label });
  }
  return out;
}
// Live Persian date label, e.g. "یکشنبه، ۲۱ تیر" — computed from the real
// current date (not hardcoded), using the browser's built-in Persian calendar.
function getPersianDateLabel(now) {
  try {
    const dayNames = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
    const dayName = dayNames[now.getDay()];
    const formatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long" });
    return `${dayName}، ${formatter.format(now)}`;
  } catch (e) {
    return now.toLocaleDateString("fa-IR");
  }
}
function daysBetweenKeys(dateKey1, dateKey2) {
  const d1 = new Date(dateKey1 + "T00:00:00");
  const d2 = new Date(dateKey2 + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
}

function GroupCard({ group, onAddTask, onToggleTask, onDeleteTask, onDeleteGroup }) {
  const [taskTitle, setTaskTitle] = useState("");
  const [priority, setPriority] = useState(2);
  const submit = () => {
    if (!taskTitle.trim()) return;
    onAddTask({ id: uid(), title: taskTitle.trim(), priority, done: false });
    setTaskTitle("");
  };
  const done = group.tasks.filter((t) => t.done).length;
  return (
    <GlassCard className="p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-slate-100 flex items-center gap-1.5"><Ic name="location" size={13} className="text-fuchsia-300" />{group.name}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{done}/{group.tasks.length}</span>
          <button onClick={onDeleteGroup} className="text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={12} /></button>
        </div>
      </div>
      <div className="space-y-1.5 mb-2">
        {group.tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
            <button onClick={() => onToggleTask(t.id)} className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
              style={{ borderColor: t.done ? "#22D3EE" : "rgba(255,255,255,.25)", background: t.done ? "#22D3EE" : "transparent" }}>
              {t.done && <Ic name="check" size={9} color="#0A0A0A" strokeWidth={3} />}
            </button>
            <span className={`text-xs flex-1 truncate ${t.done ? "text-slate-500 line-through" : "text-slate-200"}`}>{t.title}</span>
            <PriorityBars level={t.priority} />
            <button onClick={() => onDeleteTask(t.id)} className="shrink-0 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={11} /></button>
          </div>
        ))}
      </div>
      <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="کار جدید توی این بخش..."
          className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none" />
        <div className="flex gap-1">
          {PRIORITIES.map((p) => <Chip key={p.level} active={priority === p.level} color="#DB2777" onClick={() => setPriority(p.level)}>{p.level}</Chip>)}
        </div>
        <button type="submit" className="shrink-0 px-2.5 py-1.5 rounded-lg bg-fuchsia-500/20 text-fuchsia-300"><Ic name="plus" size={13} /></button>
      </form>
    </GlassCard>
  );
}

function DaypartSection({ id, label, groups, onChange }) {
  const [open, setOpen] = useState(true);
  const [groupName, setGroupName] = useState("");

  const addGroup = () => {
    if (!groupName.trim()) return;
    onChange([...groups, { id: uid(), name: groupName.trim(), tasks: [] }]);
    setGroupName("");
  };
  const updateGroup = (gid, fn) => onChange(groups.map((g) => g.id === gid ? fn(g) : g));
  const deleteGroup = (gid) => onChange(groups.filter((g) => g.id !== gid));

  const totalTasks = groups.reduce((s, g) => s + g.tasks.length, 0);
  const doneTasks = groups.reduce((s, g) => s + g.tasks.filter((t) => t.done).length, 0);

  return (
    <GlassCard className="overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Ic name={{ morning: "sunrise", noon: "sun", evening: "sunset", night: "moon" }[id]} size={16} /> {label}
        </span>
        <span className="text-[11px] text-slate-500">{doneTasks}/{totalTasks} · {open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {groups.length === 0 && <p className="text-[11px] text-slate-600 px-1">هنوز بخشی اضافه نکردی — مثلاً «کتابخانه» یا «خونه»</p>}
          {groups.map((g) => (
            <GroupCard key={g.id} group={g}
              onAddTask={(t) => updateGroup(g.id, (gr) => ({ ...gr, tasks: [...gr.tasks, t] }))}
              onToggleTask={(tid) => updateGroup(g.id, (gr) => ({ ...gr, tasks: gr.tasks.map((t) => t.id === tid ? { ...t, done: !t.done } : t) }))}
              onDeleteTask={(tid) => updateGroup(g.id, (gr) => ({ ...gr, tasks: gr.tasks.filter((t) => t.id !== tid) }))}
              onDeleteGroup={() => deleteGroup(g.id)} />
          ))}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addGroup(); }}>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="بخش جدید — مثلاً کتابخانه"
              className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none" />
            <button type="submit" className="px-3 rounded-lg bg-fuchsia-500/20 text-fuchsia-300"><Ic name="plus" size={14} /></button>
          </form>
        </div>
      )}
    </GlassCard>
  );
}

function GoalsView({ goals, setGoals }) {
  const [hoursInput, setHoursInput] = useState(String(goals.log[todayKey()] || ""));
  const days = lastNDays(7);
  const max = Math.max(goals.targetHours, ...days.map((d) => goals.log[d.key] || 0), 1);

  const saveTarget = (v) => setGoals((g) => ({ ...g, targetHours: v }));
  const logToday = () => {
    const h = Number(hoursInput);
    if (isNaN(h) || h < 0) return;
    setGoals((g) => ({ ...g, log: { ...g.log, [todayKey()]: h } }));
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <p className="text-xs text-slate-400 mb-2">هدف مطالعه‌ی روزانه (ساعت)</p>
        <div className="flex gap-2">
          {[1, 1.5, 2, 3, 4].map((h) => (
            <Chip key={h} active={goals.targetHours === h} color="#22D3EE" onClick={() => saveTarget(h)}>{h} ساعت</Chip>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <p className="text-xs text-slate-400 mb-2">امروز چقدر مطالعه کردی؟</p>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); logToday(); }}>
          <input type="number" step="0.5" value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} placeholder="مثلاً 2"
            className="flex-1 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none" />
          <button type="submit" className="px-5 rounded-xl bg-gradient-to-l from-[#22D3EE] to-[#C026D3] text-white text-sm font-bold">ثبت</button>
        </form>
        {goals.log[todayKey()] !== undefined && (
          <p className="text-[11px] mt-2" style={{ color: goals.log[todayKey()] >= goals.targetHours ? "#22D3EE" : "#DB2777" }}>
            {goals.log[todayKey()] >= goals.targetHours ? "✔️ امروز به هدفت رسیدی" : `هنوز ${(goals.targetHours - goals.log[todayKey()]).toFixed(1)} ساعت مونده`}
          </p>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <p className="text-xs font-bold text-slate-300 mb-3">ساعت مطالعه — ۷ روز اخیر (هدف: {goals.targetHours} ساعت)</p>
        <div style={{ height: 140 }} className="flex items-end gap-2 px-1">
          {days.map((d) => {
            const val = goals.log[d.key] || 0;
            const hit = val >= goals.targetHours;
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <span className="text-[9px] text-slate-500">{val || ""}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max((val / max) * 100, val > 0 ? 6 : 2)}%`, background: val === 0 ? "rgba(255,255,255,.08)" : hit ? "#22D3EE" : "#DB2777" }} />
                <span className="text-[9px] text-slate-500">{d.label}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}

function PlanningHub({ planning, setPlanning, goals, setGoals }) {
  const [sub, setSub] = useState("plan");
  return (
    <div className="space-y-4">
      <SubTabs value={sub} onChange={setSub} options={[["plan", "برنامه روزانه"], ["goals", "اهداف", "trending-up"]]} />
      {sub === "plan" && (
        <div className="space-y-3">
          {DAYPARTS.map((dp) => (
            <DaypartSection key={dp.id} id={dp.id} label={dp.label} groups={planning[dp.id] || []}
              onChange={(groups) => setPlanning((p) => ({ ...p, [dp.id]: groups }))} />
          ))}
        </div>
      )}
      {sub === "goals" && <GoalsView goals={goals} setGoals={setGoals} />}
    </div>
  );
}

// ============ Desktop-only: richer weekly analytics ============
function WeeklyOverviewChart({ goals, tasks }) {
  const days = lastNDays(7);
  const studySeries = days.map((d) => goals.log[d.key] || 0);
  // No historical day-by-day task/exercise log exists yet, so these two series
  // are illustrative trend shapes anchored to today's real numbers.
  const todayTasks = tasks.filter((t) => t.status === "done").length;
  const taskSeries = [3, 4, 2, 5, todayTasks, 6, todayTasks].map((v, i) => (i === 4 || i === 6 ? todayTasks : v));
  const exerciseSeries = [1, 0, 1, 1, 0, 1, 1];

  const gid = useId();
  const w = 640, h = 220, padX = 30, padY = 20;
  const maxVal = Math.max(...studySeries, ...taskSeries, 6, 1);
  const stepX = (w - padX * 2) / (days.length - 1);
  const yFor = (v) => h - padY - (v / maxVal) * (h - padY * 2);
  const ptsFor = (series) => series.map((v, i) => [padX + i * stepX, yFor(v)]);

  const series = [
    { data: studySeries, color: "#22D3EE", label: "ساعت مطالعه" },
    { data: taskSeries, color: "#C026D3", label: "تسک انجام‌شده" },
    { data: exerciseSeries, color: "#DB2777", label: "جلسه‌ی تمرین" },
  ];

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm font-bold text-slate-200">نمای کلی هفته</p>
        <div className="flex items-center gap-2 flex-wrap">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-300 rounded-full px-2.5 py-1 border border-white/[0.06]" style={{ background: `${s.color}14` }}>
              <span className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }} /> {s.label}
            </div>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        <defs>
          <linearGradient id={`weekarea-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0].color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padX} x2={w - padX} y1={h - padY - f * (h - padY * 2)} y2={h - padY - f * (h - padY * 2)} stroke="rgba(255,255,255,.06)" />
        ))}
        {(() => {
          const pts = ptsFor(series[0].data);
          const line = smoothSvgPath(pts);
          const area = `${line} L ${pts[pts.length - 1][0]} ${h - padY} L ${pts[0][0]} ${h - padY} Z`;
          return <path d={area} fill={`url(#weekarea-${gid})`} stroke="none" />;
        })()}
        {series.map((s) => {
          const pts = ptsFor(s.data);
          return (
            <g key={s.label}>
              <path d={smoothSvgPath(pts)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength="100" className="chart-line-draw" style={{ filter: `drop-shadow(0 0 4px ${s.color}99)` }} />
              {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#0A0A0A" stroke={s.color} strokeWidth="2" />)}
            </g>
          );
        })}
        {days.map((d, i) => (
          <text key={d.key} x={padX + i * stepX} y={h - 2} textAnchor="middle" fontSize="10" fill="#64748b">{d.label}</text>
        ))}
      </svg>
    </GlassCard>
  );
}

// ============ Backup management: download (existing) + upload/restore (new) ============
const BACKUPS_KEY = "lifeflow_backups_v1";
const MAX_BACKUP_BYTES = 3 * 1024 * 1024; // 3MB safety cap for localStorage
const BACKUP_DATA_KEYS = ["tasks", "books", "videos", "podcasts", "exercises", "projects", "planning", "goals", "journal"];

function loadBackupsList() {
  try {
    const raw = storage.get(BACKUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}
function saveBackupsList(list) {
  try {
    storage.set(BACKUPS_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false; // most likely a quota error — surfaced to the user by the caller
  }
}
// Basic structural validation: valid JSON, an object, and containing at least
// one of the fields a real LifeFlow backup would have.
function validateBackupShape(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "این فایل یک بکاپ معتبر نیست (ساختار JSON درستی نداره).";
  }
  const hasKnownKey = BACKUP_DATA_KEYS.some((k) => k in parsed);
  if (!hasKnownKey) {
    return "این فایل شبیه بکاپ زندگی‌آرام نیست — هیچ‌کدوم از بخش‌های آشنا (تسک، کتاب، ...) توش نبود.";
  }
  return null; // valid
}
function humanFileSize(bytes) {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}
function formatBackupDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
  } catch (e) {
    return iso;
  }
}

function BackupModal({ onClose, currentData, onRestore, onDownload }) {
  const [backups, setBackups] = useState(() => loadBackupsList());
  const [selectedId, setSelectedId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = React.useRef(null);

  const persist = (list) => {
    setBackups(list);
    const ok = saveBackupsList(list);
    if (!ok) setError("حافظه‌ی مرورگر پره — یه بکاپ قدیمی رو حذف کن و دوباره امتحان کن.");
  };

  const addBackupEntry = (name, source, data) => {
    const entry = { id: uid(), name, source, createdAt: new Date().toISOString(), data };
    const next = [entry, ...backups];
    persist(next);
    setSuccess(source === "upload" ? "بکاپ با موفقیت آپلود شد." : "نسخه‌ی فعلی ذخیره شد.");
    setError("");
  };

  const handleFile = (file) => {
    setError(""); setSuccess("");
    if (!file) return;
    const looksLikeJson = file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
    if (!looksLikeJson) { setError("فقط فایل JSON قابل قبوله."); return; }
    if (file.size > MAX_BACKUP_BYTES) { setError(`حجم فایل بیشتر از حد مجازه (حداکثر ${humanFileSize(MAX_BACKUP_BYTES)}).`); return; }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        setUploading(false);
        setError("فایل قابل خوندن نیست — یه JSON خراب یا ناقصه.");
        return;
      }
      const shapeError = validateBackupShape(parsed);
      if (shapeError) {
        setUploading(false);
        setError(shapeError);
        return;
      }
      addBackupEntry(file.name.replace(/\.json$/i, ""), "upload", parsed);
      setUploading(false);
    };
    reader.onerror = () => { setUploading(false); setError("خطا در خوندن فایل."); };
    reader.readAsText(file);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragActive(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  };

  const saveCurrentAsBackup = () => {
    const name = `نسخه‌ی ${new Date().toLocaleDateString("fa-IR")}`;
    addBackupEntry(name, "manual", currentData);
  };

  const deleteBackup = (id) => {
    persist(backups.filter((b) => b.id !== id));
    if (String(selectedId) === String(id)) setSelectedId("");
  };

  const [restored, setRestored] = useState(false);
  const restoreSelected = () => {
    // b.id comes from uid() (a number); selectedId always comes back as a
    // string from the native <select> element — String() avoids that mismatch.
    const backup = backups.find((b) => String(b.id) === String(selectedId));
    if (!backup) return;
    onRestore(backup.data);
    setConfirming(false);
    setRestored(true);
    setSuccess("بازگردانی انجام شد.");
    setTimeout(() => { onClose(); }, 1100); // close so the restored data is immediately visible behind the modal
  };

  return (
    <ModalShell title="مدیریت بکاپ" onClose={onClose}>
      {/* Download current data — existing feature, unchanged */}
      <button type="button" onClick={onDownload} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 mb-4 text-sm font-semibold bg-white/[0.05] border border-white/10 hover:bg-white/10 transition">
        <Ic name="download" size={15} /> دانلود بکاپ فعلی
      </button>

      {/* Save current state as a restorable snapshot */}
      <button type="button" onClick={saveCurrentAsBackup} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 mb-5 text-sm font-semibold text-white transition" style={{ background: "linear-gradient(135deg,#22D3EE,#C026D3)" }}>
        <Ic name="plus" size={15} /> ذخیره‌ی نسخه‌ی فعلی
      </button>

      <p className="text-xs text-slate-400 mb-2">آپلود فایل بکاپ</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        className="w-full border border-dashed rounded-xl py-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition mb-2"
        style={{ borderColor: dragActive ? "#C026D3" : "rgba(255,255,255,.15)", background: dragActive ? "rgba(192,38,211,.08)" : "transparent" }}
      >
        <Ic name="folder" size={22} className="text-slate-400" />
        <p className="text-xs text-slate-300">فایل بکاپ (.json) رو بکش اینجا، یا کلیک کن</p>
        <p className="text-[10px] text-slate-500">حداکثر {humanFileSize(MAX_BACKUP_BYTES)}</p>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
      </div>

      {uploading && <p className="text-xs text-cyan-300 mb-3">در حال بررسی فایل...</p>}
      {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}
      {success && <p className="text-xs text-cyan-300 mb-3">{success}</p>}

      <p className="text-xs text-slate-400 mt-4 mb-2">بکاپ‌های ذخیره‌شده ({backups.length})</p>
      {backups.length === 0 && <p className="text-[11px] text-slate-600 mb-3">هنوز بکاپی آپلود یا ذخیره نکردی.</p>}
      <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
        {backups.map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2 bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0" style={{ background: b.source === "upload" ? "rgba(34,211,238,.15)" : "rgba(192,38,211,.15)", color: b.source === "upload" ? "#22D3EE" : "#EAB4F2" }}>
              {b.source === "upload" ? "آپلودشده" : "دستی"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-200 truncate">{b.name}</p>
              <p className="text-[10px] text-slate-500">{formatBackupDate(b.createdAt)}</p>
            </div>
            <button type="button" onClick={() => deleteBackup(b.id)} className="shrink-0 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={13} /></button>
          </div>
        ))}
      </div>

      {backups.length > 0 && (
        <>
          <p className="text-xs text-slate-400 mb-2">انتخاب نسخه برای بازگردانی</p>
          <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setConfirming(false); }}
            className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-white text-sm mb-3 outline-none">
            <option value="" className="bg-[#120814]">— یکی رو انتخاب کن —</option>
            {backups.map((b) => (
              <option key={b.id} value={b.id} className="bg-[#120814]">{b.name} — {formatBackupDate(b.createdAt)}</option>
            ))}
          </select>

          {restored ? (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4 flex items-center gap-2 justify-center">
              <Ic name="check" size={16} className="text-cyan-300" />
              <p className="text-sm font-bold text-cyan-300">بازگردانی شد — در حال بستن...</p>
            </div>
          ) : !confirming ? (
            <button type="button" disabled={!selectedId} onClick={() => setConfirming(true)}
              className="w-full rounded-xl py-3 font-bold text-sm bg-white/[0.05] border border-white/10 disabled:opacity-30">
              بازگردانی این نسخه
            </button>
          ) : (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
              <p className="text-xs text-rose-300 mb-3">مطمئنی؟ داده‌های فعلی با این نسخه جایگزین می‌شن (این کار برگشت‌پذیر نیست، مگر اینکه الان یه بکاپ از وضعیت فعلی بگیری).</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-lg py-2 text-xs font-medium bg-white/[0.05] border border-white/10">انصراف</button>
                <button type="button" onClick={restoreSelected} className="flex-1 rounded-lg py-2 text-xs font-bold text-white bg-rose-500">بله، بازگردان</button>
              </div>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

// ============ Settings: theme, language, AI provider ============
function SettingsModal({ onClose, settings, onChangeSettings }) {
  const [aiCfg, setAiCfg] = useState(() => loadAiConfig());
  const lang = settings.language;

  const updateAi = (patch) => {
    setAiCfg((c) => {
      const next = { ...c, ...patch };
      saveAiConfig(next);
      return next;
    });
  };

  return (
    <ModalShell title={t("settings", lang)} onClose={onClose}>
      {/* Appearance */}
      <p className="text-xs font-bold text-slate-300 mb-2">{t("appearance", lang)}</p>
      <div className="flex gap-2 mb-5">
        {[["dark", "dark_mode", "moon"], ["light", "light_mode", "sun"]].map(([id, key, icon]) => (
          <button key={id} type="button" onClick={() => onChangeSettings({ ...settings, theme: id })}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium border transition-colors"
            style={{ borderColor: settings.theme === id ? "#C026D3" : "rgba(255,255,255,.1)", background: settings.theme === id ? "rgba(192,38,211,.15)" : "rgba(255,255,255,.03)", color: settings.theme === id ? "#EAB4F2" : "#94a3b8" }}>
            <Ic name={icon} size={15} /> {t(key, lang)}
          </button>
        ))}
      </div>

      {/* Language */}
      <p className="text-xs font-bold text-slate-300 mb-2">{t("language", lang)}</p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        {LANGUAGES.map((l) => (
          <button key={l.id} type="button" onClick={() => onChangeSettings({ ...settings, language: l.id })}
            className="rounded-xl py-2.5 text-sm font-medium border transition-colors"
            style={{ borderColor: settings.language === l.id ? "#22D3EE" : "rgba(255,255,255,.1)", background: settings.language === l.id ? "rgba(34,211,238,.14)" : "rgba(255,255,255,.03)", color: settings.language === l.id ? "#67E8F9" : "#94a3b8" }}>
            {l.label}
          </button>
        ))}
      </div>

      {/* AI provider (bring your own key) */}
      <p className="text-xs font-bold text-slate-300 mb-2">{t("ai_provider_section", lang)}</p>
      <p className="text-[11px] text-slate-500 mb-3 leading-5">{t("ai_provider_hint", lang)}</p>
      <label className="block text-[11px] text-slate-500 mb-1">{t("ai_provider", lang)}</label>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {AI_PROVIDERS.map((p) => (
          <Chip key={p.id} active={aiCfg.provider === p.id} color="#22D3EE" onClick={() => updateAi({ provider: p.id })}>{p.label}</Chip>
        ))}
      </div>
      <label className="block text-[11px] text-slate-500 mb-1">{t("api_key", lang)}</label>
      <input type="password" autoComplete="off" placeholder="sk-..." value={aiCfg.apiKey}
        onChange={(e) => updateAi({ apiKey: e.target.value.trim() })}
        className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2.5 text-white text-xs outline-none mb-1" dir="ltr" />
      <p className="text-[10px] text-slate-600 mb-2">این کلید فقط تو localStorage همین مرورگر ذخیره می‌شه و به هیچ سروری غیر از همون ارائه‌دهنده ارسال نمی‌شه.</p>
    </ModalShell>
  );
}

// ============ Notes: lists (Keep/Samsung Notes/Obsidian-inspired) + full journal ============
const NOTE_COLORS = ["#C026D3", "#22D3EE", "#F59E0B", "#10B981", "#DB2777", "#3B82F6"];

function NewListModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  return (
    <ModalShell title="لیست جدید" onClose={onClose} onSubmit={() => { if (title.trim()) { onCreate(title.trim()); onClose(); } }}
      footer={<button type="submit" disabled={!title.trim()} className="w-full rounded-xl py-3 font-bold text-sm text-white disabled:opacity-30" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)" }}>ساخت لیست</button>}>
      <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً کتاب‌هایی که می‌خوام بخونم" />
    </ModalShell>
  );
}

function NoteListCard({ list, onUpdate, onDelete }) {
  const [newItem, setNewItem] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);

  const addItem = () => {
    if (!newItem.trim()) return;
    onUpdate({ ...list, items: [...list.items, { id: uid(), text: newItem.trim(), done: false }] });
    setNewItem("");
  };
  const toggleItem = (id) => onUpdate({ ...list, items: list.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) });
  const deleteItem = (id) => onUpdate({ ...list, items: list.items.filter((it) => it.id !== id) });
  const saveTitle = () => { onUpdate({ ...list, title: titleDraft.trim() || list.title }); setEditingTitle(false); };

  const doneCount = list.items.filter((i) => i.done).length;

  return (
    <GlassCard className="p-4 flex flex-col" style={{ borderTop: `2.5px solid ${list.color}` }}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        {editingTitle ? (
          <input autoFocus value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
            className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-sm font-bold text-white outline-none" />
        ) : (
          <p className="text-sm font-bold text-slate-100 flex-1 cursor-pointer" onClick={() => { setTitleDraft(list.title); setEditingTitle(true); }}>{list.title}</p>
        )}
        <button onClick={() => onDelete(list.id)} className="shrink-0 text-slate-500 hover:text-rose-400"><Ic name="trash" size={14} /></button>
      </div>
      {list.items.length > 0 && (
        <p className="text-[10px] text-slate-500 mb-2">{doneCount} از {list.items.length} انجام‌شده</p>
      )}
      <div className="space-y-1.5 mb-2.5 flex-1">
        {list.items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 group">
            <button onClick={() => toggleItem(it.id)} className="w-4 h-4 shrink-0 rounded-md border flex items-center justify-center"
              style={{ borderColor: it.done ? list.color : "rgba(255,255,255,.25)", background: it.done ? list.color : "transparent" }}>
              {it.done && <Ic name="check" size={11} color="#fff" />}
            </button>
            <span className={`text-xs flex-1 ${it.done ? "line-through text-slate-500" : "text-slate-200"}`}>{it.text}</span>
            <button onClick={() => deleteItem(it.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 shrink-0"><Ic name="x" size={12} /></button>
          </div>
        ))}
        {list.items.length === 0 && <p className="text-[11px] text-slate-600 text-center py-2">چیزی تو این لیست نیست</p>}
      </div>
      <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.06]">
        <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()}
          placeholder="+ افزودن مورد" className="flex-1 bg-transparent text-xs text-slate-300 placeholder:text-slate-600 outline-none py-1" />
        {newItem && <button onClick={addItem}><Ic name="plus" size={14} color={list.color} /></button>}
      </div>
    </GlassCard>
  );
}

function NoteListsBoard({ noteLists, setNoteLists }) {
  const [showNew, setShowNew] = useState(false);
  const createList = (title) => {
    const color = NOTE_COLORS[noteLists.length % NOTE_COLORS.length];
    setNoteLists((p) => [{ id: uid(), title, color, createdAt: Date.now(), items: [] }, ...p]);
  };
  const updateList = (updated) => setNoteLists((p) => p.map((l) => (l.id === updated.id ? updated : l)));
  const deleteList = (id) => setNoteLists((p) => p.filter((l) => l.id !== id));

  return (
    <div>
      <button onClick={() => setShowNew(true)} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 mb-4 text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)", boxShadow: "0 6px 20px rgba(192,38,211,.3)" }}>
        <Ic name="plus" size={16} /> لیست جدید
      </button>
      {noteLists.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-8">هنوز لیستی نساختی — مثلاً «کتاب‌های می‌خوام بخونم» یا «خرید» بساز</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {noteLists.map((list) => <NoteListCard key={list.id} list={list} onUpdate={updateList} onDelete={deleteList} />)}
      </div>
      {showNew && <NewListModal onClose={() => setShowNew(false)} onCreate={createList} />}
    </div>
  );
}

function JournalFullView({ journal, setJournal }) {
  const [text, setText] = useState("");
  const addEntry = () => {
    if (!text.trim()) return;
    setJournal((prev) => [{ id: uid(), date: todayKey(), text: text.trim(), createdAt: Date.now() }, ...prev]);
    setText("");
  };
  const deleteEntry = (id) => setJournal((prev) => prev.filter((e) => e.id !== id));

  const byDate = {};
  for (const e of journal) (byDate[e.date] ||= []).push(e);
  const dates = Object.keys(byDate).sort().reverse();

  return (
    <div>
      <GlassCard className="p-4 mb-4">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="امروز چطور بود؟ چی یاد گرفتی؟ چه حسی داشتی؟..."
          className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 outline-none resize-none mb-2.5" />
        <button onClick={addEntry} disabled={!text.trim()} className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-30" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)" }}>ثبت یادداشت</button>
      </GlassCard>
      {journal.length === 0 && <p className="text-xs text-slate-500 text-center py-8">هنوز یادداشتی ننوشتی</p>}
      {dates.map((d) => (
        <div key={d} className="mb-4">
          <p className="text-[11px] font-bold text-fuchsia-300 mb-2">{d}</p>
          <div className="space-y-2">
            {byDate[d].map((e) => (
              <GlassCard key={e.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap flex-1">{e.text}</p>
                  <button onClick={() => deleteEntry(e.id)} className="shrink-0 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={12} /></button>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesHub({ noteLists, setNoteLists, journal, setJournal, lang }) {
  const [sub, setSub] = useState("lists");
  return (
    <div>
      <SubTabs
        options={[["lists", t("notes_lists", lang), "check-square"], ["journal", t("notes_journal", lang), "book"]]}
        value={sub} onChange={setSub}
      />
      <div className="mt-4">
        {sub === "lists" && <NoteListsBoard noteLists={noteLists} setNoteLists={setNoteLists} />}
        {sub === "journal" && <JournalFullView journal={journal} setJournal={setJournal} />}
      </div>
    </div>
  );
}

// ============ Journal / daily notes (dashboard mini widget) ============
function JournalCard({ journal, setJournal }) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);

  const addEntry = () => {
    if (!text.trim()) return;
    const entry = { id: uid(), date: todayKey(), text: text.trim(), createdAt: Date.now() };
    setJournal((prev) => [entry, ...prev]);
    setText("");
  };
  const deleteEntry = (id) => setJournal((prev) => prev.filter((e) => e.id !== id));

  const visible = expanded ? journal : journal.slice(0, 3);

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Ic name="book" size={16} className="text-fuchsia-300" />
        <p className="text-sm font-bold text-slate-200">یادداشت روز</p>
      </div>
      <form className="mb-3" onSubmit={(e) => { e.preventDefault(); addEntry(); }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="امروز چطور بود؟ چی یاد گرفتی؟ چه حسی داشتی؟..."
          className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none resize-none focus:border-fuchsia-400/50 mb-2" />
        <button type="submit" disabled={!text.trim()} className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-30 transition"
          style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)" }}>
          ثبت یادداشت
        </button>
      </form>

      {journal.length === 0 ? (
        <p className="text-[11px] text-slate-600 text-center py-2">هنوز یادداشتی ننوشتی</p>
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <div key={e.id} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap flex-1">{e.text}</p>
                <button onClick={() => deleteEntry(e.id)} className="shrink-0 text-rose-400/70 hover:text-rose-400"><Ic name="trash" size={12} /></button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">{e.date}</p>
            </div>
          ))}
          {journal.length > 3 && (
            <button onClick={() => setExpanded((v) => !v)} className="w-full text-[11px] text-fuchsia-300 text-center py-1">
              {expanded ? "نمایش کمتر" : `${journal.length - 3} یادداشت قدیمی‌تر دیگه`}
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}

// ============ Root app ============
const NAV = [
  { id: "dashboard", labelKey: "nav_dashboard", icon: "home" }, { id: "tasks", labelKey: "nav_tasks", icon: "clipboard" },
  { id: "planning", labelKey: "nav_planning", icon: "calendar" },
  { id: "study", labelKey: "nav_study", icon: "book-open" }, { id: "fitness", labelKey: "nav_fitness", icon: "dumbbell" },
  { id: "learning", labelKey: "nav_learning", icon: "graduation-cap" },
  { id: "notes", labelKey: "nav_notes", icon: "check-square" },
];

function LifeFlowApp() {
  const [tab, setTab] = useState("dashboard");
  const [settings, setSettings] = useState(() => loadSettings());
  const lang = settings.language;
  const langDir = (LANGUAGES.find((l) => l.id === lang) || LANGUAGES[0]).dir;
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => { saveSettings(settings); }, [settings]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 60 * 1000); // catch midnight rollover even if the tab stays open
    document.addEventListener("visibilitychange", tick); // catch it immediately when the tab is reopened
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, []);
  const [tasks, setTasks] = useState(savedData.tasks || []);
  const [view, setView] = useState("list");
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const [books, setBooks] = useState(savedData.books || []);
  const [videos, setVideos] = useState(savedData.videos || []);
  const [podcasts, setPodcasts] = useState(savedData.podcasts || []);
  const [exercises, setExercises] = useState(savedData.exercises || []);
  const [projects, setProjects] = useState(savedData.projects || []);
  const [planning, setPlanning] = useState(savedData.planning || { morning: [], noon: [], evening: [], night: [] });
  const [goals, setGoals] = useState(savedData.goals || { targetHours: 2, log: {} });
  const [journal, setJournal] = useState(savedData.journal || []);
  const [noteLists, setNoteLists] = useState(savedData.noteLists || []);

  // Persist everything to this browser's local storage whenever data changes.
  // Since it's stored per-browser, anyone you send the link to gets their own separate data.
  useEffect(() => {
    const fullState = { tasks, books, videos, podcasts, exercises, projects, planning, goals, journal, noteLists };
    try {
      storage.set(STORAGE_KEY, JSON.stringify(fullState));
    } catch (e) { /* storage unavailable — app still works, just won't persist */ }
    // Optional hook: the Obsidian plugin sets this to mirror tasks/journal into real
    // vault notes (markdown checkboxes, journal entries) — a no-op everywhere else.
    if (typeof window !== "undefined" && typeof window.__lifeflowOnStateChange === "function") {
      try { window.__lifeflowOnStateChange(fullState); } catch (e) { /* ignore */ }
    }
  }, [tasks, books, videos, podcasts, exercises, projects, planning, goals, journal, noteLists]);


  const toggleTask = (id) => setTasks((p) => p.map((t) => {
    if (t.id !== id) return t;
    const willBeDone = t.status !== "done";
    return { ...t, status: willBeDone ? "done" : "todo", completedDate: willBeDone ? todayKey() : t.completedDate };
  }));

  // Reset recurring tasks once their NEXT occurrence actually begins — not just after
  // a fixed number of days. A "فقط جمعه‌ها" task stays checked all week and only resets
  // on the next Friday; a monthly task only resets on its day-of-month; etc.
  useEffect(() => {
    const todayDate = new Date();
    const today = todayKey();
    setTasks((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        if (t.status !== "done" || !t.recurrence || t.recurrence === "none" || !t.completedDate || t.completedDate === today) return t;
        if (!isTaskDueOn(t, todayDate)) return t; // not a new occurrence yet — keep it checked
        changed = true;
        return { ...t, status: "todo", completedDate: null };
      });
      return changed ? next : prev;
    });
  }, [now]);

  // Real reminders: ask for Notification permission once any task requests it, then
  // fire an actual browser notification at the scheduled time (checked every ~minute
  // via the `now` tick above). This only fires while the app/tab is open in the
  // foreground — true background push would need a server + push subscription, which
  // is a bigger addition left for later (see README roadmap).
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (tasks.some((tk) => tk.reminder) && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [tasks]);
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const today = todayKey();
    tasks.forEach((tk) => {
      if (!tk.reminder || !tk.time || tk.status === "done" || tk.time !== nowHM) return;
      if (!isTaskDueOn(tk, now)) return;
      const fireKey = `lifeflow_notif_${tk.id}_${today}`;
      if (storage.get(fireKey)) return;
      try {
        new Notification("⏰ " + tk.title, { body: "زمان انجام این تسکه", icon: "./icon-192.png" });
        storage.set(fireKey, "1");
      } catch (e) { /* ignore */ }
    });
  }, [now, tasks]);
  const deleteTask = (id) => setTasks((p) => p.filter((t) => t.id !== id));
  const saveTask = (t) => setTasks((prev) => prev.some((x) => x.id === t.id) ? prev.map((x) => x.id === t.id ? t : x) : [t, ...prev]);
  const moveTask = (id, status) => setTasks((p) => p.map((t) => t.id === id ? { ...t, status } : t));
  const scheduleTask = (id, time, duration) => setTasks((p) => p.map((t) => t.id === id ? { ...t, time, duration } : t));
  const suggestSchedule = () => {
    const order = ["q1", "q2", "q3", "q4"];
    let cursor = 8 * 60;
    setTasks((prev) => {
      const sorted = [...prev].sort((a, b) => order.indexOf(a.quad) - order.indexOf(b.quad));
      const taken = new Set(prev.filter((t) => t.time).map((t) => t.time));
      return prev.map((t) => {
        if (t.time || t.status === "done") return t;
        sorted.find((s) => s.id === t.id);
        while (true) {
          const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
          const mm = String(cursor % 60).padStart(2, "0");
          const cand = `${hh}:${mm}`;
          if (!taken.has(cand)) { taken.add(cand); cursor += t.duration + 15; return { ...t, time: cand }; }
          cursor += 15;
        }
      });
    });
  };

  const [searchOpen, setSearchOpen] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  const streak = 7;
  const urgentImportant = useMemo(() => tasks.filter((t) => t.quad === "q1" && t.status !== "done" && isTaskDueOn(t, now)), [tasks, now]);
  const todaysPlan = useMemo(() => tasks.filter((t) => isTaskDueOn(t, now)), [tasks, now]);
  const todayDone = todaysPlan.filter((t) => t.status === "done").length;
  const showGlobalFab = tab === "dashboard" || tab === "tasks";
  const stats = useMemo(() => computeStats({ tasks, books, videos, podcasts, exercises, projects }), [tasks, books, videos, podcasts, exercises, projects]);

  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), tasks, books, videos, podcasts, exercises, projects, planning, goals, journal, noteLists };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lifeflow-backup.json"; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const restoreBackup = (data) => {
    setTasks(data.tasks || []);
    setBooks(data.books || []);
    setVideos(data.videos || []);
    setPodcasts(data.podcasts || []);
    setExercises(data.exercises || []);
    setProjects(data.projects || []);
    setPlanning(data.planning || { morning: [], noon: [], evening: [], night: [] });
    setGoals(data.goals || { targetHours: 2, log: {} });
    setJournal(data.journal || []);
    setNoteLists(data.noteLists || []);
  };

  return (
    <div dir={langDir} data-theme={settings.theme} className="lifeflow-app-root min-h-screen w-full text-white relative overflow-hidden lg:flex"
      style={{ fontFamily: "'Vazirmatn', Tahoma, sans-serif" }}>
      <style>{`
        .lifeflow-app-root *{-webkit-tap-highlight-color:transparent}
        .lifeflow-app-root ::-webkit-scrollbar{display:none}

        /* ---------- Liquid glass core ---------- */
        .glass-panel{
          position:relative;
          background: linear-gradient(160deg, rgba(255,255,255,.075), rgba(255,255,255,.02) 60%, rgba(255,255,255,.04));
          backdrop-filter: blur(12px) saturate(140%);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          border:1px solid rgba(255,255,255,.10);
          box-shadow: 0 8px 24px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.2);
        }
        .glass-sheen{
          position:absolute; inset:0; pointer-events:none; z-index:0;
          background: linear-gradient(120deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 68%, rgba(255,255,255,.04) 100%);
        }
        .glass-strong{
          background: linear-gradient(165deg, rgba(255,255,255,.1), rgba(255,255,255,.03));
          backdrop-filter: blur(14px) saturate(150%); -webkit-backdrop-filter: blur(14px) saturate(150%);
          border:1px solid rgba(255,255,255,.14);
          box-shadow: 0 6px 20px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.16);
        }

        /* ---------- Galaxy nebula ---------- */
        .nebula{ position:absolute; border-radius:9999px; filter:blur(50px); opacity:.4; will-change:transform; }
        .nebula-1{ width:480px; height:480px; top:-160px; left:-120px; background:radial-gradient(circle,#C026D3,transparent 70%); animation:nebulaDrift 34s ease-in-out infinite alternate; }
        .nebula-2{ width:520px; height:520px; bottom:-220px; right:-180px; background:radial-gradient(circle,#22D3EE,transparent 70%); animation:nebulaDrift 40s ease-in-out infinite alternate; animation-delay:-9s; }
        @keyframes nebulaDrift{ from{ transform:translate3d(0,0,0) scale(1); } to{ transform:translate3d(28px,-20px,0) scale(1.08); } }

        /* ---------- 3D page transition (liquid glass pane swap) — light version ---------- */
        .glass-pane-enter{
          transform-style: preserve-3d;
          animation: glassPaneIn .38s cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes glassPaneIn{
          0%{ opacity:0; transform: rotateY(-3deg) translateZ(-24px) translateY(6px) scale(.98); }
          100%{ opacity:1; transform: rotateY(0) translateZ(0) translateY(0) scale(1); }
        }

        /* ---------- Modal 3D pop — light version ---------- */
        .modal-glass-pop{ animation: modalPop .26s cubic-bezier(.22,1,.36,1) both; transform-origin: 50% 100%; }
        @keyframes modalPop{
          0%{ opacity:0; transform: translateY(24px) scale(.97); }
          100%{ opacity:1; transform: translateY(0) scale(1); }
        }

        /* ---------- Nav sliding glass pill ---------- */
        .nav-pill{ transition: transform .38s cubic-bezier(.22,1,.36,1); will-change:transform; }

        /* ---------- Chart animations ---------- */
        .chart-bar-grow{ transform-origin:bottom; animation: barGrow .5s cubic-bezier(.22,1,.36,1) both; }
        @keyframes barGrow{ from{ transform:scaleY(0); opacity:.5; } to{ transform:scaleY(1); opacity:1; } }
        .chart-bar-grow-h{ animation: barGrowH .55s cubic-bezier(.22,1,.36,1) both; }
        @keyframes barGrowH{ from{ width:0 !important; } }
        .chart-line-draw{ stroke-dasharray:100; animation: lineDraw .8s cubic-bezier(.22,1,.36,1) both; }
        @keyframes lineDraw{ from{ stroke-dashoffset:100; } to{ stroke-dashoffset:0; } }

        @media (prefers-reduced-motion: reduce){
          .glass-pane-enter, .modal-glass-pop, .chart-bar-grow, .chart-bar-grow-h, .chart-line-draw, .nebula{ animation:none !important; }
        }

        /* ---------- Light theme ---------- */
        /* Broad, attribute-based overrides so the whole app (including deeper tab content
           we haven't individually re-themed yet) gets a legible light appearance, without
           having to rewrite every component's Tailwind classes by hand. */
        [data-theme="light"]{ color:#1a1a1a; }
        [data-theme="light"] .glass-panel{ background:linear-gradient(160deg, rgba(255,255,255,.92), rgba(255,255,255,.85) 60%, rgba(255,255,255,.88)); border-color:rgba(43,36,64,.15); box-shadow:0 8px 24px rgba(120,90,160,.15), inset 0 1px 0 rgba(255,255,255,.9); }
        [data-theme="light"] .glass-strong{ background:linear-gradient(165deg, rgba(255,255,255,.95), rgba(255,255,255,.88)); border-color:rgba(43,36,64,.15); box-shadow:0 6px 18px rgba(120,90,160,.18), inset 0 1px 0 rgba(255,255,255,.95); }
        [data-theme="light"] [class*="text-white"]{ color:#1a1a1a !important; }
        [data-theme="light"] [class*="text-slate-1"]{ color:#2a2a2a !important; }
        [data-theme="light"] [class*="text-slate-2"]{ color:#3a3a3a !important; }
        [data-theme="light"] [class*="text-slate-3"]{ color:#4a4a4a !important; }
        [data-theme="light"] [class*="text-slate-4"]{ color:#5a5a5a !important; }
        [data-theme="light"] [class*="text-slate-5"]{ color:#6a6a6a !important; }
        [data-theme="light"] [class*="text-slate-6"]{ color:#7a7a7a !important; }
        [data-theme="light"] [class*="bg-white/"]{ background-color:rgba(255,255,255,.9) !important; }
        [data-theme="light"] [class*="border-white/"]{ border-color:rgba(43,36,64,.18) !important; }
        [data-theme="light"] [class*="bg-black"]{ background-color:rgba(0,0,0,.05) !important; }
        [data-theme="light"] input, [data-theme="light"] textarea, [data-theme="light"] select{ color:#1a1a1a; }
        [data-theme="light"] ::placeholder{ color:#8a8a8a !important; opacity:1; }
        
        /* انیمیشن‌های مک استایل */
        .glass-panel {
          transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
          transform-style: preserve-3d;
        }
        
        .glass-panel:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 20px 40px rgba(0,0,0,0.2), 0 0 30px rgba(192,38,211,0.15);
        }
        
        /* افکت هوور سه‌بعدی برای دکمه‌ها */
        button {
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
        }
        
        button:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 8px 20px rgba(192,38,211,0.4);
        }
        
        button:active {
          transform: translateY(0) scale(0.98);
        }
        
        /* جلوگیری از شفافیت بیش از حد دکمه‌ها */
        button:not(.group\\/hover) {
          min-opacity: 0.85;
        }
        
        /* افکت گلو برای کارت‌ها در هوور */
        .glass-panel::before {
          content: '';
          position: absolute;
          inset: -1px;
          background: linear-gradient(135deg, rgba(192,38,211,0.3), transparent, rgba(34,211,238,0.3));
          border-radius: inherit;
          opacity: 0;
          transition: opacity 0.4s ease;
          z-index: 0;
          pointer-events: none;
        }
        
        .glass-panel:hover::before {
          opacity: 1;
        }
      `}</style>

      {settings.theme === "dark" ? <GalaxyBackground /> : <LightBackground />}

      {/* Desktop sidebar — replaces the bottom nav when there's room for it */}
      <div className="hidden lg:flex flex-col w-56 shrink-0 h-screen sticky top-0 px-4 py-6 z-10 glass-strong lg:rounded-none lg:border-l lg:border-t-0 lg:border-b-0 lg:border-r-0">
        <div className="flex items-center gap-2 px-2 mb-8">
          <img src="./logo.png" alt="" className="w-8 h-8 rounded-lg" />
          <span className="font-extrabold text-lg">{lang === "fa" ? "زندگی‌آرام" : "LifeFlow"}</span>
        </div>
        <nav className="flex flex-col gap-1 relative">
          {NAV.map((n) => {
            const active = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative z-[1]"
                style={{ background: active ? "rgba(192,38,211,.16)" : "transparent", color: active ? "#EAB4F2" : "#94a3b8", boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,.12), 0 0 16px rgba(192,38,211,.25)" : "none", border: active ? "1px solid rgba(192,38,211,.25)" : "1px solid transparent" }}>
                <Ic name={n.icon} size={18} /> {t(n.labelKey, lang)}
              </button>
            );
          })}
        </nav>
        <button onClick={() => setShowAdd(true)} className="mt-6 flex items-center justify-center gap-2 rounded-xl py-2.5 font-bold text-sm text-white" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)", boxShadow: "0 6px 20px rgba(192,38,211,.35), inset 0 1px 0 rgba(255,255,255,.3)" }}>
          <Ic name="plus" size={16} /> {t("add_task", lang)}
        </button>
        <button onClick={() => setShowBackupModal(true)} className="mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 font-medium text-sm text-slate-300 bg-white/[0.05] border border-white/10 hover:bg-white/10 transition">
          <Ic name="folder" size={15} /> {t("backup_manager", lang)}
        </button>
        <button onClick={() => setShowSettings(true)} className="mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 font-medium text-sm text-slate-300 bg-white/[0.05] border border-white/10 hover:bg-white/10 transition">
          <Ic name="settings" size={15} /> {t("settings", lang)}
        </button>
        <div className="mt-auto flex items-center gap-1.5 px-2 text-pink-400 text-sm font-bold">
          <Ic name="flame" size={15} color="#DB2777" /> {streak} روز استریک
        </div>
      </div>

      <div className="max-w-md lg:max-w-none w-full lg:flex-1 mx-auto px-4 lg:px-10 pt-8 lg:pt-8 pb-28 lg:pb-14 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-xl font-extrabold tracking-tight lg:hidden">{lang === "fa" ? "زندگی‌آرام" : "LifeFlow"}</h1><p className="text-slate-400 text-xs mt-0.5">{getPersianDateLabel(now)}</p></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center"><Ic name="search" size={14} className="text-slate-300" /></button>
            <button onClick={() => setShowBackupModal(true)} className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center" title={t("backup_manager", lang)}><Ic name="folder" size={14} className="text-slate-300" /></button>
            <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center lg:hidden" title={t("settings", lang)}><Ic name="settings" size={14} className="text-slate-300" /></button>
            <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/10 rounded-full px-3 py-1.5 lg:hidden"><Ic name="flame" size={15} color="#DB2777" /><span className="text-sm font-bold text-pink-400">{streak}</span></div>
          </div>
        </div>

        <PageTransition pageKey={tab}>
        {tab === "dashboard" && (
          <div className="lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start space-y-5 lg:space-y-0">
            <div className="lg:col-span-2 space-y-5">
              <GlassCard className="p-5 flex flex-col items-center"><DayArc tasks={todaysPlan} lang={lang} /></GlassCard>
              <div className="flex gap-3">
                <StatPill icon="clipboard" label="تسک امروز" value={`${todayDone}/${tasks.length}`} color="#C026D3" />
                <StatPill icon="book-open" label="مطالعه" value="۴۵ د" color="#22D3EE" />
              </div>
              <div className="hidden lg:block"><WeeklyOverviewChart goals={goals} tasks={tasks} /></div>
              {urgentImportant.length > 0 && (
                <GlassCard className="p-4">
                  <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-[#C026D3]" /><p className="text-sm font-bold text-rose-300">{t("urgent_important", lang)}</p></div>
                  {urgentImportant.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onSchedule={scheduleTask} onDelete={deleteTask} onEdit={setEditingTask} />)}
                </GlassCard>
              )}
              <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-2"><p className="text-sm font-bold text-slate-200">{t("todays_plan", lang)}</p><button onClick={() => setTab("tasks")} className="text-[11px] text-fuchsia-300 flex items-center gap-0.5">{t("see_all", lang)} <Ic name="chevron-left" size={13} /></button></div>
                {tasks.length === 0 && <p className="text-xs text-slate-500 text-center py-3">{t("no_tasks_yet", lang)}</p>}
                {tasks.length > 0 && todaysPlan.length === 0 && <p className="text-xs text-slate-500 text-center py-3">{t("no_tasks_today", lang)}</p>}
                {todaysPlan.slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onSchedule={scheduleTask} onDelete={deleteTask} onEdit={setEditingTask} />)}
              </GlassCard>
            </div>
            <div className="space-y-5">
              <JournalCard journal={journal} setJournal={setJournal} />
              <GamificationCard stats={stats} streak={streak} />
              <AiSummaryCard stats={stats} streak={streak} lang={lang} onOpenSettings={() => setShowSettings(true)} />
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div className="space-y-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[["list", "لیست", "clipboard"], ["matrix", "ماتریس", "grid"], ["kanban", "کانبان", "columns"], ["timeline", "زمان‌بندی", "clock"]].map(([id, label, Icon]) => (
                <button key={id} onClick={() => setView(id)} className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium border"
                  style={{ borderColor: view === id ? "#C026D3" : "rgba(255,255,255,.1)", background: view === id ? "rgba(192,38,211,.15)" : "rgba(255,255,255,.03)", color: view === id ? "#EAB4F2" : "#94a3b8" }}>
                  <Ic name={Icon} size={13} /> {label}
                </button>
              ))}
            </div>
            {view === "list" && <GlassCard className="p-4">{tasks.length === 0 && <p className="text-xs text-slate-500 text-center py-4">هنوز تسکی اضافه نکردی — با دکمه‌ی افزودن شروع کن</p>}{tasks.map((t) => <TaskRow key={t.id} task={t} onToggle={toggleTask} onSchedule={scheduleTask} onDelete={deleteTask} onEdit={setEditingTask} />)}</GlassCard>}
            {view === "matrix" && <EisenhowerBoard tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} />}
            {view === "kanban" && <KanbanBoard tasks={tasks} onMove={moveTask} onDelete={deleteTask} />}
            {view === "timeline" && <TimelineView tasks={tasks} onSchedule={scheduleTask} onSuggest={suggestSchedule} />}
          </div>
        )}

        {tab === "planning" && <PlanningHub planning={planning} setPlanning={setPlanning} goals={goals} setGoals={setGoals} />}
        {tab === "study" && <StudyHub books={books} videos={videos} podcasts={podcasts} setBooks={setBooks} setVideos={setVideos} setPodcasts={setPodcasts} />}
        {tab === "fitness" && <FitnessHub exercises={exercises} setExercises={setExercises} />}
        {tab === "learning" && <LearningHub projects={projects} setProjects={setProjects} />}
        {tab === "notes" && <NotesHub noteLists={noteLists} setNoteLists={setNoteLists} journal={journal} setJournal={setJournal} lang={lang} />}
        </PageTransition>
      </div>

      {showGlobalFab && (
        <button onClick={() => setShowAdd(true)} className="fixed bottom-24 left-1/2 -translate-x-1/2 lg:hidden w-14 h-14 rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(192,38,211,.5)] z-30" style={{ background: "linear-gradient(135deg,#C026D3,#DB2777)" }}>
          <Ic name="plus" size={24} color="white" />
        </button>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 lg:hidden">
        <div className="max-w-md mx-auto px-3 pb-3">
          <div className="glass-strong flex items-center justify-between rounded-2xl px-2 py-2 relative overflow-hidden">
            <div className="glass-sheen" />
            <div className="nav-pill absolute top-2 bottom-2 rounded-xl z-0"
              style={{
                width: `calc(${100 / NAV.length}% - 4px)`,
                transform: `translateX(${NAV.findIndex((n) => n.id === tab) * 100}%)`,
                background: "linear-gradient(150deg, rgba(192,38,211,.32), rgba(219,39,119,.22))",
                border: "1px solid rgba(234,180,242,.35)",
                boxShadow: "0 0 18px rgba(192,38,211,.35), inset 0 1px 0 rgba(255,255,255,.25)",
              }} />
            {NAV.map((n) => {
              const active = tab === n.id;
              return (
                <button key={n.id} onClick={() => setTab(n.id)} className="relative z-[1] flex flex-col items-center gap-1 px-2 py-1.5 rounded-xl flex-1 transition-transform active:scale-95">
                  <Ic name={n.icon} size={18} color={active ? "#EAB4F2" : "#64748b"} />
                  <span className="text-[9px]" style={{ color: active ? "#EAB4F2" : "#64748b" }}>{t(n.labelKey, lang)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {(showAdd || editingTask) && showGlobalFab && (
        <AddTaskModal onClose={() => { setShowAdd(false); setEditingTask(null); }} onAdd={saveTask} initialTask={editingTask} />
      )}
      {searchOpen && (
        <GlobalSearchModal onClose={() => setSearchOpen(false)} onNavigate={setTab}
          tasks={tasks} books={books} videos={videos} podcasts={podcasts} exercises={exercises} projects={projects} />
      )}
      {showBackupModal && (
        <BackupModal
          onClose={() => setShowBackupModal(false)}
          currentData={{ tasks, books, videos, podcasts, exercises, projects, planning, goals, journal, noteLists }}
          onRestore={restoreBackup}
          onDownload={exportData}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          settings={settings}
          onChangeSettings={setSettings}
        />
      )}
    </div>
  );
}

// Exposed as a global so this exact same file can be reused, unmodified, by the
// Obsidian plugin build (see lifeflow-obsidian-plugin/) — it just imports this
// file for its side effects and then reads window.LifeFlowApp off of it.
if (typeof window !== "undefined") {
  window.LifeFlowApp = LifeFlowApp;
  const __rootEl = document.getElementById("root");
  if (__rootEl) {
    const root = ReactDOM.createRoot(__rootEl);
    root.render(<LifeFlowApp />);
  }
}
