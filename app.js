const DATA_URL = 'https://tcgbusfs.blob.core.windows.net/dotapp/youbike/v2/youbike_immediate.json';
const REFRESH_MS = 60_000;
const LOW_BIKE_RATIO = 0.2;
const HISTORY_LIMIT = 60;
const byId = (id) => document.getElementById(id);
const state = { stations: [], history: [], lastSuccess: null, loading: false };

function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function clockTime(date) { return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date); }
function isLow(station) { return number(station.Quantity) > 0 && number(station.available_rent_bikes) / number(station.Quantity) < LOW_BIKE_RATIO; }
function renderClock() { byId('clock').textContent = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }

async function loadData({ manual = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const button = byId('refresh-button'); button.disabled = true;
  byId('connection-label').textContent = '更新中';
  if (manual) byId('update-status').textContent = '正在更新資料…';
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`資料來源回應 ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('資料格式與預期不同');
    const stations = payload.filter((item) => item?.sarea === '內湖區' && String(item.act) === '1')
      .map((item) => ({ ...item, available_rent_bikes: number(item.available_rent_bikes), available_return_bikes: number(item.available_return_bikes), Quantity: number(item.Quantity) }))
      .sort((a, b) => a.sna.localeCompare(b.sna, 'zh-Hant'));
    if (!stations.length) throw new Error('目前沒有取得內湖區營運站點');
    const fetchedAt = new Date();
    state.stations = stations; state.lastSuccess = fetchedAt;
    const bikes = stations.reduce((sum, station) => sum + station.available_rent_bikes, 0);
    state.history.push({ time: fetchedAt, bikes });
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    byId('error-banner').hidden = true;
    byId('connection-label').textContent = '連線正常';
    byId('update-status').textContent = '資料已更新';
    byId('fetch-time').textContent = `抓取時間 ${clockTime(fetchedAt)}`;
    const sourceDates = stations.map((s) => s.srcUpdateTime || s.updateTime || s.mday).filter(Boolean).sort();
    byId('source-time').textContent = `資料時間 ${sourceDates.at(-1) ? clockTime(new Date(sourceDates.at(-1).replace(' ', 'T'))) : '--'}`;
    renderDashboard();
  } catch (error) {
    byId('connection-label').textContent = '更新失敗';
    byId('update-status').textContent = state.lastSuccess ? `更新失敗，保留 ${clockTime(state.lastSuccess)} 的資料` : '無法取得資料';
    byId('error-banner').textContent = `目前無法連線至 YouBike 即時資料，系統會自動重試。${state.stations.length ? '畫面保留上次成功取得的資料。' : ''}`;
    byId('error-banner').hidden = false;
    if (!state.stations.length) byId('stations-body').innerHTML = '<tr><td colspan="5" class="empty-state">暫時無法載入站點資料，請稍後重試。</td></tr>';
  } finally { state.loading = false; button.disabled = false; }
}

function renderDashboard() {
  const stations = state.stations;
  const bikes = stations.reduce((sum, s) => sum + s.available_rent_bikes, 0);
  const docks = stations.reduce((sum, s) => sum + s.available_return_bikes, 0);
  const lowStations = stations.filter(isLow);
  byId('total-bikes').textContent = bikes.toLocaleString('zh-TW');
  byId('total-docks').textContent = docks.toLocaleString('zh-TW');
  byId('low-station-count').textContent = lowStations.length.toLocaleString('zh-TW');
  byId('station-count').textContent = `${stations.length} 個營運站點`;
  byId('alert-count-badge').textContent = `${lowStations.length} 站`;
  const previous = state.history.at(-2);
  byId('bike-trend').textContent = previous ? `${bikes - previous.bikes > 0 ? '+' : ''}${bikes - previous.bikes} 輛` : '趨勢累積中';
  renderAlerts(lowStations); renderStations(); drawChart();
}

function renderAlerts(stations) {
  const list = byId('alerts-list');
  if (!stations.length) { list.innerHTML = '<p class="empty-state">目前各站車量充足，祝通勤順利。</p>'; return; }
  list.innerHTML = stations.toSorted((a, b) => a.available_rent_bikes - b.available_rent_bikes).slice(0, 12).map((s) => `<div class="alert-item"><span class="alert-name" title="${escapeHtml(s.sna)}">${escapeHtml(cleanName(s.sna))}</span><span class="alert-value">${s.available_rent_bikes} 輛 · ${Math.round(s.available_rent_bikes / s.Quantity * 100)}%</span></div>`).join('');
}

function cleanName(name) { return String(name || '').replace(/^YouBike2\.0[_＿]?/, ''); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function renderStations() {
  const query = byId('search-input').value.trim().toLocaleLowerCase();
  const lowOnly = byId('low-only').checked;
  const sort = byId('sort-select').value;
  const items = state.stations.filter((s) => (!lowOnly || isLow(s)) && (!query || `${s.sna} ${s.ar}`.toLocaleLowerCase().includes(query)));
  if (sort === 'bikes-desc') items.sort((a, b) => b.available_rent_bikes - a.available_rent_bikes);
  if (sort === 'bikes-asc') items.sort((a, b) => a.available_rent_bikes - b.available_rent_bikes);
  if (sort === 'name') items.sort((a, b) => a.sna.localeCompare(b.sna, 'zh-Hant'));
  byId('result-count').textContent = `${items.length} 個站點`;
  byId('stations-body').innerHTML = items.length ? items.map((s) => `<tr><td class="station-cell" title="${escapeHtml(s.sna)}">${escapeHtml(cleanName(s.sna))}<div class="station-address">${escapeHtml(s.ar || '—')}</div></td><td>${escapeHtml(s.sarea || '內湖區')}</td><td><span class="bike-pill ${isLow(s) ? 'low' : ''}">${s.available_rent_bikes}</span></td><td class="dock-number">${s.available_return_bikes}</td><td>${escapeHtml((s.srcUpdateTime || s.mday || '').slice(11, 19) || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">找不到符合條件的站點。</td></tr>';
}

function drawChart() {
  const canvas = byId('trend-chart'); const empty = byId('chart-empty');
  const width = canvas.clientWidth; const height = canvas.clientHeight; const ratio = window.devicePixelRatio || 1;
  if (!width || !height) return;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
  const points = state.history;
  empty.hidden = points.length >= 2;
  byId('trend-range').textContent = points.length > 1 ? `${clockTime(points[0].time)} — ${clockTime(points.at(-1).time)}` : '等待下一次更新';
  const pad = { left: 34, right: 8, top: 13, bottom: 22 }; const plotW = width - pad.left - pad.right; const plotH = height - pad.top - pad.bottom;
  const values = points.map((p) => p.bikes); const min = Math.max(0, Math.min(...values) - 20); const max = Math.max(min + 40, ...values) + 20;
  ctx.font = '9px DM Sans, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) { const y = pad.top + (plotH * i / 3); const val = Math.round(max - ((max - min) * i / 3)); ctx.strokeStyle = '#eef2ef'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke(); ctx.fillStyle = '#9aa69f'; ctx.fillText(val.toLocaleString(), pad.left - 7, y); }
  if (points.length < 2) return;
  const coords = points.map((point, i) => ({ x: pad.left + i / (points.length - 1) * plotW, y: pad.top + (max - point.bikes) / (max - min) * plotH }));
  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom); gradient.addColorStop(0, '#1d8a6440'); gradient.addColorStop(1, '#1d8a6400');
  ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineTo(coords.at(-1).x, height - pad.bottom); ctx.lineTo(coords[0].x, height - pad.bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); coords.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = '#218660'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  coords.forEach((p, i) => { if (i !== coords.length - 1 && i !== 0 && coords.length > 10) return; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#218660'; ctx.lineWidth = 2; ctx.stroke(); });
}

byId('refresh-button').addEventListener('click', () => loadData({ manual: true }));
byId('search-input').addEventListener('input', renderStations);
byId('sort-select').addEventListener('change', renderStations);
byId('low-only').addEventListener('change', renderStations);
window.addEventListener('resize', drawChart);
renderClock(); setInterval(renderClock, 30_000); loadData(); setInterval(loadData, REFRESH_MS);
