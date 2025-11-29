require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const CWA_API_BASE_URL =
  "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001";
const CWA_API_KEY = process.env.CWA_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==== 🟦 地名修正（CWA 常用地名）====
const normalizeCity = (name) => {
  if (!name) return null;
  name = name.replace("台", "臺");
  const validCities = [
    "臺北市",
    "新北市",
    "桃園市",
    "臺中市",
    "臺南市",
    "高雄市",
    "基隆市",
    "新竹市",
    "嘉義市",
    "新竹縣",
    "苗栗縣",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義縣",
    "屏東縣",
    "宜蘭縣",
    "花蓮縣",
    "臺東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
  ];
  return validCities.find((c) => name.includes(c)) || null;
};

// ==== 🟦 OSM 反查 ====
async function reverseGeocode(lat, lon) {
  try {
    const headers = {
      "User-Agent": process.env.USER_AGENT || "weather-backend",
    };
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=zh-TW`;
    const r = await axios.get(url, { headers });
    const addr = r.data.address || {};
    const raw = addr.city || addr.town || addr.county || addr.state || null;
    return normalizeCity(raw);
  } catch (err) {
    return null;
  }
}

// ==== 🟦 格式化 CWA 天氣資料 ====
function formatWeather(locationData) {
  const city = locationData.locationName;
  const Wx = locationData.weatherElement.find((e) => e.elementName === "Wx");
  const PoP = locationData.weatherElement.find(
    (e) => e.elementName === "PoP12h"
  );
  const MinT = locationData.weatherElement.find(
    (e) => e.elementName === "MinT"
  );
  const MaxT = locationData.weatherElement.find(
    (e) => e.elementName === "MaxT"
  );
  const CI = locationData.weatherElement.find((e) => e.elementName === "CI");

  const times = Wx.time;

  const forecasts = times.map((t, i) => ({
    startTime: t.startTime,
    endTime: t.endTime,
    weather: Wx.time[i]?.parameter?.parameterName || "",
    rain: (PoP?.time?.[i]?.parameter?.parameterName || "0") + "%",
    minTemp: (MinT?.time?.[i]?.parameter?.parameterName || "--") + "°C",
    maxTemp: (MaxT?.time?.[i]?.parameter?.parameterName || "--") + "°C",
    comfort: CI?.time?.[i]?.parameter?.parameterName || "",
  }));

  return { city, forecasts };
}

// ==== 🟦 主 Weather API ====
app.get("/api/weather", async (req, res) => {
  try {
    if (!CWA_API_KEY)
      return res.status(500).json({ error: "未設定 CWA_API_KEY" });

    let { city, lat, lng } = req.query;
    let cityName = city ? normalizeCity(city.trim()) : null;

    if (!cityName && lat && lng) cityName = await reverseGeocode(lat, lng);
    if (!cityName)
      return res
        .status(400)
        .json({
          success: false,
          message: "找不到對應的台灣縣市，請提供 city 或 lat+lng",
        });

    const r = await axios.get(CWA_API_BASE_URL, {
      params: { Authorization: CWA_API_KEY, locationName: cityName },
    });

    const locationData = r.data.records.location?.[0];
    if (!locationData)
      return res.json({
        success: false,
        city: cityName,
        message: "查無此地區天氣資料",
      });

    const formatted = formatWeather(locationData);
    res.json({ success: true, city: cityName, data: formatted });
  } catch (err) {
    console.error("天氣 API 錯誤:", err.message);
    res
      .status(500)
      .json({ success: false, message: "伺服器處理失敗", detail: err.message });
  }
});

// ==== 根目錄測試 ====
app.get("/", (req, res) => {
  res.json({
    message: "Weather API 正常運作",
    example: "/api/weather?city=高雄市",
  });
});

app.listen(PORT, () => console.log("🚀 伺服器啟動成功，PORT:", PORT));
