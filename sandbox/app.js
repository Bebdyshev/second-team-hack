const FLOORS = 6;
const APARTMENTS_PER_FLOOR = 4;
const HOURS = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, "0")}:00`);

const state = {
  ecoMode: false,
  selectedApartmentId: null,
  apartments: [],
  charts: {},
};

const screens = {
  onboarding: document.getElementById("onboardingScreen"),
  building: document.getElementById("buildingScreen"),
  apartment: document.getElementById("apartmentScreen"),
};

const elements = {
  floorSelect: document.getElementById("floorSelect"),
  apartmentSelect: document.getElementById("apartmentSelect"),
  enterBuildingBtn: document.getElementById("enterBuildingBtn"),
  heroGrid: document.getElementById("heroGrid"),
  buildingGrid: document.getElementById("buildingGrid"),
  leaderboardList: document.getElementById("leaderboardList"),
  notificationList: document.getElementById("notificationList"),
  insightList: document.getElementById("insightList"),
  previewCard: document.getElementById("previewCard"),
  apartmentTitle: document.getElementById("apartmentTitle"),
  ecoScoreValue: document.getElementById("ecoScoreValue"),
  liveElectricity: document.getElementById("liveElectricity"),
  liveWater: document.getElementById("liveWater"),
  liveAir: document.getElementById("liveAir"),
  savingsValue: document.getElementById("savingsValue"),
  buildingPower: document.getElementById("buildingPower"),
  buildingWater: document.getElementById("buildingWater"),
  buildingAir: document.getElementById("buildingAir"),
  cityImpact: document.getElementById("cityImpact"),
  assistantFab: document.getElementById("assistantFab"),
  assistantPanel: document.getElementById("assistantPanel"),
  assistantMessages: document.getElementById("assistantMessages"),
  ecoModeBtn: document.getElementById("ecoModeBtn"),
  backToOnboardingBtn: document.getElementById("backToOnboardingBtn"),
  backToBuildingBtn: document.getElementById("backToBuildingBtn"),
  closeAssistantBtn: document.getElementById("closeAssistantBtn"),
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatApartmentNumber(floor, unit) {
  return `${floor}${String(unit).padStart(2, "0")}`;
}

function getStatusFromScore(score) {
  if (score >= 80) return "good";
  if (score >= 60) return "watch";
  return "alert";
}

function generateHourlySeries(base, variability, morningBoost, eveningBoost) {
  return HOURS.map((_, hour) => {
    const morningPeak = Math.exp(-Math.pow(hour - 7.5, 2) / morningBoost);
    const eveningPeak = Math.exp(-Math.pow(hour - 19, 2) / eveningBoost);
    const nightLow = hour >= 0 && hour <= 4 ? 0.68 : 1;
    const jitter = randomBetween(-variability, variability);
    return Math.max(0, (base + morningPeak * base * 0.85 + eveningPeak * base * 0.95 + jitter) * nightLow);
  });
}

function generateApartmentData(floor, unit) {
  const number = formatApartmentNumber(floor, unit);
  const basePower = randomBetween(1.4, 2.8);
  const baseWater = randomBetween(18, 42);
  const electricityDaily = generateHourlySeries(basePower, 0.35, 4.5, 6.3);
  const waterDaily = generateHourlySeries(baseWater, 6.5, 4.8, 7.8);
  const co2Series = generateHourlySeries(randomBetween(480, 640), 26, 12, 15).map((value) => Math.round(value));
  const humiditySeries = generateHourlySeries(randomBetween(38, 52), 4, 18, 10).map((value) => Math.round(value));

  const electricityMonthly = Array.from({ length: 30 }, (_, index) => {
    const weekendBoost = index % 7 === 5 || index % 7 === 6 ? 1.08 : 1;
    return Math.round((basePower * 20 + randomBetween(-4, 5)) * weekendBoost);
  });

  const waterMonthly = Array.from({ length: 30 }, (_, index) => {
    const weekendBoost = index % 7 === 5 || index % 7 === 6 ? 1.12 : 1;
    return Math.round((baseWater * 3.5 + randomBetween(-8, 9)) * weekendBoost);
  });

  const anomalyRoll = Math.random();
  const anomalies = [];

  if (anomalyRoll > 0.45) {
    const spikeHour = Math.floor(randomBetween(2, 22));
    electricityDaily[spikeHour] += randomBetween(1.4, 3.2);
    anomalies.push(`Unusual electricity spike at ${HOURS[spikeHour].slice(0, 5)}`);
  }

  if (anomalyRoll < 0.55) {
    const leakHour = Math.floor(randomBetween(0, 23));
    waterDaily[leakHour] += randomBetween(18, 30);
    anomalies.push(`Possible water leak at ${HOURS[leakHour].slice(0, 5)}`);
  }

  if (anomalyRoll > 0.25 && anomalyRoll < 0.72) {
    const airHour = Math.floor(randomBetween(10, 22));
    co2Series[airHour] += Math.round(randomBetween(120, 260));
    anomalies.push(`CO2 comfort drop detected at ${HOURS[airHour].slice(0, 5)}`);
  }

  const ecoScore = clamp(
    Math.round(
      100 -
      electricityDaily.reduce((sum, value) => sum + value, 0) * 0.85 -
      waterDaily.reduce((sum, value) => sum + value, 0) * 0.06 +
      randomBetween(8, 16)
    ),
    48,
    97
  );

  const recommendations = [
    `Shift laundry and dishwasher loads to off-peak hours to save ${Math.round(randomBetween(12, 22))}%`,
    `Reduce shower time by 2 minutes to save ${Math.round(randomBetween(18, 30))}L per day`,
    `Open ventilation cycle after 20:00 to lower CO2 by ${Math.round(randomBetween(8, 16))}%`,
  ];

  return {
    id: `apt-${number}`,
    floor,
    unit,
    number,
    score: ecoScore,
    status: getStatusFromScore(ecoScore),
    electricityDaily,
    waterDaily,
    electricityMonthly,
    waterMonthly,
    co2Series,
    humiditySeries,
    anomalies,
    recommendations,
    savings: Math.round(randomBetween(9, 24)),
    points: Math.round(ecoScore * 12 + randomBetween(0, 40)),
  };
}

function buildDataset() {
  const apartments = [];
  for (let floor = FLOORS; floor >= 1; floor -= 1) {
    for (let unit = 1; unit <= APARTMENTS_PER_FLOOR; unit += 1) {
      apartments.push(generateApartmentData(floor, unit));
    }
  }
  state.apartments = apartments;
  state.selectedApartmentId = apartments[0].id;
}

function populateSelectors() {
  const floorOptions = Array.from({ length: FLOORS }, (_, idx) => FLOORS - idx);
  elements.floorSelect.innerHTML = floorOptions
    .map((floor) => `<option value="${floor}">Floor ${floor}</option>`)
    .join("");

  updateApartmentSelector(Number(elements.floorSelect.value));
}

function updateApartmentSelector(floor) {
  const options = state.apartments
    .filter((apartment) => apartment.floor === floor)
    .map(
      (apartment) =>
        `<option value="${apartment.id}">Apartment ${apartment.number}</option>`
    )
    .join("");
  elements.apartmentSelect.innerHTML = options;
}

function renderHeroBuilding() {
  elements.heroGrid.innerHTML = state.apartments
    .map((apartment, index) => {
      const delay = (index % APARTMENTS_PER_FLOOR) * 0.35 + apartment.floor * 0.08;
      return `<div class="hero-window" style="animation-delay:${delay}s"></div>`;
    })
    .join("");
}

function showScreen(targetKey) {
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("active", key === targetKey);
  });
}

function renderBuildingGrid() {
  elements.buildingGrid.innerHTML = state.apartments
    .map((apartment) => {
      const power = apartment.electricityDaily.reduce((sum, value) => sum + value, 0);
      const water = apartment.waterDaily.reduce((sum, value) => sum + value, 0);
      const selectedClass = apartment.id === state.selectedApartmentId ? "selected" : "";
      return `
        <article
          class="apartment-tile status-${apartment.status} ${selectedClass}"
          data-apartment-id="${apartment.id}"
          data-number="${apartment.number}"
          data-score="${apartment.score}"
          data-power="${power.toFixed(1)}"
          data-water="${Math.round(water)}"
        >
          <div class="apt-number">#${apartment.number}</div>
          <div class="apt-meta">
            <span>Eco ${apartment.score}</span>
            <span>${apartment.anomalies.length ? "AI alert" : "Stable"}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderLeaderboard() {
  const sorted = [...state.apartments].sort((a, b) => b.score - a.score).slice(0, 6);
  elements.leaderboardList.innerHTML = sorted
    .map(
      (apartment, index) => `
        <div class="leaderboard-row">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="rank-chip">${index + 1}</div>
            <div>
              <strong>#${apartment.number}</strong>
              <small>${apartment.points} eco points</small>
            </div>
          </div>
          <strong>${apartment.score}</strong>
        </div>
      `
    )
    .join("");
}

function getNotificationFeed() {
  const highPriority = [...state.apartments]
    .filter((apartment) => apartment.anomalies.length)
    .slice(0, 5);

  const tips = [
    "City grid load rises sharply between 18:00 and 21:00 tonight.",
    "Eco Mode lowers simulated building demand and boosts apartment scores.",
    "Ventilation balancing can reduce high-CO2 events in top-floor units.",
  ];

  return [
    ...highPriority.map((apartment) => ({
      title: `Apartment ${apartment.number}`,
      body: apartment.anomalies[0],
      meta: `${apartment.score >= 80 ? "Low risk" : "Action recommended"}`,
    })),
    ...tips.map((tip) => ({
      title: "AI Tip",
      body: tip,
      meta: "Building optimization",
    })),
  ].slice(0, 6);
}

function renderNotifications() {
  elements.notificationList.innerHTML = getNotificationFeed()
    .map(
      (item) => `
        <div class="notification-item">
          <strong>${item.title}</strong>
          <div>${item.body}</div>
          <small>${item.meta}</small>
        </div>
      `
    )
    .join("");
}

function getSelectedApartment() {
  return state.apartments.find((apartment) => apartment.id === state.selectedApartmentId);
}

function buildInsights(apartment) {
  const insights = [
    ...apartment.anomalies.map((message) => ({
      title: "Anomaly detected",
      body: message,
      meta: "Pattern flagged by EcoHouse AI",
    })),
    ...apartment.recommendations.map((message, index) => ({
      title: index === 0 ? "Optimization" : "Recommendation",
      body: message,
      meta: "Projected savings included",
    })),
  ];

  return insights.slice(0, 5);
}

function renderApartmentDetails() {
  const apartment = getSelectedApartment();
  if (!apartment) return;

  elements.apartmentTitle.textContent = `Apartment ${apartment.number} • Floor ${apartment.floor}`;
  elements.ecoScoreValue.textContent = apartment.score;
  elements.liveElectricity.textContent = `${apartment.electricityDaily[new Date().getHours() % 24].toFixed(1)} kWh`;
  elements.liveWater.textContent = `${Math.round(apartment.waterDaily[new Date().getHours() % 24])} L`;
  elements.liveAir.textContent = `${apartment.co2Series[new Date().getHours() % 24]} ppm / ${apartment.humiditySeries[new Date().getHours() % 24]}%`;
  elements.savingsValue.textContent = `${apartment.savings}%`;

  elements.insightList.innerHTML = buildInsights(apartment)
    .map(
      (insight) => `
        <div class="insight-item">
          <strong>${insight.title}</strong>
          <div>${insight.body}</div>
          <small>${insight.meta}</small>
        </div>
      `
    )
    .join("");

  updateApartmentCharts(apartment);
}

function getPeakSeries() {
  return HOURS.map((_, hourIndex) =>
    state.apartments.reduce((sum, apartment) => sum + apartment.electricityDaily[hourIndex], 0)
  );
}

function renderBuildingSummary() {
  const totalPower = state.apartments.reduce(
    (sum, apartment) => sum + apartment.electricityDaily.reduce((inner, value) => inner + value, 0),
    0
  );
  const totalWater = state.apartments.reduce(
    (sum, apartment) => sum + apartment.waterDaily.reduce((inner, value) => inner + value, 0),
    0
  );
  const averageAir = Math.round(
    state.apartments.reduce((sum, apartment) => sum + apartment.co2Series.reduce((inner, value) => inner + value, 0) / apartment.co2Series.length, 0) /
      state.apartments.length
  );
  const cityImpact = clamp(Math.round(totalPower / 16), 18, 84);

  elements.buildingPower.textContent = `${Math.round(totalPower)} kWh`;
  elements.buildingWater.textContent = `${Math.round(totalWater)} L`;
  elements.buildingAir.textContent = `${averageAir} AQI`;
  elements.cityImpact.textContent = `${cityImpact}%`;

  if (state.charts.peakChart) {
    state.charts.peakChart.data.datasets[0].data = getPeakSeries().map((value) => Number(value.toFixed(1)));
    state.charts.peakChart.update();
  }
}

function createGradient(context, colors) {
  const gradient = context.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  return gradient;
}

function commonChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 900,
      easing: "easeOutQuart",
    },
    plugins: {
      legend: {
        labels: {
          color: "#4a4a4a",
          usePointStyle: true,
          boxWidth: 10,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#6b6b6b", maxTicksLimit: 8 },
        grid: { color: "rgba(0, 0, 0, 0.06)" },
      },
      y: {
        ticks: { color: "#6b6b6b" },
        grid: { color: "rgba(0, 0, 0, 0.06)" },
      },
    },
  };
}

function initCharts() {
  if (typeof Chart === "undefined") {
    ["peakChart", "electricityChart", "waterChart", "airChart"].forEach((id) => {
      const canvas = document.getElementById(id);
      const fallback = document.createElement("div");
      fallback.className = "chart-fallback";
      fallback.textContent = "Chart.js did not load. The rest of the demo remains interactive.";
      canvas.replaceWith(fallback);
    });
    return;
  }

  const peakContext = document.getElementById("peakChart").getContext("2d");
  state.charts.peakChart = new Chart(peakContext, {
    type: "line",
    data: {
      labels: HOURS,
      datasets: [
        {
          label: "Building Demand",
          data: getPeakSeries(),
          tension: 0.4,
          borderColor: "#5a6b6b",
          backgroundColor: createGradient(peakContext, ["rgba(90, 107, 107, 0.2)", "rgba(90, 107, 107, 0.02)"]),
          fill: true,
          pointRadius: 0,
        },
      ],
    },
    options: commonChartOptions(),
  });

  const electricityContext = document.getElementById("electricityChart").getContext("2d");
  state.charts.electricityChart = new Chart(electricityContext, {
    type: "line",
    data: {
      labels: HOURS,
      datasets: [
        {
          label: "Daily kWh",
          data: [],
          tension: 0.42,
          borderColor: "#5a7a8a",
          backgroundColor: createGradient(electricityContext, ["rgba(90, 122, 138, 0.18)", "rgba(90, 122, 138, 0.02)"]),
          fill: true,
          pointRadius: 0,
        },
        {
          label: "Monthly Avg",
          data: [],
          tension: 0.35,
          borderColor: "#6b6b6b",
          pointRadius: 0,
        },
      ],
    },
    options: commonChartOptions(),
  });

  const waterContext = document.getElementById("waterChart").getContext("2d");
  state.charts.waterChart = new Chart(waterContext, {
    type: "bar",
    data: {
      labels: HOURS,
      datasets: [
        {
          label: "Liters",
          data: [],
          backgroundColor: createGradient(waterContext, ["rgba(90, 107, 107, 0.35)", "rgba(90, 107, 107, 0.1)"]),
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
    options: commonChartOptions(),
  });

  const airContext = document.getElementById("airChart").getContext("2d");
  state.charts.airChart = new Chart(airContext, {
    type: "line",
    data: {
      labels: HOURS,
      datasets: [
        {
          label: "CO2 ppm",
          data: [],
          borderColor: "#5a6b6b",
          tension: 0.4,
          pointRadius: 0,
        },
        {
          label: "Humidity %",
          data: [],
          borderColor: "#8a7a5a",
          tension: 0.4,
          pointRadius: 0,
        },
      ],
    },
    options: commonChartOptions(),
  });
}

function updateApartmentCharts(apartment) {
  if (!state.charts.electricityChart || !state.charts.waterChart || !state.charts.airChart) {
    return;
  }

  const electricityAvg = apartment.electricityMonthly
    .slice(0, 24)
    .map((value) => Number((value / 10).toFixed(1)));

  state.charts.electricityChart.data.datasets[0].data = apartment.electricityDaily.map((value) =>
    Number(value.toFixed(1))
  );
  state.charts.electricityChart.data.datasets[1].data = electricityAvg;
  state.charts.electricityChart.update();

  state.charts.waterChart.data.datasets[0].data = apartment.waterDaily.map((value) => Math.round(value));
  state.charts.waterChart.update();

  state.charts.airChart.data.datasets[0].data = apartment.co2Series;
  state.charts.airChart.data.datasets[1].data = apartment.humiditySeries;
  state.charts.airChart.update();
}

function openApartment(apartmentId) {
  state.selectedApartmentId = apartmentId;
  renderApartmentDetails();
  showScreen("apartment");
}

function handleBuildingHover(event) {
  const tile = event.target.closest(".apartment-tile");
  if (!tile) {
    elements.previewCard.classList.remove("visible");
    return;
  }

  elements.previewCard.innerHTML = `
    <strong>Apartment ${tile.dataset.number}</strong>
    <div>Eco Score: ${tile.dataset.score}</div>
    <div>Power: ${tile.dataset.power} kWh</div>
    <div>Water: ${tile.dataset.water} L</div>
  `;
  elements.previewCard.style.left = `${event.clientX + 18}px`;
  elements.previewCard.style.top = `${event.clientY + 18}px`;
  elements.previewCard.classList.add("visible");
}

function handleAssistantPrompt(prompt) {
  const apartment = getSelectedApartment();
  const responses = {
    "How can this building reduce evening peaks?":
      "Stagger EV charging, shift hot-water heating after 21:00, and reward top-five apartments for low evening draw.",
    "Summarize the selected apartment.":
      apartment
        ? `Apartment ${apartment.number} is scoring ${apartment.score}. Main focus: ${apartment.anomalies[0] || "stable usage"} with projected savings of ${apartment.savings}% from AI recommendations.`
        : "Select an apartment to generate a tailored summary.",
    "What would impress hackathon judges most here?":
      "Lead with the cinematic building zoom, anomaly alerts, Eco Mode impact, and the city-infrastructure view to show both product polish and systems thinking.",
  };

  const reply = responses[prompt] || "EcoHouse AI is ready with building intelligence.";
  elements.assistantMessages.innerHTML = `
    <div class="assistant-message">
      <strong>Prompt</strong>
      <div>${prompt}</div>
    </div>
    <div class="assistant-message">
      <strong>EcoHouse AI</strong>
      <div>${reply}</div>
      <small>Generated in demo mode</small>
    </div>
  `;
}

function applyEcoMode() {
  document.body.classList.toggle("eco-mode", state.ecoMode);

  state.apartments = state.apartments.map((apartment) => {
    const factor = state.ecoMode ? 0.88 : 1 / 0.88;
    const adjustedPower = apartment.electricityDaily.map((value) => value * factor);
    const adjustedWater = apartment.waterDaily.map((value) => value * (state.ecoMode ? 0.92 : 1 / 0.92));
    const adjustedScore = clamp(apartment.score + (state.ecoMode ? 6 : -6), 48, 99);
    return {
      ...apartment,
      electricityDaily: adjustedPower,
      waterDaily: adjustedWater,
      score: adjustedScore,
      status: getStatusFromScore(adjustedScore),
      points: apartment.points + (state.ecoMode ? 36 : -36),
    };
  });

  renderBuildingGrid();
  renderLeaderboard();
  renderNotifications();
  renderBuildingSummary();
  renderApartmentDetails();
}

function tickSimulation() {
  state.apartments = state.apartments.map((apartment) => {
    const nextPower = apartment.electricityDaily.map((value, hour) =>
      clamp(value + randomBetween(-0.08, 0.11) + (hour === 19 ? 0.08 : 0), 0.4, 7.5)
    );
    const nextWater = apartment.waterDaily.map((value, hour) =>
      clamp(value + randomBetween(-1.2, 1.4) + (hour === 7 ? 1 : 0), 5, 80)
    );
    const nextCo2 = apartment.co2Series.map((value) => Math.round(clamp(value + randomBetween(-8, 10), 420, 1100)));
    const nextHumidity = apartment.humiditySeries.map((value) => Math.round(clamp(value + randomBetween(-2, 2), 30, 68)));
    const nextScore = clamp(
      apartment.score + Math.round(randomBetween(-1.2, 1.4)) + (state.ecoMode ? 1 : 0),
      48,
      99
    );

    return {
      ...apartment,
      electricityDaily: nextPower,
      waterDaily: nextWater,
      co2Series: nextCo2,
      humiditySeries: nextHumidity,
      score: nextScore,
      status: getStatusFromScore(nextScore),
    };
  });

  renderBuildingGrid();
  renderLeaderboard();
  renderBuildingSummary();

  if (screens.apartment.classList.contains("active")) {
    renderApartmentDetails();
  }
}

function wireEvents() {
  elements.floorSelect.addEventListener("change", (event) => {
    updateApartmentSelector(Number(event.target.value));
  });

  elements.enterBuildingBtn.addEventListener("click", () => {
    state.selectedApartmentId = elements.apartmentSelect.value;
    showScreen("building");
    renderBuildingSummary();
  });

  elements.buildingGrid.addEventListener("click", (event) => {
    const tile = event.target.closest(".apartment-tile");
    if (!tile) return;
    openApartment(tile.dataset.apartmentId);
  });

  elements.buildingGrid.addEventListener("mousemove", handleBuildingHover);
  elements.buildingGrid.addEventListener("mouseleave", () => {
    elements.previewCard.classList.remove("visible");
  });

  elements.backToOnboardingBtn.addEventListener("click", () => showScreen("onboarding"));
  elements.backToBuildingBtn.addEventListener("click", () => showScreen("building"));

  elements.ecoModeBtn.addEventListener("click", () => {
    state.ecoMode = !state.ecoMode;
    applyEcoMode();
  });

  elements.assistantFab.addEventListener("click", () => {
    elements.assistantPanel.classList.toggle("open");
    if (!elements.assistantMessages.innerHTML.trim()) {
      handleAssistantPrompt("What would impress hackathon judges most here?");
    }
  });

  elements.closeAssistantBtn.addEventListener("click", () => {
    elements.assistantPanel.classList.remove("open");
  });

  document.querySelectorAll(".assistant-prompt").forEach((button) => {
    button.addEventListener("click", () => handleAssistantPrompt(button.dataset.prompt));
  });
}

function init() {
  buildDataset();
  populateSelectors();
  renderHeroBuilding();
  renderBuildingGrid();
  renderLeaderboard();
  renderNotifications();
  wireEvents();
  initCharts();
  renderBuildingSummary();
  renderApartmentDetails();
  handleAssistantPrompt("What would impress hackathon judges most here?");
  setInterval(tickSimulation, 4000);
}

init();
