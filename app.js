const monthNames = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const weekdayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const legendItems = [
  { label: 'Etapa I - Fase escolar SENAI', className: 'school', color: '#4f46e5', schoolOnly: true },
  { label: 'Etapa II - Fase pratica EMPRESA', className: 'phase', color: '#16a34a' },
  { label: 'Etapas I e II no mesmo dia (turnos opostos)', className: 'both', color: '', swatchClass: 'swatch-both', schoolOnly: true },
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
  scheduleInputMode: 'hours-to-end',
  periodStart: null,
  periodEnd: null,
  totalHoursResult: 0,
  school: defaultSchoolState(),
  schoolDays: [],
  schoolMilestone: null,
};

/* ===== Etapa I / Etapa II ===== */
let schoolPdfPages = [];
let schoolDaySet = new Set();
let phaseDaySet = new Set();

function defaultSchoolState() {
  return {
    enabled: true,
    start: '',
    end: '',
    totalHours: '',
    hoursPerDay: 4,
    shift: 'afternoon',
    time: '',
    weekdays: [1, 2, 3, 4, 5],
    nonSchool: [],
    overrides: {},
    format: 'concurrent',
    pdfName: '',
    pdfPageCount: 0,
  };
}

const PRACTICE_FORMATS = {
  subsequent: { label: 'Pratica subsequente', short: 'Subsequente', rule: 'Inicia apos a conclusao da fase escolar' },
  concurrent: { label: 'Pratica concomitante', short: 'Concomitante', rule: 'Inicia apos 10% da carga horaria da fase escolar, no turno oposto as aulas' },
  dual: { label: 'Pratica dual', short: 'Dual', rule: 'Inicia apos 10% da carga horaria da fase escolar, em dias alternados' },
};
const SHIFT_LABELS = { morning: 'Manha', afternoon: 'Tarde', night: 'Noite' };
const OPPOSITE_SHIFT = { morning: 'Tarde', afternoon: 'Manha', night: 'Manha ou Tarde' };

const PDF_COLORS = {
  school: [199, 210, 254],
  schoolText: [55, 48, 163],
  practice: [187, 247, 208],
  practiceText: [21, 94, 47],
  weekend: [248, 250, 252],
};

const els = {};
const STORAGE_KEY = 'fase-pratica-app-state';
const MAX_SUPPORTED_YEAR = 2036;
const MAX_SUPPORTED_DATE = `${MAX_SUPPORTED_YEAR}-12-31`;

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
  applySchoolStateToUi();
  restoreSchoolPdf();
  renderLegend();
  renderMonthlyQuotaInputs();
  refreshBlockList();
  applyUiMode();
  updateQuotaPanelVisibility();
  restoreGeneratedResults();
  updateSummary(undefined, state.phaseDays.length ? Number(state.totalHoursResult || els.totalHours.value || 0) : undefined);
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
    'endDateInput', 'totalHoursField', 'endDateField', 'heroTotalHours',
    'blockType', 'blockDescription', 'blockStart', 'blockEnd', 'blockList', 'monthlyQuotaContainer',
    'btnAddBlock', 'btnGenerate', 'btnReset', 'btnExportPdf', 'calendarLegend', 'calendarMount',
    'reportMount', 'sumPhaseDays', 'sumHoursPerDay', 'sumTotalHours', 'sumEndDate', 'heroTotalDias',
    'heroDataFim', 'themeToggle', 'quotaPanel', 'modeToggle',
    'heroSchoolDays', 'startDateHint', 'schoolPanel', 'schoolEnabled', 'schoolPdf', 'schoolPdfStatus', 'schoolPdfActions',
    'btnRemoveSchoolPdf', 'schoolStart', 'schoolEnd', 'schoolTotalHours', 'schoolHoursPerDay', 'schoolShift', 'schoolTime',
    'nonSchoolStart', 'nonSchoolEnd', 'nonSchoolDescription', 'btnAddNonSchool', 'nonSchoolList', 'calendarHint',
    'practiceFormatPanel', 'practiceStartInfo'
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  els.btnAddBlock.addEventListener('click', addBlock);
  els.btnGenerate.addEventListener('click', generateSchedule);
  els.btnReset.addEventListener('click', resetAll);
  els.btnExportPdf.addEventListener('click', exportPdf);
  els.calculationMode.addEventListener('change', updateQuotaPanelVisibility);
  document.querySelectorAll('input[name="scheduleInputMode"]').forEach((radio) => {
    radio.addEventListener('change', handleScheduleInputModeChange);
  });
  els.themeToggle.addEventListener('click', toggleTheme);
  els.modeToggle.addEventListener('click', toggleUiMode);
  document.querySelectorAll('.weekday-check').forEach((checkbox) => {
    checkbox.addEventListener('change', handleWeekdaySelectionChange);
  });
  els.startDate.addEventListener('change', renderMonthlyQuotaInputs);
  els.startDate.addEventListener('change', syncEndDateMinimum);
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  // Etapa I / Etapa II
  els.schoolPdf.addEventListener('change', handleSchoolPdfSelected);
  els.btnRemoveSchoolPdf.addEventListener('click', removeSchoolPdf);
  els.btnAddNonSchool.addEventListener('click', addNonSchoolPeriod);
  const onSchoolChange = () => { readSchoolInputs(); syncSchoolModeUi(); saveAppData(); };
  els.schoolEnabled.addEventListener('change', onSchoolChange);
  [els.schoolStart, els.schoolEnd, els.schoolTotalHours, els.schoolHoursPerDay, els.schoolShift, els.schoolTime].forEach((field) => {
    field.addEventListener('change', onSchoolChange);
    field.addEventListener('input', onSchoolChange);
  });
  document.querySelectorAll('.school-weekday-check, input[name="practiceFormat"]').forEach((input) => {
    input.addEventListener('change', onSchoolChange);
  });
  els.calendarMount.addEventListener('click', handleCalendarDayClick);
}


function enableAutoSave() {
  const watchedFields = [
    els.fillerName, els.clientName, els.unitName, els.startDate,
    els.hoursPerDay, els.totalHours, els.calculationMode, els.endDateInput,
    ...document.querySelectorAll('input[name="scheduleInputMode"]'),
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
    scheduleInputMode: state.scheduleInputMode || 'hours-to-end',
    endDateInput: els.endDateInput ? (els.endDateInput.value || '') : '',
    periodStart: state.periodStart || null,
    periodEnd: state.periodEnd || null,
    totalHoursResult: Number(state.totalHoursResult || 0),
    school: state.school,
    schoolDays: Array.isArray(state.schoolDays) ? state.schoolDays : [],
    schoolMilestone: state.schoolMilestone || null,
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
  state.scheduleInputMode = payload.scheduleInputMode === 'period-to-hours' ? 'period-to-hours' : 'hours-to-end';
  const scheduleRadio = document.querySelector(`input[name="scheduleInputMode"][value="${state.scheduleInputMode}"]`);
  if (scheduleRadio) scheduleRadio.checked = true;
  if (payload.endDateInput && els.endDateInput) els.endDateInput.value = payload.endDateInput;
  if (payload.uiMode === 'simple' || payload.uiMode === 'advanced') {
    state.uiMode = payload.uiMode;
    try { window.localStorage.setItem('fase-pratica-ui-mode', state.uiMode); } catch (error) { console.error(error); }
  }

  state.blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  state.monthlyQuotas = payload.monthlyQuotas && typeof payload.monthlyQuotas === 'object' ? payload.monthlyQuotas : {};
  state.phaseDays = Array.isArray(payload.phaseDays) ? payload.phaseDays : [];
  state.reportRows = Array.isArray(payload.reportRows) ? payload.reportRows : [];
  state.endDate = payload.endDate || null;
  state.periodStart = payload.periodStart || (state.phaseDays[0] || null);
  state.periodEnd = payload.periodEnd || state.endDate || null;
  state.totalHoursResult = Number(payload.totalHoursResult || payload.totalHours || 0);
  state.selectedWeekdays = Array.isArray(payload.selectedWeekdays) && payload.selectedWeekdays.length
    ? payload.selectedWeekdays.map(Number).sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];
  applySelectedWeekdaysToUi();
  updateScheduleInputModeUi();

  if (payload.school && typeof payload.school === 'object') {
    state.school = { ...defaultSchoolState(), ...payload.school };
    if (!Array.isArray(state.school.nonSchool)) state.school.nonSchool = [];
    if (!state.school.overrides || typeof state.school.overrides !== 'object') state.school.overrides = {};
    if (!Array.isArray(state.school.weekdays)) state.school.weekdays = [1, 2, 3, 4, 5];
    if (!PRACTICE_FORMATS[state.school.format]) state.school.format = 'concurrent';
  }
  state.schoolDays = Array.isArray(payload.schoolDays) ? payload.schoolDays : [];
  state.schoolMilestone = payload.schoolMilestone || null;
  rebuildDaySets();
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
  const totalHours = Number(state.totalHoursResult || els.totalHours.value || 0);
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
  updateScheduleInputModeUi();
}

function setDefaultStartDate() {
  els.startDate.max = MAX_SUPPORTED_DATE;
  els.blockStart.max = MAX_SUPPORTED_DATE;
  els.blockEnd.max = MAX_SUPPORTED_DATE;
  els.endDateInput.max = MAX_SUPPORTED_DATE;

  if (!els.startDate.value) {
    const today = new Date();
    const supportedToday = today > new Date(`${MAX_SUPPORTED_DATE}T00:00:00`)
      ? new Date(`${MAX_SUPPORTED_DATE}T00:00:00`)
      : today;
    els.startDate.value = fmtDate(supportedToday);
  }
  syncEndDateMinimum();
}

function getScheduleInputMode() {
  const checked = document.querySelector('input[name="scheduleInputMode"]:checked');
  return checked ? checked.value : 'hours-to-end';
}

function handleScheduleInputModeChange() {
  state.scheduleInputMode = getScheduleInputMode();
  updateScheduleInputModeUi();
  saveAppData();
}

function updateScheduleInputModeUi() {
  state.scheduleInputMode = getScheduleInputMode();
  const periodMode = state.scheduleInputMode === 'period-to-hours';
  els.totalHoursField.hidden = periodMode;
  els.endDateField.hidden = !periodMode;
  if (periodMode) {
    els.calculationMode.value = 'automatic';
  }
  updateQuotaPanelVisibility();
  syncEndDateMinimum();
}

function syncEndDateMinimum() {
  if (!els.endDateInput) return;
  els.endDateInput.min = els.startDate.value || '';
  if (els.endDateInput.value && els.startDate.value && els.endDateInput.value < els.startDate.value) {
    els.endDateInput.value = els.startDate.value;
  }
}

function renderLegend() {
  els.calendarLegend.innerHTML = legendItems
    .filter((item) => !item.schoolOnly || schoolActive())
    .filter((item) => item.className !== 'both' || state.school.format === 'concurrent')
    .map((item) => (
      `<span><i class="swatch ${item.swatchClass || ''}" style="${item.color ? `background:${item.color}` : ''}"></i>${item.label}</span>`
    )).join('');
}

function updateQuotaPanelVisibility() {
  const shouldShow = state.uiMode === 'advanced'
    && state.scheduleInputMode === 'hours-to-end'
    && els.calculationMode.value === 'monthly-quota';
  els.quotaPanel.style.display = shouldShow ? '' : 'none';
}

function renderMonthlyQuotaInputs() {
  const initialYearRaw = new Date(`${els.startDate.value || fmtDate(new Date())}T00:00:00`).getFullYear();
  const initialYear = Math.min(Math.max(initialYearRaw, new Date().getFullYear() - 20), MAX_SUPPORTED_YEAR);
  const months = [];
  for (let year = initialYear; year <= MAX_SUPPORTED_YEAR; year += 1) {
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

  const range = state.phaseDays.length && state.endDate ? getOverallRange() : null;
  const visible = range
    ? state.blocks.filter((block) => !block.automatic || (block.start <= range.end && block.end >= range.start))
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
  const endYear = Math.min(approxEnd.getFullYear(), MAX_SUPPORTED_YEAR);
  for (let y = start.getFullYear(); y <= endYear; y += 1) years.push(y);
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

async function ensureAutomaticHolidaysForPeriod(startDate, endDate) {
  const startYear = new Date(`${startDate}T00:00:00`).getFullYear();
  const endYear = new Date(`${endDate}T00:00:00`).getFullYear();
  removeAutomaticBlocks();
  try {
    const fetched = [];
    const seen = new Set();
    for (let year = startYear; year <= endYear; year += 1) {
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (!response.ok) throw new Error(`Falha ao consultar feriados de ${year}.`);
      const data = await response.json();
      data.forEach((item) => {
        if (!item || !item.date) return;
        const key = `national-${item.date}`;
        if (seen.has(key)) return;
        seen.add(key);
        fetched.push({
          type: 'holiday', description: item.name || 'Feriado nacional', start: item.date, end: item.date,
          automatic: true, holidayScope: 'Nacional',
        });
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
          type: 'holiday', description: item.description, start: item.date, end: item.date,
          automatic: true, holidayScope: item.scope,
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
  const range = getOverallRange();
  return state.blocks.filter((block) => block.start <= range.end && block.end >= range.start);
}

/* ===================== ETAPA I - FASE ESCOLAR SENAI ===================== */

function rebuildDaySets() {
  schoolDaySet = new Set(state.schoolDays);
  phaseDaySet = new Set(state.phaseDays);
}

function schoolActive() {
  return Boolean(state.school && state.school.enabled);
}

function getSelectedPracticeFormat() {
  const checked = document.querySelector('input[name="practiceFormat"]:checked');
  return checked && PRACTICE_FORMATS[checked.value] ? checked.value : 'concurrent';
}

function applySchoolStateToUi() {
  const s = state.school;
  els.schoolEnabled.checked = !!s.enabled;
  els.schoolStart.value = s.start || '';
  els.schoolEnd.value = s.end || '';
  els.schoolTotalHours.value = s.totalHours || '';
  els.schoolHoursPerDay.value = s.hoursPerDay || 4;
  els.schoolShift.value = SHIFT_LABELS[s.shift] ? s.shift : 'afternoon';
  els.schoolTime.value = s.time || '';
  document.querySelectorAll('.school-weekday-check').forEach((input) => {
    input.checked = s.weekdays.map(Number).includes(Number(input.value));
  });
  const formatRadio = document.querySelector(`input[name="practiceFormat"][value="${s.format}"]`);
  if (formatRadio) formatRadio.checked = true;
  refreshNonSchoolList();
  refreshSchoolPdfStatus();
  syncSchoolModeUi();
}

function readSchoolInputs() {
  const s = state.school;
  s.enabled = els.schoolEnabled.checked;
  s.start = els.schoolStart.value || '';
  s.end = els.schoolEnd.value || '';
  s.totalHours = els.schoolTotalHours.value === '' ? '' : Number(els.schoolTotalHours.value);
  s.hoursPerDay = Number(els.schoolHoursPerDay.value || 0) || 0;
  s.shift = els.schoolShift.value;
  s.time = (els.schoolTime.value || '').trim();
  s.format = getSelectedPracticeFormat();
  s.weekdays = Array.from(document.querySelectorAll('.school-weekday-check:checked'))
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
}

// Com a Etapa I ativa, o inicio da pratica e calculado (campo somente leitura)
function syncSchoolModeUi() {
  const active = schoolActive();
  els.schoolPanel.classList.toggle('is-disabled', !active);
  els.practiceFormatPanel.classList.toggle('is-disabled', !active);
  els.startDate.readOnly = active;
  els.startDateHint.hidden = !active;
  updatePracticeStartInfo();
}

function validateSchoolInputs() {
  const s = state.school;
  if (!s.start || !s.end) return 'Etapa I: informe o inicio e o termino das aulas (ou desmarque "Incluir Etapa I no cronograma").';
  if (s.end < s.start) return 'Etapa I: o termino das aulas nao pode ser anterior ao inicio.';
  if (s.end > MAX_SUPPORTED_DATE) return `Etapa I: a calculadora esta configurada para datas ate ${MAX_SUPPORTED_DATE}.`;
  if (!s.weekdays.length) return 'Etapa I: selecione pelo menos um dia da semana com aula.';
  if (!(s.hoursPerDay > 0)) return 'Etapa I: informe as horas de aula por dia.';
  if (s.format !== 'subsequent' && !(Number(s.totalHours) > 0)) {
    return 'Etapa I: informe a carga horaria da fase escolar (ex.: 1000 h). Ela e usada para calcular os 10% que liberam o inicio da pratica.';
  }
  return '';
}

// Ate onde buscar feriados: do inicio das aulas ate uma margem segura apos o fim previsto da pratica
function getHolidayRangeEnd(hoursPerDay, totalHours) {
  const s = state.school;
  let end = s.end;
  if (getScheduleInputMode() === 'period-to-hours') {
    const requested = els.endDateInput.value;
    if (requested && requested > end) end = requested;
  } else {
    const requiredDays = Math.max(1, Math.ceil((totalHours || 1) / Math.max(hoursPerDay || 1, 1)));
    const approx = new Date(`${s.end}T00:00:00`);
    approx.setDate(approx.getDate() + Math.max(requiredDays * 3, 370));
    end = fmtDate(approx);
  }
  return end > MAX_SUPPORTED_DATE ? MAX_SUPPORTED_DATE : end;
}

function findNonSchoolForDate(dateStr) {
  return state.school.nonSchool.find((item) => dateStr >= item.start && dateStr <= item.end) || null;
}

// Dias de aula: dias da semana marcados entre inicio e termino, sem feriados e periodos sem aula.
// Ajustes manuais (clique no calendario) tem prioridade.
function calculateSchoolDays() {
  const s = state.school;
  if (!s.enabled) return [];
  const result = new Set();
  if (s.start && s.end && s.end >= s.start) {
    const cursor = new Date(`${s.start}T00:00:00`);
    const limit = new Date(`${s.end}T00:00:00`);
    const weekdays = s.weekdays.map(Number);
    let safe = 0;
    while (cursor <= limit && safe < 5000) {
      const key = fmtDate(cursor);
      const block = findBlockForDate(key);
      const isHoliday = block && block.type === 'holiday';
      if (weekdays.includes(cursor.getDay()) && !isHoliday && !findNonSchoolForDate(key)) result.add(key);
      cursor.setDate(cursor.getDate() + 1);
      safe += 1;
    }
  }
  Object.entries(s.overrides || {}).forEach(([key, value]) => {
    if (value === true) result.add(key);
    if (value === false) result.delete(key);
  });
  return Array.from(result).sort();
}

function getSchoolTotalHours() {
  const informed = Number(state.school.totalHours || 0);
  return informed > 0 ? informed : state.schoolDays.length * (state.school.hoursPerDay || 0);
}

// Inicio da Etapa II conforme o formato escolhido
function computePracticeStart() {
  const s = state.school;
  const days = state.schoolDays;
  state.schoolMilestone = null;
  if (!days.length) return null;

  if (s.format === 'subsequent') {
    return addDays(days[days.length - 1], 1);
  }

  const threshold = getSchoolTotalHours() * 0.10;
  let accumulated = 0;
  for (const day of days) {
    accumulated += s.hoursPerDay;
    if (accumulated >= threshold - 1e-9) {
      state.schoolMilestone = { date: day, hours: Math.round(accumulated * 10) / 10, threshold: Math.round(threshold * 10) / 10 };
      return addDays(day, 1);
    }
  }
  // Calendario escolar nao alcanca 10% (CH informada maior que as aulas cadastradas)
  return null;
}

function addDays(dateStr, amount) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return fmtDate(date);
}

function getSchoolSummary() {
  const s = state.school;
  const days = state.schoolDays;
  const scheduledHours = days.length * (s.hoursPerDay || 0);
  const totalHours = getSchoolTotalHours();
  let mismatch = '';
  if (Number(s.totalHours) > 0 && scheduledHours !== Number(s.totalHours)) {
    mismatch = `Atencao: os dias de aula do calendario somam ${scheduledHours} h, mas a carga horaria informada da fase escolar e ${s.totalHours} h. Confira o periodo, os dias sem aula ou ajuste os dias clicando no calendario.`;
  }
  return {
    start: days[0] || s.start,
    end: days[days.length - 1] || s.end,
    days: days.length,
    scheduledHours,
    totalHours,
    mismatch,
  };
}

// No formato dual a pratica ocorre nos dias sem aula; avisa se nao houver nenhum durante a Etapa I
function getDualWarning() {
  if (!schoolActive() || state.school.format !== 'dual' || !state.phaseDays.length || !state.schoolDays.length) return '';
  const schoolEnd = state.schoolDays[state.schoolDays.length - 1];
  const duringSchool = state.phaseDays.filter((d) => d <= schoolEnd).length;
  if (duringSchool > 0) return '';
  return `Formato dual: o cronograma escolar tem aula em todos os dias marcados para a pratica, por isso a pratica so comeca em ${formatDateBR(state.phaseDays[0])}, apos o fim das aulas. No formato dual, as aulas e a pratica devem ocorrer em dias alternados: confira os dias da semana com aula ou os dias considerados para a pratica.`;
}

function updatePracticeStartInfo() {
  const box = els.practiceStartInfo;
  if (!box) return;
  if (!schoolActive()) {
    box.hidden = true;
    return;
  }
  const s = state.school;
  const fmt = PRACTICE_FORMATS[s.format];
  let text = `<strong>${fmt.label}:</strong> ${fmt.rule.toLowerCase()}.`;
  if (s.format === 'concurrent') text += ` Turno da pratica: <strong>${OPPOSITE_SHIFT[s.shift] || 'oposto as aulas'}</strong>.`;
  if (state.phaseDays.length && state.schoolDays.length) {
    if (state.schoolMilestone && s.format !== 'subsequent') {
      text += `<br>10% da carga horaria escolar (${state.schoolMilestone.threshold} h) concluidos em <strong>${formatDateBR(state.schoolMilestone.date)}</strong>.`;
    }
    text += `<br>Inicio da pratica: <strong>${formatDateBR(state.phaseDays[0])}</strong>.`;
  } else if (s.format !== 'subsequent' && Number(s.totalHours) > 0) {
    text += `<br>10% de ${s.totalHours} h = <strong>${Math.round(Number(s.totalHours) * 10) / 100} h</strong> de aula antes do inicio da pratica.`;
  }
  const warning = getDualWarning();
  box.className = `format-info spacing-top${warning ? ' warn' : ''}`;
  box.innerHTML = warning ? `${text}<br>${escapeHtml(warning)}` : text;
  box.hidden = false;
}

function addNonSchoolPeriod() {
  const start = els.nonSchoolStart.value;
  if (!start) {
    alert('Informe a data inicial do periodo sem aula.');
    return;
  }
  const end = els.nonSchoolEnd.value || start;
  if (end < start) {
    alert('A data final nao pode ser menor que a data inicial.');
    return;
  }
  state.school.nonSchool.push({
    start,
    end,
    description: (els.nonSchoolDescription.value || '').trim() || 'Sem aula (escola)',
  });
  state.school.nonSchool.sort((a, b) => a.start.localeCompare(b.start));
  els.nonSchoolStart.value = '';
  els.nonSchoolEnd.value = '';
  els.nonSchoolDescription.value = '';
  refreshNonSchoolList();
  saveAppData();
}

function refreshNonSchoolList() {
  const items = state.school.nonSchool;
  if (!items.length) {
    els.nonSchoolList.className = 'tag-list empty-state spacing-top';
    els.nonSchoolList.textContent = 'Nenhum período sem aula cadastrado.';
    return;
  }
  els.nonSchoolList.className = 'tag-list spacing-top';
  els.nonSchoolList.innerHTML = items.map((item, index) => `
    <div class="block-item">
      <div class="block-meta">
        <strong>${escapeHtml(item.description)}</strong>
        <small>${formatDateBR(item.start)} ate ${formatDateBR(item.end)}</small>
      </div>
      <button class="secondary-btn icon-btn" type="button" data-remove-nonschool="${index}" aria-label="Remover periodo">✕</button>
    </div>
  `).join('');
  els.nonSchoolList.querySelectorAll('[data-remove-nonschool]').forEach((button) => {
    button.addEventListener('click', () => {
      state.school.nonSchool.splice(Number(button.dataset.removeNonschool), 1);
      refreshNonSchoolList();
      saveAppData();
    });
  });
}

// Clique em um dia do calendario: marca/desmarca aula SENAI e recalcula sem buscar feriados de novo
function handleCalendarDayClick(event) {
  const cell = event.target.closest('[data-date]');
  if (!cell || !schoolActive() || !state.phaseDays.length) return;
  const key = cell.dataset.date;
  const overrides = state.school.overrides;
  const currentlySchool = schoolDaySet.has(key);
  delete overrides[key];
  const natural = calculateSchoolDays().includes(key);
  const desired = !currentlySchool;
  if (desired !== natural) overrides[key] = desired;
  generateSchedule({ reuseHolidays: true });
}

/* Periodo total do contrato (Etapa I + Etapa II) */
function getOverallRange() {
  const dates = [];
  const practiceStart = state.periodStart || state.phaseDays[0];
  const practiceEnd = state.periodEnd || state.endDate || state.phaseDays[state.phaseDays.length - 1];
  if (practiceStart) dates.push(practiceStart);
  if (practiceEnd) dates.push(practiceEnd);
  if (schoolActive() && state.schoolDays.length) dates.push(state.schoolDays[0], state.schoolDays[state.schoolDays.length - 1]);
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/* ---------- PDF da unidade (cronograma da fase escolar) ---------- */

const SCHOOL_PDF_DB = 'fase-pratica-db';
const SCHOOL_PDF_STORE = 'files';
const SCHOOL_PDF_KEY = 'school-pdf';

function openSchoolDb() {
  return new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(SCHOOL_PDF_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(SCHOOL_PDF_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

async function storeSchoolPdfBytes(bytes) {
  try {
    const db = await openSchoolDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SCHOOL_PDF_STORE, 'readwrite');
      if (bytes) tx.objectStore(SCHOOL_PDF_STORE).put(bytes, SCHOOL_PDF_KEY);
      else tx.objectStore(SCHOOL_PDF_STORE).delete(SCHOOL_PDF_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('Nao foi possivel guardar o PDF da fase escolar.', error);
  }
}

async function readSchoolPdfBytes() {
  try {
    const db = await openSchoolDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SCHOOL_PDF_STORE, 'readonly');
      const request = tx.objectStore(SCHOOL_PDF_STORE).get(SCHOOL_PDF_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

function getPdfJs() {
  const lib = window.pdfjsLib;
  if (!lib) return null;
  if (!lib.GlobalWorkerOptions.workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return lib;
}

async function handleSchoolPdfSelected(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    alert('Selecione um arquivo PDF.');
    return;
  }
  els.schoolPdfStatus.textContent = 'Lendo o PDF...';
  try {
    const bytes = await file.arrayBuffer();
    const { pages, text } = await processSchoolPdf(bytes.slice(0));
    schoolPdfPages = pages;
    state.school.pdfName = file.name;
    state.school.pdfPageCount = pages.length;
    await storeSchoolPdfBytes(bytes);

    const detected = detectSchoolInfoFromText(text);
    const found = [];
    if (detected.start && detected.end) {
      els.schoolStart.value = detected.start;
      els.schoolEnd.value = detected.end;
      found.push(`período ${formatDateBR(detected.start)} a ${formatDateBR(detected.end)}`);
    }
    if (detected.totalHours && !els.schoolTotalHours.value) {
      els.schoolTotalHours.value = detected.totalHours;
      found.push(`carga horária ${detected.totalHours} h`);
    }
    readSchoolInputs();
    let message;
    if (found.length) message = ` Identificado: ${found.join(' e ')} — confira.`;
    else if (!text.trim()) message = ' O PDF é uma imagem digitalizada: informe abaixo o período e a carga horária das aulas.';
    else message = ' Não foi possível identificar as datas: informe abaixo o período e a carga horária das aulas.';
    saveAppData();
    refreshSchoolPdfStatus(message);
  } catch (error) {
    console.error(error);
    alert(`Nao foi possivel ler o PDF. ${error && error.message ? error.message : ''}`.trim());
    refreshSchoolPdfStatus();
  }
}

async function processSchoolPdf(bytes) {
  const pdfjs = getPdfJs();
  if (!pdfjs) throw new Error('A biblioteca de leitura de PDF nao foi carregada. Verifique sua conexao.');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  let text = '';
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, 1800 / Math.max(viewport1.width, viewport1.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: viewport1.width, height: viewport1.height });
    try {
      const content = await page.getTextContent();
      text += ` ${content.items.map((item) => item.str).join(' ')}`;
    } catch (error) {
      console.error(error);
    }
  }
  return { pages, text };
}

// Quando o PDF possui texto: identifica periodo (datas dd/mm/aaaa) e carga horaria ("1000 horas")
function detectSchoolInfoFromText(text) {
  const result = {};
  if (!text || !text.trim()) return result;
  const cleaned = text.replace(/Gerado[^0-9]*\d{2}\/\d{2}\/\d{4}/gi, ' ');
  const dates = [];
  const regex = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
  let match;
  while ((match = regex.exec(cleaned))) {
    const [, d, m, y] = match;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31 && Number(y) >= 2000) dates.push(`${y}-${m}-${d}`);
  }
  if (dates.length >= 2) {
    dates.sort();
    result.start = dates[0];
    result.end = dates[dates.length - 1];
  }
  const hours = cleaned.match(/(\d{2,4})\s*(?:horas|h)\b/i);
  if (hours && Number(hours[1]) >= 100) result.totalHours = Number(hours[1]);
  return result;
}

async function restoreSchoolPdf() {
  if (!state.school.pdfName) return;
  const bytes = await readSchoolPdfBytes();
  if (!bytes) {
    refreshSchoolPdfStatus(' Selecione o arquivo novamente para anexá-lo ao PDF.');
    return;
  }
  try {
    const { pages } = await processSchoolPdf(bytes);
    schoolPdfPages = pages;
    refreshSchoolPdfStatus();
  } catch (error) {
    console.error(error);
    refreshSchoolPdfStatus(' Selecione o arquivo novamente para anexá-lo ao PDF.');
  }
}

async function removeSchoolPdf() {
  schoolPdfPages = [];
  state.school.pdfName = '';
  state.school.pdfPageCount = 0;
  await storeSchoolPdfBytes(null);
  refreshSchoolPdfStatus();
  saveAppData();
}

function refreshSchoolPdfStatus(extra = '') {
  const drop = els.schoolPdf.closest('.file-drop');
  const name = state.school.pdfName;
  if (name) {
    const count = schoolPdfPages.length || state.school.pdfPageCount || 0;
    els.schoolPdfStatus.textContent = `${name} • ${count} página(s).${extra}`;
    drop.classList.add('has-file');
    els.schoolPdfActions.style.display = '';
  } else {
    els.schoolPdfStatus.textContent = 'Clique para selecionar o arquivo PDF emitido pela unidade.';
    drop.classList.remove('has-file');
    els.schoolPdfActions.style.display = 'none';
  }
}

async function generateSchedule(options) {
  const reuseHolidays = Boolean(options && options.reuseHolidays === true);
  state.selectedWeekdays = getSelectedWeekdays();
  state.scheduleInputMode = getScheduleInputMode();
  let startDate = els.startDate.value;
  const hoursPerDay = Number(els.hoursPerDay.value || 0);
  const informedTotalHours = Number(els.totalHours.value || 0);
  const mode = state.uiMode === 'advanced' ? els.calculationMode.value : 'automatic';

  if (!startDate) {
    alert('Informe a data de inicio da fase pratica.');
    return;
  }
  if (startDate > MAX_SUPPORTED_DATE) {
    alert(`A calculadora esta configurada para planejamentos ate ${MAX_SUPPORTED_DATE}.`);
    return;
  }
  if (hoursPerDay <= 0) {
    alert('Informe horas por dia maiores que zero.');
    return;
  }

  // ===== Etapa I: fase escolar SENAI define o inicio da Etapa II =====
  readSchoolInputs();
  const schoolMode = schoolActive();
  if (schoolMode) {
    const validation = validateSchoolInputs();
    if (validation) {
      alert(validation);
      return;
    }
    if (!reuseHolidays) {
      await ensureAutomaticHolidaysForPeriod(state.school.start, getHolidayRangeEnd(hoursPerDay, informedTotalHours));
    }
    state.schoolDays = calculateSchoolDays();
    schoolDaySet = new Set(state.schoolDays);
    if (!state.schoolDays.length) {
      alert('Nenhum dia de aula foi encontrado na Etapa I com as datas e dias da semana informados.');
      return;
    }
    const autoStart = computePracticeStart();
    if (!autoStart) {
      alert('Nao foi possivel calcular o inicio da fase pratica a partir da fase escolar.');
      return;
    }
    if (autoStart > MAX_SUPPORTED_DATE) {
      alert(`O inicio calculado da fase pratica ultrapassa ${MAX_SUPPORTED_DATE}.`);
      return;
    }
    startDate = autoStart;
    els.startDate.value = autoStart;
    syncEndDateMinimum();
  } else {
    state.schoolDays = [];
    state.schoolMilestone = null;
    schoolDaySet = new Set();
  }

  let phaseDays = [];
  let totalHours = informedTotalHours;

  if (state.scheduleInputMode === 'period-to-hours') {
    const requestedEndDate = els.endDateInput.value;
    if (!requestedEndDate) {
      alert('Informe a data final da fase pratica.');
      return;
    }
    if (requestedEndDate < startDate) {
      alert('A data final nao pode ser anterior a data de inicio.');
      return;
    }
    if (requestedEndDate > MAX_SUPPORTED_DATE) {
      alert(`A data final deve ser igual ou anterior a ${MAX_SUPPORTED_DATE}.`);
      return;
    }

    if (!schoolMode && !reuseHolidays) await ensureAutomaticHolidaysForPeriod(startDate, requestedEndDate);
    phaseDays = calculateDaysWithinPeriod(startDate, requestedEndDate);
    if (!phaseDays.length) {
      alert('O periodo informado nao possui dias validos de pratica com as regras selecionadas.');
      return;
    }
    totalHours = phaseDays.length * hoursPerDay;
    state.periodStart = startDate;
    state.periodEnd = requestedEndDate;
    state.endDate = requestedEndDate;
  } else {
    if (informedTotalHours <= 0) {
      alert('Informe a carga horaria total maior que zero.');
      return;
    }
    if (!schoolMode && !reuseHolidays) await ensureAutomaticHolidays(startDate, informedTotalHours, hoursPerDay);
    if (mode === 'monthly-quota') {
      phaseDays = calculateMonthlyQuotaDays(startDate, informedTotalHours, hoursPerDay);
    } else {
      phaseDays = calculateAutomaticDays(startDate, informedTotalHours, hoursPerDay);
    }
    if (!phaseDays.length) {
      alert('Nao foi possivel calcular os dias de pratica com as regras informadas.');
      return;
    }
    const lastCalculatedDay = phaseDays[phaseDays.length - 1];
    if (lastCalculatedDay > MAX_SUPPORTED_DATE) {
      alert(`O calendario calculado ultrapassa ${MAX_SUPPORTED_DATE}. Ajuste a data de inicio, a carga horaria ou os dias selecionados.`);
      return;
    }
    state.periodStart = phaseDays[0];
    state.periodEnd = lastCalculatedDay;
    state.endDate = lastCalculatedDay;
  }

  if (schoolMode) {
    // Mostra no campo o primeiro dia efetivo de pratica (ex.: pula fim de semana/feriado)
    els.startDate.value = phaseDays[0];
    state.periodStart = phaseDays[0];
    syncEndDateMinimum();
  }
  state.phaseDays = phaseDays;
  phaseDaySet = new Set(phaseDays);
  state.totalHoursResult = totalHours;
  state.reportRows = buildMonthlyReport(phaseDays, hoursPerDay);

  renderLegend();
  renderCalendar();
  refreshBlockList();
  renderReport(hoursPerDay, totalHours, mode);
  updateSummary(hoursPerDay, totalHours);
  updatePracticeStartInfo();
  if (!reuseHolidays) switchTab('calendar');
  saveAppData();

  if (schoolMode && !reuseHolidays) {
    const warning = getDualWarning();
    if (warning) alert(warning);
  }
}

function calculateDaysWithinPeriod(startDate, endDate) {
  const result = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const limit = new Date(`${endDate}T00:00:00`);
  let safe = 0;
  while (cursor <= limit && safe < 10000) {
    if (isValidPracticeDay(cursor)) result.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    safe += 1;
  }
  return result;
}

function calculateAutomaticDays(startDate, totalHours, hoursPerDay) {
  const requiredDays = Math.ceil(totalHours / hoursPerDay);
  const result = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const maxDate = new Date(`${MAX_SUPPORTED_DATE}T00:00:00`);
  let safe = 0;

  while (result.length < requiredDays && safe < 5000 && cursor <= maxDate) {
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
  const maxDate = new Date(`${MAX_SUPPORTED_DATE}T00:00:00`);
  let safe = 0;

  while (result.length < requiredDays && safe < 5000 && cursor <= maxDate) {
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
  const key = fmtDate(date);
  // Subsequente e dual: dia de aula nao tem pratica. Concomitante: turno oposto (mesmo dia permitido).
  if (schoolActive() && state.school.format !== 'concurrent' && schoolDaySet.has(key)) return false;
  return !findBlockForDate(key);
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

  const range = getOverallRange();
  const grouped = groupMonthsBetween(range.start, range.end);
  els.calendarHint.style.display = schoolActive() ? '' : 'none';
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
  const schoolCount = schoolActive() ? state.schoolDays.filter((date) => date.startsWith(monthPrefix)).length : 0;
  const configuredQuota = Number(state.monthlyQuotas[monthPrefix] || 0);
  const overrides = state.school.overrides || {};
  const milestoneDate = schoolActive() && state.schoolMilestone ? state.schoolMilestone.date : null;

  let daysHtml = '';
  for (let i = 0; i < startOffset; i += 1) daysHtml += '<div class="day muted"></div>';

  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(year, month, day);
    const key = fmtDate(current);
    const status = getDayStatus(key);
    const classes = ['day'];
    if (current.getDay() === 0 || current.getDay() === 6) classes.push('weekend');
    if (status.isPhase) classes.push('phase');
    if (status.isSchool) classes.push('school');
    if (status.block && !status.isSchool && !status.isPhase) classes.push(`block-${status.block.type}`);
    if (schoolActive() && Object.prototype.hasOwnProperty.call(overrides, key)) classes.push('override');
    let title = status.title;
    if (key === milestoneDate) {
      classes.push('milestone');
      title = `${title} • 10% da carga horaria escolar concluidos`;
    }
    daysHtml += `<div class="${classes.join(' ')}" data-date="${key}" title="${escapeHtml(title)}">${day}</div>`;
  }

  const quotaText = state.uiMode === 'advanced' && els.calculationMode.value === 'monthly-quota'
    ? ` • previsto: <strong>${configuredQuota}</strong>`
    : '';
  const metaText = schoolActive()
    ? `Etapa I: <strong>${schoolCount}</strong> aula(s) • Etapa II: <strong>${monthlyCount}</strong> dia(s)${quotaText}`
    : `Dias no mes: <strong>${monthlyCount}</strong>${quotaText}`;

  return `
    <article class="month-card">
      <header>${monthNames[month]} ${year}</header>
      <div class="month-meta">${metaText}</div>
      <div class="weekdays">${weekdayNames.map((d) => `<div>${d}</div>`).join('')}</div>
      <div class="days${schoolActive() ? ' clickable' : ''}">${daysHtml}</div>
    </article>
  `;
}

function getDayStatus(key) {
  const block = findBlockForDate(key);
  const isPhase = phaseDaySet.has(key);
  const isSchool = schoolActive() && schoolDaySet.has(key);
  const nonSchool = schoolActive() ? findNonSchoolForDate(key) : null;
  let title = '';
  if (isSchool && isPhase) title = 'Etapa I (aula SENAI) + Etapa II (pratica na empresa, turno oposto)';
  else if (isSchool) title = 'Etapa I - Fase escolar SENAI';
  else if (isPhase) title = 'Etapa II - Fase pratica EMPRESA';
  else if (block) title = `${friendlyBlockType(block.type)} - ${block.description}`;
  else if (nonSchool) title = `Sem aula: ${nonSchool.description}`;
  return { block, isPhase, isSchool, nonSchool, title };
}

function renderReport(hoursPerDay, totalHours, mode) {
  const filler = escapeHtml((els.fillerName.value || '').trim() || 'Nao informado');
  const client = escapeHtml((els.clientName.value || '').trim() || 'Nao informado');
  const unit = escapeHtml((els.unitName.value || '').trim() || 'Nao informada');
  const withSchool = schoolActive();
  const rows = state.reportRows.map((row) => (withSchool
    ? `<tr><td>${escapeHtml(row.month)}</td><td>${row.schoolDays || 0}</td><td>${row.schoolHours || 0}</td><td>${row.days}</td><td>${row.hours}</td></tr>`
    : `<tr><td>${escapeHtml(row.month)}</td><td>${row.days}</td><td>${row.hours}</td></tr>`
  )).join('');
  const tableHead = withSchool
    ? '<tr><th>Mes</th><th>Etapa I - aulas (dias)</th><th>Etapa I (h)</th><th>Etapa II - pratica (dias)</th><th>Etapa II (h)</th></tr>'
    : '<tr><th>Mes</th><th>Dias</th><th>Horas</th></tr>';
  let schoolHtml = '';
  if (withSchool) {
    const sc = state.school;
    const info = getSchoolSummary();
    const fmt = PRACTICE_FORMATS[sc.format];
    const warning = getDualWarning();
    schoolHtml = `
      <h4><span class="phase-tag school">Etapa I - Fase escolar SENAI</span></h4>
      <div class="report-header-grid">
        <div><strong>Periodo das aulas:</strong> ${formatDateBR(info.start)} ate ${formatDateBR(info.end)}</div>
        <div><strong>Dias de aula:</strong> ${info.days} dias (${info.scheduledHours} h no calendario)</div>
        <div><strong>Carga horaria da fase escolar:</strong> ${info.totalHours} h</div>
        <div><strong>Aulas:</strong> ${sc.hoursPerDay} h/dia • ${SHIFT_LABELS[sc.shift] || ''}${sc.time ? ` (${escapeHtml(sc.time)})` : ''}</div>
        <div><strong>Cronograma da unidade:</strong> ${sc.pdfName ? `${escapeHtml(sc.pdfName)} (anexado ao PDF)` : 'Nao anexado'}</div>
        ${state.schoolMilestone ? `<div><strong>10% da carga horaria escolar:</strong> ${state.schoolMilestone.hours} h concluidas em ${formatDateBR(state.schoolMilestone.date)}</div>` : ''}
      </div>
      ${info.mismatch ? `<p class="report-note">${escapeHtml(info.mismatch)}</p>` : ''}
      <h4><span class="phase-tag practice">Etapa II - Fase pratica EMPRESA</span></h4>
      <div class="report-header-grid">
        <div><strong>Formato:</strong> ${fmt.label}</div>
        <div><strong>Regra:</strong> ${fmt.rule}</div>
        ${sc.format === 'concurrent' ? `<div><strong>Turno da pratica:</strong> ${OPPOSITE_SHIFT[sc.shift] || 'oposto as aulas'}</div>` : ''}
      </div>
      ${warning ? `<p class="report-note">${escapeHtml(warning)}</p>` : ''}
    `;
  }
  const displayBlocks = getBlocksWithinCurrentPeriod();
  const blocksHtml = displayBlocks.length
    ? `<ul>${displayBlocks.map((block) => `<li>${escapeHtml(block.description)} - ${friendlyBlockType(block.type)} (${formatDateBR(block.start)} ate ${formatDateBR(block.end)})${block.automatic ? ` [automatico${block.holidayScope ? ' - ' + escapeHtml(block.holidayScope) : ''}]` : ''}</li>`).join('')}</ul>`
    : '<p>Nenhum bloqueio dentro do periodo calculado.</p>';

  els.reportMount.className = 'report-box';
  els.reportMount.innerHTML = `
    ${schoolHtml}
    <div class="report-header-grid">
      <div><strong>Responsavel pelas informacoes:</strong> ${filler}</div>
      <div><strong>Empresa:</strong> ${client}</div>
      <div><strong>Unidade:</strong> ${unit}</div>
      <div><strong>Modo:</strong> ${state.scheduleInputMode === 'period-to-hours' ? 'Data de inicio + data final' : (mode === 'monthly-quota' ? 'Calendario personalizado por mes' : 'Data de inicio + carga horaria')}</div>
      <div><strong>Dias considerados:</strong> ${formatSelectedWeekdays()}</div>
      <div><strong>Periodo:</strong> ${formatDateBR(state.periodStart || state.phaseDays[0])} ate ${formatDateBR(state.periodEnd || state.endDate)}</div>
      <div><strong>${state.scheduleInputMode === 'period-to-hours' ? 'Total calculado' : 'Total previsto'}:</strong> ${state.phaseDays.length} dias / ${totalHours} horas</div>
      <div><strong>Horas por dia:</strong> ${hoursPerDay} h</div>
    </div>
    <h4>Distribuicao por mes</h4>
    <table>
      <thead>${tableHead}</thead>
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
  els.heroSchoolDays.textContent = schoolActive() && state.schoolDays.length ? state.schoolDays.length : '--';
  els.heroTotalHours.textContent = `${totalHours || 0} h`;
  els.heroDataFim.textContent = end;
}

function buildMonthlyReport(days, hoursPerDay) {
  const map = new Map();
  const ensure = (key) => {
    if (!map.has(key)) map.set(key, { practice: 0, school: 0 });
    return map.get(key);
  };
  days.forEach((date) => { ensure(date.slice(0, 7)).practice += 1; });
  if (schoolActive()) state.schoolDays.forEach((date) => { ensure(date.slice(0, 7)).school += 1; });
  const schoolHoursPerDay = Number(state.school.hoursPerDay || 0);

  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, counts]) => {
    const [year, month] = key.split('-').map(Number);
    return {
      month: `${monthNames[month - 1]} ${year}`,
      days: counts.practice,
      hours: counts.practice * hoursPerDay,
      schoolDays: counts.school,
      schoolHours: counts.school * schoolHoursPerDay,
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
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const senaiLogoDataUrl = await getSenaiLogoDataUrl();
    appendCalendarPagesLandscape(pdf, senaiLogoDataUrl);
    appendSchoolPdfAnnex(pdf);

    const safeFiller = sanitizeFilePart(els.fillerName.value || 'ficha');
    const safeClient = sanitizeFilePart(els.clientName.value || 'cliente');
    pdf.save(`${schoolActive() ? 'cronograma-contrato-etapas' : 'calendario-fase-pratica-grade'}-${safeFiller}-${safeClient}.pdf`);
  } catch (error) {
    console.error(error);
    alert(`Nao foi possivel gerar o PDF. ${error && error.message ? error.message : ''}`.trim());
  } finally {
    els.btnExportPdf.disabled = false;
    els.btnExportPdf.textContent = originalText;
  }
}


function appendCalendarPagesLandscape(pdf, senaiLogoDataUrl) {
  const range = getOverallRange();
  const grouped = groupMonthsBetween(range.start, range.end);
  const months = [];
  Object.entries(grouped).forEach(([year, items]) => {
    items.forEach((item) => months.push({ year: Number(year), month: item.month }));
  });

  const monthsPerPage = 6;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 8;
  const marginTop = 8;
  const marginBottom = 8;
  const headerH = schoolActive() ? 17 : 14;
  const footerH = 6;
  const gapX = 4;
  const gapY = 4;
  const cols = 3;
  const rows = 2;
  const gridTop = marginTop + headerH;
  const gridHeight = pageHeight - gridTop - marginBottom - footerH;
  const cardW = (pageWidth - (marginX * 2) - (gapX * (cols - 1))) / cols;
  const cardH = (gridHeight - (gapY * (rows - 1))) / rows;

  months.forEach((monthInfo, idx) => {
    if (idx > 0 && idx % monthsPerPage === 0) pdf.addPage('a4', 'landscape');
    if (idx % monthsPerPage === 0) {
      drawLandscapeCalendarHeader(pdf, senaiLogoDataUrl);
      drawLandscapeCalendarFooter(pdf, marginX, pageHeight - 4);
    }
    const slot = idx % monthsPerPage;
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const x = marginX + col * (cardW + gapX);
    const y = gridTop + row * (cardH + gapY);
    drawMonthCalendarPdfCompact(pdf, monthInfo, x, y, cardW, cardH);
  });

  if (schoolActive()) appendContractSummaryPage(pdf, senaiLogoDataUrl);
  appendLandscapeBlockSummary(pdf, senaiLogoDataUrl);
}

function drawLandscapeCalendarHeader(pdf, logoDataUrl) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, 16, 'F');
  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, 'PNG', 8, 3, 44, 10);
  }
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  const withSchool = schoolActive();
  pdf.text(withSchool ? 'Cronograma do Contrato de Aprendizagem' : 'Calendario da Fase Pratica', pageWidth / 2, 7.5, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  const range = getOverallRange();
  const periodStart = range ? formatDateBR(range.start) : '--';
  const periodEnd = range ? formatDateBR(range.end) : '--';
  const client = (els.clientName.value || '').trim();
  const subtitle = withSchool
    ? `Etapa I - Fase escolar SENAI e Etapa II - Fase prática EMPRESA (${PRACTICE_FORMATS[state.school.format].short}) • ${periodStart} até ${periodEnd}${client ? ` • ${client}` : ''}`
    : `${periodStart} ate ${periodEnd}`;
  pdf.text(subtitle, pageWidth / 2, 12, { align: 'center' });
  if (withSchool) drawPdfPhaseLegend(pdf, pageWidth - 8, 4);
  pdf.setDrawColor(209, 213, 219);
  pdf.line(8, 15, pageWidth - 8, 15);
  if (withSchool) drawPdfBlockLegend(pdf, 8, 19.5);
}

// Legenda das etapas (canto superior direito)
function drawPdfPhaseLegend(pdf, rightX, topY) {
  const items = [
    { label: 'Etapa I - Fase escolar SENAI', type: 'school' },
    { label: 'Etapa II - Fase prática EMPRESA', type: 'practice' },
  ];
  if (state.school.format === 'concurrent') items.push({ label: 'Etapas I e II (turnos opostos)', type: 'both' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.6);
  const box = 3;
  let y = topY - 2;
  items.forEach((item) => {
    const textW = pdf.getTextWidth(item.label);
    const x = rightX - textW - box - 1.4;
    drawPhaseSwatch(pdf, item.type, x, y, box, box);
    pdf.setDrawColor(148, 163, 184);
    pdf.rect(x, y, box, box);
    pdf.setTextColor(30, 41, 59);
    pdf.text(item.label, x + box + 1.4, y + 2.4);
    y += 3.5;
  });
}

// Legenda secundaria (feriados/bloqueios e marcador dos 10%)
function drawPdfBlockLegend(pdf, x, y) {
  const items = [
    ['Feriado', pdfBlockFillColor('holiday')],
    ['Recesso', pdfBlockFillColor('recess')],
    ['Folga administrativa', pdfBlockFillColor('admin-leave')],
    ['Ação pedagógica', pdfBlockFillColor('training')],
    ['Fim de semana / sem atividade', PDF_COLORS.weekend],
  ];
  let cursorX = x;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  items.forEach(([label, color]) => {
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.setDrawColor(203, 213, 225);
    pdf.rect(cursorX, y - 2.6, 3, 3, 'FD');
    pdf.setTextColor(71, 85, 105);
    pdf.text(label, cursorX + 4, y);
    cursorX += pdf.getTextWidth(label) + 9;
  });
  if (state.school.format !== 'subsequent' && state.schoolMilestone) {
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(180, 83, 9);
    pdf.text('10%', cursorX, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(71, 85, 105);
    pdf.text(`= dia em que se completam 10% da carga horária escolar (${formatDateBR(state.schoolMilestone.date)})`, cursorX + pdf.getTextWidth('10%') + 1.5, y);
  }
}

// Preenche uma area conforme a etapa: escolar, pratica ou ambas (diagonal)
function drawPhaseSwatch(pdf, type, x, y, w, h) {
  const school = PDF_COLORS.school;
  const practice = PDF_COLORS.practice;
  if (type === 'school') {
    pdf.setFillColor(school[0], school[1], school[2]);
    pdf.rect(x, y, w, h, 'F');
  } else if (type === 'practice') {
    pdf.setFillColor(practice[0], practice[1], practice[2]);
    pdf.rect(x, y, w, h, 'F');
  } else if (type === 'both') {
    pdf.setFillColor(school[0], school[1], school[2]);
    pdf.triangle(x, y, x + w, y, x, y + h, 'F');
    pdf.setFillColor(practice[0], practice[1], practice[2]);
    pdf.triangle(x + w, y, x + w, y + h, x, y + h, 'F');
  }
}

// Pagina com os dados das duas etapas e a distribuicao mensal
function appendContractSummaryPage(pdf, senaiLogoDataUrl) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 10;
  const s = state.school;
  const info = getSchoolSummary();
  const fmt = PRACTICE_FORMATS[s.format];
  const hoursPerDay = Number(els.hoursPerDay.value || 0);
  const totalHours = Number(state.totalHoursResult || els.totalHours.value || 0);

  pdf.addPage('a4', 'landscape');
  drawLandscapeSummaryHeader(pdf, senaiLogoDataUrl, 'Resumo do contrato - Etapas I e II');
  drawLandscapeCalendarFooter(pdf, marginX, pageHeight - 4);

  const filler = (els.fillerName.value || '').trim() || 'Não informado';
  const client = (els.clientName.value || '').trim() || 'Não informado';
  const unit = (els.unitName.value || '').trim() || 'Não informada';
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(51, 65, 85);
  pdf.text(`Empresa: ${client}   •   Unidade SENAI: ${unit}   •   Responsável: ${filler}`, marginX, 21);

  const schoolLines = [
    `Período: ${formatDateBR(info.start)} a ${formatDateBR(info.end)}`,
    `Carga horária da fase escolar: ${info.totalHours} h`,
    `Dias de aula: ${info.days} (${info.scheduledHours} h no calendário)`,
    `Aulas: ${s.hoursPerDay} h/dia • turno ${(SHIFT_LABELS[s.shift] || '').toLowerCase()}${s.time ? ` (${s.time})` : ''}`,
    `Cronograma da unidade: ${s.pdfName ? 'anexo ao final deste documento' : 'não anexado'}`,
  ];
  const practiceLines = [
    `Formato: ${fmt.label}`,
    `Regra: ${fmt.rule}`,
  ];
  if (s.format !== 'subsequent' && state.schoolMilestone) {
    practiceLines.push(`10% da CH escolar (${state.schoolMilestone.threshold} h) concluídos em ${formatDateBR(state.schoolMilestone.date)}`);
  }
  practiceLines.push(
    `Período: ${formatDateBR(state.periodStart || state.phaseDays[0])} a ${formatDateBR(state.periodEnd || state.endDate)}`,
    `Total: ${state.phaseDays.length} dias / ${totalHours} h • ${hoursPerDay} h/dia${s.format === 'concurrent' ? ` • turno ${(OPPOSITE_SHIFT[s.shift] || 'oposto').toLowerCase()}` : ''}`,
    `Dias considerados: ${formatSelectedWeekdays()}`,
  );
  const boxes = [
    { title: 'ETAPA I - FASE ESCOLAR SENAI', type: 'school', text: PDF_COLORS.schoolText, lines: schoolLines },
    { title: 'ETAPA II - FASE PRÁTICA EMPRESA', type: 'practice', text: PDF_COLORS.practiceText, lines: practiceLines },
  ];
  const gap = 8;
  const boxW = (pageWidth - marginX * 2 - gap) / 2;
  const boxY = 25;
  const boxH = 40;
  boxes.forEach((box, i) => {
    const x = marginX + i * (boxW + gap);
    pdf.setDrawColor(203, 213, 225);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, boxY, boxW, boxH, 2, 2, 'FD');
    drawPhaseSwatch(pdf, box.type, x, boxY, boxW, 7);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(box.text[0], box.text[1], box.text[2]);
    pdf.text(box.title, x + 3, boxY + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.4);
    pdf.setTextColor(31, 41, 55);
    box.lines.forEach((line, li) => {
      pdf.text(pdf.splitTextToSize(line, boxW - 6)[0], x + 3, boxY + 12 + li * 4.6);
    });
  });

  let y = boxY + boxH + 6;
  const notes = [info.mismatch, getDualWarning()].filter(Boolean);
  notes.forEach((note) => {
    const lines = pdf.splitTextToSize(note, pageWidth - marginX * 2 - 6);
    pdf.setFillColor(254, 243, 199);
    pdf.rect(marginX, y - 3.5, pageWidth - marginX * 2, lines.length * 4 + 3, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.2);
    pdf.setTextColor(120, 53, 15);
    pdf.text(lines, marginX + 3, y);
    y += lines.length * 4 + 5;
  });

  y += 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(17, 24, 39);
  pdf.text('Distribuição por mês', marginX, y);
  y += 3;

  const cols = [['Mês', 60, null], ['Etapa I - aulas (dias)', 45, 'school'], ['Etapa I (horas)', 45, 'school'], ['Etapa II - prática (dias)', 45, 'practice'], ['Etapa II (horas)', 45, 'practice']];
  const rowH = 5.4;
  const drawHead = (yy) => {
    let cx = marginX;
    cols.forEach(([label, w, type]) => {
      if (type) drawPhaseSwatch(pdf, type, cx, yy, w, rowH);
      else { pdf.setFillColor(241, 245, 249); pdf.rect(cx, yy, w, rowH, 'F'); }
      pdf.setDrawColor(203, 213, 225);
      pdf.rect(cx, yy, w, rowH, 'S');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.2);
      pdf.setTextColor(30, 41, 59);
      pdf.text(label, cx + 2, yy + 3.8);
      cx += w;
    });
  };
  drawHead(y);
  y += rowH;

  const totals = { sd: 0, sh: 0, pd: 0, ph: 0 };
  const allRows = state.reportRows.map((row) => {
    totals.sd += row.schoolDays || 0; totals.sh += row.schoolHours || 0;
    totals.pd += row.days; totals.ph += row.hours;
    return [row.month, row.schoolDays || 0, row.schoolHours || 0, row.days, row.hours];
  });
  allRows.push(['Total', totals.sd, totals.sh, totals.pd, totals.ph]);
  allRows.forEach((values, ri) => {
    if (y + rowH > pageHeight - 10) {
      pdf.addPage('a4', 'landscape');
      drawLandscapeSummaryHeader(pdf, senaiLogoDataUrl, 'Resumo do contrato - Etapas I e II');
      drawLandscapeCalendarFooter(pdf, marginX, pageHeight - 4);
      y = 22;
      drawHead(y);
      y += rowH;
    }
    const isTotal = ri === allRows.length - 1;
    let cx = marginX;
    cols.forEach(([, w], ci) => {
      pdf.setFillColor(isTotal ? 241 : 255, isTotal ? 245 : 255, isTotal ? 249 : 255);
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(cx, y, w, rowH, 'FD');
      pdf.setFont('helvetica', isTotal ? 'bold' : 'normal');
      pdf.setFontSize(8.2);
      pdf.setTextColor(31, 41, 55);
      pdf.text(String(values[ci]), ci === 0 ? cx + 2 : cx + w - 2, y + 3.8, { align: ci === 0 ? 'left' : 'right' });
      cx += w;
    });
    y += rowH;
  });
}

// Anexa as paginas do cronograma da fase escolar (PDF da unidade)
function appendSchoolPdfAnnex(pdf) {
  if (!schoolActive() || !schoolPdfPages.length) return;
  const total = schoolPdfPages.length;
  schoolPdfPages.forEach((page, index) => {
    const orientation = page.width > page.height ? 'landscape' : 'portrait';
    pdf.addPage('a4', orientation);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const headerH = 7;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    const sc = PDF_COLORS.schoolText;
    pdf.setTextColor(sc[0], sc[1], sc[2]);
    pdf.text(`ANEXO - Etapa I - Cronograma da fase escolar SENAI (PDF da unidade) - página ${index + 1} de ${total}`, margin, margin + 2.5);
    const school = PDF_COLORS.school;
    pdf.setFillColor(school[0], school[1], school[2]);
    pdf.rect(margin, margin + 4, pageWidth - margin * 2, 1, 'F');
    const availW = pageWidth - margin * 2;
    const availH = pageHeight - margin * 2 - headerH;
    const ratio = Math.min(availW / page.width, availH / page.height);
    const w = page.width * ratio;
    const h = page.height * ratio;
    pdf.addImage(page.dataUrl, 'JPEG', (pageWidth - w) / 2, margin + headerH + (availH - h) / 2, w, h, undefined, 'FAST');
  });
}

function drawLandscapeCalendarFooter(pdf, x, y) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('Desenvolvido por Paulo da Silva Filho - Especialista em TI - GEP - BAHIA - 2026', x, y);
}

function appendLandscapeBlockSummary(pdf, senaiLogoDataUrl) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 10;
  const topY = 22;
  const bottomY = pageHeight - 10;
  const columnGap = 8;
  const columnWidth = (pageWidth - (marginX * 2) - columnGap) / 2;

  const displayBlocks = getBlocksWithinCurrentPeriod().sort((a, b) => {
    const dateCompare = a.start.localeCompare(b.start);
    if (dateCompare !== 0) return dateCompare;
    return (a.description || '').localeCompare(b.description || '');
  });
  const automaticBlocks = displayBlocks.filter((block) => block.automatic);
  const manualBlocks = displayBlocks.filter((block) => !block.automatic);
  if (schoolActive()) {
    state.school.nonSchool.forEach((item) => manualBlocks.push({
      type: 'non-school',
      description: `Sem aula na escola (Etapa I): ${item.description}`,
      start: item.start,
      end: item.end,
    }));
    manualBlocks.sort((a, b) => a.start.localeCompare(b.start));
  }

  pdf.addPage('a4', 'landscape');
  drawLandscapeSummaryHeader(pdf, senaiLogoDataUrl);
  drawLandscapeCalendarFooter(pdf, marginX, pageHeight - 4);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(17, 24, 39);
  pdf.text('Resumo de feriados e bloqueios', marginX, 16.5);

  const drawColumn = (title, items, x, startY) => {
    let y = startY;
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(x, y, columnWidth, 8, 2, 2, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(30, 41, 59);
    pdf.text(title, x + 3, y + 5.3);
    y += 11;

    if (!items.length) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text('Nenhum registro dentro do periodo calculado.', x + 2, y);
      return;
    }

    items.forEach((block) => {
      const dateLabel = block.start === block.end
        ? formatDateBR(block.start)
        : `${formatDateBR(block.start)} a ${formatDateBR(block.end)}`;
      const scope = block.automatic && block.holidayScope ? ` (${block.holidayScope})` : '';
      const line = `${dateLabel} - ${block.description}${scope}`;
      const lines = pdf.splitTextToSize(line, columnWidth - 6);
      const lineHeight = 4.3;
      const needed = 2 + (lines.length * lineHeight) + 2;
      if (y + needed > bottomY) {
        pdf.addPage('a4', 'landscape');
        drawLandscapeSummaryHeader(pdf, senaiLogoDataUrl);
        drawLandscapeCalendarFooter(pdf, marginX, pageHeight - 4);
        pdf.setFillColor(241, 245, 249);
        pdf.setDrawColor(203, 213, 225);
        pdf.roundedRect(x, topY, columnWidth, 8, 2, 2, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(30, 41, 59);
        pdf.text(title, x + 3, topY + 5.3);
        y = topY + 11;
      }
      const color = pdfBlockFillColor(block.type);
      pdf.setFillColor(color[0], color[1], color[2]);
      pdf.roundedRect(x + 0.5, y - 3.2, 2.6, 2.6, 0.6, 0.6, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(31, 41, 55);
      pdf.text(lines, x + 4.2, y);
      y += needed;
    });
  };

  drawColumn('Feriados automaticos', automaticBlocks, marginX, topY);
  drawColumn('Bloqueios manuais', manualBlocks, marginX + columnWidth + columnGap, topY);
}

function drawLandscapeSummaryHeader(pdf, logoDataUrl, title = 'Resumo de feriados e bloqueios') {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, 18, 'F');
  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, 'PNG', 8, 3, 44, 10);
  }
  pdf.setTextColor(17, 24, 39);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title, pageWidth / 2, 8, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  const range = getOverallRange();
  const periodStart = range ? formatDateBR(range.start) : '--';
  const periodEnd = range ? formatDateBR(range.end) : '--';
  pdf.text(`${periodStart} ate ${periodEnd}`, pageWidth / 2, 12.8, { align: 'center' });
  pdf.setDrawColor(209, 213, 219);
  pdf.line(8, 15, pageWidth - 8, 15);
}

function drawMonthCalendarPdfCompact(pdf, monthInfo, x, y, width, height) {
  const year = monthInfo.year;
  const month = monthInfo.month;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  const startOffset = first.getDay();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthlyCount = state.phaseDays.filter((date) => date.startsWith(monthPrefix)).length;
  const schoolCount = schoolActive() ? state.schoolDays.filter((date) => date.startsWith(monthPrefix)).length : 0;
  const milestoneDate = schoolActive() && state.school.format !== 'subsequent' && state.schoolMilestone ? state.schoolMilestone.date : null;

  const headerH = 8;
  const metaH = 5;
  const weekdayH = 5;
  const legendH = 0;
  const gridTop = y + headerH + metaH;
  const gridHeight = height - headerH - metaH - legendH - 2;
  const cellW = width / 7;
  const cellH = gridHeight / 7;

  pdf.setDrawColor(180, 188, 201);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, height, 2, 2, 'FD');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(17, 24, 39);
  pdf.text(`${monthNames[month]} ${year}`, x + 2.5, y + 5.2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100, 116, 139);
  if (schoolActive()) {
    const sc = PDF_COLORS.schoolText;
    const pc = PDF_COLORS.practiceText;
    const schoolLabel = `Etapa I (aulas): ${schoolCount}`;
    pdf.setTextColor(sc[0], sc[1], sc[2]);
    pdf.text(schoolLabel, x + 2.5, y + 10);
    pdf.setTextColor(pc[0], pc[1], pc[2]);
    pdf.text(`Etapa II (prática): ${monthlyCount}`, x + 2.5 + pdf.getTextWidth(schoolLabel) + 4, y + 10);
  } else {
    pdf.text(`Dias de pratica: ${monthlyCount}`, x + 2.5, y + 10);
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.8);
  weekdayNames.forEach((name, idx) => {
    const cellX = x + idx * cellW;
    pdf.setFillColor(241, 245, 249);
    pdf.rect(cellX, gridTop, cellW, weekdayH, 'F');
    pdf.setDrawColor(220, 225, 233);
    pdf.rect(cellX, gridTop, cellW, weekdayH);
    pdf.setTextColor(71, 85, 105);
    pdf.text(name, cellX + cellW / 2, gridTop + 3.4, { align: 'center' });
  });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.3);
  let index = 0;
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const cellX = x + (col * cellW);
      const cellY = gridTop + weekdayH + (row * cellH);
      const dayNumber = index - startOffset + 1;
      const inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;

      pdf.setDrawColor(225, 229, 236);
      pdf.setFillColor(255, 255, 255);

      let cellStatus = null;
      let phaseType = null;
      if (inMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        cellStatus = getDayStatus(dateStr);
        const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();
        if (cellStatus.isSchool && cellStatus.isPhase) phaseType = 'both';
        else if (cellStatus.isSchool) phaseType = 'school';
        else if (cellStatus.isPhase) phaseType = 'practice';
        if (!phaseType && cellStatus.block) {
          const color = pdfBlockFillColor(cellStatus.block.type);
          pdf.setFillColor(color[0], color[1], color[2]);
        } else if (!phaseType && (dayOfWeek === 0 || dayOfWeek === 6 || cellStatus.nonSchool)) {
          pdf.setFillColor(248, 250, 252);
        }
      } else {
        pdf.setFillColor(248, 250, 252);
      }
      pdf.rect(cellX, cellY, cellW, cellH, 'FD');
      if (phaseType && !(phaseType === 'practice' && !schoolActive())) {
        drawPhaseSwatch(pdf, phaseType, cellX, cellY, cellW, cellH);
        pdf.setDrawColor(225, 229, 236);
        pdf.rect(cellX, cellY, cellW, cellH, 'S');
      } else if (phaseType === 'practice') {
        pdf.setFillColor(220, 252, 231);
        pdf.rect(cellX, cellY, cellW, cellH, 'FD');
      }

      if (inMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const { block, isPhase, isSchool, nonSchool } = cellStatus;
        const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay();

        pdf.setTextColor(17, 24, 39);
        pdf.setFont('helvetica', 'bold');
        pdf.text(String(dayNumber).padStart(2, '0'), cellX + 1.4, cellY + 3.2);
        if (dateStr === milestoneDate) {
          pdf.setFontSize(5.4);
          pdf.setTextColor(180, 83, 9);
          pdf.text('10%', cellX + cellW - 1.2, cellY + 3.2, { align: 'right' });
          pdf.setTextColor(17, 24, 39);
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.4);
        if (isSchool && isPhase) {
          pdf.setTextColor(30, 41, 59);
          pdf.text('Etapa I+II', cellX + cellW / 2, cellY + cellH - 1.2, { align: 'center' });
        } else if (isSchool) {
          const sc = PDF_COLORS.schoolText;
          pdf.setTextColor(sc[0], sc[1], sc[2]);
          pdf.text('Etapa I', cellX + cellW / 2, cellY + cellH - 1.2, { align: 'center' });
        } else if (isPhase) {
          const pc = PDF_COLORS.practiceText;
          pdf.setTextColor(pc[0], pc[1], pc[2]);
          pdf.text(schoolActive() ? 'Etapa II' : 'Pratica', cellX + cellW / 2, cellY + cellH - 1.2, { align: 'center' });
        } else if (block) {
          pdf.setTextColor(83, 88, 98);
          pdf.text(shortBlockLabel(block.type), cellX + cellW / 2, cellY + cellH - 1.2, { align: 'center' });
        } else if (nonSchool && dayOfWeek !== 0 && dayOfWeek !== 6) {
          pdf.setTextColor(120, 113, 108);
          pdf.text('Sem aula', cellX + cellW / 2, cellY + cellH - 1.2, { align: 'center' });
        } else if (dayOfWeek === 0 || dayOfWeek === 6) {
          pdf.setTextColor(148, 163, 184);
          pdf.text('Fim de semana', cellX + cellW / 2, cellY + cellH - 1.2, { align: 'center' });
        }
        pdf.setFontSize(6.3);
      }
      index += 1;
    }
  }
}

function shortBlockLabel(type) {
  return {
    holiday: 'Feriado',
    recess: 'Recesso',
    'admin-leave': 'Folga',
    training: 'Acao',
  }[type] || 'Bloq.';
}

function drawPdfCover(pdf, margin, contentWidth, y, senaiLogoDataUrl) {
  const filler = (els.fillerName.value || '').trim() || 'Nao informado';
  const client = (els.clientName.value || '').trim() || 'Nao informado';
  const unit = (els.unitName.value || '').trim() || 'Nao informada';
  const mode = state.scheduleInputMode === 'period-to-hours'
    ? 'Data de inicio + data final'
    : (state.uiMode === 'advanced' && els.calculationMode.value === 'monthly-quota'
      ? 'Calendario personalizado por mes'
      : 'Data de inicio + carga horaria');
  const periodStart = (state.periodStart || state.phaseDays[0]) ? formatDateBR(state.periodStart || state.phaseDays[0]) : '--';
  const periodEnd = (state.periodEnd || state.endDate) ? formatDateBR(state.periodEnd || state.endDate) : '--';

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
    ['Carga horaria', `${Number(state.totalHoursResult || els.totalHours.value || 0)} h`],
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
  const grouped = groupMonthsBetween(state.periodStart || state.phaseDays[0], state.periodEnd || state.phaseDays[state.phaseDays.length - 1]);
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
  state.periodStart = null;
  state.periodEnd = null;
  state.totalHoursResult = 0;
  state.scheduleInputMode = 'hours-to-end';
  state.school = defaultSchoolState();
  state.schoolDays = [];
  state.schoolMilestone = null;
  schoolPdfPages = [];
  rebuildDaySets();
  storeSchoolPdfBytes(null);
  applySchoolStateToUi();
  renderLegend();
  els.calendarHint.style.display = 'none';

  els.fillerName.value = '';
  els.clientName.value = '';
  els.unitName.value = '';
  els.hoursPerDay.value = 4;
  els.totalHours.value = 200;
  els.endDateInput.value = '';
  const defaultModeRadio = document.querySelector('input[name="scheduleInputMode"][value="hours-to-end"]');
  if (defaultModeRadio) defaultModeRadio.checked = true;
  els.calculationMode.value = 'automatic';
  els.blockDescription.value = '';
  els.blockStart.value = '';
  els.blockEnd.value = '';
  setDefaultStartDate();
  refreshBlockList();
  renderMonthlyQuotaInputs();
  applyUiMode();
  updateScheduleInputModeUi();

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
