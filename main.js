// main.js

// sayfa yenilendiğinde formu resetle
window.addEventListener("load", () => {
  districtSelect.value = "";
  lineSelect.innerHTML = '<option value="">Önce ilçe seçin</option>';
});

// 1) Dosyanın yüklendiğini test et
console.log("main.js yüklendi");

// 2) Sabitler ve element referansları
const districtSelect = document.getElementById("districtSelect");
const lineSelect = document.getElementById("lineSelect");
const scheduleContainer = document.getElementById("schedule");

// 3) Leaflet haritasını başlat
const map = L.map("map").setView([39.643, 27.887], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

// 4) Katman gruplarını oluştur
const routeLayer = L.layerGroup().addTo(map); // Rotalar açık
const stationLayer = L.layerGroup(); // Duraklar kapalı
const busLayer = L.layerGroup().addTo(map); // Otobüsler açık

// 5) Layer control ekle
L.control
  .layers(
    null,
    {
      Rotalar: routeLayer,
      Duraklar: stationLayer,
      Otobüsler: busLayer,
    },
    { collapsed: false }
  )
  .addTo(map);

// 6) Katmanları temizleme
function clearMapLayers() {
  routeLayer.clearLayers();
  stationLayer.clearLayers();
  busLayer.clearLayers();
}

// 7) Live otobüs verisini çeken fonksiyon
async function fetchLiveBuses(routeCode) {
  const res = await fetch(
    "https://www.balikesirulasim.com.tr/ajax/busline/live",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `routeCode=${encodeURIComponent(routeCode)}`,
    }
  );
  if (!res.ok) throw new Error(`Live API error: ${res.status}`);
  const json = await res.json();
  return json.status === 1 ? json.data : [];
}

// 8) Live marker güncelleme
async function updateLiveBusMarkers() {
  if (!activeRouteCode) return;
  try {
    const buses = await fetchLiveBuses(activeRouteCode);
    busLayer.clearLayers();
    const icons = {
      stop: L.icon({
        iconUrl: "icons/bus-stop.png",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
      moving: L.icon({
        iconUrl: "icons/bus-moving.png",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    };
    buses.forEach((b) => {
      L.marker([+b.lat, +b.long], {
        icon: icons[b.icon] || icons.stop,
        rotationAngle: +b.angle,
      })
        .bindPopup(
          `
        <strong>${b.licensePlate}</strong><br>
        Hız: ${b.speed} km/h<br>
        Açı: ${b.angle}°
      `
        )
        .addTo(busLayer);
    });
  } catch (err) {
    console.warn("Canlı veriler güncellenemedi:", err);
  }
}

// 9) Sefer saatlerini parse eden fonksiyon
function parseScheduleGroups(doc) {
  const panel = Array.from(doc.querySelectorAll(".card-panel")).find(
    (el) =>
      el.querySelector(".card-panel-title")?.textContent.trim() ===
      "Sefer Saatleri"
  );
  if (!panel) return [];

  const tables = Array.from(panel.querySelectorAll("table.voyage-detail"));
  return tables.map((table) => {
    const dep =
      table
        .querySelector("tr:nth-child(1) .location-badge")
        ?.textContent.trim() || "";
    const arr =
      table
        .querySelector("tr:nth-child(2) .location-badge")
        ?.textContent.trim() || "";

    const schedules = { haftaIci: null, cumartesi: null, pazar: null };
    let sib = table.nextElementSibling;
    while (sib && !sib.matches("table.voyage-detail")) {
      if (sib.matches(".voyage-hours")) {
        const title =
          sib.querySelector(".voyage-hours-title")?.textContent.trim() || "";
        const times = Array.from(sib.querySelectorAll(".hour-item")).map((el) =>
          el.textContent.trim()
        );
        const desc =
          sib.querySelector(".hours-description")?.innerHTML.trim() || "";
        if (/Hafta İçi/.test(title))
          schedules.haftaIci = { title, times, description: desc };
        if (/Cumartesi/.test(title))
          schedules.cumartesi = { title, times, description: desc };
        if (/Pazar/.test(title))
          schedules.pazar = { title, times, description: desc };
      }
      sib = sib.nextElementSibling;
    }
    return { departure: dep, arrival: arr, schedules };
  });
}

// 10) Sefer saatlerini tablarla render eden fonksiyon
function renderSchedules(groups) {
  if (!groups.length) {
    scheduleContainer.innerHTML = "<p>Sefer saati bulunamadı.</p>";
    return;
  }

  const depTabs = groups
    .map(
      (g, i) =>
        `<li class="dep-tab${i === 0 ? " active" : ""}" data-index="${i}">${
          g.departure
        }</li>`
    )
    .join("");
  const dayTabs = ["Hafta İçi", "Cumartesi", "Pazar"]
    .map(
      (d, i) =>
        `<li class="day-tab${
          i === 0 ? " active" : ""
        }" data-day="${d}">${d}</li>`
    )
    .join("");

  scheduleContainer.innerHTML = `
    <ul class="tabs dep-tabs">${depTabs}</ul>
    <ul class="tabs day-tabs">${dayTabs}</ul>
    <div id="schedule-content"></div>
  `;

  const depEls = scheduleContainer.querySelectorAll(".dep-tab");
  const dayEls = scheduleContainer.querySelectorAll(".day-tab");
  const content = scheduleContainer.querySelector("#schedule-content");

  function show(depIdx, dayKey) {
    depEls.forEach((el) =>
      el.classList.toggle("active", +el.dataset.index === depIdx)
    );
    dayEls.forEach((el) =>
      el.classList.toggle("active", el.dataset.day === dayKey)
    );

    const grp = groups[depIdx];
    const sch =
      grp.schedules[
        dayKey === "Hafta İçi"
          ? "haftaIci"
          : dayKey === "Cumartesi"
          ? "cumartesi"
          : "pazar"
      ];
    if (!sch) {
      content.innerHTML = "<p>Sefer saati bulunamadı.</p>";
      return;
    }
    const timesHtml = sch.times
      .map((t) => `<span class="time-item">${t}</span>`)
      .join("");
    const descHtml = sch.description
      ? `<div class="schedule-desc">${sch.description}</div>`
      : "";

    content.innerHTML = `
      <div class="schedule-group">
        <h3>${sch.title}</h3>
        <div class="schedule-times">${timesHtml}</div>
        ${descHtml}
      </div>
    `;
  }

  depEls.forEach((el) =>
    el.addEventListener("click", () => {
      const idx = +el.dataset.index;
      const activeDay =
        scheduleContainer.querySelector(".day-tab.active").dataset.day;
      show(idx, activeDay);
    })
  );
  dayEls.forEach((el) =>
    el.addEventListener("click", () => {
      const day = el.dataset.day;
      const activeDep =
        +scheduleContainer.querySelector(".dep-tab.active").dataset.index;
      show(activeDep, day);
    })
  );

  show(0, "Hafta İçi");
}

// 11) Live update kontrol değişkeni
let activeRouteCode = null;
let liveUpdateTimer = null;

// 12) İlçe seçildiğinde handler
districtSelect.addEventListener("change", async () => {
  clearInterval(liveUpdateTimer);
  activeRouteCode = null;
  scheduleContainer.innerHTML = "";
  lineSelect.innerHTML = '<option value="">Önce ilçe seçin</option>';

  const dist = districtSelect.value;
  if (!dist) return;

  try {
    const res = await fetch(
      `https://www.balikesirulasim.com.tr/ajax/busline/list/${dist}`
    );
    const data = await res.json();
    lineSelect.innerHTML = '<option value="">Hat Seçiniz</option>';
    data.forEach((item) => {
      const opt = document.createElement("option");
      opt.value = item.seo;
      opt.textContent = item.name;
      lineSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Hat listesi fetch hatası:", err);
    lineSelect.innerHTML = '<option value="">Veri yüklenemedi</option>';
  }
});

// 13) Hat seçildiğinde handler
lineSelect.addEventListener("change", async () => {
  const seo = lineSelect.value;
  if (!seo) return;

  clearMapLayers();
  clearInterval(liveUpdateTimer);
  scheduleContainer.innerHTML = "";

  // 13.a) Hat detaylarını çek ve parse et
  const html = await fetch(
    `https://www.balikesirulasim.com.tr/hat/${seo}`
  ).then((r) => r.text());
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = Array.from(doc.querySelectorAll("script"));

  // 13.b) Gömülü veri parse
  const dataObj = {};
  const reJson = /let\s+(\w+)\s*=\s*JSON\.parse\(\s*"([\s\S]*?)"\s*\);/g;
  const reArr = /let\s+(\w+)\s*=\s*(\[[\s\S]*?\]);/g;
  let m;
  scripts.forEach((s) => {
    while ((m = reJson.exec(s.textContent))) dataObj[m[1]] = JSON.parse(m[2]);
    while ((m = reArr.exec(s.textContent))) dataObj[m[1]] = JSON.parse(m[2]);
  });

  // 13.c) Sefer saatlerini parse & render
  const scheduleGroups = parseScheduleGroups(doc);
  renderSchedules(scheduleGroups);

  // 13.d) routeCode’u ayıkla, otobüsleri ilk getir ve timer başlat
  const match = html.match(/"routeCode"\s*:\s*"([^"]+)"/);
  if (match) {
    activeRouteCode = match[1];
    await updateLiveBusMarkers();
    liveUpdateTimer = setInterval(updateLiveBusMarkers, 5000);
  }

  // 13.e) Haritayı çiz
  renderMap(dataObj);
});

// 14) Haritayı çizen fonksiyon
function renderMap(data) {
  if (
    Array.isArray(data.defaultMapCenter) &&
    data.defaultMapCenter.length === 2
  ) {
    map.setView(data.defaultMapCenter, 13);
  }
  if (Array.isArray(data.goingLatLongs)) {
    const c = data.goingLatLongs.map(([lng, lat]) => [lat, lng]);
    L.polyline(c, { color: "blue", weight: 5 }).addTo(routeLayer);
  }
  if (Array.isArray(data.comingLatLongs)) {
    const c = data.comingLatLongs.map(([lng, lat]) => [lat, lng]);
    L.polyline(c, { color: "red", weight: 5, dashArray: "5,10" }).addTo(
      routeLayer
    );
  }
  if (Array.isArray(data.stationsData)) {
    data.stationsData.forEach((s) => {
      L.marker([+s.mapLat, +s.mapLong]).bindPopup(s.name).addTo(stationLayer);
    });
  }
  if (!data.defaultMapCenter) {
    const all = [
      ...(data.goingLatLongs || []),
      ...(data.comingLatLongs || []),
    ].map(([lng, lat]) => [lat, lng]);
    if (all.length) map.fitBounds(all, { padding: [20, 20] });
  }
  setTimeout(() => map.invalidateSize(), 0);
}
