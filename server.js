require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY; // CWA API Key

// 台灣主要城市列表 (需與前端 CITIES 列表一致)
const VALID_CITIES = [
  "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
  "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
  "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 取得指定城市的天氣預報
 * @param {string} cityName - 城市名稱，例如: "臺北市"
 */
const getWeatherByCity = async (req, res) => {
  // 從 URL 參數取得城市名稱
  const { cityName } = req.params;

  // 1. 檢查城市名稱是否合法 (防止 API 注入)
  if (!VALID_CITIES.includes(cityName)) {
    return res.status(400).json({
      success: false,
      error: "輸入錯誤",
      message: "不支援該城市名稱的天氣查詢。",
    });
  }

  try {
    if (!CWA_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 呼叫 CWA API - 一般天氣預報（36小時），動態傳入城市名稱
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: {
          Authorization: CWA_API_KEY,
          locationName: cityName,
        },
      }
    );

    // 取得指定城市的天氣資料
    const locationData = response.data.records.location.find(
      (loc) => loc.locationName === cityName
    );

    if (!locationData) {
      return res.status(404).json({
        success: false,
        error: "查無資料",
        message: `無法取得 ${cityName} 的天氣資料`,
      });
    }

    // 整理天氣資料 (與原程式碼邏輯相同)
    const weatherData = {
      city: locationData.locationName,
      updateTime: response.data.records.datasetDescription,
      forecasts: [],
    };

    const weatherElements = locationData.weatherElement;
    const timeCount = weatherElements[0].time.length;

    for (let i = 0; i < timeCount; i++) {
      const forecast = {};

      weatherElements.forEach((element) => {
        const value = element.time[i].parameter;
        const startTime = element.time[i].startTime;
        const endTime = element.time[i].endTime;

        switch (element.elementName) {
          case "Wx":
            forecast.weather = value.parameterName;
            forecast.startTime = startTime;
            forecast.endTime = endTime;
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
        }
      });

      weatherData.forecasts.push(forecast);
    }

    res.json({
      success: true,
      data: weatherData,
    });
  } catch (error) {
    console.error(`取得 ${cityName} 資料失敗:`, error.message);

    const status = error.response ? error.response.status : 500;
    const message = error.response ? (error.response.data.message || "無法取得天氣資料") : "伺服器內部錯誤";