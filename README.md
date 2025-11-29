# CWA 天氣預報 API 服務

這是一個使用 Node.js + Express 開發的天氣預報 API 服務，串接中央氣象署（CWA）開放資料平台，提供高雄市天氣預報資料。

## 功能特色

- ✅ 串接 CWA 氣象資料開放平台
- ✅ 取得高雄市 36 小時天氣預報
- ✅ 環境變數管理
- ✅ RESTful API 設計
- ✅ CORS 支援

## 安裝步驟

### 1. 安裝相依套件

```bash
npm install
```

### 2. 設定環境變數

在專案根目錄建立 `.env` 檔案：

```bash
touch .env
```

編輯 `.env` 檔案，填入你的 CWA API Key：

```env
CWA_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
```

### 3. 取得 CWA API Key

1. 前往 [氣象資料開放平臺](https://opendata.cwa.gov.tw/)
2. 註冊/登入帳號
3. 前往「會員專區」→「取得授權碼」
4. 複製 API 授權碼
5. 將授權碼填入 `.env` 檔案的 `CWA_API_KEY`

## 啟動服務

### 開發模式（自動重啟）

```bash
npm run dev
```

### 正式模式

```bash
npm start
```

伺服器會在 `http://localhost:3000` 啟動

## API 端點

### 1. 首頁

```
GET /
```

回應：

```json
{
  "message": "歡迎使用 CWA 天氣預報 API",
  "endpoints": {
    "kaohsiung": "/api/weather/kaohsiung",
    "health": "/api/health"
  }
}
```

### 2. 健康檢查

```
GET /api/health
```

回應：

```json
{
  "status": "OK",
  "timestamp": "2025-09-30T12:00:00.000Z"
}
```

### 3. 新的通用天氣查詢 API（支援定位與多地區） 🔎📍

此專案已更新為「使用者定位/地區查詢」的通用 API，可以接受地區名稱、經緯度或一次查詢多地區。

可用參數（GET /api/weather）:

- city=地區名稱（單一）
- cities=地區 1,地區 2（逗號分隔多個地區）
- lat=數值&lng=數值（以單一座標進行反向地理定位）
- coords=lat,lng;lat,lng（以分號 ; 分隔多組座標）

若沒有提供位置參數，伺服器會嘗試以請求 IP 做簡易定位（作為 fallback）。

範例：

1. 以地區名稱查詢（單一）

```
GET /api/weather?city=臺北市
```

2. 以多個地區名稱查詢

```
GET /api/weather?cities=臺北市,高雄市
```

3. 以座標查詢（單一）

```
GET /api/weather?lat=25.033&lng=121.565
```

4. 以多座標查詢（同時間查多區）

```
GET /api/weather?coords=25.033,121.565;22.627,120.301
```

5. 向下相容：仍然可呼叫原本的高雄路由

```
GET /api/weather/kaohsiung
```

回應格式（簡化說明）：

```json
{
  "success": true,
  "query": ["臺北市", "高雄市"],
  "results": [
    {
      "name": "臺北市",
      "success": true,
      "data": {
        /* weather data */
      }
    },
    {
      "name": "高雄市",
      "success": true,
      "data": {
        /* weather data */
      }
    }
  ]
}
```

## 專案結構

```
CwaWeather-backend/
├── server.js              # Express 伺服器主檔案（包含路由與控制器邏輯）
├── .env                   # 環境變數（不納入版控）
├── .gitignore            # Git 忽略檔案
├── package.json          # 專案設定與相依套件
├── package-lock.json     # 套件版本鎖定檔案
└── README.md            # 說明文件
```

## 使用的套件

- **express**: Web 框架
- **axios**: HTTP 客戶端
- **dotenv**: 環境變數管理
- **cors**: 跨域資源共享
- **nodemon**: 開發時自動重啟（開發環境）

## 注意事項

1. 請確保已申請 CWA API Key 並正確設定在 `.env` 檔案中
2. API Key 有每日呼叫次數限制，請參考 CWA 平台說明
3. 不要將 `.env` 檔案上傳到 Git 版本控制（已包含在 `.gitignore` 中）
4. 所有路由與業務邏輯都在 `server.js` 檔案中，適合小型專案使用

## 錯誤處理

API 會回傳適當的 HTTP 狀態碼和錯誤訊息：

- `200`: 成功
- `404`: 找不到資料
- `500`: 伺服器錯誤

錯誤回應格式：

```json
{
  "error": "錯誤類型",
  "message": "錯誤訊息"
}
```

## 授權

MIT
