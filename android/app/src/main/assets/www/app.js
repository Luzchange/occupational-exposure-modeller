/**
 * Occupational exposure modeling - Main Application Controller
 * Handles UI events, state synchronization, calculations, charting, and exports.
 */

import {
  CHEMICAL_DATABASE,
  Units,
  ExposureMetrics,
  WellMixedRoom,
  TwoZoneModel,
  TurbulentDiffusion,
  GenerationRateEstimators,
  MonteCarloEngine,
  AcgihGuidelines
} from './engine.js';

import { ModellerChart } from './chartEngine.js';

// Application State
const state = {
  activeTab: 'tab-wmr',
  activeChem: CHEMICAL_DATABASE.find(c => c.name.toLowerCase().includes('toluene')) || CHEMICAL_DATABASE[0],
  inspectedChem: null,
  lastSimulation: null,
  charts: {}
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initChemicalSelector();
  initTabs();
  initCharts();
  initWmrEvents();
  initTwoZoneEvents();
  initEddyEvents();
  initGenerationEvents();
  initMonteCarloEvents();
  initChemicalTableAndUnits();
  initAcgihGuidelinesAndShifts();
  initExportAndReport();

  // Run initial simulation
  runWmrCalc();
});

/* ----------------------------------------------------
   Chemical Selector & Global Bar
---------------------------------------------------- */
function initChemicalSelector() {
  const select = document.getElementById('global-chem-select');
  select.innerHTML = '';
  CHEMICAL_DATABASE.forEach((chem, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = `${chem.name} (CAS ${chem.cas})`;
    if (chem.name === state.activeChem.name) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', (e) => {
    const chem = CHEMICAL_DATABASE[Number(e.target.value)];
    setActiveChemical(chem);
  });

  updateChemicalBar();
}

function setActiveChemical(chem) {
  state.activeChem = chem;
  const select = document.getElementById('global-chem-select');
  const idx = CHEMICAL_DATABASE.findIndex(c => c.name === chem.name);
  if (idx >= 0) select.value = idx;
  updateChemicalBar();

  // Auto-populate Csat in WMR if backpressure selected
  const tempK = 293.15;
  const pvapPa = chem.vp20 * 133.322;
  const csat = (pvapPa * chem.mw * 1e6) / (8.314 * tempK);
  const csatInput = document.getElementById('wmr-Csat');
  if (csatInput) csatInput.value = Math.round(csat);

  // Re-run active calculation
  if (state.activeTab === 'tab-wmr') runWmrCalc();
  else if (state.activeTab === 'tab-twozone') runTwoZoneCalc();
  else if (state.activeTab === 'tab-eddy') runEddyCalc();
}

function updateChemicalBar() {
  const chem = state.activeChem;
  document.getElementById('bar-chem-cas').textContent = chem.cas;
  document.getElementById('bar-chem-mw').textContent = chem.mw;
  document.getElementById('bar-chem-vp').textContent = chem.vp20;
  document.getElementById('bar-chem-pel').textContent = chem.oelPel || 'N/A';
  document.getElementById('bar-chem-tlv').textContent = chem.oelTlv || 'N/A';
  document.getElementById('bar-chem-stel').textContent = chem.oelStel || 'N/A';
}

/* ----------------------------------------------------
   Tab Navigation
---------------------------------------------------- */
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(tc => {
        tc.style.display = tc.id === targetId ? 'block' : 'none';
      });

      state.activeTab = targetId;

      // Resize and re-render chart on tab switch
      setTimeout(() => {
        if (targetId === 'tab-wmr' && state.charts.wmr) state.charts.wmr.render(state.charts.wmr.data, state.charts.wmr.options);
        if (targetId === 'tab-twozone' && state.charts.twozone) state.charts.twozone.render(state.charts.twozone.data, state.charts.twozone.options);
        if (targetId === 'tab-eddy' && state.charts.eddy) state.charts.eddy.render(state.charts.eddy.data, state.charts.eddy.options);
        if (targetId === 'tab-montecarlo' && state.charts.mc) state.charts.mc.render(state.charts.mc.data, state.charts.mc.options);
      }, 50);

      if (targetId === 'tab-report') updateExecutiveReport();
    });
  });
}

function initCharts() {
  const cWmr = document.getElementById('chart-wmr');
  if (cWmr) state.charts.wmr = new ModellerChart(cWmr);

  const cTz = document.getElementById('chart-twozone');
  if (cTz) state.charts.twozone = new ModellerChart(cTz);

  const cEddy = document.getElementById('chart-eddy');
  if (cEddy) state.charts.eddy = new ModellerChart(cEddy);

  const cMc = document.getElementById('chart-mc');
  if (cMc) state.charts.mc = new ModellerChart(cMc);

  window.addEventListener('resize', () => {
    Object.values(state.charts).forEach(chart => {
      if (chart && chart.data) chart.render(chart.data, chart.options);
    });
  });
}

/* ----------------------------------------------------
   TAB 1: Well-Mixed Room (WMR)
---------------------------------------------------- */
function initWmrEvents() {
  const subType = document.getElementById('wmr-subtype');
  subType.addEventListener('change', () => {
    const val = subType.value;
    document.getElementById('wmr-cgr-fields').style.display = (val === 'CGR' || val === 'Backpressure') ? 'block' : 'none';
    document.getElementById('wmr-edg-fields').style.display = val === 'EDG' ? 'block' : 'none';
    document.getElementById('wmr-backpressure-fields').style.display = val === 'Backpressure' ? 'block' : 'none';
    runWmrCalc();
  });

  document.getElementById('btn-calc-wmr').addEventListener('click', runWmrCalc);

  // ACH real-time label update
  const qInput = document.getElementById('wmr-Q');
  const vInput = document.getElementById('wmr-V');
  const qUnit = document.getElementById('wmr-q-unit');

  function updateAchLabel() {
    const v = Number(vInput.value) || 100;
    let qVal = Number(qInput.value) || 10;
    let ach = 0;
    if (qUnit.value === 'm3min') ach = (qVal * 60) / v;
    else if (qUnit.value === 'ach') ach = qVal;
    else if (qUnit.value === 'cfm') ach = (Units.cfmToM3Min(qVal) * 60) / v;
    document.getElementById('wmr-ach-text').textContent = `ACH: ${ach.toFixed(1)}`;
  }

  qInput.addEventListener('input', updateAchLabel);
  vInput.addEventListener('input', updateAchLabel);
  qUnit.addEventListener('change', updateAchLabel);
}

function runWmrCalc() {
  const subType = document.getElementById('wmr-subtype').value;
  const V = Number(document.getElementById('wmr-V').value) || 100;
  const qRaw = Number(document.getElementById('wmr-Q').value) || 10;
  const qUnit = document.getElementById('wmr-q-unit').value;
  const C0 = Number(document.getElementById('wmr-C0').value) || 0;
  const tTotal = Number(document.getElementById('wmr-tTotal').value) || 480;

  let Q = qRaw;
  if (qUnit === 'ach') Q = Units.achToM3Min(qRaw, V);
  else if (qUnit === 'cfm') Q = Units.cfmToM3Min(qRaw);

  let res = null;
  const chem = state.activeChem;

  if (subType === 'CGR') {
    const G = Number(document.getElementById('wmr-G').value) || 500;
    const tStop = Number(document.getElementById('wmr-tStop').value) || 60;
    res = WellMixedRoom.runCGR({ G, Q, V, C0, tStop, tTotal });
  } else if (subType === 'EDG') {
    const M0 = Number(document.getElementById('wmr-M0').value) || 50000;
    const alpha = Number(document.getElementById('wmr-alpha').value) || 0.03;
    res = WellMixedRoom.runEDG({ M0, alpha, Q, V, C0, tTotal });
  } else if (subType === 'Backpressure') {
    const G0 = Number(document.getElementById('wmr-G').value) || 500;
    const Csat = Number(document.getElementById('wmr-Csat').value) || 450000;
    const tStop = Number(document.getElementById('wmr-tStop').value) || 60;
    res = WellMixedRoom.runBackpressure({ G0, Csat, Q, V, C0, tStop, tTotal });
  } else if (subType === 'Purge') {
    res = WellMixedRoom.runPurge({ C0: C0 || 100, Q, V, tTotal });
  }

  if (!res) return;
  state.lastSimulation = { model: 'Well-Mixed Room (' + subType + ')', params: { V, Q, C0, tTotal }, result: res };

  // Render Metric Badges
  const twa8Ppm = Units.mgM3ToPpm(res.twa8 || 0, chem.mw);
  const stelPpm = Units.mgM3ToPpm(res.stel || 0, chem.mw);

  document.getElementById('wmr-res-twa8').textContent = `${(res.twa8 || 0).toFixed(2)}`;
  document.getElementById('wmr-unit-1').textContent = `mg/m³ (${twa8Ppm.toFixed(1)} ppm)`;

  document.getElementById('wmr-res-stel').textContent = `${(res.stel || 0).toFixed(2)}`;
  document.getElementById('wmr-unit-2').textContent = `mg/m³ (${stelPpm.toFixed(1)} ppm)`;

  document.getElementById('wmr-res-cmax').textContent = `${(res.cMax || 0).toFixed(2)}`;
  document.getElementById('wmr-res-css').textContent = res.cSteadyState ? `${res.cSteadyState.toFixed(1)}` : 'N/A';

  // AIHA Verdict
  const oelPpm = chem.oelTlv || chem.oelPel || 0;
  const verdict = ExposureMetrics.classifyAihaCategory(twa8Ppm, oelPpm);
  const verdictBox = document.getElementById('wmr-verdict');
  verdictBox.className = `verdict-box ${getVerdictClass(verdict.category)}`;
  document.getElementById('wmr-verdict-title').textContent = `AIHA Rating: ${verdict.category} - ${verdict.description}`;
  document.getElementById('wmr-verdict-ratio').textContent = verdict.ratio ? `Ratio: ${verdict.ratio.toFixed(2)} of OEL` : '';

  // Render Time Series Chart
  const oelMgM3 = Units.ppmToMgM3(oelPpm, chem.mw);
  const stelOelMgM3 = chem.oelStel ? Units.ppmToMgM3(chem.oelStel, chem.mw) : null;

  const thresholds = [];
  if (oelMgM3 > 0) thresholds.push({ label: 'TLV/PEL', val: oelMgM3, color: '#ef4444', dash: [6, 4] });
  if (stelOelMgM3) thresholds.push({ label: 'STEL Limit', val: stelOelMgM3, color: '#f59e0b', dash: [4, 4] });

  state.charts.wmr.render({
    series: [
      {
        name: 'Room Concentration',
        x: res.times,
        y: res.concs,
        color: '#2563eb',
        fill: 'rgba(37, 99, 235, 0.1)',
        width: 2.5
      }
    ]
  }, {
    yUnit: 'Concentration (mg/m³)',
    thresholds
  });
}

function getVerdictClass(category) {
  if (category === 'Category 1') return 'badge-cat1';
  if (category === 'Category 2') return 'badge-cat2';
  if (category === 'Category 3') return 'badge-cat3';
  return 'badge-cat4';
}

/* ----------------------------------------------------
   TAB 2: Two-Zone (NF/FF)
---------------------------------------------------- */
function initTwoZoneEvents() {
  const mode = document.getElementById('tz-mode');
  mode.addEventListener('change', () => {
    const isEdg = mode.value === 'EDG';
    document.getElementById('tz-cgr-fields').style.display = isEdg ? 'none' : 'block';
    document.getElementById('tz-edg-fields').style.display = isEdg ? 'block' : 'none';
    runTwoZoneCalc();
  });

  document.getElementById('btn-calc-tz').addEventListener('click', runTwoZoneCalc);

  // Beta Helper Box
  const btnBeta = document.getElementById('btn-calc-beta');
  const boxBeta = document.getElementById('beta-helper-box');
  btnBeta.addEventListener('click', () => {
    boxBeta.style.display = boxBeta.style.display === 'none' ? 'block' : 'none';
  });

  const speedIn = document.getElementById('beta-speed');
  const radIn = document.getElementById('beta-radius');
  function updateCalcBeta() {
    const s = Number(speedIn.value) || 10;
    const r = Number(radIn.value) || 1.0;
    const betaVal = TwoZoneModel.calcBeta(s, r, 'hemisphere');
    document.getElementById('beta-calculated').textContent = `${betaVal.toFixed(1)} m³/min`;
  }
  speedIn.addEventListener('input', updateCalcBeta);
  radIn.addEventListener('input', updateCalcBeta);

  document.getElementById('btn-apply-beta').addEventListener('click', () => {
    const s = Number(speedIn.value) || 10;
    const r = Number(radIn.value) || 1.0;
    const betaVal = TwoZoneModel.calcBeta(s, r, 'hemisphere');
    document.getElementById('tz-beta').value = betaVal.toFixed(1);
    boxBeta.style.display = 'none';
    runTwoZoneCalc();
  });
}

function runTwoZoneCalc() {
  const mode = document.getElementById('tz-mode').value;
  const V_NF = Number(document.getElementById('tz-V_NF').value) || 6.0;
  const V_FF = Number(document.getElementById('tz-V_FF').value) || 94.0;
  const beta = Number(document.getElementById('tz-beta').value) || 12.0;
  const Q = Number(document.getElementById('tz-Q').value) || 15.0;
  const tTotal = Number(document.getElementById('tz-tTotal').value) || 480;

  let params = { mode, V_NF, V_FF, beta, Q, tTotal };
  if (mode === 'CGR') {
    params.G = Number(document.getElementById('tz-G').value) || 300;
    params.tStop = Number(document.getElementById('tz-tStop').value) || 120;
  } else {
    params.M0 = Number(document.getElementById('tz-M0').value) || 30000;
    params.alpha = Number(document.getElementById('tz-alpha').value) || 0.02;
  }

  const res = TwoZoneModel.runTwoZone(params);
  if (!res) return;
  state.lastSimulation = { model: `Two-Zone (${mode})`, params, result: res };

  const chem = state.activeChem;
  const twa8NfPpm = Units.mgM3ToPpm(res.twa8NF, chem.mw);
  const twa8FfPpm = Units.mgM3ToPpm(res.twa8FF, chem.mw);

  document.getElementById('tz-res-twa8-nf').textContent = `${res.twa8NF.toFixed(1)} (${twa8NfPpm.toFixed(1)} ppm)`;
  document.getElementById('tz-res-twa8-ff').textContent = `${res.twa8FF.toFixed(1)} (${twa8FfPpm.toFixed(1)} ppm)`;
  document.getElementById('tz-res-stel-nf').textContent = `${res.stelNF.toFixed(1)} mg/m³`;
  document.getElementById('tz-res-css-nf').textContent = res.cNF_ss ? `${res.cNF_ss.toFixed(1)} mg/m³` : 'N/A';

  // AIHA Category for Near Field Worker Exposure
  const oelPpm = chem.oelTlv || chem.oelPel || 0;
  const verdict = ExposureMetrics.classifyAihaCategory(twa8NfPpm, oelPpm);
  const verdictBox = document.getElementById('tz-verdict');
  verdictBox.className = `verdict-box ${getVerdictClass(verdict.category)}`;
  document.getElementById('tz-verdict-title').textContent = `Near-Field AIHA Rating: ${verdict.category} - ${verdict.description}`;
  document.getElementById('tz-verdict-ratio').textContent = verdict.ratio ? `Ratio: ${verdict.ratio.toFixed(2)} of OEL` : '';

  // Render Dual-Curve Chart
  const oelMgM3 = Units.ppmToMgM3(oelPpm, chem.mw);
  const thresholds = [];
  if (oelMgM3 > 0) thresholds.push({ label: 'TLV/PEL', val: oelMgM3, color: '#ef4444', dash: [6, 4] });

  state.charts.twozone.render({
    series: [
      {
        name: 'Near Field (NF)',
        x: res.times,
        y: res.concsNF,
        color: '#dc2626',
        fill: 'rgba(220, 38, 38, 0.08)',
        width: 2.5
      },
      {
        name: 'Far Field (FF)',
        x: res.times,
        y: res.concsFF,
        color: '#2563eb',
        fill: null,
        width: 2.0
      }
    ]
  }, {
    yUnit: 'Concentration (mg/m³)',
    thresholds
  });
}

/* ----------------------------------------------------
   TAB 3: Turbulent Eddy Diffusion
---------------------------------------------------- */
function initEddyEvents() {
  const relType = document.getElementById('eddy-release-type');
  relType.addEventListener('change', () => {
    const isPulse = relType.value === 'pulse';
    document.getElementById('eddy-continuous-fields').style.display = isPulse ? 'none' : 'block';
    document.getElementById('eddy-pulse-fields').style.display = isPulse ? 'block' : 'none';
    runEddyCalc();
  });

  document.getElementById('btn-calc-eddy').addEventListener('click', runEddyCalc);
}

function runEddyCalc() {
  const releaseType = document.getElementById('eddy-release-type').value;
  const D = Number(document.getElementById('eddy-D').value) || 0.05;
  const r = Number(document.getElementById('eddy-r').value) || 1.5;
  const geometry = document.getElementById('eddy-geometry').value;
  const Q = Number(document.getElementById('eddy-Q').value) || 10;
  const V = Number(document.getElementById('eddy-V').value) || 100;

  const G = Number(document.getElementById('eddy-G').value) || 200;
  const M = Number(document.getElementById('eddy-M').value) || 25000;

  const res = TurbulentDiffusion.runTransient({ releaseType, G, M, D, r, Q, V, geometry, tTotal: 120 });
  if (!res) return;

  const cSteady = TurbulentDiffusion.calcSteadyState({ G, D, r, geometry });
  document.getElementById('eddy-res-css').textContent = releaseType === 'continuous' ? `${cSteady.toFixed(1)}` : 'N/A';
  document.getElementById('eddy-res-twa8').textContent = `${res.twa8.toFixed(2)}`;
  document.getElementById('eddy-res-cmax').textContent = `${res.cMax.toFixed(2)}`;
  document.getElementById('eddy-res-stel').textContent = `${res.stel.toFixed(2)}`;

  const chem = state.activeChem;
  const twa8Ppm = Units.mgM3ToPpm(res.twa8, chem.mw);
  const oelPpm = chem.oelTlv || chem.oelPel || 0;
  const verdict = ExposureMetrics.classifyAihaCategory(twa8Ppm, oelPpm);
  const verdictBox = document.getElementById('eddy-verdict');
  verdictBox.className = `verdict-box ${getVerdictClass(verdict.category)}`;
  document.getElementById('eddy-verdict-title').textContent = `AIHA Rating: ${verdict.category} - ${verdict.description}`;
  document.getElementById('eddy-verdict-ratio').textContent = verdict.ratio ? `Ratio: ${verdict.ratio.toFixed(2)} of OEL` : '';

  const oelMgM3 = Units.ppmToMgM3(oelPpm, chem.mw);
  const thresholds = [];
  if (oelMgM3 > 0) thresholds.push({ label: 'TLV/PEL', val: oelMgM3, color: '#ef4444', dash: [6, 4] });

  state.charts.eddy.render({
    series: [
      {
        name: `Concentration at r=${r}m`,
        x: res.times,
        y: res.concs,
        color: '#8b5cf6',
        fill: 'rgba(139, 92, 246, 0.1)',
        width: 2.5
      }
    ]
  }, {
    yUnit: 'Concentration (mg/m³)',
    thresholds
  });
}

/* ----------------------------------------------------
   TAB 4: Emission Estimators
---------------------------------------------------- */
function initGenerationEvents() {
  const modelType = document.getElementById('gen-model-type');
  modelType.addEventListener('change', () => {
    const isMassLoss = modelType.value === 'massloss';
    document.getElementById('gen-pool-fields').style.display = isMassLoss ? 'none' : 'block';
    document.getElementById('gen-massloss-fields').style.display = isMassLoss ? 'block' : 'none';
    runGenCalc();
  });

  document.getElementById('btn-calc-gen').addEventListener('click', runGenCalc);

  document.getElementById('btn-transfer-wmr').addEventListener('click', () => {
    const mgMin = Number(document.getElementById('gen-res-mgmin').getAttribute('data-val')) || 500;
    document.getElementById('wmr-G').value = Math.round(mgMin);
    document.querySelector('.tab-btn[data-tab="tab-wmr"]').click();
    runWmrCalc();
  });

  document.getElementById('btn-transfer-tz').addEventListener('click', () => {
    const mgMin = Number(document.getElementById('gen-res-mgmin').getAttribute('data-val')) || 300;
    document.getElementById('tz-G').value = Math.round(mgMin);
    document.querySelector('.tab-btn[data-tab="tab-twozone"]').click();
    runTwoZoneCalc();
  });

  runGenCalc();
}

function runGenCalc() {
  const modelType = document.getElementById('gen-model-type').value;
  const chem = state.activeChem;
  let res = null;

  if (modelType === 'hummel') {
    const poolAreaM2 = Number(document.getElementById('gen-pool-area').value) || 0.25;
    const airVelocityMMin = Number(document.getElementById('gen-air-speed').value) || 12;
    const tempC = Number(document.getElementById('gen-temp').value) || 20;
    res = GenerationRateEstimators.hummelFehrenbacher({
      mw: chem.mw, pvapMmHg: chem.vp20, poolAreaM2, airVelocityMMin, tempC
    });
  } else if (modelType === 'mackay') {
    const poolAreaM2 = Number(document.getElementById('gen-pool-area').value) || 0.25;
    const airVelocityMMin = Number(document.getElementById('gen-air-speed').value) || 12;
    const tempC = Number(document.getElementById('gen-temp').value) || 20;
    res = GenerationRateEstimators.mackayMatsugu({
      mw: chem.mw, pvapMmHg: chem.vp20, poolAreaM2, airVelocityMMin, tempC
    });
  } else {
    const deltaMass = Number(document.getElementById('gen-delta-mass').value) || 50;
    const duration = Number(document.getElementById('gen-duration').value) || 30;
    res = GenerationRateEstimators.massLoss(deltaMass, duration);
  }

  if (!res) return;
  const mgMinEl = document.getElementById('gen-res-mgmin');
  mgMinEl.textContent = `${res.mgMin.toFixed(1)}`;
  mgMinEl.setAttribute('data-val', res.mgMin);

  document.getElementById('gen-res-gsec').textContent = `${(res.gSec || res.mgMin / 60000).toFixed(4)}`;
  document.getElementById('gen-res-k').textContent = res.K_ms ? `${res.K_ms.toFixed(4)}` : (res.Km_ms ? `${res.Km_ms.toFixed(4)}` : 'N/A');
}

/* ----------------------------------------------------
   TAB 5: Monte Carlo Simulation
---------------------------------------------------- */
function initMonteCarloEvents() {
  const mcModel = document.getElementById('mc-model');
  mcModel.addEventListener('change', renderMonteCarloParams);
  renderMonteCarloParams();

  document.getElementById('btn-run-mc').addEventListener('click', runMonteCarloCalc);
}

function renderMonteCarloParams() {
  const model = document.getElementById('mc-model').value;
  const container = document.getElementById('mc-params-container');
  container.innerHTML = '';

  let paramList = [];
  if (model === 'WMR_CGR') {
    paramList = [
      { key: 'G', label: 'Emission Rate G (mg/min)', defaultType: 'normal', val: 500, mean: 500, stdDev: 100 },
      { key: 'Q', label: 'Ventilation Q (m³/min)', defaultType: 'lognormal', val: 10, geoMean: 10, geoStdDev: 1.4 },
      { key: 'V', label: 'Room Volume V (m³)', defaultType: 'constant', val: 100 },
      { key: 'tStop', label: 'Release Duration (min)', defaultType: 'uniform', val: 60, min: 45, max: 90 }
    ];
  } else if (model === 'TwoZone') {
    paramList = [
      { key: 'G', label: 'Emission Rate into NF (mg/min)', defaultType: 'normal', val: 300, mean: 300, stdDev: 60 },
      { key: 'beta', label: 'Interzonal Airflow β (m³/min)', defaultType: 'lognormal', val: 12, geoMean: 12, geoStdDev: 1.3 },
      { key: 'Q', label: 'Room Ventilation Q (m³/min)', defaultType: 'normal', val: 15, mean: 15, stdDev: 3 },
      { key: 'V_NF', label: 'Near-Field Volume (m³)', defaultType: 'constant', val: 6.0 },
      { key: 'V_FF', label: 'Far-Field Volume (m³)', defaultType: 'constant', val: 94.0 },
      { key: 'tStop', label: 'Duration (min)', defaultType: 'constant', val: 120 }
    ];
  } else if (model === 'WMR_EDG') {
    paramList = [
      { key: 'M0', label: 'Initial Spill Mass (mg)', defaultType: 'triangular', val: 50000, min: 30000, mode: 50000, max: 80000 },
      { key: 'alpha', label: 'Decay Rate α (min⁻¹)', defaultType: 'uniform', val: 0.03, min: 0.015, max: 0.045 },
      { key: 'Q', label: 'Room Ventilation Q (m³/min)', defaultType: 'lognormal', val: 10, geoMean: 10, geoStdDev: 1.3 },
      { key: 'V', label: 'Room Volume V (m³)', defaultType: 'constant', val: 100 }
    ];
  }

  paramList.forEach(p => {
    const card = document.createElement('div');
    card.style.cssText = 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 10px;';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
        <span style="font-weight: 600; font-size: 12px;">${p.label}</span>
        <select class="form-select mc-dist-type" data-key="${p.key}" style="width: auto; padding: 2px 6px; font-size: 11px;">
          <option value="constant" ${p.defaultType === 'constant' ? 'selected' : ''}>Constant</option>
          <option value="normal" ${p.defaultType === 'normal' ? 'selected' : ''}>Normal (μ, σ)</option>
          <option value="lognormal" ${p.defaultType === 'lognormal' ? 'selected' : ''}>Lognormal (GM, GSD)</option>
          <option value="uniform" ${p.defaultType === 'uniform' ? 'selected' : ''}>Uniform (Min, Max)</option>
          <option value="triangular" ${p.defaultType === 'triangular' ? 'selected' : ''}>Triangular</option>
        </select>
      </div>
      <div class="mc-inputs-container" id="mc-in-${p.key}"></div>
    `;
    container.appendChild(card);

    const distSelect = card.querySelector('.mc-dist-type');
    distSelect.addEventListener('change', () => renderDistInputs(p.key, distSelect.value, p));
    renderDistInputs(p.key, p.defaultType, p);
  });
}

function renderDistInputs(key, type, defaults) {
  const cont = document.getElementById(`mc-in-${key}`);
  if (!cont) return;

  if (type === 'constant') {
    cont.innerHTML = `<input type="number" class="form-input mc-val" data-prop="val" value="${defaults.val || 10}" step="any">`;
  } else if (type === 'normal') {
    cont.innerHTML = `
      <div class="input-row">
        <input type="number" class="form-input mc-val" data-prop="mean" placeholder="Mean (μ)" value="${defaults.mean || defaults.val}" step="any">
        <input type="number" class="form-input mc-val" data-prop="stdDev" placeholder="Std Dev (σ)" value="${defaults.stdDev || 1}" step="any">
      </div>`;
  } else if (type === 'lognormal') {
    cont.innerHTML = `
      <div class="input-row">
        <input type="number" class="form-input mc-val" data-prop="geoMean" placeholder="Geo Mean (GM)" value="${defaults.geoMean || defaults.val}" step="any">
        <input type="number" class="form-input mc-val" data-prop="geoStdDev" placeholder="Geo Std Dev (GSD)" value="${defaults.geoStdDev || 1.3}" step="0.05">
      </div>`;
  } else if (type === 'uniform') {
    cont.innerHTML = `
      <div class="input-row">
        <input type="number" class="form-input mc-val" data-prop="min" placeholder="Min" value="${defaults.min || (defaults.val * 0.8).toFixed(1)}" step="any">
        <input type="number" class="form-input mc-val" data-prop="max" placeholder="Max" value="${defaults.max || (defaults.val * 1.2).toFixed(1)}" step="any">
      </div>`;
  } else if (type === 'triangular') {
    cont.innerHTML = `
      <div class="input-row" style="grid-template-columns: 1fr 1fr 1fr;">
        <input type="number" class="form-input mc-val" data-prop="min" placeholder="Min" value="${defaults.min || (defaults.val * 0.7).toFixed(1)}" step="any">
        <input type="number" class="form-input mc-val" data-prop="mode" placeholder="Mode" value="${defaults.mode || defaults.val}" step="any">
        <input type="number" class="form-input mc-val" data-prop="max" placeholder="Max" value="${defaults.max || (defaults.val * 1.4).toFixed(1)}" step="any">
      </div>`;
  }
}

function runMonteCarloCalc() {
  const modelType = document.getElementById('mc-model').value;
  const iterations = Number(document.getElementById('mc-iterations').value) || 2500;
  const chem = state.activeChem;
  const oelPpm = chem.oelTlv || chem.oelPel || 50;
  const oelMgM3 = Units.ppmToMgM3(oelPpm, chem.mw);

  // Harvest parameter definitions
  const paramDefs = {};
  const distSelects = document.querySelectorAll('.mc-dist-type');
  distSelects.forEach(sel => {
    const key = sel.getAttribute('data-key');
    const type = sel.value;
    const def = { type };
    const inputs = document.querySelectorAll(`#mc-in-${key} .mc-val`);
    inputs.forEach(inp => {
      const prop = inp.getAttribute('data-prop');
      def[prop] = Number(inp.value) || 0;
    });
    paramDefs[key] = def;
  });

  const res = MonteCarloEngine.runSimulation(modelType, paramDefs, iterations, oelMgM3);
  if (!res) return;

  // Render Metric Badges
  document.getElementById('mc-res-p50').textContent = `${res.p50.toFixed(2)}`;
  document.getElementById('mc-res-p95').textContent = `${res.p95.toFixed(2)}`;
  document.getElementById('mc-res-exceed').textContent = `${res.exceedancePct.toFixed(1)}%`;
  document.getElementById('mc-res-gm').textContent = `${res.geoMean.toFixed(2)}`;
  document.getElementById('mc-res-gsd').textContent = `GSD: ${res.geoStdDev.toFixed(2)}`;

  // AIHA Verdict
  const verdict = res.aihaVerdict;
  const verdictBox = document.getElementById('mc-verdict');
  verdictBox.className = `verdict-box ${getVerdictClass(verdict.category)}`;
  document.getElementById('mc-verdict-title').textContent = `AIHA Rating: ${verdict.category} - ${verdict.description}`;
  document.getElementById('mc-verdict-sub').textContent = `95th Percentile is ${res.p95.toFixed(1)} mg/m³ (${verdict.ratio ? (verdict.ratio * 100).toFixed(0) : 0}% of OEL)`;

  // Render Histogram
  state.charts.mc.render({
    type: 'histogram',
    min: res.min,
    max: res.max,
    iterations: res.iterations,
    oel: oelMgM3,
    histogram: res.histogram
  });

  // Render Percentile Table
  const tbody = document.getElementById('mc-table-body');
  tbody.innerHTML = '';

  const stats = [
    { name: '5th Percentile (P5)', val: res.p5 },
    { name: '10th Percentile (P10)', val: res.p10 },
    { name: '25th Percentile (P25)', val: res.p25 },
    { name: '50th Percentile (Median)', val: res.p50 },
    { name: '75th Percentile (P75)', val: res.p75 },
    { name: '90th Percentile (P90)', val: res.p90 },
    { name: '95th Percentile (P95)', val: res.p95 },
    { name: '99th Percentile (P99)', val: res.p99 },
    { name: 'Arithmetic Mean', val: res.mean },
    { name: 'Standard Deviation', val: res.stdDev }
  ];

  stats.forEach(s => {
    const sPpm = Units.mgM3ToPpm(s.val, chem.mw);
    const pctOel = oelMgM3 > 0 ? (s.val / oelMgM3) * 100 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.name}</strong></td>
      <td>${s.val.toFixed(2)}</td>
      <td>${sPpm.toFixed(2)}</td>
      <td style="font-weight: 600; color: ${pctOel > 100 ? '#dc2626' : (pctOel > 50 ? '#d97706' : '#059669')}">${pctOel.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ----------------------------------------------------
   TAB 6: Chemical Guide (ACGIH 2025 TLVs & NIOSH NPG)
---------------------------------------------------- */
function initChemicalTableAndUnits() {
  const tbody = document.getElementById('chem-table-body');
  const searchInput = document.getElementById('chem-search-input');
  let currentFilter = 'all';

  state.inspectedChem = state.activeChem;
  renderChemicalDetails(state.inspectedChem);

  function matchesFilter(c, filterType) {
    if (filterType === 'all') return true;
    if (filterType === 'carc') {
      const notat = c.acgihNotations || '';
      return notat.includes('A1') || notat.includes('A2') || c.nioshCa;
    }
    if (filterType === 'oto') {
      return (c.acgihNotations || '').includes('OTO');
    }
    if (filterType === 'skin') {
      return (c.acgihNotations || '').includes('Skin');
    }
    if (filterType === 'bei') {
      return !!c.acgihBei;
    }
    return true;
  }

  function renderTable(searchTerm = '') {
    tbody.innerHTML = '';
    const q = searchTerm.toLowerCase().trim();
    const filtered = CHEMICAL_DATABASE.filter(c => {
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        c.cas.toLowerCase().includes(q) ||
        (c.synonyms && c.synonyms.toLowerCase().includes(q));
      return matchSearch && matchesFilter(c, currentFilter);
    });

    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align: center; color: #9ca3af; padding: 20px;">No chemicals match criteria</td>`;
      tbody.appendChild(tr);
      return;
    }

    filtered.forEach(c => {
      const isSelected = state.inspectedChem && state.inspectedChem.cas === c.cas;
      const tr = document.createElement('tr');
      if (isSelected) tr.classList.add('selected-chem-row');
      tr.style.cursor = 'pointer';

      const tlvText = c.acgihTlvTwa != null ? `${c.acgihTlvTwa} ppm` : (c.acgihTlvC != null ? `C ${c.acgihTlvC}` : 'N/A');
      const pelText = c.oshaPelTwa != null ? `${c.oshaPelTwa} ppm` : (c.oshaPelC != null ? `C ${c.oshaPelC}` : 'N/A');

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: #1e3a8a;">${c.name}</div>
          <div style="font-size: 10px; color: #64748b;">${c.synonyms ? c.synonyms.split(',')[0] : ''}</div>
        </td>
        <td><code>${c.cas}</code></td>
        <td>${tlvText}</td>
        <td>${pelText}</td>
        <td>
          <button class="btn btn-outline btn-sm view-chem-btn" style="padding: 2px 8px; font-size: 11px;">View</button>
        </td>
      `;

      tr.addEventListener('click', () => {
        state.inspectedChem = c;
        renderChemicalDetails(c);
        renderTable(searchInput.value);
      });

      tbody.appendChild(tr);
    });
  }

  function renderChemicalDetails(c) {
    if (!c) return;
    document.getElementById('cd-name').textContent = c.name;
    document.getElementById('cd-synonyms').textContent = c.synonyms ? `Synonyms: ${c.synonyms}` : '';
    document.getElementById('cd-cas').textContent = c.cas;
    document.getElementById('cd-mw').textContent = c.mw;
    document.getElementById('cd-vp').textContent = c.vp20 != null ? c.vp20 : 'N/A';
    document.getElementById('cd-bp').textContent = c.bp || 'N/A';
    document.getElementById('cd-density').textContent = c.density != null ? c.density : 'N/A';
    document.getElementById('cd-flam').textContent = (c.lel && c.uel) ? `${c.lel}% - ${c.uel}%` : 'N/A';

    // Exposure limits
    const tlvParts = [];
    if (c.acgihTlvTwa != null) tlvParts.push(`TWA: ${c.acgihTlvTwa} ppm`);
    if (c.acgihTlvStel != null) tlvParts.push(`STEL: ${c.acgihTlvStel} ppm`);
    if (c.acgihTlvC != null) tlvParts.push(`Ceiling: ${c.acgihTlvC} ppm`);
    document.getElementById('cd-tlv').textContent = tlvParts.length ? tlvParts.join(', ') : 'Not established';

    document.getElementById('cd-notations').textContent = c.acgihNotations || 'None';
    document.getElementById('cd-tlv-basis').textContent = c.acgihTlvBasis || 'N/A';
    document.getElementById('cd-bei').textContent = c.acgihBei || 'None established';

    const relParts = [];
    if (c.nioshRelTwa != null) relParts.push(`TWA: ${c.nioshRelTwa} ppm`);
    if (c.nioshRelStel != null) relParts.push(`STEL: ${c.nioshRelStel} ppm`);
    if (c.nioshRelC != null) relParts.push(`Ceiling: ${c.nioshRelC} ppm`);
    if (c.nioshCa) relParts.push(`[Ca - Carcinogen]`);
    document.getElementById('cd-rel').textContent = relParts.length ? relParts.join(', ') : 'Not established';

    const pelParts = [];
    if (c.oshaPelTwa != null) pelParts.push(`TWA: ${c.oshaPelTwa} ppm`);
    if (c.oshaPelStel != null) pelParts.push(`STEL: ${c.oshaPelStel} ppm`);
    if (c.oshaPelC != null) pelParts.push(`Ceiling: ${c.oshaPelC} ppm`);
    document.getElementById('cd-pel').textContent = pelParts.length ? pelParts.join(', ') : 'Not established';

    document.getElementById('cd-idlh').textContent = c.idlh || 'N.D.';

    // Health effects
    document.getElementById('cd-routes').textContent = c.routes || 'Inhalation, Skin contact';
    document.getElementById('cd-symptoms').textContent = c.symptoms || 'See MSDS / Safety Data Sheet';
    document.getElementById('cd-organs').textContent = c.targetOrgans || 'Respiratory system, eyes, skin';
    document.getElementById('cd-respirator').textContent = c.respirator || 'NIOSH approved respirator based on air concentration';
    document.getElementById('cd-firstaid').textContent = c.firstAid || 'Eye: Flush immediately; Skin: Wash thoroughly; Inhalation: Fresh air, respiratory support.';
  }

  // Model this chemical button
  document.getElementById('btn-load-into-models').addEventListener('click', () => {
    if (state.inspectedChem) {
      setActiveChemical(state.inspectedChem);
      document.querySelector('.tab-btn[data-tab="tab-wmr"]').click();
    }
  });

  // Filter chips setup
  const chips = [
    { id: 'filter-all', type: 'all' },
    { id: 'filter-carc', type: 'carc' },
    { id: 'filter-oto', type: 'oto' },
    { id: 'filter-skin', type: 'skin' },
    { id: 'filter-bei', type: 'bei' }
  ];

  chips.forEach(chip => {
    const el = document.getElementById(chip.id);
    if (!el) return;
    el.addEventListener('click', () => {
      chips.forEach(c => {
        const btn = document.getElementById(c.id);
        if (btn) btn.classList.remove('active-filter-chip');
      });
      el.classList.add('active-filter-chip');
      currentFilter = chip.type;
      renderTable(searchInput.value);
    });
  });

  renderTable();
  searchInput.addEventListener('input', (e) => renderTable(e.target.value));

  // Unit Converters
  const cVal = document.getElementById('unit-c-val');
  const cDir = document.getElementById('unit-c-dir');
  function updateCConv() {
    const v = Number(cVal.value) || 0;
    const chem = state.inspectedChem || state.activeChem;
    if (cDir.value === 'ppm2mg') {
      const mg = Units.ppmToMgM3(v, chem.mw);
      document.getElementById('unit-c-result').textContent = `${v} ppm = ${mg.toFixed(2)} mg/m³ (${chem.name})`;
    } else {
      const ppm = Units.mgM3ToPpm(v, chem.mw);
      document.getElementById('unit-c-result').textContent = `${v} mg/m³ = ${ppm.toFixed(2)} ppm (${chem.name})`;
    }
  }
  cVal.addEventListener('input', updateCConv);
  cDir.addEventListener('change', updateCConv);
  updateCConv();

  const cfmVal = document.getElementById('unit-cfm-val');
  const cfmDir = document.getElementById('unit-cfm-dir');
  function updateCfmConv() {
    const v = Number(cfmVal.value) || 0;
    if (cfmDir.value === 'cfm2m3') {
      const m3 = Units.cfmToM3Min(v);
      document.getElementById('unit-cfm-result').textContent = `${v} CFM = ${m3.toFixed(2)} m³/min`;
    } else {
      const cfm = Units.m3MinToCfm(v);
      document.getElementById('unit-cfm-result').textContent = `${v} m³/min = ${cfm.toFixed(1)} CFM`;
    }
  }
  cfmVal.addEventListener('input', updateCfmConv);
  cfmDir.addEventListener('change', updateCfmConv);
  updateCfmConv();
}

/* ----------------------------------------------------
   TAB 7: ACGIH Guidelines, Mixture & Work Shifts
---------------------------------------------------- */
function initAcgihGuidelinesAndShifts() {
  // Mixture rows container
  const mixContainer = document.getElementById('mixture-rows-container');
  const btnAddMix = document.getElementById('btn-add-mix-row');
  const btnCalcMix = document.getElementById('btn-calc-mixture');
  const mixResultBox = document.getElementById('mix-result-box');

  const defaultMixture = [
    { name: "Toluene", conc: 6, limit: 20 },
    { name: "Methyl ethyl ketone (MEK)", conc: 35, limit: 75 },
    { name: "Xylene (mixed isomers)", conc: 4, limit: 20 }
  ];

  function renderMixtureRow(item = { name: '', conc: 10, limit: 50 }) {
    const row = document.createElement('div');
    row.className = 'mix-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center;';
    row.innerHTML = `
      <input type="text" class="form-input mix-name" placeholder="Substance name" value="${item.name}">
      <input type="number" class="form-input mix-conc" placeholder="Conc (Ci)" value="${item.conc}" min="0" step="0.1">
      <input type="number" class="form-input mix-limit" placeholder="TLV (Ti)" value="${item.limit}" min="0.001" step="0.1">
      <button class="btn btn-outline btn-sm mix-remove" style="color: #ef4444; padding: 4px 8px;">✕</button>
    `;
    row.querySelector('.mix-remove').addEventListener('click', () => {
      row.remove();
    });
    mixContainer.appendChild(row);
  }

  defaultMixture.forEach(m => renderMixtureRow(m));

  btnAddMix.addEventListener('click', () => {
    renderMixtureRow({ name: '', conc: 5, limit: 50 });
  });

  btnCalcMix.addEventListener('click', () => {
    const rows = mixContainer.querySelectorAll('.mix-row');
    const components = [];
    rows.forEach(r => {
      const name = r.querySelector('.mix-name').value.trim() || 'Component';
      const conc = Number(r.querySelector('.mix-conc').value) || 0;
      const limit = Number(r.querySelector('.mix-limit').value) || 1;
      components.push({ name, conc, limit });
    });

    const res = AcgihGuidelines.calcAdditiveMixture(components);
    mixResultBox.style.display = 'block';

    if (res.exceeded) {
      mixResultBox.style.background = '#fef2f2';
      mixResultBox.style.border = '1px solid #f87171';
      mixResultBox.innerHTML = `
        <div style="font-weight: 700; color: #b91c1c; font-size: 14px;">⚠️ Mixture Index: ${res.index.toFixed(2)} &gt; 1.0 (THRESHOLD EXCEEDED)</div>
        <div style="font-size: 12px; color: #7f1d1d; margin-top: 4px;">
          The combined additive exposure exceeds the permissible mixture threshold. Engineering controls or respiratory protection required.
        </div>
      `;
    } else {
      mixResultBox.style.background = '#ecfdf5';
      mixResultBox.style.border = '1px solid #34d399';
      mixResultBox.innerHTML = `
        <div style="font-weight: 700; color: #047857; font-size: 14px;">✅ Mixture Index: ${res.index.toFixed(2)} ≤ 1.0 (COMPLIANT)</div>
        <div style="font-size: 12px; color: #065f46; margin-top: 4px;">
          The additive mixture exposure is within acceptable health protection limits.
        </div>
      `;
    }
  });

  // Extended Work Shifts (Brief & Scala)
  const btnCalcShift = document.getElementById('btn-calc-shift');
  const shiftResultBox = document.getElementById('shift-result-box');

  btnCalcShift.addEventListener('click', () => {
    const dailyHrs = Number(document.getElementById('shift-daily-hrs').value) || 8;
    const weeklyHrs = Number(document.getElementById('shift-weekly-hrs').value) || 40;
    const baseTlv = Number(document.getElementById('shift-base-tlv').value) || 50;

    const res = AcgihGuidelines.calcBriefScalaSchedules(baseTlv, dailyHrs, weeklyHrs);
    shiftResultBox.style.display = 'block';
    shiftResultBox.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: #1e3a8a; margin-bottom: 6px;">
        Brief &amp; Scala Adjusted Exposure Limit:
      </div>
      <div style="font-size: 20px; font-weight: 800; color: #1e40af; margin-bottom: 8px;">
        ${res.adjustedOel.toFixed(2)} <span style="font-size: 13px; font-weight: 400; color: #64748b;">(Baseline: ${baseTlv})</span>
      </div>
      <table class="data-table" style="font-size: 11px;">
        <tr><td>Daily Shift:</td><td>${res.dailyHours} hrs/day</td><td>Daily Factor F_d:</td><td><strong>${res.dailyFactor.toFixed(3)}</strong></td></tr>
        <tr><td>Weekly Schedule:</td><td>${res.weeklyHours} hrs/wk</td><td>Weekly Factor F_w:</td><td><strong>${res.weeklyFactor.toFixed(3)}</strong></td></tr>
        <tr><td colspan="2">Applied Reduction Factor:</td><td colspan="2"><strong>${res.appliedFactor.toFixed(3)}</strong></td></tr>
      </table>
    `;
  });

  // Hydrocarbon RCP Container
  const rcpContainer = document.getElementById('rcp-fractions-container');
  const btnAddRcp = document.getElementById('btn-add-rcp-row');
  const btnCalcRcp = document.getElementById('btn-calc-rcp');
  const rcpResultBox = document.getElementById('rcp-result-box');

  const defaultRcp = [
    { name: "C9-C11 Aliphatics", frac: 0.60, ggv: 1200 },
    { name: "C9-C10 Aromatics", frac: 0.40, ggv: 100 }
  ];

  function renderRcpRow(item = { name: '', frac: 0.5, ggv: 600 }) {
    const row = document.createElement('div');
    row.className = 'rcp-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; margin-bottom: 8px; align-items: center;';
    row.innerHTML = `
      <input type="text" class="form-input rcp-name" placeholder="Fraction description" value="${item.name}">
      <input type="number" class="form-input rcp-frac" placeholder="Mass Fraction Fi (0-1)" value="${item.frac}" min="0" max="1" step="0.05">
      <input type="number" class="form-input rcp-ggv" placeholder="GGVi (mg/m³)" value="${item.ggv}" min="1" step="25">
      <button class="btn btn-outline btn-sm rcp-remove" style="color: #ef4444; padding: 4px 8px;">✕</button>
    `;
    row.querySelector('.rcp-remove').addEventListener('click', () => row.remove());
    rcpContainer.appendChild(row);
  }

  defaultRcp.forEach(r => renderRcpRow(r));
  btnAddRcp.addEventListener('click', () => renderRcpRow({ name: '', frac: 0.2, ggv: 600 }));

  btnCalcRcp.addEventListener('click', () => {
    const rows = rcpContainer.querySelectorAll('.rcp-row');
    const fractions = [];
    rows.forEach(r => {
      const fraction = Number(r.querySelector('.rcp-frac').value) || 0;
      const ggv = Number(r.querySelector('.rcp-ggv').value) || 1;
      fractions.push({ fraction, ggv });
    });

    const res = AcgihGuidelines.calcHydrocarbonRcp(fractions);
    rcpResultBox.style.display = 'block';
    rcpResultBox.innerHTML = `
      <div style="font-size: 13px; font-weight: 700; color: #1e3a8a; margin-bottom: 6px;">
        Mixture Group Guidance Value (GGV_mixture):
      </div>
      <div style="font-size: 22px; font-weight: 800; color: #059669; margin-bottom: 6px;">
        ${res.ggvRounded} mg/m³ <span style="font-size: 13px; font-weight: 400; color: #64748b;">(Exact: ${res.ggvRaw.toFixed(1)} mg/m³)</span>
      </div>
      <div style="font-size: 11px; color: #64748b;">
        Total Liquid Mass Fraction Accounted For: <strong>${(res.totalFraction * 100).toFixed(1)}%</strong>.
        Rounded per ACGIH Appendix H guidance criteria.
      </div>
    `;
  });
}

/* ----------------------------------------------------
   TAB 7: Executive Report & Scenario Exports
---------------------------------------------------- */
function initExportAndReport() {
  document.getElementById('btn-quick-report').addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="tab-report"]').click();
  });

  document.getElementById('btn-export-csv').addEventListener('click', exportCsv);
  document.getElementById('btn-save-scenario').addEventListener('click', saveScenario);

  const loadBtn = document.getElementById('btn-load-scenario');
  const fileIn = document.getElementById('scenario-file-input');
  loadBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', loadScenario);
}

function updateExecutiveReport() {
  const chem = state.activeChem;
  document.getElementById('rep-chem-name').textContent = chem.name;
  document.getElementById('rep-chem-cas').textContent = chem.cas;
  document.getElementById('rep-chem-mw').textContent = `${chem.mw} g/mol`;
  document.getElementById('rep-chem-vp').textContent = `${chem.vp20} mmHg`;
  document.getElementById('rep-chem-pel').textContent = chem.oelPel ? `${chem.oelPel} ppm` : 'None established';
  document.getElementById('rep-chem-tlv').textContent = chem.oelTlv ? `${chem.oelTlv} ppm` : 'None established';

  const last = state.lastSimulation;
  if (!last || !last.result) return;

  document.getElementById('rep-model-name').textContent = last.model;
  document.getElementById('rep-param-g').textContent = document.getElementById('wmr-G') ? `${document.getElementById('wmr-G').value} mg/min` : 'N/A';
  document.getElementById('rep-param-v').textContent = `${last.params.V || 100} m³`;
  document.getElementById('rep-param-q').textContent = `${(last.params.Q || 10).toFixed(1)} m³/min`;
  document.getElementById('rep-param-tstop').textContent = document.getElementById('wmr-tStop') ? `${document.getElementById('wmr-tStop').value} min` : 'N/A';
  document.getElementById('rep-param-ttotal').textContent = `${last.params.tTotal || 480} min`;

  const twa8 = last.result.twa8 || last.result.twa8NF || 0;
  const stel = last.result.stel || last.result.stelNF || 0;
  const cmax = last.result.cMax || last.result.cMaxNF || 0;

  const twa8Ppm = Units.mgM3ToPpm(twa8, chem.mw);
  const stelPpm = Units.mgM3ToPpm(stel, chem.mw);

  document.getElementById('rep-res-twa8').textContent = `${twa8.toFixed(2)} (${twa8Ppm.toFixed(1)} ppm)`;
  document.getElementById('rep-res-stel').textContent = `${stel.toFixed(2)} (${stelPpm.toFixed(1)} ppm)`;
  document.getElementById('rep-res-cmax').textContent = `${cmax.toFixed(2)} mg/m³`;

  const oelPpm = chem.oelTlv || chem.oelPel || 0;
  const verdict = ExposureMetrics.classifyAihaCategory(twa8Ppm, oelPpm);
  const vBox = document.getElementById('rep-verdict');
  vBox.className = `verdict-box ${getVerdictClass(verdict.category)}`;
  document.getElementById('rep-verdict-title').textContent = `Verdict: ${verdict.category} (${verdict.description})`;
  document.getElementById('rep-verdict-ratio').textContent = verdict.ratio ? `Shift Exposure is ${(verdict.ratio * 100).toFixed(0)}% of OEL` : '';

  // Recommendations based on AIHA Exposure Category
  const recEl = document.getElementById('rep-recommendations');
  if (verdict.category === 'Category 1') {
    recEl.innerHTML = `
      <p><strong>Status: Controlled.</strong> Exposures are well controlled below 10% of the occupational exposure limit (${oelPpm} ppm).</p>
      <p style="margin-top:6px;"><strong>Action:</strong> Maintain existing ventilation controls and operating procedures. Periodic routine reassessment is recommended upon process change.</p>
    `;
  } else if (verdict.category === 'Category 2') {
    recEl.innerHTML = `
      <p><strong>Status: Acceptable Control.</strong> Exposure is between 10% and 50% of the OEL.</p>
      <p style="margin-top:6px;"><strong>Action:</strong> Implement routine worker training, hazard communication, and standard operating procedures. Monitor for ventilation filter degradation.</p>
    `;
  } else if (verdict.category === 'Category 3') {
    recEl.innerHTML = `
      <p><strong>Status: Action Level Exceeded.</strong> Exposure is between 50% and 100% of the OEL (${oelPpm} ppm).</p>
      <p style="margin-top:6px;"><strong>Action:</strong> Implement exposure surveillance program and industrial hygiene air sampling. Evaluate local exhaust ventilation (LEV) at contaminant source to reduce worker exposure into Near-Field.</p>
    `;
  } else {
    recEl.innerHTML = `
      <p style="color: #b91c1c;"><strong>WARNING: Uncontrolled Exposure (&gt; 100% OEL).</strong></p>
      <p style="margin-top:6px;"><strong>Action Required:</strong> Immediate engineering controls are required following the Hierarchy of Controls:</p>
      <ul style="margin-left: 20px; margin-top: 6px;">
        <li>1. Substitution / Elimination of chemical where feasible.</li>
        <li>2. Install Local Exhaust Ventilation (LEV) capture hood at source.</li>
        <li>3. Increase general room ventilation rate (Q) or air changes per hour (ACH).</li>
        <li>4. Mandate appropriate NIOSH-certified chemical cartridge respirators as an interim measure.</li>
      </ul>
    `;
  }
}

function exportCsv() {
  if (!state.lastSimulation || !state.lastSimulation.result) {
    alert('Please run a simulation before exporting CSV.');
    return;
  }
  const chem = state.activeChem;
  const res = state.lastSimulation.result;
  let csv = 'Time (min),Concentration (mg/m3),Concentration (ppm)\n';

  if (res.concsNF) {
    csv = 'Time (min),Near Field (mg/m3),Far Field (mg/m3),Near Field (ppm),Far Field (ppm)\n';
    for (let i = 0; i < res.times.length; i++) {
      const nfPpm = Units.mgM3ToPpm(res.concsNF[i], chem.mw);
      const ffPpm = Units.mgM3ToPpm(res.concsFF[i], chem.mw);
      csv += `${res.times[i].toFixed(2)},${res.concsNF[i].toFixed(4)},${res.concsFF[i].toFixed(4)},${nfPpm.toFixed(4)},${ffPpm.toFixed(4)}\n`;
    }
  } else if (res.concs) {
    for (let i = 0; i < res.times.length; i++) {
      const ppm = Units.mgM3ToPpm(res.concs[i], chem.mw);
      csv += `${res.times[i].toFixed(2)},${res.concs[i].toFixed(4)},${ppm.toFixed(4)}\n`;
    }
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Exposure_Assessment_${chem.name.replace(/\s+/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function saveScenario() {
  const scenario = {
    app: 'Occupational Exposure Modeller',
    version: '2.0',
    date: new Date().toISOString(),
    chemical: state.activeChem,
    inputs: {
      wmr: {
        subtype: document.getElementById('wmr-subtype').value,
        G: document.getElementById('wmr-G').value,
        tStop: document.getElementById('wmr-tStop').value,
        V: document.getElementById('wmr-V').value,
        Q: document.getElementById('wmr-Q').value,
        C0: document.getElementById('wmr-C0').value,
        tTotal: document.getElementById('wmr-tTotal').value
      },
      twozone: {
        mode: document.getElementById('tz-mode').value,
        G: document.getElementById('tz-G').value,
        tStop: document.getElementById('tz-tStop').value,
        V_NF: document.getElementById('tz-V_NF').value,
        V_FF: document.getElementById('tz-V_FF').value,
        beta: document.getElementById('tz-beta').value,
        Q: document.getElementById('tz-Q').value
      }
    }
  };

  const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Scenario_${state.activeChem.name.replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadScenario(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.chemical) setActiveChemical(data.chemical);
      if (data.inputs && data.inputs.wmr) {
        document.getElementById('wmr-subtype').value = data.inputs.wmr.subtype || 'CGR';
        document.getElementById('wmr-G').value = data.inputs.wmr.G || 500;
        document.getElementById('wmr-tStop').value = data.inputs.wmr.tStop || 60;
        document.getElementById('wmr-V').value = data.inputs.wmr.V || 100;
        document.getElementById('wmr-Q').value = data.inputs.wmr.Q || 10;
        document.getElementById('wmr-C0').value = data.inputs.wmr.C0 || 0;
        document.getElementById('wmr-tTotal').value = data.inputs.wmr.tTotal || 480;
      }
      runWmrCalc();
      alert('Scenario loaded successfully!');
    } catch (err) {
      alert('Failed to parse scenario file: ' + err.message);
    }
  };
  reader.readAsText(file);
}
