const DEFAULT_QUERY = "Bengaluru";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const AIR_QUALITY_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "pressure_msl",
  "wind_speed_10m",
  "wind_direction_10m",
  "is_day",
  "visibility",
  "dew_point_2m"
];

const HOURLY_FIELDS = [
  "temperature_2m",
  "precipitation_probability",
  "wind_speed_10m",
  "weather_code",
  "is_day"
];

const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "sunrise",
  "sunset",
  "daylight_duration",
  "uv_index_max",
  "wind_speed_10m_max",
  "precipitation_probability_max"
];

const AIR_CURRENT_FIELDS = [
  "us_aqi",
  "pm2_5",
  "pm10",
  "ozone",
  "nitrogen_dioxide"
];

const METRIC_CONFIG = {
  temperature: {
    title: "Temperature trend",
    line: "#4285f4",
    fill: "rgba(66, 133, 244, 0.16)",
    value: (entry) => entry.temperature,
    label: (value) => `${Math.round(value)}°`
  },
  precipitation: {
    title: "Precipitation chance",
    line: "#24a56a",
    fill: "rgba(36, 165, 106, 0.16)",
    value: (entry) => entry.precipitation,
    label: (value) => `${Math.round(value)}%`
  },
  wind: {
    title: "Wind speed",
    line: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.16)",
    value: (entry) => entry.wind,
    label: (value) => `${Math.round(value)} km/h`
  }
};

const HAS_GEOLOCATION = "geolocation" in navigator;

const refs = {
  locationName: document.querySelector("#location-name"),
  timestamp: document.querySelector("#timestamp"),
  heroVisual: document.querySelector("#hero-visual"),
  conditionLabel: document.querySelector("#condition-label"),
  temperatureValue: document.querySelector("#temperature-value"),
  heroCopy: document.querySelector("#hero-copy"),
  statRow: document.querySelector("#stat-row"),
  feelsLikeValue: document.querySelector("#feels-like-value"),
  feelsLikeCopy: document.querySelector("#feels-like-copy"),
  airQualityValue: document.querySelector("#air-quality-value"),
  airQualityCopy: document.querySelector("#air-quality-copy"),
  sunriseValue: document.querySelector("#sunrise-value"),
  sunriseCopy: document.querySelector("#sunrise-copy"),
  statusMessage: document.querySelector("#status-message"),
  trendTitle: document.querySelector("#trend-title"),
  chartShell: document.querySelector("#chart-shell"),
  hourlyStrip: document.querySelector("#hourly-strip"),
  forecastList: document.querySelector("#forecast-list"),
  detailsGrid: document.querySelector("#details-grid"),
  searchForm: document.querySelector("#search-form"),
  locationInput: document.querySelector("#location"),
  searchAction: document.querySelector("#search-action"),
  locationAction: document.querySelector("#location-action"),
  metricButtons: document.querySelectorAll(".mode-tab")
};

const state = {
  metric: "temperature",
  requestId: 0,
  location: null,
  forecast: null,
  air: null
};

refs.metricButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.metric === state.metric) {
      return;
    }

    state.metric = button.dataset.metric;
    updateMetricButtons();
    renderTrendSection();
  });
});

refs.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = refs.locationInput.value.trim();
  if (!query) {
    setStatus("Enter a city or region to search.", "error");
    refs.locationInput.focus();
    return;
  }

  await loadWeather(query);
});

refs.locationAction.addEventListener("click", async () => {
  await loadWeatherByCoordinates();
});

if (!HAS_GEOLOCATION) {
  refs.locationAction.disabled = true;
  refs.locationAction.textContent = "Location unavailable";
  refs.locationAction.title = "Browser geolocation is not supported here.";
}

renderLoadingState();
loadWeather(DEFAULT_QUERY);

async function loadWeather(query) {
  const requestId = ++state.requestId;
  setLoading(true, `Loading live weather for ${query}...`, "search");

  try {
    const location = await geocodeLocation(query);
    if (requestId !== state.requestId) {
      return;
    }

    const hydratedLocation = await hydrateLocation({ ...location, source: "search" }, requestId);
    if (!hydratedLocation || requestId !== state.requestId) {
      return;
    }

    refs.locationInput.value = hydratedLocation.name;
    setStatus(`Live data updated for ${buildStatusLocationLabel(hydratedLocation)}.`, "success");
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    console.error(error);
    setStatus(error.message || "Unable to load live weather data right now.", "error");
  } finally {
    if (requestId === state.requestId) {
      setLoading(false);
    }
  }
}

async function loadWeatherByCoordinates() {
  if (!HAS_GEOLOCATION) {
    setStatus("Browser geolocation is not available on this device.", "error");
    return;
  }

  const requestId = ++state.requestId;
  setLoading(true, "Requesting access to your current location...", "location");

  try {
    const coords = await getBrowserLocation();
    if (requestId !== state.requestId) {
      return;
    }

    const hydratedLocation = await hydrateLocation({
      name: "Current location",
      admin1: "",
      country: "",
      latitude: coords.latitude,
      longitude: coords.longitude,
      timezone: "auto",
      source: "geolocation"
    }, requestId);

    if (!hydratedLocation || requestId !== state.requestId) {
      return;
    }

    refs.locationInput.value = hydratedLocation.name;
    setStatus("Live data updated for your current location.", "success");
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    console.error(error);
    setStatus(error.message || "Unable to access your current location.", "error");
  } finally {
    if (requestId === state.requestId) {
      setLoading(false);
    }
  }
}

async function geocodeLocation(query) {
  const params = new URLSearchParams({
    name: query,
    count: "1",
    language: "en",
    format: "json"
  });

  const data = await fetchJson(`${GEOCODING_ENDPOINT}?${params.toString()}`);
  const location = data.results?.[0];

  if (!location) {
    throw new Error(`No matching location found for "${query}".`);
  }

  return location;
}

async function hydrateLocation(location, requestId) {
  if (location.source === "geolocation") {
    setStatus("Loading live weather for your current location...", "loading");
  }

  const [forecast, air] = await Promise.all([
    fetchForecast(location),
    fetchAirQuality(location)
  ]);

  if (requestId !== state.requestId) {
    return null;
  }

  const hydratedLocation = {
    ...location,
    latitude: forecast.latitude ?? location.latitude,
    longitude: forecast.longitude ?? location.longitude,
    timezone: forecast.timezone || location.timezone
  };

  state.location = hydratedLocation;
  state.forecast = forecast;
  state.air = air;
  renderApp();

  return hydratedLocation;
}

async function fetchForecast(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: CURRENT_FIELDS.join(","),
    hourly: HOURLY_FIELDS.join(","),
    daily: DAILY_FIELDS.join(","),
    timezone: location.timezone || "auto",
    forecast_days: "10",
    wind_speed_unit: "kmh"
  });

  return fetchJson(`${WEATHER_ENDPOINT}?${params.toString()}`);
}

async function fetchAirQuality(location) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: AIR_CURRENT_FIELDS.join(","),
    timezone: location.timezone || "auto"
  });

  return fetchJson(`${AIR_QUALITY_ENDPOINT}?${params.toString()}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.reason || "The weather service returned an error.");
  }

  return data;
}

function renderApp() {
  renderHero();
  updateMetricButtons();
  renderTrendSection();
  renderForecastSection();
  renderDetailsSection();
}

function renderHero() {
  const { location, forecast, air } = state;
  const current = forecast.current;
  const daily = forecast.daily;
  const currentAir = air.current || {};
  const weather = getWeatherMeta(current.weather_code, Boolean(current.is_day));
  const climate = getClimateTheme(weather.icon);
  const airQuality = getAirQualityMeta(currentAir.us_aqi);
  const visibilityKm = toKilometres(current.visibility);

  refs.locationName.textContent = location.name;
  refs.timestamp.textContent = [buildLocationLine(location), formatUpdatedTimestamp(current.time)]
    .filter(Boolean)
    .join(" • ");
  refs.conditionLabel.textContent = weather.label;
  refs.temperatureValue.textContent = Math.round(current.temperature_2m);
  refs.heroCopy.textContent = `${weather.summary} with around ${Math.round(daily.precipitation_probability_max?.[0] ?? 0)}% rain chance, ${Math.round(current.wind_speed_10m)} km/h winds, and ${visibilityKm.toFixed(1)} km visibility.`;
  refs.heroVisual.className = `hero-visual hero-visual-${weather.icon}`;
  refs.heroVisual.style.setProperty("--hero-accent", climate.accent);
  refs.heroVisual.style.setProperty("--hero-accent-soft", climate.soft);
  refs.heroVisual.style.setProperty("--hero-glow", climate.glow);
  refs.heroVisual.innerHTML = buildHeroVisual(weather.icon);

  refs.statRow.innerHTML = [
    `Precipitation: ${Math.round(daily.precipitation_probability_max?.[0] ?? 0)}%`,
    `Humidity: ${Math.round(current.relative_humidity_2m)}%`,
    `Wind: ${Math.round(current.wind_speed_10m)} km/h`
  ].map((item) => `<span class="stat-pill">${escapeHtml(item)}</span>`).join("");

  refs.feelsLikeValue.textContent = `${Math.round(current.apparent_temperature)}°`;
  refs.feelsLikeCopy.textContent = `Actual ${Math.round(current.temperature_2m)}° with dew point near ${Math.round(current.dew_point_2m)}°.`;

  refs.airQualityValue.textContent = currentAir.us_aqi != null ? String(Math.round(currentAir.us_aqi)) : "--";
  refs.airQualityCopy.textContent = currentAir.us_aqi != null
    ? `${airQuality.label} air • PM2.5 ${formatNumber(currentAir.pm2_5, 1)} ug/m3.`
    : "Air-quality data is not available for this location.";

  refs.sunriseValue.textContent = formatClock(daily.sunrise?.[0]);
  refs.sunriseCopy.textContent = `Sunset ${formatClock(daily.sunset?.[0])} • ${formatDaylight(daily.daylight_duration?.[0])}.`;
}

function renderTrendSection() {
  if (!state.forecast) {
    return;
  }

  const config = METRIC_CONFIG[state.metric];
  const entries = buildHourlyEntries();

  refs.trendTitle.textContent = config.title;
  refs.chartShell.innerHTML = buildTrendChart(entries, config);
  refs.hourlyStrip.innerHTML = entries.map((entry, index) => {
    const weather = getWeatherMeta(entry.weatherCode, entry.isDay);
    return `
      <article class="hour-card ${index === 0 ? "active" : ""}">
        <p>${escapeHtml(entry.label)}</p>
        <span class="mini-dot ${escapeHtml(weather.icon)}"></span>
        <strong>${escapeHtml(config.label(config.value(entry)))}</strong>
      </article>
    `;
  }).join("");
}

function renderForecastSection() {
  if (!state.forecast) {
    return;
  }

  const daily = state.forecast.daily;
  const highs = daily.temperature_2m_max.slice(0, 10);
  const lows = daily.temperature_2m_min.slice(0, 10);
  const overallMin = Math.min(...lows);
  const overallMax = Math.max(...highs);
  const range = Math.max(overallMax - overallMin, 1);

  refs.forecastList.innerHTML = daily.time.slice(0, 10).map((time, index) => {
    const low = daily.temperature_2m_min[index];
    const high = daily.temperature_2m_max[index];
    const start = ((low - overallMin) / range) * 100;
    const width = ((high - low) / range) * 100;
    const weather = getWeatherMeta(daily.weather_code[index], true);
    const climate = getClimateTheme(weather.icon);

    return `
      <div class="forecast-row forecast-row-${escapeHtml(weather.icon)}" style="--forecast-accent: ${climate.accent}; --forecast-accent-soft: ${climate.soft}; --forecast-glow: ${climate.glow};">
        <span class="day">${escapeHtml(formatDayLabel(time, index))}</span>
        <div class="forecast-weather">
          ${buildForecastAnimation(weather.icon)}
          <span class="condition">${escapeHtml(weather.shortLabel)}</span>
        </div>
        <div class="temperature-band"><span class="band-fill" style="--start: ${start.toFixed(1)}%; --width: ${width.toFixed(1)}%;"></span></div>
        <strong>${Math.round(high)}°</strong>
        <span class="temp-low">${Math.round(low)}°</span>
      </div>
    `;
  }).join("");
}

function buildForecastAnimation(icon) {
  switch (icon) {
    case "sunny":
      return `
        <span class="forecast-animation forecast-anim-sunny" aria-hidden="true">
          <span class="forecast-sun-core"></span>
          <span class="forecast-sun-ring"></span>
        </span>
      `;
    case "partly":
      return `
        <span class="forecast-animation forecast-anim-partly" aria-hidden="true">
          <span class="forecast-sun-core"></span>
          <span class="forecast-cloud-shape forecast-cloud-small"></span>
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
        </span>
      `;
    case "cloudy":
      return `
        <span class="forecast-animation forecast-anim-cloudy" aria-hidden="true">
          <span class="forecast-cloud-shape forecast-cloud-small"></span>
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
        </span>
      `;
    case "rain":
      return `
        <span class="forecast-animation forecast-anim-rain" aria-hidden="true">
          <span class="forecast-cloud-shape forecast-cloud-small"></span>
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
          <span class="forecast-drop drop-one"></span>
          <span class="forecast-drop drop-two"></span>
          <span class="forecast-drop drop-three"></span>
        </span>
      `;
    case "storm":
      return `
        <span class="forecast-animation forecast-anim-storm" aria-hidden="true">
          <span class="forecast-cloud-shape forecast-cloud-small"></span>
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
          <span class="forecast-bolt"></span>
        </span>
      `;
    case "snow":
      return `
        <span class="forecast-animation forecast-anim-snow" aria-hidden="true">
          <span class="forecast-cloud-shape forecast-cloud-small"></span>
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
          <span class="forecast-flake flake-one"></span>
          <span class="forecast-flake flake-two"></span>
          <span class="forecast-flake flake-three"></span>
        </span>
      `;
    case "fog":
      return `
        <span class="forecast-animation forecast-anim-fog" aria-hidden="true">
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
          <span class="forecast-fog-line fog-one"></span>
          <span class="forecast-fog-line fog-two"></span>
        </span>
      `;
    case "moon":
      return `
        <span class="forecast-animation forecast-anim-moon" aria-hidden="true">
          <span class="forecast-moon-core"></span>
        </span>
      `;
    default:
      return `
        <span class="forecast-animation forecast-anim-cloudy" aria-hidden="true">
          <span class="forecast-cloud-shape forecast-cloud-small"></span>
          <span class="forecast-cloud-shape forecast-cloud-main"></span>
        </span>
      `;
  }
}

function renderDetailsSection() {
  if (!state.forecast) {
    return;
  }

  const current = state.forecast.current;
  const daily = state.forecast.daily;
  const currentAir = state.air.current || {};
  const airQuality = getAirQualityMeta(currentAir.us_aqi);
  const visibilityKm = toKilometres(current.visibility);

  const details = [
    {
      title: "Wind",
      value: `${Math.round(current.wind_speed_10m)} km/h`,
      copy: `${degreesToCompass(current.wind_direction_10m)} breeze with peaks near ${Math.round(daily.wind_speed_10m_max?.[0] ?? current.wind_speed_10m)} km/h.`,
      fill: clamp((current.wind_speed_10m / 40) * 100, 12, 100)
    },
    {
      title: "Humidity",
      value: `${Math.round(current.relative_humidity_2m)}%`,
      copy: `Moisture is sitting in a comfortable range for the next few hours.`,
      fill: clamp(current.relative_humidity_2m, 8, 100)
    },
    {
      title: "UV index",
      value: `${formatNumber(daily.uv_index_max?.[0], 1)}`,
      copy: uvSummary(daily.uv_index_max?.[0]),
      fill: clamp(((daily.uv_index_max?.[0] ?? 0) / 11) * 100, 8, 100)
    },
    {
      title: "Pressure",
      value: `${Math.round(current.pressure_msl)} hPa`,
      copy: `Pressure is staying fairly stable across the region.`,
      fill: clamp(((current.pressure_msl - 980) / 60) * 100, 8, 100)
    },
    {
      title: "Visibility",
      value: `${visibilityKm.toFixed(1)} km`,
      copy: `${visibilityKm >= 8 ? "Good" : "Reduced"} visibility for outdoor plans right now.`,
      fill: clamp((visibilityKm / 10) * 100, 8, 100)
    },
    {
      title: "Dew point",
      value: `${Math.round(current.dew_point_2m)}°`,
      copy: `This is the temperature where moisture would begin condensing.`,
      fill: clamp(((current.dew_point_2m + 10) / 40) * 100, 8, 100)
    },
    {
      title: "Sunrise & sunset",
      value: formatClock(daily.sunrise?.[0]),
      copy: `Sunset ${formatClock(daily.sunset?.[0])} • ${formatDaylight(daily.daylight_duration?.[0])}.`,
      className: "sunrise-card"
    },
    {
      title: "Air quality",
      value: airQuality.label,
      copy: currentAir.us_aqi != null
        ? `AQI ${Math.round(currentAir.us_aqi)} • Ozone ${formatNumber(currentAir.ozone, 1)} ug/m3.`
        : "Air-quality data is not available for this location.",
      className: "air-card"
    }
  ];

  refs.detailsGrid.innerHTML = details.map((detail) => {
    const meter = detail.fill != null
      ? `<div class="detail-meter"><span style="--fill: ${detail.fill.toFixed(1)}%;"></span></div>`
      : "";

    return `
      <article class="detail-card ${detail.className || ""}">
        <p>${escapeHtml(detail.title)}</p>
        <h3>${escapeHtml(detail.value)}</h3>
        <span>${escapeHtml(detail.copy)}</span>
        ${meter}
      </article>
    `;
  }).join("");
}

function buildHourlyEntries() {
  const { current, hourly } = state.forecast;
  const firstHourlyIndex = findHourlyStartIndex(hourly.time, current.time);
  const entries = [
    {
      label: "Now",
      temperature: current.temperature_2m,
      precipitation: hourly.precipitation_probability[firstHourlyIndex] ?? 0,
      wind: current.wind_speed_10m,
      weatherCode: current.weather_code,
      isDay: Boolean(current.is_day)
    }
  ];

  for (let offset = 0; offset < 7; offset += 1) {
    const index = Math.min(firstHourlyIndex + offset, hourly.time.length - 1);
    entries.push({
      label: formatHourLabel(hourly.time[index]),
      temperature: hourly.temperature_2m[index],
      precipitation: hourly.precipitation_probability[index] ?? 0,
      wind: hourly.wind_speed_10m[index],
      weatherCode: hourly.weather_code[index],
      isDay: Boolean(hourly.is_day[index])
    });
  }

  return entries;
}

function findHourlyStartIndex(times, currentTime) {
  const currentValue = parseLocalDateTime(currentTime).getTime();
  const index = times.findIndex((time) => parseLocalDateTime(time).getTime() >= currentValue);
  return index >= 0 ? index : 0;
}

function buildTrendChart(entries, config) {
  const width = 760;
  const height = 250;
  const left = 56;
  const right = 704;
  const top = 64;
  const bottom = 176;
  const values = entries.map((entry) => config.value(entry));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const step = entries.length > 1 ? (right - left) / (entries.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = left + step * index;
    const ratio = range === 0 ? 0.5 : (value - min) / range;
    const y = bottom - ratio * (bottom - top);
    return { x, y, value };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${right} 208 L ${left} 208 Z`;
  const labels = points.map((point, index) => {
    if (index !== 0 && index !== points.length - 1 && index % 2 !== 0) {
      return "";
    }

    return `<text x="${point.x.toFixed(1)}" y="${(point.y - 14).toFixed(1)}">${escapeHtml(config.label(point.value))}</text>`;
  }).join("");

  const circles = points.map((point) => `
    <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="6"></circle>
  `).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="trend-chart" aria-hidden="true">
      <path d="M56 180H704" class="grid-line"></path>
      <path d="M56 122H704" class="grid-line"></path>
      <path d="M56 64H704" class="grid-line"></path>
      <path d="${areaPath}" fill="${config.fill}"></path>
      <path d="${linePath}" fill="none" stroke="${config.line}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
      <g class="chart-points" fill="#ffffff" stroke="${config.line}" stroke-width="4">${circles}</g>
      <g class="chart-values">${labels}</g>
    </svg>
  `;
}

function buildHeroVisual(icon) {
  return `
    <div class="hero-scene hero-scene-${icon}" aria-hidden="true">
      <span class="hero-side-beam beam-left"></span>
      <span class="hero-side-beam beam-right"></span>
      <span class="hero-orbit orbit-one"></span>
      <span class="hero-orbit orbit-two"></span>
      <span class="hero-particle particle-one"></span>
      <span class="hero-particle particle-two"></span>
      <span class="hero-particle particle-three"></span>
      <div class="hero-climate-core">
        ${buildHeroClimateCore(icon)}
      </div>
      <span class="hero-floor-glow"></span>
    </div>
  `;
}

function buildHeroClimateCore(icon) {
  switch (icon) {
    case "sunny":
      return `
        <span class="hero-sun-halo"></span>
        <span class="hero-sun-ring"></span>
        <span class="hero-sun-core"></span>
      `;
    case "partly":
      return `
        <span class="hero-sun-halo"></span>
        <span class="hero-sun-core"></span>
        <span class="hero-cloud hero-cloud-back"></span>
        <span class="hero-cloud hero-cloud-main"></span>
      `;
    case "cloudy":
      return `
        <span class="hero-cloud hero-cloud-back hero-cloud-wide"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front"></span>
      `;
    case "fog":
      return `
        <span class="hero-cloud hero-cloud-back hero-cloud-wide"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front"></span>
        <span class="hero-fog-line fog-one"></span>
        <span class="hero-fog-line fog-two"></span>
        <span class="hero-fog-line fog-three"></span>
      `;
    case "rain":
      return `
        <span class="hero-cloud hero-cloud-back"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front"></span>
        <span class="hero-rain-drop rain-one"></span>
        <span class="hero-rain-drop rain-two"></span>
        <span class="hero-rain-drop rain-three"></span>
      `;
    case "storm":
      return `
        <span class="hero-cloud hero-cloud-back hero-cloud-wide"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front"></span>
        <span class="hero-bolt"></span>
        <span class="hero-rain-drop rain-one"></span>
        <span class="hero-rain-drop rain-two"></span>
      `;
    case "snow":
      return `
        <span class="hero-cloud hero-cloud-back"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front"></span>
        <span class="hero-snow-dot snow-one"></span>
        <span class="hero-snow-dot snow-two"></span>
        <span class="hero-snow-dot snow-three"></span>
      `;
    case "moon":
      return `
        <span class="hero-star star-one"></span>
        <span class="hero-star star-two"></span>
        <span class="hero-moon-core"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front night-cloud"></span>
      `;
    default:
      return `
        <span class="hero-sun-halo"></span>
        <span class="hero-sun-core"></span>
        <span class="hero-cloud hero-cloud-main hero-cloud-front"></span>
      `;
  }
}

function getClimateTheme(icon) {
  const themes = {
    sunny: {
      accent: "#f7c64f",
      soft: "rgba(247, 198, 79, 0.22)",
      glow: "rgba(247, 198, 79, 0.46)"
    },
    partly: {
      accent: "#f0b24b",
      soft: "rgba(240, 178, 75, 0.2)",
      glow: "rgba(240, 178, 75, 0.42)"
    },
    cloudy: {
      accent: "#9eb8d8",
      soft: "rgba(158, 184, 216, 0.2)",
      glow: "rgba(158, 184, 216, 0.38)"
    },
    fog: {
      accent: "#93afcc",
      soft: "rgba(147, 175, 204, 0.18)",
      glow: "rgba(147, 175, 204, 0.34)"
    },
    rain: {
      accent: "#4285f4",
      soft: "rgba(66, 133, 244, 0.22)",
      glow: "rgba(66, 133, 244, 0.42)"
    },
    storm: {
      accent: "#6677ff",
      soft: "rgba(102, 119, 255, 0.2)",
      glow: "rgba(247, 198, 79, 0.38)"
    },
    snow: {
      accent: "#88b7ff",
      soft: "rgba(136, 183, 255, 0.2)",
      glow: "rgba(136, 183, 255, 0.38)"
    },
    moon: {
      accent: "#c8d9ff",
      soft: "rgba(200, 217, 255, 0.18)",
      glow: "rgba(200, 217, 255, 0.32)"
    }
  };

  return themes[icon] || themes.partly;
}

function getWeatherMeta(code, isDay) {
  if (code === 0) {
    return isDay
      ? { label: "Clear sky", shortLabel: "Clear", icon: "sunny", summary: "Bright and clear" }
      : { label: "Clear night", shortLabel: "Clear", icon: "moon", summary: "Calm and clear" };
  }

  if ([1, 2].includes(code)) {
    return isDay
      ? { label: "Partly cloudy", shortLabel: "Partly cloudy", icon: "partly", summary: "A mix of sun and clouds" }
      : { label: "Mostly clear", shortLabel: "Mostly clear", icon: "moon", summary: "Mostly clear skies" };
  }

  if (code === 3) {
    return { label: "Overcast", shortLabel: "Cloudy", icon: "cloudy", summary: "Cloud cover is dominating" };
  }

  if ([45, 48].includes(code)) {
    return { label: "Fog", shortLabel: "Fog", icon: "fog", summary: "Foggy conditions are reducing clarity" };
  }

  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: "Rain", shortLabel: "Rain", icon: "rain", summary: "Wet weather is moving through" };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: "Snow", shortLabel: "Snow", icon: "snow", summary: "Cold wintry weather is in place" };
  }

  if ([95, 96, 99].includes(code)) {
    return { label: "Thunderstorm", shortLabel: "Storm", icon: "storm", summary: "Storm activity is in the area" };
  }

  return { label: "Partly cloudy", shortLabel: "Partly cloudy", icon: isDay ? "partly" : "moon", summary: "Conditions are changing through the day" };
}

function getAirQualityMeta(aqi) {
  if (aqi == null || Number.isNaN(aqi)) {
    return { label: "Unavailable", tone: "muted" };
  }

  if (aqi <= 50) {
    return { label: "Good", tone: "good" };
  }

  if (aqi <= 100) {
    return { label: "Moderate", tone: "fair" };
  }

  if (aqi <= 150) {
    return { label: "Unhealthy for sensitive groups", tone: "moderate" };
  }

  if (aqi <= 200) {
    return { label: "Unhealthy", tone: "poor" };
  }

  if (aqi <= 300) {
    return { label: "Very unhealthy", tone: "very-poor" };
  }

  return { label: "Hazardous", tone: "hazardous" };
}

function renderLoadingState() {
  refs.chartShell.innerHTML = '<p class="placeholder">Loading chart...</p>';
  refs.hourlyStrip.innerHTML = '<article class="hour-card active"><p>Loading</p><strong>--</strong></article>';
  refs.forecastList.innerHTML = '<div class="forecast-row placeholder-row">Loading 10-day forecast...</div>';
  refs.detailsGrid.innerHTML = '<article class="detail-card"><p>Loading</p><h3>--</h3><span>Waiting for live weather details.</span></article>';
}

function updateMetricButtons() {
  refs.metricButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.metric === state.metric);
  });
}

function setLoading(isLoading, message = "", action = "search") {
  document.body.classList.toggle("is-loading", isLoading);
  refs.searchAction.disabled = isLoading;
  refs.locationAction.disabled = isLoading || !HAS_GEOLOCATION;
  refs.searchAction.textContent = isLoading && action === "search" ? "Loading..." : "Search";
  refs.locationAction.textContent = !HAS_GEOLOCATION
    ? "Location unavailable"
    : isLoading && action === "location"
      ? "Locating..."
      : "Use my location";

  if (message) {
    setStatus(message, isLoading ? "loading" : "info");
  }
}

function setStatus(message, stateName = "info") {
  refs.statusMessage.textContent = message;
  refs.statusMessage.dataset.state = stateName;
}

function buildLocationLine(location) {
  if (location?.source === "geolocation") {
    return "Detected from your browser";
  }

  return [location.admin1, location.country].filter(Boolean).join(", ");
}

function buildStatusLocationLabel(location) {
  return buildLocationLine(location) || location.name;
}

function formatUpdatedTimestamp(time) {
  const date = parseLocalDateTime(time);
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
  const clock = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);

  return `${day} • Updated ${clock}`;
}

function formatDayLabel(value, index) {
  if (index === 0) {
    return "Today";
  }

  if (index === 1) {
    return "Tomorrow";
  }

  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(parseLocalDateTime(value));
}

function formatHourLabel(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(parseLocalDateTime(value));
}

function formatClock(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(parseLocalDateTime(value));
}

function formatDaylight(seconds) {
  if (!seconds && seconds !== 0) {
    return "daylight unavailable";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m daylight`;
}

function uvSummary(value) {
  if (value == null) {
    return "UV data is not available right now.";
  }

  if (value < 3) {
    return "Low UV through the day.";
  }

  if (value < 6) {
    return "Moderate UV, light protection helps.";
  }

  if (value < 8) {
    return "High UV around the midday period.";
  }

  if (value < 11) {
    return "Very high UV, shade and sunscreen matter.";
  }

  return "Extreme UV conditions are possible today.";
}

function degreesToCompass(degrees) {
  if (degrees == null || Number.isNaN(degrees)) {
    return "Variable";
  }

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % directions.length;
  return directions[index];
}

function parseLocalDateTime(value) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);

  if (!timePart) {
    return new Date(year, month - 1, day);
  }

  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute || 0);
}

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        reject(new Error(getGeolocationErrorMessage(error)));
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

function getGeolocationErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission was denied. Allow access and try again.";
    case error.POSITION_UNAVAILABLE:
      return "Your location could not be determined right now.";
    case error.TIMEOUT:
      return "Location request timed out. Please try again.";
    default:
      return "Unable to access your current location.";
  }
}

function toKilometres(valueInMeters) {
  return (valueInMeters || 0) / 1000;
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return Number(value).toFixed(digits);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
