const DEFAULT_QUERY = "Bengaluru";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const AIR_QUALITY_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";
const SAVED_CITIES_STORAGE_KEY = "weatherx.saved-cities";
const MAX_SAVED_CITIES = 6;

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
    key: "temperature",
    title: "Temperature trend",
    line: "#4285f4",
    fill: "rgba(66, 133, 244, 0.16)",
    soft: "rgba(66, 133, 244, 0.14)",
    glow: "rgba(66, 133, 244, 0.26)",
    value: (entry) => entry.temperature,
    label: (value) => `${Math.round(value)}°`
  },
  precipitation: {
    key: "precipitation",
    title: "Precipitation chance",
    line: "#24a56a",
    fill: "rgba(36, 165, 106, 0.16)",
    soft: "rgba(36, 165, 106, 0.14)",
    glow: "rgba(36, 165, 106, 0.24)",
    value: (entry) => entry.precipitation,
    label: (value) => `${Math.round(value)}%`
  },
  wind: {
    key: "wind",
    title: "Wind speed",
    line: "#f59e0b",
    fill: "rgba(245, 158, 11, 0.16)",
    soft: "rgba(245, 158, 11, 0.14)",
    glow: "rgba(245, 158, 11, 0.24)",
    value: (entry) => entry.wind,
    label: (value) => `${Math.round(value)} km/h`
  }
};

const HAS_GEOLOCATION = "geolocation" in navigator;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  hourlySlider: document.querySelector("#hourly-slider"),
  hourlyStrip: document.querySelector("#hourly-strip"),
  hourlyPrev: document.querySelector("#hourly-prev"),
  hourlyNext: document.querySelector("#hourly-next"),
  forecastList: document.querySelector("#forecast-list"),
  detailsGrid: document.querySelector("#details-grid"),
  searchForm: document.querySelector("#search-form"),
  locationInput: document.querySelector("#location"),
  searchAction: document.querySelector("#search-action"),
  saveCityAction: document.querySelector("#save-city-action"),
  locationAction: document.querySelector("#location-action"),
  savedCitiesCount: document.querySelector("#saved-cities-count"),
  savedCitiesCopy: document.querySelector("#saved-cities-copy"),
  savedCitiesList: document.querySelector("#saved-cities-list"),
  metricButtons: document.querySelectorAll(".mode-tab")
};

const state = {
  metric: "temperature",
  activeHourIndex: 0,
  requestId: 0,
  savedCitiesRequestId: 0,
  isLoading: false,
  location: null,
  forecast: null,
  air: null,
  savedCities: loadSavedCities(),
  savedCityWeather: [],
  savedCitiesLoading: false
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

refs.saveCityAction.addEventListener("click", () => {
  addCurrentCityToSavedList();
});

refs.hourlyStrip.addEventListener("click", (event) => {
  const card = event.target.closest(".hour-card");
  if (!card) {
    return;
  }

  const nextIndex = Number(card.dataset.hourIndex);
  if (Number.isNaN(nextIndex) || nextIndex === state.activeHourIndex) {
    return;
  }

  state.activeHourIndex = nextIndex;
  renderTrendSection();
});

refs.hourlyPrev.addEventListener("click", () => {
  scrollHourlyStrip(-1);
});

refs.hourlyNext.addEventListener("click", () => {
  scrollHourlyStrip(1);
});

refs.hourlyStrip.addEventListener("scroll", syncHourlySliderState, { passive: true });
window.addEventListener("resize", syncHourlySliderState);

refs.savedCitiesList.addEventListener("click", async (event) => {
  const removeButton = event.target.closest(".saved-city-remove");
  if (removeButton) {
    removeSavedCity(removeButton.dataset.cityKey);
    return;
  }

  const cityButton = event.target.closest(".saved-city-main");
  if (!cityButton) {
    return;
  }

  await loadSavedCity(cityButton.dataset.cityKey);
});

if (!HAS_GEOLOCATION) {
  refs.locationAction.disabled = true;
  refs.locationAction.textContent = "Location unavailable";
  refs.locationAction.title = "Browser geolocation is not supported here.";
}

renderLoadingState();
requestAnimationFrame(() => {
  document.body.classList.add("app-ready");
  syncHourlySliderState();
});
refreshSavedCitiesWeather();
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
  syncCurrentLocationWithSavedCities();
  renderHero();
  updateMetricButtons();
  renderTrendSection();
  renderForecastSection();
  renderSavedCitiesSection();
  renderDetailsSection();
  requestAnimationFrame(syncHourlySliderState);
}

function renderHero() {
  const { location, forecast, air } = state;
  const current = forecast.current;
  const daily = forecast.daily;
  const currentAir = air.current || {};
  const weather = getWeatherMeta(current.weather_code, Boolean(current.is_day));
  const climate = getClimateTheme(weather);
  const airQuality = getAirQualityMeta(currentAir.us_aqi);
  const visibilityKm = toKilometres(current.visibility);

  refs.locationName.textContent = location.name;
  refs.timestamp.textContent = [buildLocationLine(location), formatUpdatedTimestamp(current.time)]
    .filter(Boolean)
    .join(" • ");
  refs.conditionLabel.textContent = weather.label;
  refs.temperatureValue.textContent = Math.round(current.temperature_2m);
  refs.heroCopy.textContent = `${weather.summary} with around ${Math.round(daily.precipitation_probability_max?.[0] ?? 0)}% rain chance, ${Math.round(current.wind_speed_10m)} km/h winds, and ${visibilityKm.toFixed(1)} km visibility.`;
  refs.heroVisual.className = `hero-visual hero-visual-${weather.icon} hero-visual-motion-${weather.motion}`;
  refs.heroVisual.style.setProperty("--hero-accent", climate.accent);
  refs.heroVisual.style.setProperty("--hero-accent-soft", climate.soft);
  refs.heroVisual.style.setProperty("--hero-glow", climate.glow);
  refs.heroVisual.innerHTML = buildHeroVisual(weather);

  refs.statRow.innerHTML = [
    { label: "Precipitation", value: `${Math.round(daily.precipitation_probability_max?.[0] ?? 0)}%` },
    { label: "Humidity", value: `${Math.round(current.relative_humidity_2m)}%` },
    { label: "Wind", value: `${Math.round(current.wind_speed_10m)} km/h` }
  ].map((item) => `
    <span class="stat-pill">
      <span class="stat-pill-label">${escapeHtml(item.label)}</span>
      <strong class="stat-pill-value">${escapeHtml(item.value)}</strong>
    </span>
  `).join("");

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
  state.activeHourIndex = clamp(state.activeHourIndex, 0, entries.length - 1);

  refs.trendTitle.textContent = config.title;
  refs.chartShell.style.setProperty("--metric-line", config.line);
  refs.chartShell.style.setProperty("--metric-soft", config.soft);
  refs.chartShell.style.setProperty("--metric-glow", config.glow);
  refs.chartShell.innerHTML = buildTrendChart(entries, config, state.activeHourIndex);
  refs.hourlyStrip.innerHTML = entries.map((entry, index) => {
    const weather = getWeatherMeta(entry.weatherCode, entry.isDay);
    const climate = getClimateTheme(weather);
    return `
      <button class="hour-card ${index === state.activeHourIndex ? "active" : ""}" type="button" data-hour-index="${index}" style="--card-index: ${index}; --card-accent: ${climate.accent}; --card-tone: ${climate.soft}; --card-glow: ${climate.glow};">
        <p>${escapeHtml(entry.label)}</p>
        ${buildWeatherGlyph(weather, "hourly")}
        <strong>${escapeHtml(config.label(config.value(entry)))}</strong>
        <span class="hour-card-note">${escapeHtml(weather.shortLabel)}</span>
      </button>
    `;
  }).join("");

  requestAnimationFrame(() => {
    focusActiveHourCard();
    syncHourlySliderState();
  });
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
    const climate = getClimateTheme(weather);

    return `
      <div class="forecast-row forecast-row-${escapeHtml(weather.icon)} forecast-row-motion-${escapeHtml(weather.motion)}" style="--forecast-accent: ${climate.accent}; --forecast-accent-soft: ${climate.soft}; --forecast-glow: ${climate.glow}; --card-index: ${index};">
        <span class="day">${escapeHtml(formatDayLabel(time, index))}</span>
        <div class="forecast-weather">
          ${buildWeatherGlyph(weather, "forecast")}
          <span class="condition">${escapeHtml(weather.shortLabel)}</span>
        </div>
        <div class="temperature-band"><span class="band-fill" style="--start: ${start.toFixed(1)}%; --width: ${width.toFixed(1)}%;"></span></div>
        <strong>${Math.round(high)}°</strong>
        <span class="temp-low">${Math.round(low)}°</span>
      </div>
    `;
  }).join("");
}

function buildForecastAnimation(weather) {
  return buildWeatherGlyph(weather, "forecast");
}

function buildWeatherGlyph(weatherOrIcon, variant = "forecast") {
  const weather = normalizeWeatherDescriptor(weatherOrIcon);
  return `
    <span class="weather-glyph weather-glyph-${variant} weather-glyph-${weather.icon} weather-glyph-motion-${weather.motion}" aria-hidden="true">
      <svg viewBox="0 0 48 48" class="weather-glyph-canvas" focusable="false">
        ${buildWeatherGlyphSvg(weather, variant)}
      </svg>
    </span>
  `;
}

function normalizeWeatherDescriptor(weatherOrIcon) {
  if (typeof weatherOrIcon === "string") {
    return {
      icon: weatherOrIcon,
      motion: weatherOrIcon === "moon" ? "night" : weatherOrIcon
    };
  }

  return {
    ...weatherOrIcon,
    motion: weatherOrIcon.motion || (weatherOrIcon.icon === "moon" ? "night" : weatherOrIcon.icon)
  };
}

function buildWeatherGlyphSvg(weatherOrIcon, variant = "forecast") {
  const weather = normalizeWeatherDescriptor(weatherOrIcon);
  const cloud = `
    <g class="wx-cloud">
      <ellipse class="wx-cloud-back" cx="17" cy="27" rx="8" ry="6"></ellipse>
      <ellipse class="wx-cloud-front" cx="28" cy="23" rx="11" ry="9"></ellipse>
      <ellipse class="wx-cloud-front" cx="37" cy="29" rx="7" ry="6"></ellipse>
      <rect class="wx-cloud-base" x="11" y="28" width="29" height="10" rx="5"></rect>
    </g>
  `;

  const darkCloud = `
    <g class="wx-cloud wx-cloud-storm">
      <ellipse class="wx-cloud-back" cx="17" cy="27" rx="8" ry="6"></ellipse>
      <ellipse class="wx-cloud-front" cx="28" cy="23" rx="11" ry="9"></ellipse>
      <ellipse class="wx-cloud-front" cx="37" cy="29" rx="7" ry="6"></ellipse>
      <rect class="wx-cloud-base" x="11" y="28" width="29" height="10" rx="5"></rect>
    </g>
  `;

  const sun = `
    <g class="wx-sun">
      <circle class="wx-sun-glow" cx="21" cy="19" r="12"></circle>
      <circle class="wx-sun-ring" cx="21" cy="19" r="15"></circle>
      <circle class="wx-sun-core" cx="21" cy="19" r="10"></circle>
    </g>
  `;

  const snow = `
    <g class="wx-snow">
      <g class="wx-flake wx-flake-1">
        <line x1="14" y1="36" x2="14" y2="42"></line>
        <line x1="11" y1="39" x2="17" y2="39"></line>
      </g>
      <g class="wx-flake wx-flake-2">
        <line x1="23" y1="37" x2="23" y2="43"></line>
        <line x1="20" y1="40" x2="26" y2="40"></line>
      </g>
      <g class="wx-flake wx-flake-3">
        <line x1="32" y1="36" x2="32" y2="42"></line>
        <line x1="29" y1="39" x2="35" y2="39"></line>
      </g>
    </g>
  `;

  const fog = `
    <g class="wx-fog">
      <line class="wx-fog-line wx-fog-line-1" x1="13" y1="36" x2="36" y2="36"></line>
      <line class="wx-fog-line wx-fog-line-2" x1="16" y1="41" x2="39" y2="41"></line>
    </g>
  `;

  switch (weather.icon) {
    case "sunny":
      return sun;
    case "partly":
      return `${sun}${cloud}`;
    case "cloudy":
      return cloud;
    case "rain":
      return `${cloud}${buildRainGlyph(weather.motion, variant)}`;
    case "storm":
      return `${darkCloud}${buildStormGlyph(variant)}`;
    case "snow":
      return `${cloud}${snow}`;
    case "fog":
      return `${cloud}${fog}`;
    case "moon":
      return `
        <g class="wx-moon">
          <path class="wx-moon-core" d="M29 9C24 9.7 20.3 14 20.3 19.2C20.3 24.8 24.8 29.3 30.4 29.3C33 29.3 35.3 28.4 37 27C35.5 31.3 31.4 34.4 26.6 34.4C20.5 34.4 15.5 29.5 15.5 23.3C15.5 17.1 20.5 12.1 26.6 12.1C27.5 12.1 28.3 12.2 29 12.4Z"></path>
          <circle class="wx-star" cx="35" cy="13" r="1.8"></circle>
          <circle class="wx-star wx-star-small" cx="13.5" cy="18" r="1.3"></circle>
        </g>
      `;
    default:
      return `${sun}${cloud}`;
  }
}

function buildStormGlyph(variant = "forecast") {
  const secondaryBolt = variant === "hero"
    ? '<path class="wx-bolt wx-bolt-secondary" d="M33.4 29.4L28.5 38.1H33.3L31.1 44.4L40.4 33.6H35.4L37.8 29.4Z"></path>'
    : "";

  return `
    <g class="wx-storm-flash">
      <circle class="wx-storm-glow" cx="23" cy="22" r="${variant === "hero" ? "15.5" : "14"}"></circle>
    </g>
    ${buildRainGlyph("storm", variant)}
    <path class="wx-bolt" d="M24 31L18 42H24L21 48L32 35H26L29 31Z"></path>
    ${secondaryBolt}
  `;
}

function buildRainGlyph(motion = "rain", variant = "forecast") {
  const profiles = {
    drizzle: [
      { x: 16, y: 33.8, scale: 0.72, delay: 0, duration: 1.62, distance: 4.8 },
      { x: 28.5, y: 34.6, scale: 0.68, delay: 0.26, duration: 1.72, distance: 4.4 }
    ],
    rain: [
      { x: 14, y: 33.2, scale: 0.82, delay: 0, duration: 1.2, distance: 6.1 },
      { x: 24, y: 34, scale: 0.78, delay: 0.18, duration: 1.14, distance: 6.3 },
      { x: 33, y: 33.3, scale: 0.84, delay: 0.42, duration: 1.22, distance: 6.1 }
    ],
    downpour: [
      { x: 11.8, y: 32.4, scale: 0.82, delay: 0, duration: 0.92, distance: 7.4 },
      { x: 18.4, y: 33.4, scale: 0.76, delay: 0.1, duration: 0.84, distance: 7.8 },
      { x: 24.8, y: 32.8, scale: 0.86, delay: 0.22, duration: 0.88, distance: 7.6 },
      { x: 31.2, y: 33.7, scale: 0.76, delay: 0.34, duration: 0.82, distance: 7.9 },
      { x: 37.4, y: 32.6, scale: 0.82, delay: 0.46, duration: 0.9, distance: 7.5 }
    ],
    storm: [
      { x: 13.2, y: 32.3, scale: 0.86, delay: 0, duration: 0.82, distance: 7.8 },
      { x: 20.6, y: 33.2, scale: 0.82, delay: 0.12, duration: 0.78, distance: 8.1 },
      { x: 28.2, y: 32.9, scale: 0.9, delay: 0.24, duration: 0.8, distance: 8.2 },
      { x: 35.5, y: 33.6, scale: 0.82, delay: 0.36, duration: 0.76, distance: 8.1 }
    ]
  };

  const drops = profiles[motion] || profiles.rain;
  const haze = motion === "drizzle"
    ? `<ellipse class="wx-drizzle-haze" cx="24" cy="35.4" rx="${variant === "hero" ? "16.5" : "15.2"}" ry="3.2"></ellipse>`
    : "";
  const sheet = ["downpour", "storm"].includes(motion)
    ? '<path class="wx-rain-sheet" d="M10.5 31.2C16.4 29.6 31.1 29.3 37.7 31.2C35.9 34.2 32.7 36.7 29.4 38.8H18.7C15.4 36.8 12.4 34.4 10.5 31.2Z"></path>'
    : "";

  return `
    <g class="wx-rain wx-rain-${motion}">
      ${haze}
      ${sheet}
      ${drops.map((drop, index) => `
        <path class="wx-drop wx-drop-${index + 1}" style="--drop-delay: ${drop.delay}s; --drop-duration: ${drop.duration}s; --drop-distance: ${drop.distance}px;" d="${buildRainDropPath(drop.x, drop.y, drop.scale)}"></path>
      `).join("")}
    </g>
  `;
}

function buildRainDropPath(x, y, scale = 1) {
  const point = (value) => Number(value).toFixed(1);

  return [
    `M${point(x)} ${point(y)}`,
    `C${point(x + 1.7 * scale)} ${point(y + 2.4 * scale)} ${point(x + 3 * scale)} ${point(y + 4.6 * scale)} ${point(x + 3 * scale)} ${point(y + 6.9 * scale)}`,
    `C${point(x + 3 * scale)} ${point(y + 9.2 * scale)} ${point(x + 1.1 * scale)} ${point(y + 11.1 * scale)} ${point(x)} ${point(y + 11.1 * scale)}`,
    `C${point(x - 1.9 * scale)} ${point(y + 11.1 * scale)} ${point(x - 3.4 * scale)} ${point(y + 9.2 * scale)} ${point(x - 3.4 * scale)} ${point(y + 6.9 * scale)}`,
    `C${point(x - 3.4 * scale)} ${point(y + 4.6 * scale)} ${point(x - 1.8 * scale)} ${point(y + 2.4 * scale)} ${point(x)} ${point(y)}Z`
  ].join("");
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
      fill: clamp((current.wind_speed_10m / 40) * 100, 12, 100),
      accent: "#4285f4",
      soft: "rgba(66, 133, 244, 0.14)"
    },
    {
      title: "Humidity",
      value: `${Math.round(current.relative_humidity_2m)}%`,
      copy: `Moisture is sitting in a comfortable range for the next few hours.`,
      fill: clamp(current.relative_humidity_2m, 8, 100),
      accent: "#24a56a",
      soft: "rgba(36, 165, 106, 0.14)"
    },
    {
      title: "UV index",
      value: `${formatNumber(daily.uv_index_max?.[0], 1)}`,
      copy: uvSummary(daily.uv_index_max?.[0]),
      fill: clamp(((daily.uv_index_max?.[0] ?? 0) / 11) * 100, 8, 100),
      accent: "#f7c64f",
      soft: "rgba(247, 198, 79, 0.18)"
    },
    {
      title: "Pressure",
      value: `${Math.round(current.pressure_msl)} hPa`,
      copy: `Pressure is staying fairly stable across the region.`,
      fill: clamp(((current.pressure_msl - 980) / 60) * 100, 8, 100),
      accent: "#6f93bc",
      soft: "rgba(111, 147, 188, 0.14)"
    },
    {
      title: "Visibility",
      value: `${visibilityKm.toFixed(1)} km`,
      copy: `${visibilityKm >= 8 ? "Good" : "Reduced"} visibility for outdoor plans right now.`,
      fill: clamp((visibilityKm / 10) * 100, 8, 100),
      accent: "#5fa8ff",
      soft: "rgba(95, 168, 255, 0.14)"
    },
    {
      title: "Dew point",
      value: `${Math.round(current.dew_point_2m)}°`,
      copy: `This is the temperature where moisture would begin condensing.`,
      fill: clamp(((current.dew_point_2m + 10) / 40) * 100, 8, 100),
      accent: "#3db7c4",
      soft: "rgba(61, 183, 196, 0.14)"
    },
    {
      title: "Sunrise & sunset",
      value: formatClock(daily.sunrise?.[0]),
      copy: `Sunset ${formatClock(daily.sunset?.[0])} • ${formatDaylight(daily.daylight_duration?.[0])}.`,
      className: "sunrise-card",
      accent: "#f0b24b",
      soft: "rgba(240, 178, 75, 0.16)"
    },
    {
      title: "Air quality",
      value: airQuality.label,
      copy: currentAir.us_aqi != null
        ? `AQI ${Math.round(currentAir.us_aqi)} • Ozone ${formatNumber(currentAir.ozone, 1)} ug/m3.`
        : "Air-quality data is not available for this location.",
      className: "air-card",
      accent: "#24a56a",
      soft: "rgba(36, 165, 106, 0.16)"
    }
  ];

  refs.detailsGrid.innerHTML = details.map((detail, index) => {
    const meter = detail.fill != null
      ? `<div class="detail-meter"><span style="--fill: ${detail.fill.toFixed(1)}%;"></span></div>`
      : "";

    return `
      <article class="detail-card ${detail.className || ""}" style="--detail-accent: ${detail.accent || "#4285f4"}; --detail-soft: ${detail.soft || "rgba(66, 133, 244, 0.12)"}; --card-index: ${index};">
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

  for (let offset = 0; offset < 9; offset += 1) {
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

function buildTrendChart(entries, config, activeIndex = 0) {
  const width = 780;
  const height = 292;
  const left = 56;
  const right = 724;
  const top = 48;
  const bottom = 210;
  const values = entries.map((entry) => config.value(entry));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = Math.max(max - min, 1);
  const floor = config.key === "precipitation" ? 0 : min - Math.max(rawRange * 0.24, 1.4);
  const ceiling = max + Math.max(rawRange * 0.3, 1.8);
  const range = Math.max(ceiling - floor, 1);
  const step = entries.length > 1 ? (right - left) / (entries.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = left + step * index;
    const ratio = range === 0 ? 0.5 : (value - floor) / range;
    const y = bottom - ratio * (bottom - top);
    return { x, y, value };
  });

  const activePoint = points[activeIndex];
  const peakIndex = values.indexOf(max);
  const overview = buildTrendOverview(entries, config, values, activeIndex, peakIndex, min, max);
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${right} 236 L ${left} 236 Z`;
  const labelIndexes = new Set([0, activeIndex, peakIndex, values.length - 1]);
  const labels = points.map((point, index) => {
    if (!labelIndexes.has(index)) {
      return "";
    }

    return `<text x="${point.x.toFixed(1)}" y="${(point.y - 18).toFixed(1)}" class="chart-point-label ${index === activeIndex ? "is-active" : ""}">${escapeHtml(config.label(point.value))}</text>`;
  }).join("");
  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const y = top + ((bottom - top) * ratio);
    const tick = ceiling - ((ceiling - floor) * ratio);
    return `
      <g class="chart-grid-row">
        <path d="M${left} ${y.toFixed(1)}H${right}" class="grid-line"></path>
        <text x="${(right + 18).toFixed(1)}" y="${(y + 5).toFixed(1)}" class="chart-scale-label">${escapeHtml(formatMetricTick(config, tick))}</text>
      </g>
    `;
  }).join("");
  const axisLabels = points.map((point, index) => {
    if (index !== activeIndex && index !== 0 && index !== points.length - 1 && index % 2 !== 0) {
      return "";
    }

    return `<text x="${point.x.toFixed(1)}" y="258" class="chart-axis-label ${index === activeIndex ? "is-active" : ""}">${escapeHtml(entries[index].label)}</text>`;
  }).join("");
  const pointMarkup = points.map((point, index) => `
    <g class="chart-point ${index === activeIndex ? "is-active" : ""}" style="--point-delay: ${index * 0.08}s;">
      <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${index === activeIndex ? "18" : "13"}" class="chart-point-halo"></circle>
      <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${index === activeIndex ? "8" : "6"}" class="chart-point-ring"></circle>
      <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${index === activeIndex ? "4.5" : "3.5"}" class="chart-point-core"></circle>
    </g>
  `).join("");

  return `
    <div class="chart-overview">
      ${overview}
    </div>
    <div class="chart-visual">
      <svg viewBox="0 0 ${width} ${height}" class="trend-chart" aria-hidden="true">
        <defs>
          <linearGradient id="trend-area-${config.key}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${config.line}" stop-opacity="0.34"></stop>
            <stop offset="100%" stop-color="${config.line}" stop-opacity="0.02"></stop>
          </linearGradient>
          <linearGradient id="trend-line-${config.key}" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="${config.line}" stop-opacity="0.62"></stop>
            <stop offset="100%" stop-color="${config.line}" stop-opacity="1"></stop>
          </linearGradient>
          <filter id="trend-glow-${config.key}" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" result="blur"></feGaussianBlur>
            <feMerge>
              <feMergeNode in="blur"></feMergeNode>
              <feMergeNode in="SourceGraphic"></feMergeNode>
            </feMerge>
          </filter>
        </defs>
        <rect x="22" y="16" width="716" height="236" rx="28" class="chart-stage-surface"></rect>
        <rect x="${(activePoint.x - 24).toFixed(1)}" y="22" width="48" height="218" rx="24" class="chart-focus-beam"></rect>
        ${gridLines}
        <path d="${areaPath}" class="trend-area" fill="url(#trend-area-${config.key})"></path>
        <path d="${linePath}" class="trend-glow" stroke="url(#trend-line-${config.key})" filter="url(#trend-glow-${config.key})"></path>
        <path d="${linePath}" class="trend-line" stroke="url(#trend-line-${config.key})"></path>
        <g class="chart-points">${pointMarkup}</g>
        <g class="chart-values">${labels}</g>
        <g class="chart-axis">${axisLabels}</g>
      </svg>
    </div>
  `;
}

function buildHeroVisual(weatherOrIcon) {
  const weather = normalizeWeatherDescriptor(weatherOrIcon);
  return `
    <div class="hero-scene hero-scene-${weather.icon} hero-scene-motion-${weather.motion}" aria-hidden="true">
      <span class="hero-side-beam beam-left"></span>
      <span class="hero-side-beam beam-right"></span>
      <span class="hero-orbit orbit-one"></span>
      <span class="hero-orbit orbit-two"></span>
      <span class="hero-particle particle-one"></span>
      <span class="hero-particle particle-two"></span>
      <span class="hero-particle particle-three"></span>
      <div class="hero-climate-core">
        ${buildHeroClimateCore(weather)}
      </div>
      <span class="hero-floor-glow"></span>
    </div>
  `;
}

function buildHeroClimateCore(weather) {
  return `
    <div class="hero-glyph-shell">
      ${buildWeatherGlyph(weather, "hero")}
    </div>
  `;
}

function getClimateTheme(weatherOrIcon) {
  const weather = normalizeWeatherDescriptor(weatherOrIcon);
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

  if (weather.icon === "rain") {
    const rainThemes = {
      drizzle: {
        accent: "#77adff",
        soft: "rgba(119, 173, 255, 0.16)",
        glow: "rgba(119, 173, 255, 0.3)"
      },
      rain: themes.rain,
      downpour: {
        accent: "#2f74e8",
        soft: "rgba(47, 116, 232, 0.24)",
        glow: "rgba(47, 116, 232, 0.42)"
      }
    };

    return rainThemes[weather.motion] || rainThemes.rain;
  }

  return themes[weather.icon] || themes.partly;
}

function getWeatherMeta(code, isDay) {
  if (code === 0) {
    return isDay
      ? { label: "Clear sky", shortLabel: "Clear", icon: "sunny", motion: "sunny", summary: "Bright and clear" }
      : { label: "Clear night", shortLabel: "Clear", icon: "moon", motion: "night", summary: "Calm and clear" };
  }

  if ([1, 2].includes(code)) {
    return isDay
      ? { label: "Partly cloudy", shortLabel: "Partly cloudy", icon: "partly", motion: "partly", summary: "A mix of sun and clouds" }
      : { label: "Mostly clear", shortLabel: "Mostly clear", icon: "moon", motion: "night", summary: "Mostly clear skies" };
  }

  if (code === 3) {
    return { label: "Overcast", shortLabel: "Cloudy", icon: "cloudy", motion: "cloudy", summary: "Cloud cover is dominating" };
  }

  if ([45, 48].includes(code)) {
    return { label: "Fog", shortLabel: "Fog", icon: "fog", motion: "fog", summary: "Foggy conditions are reducing clarity" };
  }

  if ([51, 53].includes(code)) {
    return { label: "Drizzle", shortLabel: "Drizzle", icon: "rain", motion: "drizzle", summary: "A soft drizzle is passing through" };
  }

  if ([55, 56, 57, 61].includes(code)) {
    return { label: "Light rain", shortLabel: "Rain", icon: "rain", motion: "rain", summary: "Light rain is moving through" };
  }

  if ([63, 66, 80].includes(code)) {
    return { label: "Rain", shortLabel: "Rain", icon: "rain", motion: "rain", summary: "Steady rain is moving through" };
  }

  if ([65, 67, 81, 82].includes(code)) {
    return { label: "Heavy rain", shortLabel: "Heavy rain", icon: "rain", motion: "downpour", summary: "A heavier burst of rain is moving through" };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: "Snow", shortLabel: "Snow", icon: "snow", motion: "snow", summary: "Cold wintry weather is in place" };
  }

  if ([95, 96, 99].includes(code)) {
    return { label: "Thunderstorm", shortLabel: "Storm", icon: "storm", motion: "storm", summary: "Storm activity is in the area" };
  }

  return {
    label: "Partly cloudy",
    shortLabel: "Partly cloudy",
    icon: isDay ? "partly" : "moon",
    motion: isDay ? "partly" : "night",
    summary: "Conditions are changing through the day"
  };
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
  refs.hourlyStrip.innerHTML = '<button class="hour-card active" type="button" disabled><p>Loading</p><strong>--</strong><span class="hour-card-note">Forecast</span></button>';
  refs.forecastList.innerHTML = '<div class="forecast-row placeholder-row">Loading 10-day forecast...</div>';
  refs.detailsGrid.innerHTML = '<article class="detail-card"><p>Loading</p><h3>--</h3><span>Waiting for live weather details.</span></article>';
  renderSavedCitiesSection();
  syncHourlySliderState();
}

function updateMetricButtons() {
  refs.metricButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.metric === state.metric);
  });
}

function setLoading(isLoading, message = "", action = "search") {
  state.isLoading = isLoading;
  document.body.classList.toggle("is-loading", isLoading);
  refs.searchAction.disabled = isLoading;
  refs.locationAction.disabled = isLoading || !HAS_GEOLOCATION;
  refs.searchAction.textContent = isLoading && action === "search" ? "Loading..." : "Search";
  refs.locationAction.textContent = !HAS_GEOLOCATION
    ? "Location unavailable"
    : isLoading && action === "location"
      ? "Locating..."
      : "Use my location";
  updateSaveCityAction();

  if (message) {
    setStatus(message, isLoading ? "loading" : "info");
  }
}

function setStatus(message, stateName = "info") {
  refs.statusMessage.textContent = message;
  refs.statusMessage.dataset.state = stateName;
}

function renderSavedCitiesSection() {
  const count = state.savedCities.length;
  refs.savedCitiesCount.textContent = `${count} saved`;

  if (!count) {
    refs.savedCitiesCopy.textContent = "Search for a city, then use Add city to pin it here.";
    refs.savedCitiesList.innerHTML = `
      <div class="saved-city-empty">
        <strong>No saved cities yet</strong>
        <span>Your pinned city weather will appear here.</span>
      </div>
    `;
    updateSaveCityAction();
    return;
  }

  refs.savedCitiesCopy.textContent = state.savedCitiesLoading
    ? "Refreshing live weather for your saved cities..."
    : "Select any saved city to load its full forecast.";

  refs.savedCitiesList.innerHTML = state.savedCities.map((city, index) => {
    const snapshot = getSavedCitySnapshot(city.key);
    const weather = snapshot
      ? getWeatherMeta(snapshot.weatherCode, snapshot.isDay)
      : { shortLabel: "Loading...", icon: "cloudy", motion: "cloudy" };
    const climate = getClimateTheme(weather);
    const locationLine = buildLocationLine(city) || city.country || "Saved city";
    const note = snapshot
      ? `${weather.shortLabel} • H ${snapshot.high}° L ${snapshot.low}°`
      : state.savedCitiesLoading
        ? "Loading live weather..."
        : "Weather unavailable right now.";

    return `
      <article class="saved-city-item" style="--card-index: ${index}; --saved-accent: ${climate.accent}; --saved-soft: ${climate.soft}; --saved-glow: ${climate.glow};">
        <button class="saved-city-main" type="button" data-city-key="${escapeHtml(city.key)}" aria-label="Show weather for ${escapeHtml(city.name)}">
          <span class="saved-city-glyph">${buildWeatherGlyph(weather, "forecast")}</span>
          <span class="saved-city-content">
            <span class="saved-city-topline">
              <strong class="saved-city-name">${escapeHtml(city.name)}</strong>
              <span class="saved-city-temp">${snapshot ? `${snapshot.temperature}°` : "--"}</span>
            </span>
            <span class="saved-city-meta">${escapeHtml(locationLine)}</span>
            <span class="saved-city-note">${escapeHtml(note)}</span>
          </span>
        </button>
        <button class="saved-city-remove" type="button" data-city-key="${escapeHtml(city.key)}" aria-label="Remove ${escapeHtml(city.name)} from saved cities">
          Remove
        </button>
      </article>
    `;
  }).join("");

  updateSaveCityAction();
}

function updateSaveCityAction() {
  const currentCityKey = state.location ? buildSavedCityKey(state.location) : "";
  const alreadySaved = Boolean(currentCityKey && state.savedCities.some((city) => city.key === currentCityKey));
  const atLimit = state.savedCities.length >= MAX_SAVED_CITIES;
  const canSave = Boolean(state.location && state.forecast) && !state.isLoading && !alreadySaved && !atLimit;

  refs.saveCityAction.disabled = !canSave;
  refs.saveCityAction.textContent = alreadySaved
    ? "Added"
    : atLimit
      ? "Limit reached"
      : "Add city";
  refs.saveCityAction.title = !state.location
    ? "Load a city first to save it."
    : alreadySaved
      ? `${state.location.name} is already in your saved cities.`
      : atLimit
        ? `You can save up to ${MAX_SAVED_CITIES} cities.`
        : `Save ${state.location.name} to your city list.`;
}

async function refreshSavedCitiesWeather() {
  const cities = [...state.savedCities];
  const requestId = ++state.savedCitiesRequestId;

  if (!cities.length) {
    state.savedCityWeather = [];
    state.savedCitiesLoading = false;
    renderSavedCitiesSection();
    return;
  }

  state.savedCitiesLoading = true;
  renderSavedCitiesSection();

  const nextSnapshots = [...state.savedCityWeather];

  await Promise.all(cities.map(async (city) => {
    try {
      const forecast = await fetchForecast(city);
      upsertSavedCitySnapshot(buildSavedCitySummary(city, forecast), nextSnapshots);
    } catch (error) {
      console.error(`Unable to refresh saved city "${city.name}".`, error);
    }
  }));

  if (requestId !== state.savedCitiesRequestId) {
    return;
  }

  const allowedKeys = new Set(cities.map((city) => city.key));
  state.savedCityWeather = nextSnapshots.filter((entry) => allowedKeys.has(entry.key));
  state.savedCitiesLoading = false;
  renderSavedCitiesSection();
}

function addCurrentCityToSavedList() {
  if (!state.location || !state.forecast) {
    return;
  }

  const savedCity = normalizeSavedCity(state.location);
  if (!savedCity) {
    setStatus("This city cannot be saved right now.", "error");
    return;
  }
  const existingIndex = state.savedCities.findIndex((city) => city.key === savedCity.key);

  if (existingIndex >= 0) {
    state.savedCities[existingIndex] = savedCity;
    persistSavedCities();
    upsertSavedCitySnapshot(buildSavedCitySummary(savedCity, state.forecast));
    renderSavedCitiesSection();
    setStatus(`${savedCity.name} is already in your saved cities.`, "success");
    return;
  }

  if (state.savedCities.length >= MAX_SAVED_CITIES) {
    setStatus(`You can save up to ${MAX_SAVED_CITIES} cities. Remove one to add another.`, "error");
    updateSaveCityAction();
    return;
  }

  state.savedCities = [savedCity, ...state.savedCities];
  persistSavedCities();
  upsertSavedCitySnapshot(buildSavedCitySummary(savedCity, state.forecast));
  renderSavedCitiesSection();
  setStatus(`${savedCity.name} added to your saved cities.`, "success");
}

function removeSavedCity(cityKey) {
  const city = state.savedCities.find((entry) => entry.key === cityKey);
  if (!city) {
    return;
  }

  state.savedCities = state.savedCities.filter((entry) => entry.key !== cityKey);
  state.savedCityWeather = state.savedCityWeather.filter((entry) => entry.key !== cityKey);
  persistSavedCities();
  renderSavedCitiesSection();
  setStatus(`${city.name} removed from your saved cities.`, "info");
}

async function loadSavedCity(cityKey) {
  const savedCity = state.savedCities.find((city) => city.key === cityKey);
  if (!savedCity) {
    return;
  }

  const requestId = ++state.requestId;
  setLoading(true, `Loading live weather for ${savedCity.name}...`, "search");

  try {
    const hydratedLocation = await hydrateLocation({ ...savedCity, source: "saved" }, requestId);
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
    setStatus(error.message || `Unable to load weather for ${savedCity.name}.`, "error");
  } finally {
    if (requestId === state.requestId) {
      setLoading(false);
    }
  }
}

function syncCurrentLocationWithSavedCities() {
  if (!state.location || !state.forecast) {
    updateSaveCityAction();
    return;
  }

  const savedCity = normalizeSavedCity(state.location);
  if (!savedCity) {
    updateSaveCityAction();
    return;
  }
  const savedIndex = state.savedCities.findIndex((city) => city.key === savedCity.key);
  if (savedIndex >= 0) {
    state.savedCities[savedIndex] = savedCity;
    persistSavedCities();
    upsertSavedCitySnapshot(buildSavedCitySummary(savedCity, state.forecast));
  }

  updateSaveCityAction();
}

function buildSavedCitySummary(location, forecast) {
  const current = forecast.current || {};
  const daily = forecast.daily || {};

  return {
    key: buildSavedCityKey(location),
    temperature: Math.round(current.temperature_2m ?? 0),
    high: Math.round(daily.temperature_2m_max?.[0] ?? current.temperature_2m ?? 0),
    low: Math.round(daily.temperature_2m_min?.[0] ?? current.temperature_2m ?? 0),
    weatherCode: current.weather_code ?? 3,
    isDay: Boolean(current.is_day),
    updatedTime: current.time || ""
  };
}

function upsertSavedCitySnapshot(snapshot, target = state.savedCityWeather) {
  const index = target.findIndex((entry) => entry.key === snapshot.key);
  if (index >= 0) {
    target[index] = snapshot;
    return;
  }

  target.push(snapshot);
}

function getSavedCitySnapshot(cityKey) {
  return state.savedCityWeather.find((entry) => entry.key === cityKey) || null;
}

function loadSavedCities() {
  try {
    const rawValue = localStorage.getItem(SAVED_CITIES_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map(normalizeSavedCity)
      .filter(Boolean)
      .slice(0, MAX_SAVED_CITIES);
  } catch (error) {
    console.error("Unable to read saved cities from local storage.", error);
    return [];
  }
}

function persistSavedCities() {
  try {
    localStorage.setItem(SAVED_CITIES_STORAGE_KEY, JSON.stringify(state.savedCities));
  } catch (error) {
    console.error("Unable to save cities to local storage.", error);
  }
}

function normalizeSavedCity(location) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) {
    return null;
  }

  return {
    key: buildSavedCityKey(location),
    name: String(location.name || "Saved city"),
    admin1: String(location.admin1 || ""),
    country: String(location.country || ""),
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    timezone: String(location.timezone || "auto")
  };
}

function buildSavedCityKey(location) {
  return `${Number(location.latitude).toFixed(3)},${Number(location.longitude).toFixed(3)}`;
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

function buildTrendOverview(entries, config, values, activeIndex, peakIndex, min, max) {
  const activeEntry = entries[activeIndex];
  const activeWeather = getWeatherMeta(activeEntry.weatherCode, activeEntry.isDay);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;

  return [
    {
      label: "Focus",
      value: config.label(values[activeIndex]),
      copy: `${activeEntry.label} • ${activeWeather.shortLabel}`
    },
    {
      label: "Peak",
      value: config.label(max),
      copy: `Highest around ${entries[peakIndex].label}`
    },
    {
      label: "Window",
      value: config.label(average),
      copy: `${describeMetricTrend(config, values)} • ${config.label(min)} to ${config.label(max)}`
    }
  ].map((item, index) => `
    <article class="chart-stat ${index === 0 ? "chart-stat-primary" : ""}" style="--card-index: ${index};">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.copy)}</small>
    </article>
  `).join("");
}

function describeMetricTrend(config, values) {
  const delta = values[values.length - 1] - values[0];

  if (config.key === "temperature") {
    if (delta > 1.5) {
      return "Warming through the next hours";
    }

    if (delta < -1.5) {
      return "Cooling later in the window";
    }

    return "Temperature holds fairly steady";
  }

  if (config.key === "precipitation") {
    if (delta > 15) {
      return "Rain odds are building up";
    }

    if (delta < -15) {
      return "Rain odds are easing off";
    }

    return "Rain chance stays fairly even";
  }

  if (delta > 5) {
    return "Wind picks up later on";
  }

  if (delta < -5) {
    return "Wind softens through the window";
  }

  return "Wind remains fairly balanced";
}

function formatMetricTick(config, value) {
  if (config.key === "wind") {
    return `${Math.round(value)}`;
  }

  return config.label(value);
}

function focusActiveHourCard() {
  const activeCard = refs.hourlyStrip.querySelector(`.hour-card[data-hour-index="${state.activeHourIndex}"]`);
  if (!activeCard) {
    return;
  }

  activeCard.scrollIntoView({
    block: "nearest",
    inline: state.activeHourIndex === 0 ? "nearest" : "center",
    behavior: REDUCED_MOTION ? "auto" : "smooth"
  });
}

function scrollHourlyStrip(direction) {
  const sampleCard = refs.hourlyStrip.querySelector(".hour-card");
  const sampleWidth = sampleCard ? sampleCard.getBoundingClientRect().width + 16 : refs.hourlyStrip.clientWidth * 0.86;

  refs.hourlyStrip.scrollBy({
    left: direction * sampleWidth * 2,
    behavior: REDUCED_MOTION ? "auto" : "smooth"
  });
}

function syncHourlySliderState() {
  const maxScroll = Math.max(refs.hourlyStrip.scrollWidth - refs.hourlyStrip.clientWidth, 0);
  const hasOverflow = maxScroll > 8;
  const scrollLeft = refs.hourlyStrip.scrollLeft;

  refs.hourlySlider.classList.toggle("is-scrollable", hasOverflow);
  refs.hourlySlider.classList.toggle("can-scroll-left", hasOverflow && scrollLeft > 8);
  refs.hourlySlider.classList.toggle("can-scroll-right", hasOverflow && scrollLeft < maxScroll - 8);

  refs.hourlyPrev.disabled = !hasOverflow || scrollLeft <= 8;
  refs.hourlyNext.disabled = !hasOverflow || scrollLeft >= maxScroll - 8;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
