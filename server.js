require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定地區天氣預報（單一或多地區）
 * 支援傳入：
 * - ?city=臺北市
 * - ?cities=臺北市,高雄市
 * - ?lat=25.033&lng=121.565 (單一座標會做反向地理定位)
 * - ?coords=25.033,121.565;22.627,120.301 (多座標，以分號分隔)
 * 若沒有傳入位置，會嘗試使用 IP geolocation 作為 fallback
 */
const getWeatherByLocation = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 解析輸入，決定要查詢哪些地區
    const { city, cities, lat, lng, coords } = req.query;

    const toQueryNames = [];

    // 若傳入 city 或 cities
    if (city) {
      toQueryNames.push(city.trim());
    } else if (cities) {
      cities
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => toQueryNames.push(c));
    }

    // 若傳入單一 lat,lng
    const userAgent = process.env.USER_AGENT || "weather-backend/1.0";
    const nominatimHeaders = { "User-Agent": userAgent };

    if (lat && lng) {
      const name = await reverseGeocode(lat, lng, nominatimHeaders);
      if (name) toQueryNames.push(name);
    }

    // 若傳入 coords (多個座標對，格式: lat,lng;lat,lng;...)
    if (coords) {
      const pairs = coords
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean);
      for (const pair of pairs) {
        const [plat, plng] = pair.split(",").map((s) => s.trim());
        if (plat && plng) {
          const name = await reverseGeocode(plat, plng, nominatimHeaders);
          if (name) toQueryNames.push(name);
        }
      }
    }

    // 如果到現在還沒有任何地區名稱，嘗試用 IP geolocation (fallback)
    if (toQueryNames.length === 0) {
      try {
        const ip =
          req.ip ||
          req.headers["x-forwarded-for"] ||
          req.connection.remoteAddress;
        // 使用 ipapi.co 作為簡易 fallback
        const geoRes = await axios.get(`https://ipapi.co/${ip}/json/`);
        const ipCity =
          geoRes.data.city || geoRes.data.region || geoRes.data.country_name;
        if (ipCity) toQueryNames.push(ipCity);
      } catch (err) {
        // ignore fallback errors
      }
    }

    if (toQueryNames.length === 0) {
      return res.status(400).json({
        success: false,
        error: "需要位置參數",
        message: "請提供 city|cities|lat+lng|coords 或啟用 IP 定位",
      });
    }

    // 去重
    const uniqueNames = [...new Set(toQueryNames)];

    // 為每個地區呼叫 CWA API
    const results = await Promise.all(
      uniqueNames.map(async (name) => {
        try {
          const r = await axios.get(
            `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
            {
              params: { Authorization: CWA_API_KEY, locationName: name },
            }
          );

          const locationData =
            r.data.records.location && r.data.records.location[0];
          if (!locationData) return { name, error: "無資料" };

          const weatherData = formatLocationWeather(
            r.data.records,
            locationData
          );
          return { name, success: true, data: weatherData };
        } catch (err) {
          return { name, success: false, error: err.message };
        }
      })
    );

    res.json({ success: true, query: uniqueNames, results });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      // API 回應錯誤
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    // 其他錯誤
    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

/**
 * 反向地理編碼：使用 Nominatim（OpenStreetMap）回傳地區名稱
 * 優先回傳 city/town/county 等欄位
 */
async function reverseGeocode(lat, lon, headers = {}) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lon)}&accept-language=zh-TW`;
    const r = await axios.get(url, { headers });
    const addr = r.data.address || {};
    // 優先 city -> town -> county -> state
    return addr.city || addr.town || addr.county || addr.state || null;
  } catch (e) {
    return null;
  }
}

/**
 * 依據 CWA 回傳原始紀錄與 locationData 組裝我們需要的格式
 */
function formatLocationWeather(records, locationData) {
  const datasetDescription = records.datasetDescription || "";
  const weatherData = {
    city: locationData.locationName,
    updateTime: datasetDescription,
    forecasts: [],
  };

  const weatherElements = locationData.weatherElement;
  const timeCount =
    (weatherElements &&
      weatherElements[0] &&
      weatherElements[0].time &&
      weatherElements[0].time.length) ||
    0;

  for (let i = 0; i < timeCount; i++) {
    const forecast = {
      startTime: weatherElements[0].time[i].startTime,
      endTime: weatherElements[0].time[i].endTime,
      weather: "",
      rain: "",
      minTemp: "",
      maxTemp: "",
      comfort: "",
      windSpeed: "",
    };

    weatherElements.forEach((element) => {
      const value = element.time[i].parameter;
      switch (element.elementName) {
        case "Wx":
          forecast.weather = value.parameterName;
          break;
        case "PoP":
          forecast.rain = value.parameterName + "%";
          break;
        case "MinT":
          forecast.minTemp = value.parameterName + "°C";
          break;
        case "MaxT":
          forecast.maxTemp = value.parameterName + "°C";
          break;
        case "CI":
          forecast.comfort = value.parameterName;
          break;
        case "WS":
          forecast.windSpeed = value.parameterName;
          break;
      }
    });

    weatherData.forecasts.push(forecast);
  }

  return weatherData;
}

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      weather: "/api/weather?city=臺北市  或  ?lat=25.033&lng=121.565",
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 取得高雄天氣預報
// 新的通用天氣 API：支援 city|cities|lat&lng|coords
app.get("/api/weather", getWeatherByLocation);

// 向下相容：原本的 kaohsiung 路由會導向 city=高雄市
app.get("/api/weather/kaohsiung", (req, res) => {
  req.query.city = "高雄市";
  return getWeatherByLocation(req, res);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器運行已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});
