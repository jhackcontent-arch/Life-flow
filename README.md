# زندگی‌آرام — LifeFlow

A Persian-language, installable, fully offline-capable life-management Progressive Web App (PWA) — tasks with real recurrence scheduling (daily / weekly-on-specific-days / monthly / yearly), an Eisenhower matrix, kanban board, timeline/time-blocking view, study & reading tracker, fitness log, a learning-projects hub, journaling, gamification (XP, levels, badges), and a "liquid glass" galaxy-themed UI.

**🇬🇧 [English](#-english)** · **🇮🇷 [فارسی](#-فارسی)**

No backend, no database, no build server required to run it — it's a static site. All user data is stored locally in the browser (`localStorage`), per device.

---

## 🇬🇧 English

### Table of contents
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start (just want to use it)](#quick-start-just-want-to-use-it)
- [Local development](#local-development)
- [Updating your GitHub repo (without starting over each time)](#updating-your-github-repo-without-starting-over-each-time)
- [Deploying / hosting it](#deploying--hosting-it)
- [Cloud sync setup (Cloudflare D1 + Workers)](#cloud-sync-setup-cloudflare-d1--workers)
- [Obsidian plugin](#obsidian-plugin)
- [Installing as an app (PWA)](#installing-as-an-app-pwa)
- [Data, backup & privacy](#data-backup--privacy)
- [Known limitations & roadmap (TODO)](#known-limitations--roadmap-todo)
- [License](#license)

### Features
- **Task management** with an Eisenhower matrix, kanban board, list view, and a drag-free timeline / time-blocking view.
- **Real recurrence engine** — tasks can repeat `daily`, `weekly` (on one or more specific weekdays, e.g. only Thursdays + Fridays), `monthly` (a specific day of the month), or `yearly` (a specific day/month). Completion state resets exactly when the *next occurrence* begins — not on a fixed day-count.
- **Study, fitness, and learning tracking** with animated charts (bar / line / weekly overview / daily progress arc).
- **Journaling** and an **AI weekly summary** card (calls the Anthropic API — see [AI summary card](#ai-summary-card) below).
- **Gamification**: XP, levels, streaks, and unlockable badges.
- **Notes** (a Keep/Samsung Notes/Obsidian-inspired dedicated tab): colorful checklist-style **lists** (e.g. "books I want to read", shopping lists) plus a fuller, browsable **daily journal** view.
- **Settings**: dark/light theme, and a language switcher (Persian, English, French, Arabic — core navigation and dashboard chrome are translated; deeper per-tab content is still being extended, see the roadmap).
- **Bring-your-own-key AI summary**: the weekly AI summary card works with your own API key from **Anthropic, OpenAI, xAI (Grok), or Kimi (Moonshot AI)** — configurable in Settings, stored only in your browser.
- **Real reminders**: tasks with the reminder toggle now fire an actual browser notification at their scheduled time (while the app is open in a tab — see the roadmap for the background-push limitation).
- **Backup manager**: export/import your data as a `.json` file, or keep multiple named snapshots in the browser.
- **Cloud sync (optional)**: pair multiple devices to the same data using a short sync code, backed by a Cloudflare D1 database + Worker API (see [Cloud sync setup](#cloud-sync-setup-cloudflare-d1--workers) below).
- **Installable PWA** with an offline-ready service worker — works with no internet connection after the first load.
- **Liquid-glass / galaxy visual theme**: animated starfield + nebula background, frosted-glass panels, and 3D page-transition animations, tuned to be light on CPU/GPU (respects `prefers-reduced-motion`).

#### AI summary card
The dashboard's weekly AI summary card calls whichever provider you configure in **Settings → دستیار هوش مصنوعی**: **Anthropic (Claude), OpenAI (GPT), xAI (Grok), or Kimi (Moonshot AI)**. Paste in your own API key for whichever provider you use — it's stored only in `localStorage` in your browser and is never sent anywhere except that provider's API.

- Note that calling these APIs directly from a browser (no backend) means each provider's own CORS policy decides whether the request succeeds. Anthropic's API explicitly supports this via a direct-browser-access header (already included), which is why it's the most reliable option here; OpenAI/xAI/Kimi are called the same way and work for many people, but if a given provider ever tightens CORS for browser calls, you'd need to add a small serverless proxy in front of it (the same pattern described for the Cloudflare Worker sync API above) rather than calling it directly.
- **Never commit a real API key into the repo** — it lives only in each user's own browser storage; anyone using the site enters their own key.

### Tech stack
- **React 19** — pre-bundled locally as a single minified file (`react.bundle.js`), so the app needs **no CDN and no internet connection** to load React itself.
- **Tailwind CSS** — precompiled and purged to a static, minified stylesheet (`styles.css`) at build time. There is **no runtime JIT compiler** in the shipped app (which is both faster and works offline).
- Hand-written **SVG charts** (no charting library dependency).
- **Vazirmatn** Persian webfont, loaded non-blocking from Google Fonts, with a system-font fallback (`Tahoma`) so the UI still looks correct with no internet.
- A **service worker** (`sw.js`) providing offline caching (network-first for the HTML shell, cached for everything else) and PWA installability (`manifest.json`).
- All state lives in `localStorage` — no backend/server/database.

### Project structure
```
lifeflow-site/
├── index.html          # The actual site — head, splash screen, and the app pre-compiled into plain JS. This is the only file a browser needs.
├── app.jsx             # Readable JSX source of the whole app (the source of truth for development — see "Local development" below)
├── react.bundle.js      # React + ReactDOM, bundled & minified locally (no CDN dependency)
├── styles.css           # Precompiled, purged, minified Tailwind CSS
├── manifest.json        # PWA manifest (name, icons, colors, display mode)
├── sw.js                # Service worker — offline caching + install prompt support
├── logo.png             # App logo (used on the splash screen and desktop sidebar)
├── icon-192.png         # PWA icon, 192×192
└── icon-512.png         # PWA icon, 512×512
```

> `index.html` is fully self-contained and works by itself — `app.jsx` is only needed if you want to **read or modify** the app's source code.

### Quick start (just want to use it)
1. Download/clone this folder.
2. Open `index.html` directly in a browser (double-click it), **or** serve the folder with any static file server (see below) — both work.
3. That's it. No `npm install`, no build step, no server needed to just *run* the app.

To serve it locally instead of opening the file directly (recommended, since some browsers restrict `localStorage`/service-workers on the `file://` protocol):
```bash
# any of these work — pick whichever you have installed
python3 -m http.server 8080
# or
npx serve .
```
Then open `http://localhost:8080`.

### Local development
The shipped `index.html` already contains the app pre-compiled into plain JavaScript, so **you do not need Node.js just to use the site**. You only need a build step if you want to **edit** `app.jsx` (the readable JSX source) and see your changes reflected in `index.html`.

**Requirements:** [Node.js](https://nodejs.org) ≥ 18, and the [esbuild](https://esbuild.github.io/) + [Tailwind CSS CLI](https://tailwindcss.com/docs/installation) packages.

```bash
# 1. Install the two build tools (one-time)
npm install -g esbuild tailwindcss@3

# 2. Compile app.jsx (JSX) → plain JS (React.createElement calls, minified)
esbuild app.jsx \
  --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
  --minify --outfile=compiled.js

# 3. Paste/inject the contents of compiled.js into index.html,
#    replacing everything between:
#      <script>"use strict"; ... </script>
#    (right after the react.bundle.js <script> tag, right before the splash-screen script)

# 4. (Only if you changed className strings) rebuild the purged Tailwind stylesheet:
tailwindcss -i input.css -o styles.css --minify \
  --content "./app.jsx,./index.html"
#    where input.css contains just:
#      @tailwind base; @tailwind components; @tailwind utilities;

# 5. Bump the cache version in sw.js (e.g. "lifeflow-v13" → "lifeflow-v14")
#    so returning users actually get your new build instead of a stale cached copy.
```
> Tip: if you'd rather not do this by hand every time, wrap steps 2–5 in a small shell script (`build.sh`) inside your fork.

### Updating your GitHub repo (without starting over each time)
If this project already lives in a GitHub repo, you never need to delete everything and re-upload from scratch when you get updated files (whether from Claude or anyone else) — that's exactly what Git is for. The usual flow:

1. **Replace only the files that changed** in your local copy of the repo (e.g. drag the new `index.html`, `app.jsx`, `styles.css`, etc. from a fresh zip over the old ones in the same folder — Git doesn't care that they were "replaced from outside Git", it just sees the file contents changed).
2. From a terminal, inside that repo folder:
   ```bash
   git add -A
   git commit -m "Update: settings, i18n, multi-provider AI, real reminders"
   git push
   ```
3. That's it — GitHub (and anything auto-deploying from it, like Cloudflare Pages/Vercel/Netlify Git integrations) picks up just the changes. Nothing gets "rebuilt from zero"; Git only stores/transfers the diffs.

If you ever want to see what actually changed before committing:
```bash
git status      # which files changed
git diff        # line-by-line differences
```
And if a change ever turns out to be wrong, you can always go back:
```bash
git log --oneline        # see past commits
git checkout <commit-hash> -- path/to/file    # restore one old file
```

> The one thing to keep in mind: if in a future session you only get a handful of changed files (not the whole project zip) back from Claude, just replace those specific files in your local repo folder and repeat steps 2–3 above — you don't need the full project again unless it's genuinely easier for you to just re-extract everything.

### Deploying / hosting it


This is a **static site** — there is nothing to run on a server, so it works on literally any static-file host. Two ways to go about it:

#### Option A — the simplest: drag-and-drop hosting
Most of these let you just **download this project, unzip it, and drag the folder into their dashboard** — no Git or command line needed:
| Host | Free tier? | How |
|---|---|---|
| [Netlify Drop](https://app.netlify.com/drop) | ✅ | Drag the unzipped folder straight onto the page. Done in seconds. |
| [Vercel](https://vercel.com) | ✅ | "Add New Project" → "Deploy" → drag-and-drop, or connect a Git repo. |
| [Cloudflare Pages](https://pages.cloudflare.com) | ✅ | Create a project → "Upload assets" → drag the folder. |
| [Surge.sh](https://surge.sh) | ✅ | CLI-based but one command: `npx surge ./lifeflow-site your-name.surge.sh` |
| [GitHub Pages](https://pages.github.com) | ✅ | Push the folder to a repo → Settings → Pages → choose branch/folder. See below. |
| [Firebase Hosting](https://firebase.google.com/docs/hosting) | ✅ | `firebase init hosting` → `firebase deploy`. |
| Yapp / any generic static host | Depends | Same idea: upload the **whole folder's contents** (not just `index.html`) as-is. |

**General recipe that works on almost any static host:**
1. Download this project (as a `.zip`) and extract it on your computer.
2. Open the hosting provider's dashboard and look for "New site" / "Upload" / "Deploy" / "Add project".
3. Upload or drag in **the entire folder's contents** — `index.html`, `app.jsx` (optional, harmless to include), `react.bundle.js`, `styles.css`, `manifest.json`, `sw.js`, `logo.png`, `icon-192.png`, `icon-512.png` — keeping them all in the same folder/root, not nested inside another subfolder.
4. Make sure `index.html` ends up at the **root** of what gets served (i.e. `https://yoursite.com/index.html`, not `https://yoursite.com/some-subfolder/index.html`) — otherwise the service worker and relative asset paths (`./styles.css`, `./react.bundle.js`, etc.) won't resolve.
5. Visit the URL the host gives you. Done.

#### Option B — GitHub Pages, step by step
1. Create a new GitHub repository and push this folder's contents to it (at the repo root, or inside a `/docs` folder — either works).
2. Go to the repo's **Settings → Pages**.
3. Under "Build and deployment", choose **"Deploy from a branch"**, pick your branch (usually `main`) and the folder (`/root` or `/docs`, matching step 1).
4. Save. GitHub will give you a URL like `https://your-username.github.io/your-repo/` within a minute or two.

> ⚠️ If you deploy under a **subpath** (like GitHub Pages' `/your-repo/` path), double-check the app still loads its assets correctly — all asset references here use relative paths (`./styles.css` etc.), which should work fine under a subpath, but always verify after deploying.

### Cloud sync setup (Cloudflare D1 + Workers)
By default this app only stores data in the browser (`localStorage`) — nothing syncs between your phone and your laptop. The `lifeflow-worker/` folder included alongside this project adds an **optional** small API that does that, backed by a serverless SQLite database (Cloudflare D1), so two (or more) devices can share the same task list.

**How it works:** the frontend generates a short, random **sync code** (like `K7M2-9XQP`) shown in Backup manager → "☁️ همگام‌سازی ابری" (Cloud sync). Press "ارسال به ابر" (Push to cloud) on device A, then enter the *same* code on device B and press "دریافت از ابر" (Pull from cloud). There's no login/password — the code itself is the shared secret, so treat it like one (don't post it publicly).

> ⚠️ This is a simple, code-based pairing mechanism meant for a single person syncing their own devices — it is **not** a real multi-user auth system. Anyone who has your sync code can read and overwrite that data.

#### 1. Deploy the Worker
A D1 database (`lifeflow-db`) has already been created and its schema initialized for this project — you just need to deploy the Worker that talks to it. Two ways:

**Option A — Cloudflare dashboard (no CLI needed):**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Give it a name (e.g. `lifeflow-sync`) and deploy the default template.
3. Click **Edit code**, delete everything, and paste in the contents of `lifeflow-worker/src/index.js`. Click **Deploy**.
4. Go to the Worker's **Settings → Bindings → Add → D1 database**. Set the **variable name** to `DB` and select the `lifeflow-db` database. Save.
5. Copy the Worker's URL (something like `https://lifeflow-sync.your-name.workers.dev`).

**Option B — Wrangler CLI:**
```bash
cd lifeflow-worker
npm install
npx wrangler login          # opens a browser to authorize your Cloudflare account
npx wrangler deploy         # reads wrangler.toml, which already points at the lifeflow-db database
```
Wrangler will print the deployed URL when it finishes.

#### 2. Point the app at it
Open the app → folder icon (مدیریت بکاپ) → paste the Worker URL from step 1 into "آدرس Worker". That's it — the sync code is generated automatically the first time you open that panel.

#### 3. (Optional) inspect/manage the data directly
Since the database is a normal D1 database, you can query it directly from the Cloudflare dashboard (Workers & Pages → D1 → `lifeflow-db` → Console), e.g.:
```sql
SELECT sync_code, updated_at FROM user_data ORDER BY updated_at DESC;
```

### Obsidian plugin
`lifeflow-obsidian-plugin/` (a sibling folder to this one) packages the exact same app as an [Obsidian](https://obsidian.md) plugin — it opens LifeFlow as a tab inside your vault's workspace, rather than in a separate browser tab.

**How it works:** the plugin doesn't duplicate the app's code. Its `src/main.jsx` imports `../lifeflow-site/app.jsx` (this same file) for its side effects — loading it just defines all the components and, as its very last step, exposes `window.LifeFlowApp`. A small Obsidian `ItemView` then mounts that exact component into a workspace tab. This means any future update to `app.jsx` (bug fixes, new features) is picked up by the plugin automatically, with nothing to keep in sync by hand.

A few things were specifically handled to make this safe to run alongside the rest of your vault:
- **It mirrors data into real notes, not just JSON**: tasks are written out to `LifeFlow/Tasks.md` as genuine Obsidian checkboxes (`- [ ]`/`- [x]`, with time/tag/recurrence inline and subtasks nested), the Notes tab's lists go to `LifeFlow/Lists.md` (one checklist section per list — perfect for things like "books I want to read"), and journal entries go to `LifeFlow/Journal.md` grouped by date — all three regenerated automatically as you use the app. This is one-way (app → notes) for now; hand-editing those files gets overwritten on the next change.
- **Storage**: the app's `localStorage` calls go through a small adapter that — only when running inside Obsidian — switches to `app.loadLocalStorage`/`app.saveLocalStorage`, which Obsidian scopes per-vault. So LifeFlow's data won't leak between different vaults on the same computer.
- **Styling is scoped**: Tailwind's own base CSS reset is deliberately left out of the plugin build (only the utility classes are included, wrapped so every rule only applies inside LifeFlow's own view), so it can't accidentally restyle the rest of Obsidian's UI. This was tested directly — a fake "rest of the app" area around the mounted plugin view keeps its own styling untouched.

#### Building it
```bash
cd lifeflow-obsidian-plugin
npm install
npm run build     # produces main.js next to manifest.json
```

#### Installing it in a vault (manual install — not on the community plugin registry)
1. In your vault, create the folder `<your-vault>/.obsidian/plugins/lifeflow/`.
2. Copy these three files into it: `manifest.json`, `main.js` (from the build step above — already included pre-built in this project), and `styles.css`.
3. In Obsidian: **Settings → Community plugins** → make sure "Restricted mode" is off → find "زندگی‌آرام (LifeFlow)" in your installed plugins list → toggle it on.
4. A heart icon (♥) appears in the left ribbon — click it (or run the command "باز کردن زندگی‌آرام" from the command palette) to open LifeFlow as a tab.

#### Known limitations specific to the plugin
- It's a manual install, not distributed via Obsidian's community plugin browser (that requires a public GitHub repo + a submission to Obsidian's directory — doable later, not done here).
- The Google Fonts webfont and AI summary card still need an internet connection, same as the website version (see the caveats above).
- The light/dark theme and 4-language support all work the same as the website, with the same coverage caveats noted in the roadmap.

### Installing as an app (PWA)


Once hosted (over HTTPS — required for service workers, except on `localhost`):
- **Android / Chrome**: open the site → menu (⋮) → "Add to Home screen" / "Install app".
- **iPhone / Safari**: open the site → Share button → "Add to Home Screen".
- **Desktop Chrome/Edge**: an install icon (⊕) appears in the address bar.

After the first visit, the service worker caches the app shell, so it will keep working with no internet connection (except for the Google Fonts webfont and the AI summary card, which need a connection — everything else is fully offline).

### Data, backup & privacy
- All data (tasks, books, exercises, journal entries, etc.) is stored in the browser's `localStorage`, scoped to that specific browser/device. There is no server-side storage and nothing is sent anywhere (aside from the optional AI summary call and loading the webfont).
- Anyone you send the link to gets their own separate, empty data — it is **not shared/synced** between devices or people.
- Use the **backup manager** (folder icon in the header) to export your data as a `.json` file (for safekeeping or moving to another device/browser) and to re-import it later.

### Known limitations & roadmap (TODO)
Things that would be worth doing next, roughly in order of impact:

1. **Cloud sync is basic (last-write-wins, manual).** The new Cloudflare D1 + Worker sync (see above) lets you move data between devices with a code, but it's a manual push/pull with no automatic background sync and no merge — pulling always **overwrites** local data entirely, and if two devices push at different times the last push simply wins. A real sync system (automatic, periodic, with proper conflict resolution) is a bigger undertaking left for later.
2. **AI summary card is now BYOK, but still calls providers directly from the browser.** You (and each user) supply your own key in Settings, so there's no shared-quota risk anymore — but a provider could still change its CORS policy for direct browser calls at any time. A small serverless proxy (same idea as the Cloudflare Worker used for sync) would make this bulletproof long-term.
3. **Reminders now fire real browser notifications**, but only while the app/tab is open in the foreground. True background push (notifications even when the app/browser is fully closed) needs a server-side push subscription setup — a bigger addition left for later.
4. **Monthly/yearly recurrence uses the Gregorian calendar** (day-of-month / month-of-year), while the rest of the UI displays Jalali (Persian) dates. Supporting Jalali-native monthly/yearly recurrence would be more intuitive for Persian-speaking users.
5. **The Vazirmatn font still requires an internet connection** (loaded from Google Fonts) the very first time, and won't refresh if it's ever unreachable again — self-hosting the font files locally (like `react.bundle.js` and `styles.css` already are) would make the very first load fully offline-safe too.
6. **No automated build script.** Recompiling `app.jsx` → `index.html` today is a manual multi-step process (see [Local development](#local-development)). A small `build.sh`/`package.json` script would remove the manual copy-paste step and reduce mistakes.
7. **No automated tests.** A lightweight smoke-test suite (e.g. Playwright) covering task creation, recurrence behavior, and offline loading would catch regressions early.
8. **Light theme exists now, but is a broad CSS override rather than a from-scratch design.** It re-themes the whole app in one pass (backgrounds, text, glass panels) so it's fully usable, but hasn't had the same per-component design polish as the dark "liquid glass" theme — expect it to look a bit more generic in places.
9. **Multi-language support covers the main navigation and dashboard chrome, not every screen yet.** English, French, and Arabic (plus Persian) are selectable in Settings, but deeper per-tab content (Study/Fitness/Learning internals, longer help text, etc.) is still Persian-only and needs incremental translation.
10. **Accessibility pass.** Labels/`aria-*` attributes for screen readers, and keyboard navigation for the modal/nav components, aren't fully audited yet.

### License
No license file is currently included — add one (MIT is a common, permissive choice for a personal project like this) before treating this as open source.

---

## 🇮🇷 فارسی

### درباره‌ی پروژه
**زندگی‌آرام (LifeFlow)** یک اپلیکیشن وب پیشرونده (PWA) فارسی‌زبان برای مدیریت زندگیه — کاملاً آفلاین‌کار، قابل‌نصب روی موبایل/دسکتاپ، و بدون نیاز به هیچ سروری. شامل مدیریت تسک با **تکرار واقعی** (روزانه / هفتگی با روزهای دلخواه مثلاً فقط پنجشنبه‌ها و جمعه‌ها / ماهانه / سالانه)، ماتریس آیزنهاور، بورد کانبان، نمای زمان‌بندی، پیگیری مطالعه و ورزش، بخش یادگیری، یادداشت روزانه، گیمیفیکیشن (XP، سطح، مدال)، و طراحی شیشه‌ای کهکشانی («لیکویید گلس»).

تمام داده‌ها فقط در حافظه‌ی محلی مرورگر (`localStorage`) ذخیره می‌شن — هیچ سرور یا دیتابیسی درکار نیست.

### ساختار پروژه
```
lifeflow-site/
├── index.html         ← تنها فایلی که مرورگر لازم داره (کد کامپایل‌شده داخلشه)
├── app.jsx            ← سورس خواناى JSX، فقط برای توسعه/ویرایش لازمه
├── react.bundle.js     ← ری‌اکت، لوکال و آماده (بدون نیاز به CDN)
├── styles.css          ← تیلویند از پیش کامپایل‌شده
├── manifest.json       ← تنظیمات PWA
├── sw.js               ← سرویس‌ورکر برای آفلاین‌کار کردن
├── logo.png, icon-192.png, icon-512.png
```

### نحوه‌ی اجرا (ساده‌ترین حالت)
پروژه رو دانلود/کلون کن و فایل `index.html` رو مستقیم تو مرورگر باز کن، یا با یه سرور استاتیک ساده سرو کن:
```bash
python3 -m http.server 8080
```
و بعد `http://localhost:8080` رو باز کن.

### توسعه‌ی لوکال (اگه می‌خوای کد رو تغییر بدی)
فایل `index.html` از قبل کامپایل شده، پس برای فقط **استفاده** از سایت به Node.js نیازی نیست. اما اگه می‌خوای `app.jsx` رو ویرایش کنی، باید دوباره کامپایلش کنی:

```bash
# نصب یک‌باره‌ی ابزارها
npm install -g esbuild tailwindcss@3

# کامپایل app.jsx به جاوااسکریپت خام (فشرده)
esbuild app.jsx \
  --jsx=transform --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
  --minify --outfile=compiled.js

# محتوای compiled.js رو جای کدِ بین دو تگ <script> داخل index.html بذار
# (همون بخشی که "use strict" باهاش شروع می‌شه)

# اگه کلاس‌های تیلویند جدیدی اضافه کردی، CSS رو دوباره بساز:
tailwindcss -i input.css -o styles.css --minify --content "./app.jsx,./index.html"

# و در نهایت نسخه‌ی کش رو تو sw.js عوض کن (مثلاً v13 → v14)
# تا کاربرهایی که قبلاً سایت رو باز کردن، نسخه‌ی جدید رو بگیرن نه نسخه‌ی کش‌شده‌ی قدیمی
```

### نحوه‌ی هاست کردن (راه‌اندازی روی یک دامنه)
این پروژه یک **سایت استاتیکه** — یعنی هیچ کدی روی سرور اجرا نمی‌شه، پس روی هر هاستِ فایل‌محوری کار می‌کنه. ساده‌ترین راه:

1. پروژه رو به‌صورت zip دانلود کن و از حالت فشرده خارجش کن.
2. وارد پنل هاستی که می‌خوای استفاده کنی بشو و دنبال گزینه‌ای مثل «New site» / «Upload» / «Deploy» بگرد.
3. **کل محتوای پوشه** رو (نه فقط `index.html`) آپلود کن یا بکش و رها کن — یعنی `index.html`، `react.bundle.js`، `styles.css`، `manifest.json`، `sw.js`، `logo.png`، `icon-192.png`، `icon-512.png` باید همه کنار هم و در همون ریشه باشن، نه داخل یه زیرپوشه‌ی دیگه.
4. مطمئن شو که `index.html` دقیقاً روی آدرس اصلی سایت قرار می‌گیره (مثلاً `https://yoursite.com/index.html`)، نه داخل یه زیرمسیر — وگرنه مسیرهای نسبی فایل‌ها (`./styles.css` و بقیه) درست لود نمی‌شن.

**چند تا سایت که این کار رو مجانی و به همین سادگی (کشیدن و رها کردن پوشه) انجام میدن:**
| سایت | رایگانه؟ | نحوه‌ی کار |
|---|---|---|
| [Netlify Drop](https://app.netlify.com/drop) | ✅ | پوشه رو مستقیم بکش رو صفحه، همون لحظه آماده می‌شه |
| [Vercel](https://vercel.com) | ✅ | «Add New Project» → آپلود پوشه یا اتصال به گیت‌هاب |
| [Cloudflare Pages](https://pages.cloudflare.com) | ✅ | ساخت پروژه → «Upload assets» → آپلود پوشه |
| [Surge.sh](https://surge.sh) | ✅ | با یه خط دستور: `npx surge ./lifeflow-site your-name.surge.sh` |
| [GitHub Pages](https://pages.github.com) | ✅ | پوشه رو به یه ریپازیتوری push کن، بعد Settings → Pages → انتخاب برنچ/پوشه |
| [Firebase Hosting](https://firebase.google.com/docs/hosting) | ✅ | `firebase init hosting` سپس `firebase deploy` |
| yapp یا هر هاست استاتیک دیگه | بستگی داره | همون منطق: کل فایل‌های پوشه رو همون‌طور که هستن آپلود کن |

### همگام‌سازی ابری (Cloudflare D1 + Workers)
به‌طور پیش‌فرض همه‌چیز فقط تو `localStorage` مرورگرت ذخیره می‌شه. پوشه‌ی `lifeflow-worker/` که همراه پروژه اومده، یه API اختیاری و کوچیک اضافه می‌کنه (پشتش یه دیتابیس D1 هست، از قبل ساخته و آماده شده) که باهاش می‌تونی داده‌هات رو بین چند دستگاه به اشتراک بذاری.

**نحوه‌ی کار:** برنامه یه «کد همگام‌سازی» کوتاه و تصادفی می‌سازه (مثل `K7M2-9XQP`) که تو بخش مدیریت بکاپ → «☁️ همگام‌سازی ابری» می‌بینیش. تو دستگاه اول «ارسال به ابر» رو بزن، بعد همون کد رو تو دستگاه دوم وارد کن و «دریافت از ابر» رو بزن. لاگین/رمزی درکار نیست — خودِ کد به‌جای رمز عمل می‌کنه، پس مثل رمز عبور مراقبش باش.

**راه‌اندازی Worker (یه بار، توسط خودت):**
1. برو به [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create Worker، یه اسمی مثل `lifeflow-sync` بهش بده و دیپلویش کن.
2. روی «Edit code» بزن، کدهای پیش‌فرض رو پاک کن و محتوای فایل `lifeflow-worker/src/index.js` رو جایگزینش کن. Deploy بزن.
3. برو تو Settings → Bindings → Add → D1 database، متغیر رو `DB` بذار و دیتابیس `lifeflow-db` رو انتخاب کن.
4. آدرس Worker (چیزی شبیه `https://lifeflow-sync.your-name.workers.dev`) رو کپی کن و تو اپ، بخش «آدرس Worker» بچسبونش.

### آپدیت کردن ریپازیتوری گیت‌هاب (بدون از اول کوبیدن هر بار)
اگه این پروژه از قبل تو یه ریپازیتوری گیت‌هابه، هیچ‌وقت لازم نیست همه‌چیز رو پاک کنی و از اول آپلود کنی — دقیقاً کاری که Git براش ساخته شده همینه. روال معمول:

1. فقط فایل‌هایی که تغییر کردن رو تو کپی محلی ریپو **جایگزین کن** (مثلاً `index.html`، `app.jsx`، `styles.css` جدید رو از یه زیپ تازه بکش روی فایل‌های قدیمی تو همون پوشه — Git اهمیتی نمی‌ده که این فایل‌ها «از بیرون Git» جایگزین شدن، فقط می‌بینه محتوای فایل عوض شده).
2. تو ترمینال، داخل همون پوشه‌ی ریپو:
   ```bash
   git add -A
   git commit -m "آپدیت: تنظیمات، چندزبانه، هوش مصنوعی چندگانه، یادآوری واقعی"
   git push
   ```
3. تمومه — گیت‌هاب (و هرچی که خودکار ازش دیپلوی می‌شه، مثل Cloudflare Pages/Vercel/Netlify) فقط همون تغییرات رو می‌گیره. هیچی «از صفر ساخته نمی‌شه»؛ Git فقط تفاوت‌ها رو ذخیره/منتقل می‌کنه.

اگه خواستی قبل از commit ببینی دقیقاً چی عوض شده:
```bash
git status      # کدوم فایل‌ها عوض شدن
git diff        # تفاوت خط‌به‌خط
```

> نکته: اگه تو یه جلسه‌ی بعدی فقط چند تا فایل تغییریافته (نه کل زیپ پروژه) گرفتی، همون فایل‌های خاص رو تو پوشه‌ی محلی ریپو جایگزین کن و مراحل ۲ و ۳ بالا رو تکرار کن — نیازی به کل پروژه از اول نیست، مگه اینکه خودت راحت‌تر باشی که کامل دوباره extract کنی.

### نصب به‌عنوان اپ (PWA)


بعد از هاست شدن (روی HTTPS):
- **اندروید/کروم**: منوی مرورگر → «Add to Home screen»
- **آیفون/سافاری**: دکمه‌ی Share → «Add to Home Screen»
- **دسکتاپ (کروم/اج)**: آیکون نصب (⊕) کنار نوار آدرس

### داده‌ها، بکاپ و حریم خصوصی
همه‌چیز فقط داخل `localStorage` همون مرورگر/دستگاه ذخیره می‌شه — هیچ سروری درکار نیست و چیزی جایی ارسال نمی‌شه (به‌جز فراخوانی اختیاری خلاصه‌ی هوش مصنوعی و لودشدن فونت گوگل). از بخش «مدیریت بکاپ» (آیکون پوشه در هدر) می‌تونی داده‌هات رو به فایل JSON خروجی بگیری یا دوباره وارد کنی.

### کارهایی که هنوز باید انجام بشه (نقشه‌ی راه)
1. **همگام‌سازی ابری فعلاً ساده و دستیه (last-write-wins)** — با قابلیت جدید Cloudflare D1 + Worker (بالاتر توضیح داده شد) می‌تونی داده‌ها رو با یه کد بین دستگاه‌ها جابه‌جا کنی، اما فعلاً دستیه (نه خودکار)، و «دریافت» همیشه داده‌ی محلی رو کامل جایگزین می‌کنه — بدون merge هوشمند. یه سیستم سینک واقعی (خودکار، دوره‌ای، با حل تعارض درست) کار بزرگ‌تریه که برای بعد می‌مونه.
2. **کارت خلاصه‌ی هوش مصنوعی الان BYOK شده، ولی هنوز مستقیم از مرورگر به سرویس‌ها وصل می‌شه** — هرکس کلید API خودشو تو تنظیمات وارد می‌کنه (دیگه خطر مصرف سهمیه‌ی مشترک نیست)، اما اگه یه سرویس سیاست CORS‌ش رو سخت‌گیرانه‌تر کنه، ممکنه نیاز به یه پراکسی سبک (شبیه همون Cloudflare Worker که برای سینک ساختیم) پیدا کنه.
3. **یادآوری‌ها الان نوتیفیکیشن واقعی مرورگر می‌فرستن**، اما فقط وقتی اپ/تب بازه. نوتیفیکیشن پس‌زمینه‌ی کامل (حتی وقتی مرورگر بسته‌ست) نیاز به زیرساخت push سمت سرور داره که برای بعد می‌مونه.
4. **تکرار ماهانه/سالانه با تقویم میلادیه**، درحالی‌که بقیه‌ی سایت تاریخ رو شمسی نشون میده — پشتیبانی از تکرار شمسی‌محور، تجربه‌ی طبیعی‌تری میده.
5. **فونت وزیرمتن هنوز به اینترنت نیاز داره** (از گوگل فونت لود می‌شه) — لوکال‌کردنش (مثل react.bundle.js و styles.css) باعث می‌شه حتی بار اول هم کاملاً آفلاین کار کنه.
6. **اسکریپت ساخت خودکار نداره** — کامپایل `app.jsx` به `index.html` الان دستیه؛ یه اسکریپت کوچیک (`build.sh`) این کار رو خودکار می‌کنه.
7. **تست خودکار نداره** — یه مجموعه تست سبک (مثلاً با Playwright) برای ساخت تسک، رفتار تکرار، و لودشدن آفلاین، جلوی خراب‌شدن ناخواسته رو می‌گیره.
8. **تم روشن اضافه شده، ولی بیشتر یه override کلی CSSه تا طراحی اختصاصی** — کل اپ رو یکجا قابل‌استفاده می‌کنه، اما هنوز به‌اندازه‌ی تم تیره‌ی «لیکویید گلس» ریزه‌کاری نداره.
9. **پشتیبانی چندزبانه فعلاً فقط ناوبری اصلی و داشبورد رو پوشش می‌ده** — انگلیسی، فرانسه و عربی (به‌علاوه فارسی) از تنظیمات قابل انتخابن، اما محتوای عمیق‌تر هر تب (مثلاً بخش‌های داخلی مطالعه/ورزش/یادگیری) هنوز فقط فارسیه و نیاز به ترجمه‌ی تدریجی داره.
10. **بررسی دسترسی‌پذیری (Accessibility)** انجام نشده — لیبل‌ها و ناوبری با کیبورد هنوز کامل چک نشدن.

### مجوز
فعلاً فایل لایسنسی برای این پروژه گذاشته نشده — قبل از اینکه بهش به‌عنوان اوپن‌سورس نگاه کنی، یه لایسنس (مثلاً MIT، که برای پروژه‌های شخصی رایجه) بهش اضافه کن.
