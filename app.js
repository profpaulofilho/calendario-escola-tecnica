const monthNames = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const weekdayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const legendItems = [
  { label: 'Dia de pratica', className: 'phase', color: '#16a34a' },
  { label: 'Feriado', className: 'block-holiday', color: '#f59e0b' },
  { label: 'Recesso', className: 'block-recess', color: '#ef4444' },
  { label: 'Folga administrativa', className: 'block-admin-leave', color: '#0f62fe' },
  { label: 'Acao pedagogica', className: 'block-training', color: '#8b5cf6' }
];

const state = {
  uiMode: 'simple',
  blocks: [],
  monthlyQuotas: {},
  phaseDays: [],
  reportRows: [],
  endDate: null,
  selectedWeekdays: [0, 1, 2, 3, 4, 5, 6],
};

const els = {};
const STORAGE_KEY = 'fase-pratica-app-state';

let senaiLogoDataUrlPromise = null;

function storageAvailable() {
  try {
    const probe = '__fase_pratica_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch (error) {
    console.error('LocalStorage indisponivel.', error);
    return false;
  }
}

function readStoredState() {
  if (!storageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Falha ao ler dados salvos.', error);
    return null;
  }
}

function persistStoredState(payload) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Falha ao salvar dados.', error);
  }
}

function clearStoredState() {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Falha ao limpar dados salvos.', error);
  }
}

function getSenaiLogoDataUrl() {
  if (!senaiLogoDataUrlPromise) {
    senaiLogoDataUrlPromise = fetch('assets/senai-logo.png')
      .then((response) => {
        if (!response.ok) throw new Error('Logo do SENAI nao encontrada.');
        return response.blob();
      })
      .then((blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Nao foi possivel ler a logo do SENAI.'));
        reader.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return senaiLogoDataUrlPromise;
}


document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  loadTheme();
  loadUiMode();
  loadAppData();
  setDefaultStartDate();
  renderLegend();
  renderMonthlyQuotaInputs();
  refreshBlockList();
  applyUiMode();
  updateQuotaPanelVisibility();
  restoreGeneratedResults();
  updateSummary();
  enableAutoSave();
  saveAppData();
  window.addEventListener('beforeunload', saveAppData);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveAppData();
  });
});

function bindElements() {
  [
    'fillerName', 'clientName', 'unitName', 'startDate', 'hoursPerDay', 'totalHours', 'calculationMode',
    'blockType', 'blockDescription', 'blockStart', 'blockEnd', 'blockList', 'monthlyQuotaContainer',
    'btnAddBlock', 'btnGenerate', 'btnReset', 'btnExportPdf', 'calendarLegend', 'calendarMount',
    'reportMount', 'sumPhaseDays', 'sumHoursPerDay', 'sumTotalHours', 'sumEndDate', 'heroTotalDias',
    'heroDataFim', 'themeToggle', 'quotaPanel', 'modeToggle'
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  els.btnAddBlock.addEventListener('click', addBlock);
  els.btnGenerate.addEventListener('click', generateSchedule);
  els.btnReset.addEventListener('click', resetAll);
  els.btnExportPdf.addEventListener('click', exportPdf);
  els.calculationMode.addEventListener('change', updateQuotaPanelVisibility);
  els.themeToggle.addEventListener('click', toggleTheme);
  els.modeToggle.addEventListener('click', toggleUiMode);
  document.querySelectorAll('.weekday-check').forEach((checkbox) => {
    checkbox.addEventListener('change', handleWeekdaySelectionChange);
  });
  els.startDate.addEventListener('change', renderMonthlyQuotaInputs);
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
}


function enableAutoSave() {
  const watchedFields = [
    els.fillerName, els.clientName, els.unitName, els.startDate,
    els.hoursPerDay, els.totalHours, els.calculationMode,
    els.blockType, els.blockDescription, els.blockStart, els.blockEnd,
    ...document.querySelectorAll('.weekday-check')
  ];

  watchedFields.forEach((field) => {
    if (!field) return;
    field.addEventListener('input', saveAppData);
    field.addEventListener('change', saveAppData);
  });
}

function saveAppData() {
  const payload = {
    fillerName: els.fillerName.value || '',
    clientName: els.clientName.value || '',
    unitName: els.unitName.value || '',
    startDate: els.startDate.value || '',
    hoursPerDay: els.hoursPerDay.value || '',
    totalHours: els.totalHours.value || '',
    calculationMode: els.calculationMode.value || 'automatic',
    uiMode: state.uiMode || 'simple',
    blocks: Array.isArray(state.blocks) ? state.blocks : [],
    monthlyQuotas: state.monthlyQuotas || {},
    phaseDays: Array.isArray(state.phaseDays) ? state.phaseDays : [],
    reportRows: Array.isArray(state.reportRows) ? state.reportRows : [],
    endDate: state.endDate || null,
    selectedWeekdays: Array.isArray(state.selectedWeekdays) ? state.selectedWeekdays : [0, 1, 2, 3, 4, 5, 6],
  };
  persistStoredState(payload);
}

function loadAppData() {
  const payload = readStoredState();
  if (!payload) return;

  els.fillerName.value = payload.fillerName || '';
  els.clientName.value = payload.clientName || '';
  els.unitName.value = payload.unitName || '';
  if (payload.startDate) els.startDate.value = payload.startDate;
  if (payload.hoursPerDay !== undefined && payload.hoursPerDay !== '') els.hoursPerDay.value = payload.hoursPerDay;
  if (payload.totalHours !== undefined && payload.totalHours !== '') els.totalHours.value = payload.totalHours;
  if (payload.calculationMode) els.calculationMode.value = payload.calculationMode;
  if (payload.uiMode === 'simple' || payload.uiMode === 'advanced') {
    state.uiMode = payload.uiMode;
    try { window.localStorage.setItem('fase-pratica-ui-mode', state.uiMode); } catch (error) { console.error(error); }
  }

  state.blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  state.monthlyQuotas = payload.monthlyQuotas && typeof payload.monthlyQuotas === 'object' ? payload.monthlyQuotas : {};
  state.phaseDays = Array.isArray(payload.phaseDays) ? payload.phaseDays : [];
  state.reportRows = Array.isArray(payload.reportRows) ? payload.reportRows : [];
  state.endDate = payload.endDate || null;
  state.selectedWeekdays = Array.isArray(payload.selectedWeekdays) && payload.selectedWeekdays.length
    ? payload.selectedWeekdays.map(Number).sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];
  applySelectedWeekdaysToUi();
}

function getSelectedWeekdays() {
  return Array.from(document.querySelectorAll('.weekday-check:checked'))
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
}

function applySelectedWeekdaysToUi() {
  const selected = Array.isArray(state.selectedWeekdays) && state.selectedWeekdays.length
    ? state.selectedWeekdays.map(Number)
    : [0, 1, 2, 3, 4, 5, 6];
  document.querySelectorAll('.weekday-check').forEach((input) => {
    input.checked = selected.includes(Number(input.value));
  });
}

function handleWeekdaySelectionChange(event) {
  const selected = getSelectedWeekdays();
  if (!selected.length) {
    event.target.checked = true;
    alert('Selecione pelo menos um dia da semana para a pratica.');
    return;
  }
  state.selectedWeekdays = selected;
  saveAppData();
}

function formatSelectedWeekdays() {
  const map = {0:'Dom.',1:'Seg.',2:'Ter.',3:'Qua.',4:'Qui.',5:'Sex.',6:'Sab.'};
  const selected = Array.isArray(state.selectedWeekdays) && state.selectedWeekdays.length
    ? state.selectedWeekdays
    : [0, 1, 2, 3, 4, 5, 6];
  return selected.map((d) => map[d]).filter(Boolean).join(', ');
}

function restoreGeneratedResults() {
  if (!state.phaseDays.length || !state.endDate) return;
  const hoursPerDay = Number(els.hoursPerDay.value || 0);
  const totalHours = Number(els.totalHours.value || 0);
  renderCalendar();
  renderReport(hoursPerDay, totalHours, els.calculationMode.value);
}

function loadTheme() {
  const saved = localStorage.getItem('fase-pratica-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  syncThemeButton();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fase-pratica-theme', next);
  syncThemeButton();
}

function syncThemeButton() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  els.themeToggle.textContent = theme === 'dark' ? '☀ Modo claro' : '🌙 Modo escuro';
}

function loadUiMode() {
  state.uiMode = localStorage.getItem('fase-pratica-ui-mode') || 'simple';
}

function toggleUiMode() {
  state.uiMode = state.uiMode === 'simple' ? 'advanced' : 'simple';
  localStorage.setItem('fase-pratica-ui-mode', state.uiMode);
  applyUiMode();
  saveAppData();
}

function applyUiMode() {
  const isAdvanced = state.uiMode === 'advanced';
  document.body.classList.toggle('ui-advanced', isAdvanced);
  document.querySelectorAll('.advanced-only').forEach((node) => {
    node.style.display = isAdvanced ? '' : 'none';
  });
  if (!isAdvanced) {
    els.calculationMode.value = 'automatic';
  }
  els.modeToggle.textContent = isAdvanced ? 'Modo simples' : 'Modo avançado';
  updateQuotaPanelVisibility();
}

function setDefaultStartDate() {
  if (!els.startDate.value) {
    els.startDate.value = fmtDate(new Date());
  }
}

function renderLegend() {
  els.calendarLegend.innerHTML = legendItems.map((item) => (
    `<span><i class="swatch" style="background:${item.color}"></i>${item.label}</span>`
  )).join('');
}

function updateQuotaPanelVisibility() {
  const shouldShow = state.uiMode === 'advanced' && els.calculationMode.value === 'monthly-quota';
  els.quotaPanel.style.display = shouldShow ? '' : 'none';
}

function renderMonthlyQuotaInputs() {
  const initialYear = new Date(`${els.startDate.value || fmtDate(new Date())}T00:00:00`).getFullYear();
  const months = [];
  for (let year = initialYear; year <= initialYear + 2; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const value = state.monthlyQuotas[key] ?? '';
      months.push(`
        <div class="quota-item">
          <label>${monthNames[month]} ${year}
            <input type="number" min="0" data-quota-key="${key}" value="${value}" placeholder="Dias no mes" />
          </label>
        </div>
      `);
    }
  }
  els.monthlyQuotaContainer.innerHTML = months.join('');
  els.monthlyQuotaContainer.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      state.monthlyQuotas[input.dataset.quotaKey] = raw === '' ? '' : Number(raw);
      saveAppData();
    });
  });
}

function addBlock() {
  const start = els.blockStart.value;
  if (!start) {
    alert('Informe a data inicial do bloqueio.');
    return;
  }

  const end = els.blockEnd.value || start;
  if (end < start) {
    alert('A data final do bloqueio nao pode ser menor que a data inicial.');
    return;
  }

  state.blocks.push({
    type: els.blockType.value,
    description: (els.blockDescription.value || '').trim() || friendlyBlockType(els.blockType.value),
    start,
    end,
  });
  state.blocks.sort((a, b) => a.start.localeCompare(b.start));

  els.blockDescription.value = '';
  els.blockStart.value = '';
  els.blockEnd.value = '';
  refreshBlockList();
  saveAppData();
}

function removeBlock(index) {
  state.blocks.splice(index, 1);
  refreshBlockList();
  saveAppData();
}

function refreshBlockList() {
  const visibleBlocks = getVisibleBlocksForSidebar();
  if (!visibleBlocks.length) {
    els.blockList.className = 'tag-list empty-state';
    els.blockList.textContent = state.blocks.some((block) => block.automatic)
      ? 'Nenhum bloqueio dentro do periodo calculado.'
      : 'Nenhum bloqueio cadastrado.';
    return;
  }

  els.blockList.className = 'tag-list';
  els.blockList.innerHTML = visibleBlocks.map(({ block, index }) => `
    <div class="block-item">
      <div class="block-meta">
        <strong>${escapeHtml(block.description)}${block.automatic ? ` [automatico${block.holidayScope ? ' - ' + escapeHtml(block.holidayScope) : ''}]` : ''}</strong>
        <small>${friendlyBlockType(block.type)} • ${formatDateBR(block.start)} ate ${formatDateBR(block.end)}</small>
      </div>
      ${block.automatic ? '' : `<button class="secondary-btn icon-btn" type="button" data-remove-block="${index}" aria-label="Remover bloqueio">✕</button>`}
    </div>
  `).join('');

  els.blockList.querySelectorAll('[data-remove-block]').forEach((button) => {
    button.addEventListener('click', () => removeBlock(Number(button.dataset.removeBlock)));
  });
}

function getVisibleBlocksForSidebar() {
  if (!state.blocks.length) return [];

  const hasCalculatedPeriod = state.phaseDays.length && state.endDate;
  const visible = hasCalculatedPeriod
    ? state.blocks.filter((block) => !block.automatic || (block.start <= state.endDate && block.end >= state.phaseDays[0]))
    : state.blocks.filter((block) => !block.automatic);

  return visible.map((block, index) => ({ block, index: state.blocks.indexOf(block) }));
}


function removeAutomaticBlocks() {
  state.blocks = state.blocks.filter((block) => !block.automatic);
  refreshBlockList();
  saveAppData();
}

async function ensureAutomaticHolidays(startDate, totalHours, hoursPerDay) {
  const requiredDays = Math.max(1, Math.ceil((totalHours || 1) / Math.max(hoursPerDay || 1, 1)));
  const start = new Date(`${startDate}T00:00:00`);
  const approxEnd = new Date(start);
  approxEnd.setDate(approxEnd.getDate() + Math.max(requiredDays * 3, 370));
  const years = [];
  for (let y = start.getFullYear(); y <= approxEnd.getFullYear(); y += 1) years.push(y);
  removeAutomaticBlocks();
  try {
    const fetched = [];
    const seen = new Set();
    for (const year of years) {
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (!response.ok) throw new Error(`Falha ao consultar feriados de ${year}.`);
      const data = await response.json();
      data.forEach((item) => {
        if (item && item.date) {
          const key = `national-${item.date}`;
          if (seen.has(key)) return;
          seen.add(key);
          fetched.push({
            type: 'holiday',
            description: item.name || 'Feriado nacional',
            start: item.date,
            end: item.date,
            automatic: true,
            holidayScope: 'Nacional',
          });
        }
      });

      [
        { date: `${year}-06-24`, description: 'Sao Joao', scope: 'Bahia' },
        { date: `${year}-07-02`, description: 'Independencia da Bahia', scope: 'Bahia' },
        { date: `${year}-12-08`, description: 'Nossa Senhora da Conceicao da Praia', scope: 'Salvador/BA' },
      ].forEach((item) => {
        const key = `${item.scope}-${item.date}`;
        if (seen.has(key)) return;
        seen.add(key);
        fetched.push({
          type: 'holiday',
          description: item.description,
          start: item.date,
          end: item.date,
          automatic: true,
          holidayScope: item.scope,
        });
      });
    }
    state.blocks = [...state.blocks.filter((b) => !b.automatic), ...fetched].sort((a, b) => a.start.localeCompare(b.start));
    refreshBlockList();
    saveAppData();
  } catch (error) {
    console.error(error);
    alert('Nao foi possivel atualizar automaticamente os feriados nacionais e da Bahia.');
  }
}

function getBlocksWithinCurrentPeriod() {
  if (!state.phaseDays.length || !state.endDate) return state.blocks.filter((block) => !block.automatic);
  const start = state.phaseDays[0];
  const end = state.endDate;
  return state.blocks.filter((block) => block.start <= end && block.end >= start);
}

async function generateSchedule() {
  state.selectedWeekdays = getSelectedWeekdays();
  const startDate = els.startDate.value;
  const hoursPerDay = Number(els.hoursPerDay.value || 0);
  const totalHours = Number(els.totalHours.value || 0);
  const mode = state.uiMode === 'advanced' ? els.calculationMode.value : 'automatic';

  if (!startDate) {
    alert('Informe a data de inicio da fase pratica.');
    return;
  }
  if (hoursPerDay <= 0 || totalHours <= 0) {
    alert('Informe horas por dia e carga horaria total maiores que zero.');
    return;
  }

  await ensureAutomaticHolidays(startDate, totalHours, hoursPerDay);

  let phaseDays = [];
  if (mode === 'monthly-quota') {
    phaseDays = calculateMonthlyQuotaDays(startDate, totalHours, hoursPerDay);
  } else {
    phaseDays = calculateAutomaticDays(startDate, totalHours, hoursPerDay);
  }

  if (!phaseDays.length) {
    alert('Nao foi possivel calcular os dias de pratica com as regras informadas.');
    return;
  }

  state.phaseDays = phaseDays;
  state.endDate = phaseDays[phaseDays.length - 1];
  state.reportRows = buildMonthlyReport(phaseDays, hoursPerDay);

  renderCalendar();
  refreshBlockList();
  renderReport(hoursPerDay, totalHours, mode);
  updateSummary(hoursPerDay, totalHours);
  switchTab('calendar');
  saveAppData();
}

function calculateAutomaticDays(startDate, totalHours, hoursPerDay) {
  const requiredDays = Math.ceil(totalHours / hoursPerDay);
  const result = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  let safe = 0;

  while (result.length < requiredDays && safe < 5000) {
    if (isValidPracticeDay(cursor)) result.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    safe += 1;
  }
  return result;
}

function calculateMonthlyQuotaDays(startDate, totalHours, hoursPerDay) {
  const requiredDays = Math.ceil(totalHours / hoursPerDay);
  const result = [];
  const usedByMonth = {};
  const cursor = new Date(`${startDate}T00:00:00`);
  let safe = 0;

  while (result.length < requiredDays && safe < 5000) {
    const key = monthKey(cursor);
    const configured = Number(state.monthlyQuotas[key] || 0);
    const used = usedByMonth[key] || 0;

    if (configured > used && isValidPracticeDay(cursor)) {
      result.push(fmtDate(cursor));
      usedByMonth[key] = used + 1;
    }

    cursor.setDate(cursor.getDate() + 1);
    safe += 1;

    const totalConfigured = Object.values(state.monthlyQuotas)
      .map((value) => Number(value || 0))
      .reduce((sum, value) => sum + value, 0);

    if (totalConfigured > 0 && totalConfigured === result.length) break;
  }

  const totalConfigured = Object.values(state.monthlyQuotas)
    .map((value) => Number(value || 0))
    .reduce((sum, value) => sum + value, 0);

  if (totalConfigured < requiredDays) {
    alert(`As cotas mensais somam ${totalConfigured} dia(s), mas sao necessarios ${requiredDays} dia(s). Complete as cotas mensais.`);
    return [];
  }

  if (result.length < requiredDays) {
    alert('Nao foi possivel encaixar todos os dias previstos nas cotas mensais informadas.');
    return [];
  }

  return result;
}

function isValidPracticeDay(date) {
  const day = date.getDay();
  const selected = Array.isArray(state.selectedWeekdays) && state.selectedWeekdays.length ? state.selectedWeekdays : [0, 1, 2, 3, 4, 5, 6];
  if (!selected.includes(day)) return false;
  return !findBlockForDate(fmtDate(date));
}

function findBlockForDate(dateStr) {
  return state.blocks.find((block) => dateStr >= block.start && dateStr <= block.end) || null;
}

function renderCalendar() {
  if (!state.phaseDays.length) {
    els.calendarMount.className = 'calendar-mount empty-state';
    els.calendarMount.innerHTML = 'Nenhum dia calculado.';
    return;
  }

  const grouped = groupMonthsBetween(state.phaseDays[0], state.phaseDays[state.phaseDays.length - 1]);
  els.calendarMount.className = 'calendar-mount';
  els.calendarMount.innerHTML = Object.entries(grouped).map(([year, months]) => `
    <section class="calendar-year">
      <h3>${year}</h3>
      <div class="month-grid">${months.map(renderMonthCard).join('')}</div>
    </section>
  `).join('');
}

function renderMonthCard({ year, month }) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  const startOffset = first.getDay();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthlyCount = state.phaseDays.filter((date) => date.startsWith(monthPrefix)).length;
  const configuredQuota = Number(state.monthlyQuotas[monthPrefix] || 0);

  let daysHtml = '';
  for (let i = 0; i < startOffset; i += 1) daysHtml += '<div class="day muted"></div>';

  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month, day);
    const key = fmtDate(current);
    const block = findBlockForDate(key);
    const isPhase = state.phaseDays.includes(key);
    const classes = ['day'];
    if (current.getDay() === 0 || current.getDay() === 6) classes.push('weekend');
    if (isPhase) classes.push('phase');
    if (block) classes.push(`block-${block.type}`);
    const title = block ? `${friendlyBlockType(block.type)} - ${block.description}` : (isPhase ? 'Dia de pratica' : '');
    daysHtml += `<div class="${classes.join(' ')}" title="${escapeHtml(title)}">${day}</div>`;
  }

  const metaText = state.uiMode === 'advanced' && els.calculationMode.value === 'monthly-quota'
    ? `Dias no mes: <strong>${monthlyCount}</strong> • previsto: <strong>${configuredQuota}</strong>`
    : `Dias no mes: <strong>${monthlyCount}</strong>`;

  return `
    <article class="month-card">
      <header>${monthNames[month]} ${year}</header>
      <div class="month-meta">${metaText}</div>
      <div class="weekdays">${weekdayNames.map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="days">${daysHtml}</div>
    </article>
  `;
}

function renderReport(hoursPerDay, totalHours, mode) {
  const filler = escapeHtml((els.fillerName.value || '').trim() || 'Nao informado');
  const client = escapeHtml((els.clientName.value || '').trim() || 'Nao informado');
  const unit = escapeHtml((els.unitName.value || '').trim() || 'Nao informada');
  const rows = state.reportRows.map((row) => `
    <tr><td>${escapeHtml(row.month)}</td><td>${row.days}</td><td>${row.hours}</td></tr>
  `).join('');
  const displayBlocks = getBlocksWithinCurrentPeriod();
  const blocksHtml = displayBlocks.length
    ? `<ul>${displayBlocks.map((block) => `<li>${escapeHtml(block.description)} - ${friendlyBlockType(block.type)} (${formatDateBR(block.start)} ate ${formatDateBR(block.end)})${block.automatic ? ` [automatico${block.holidayScope ? ' - ' + escapeHtml(block.holidayScope) : ''}]` : ''}</li>`).join('')}</ul>`
    : '<p>Nenhum bloqueio dentro do periodo calculado.</p>';

  els.reportMount.className = 'report-box';
  els.reportMount.innerHTML = `
    <div class="report-header-grid">
      <div><strong>Responsavel pelas informacoes:</strong> ${filler}</div>
      <div><strong>Empresa:</strong> ${client}</div>
      <div><strong>Unidade:</strong> ${unit}</div>
      <div><strong>Modo:</strong> ${mode === 'monthly-quota' ? 'Calendario personalizado por mes' : 'Automatico por dias uteis'}</div>
      <div><strong>Dias considerados:</strong> ${formatSelectedWeekdays()}</div>
      <div><strong>Periodo:</strong> ${formatDateBR(state.phaseDays[0])} ate ${formatDateBR(state.endDate)}</div>
      <div><strong>Total previsto:</strong> ${state.phaseDays.length} dias / ${totalHours} horas</div>
      <div><strong>Horas por dia:</strong> ${hoursPerDay} h</div>
    </div>
    <h4>Distribuicao por mes</h4>
    <table>
      <thead><tr><th>Mes</th><th>Dias</th><th>Horas</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <h4>Bloqueios cadastrados</h4>
    ${blocksHtml}
  `;
}

function updateSummary(hoursPerDay = Number(els.hoursPerDay.value || 0), totalHours = Number(els.totalHours.value || 0)) {
  els.sumPhaseDays.textContent = state.phaseDays.length || '--';
  els.sumHoursPerDay.textContent = hoursPerDay || '--';
  els.sumTotalHours.textContent = totalHours || '--';
  const end = state.endDate ? formatDateBR(state.endDate) : '--';
  els.sumEndDate.textContent = end;
  els.heroTotalDias.textContent = state.phaseDays.length || 0;
  els.heroDataFim.textContent = end;
}

function buildMonthlyReport(days, hoursPerDay) {
  const map = new Map();
  days.forEach((date) => {
    const key = date.slice(0, 7);
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries()).map(([key, count]) => {
    const [year, month] = key.split('-').map(Number);
    return {
      month: `${monthNames[month - 1]} ${year}`,
      days: count,
      hours: count * hoursPerDay,
    };
  });
}

function groupMonthsBetween(start, end) {
  const output = {};
  const cursor = new Date(`${start}T00:00:00`);
  const limit = new Date(`${end}T00:00:00`);
  cursor.setDate(1);

  while (cursor <= limit) {
    const year = cursor.getFullYear();
    if (!output[year]) output[year] = [];
    output[year].push({ year, month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return output;
}

async function exportPdf() {
  if (!state.phaseDays.length) {
    alert('Gere o calendario antes de baixar o PDF.');
    return;
  }
  if (!window.jspdf) {
    alert('A biblioteca do PDF nao foi carregada. Verifique sua conexao e tente novamente.');
    return;
  }

  const originalText = els.btnExportPdf.textContent;
  saveAppData();
  els.btnExportPdf.disabled = true;
  els.btnExportPdf.textContent = 'Gerando PDF...';

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const senaiLogoDataUrl = await getSenaiLogoDataUrl();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - (margin * 2);
    let y = margin;

    y = drawPdfCover(pdf, margin, contentWidth, y, senaiLogoDataUrl);
    pdf.addPage();
    y = margin;
    drawPdfPageHeader(pdf, 'Resumo da fase pratica', senaiLogoDataUrl);
    y = 24;
    y = drawPdfMonthlySummary(pdf, margin, contentWidth, y, pageHeight, senaiLogoDataUrl);
    y = drawPdfBlocks(pdf, margin, contentWidth, y, pageHeight, senaiLogoDataUrl);
    appendCalendarPages(pdf, margin, contentWidth, pageHeight, senaiLogoDataUrl);

    const safeFiller = sanitizeFilePart(els.fillerName.value || 'ficha');
    const safeClient = sanitizeFilePart(els.clientName.value || 'cliente');
    pdf.save(`calendario-fase-pratica-${safeFiller}-${safeClient}.pdf`);
  } catch (error) {
    console.error(error);
    alert(`Nao foi possivel gerar o PDF. ${error && error.message ? error.message : ''}`.trim());
  } finally {
    els.btnExportPdf.disabled = false;
    els.btnExportPdf.textContent = originalText;
  }
}

function drawPdfCover(pdf, margin, contentWidth, y, senaiLogoDataUrl) {
  const filler = (els.fillerName.value || '').trim() || 'Nao informado';
  const client = (els.clientName.value || '').trim() || 'Nao informado';
  const unit = (els.unitName.value || '').trim() || 'Nao informada';
  const mode = state.uiMode === 'advanced' && els.calculationMode.value === 'monthly-quota'
    ? 'Calendario personalizado por mes'
    : 'Automatico por dias uteis';
  const periodStart = state.phaseDays[0] ? formatDateBR(state.phaseDays[0]) : '--';
  const periodEnd = state.endDate ? formatDateBR(state.endDate) : '--';

  pdf.setDrawColor(209, 213, 219);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, y, contentWidth, 32, 4, 4, 'FD');
  if (senaiLogoDataUrl) {
    pdf.addImage(senaiLogoDataUrl, 'PNG', margin + 5, y + 6, 58, 14);
  }
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('Planejamento da Fase Pratica', margin + 68, y + 12);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 116, 139);
  pdf.text('Calendario institucional da fase pratica', margin + 68, y + 19);
  pdf.text('Servico Nacional de Aprendizagem Industrial', margin + 68, y + 25);
  y += 40;

  const cards = [
    ['Dias de pratica', String(state.phaseDays.length)],
    ['Carga horaria', `${Number(els.totalHours.value || 0)} h`],
    ['Data final', periodEnd],
  ];
  const gap = 4;
  const cardWidth = (contentWidth - gap * 2) / 3;
  cards.forEach((card, index) => {
    const x = margin + ((cardWidth + gap) * index);
    pdf.setDrawColor(209, 213, 219);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, y, cardWidth, 22, 3, 3, 'FD');
    pdf.setTextColor(107, 114, 128);
    pdf.setFontSize(9);
    pdf.text(card[0], x + 4, y + 7);
    pdf.setTextColor(17, 24, 39);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(card[1], x + 4, y + 16);
  });
  y += 30;

  y = drawDetailBox(pdf, margin, y, contentWidth, 'Dados da ficha', [
    ['Responsavel pelas informacoes', filler],
    ['Empresa / Cliente', client],
    ['Unidade SENAI', unit],
    ['Modo de calculo', mode],
    ['Periodo', `${periodStart} ate ${periodEnd}`],
    ['Horas por dia', `${Number(els.hoursPerDay.value || 0)} h`],
  ]);

  pdf.setTextColor(107, 114, 128);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Desenvolvido por Paulo da Silva Filho - Especialista em TI - GEP - BAHIA- 2026', margin, 285);
  return y;
}


function drawPdfPageHeader(pdf, title, logoDataUrl) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, 22, 'F');
  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, 'PNG', 12, 6, 42, 10);
  }
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title, pageWidth - 12, 13, { align: 'right' });
  pdf.setDrawColor(229, 231, 235);
  pdf.line(12, 18, pageWidth - 12, 18);
}

function drawPdfMonthlySummary(pdf, margin, contentWidth, y, pageHeight, senaiLogoDataUrl) {
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('Resumo por mes', margin, y);
  y += 6;

  const colX = [margin, margin + 98, margin + 130];
  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, y, contentWidth, 8, 'F');
  pdf.setFontSize(10);
  pdf.text('Mes', colX[0] + 2, y + 5.5);
  pdf.text('Dias', colX[1] + 2, y + 5.5);
  pdf.text('Horas', colX[2] + 2, y + 5.5);
  y += 8;

  pdf.setFont('helvetica', 'normal');
  state.reportRows.forEach((row, index) => {
    if (y > pageHeight - 18) {
      pdf.addPage();
      drawPdfPageHeader(pdf, 'Resumo da fase pratica', senaiLogoDataUrl);
      y = 24;
      pdf.setFillColor(241, 245, 249);
      pdf.rect(margin, y, contentWidth, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('Mes', colX[0] + 2, y + 5.5);
      pdf.text('Dias', colX[1] + 2, y + 5.5);
      pdf.text('Horas', colX[2] + 2, y + 5.5);
      pdf.setFont('helvetica', 'normal');
      y += 8;
    }
    pdf.setDrawColor(229, 231, 235);
    pdf.line(margin, y, margin + contentWidth, y);
    pdf.text(String(row.month), colX[0] + 2, y + 5.5);
    pdf.text(String(row.days), colX[1] + 2, y + 5.5);
    pdf.text(String(row.hours), colX[2] + 2, y + 5.5);
    y += 8;
  });
  pdf.line(margin, y, margin + contentWidth, y);
  return y + 10;
}

function drawPdfBlocks(pdf, margin, contentWidth, y, pageHeight, senaiLogoDataUrl) {
  if (y > pageHeight - 40) {
    pdf.addPage();
    y = margin;
  }
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('Bloqueios cadastrados', margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  const displayBlocks = getBlocksWithinCurrentPeriod();
  if (!displayBlocks.length) {
    pdf.text('Nenhum bloqueio dentro do periodo calculado.', margin, y);
    return y + 8;
  }

  displayBlocks.forEach((block) => {
    const line = `${block.description} - ${friendlyBlockType(block.type)} (${formatDateBR(block.start)} ate ${formatDateBR(block.end)})`;
    const lines = pdf.splitTextToSize(line, contentWidth - 6);
    const neededHeight = (lines.length * 5) + 3;
    if (y + neededHeight > pageHeight - margin) {
      pdf.addPage();
      drawPdfPageHeader(pdf, 'Resumo da fase pratica', senaiLogoDataUrl);
      y = 24;
    }
    pdf.text(lines, margin, y);
    y += neededHeight;
  });
  return y + 6;
}

function appendCalendarPages(pdf, margin, contentWidth, pageHeight, senaiLogoDataUrl) {
  const grouped = groupMonthsBetween(state.phaseDays[0], state.phaseDays[state.phaseDays.length - 1]);
  const months = [];

  Object.entries(grouped).forEach(([year, items]) => {
    items.forEach((item) => months.push({ year: Number(year), month: item.month }));
  });

  for (let i = 0; i < months.length; i += 1) {
    pdf.addPage();
    drawPdfPageHeader(pdf, `Calendario ${monthNames[months[i].month]} ${months[i].year}`, senaiLogoDataUrl);
    const y = 24;
    drawMonthCalendarPdf(pdf, months[i], margin, y, contentWidth, pageHeight - margin - y);
  }
}

function drawMonthCalendarPdf(pdf, monthInfo, x, y, width, availableHeight) {
  const year = monthInfo.year;
  const month = monthInfo.month;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  const startOffset = first.getDay();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthlyCount = state.phaseDays.filter((date) => date.startsWith(monthPrefix)).length;
  const configuredQuota = Number(state.monthlyQuotas[monthPrefix] || 0);
  const isQuotaMode = state.uiMode === 'advanced' && els.calculationMode.value === 'monthly-quota';

  pdf.setDrawColor(209, 213, 219);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, availableHeight, 3, 3, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(17, 24, 39);
  pdf.text(`${monthNames[month]} ${year}`, x + 4, y + 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const metaText = isQuotaMode
    ? `Dias no mes: ${monthlyCount} | Previsto: ${configuredQuota}`
    : `Dias no mes: ${monthlyCount}`;
  pdf.text(metaText, x + 4, y + 14);

  const gridTop = y + 20;
  const cellW = width / 7;
  const cellH = 22;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  weekdayNames.forEach((name, index) => {
    const cellX = x + (index * cellW);
    pdf.setFillColor(241, 245, 249);
    pdf.rect(cellX, gridTop, cellW, 8, 'F');
    pdf.setDrawColor(229, 231, 235);
    pdf.rect(cellX, gridTop, cellW, 8);
    pdf.text(name, cellX + 2.5, gridTop + 5.2);
  });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  let index = 0;
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const cellX = x + (col * cellW);
      const cellY = gridTop + 8 + (row * cellH);
      const dayNumber = index - startOffset + 1;
      const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

      pdf.setDrawColor(229, 231, 235);
      pdf.setFillColor(255, 255, 255);

      if (inMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const block = findBlockForDate(dateStr);
        const isPhase = state.phaseDays.includes(dateStr);
        const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();

        if (block) {
          const color = pdfBlockFillColor(block.type);
          pdf.setFillColor(color[0], color[1], color[2]);
        } else if (isPhase) {
          pdf.setFillColor(220, 252, 231);
        } else if (dayOfWeek === 0 || dayOfWeek === 6) {
          pdf.setFillColor(248, 250, 252);
        }
      } else {
        pdf.setFillColor(248, 250, 252);
      }

      pdf.rect(cellX, cellY, cellW, cellH, 'FD');

      if (inMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const block = findBlockForDate(dateStr);
        const isPhase = state.phaseDays.includes(dateStr);
        const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();

        pdf.setTextColor(17, 24, 39);
        pdf.text(String(dayNumber), cellX + 2, cellY + 4.5);

        if (block) {
          pdf.setFontSize(6.5);
          pdf.setTextColor(75, 85, 99);
          const shortText = pdf.splitTextToSize(friendlyBlockType(block.type), cellW - 3).slice(0, 2);
          pdf.text(shortText, cellX + 1.5, cellY + 10);
          pdf.setFontSize(8);
        } else if (isPhase) {
          pdf.setFontSize(6.5);
          pdf.setTextColor(22, 101, 52);
          pdf.text('Pratica', cellX + 1.5, cellY + 10);
          pdf.setFontSize(8);
        } else if (dayOfWeek === 0 || dayOfWeek === 6) {
          pdf.setFontSize(6.5);
          pdf.setTextColor(100, 116, 139);
          pdf.text('Fim de semana', cellX + 1.5, cellY + 10);
          pdf.setFontSize(8);
        }
      }

      index += 1;
    }
  }

  const legendY = gridTop + 8 + (6 * cellH) + 8;
  drawPdfLegendRow(pdf, x + 2, legendY);
}

function drawPdfLegendRow(pdf, x, y) {
  const items = [
    ['Dia de pratica', [220, 252, 231]],
    ['Feriado', [254, 243, 199]],
    ['Recesso', [254, 226, 226]],
    ['Folga administrativa', [219, 234, 254]],
    ['Acao pedagogica', [237, 233, 254]],
  ];
  let cursorX = x;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  items.forEach(([label, color]) => {
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.setDrawColor(209, 213, 219);
    pdf.rect(cursorX, y - 3, 4, 4, 'FD');
    pdf.setTextColor(55, 65, 81);
    pdf.text(label, cursorX + 6, y);
    cursorX += 28;
  });
}

function pdfBlockFillColor(type) {
  return {
    holiday: [254, 243, 199],
    recess: [254, 226, 226],
    'admin-leave': [219, 234, 254],
    training: [237, 233, 254],
  }[type] || [243, 244, 246];
}

function drawDetailBox(pdf, x, y, width, title, rows) {
  let currentY = y;
  const rowHeights = rows.map(([, value]) => {
    const lines = pdf.splitTextToSize(String(value), width - 14);
    return Math.max(9, lines.length * 4 + 4);
  });
  const totalHeight = 12 + rowHeights.reduce((sum, value) => sum + value, 0) + 6;

  pdf.setDrawColor(209, 213, 219);
  pdf.roundedRect(x, currentY, width, totalHeight, 3, 3, 'S');
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title, x + 4, currentY + 8);
  currentY += 14;

  rows.forEach(([label, value], index) => {
    const lines = pdf.splitTextToSize(String(value), width - 14);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(`${label}:`, x + 4, currentY);
    currentY += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.text(lines, x + 4, currentY + 2);
    currentY += rowHeights[index] - 1;
  });

  return y + totalHeight + 8;
}

function resetAll() {
  if (!confirm('Deseja limpar os dados salvos da ficha?')) return;

  state.blocks = [];
  state.monthlyQuotas = {};
  state.phaseDays = [];
  state.reportRows = [];
  state.endDate = null;

  els.fillerName.value = '';
  els.clientName.value = '';
  els.unitName.value = '';
  els.hoursPerDay.value = 4;
  els.totalHours.value = 200;
  els.calculationMode.value = 'automatic';
  els.blockDescription.value = '';
  els.blockStart.value = '';
  els.blockEnd.value = '';
  setDefaultStartDate();
  refreshBlockList();
  renderMonthlyQuotaInputs();
  applyUiMode();

  els.calendarMount.className = 'calendar-mount empty-state';
  els.calendarMount.innerHTML = 'Preencha os dados e clique em <strong>Gerar calendario</strong>.';
  els.reportMount.className = 'report-box empty-state';
  els.reportMount.textContent = 'O resumo do contrato sera exibido aqui.';
  clearStoredState();
  updateSummary();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach((content) => content.classList.toggle('active', content.id === `tab-${tabName}`));
}

function friendlyBlockType(type) {
  return {
    holiday: 'Feriado',
    recess: 'Recesso',
    'admin-leave': 'Folga administrativa',
    training: 'Acao pedagogica',
  }[type] || type;
}

function fmtDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateBR(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function sanitizeFilePart(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
