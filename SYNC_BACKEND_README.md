# LifeFlow Sync Backend - Cloudflare Worker + D1

این پروژه یک Backend برای همگام‌سازی (Sync) داده‌ها با استفاده از **Cloudflare Workers** و **D1 Database** است.

## ساختار پروژه

```
/workspace
├── src/
│   └── index.js          # کد اصلی Cloudflare Worker
├── schema.sql            # طرح‌واره پایگاه داده D1
├── wrangler.toml         # پیکربندی Wrangler
└── README.md             # این فایل
```

## API Endpoints

### 1. `POST /api/sync` - همگام‌سازی داده‌ها
دریافت تغییرات از کلاینت و ارسال تغییرات سرور

**Request Body:**
```json
{
  "clientId": "unique-client-id",
  "lastSyncTimestamp": "2024-01-01T00:00:00.000Z",
  "changes": [
    {
      "type": "INSERT",
      "table": "user_data",
      "data": {
        "id": "uuid",
        "client_id": "client-id",
        "content": {},
        "timestamp": "2024-01-01T00:00:00.000Z",
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "changes": [],
  "message": "Sync completed successfully"
}
```

### 2. `GET /api/data?clientId=xxx` - دریافت داده‌های کاربر

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "client_id": "client-id",
      "content": "{}",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 3. `POST /api/data` - ایجاد داده جدید

**Request Body:**
```json
{
  "clientId": "unique-client-id",
  "content": {
    "type": "note",
    "title": "My Note",
    "data": {}
  }
}
```

### 4. `GET /api/health` - بررسی سلامت سرویس

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## راه‌اندازی محلی

### 1. نصب وابستگی‌ها
```bash
npm install -g wrangler
```

### 2. ورود به Cloudflare
```bash
wrangler login
```

### 3. ایجاد پایگاه داده D1
```bash
wrangler d1 create lifeflow-db
```

### 4. اعمال طرح‌واره
```bash
wrangler d1 execute lifeflow-db --file=schema.sql
```

### 5. اجرای لوکال
```bash
wrangler dev
```

سرور روی `http://localhost:8787` اجرا می‌شود.

## تست API

### تست Health Check
```bash
curl http://localhost:8787/api/health
```

### تست ایجاد داده
```bash
curl -X POST http://localhost:8787/api/data \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-client-123",
    "content": {
      "type": "note",
      "title": "Test Note",
      "content": "Hello World"
    }
  }'
```

### تست دریافت داده‌ها
```bash
curl "http://localhost:8787/api/data?clientId=test-client-123"
```

### تست همگام‌سازی
```bash
curl -X POST http://localhost:8787/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-client-123",
    "lastSyncTimestamp": null,
    "changes": []
  }'
```

## استقرار (Deploy)

```bash
wrangler deploy
```

## نکات مهم

1. **CORS**: تمام endpointها از CORS پشتیبانی می‌کنند
2. **Sync Logic**: سیستم همگام‌سازی بر اساس timestamp کار می‌کند
3. **Client ID**: هر کلاینت باید یک شناسه یکتا داشته باشد
4. **Data Format**: محتوای داده‌ها به صورت JSON ذخیره می‌شود

## جداول پایگاه داده

- `user_data`: ذخیره داده‌های کاربران
- `sync_log`: ثبت عملیات همگام‌سازی
- `clients`: اطلاعات دستگاه‌های کلاینت

## امنیت

برای استفاده در محیط Production، توصیه می‌شود:
- احراز هویت (Authentication) اضافه کنید
- Rate Limiting پیاده‌سازی کنید
- از Cloudflare Access استفاده کنید
- اعتبارسنجی ورودی‌ها را تقویت کنید
