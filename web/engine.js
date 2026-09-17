/**
 * Occupational Exposure Modeller (IHMOD Conversion) - Core Mathematical Engine
 * Implements AIHA IHMOD 2.0 equations, deterministic models, Monte Carlo simulations,
 * chemical physical properties, and exposure assessment metrics.
 */

// Universal Gas Constant
const R_IDEAL = 8.314462618; // J / (mol * K) = Pa * m^3 / (mol * K)
const R_L_ATM = 0.082057338; // L * atm / (mol * K)
const R_L_MMHG = 62.36367;   // L * mmHg / (mol * K)
const MOLAR_VOL_STP = 24.45; // L/mol at 25°C, 1 atm

import { COMPREHENSIVE_CHEMICAL_DATABASE, ACGIH_PHYSICAL_AGENTS } from './chemicalDatabase.js';

export { ACGIH_PHYSICAL_AGENTS };

/**
 * Normalized Chemical Database
 * Ingests ACGIH 2025 TLVs/BEIs and NIOSH Pocket Guide data with backward-compatible aliases.
 */
export const CHEMICAL_DATABASE = COMPREHENSIVE_CHEMICAL_DATABASE.map(c => ({
  ...c,
  oelTlv: c.acgihTlvTwa ?? c.acgihTlvC ?? c.oshaPelTwa ?? 0,
  oelPel: c.oshaPelTwa ?? c.oshaPelC ?? 0,
  oelStel: c.acgihTlvStel ?? c.oshaPelStel ?? c.nioshRelStel ?? null,
  oelRel: c.nioshRelTwa ?? c.nioshRelC ?? 0
}));


/**
 * Unit Conversion Utilities
 */
export const Units = {
  // Concentration: mg/m3 -> ppm at T (C) and P (mmHg or atm)
  mgM3ToPpm: (mgM3, mw, tempC = 25, pressMmHg = 760) => {
    if (!mw || mw <= 0) return 0;
    const tempK = tempC + 273.15;
    const molarVolume = MOLAR_VOL_STP * (tempK / 298.15) * (760 / pressMmHg);
    return (mgM3 * molarVolume) / mw;
  },

  // Concentration: ppm -> mg/m3 at T (C) and P (mmHg or atm)
  ppmToMgM3: (ppm, mw, tempC = 25, pressMmHg = 760) => {
    if (!mw || mw <= 0) return 0;
    const tempK = tempC + 273.15;
    const molarVolume = MOLAR_VOL_STP * (tempK / 298.15) * (760 / pressMmHg);
    return (ppm * mw) / molarVolume;
  },

  // Ventilation: ACH to m3/min
  achToM3Min: (ach, roomVolumeM3) => {
    return (ach * roomVolumeM3) / 60;
  },

  // Ventilation: m3/min to ACH
  m3MinToAch: (qM3Min, roomVolumeM3) => {
    if (!roomVolumeM3 || roomVolumeM3 <= 0) return 0;
    return (qM3Min * 60) / roomVolumeM3;
  },

  // CFM to m3/min
  cfmToM3Min: (cfm) => cfm * 0.028316846592,

  // m3/min to CFM
  m3MinToCfm: (m3Min) => m3Min * 35.3146667,

  // Temperature conversions
  cToK: (c) => c + 273.15,
  fToC: (f) => ((f - 32) * 5) / 9,
  cToF: (c) => (c * 9) / 5 + 32,

  // Generation rate: g/sec to mg/min
  gSecToMgMin: (gSec) => gSec * 60000,
  mgMinToGSec: (mgMin) => mgMin / 60000,

  // Generation rate: lb/hr to mg/min
  lbHrToMgMin: (lbHr) => (lbHr * 453592.37) / 60,

  // Length: ft to m
  ftToM: (ft) => ft * 0.3048,
  mToFt: (m) => m / 0.3048,

  // Volume: ft3 to m3
  ft3ToM3: (ft3) => ft3 * 0.028316846592,
  m3ToFt3: (m3) => m3 / 0.028316846592
};

/**
 * Exposure Metrics Calculator
 */
export const ExposureMetrics = {
  // 8-hour Time Weighted Average (mg/m3 or ppm)
  calcTwa8: (times, concentrations, shiftMinutes = 480) => {
    if (!times || times.length < 2) return 0;
    let integral = 0;
    for (let i = 0; i < times.length - 1; i++) {
      const dt = times[i + 1] - times[i];
      const avgC = (concentrations[i] + concentrations[i + 1]) / 2;
      integral += avgC * dt;
    }
    return integral / shiftMinutes;
  },

  // Task duration TWA (over total simulated task time)
  calcTaskTwa: (times, concentrations) => {
    if (!times || times.length < 2) return 0;
    let integral = 0;
    const totalT = times[times.length - 1] - times[0];
    if (totalT <= 0) return 0;
    for (let i = 0; i < times.length - 1; i++) {
      const dt = times[i + 1] - times[i];
      const avgC = (concentrations[i] + concentrations[i + 1]) / 2;
      integral += avgC * dt;
    }
    return integral / totalT;
  },

  // Rolling 15-minute STEL maximum
  calcStel: (times, concentrations, windowMinutes = 15) => {
    if (!times || times.length < 2) return 0;
    let maxStel = 0;
    for (let i = 0; i < times.length; i++) {
      const tStart = times[i];
      const tEnd = tStart + windowMinutes;
      let integral = 0;
      let actualSpan = 0;
      for (let j = i; j < times.length - 1 && times[j] < tEnd; j++) {
        const segStart = times[j];
        const segEnd = Math.min(times[j + 1], tEnd);
        const dt = segEnd - segStart;
        if (dt > 0) {
          const cStart = concentrations[j] + (concentrations[j + 1] - concentrations[j]) * ((segStart - times[j]) / (times[j + 1] - times[j]));
          const cEnd = concentrations[j] + (concentrations[j + 1] - concentrations[j]) * ((segEnd - times[j]) / (times[j + 1] - times[j]));
          integral += ((cStart + cEnd) / 2) * dt;
          actualSpan += dt;
        }
      }
      if (actualSpan > 0) {
        const currentStel = integral / windowMinutes;
        if (currentStel > maxStel) maxStel = currentStel;
      }
    }
    return maxStel;
  },

  // AIHA Exposure Category (1 to 4) based on exposure vs OEL
  classifyAihaCategory: (exposureValue, oel) => {
    if (!oel || oel <= 0) return { category: "N/A", description: "OEL Not Defined", color: "#6b7280" };
    const ratio = exposureValue / oel;
    if (ratio < 0.10) {
      return { category: "Category 1", description: "< 10% OEL (Well Controlled)", color: "#10b981", ratio };
    } else if (ratio < 0.50) {
      return { category: "Category 2", description: "10% - 50% OEL (Controlled)", color: "#3b82f6", ratio };
    } else if (ratio <= 1.0) {
      return { category: "Category 3", description: "50% - 100% OEL (Action Level / Monitor)", color: "#f59e0b", ratio };
    } else {
      return { category: "Category 4", description: "> 100% OEL (Uncontrolled / Exceeds OEL)", color: "#ef4444", ratio };
    }
  }
};

/**
 * 1. Single-Zone Well-Mixed Room (WMR) Models
 */
export const WellMixedRoom = {
  runCGR: (params) => {
    const {
      G,          // mg/min
      Q,          // m3/min
      V,          // m3
      C0 = 0,     // mg/m3
      tStop = 60, // min (duration of emission)
      tTotal = 480,// min (total evaluation time)
      points = 200
    } = params;

    const qOverV = Q / V;
    const Css = Q > 0 ? G / Q : Infinity;
    const times = [];
    const concs = [];
    const dt = tTotal / points;

    let cAtStop = 0;
    if (tStop <= 0) {
      cAtStop = C0;
    } else {
      cAtStop = (G / Q) * (1 - Math.exp(-qOverV * tStop)) + C0 * Math.exp(-qOverV * tStop);
    }

    for (let i = 0; i <= points; i++) {
      const t = i * dt;
      times.push(t);
      let c = 0;
      if (t <= tStop) {
        c = (G / Q) * (1 - Math.exp(-qOverV * t)) + C0 * Math.exp(-qOverV * t);
      } else {
        c = cAtStop * Math.exp(-qOverV * (t - tStop));
      }
      concs.push(Math.max(0, c));
    }

    const cMax = Math.max(...concs);
    const twa8 = ExposureMetrics.calcTwa8(times, concs);
    const taskTwa = ExposureMetrics.calcTaskTwa(times, concs);
    const stel = ExposureMetrics.calcStel(times, concs);

    return {
      times,
      concs,
      cMax,
      cSteadyState: Css,
      twa8,
      taskTwa,
      stel
    };
  },

  runEDG: (params) => {
    const {
      M0,         // Initial mass (mg)
      alpha,      // Evaporation rate constant (min^-1)
      Q,          // m3/min
      V,          // m3
      C0 = 0,     // mg/m3
      tTotal = 480,// min
      points = 200
    } = params;

    const qOverV = Q / V;
    const times = [];
    const concs = [];
    const dt = tTotal / points;

    let tPeak = 0;
    if (Math.abs(alpha - qOverV) > 1e-6) {
      tPeak = (Math.log(alpha) - Math.log(qOverV)) / (alpha - qOverV);
    } else {
      tPeak = 1 / alpha;
    }
    if (tPeak < 0) tPeak = 0;

    for (let i = 0; i <= points; i++) {
      const t = i * dt;
      times.push(t);
      let c = 0;
      if (Math.abs(alpha - qOverV) > 1e-6) {
        c = (alpha * M0 / (alpha * V - Q)) * (Math.exp(-qOverV * t) - Math.exp(-alpha * t)) + C0 * Math.exp(-qOverV * t);
      } else {
        c = (alpha * M0 / V) * t * Math.exp(-alpha * t) + C0 * Math.exp(-alpha * t);
      }
      concs.push(Math.max(0, c));
    }

    const cMax = Math.max(...concs);
    const twa8 = ExposureMetrics.calcTwa8(times, concs);
    const taskTwa = ExposureMetrics.calcTaskTwa(times, concs);
    const stel = ExposureMetrics.calcStel(times, concs);

    return {
      times,
      concs,
      cMax,
      tPeak,
      twa8,
      taskTwa,
      stel
    };
  },

  runBackpressure: (params) => {
    const {
      G0,         // mg/min initial generation rate
      Csat,       // mg/m3 saturation concentration
      Q,          // m3/min
      V,          // m3
      C0 = 0,
      tStop = 60,
      tTotal = 480,
      points = 200
    } = params;

    const kEff = (Q + G0 / Csat) / V;
    const Css = G0 / (Q + G0 / Csat);
    const times = [];
    const concs = [];
    const dt = tTotal / points;

    let cAtStop = 0;
    if (tStop <= 0) {
      cAtStop = C0;
    } else {
      cAtStop = Css * (1 - Math.exp(-kEff * tStop)) + C0 * Math.exp(-kEff * tStop);
    }

    for (let i = 0; i <= points; i++) {
      const t = i * dt;
      times.push(t);
      let c = 0;
      if (t <= tStop) {
        c = Css * (1 - Math.exp(-kEff * t)) + C0 * Math.exp(-kEff * t);
      } else {
        c = cAtStop * Math.exp(-(Q / V) * (t - tStop));
      }
      concs.push(Math.max(0, c));
    }

    const cMax = Math.max(...concs);
    const twa8 = ExposureMetrics.calcTwa8(times, concs);
    const taskTwa = ExposureMetrics.calcTaskTwa(times, concs);
    const stel = ExposureMetrics.calcStel(times, concs);

    return {
      times,
      concs,
      cMax,
      cSteadyState: Css,
      twa8,
      taskTwa,
      stel
    };
  },

  runPurge: (params) => {
    const {
      C0,         // Initial concentration (mg/m3)
      Q,          // m3/min
      V,          // m3
      tTotal = 120,
      points = 150
    } = params;

    const qOverV = Q / V;
    const halfLife = Math.log(2) / qOverV;
    const t99 = Math.log(100) / qOverV;

    const times = [];
    const concs = [];
    const dt = tTotal / points;

    for (let i = 0; i <= points; i++) {
      const t = i * dt;
      times.push(t);
      concs.push(C0 * Math.exp(-qOverV * t));
    }

    return {
      times,
      concs,
      halfLife,
      t99,
      cMax: C0
    };
  }
};

/**
 * 2. Two-Zone (Near-Field / Far-Field) Models
 */
export const TwoZoneModel = {
  calcBeta: (airSpeedMMin, radiusM = 1.0, geometry = "hemisphere") => {
    let fsa = 2 * Math.PI * radiusM * radiusM;
    if (geometry === "sphere") fsa = 4 * Math.PI * radiusM * radiusM;
    else if (geometry === "box5sided") fsa = 5 * (2 * radiusM) * (2 * radiusM);
    return 0.5 * airSpeedMMin * fsa;
  },

  runTwoZone: (params) => {
    const {
      mode = "CGR", // "CGR" or "EDG"
      G = 100,      // mg/min (for CGR)
      M0 = 50000,   // mg (for EDG)
      alpha = 0.05, // min^-1 (for EDG)
      tStop = 60,   // min
      V_NF = 8,     // m3
      V_FF = 92,    // m3
      beta = 10,    // m3/min
      Q = 15,       // m3/min
      C_NF0 = 0,
      C_FF0 = 0,
      tTotal = 480,
      steps = 400
    } = params;

    const times = [0];
    const concsNF = [C_NF0];
    const concsFF = [C_FF0];

    const dt = tTotal / steps;
    let cNF = C_NF0;
    let cFF = C_FF0;

    const cFF_ss = Q > 0 ? G / Q : Infinity;
    const cNF_ss = beta > 0 && Q > 0 ? G / beta + G / Q : Infinity;

    const getG = (t) => {
      if (mode === "CGR") {
        return t <= tStop ? G : 0;
      } else {
        return alpha * M0 * Math.exp(-alpha * t);
      }
    };

    const derivatives = (t, yNF, yFF) => {
      const gCurrent = getG(t);
      const dCNF = (gCurrent + beta * yFF - beta * yNF) / V_NF;
      const dCFF = (beta * yNF - (beta + Q) * yFF) / V_FF;
      return [dCNF, dCFF];
    };

    for (let i = 0; i < steps; i++) {
      const t = i * dt;

      const [k1_NF, k1_FF] = derivatives(t, cNF, cFF);
      const [k2_NF, k2_FF] = derivatives(t + 0.5 * dt, cNF + 0.5 * dt * k1_NF, cFF + 0.5 * dt * k1_FF);
      const [k3_NF, k3_FF] = derivatives(t + 0.5 * dt, cNF + 0.5 * dt * k2_NF, cFF + 0.5 * dt * k2_FF);
      const [k4_NF, k4_FF] = derivatives(t + dt, cNF + dt * k3_NF, cFF + dt * k3_FF);

      cNF += (dt / 6) * (k1_NF + 2 * k2_NF + 2 * k3_NF + k4_NF);
      cFF += (dt / 6) * (k1_FF + 2 * k2_FF + 2 * k3_FF + k4_FF);

      cNF = Math.max(0, cNF);
      cFF = Math.max(0, cFF);

      times.push(t + dt);
      concsNF.push(cNF);
      concsFF.push(cFF);
    }

    const cMaxNF = Math.max(...concsNF);
    const cMaxFF = Math.max(...concsFF);
    const twa8NF = ExposureMetrics.calcTwa8(times, concsNF);
    const twa8FF = ExposureMetrics.calcTwa8(times, concsFF);
    const taskTwaNF = ExposureMetrics.calcTaskTwa(times, concsNF);
    const stelNF = ExposureMetrics.calcStel(times, concsNF);

    return {
      times,
      concsNF,
      concsFF,
      cMaxNF,
      cMaxFF,
      cNF_ss,
      cFF_ss,
      twa8NF,
      twa8FF,
      taskTwaNF,
      stelNF
    };
  }
};

/**
 * 3. Turbulent Eddy Diffusion Models
 */
export const TurbulentDiffusion = {
  calcSteadyState: (params) => {
    const {
      G,            // mg/min
      D,            // m2/s
      r,            // m
      geometry = "hemisphere"
    } = params;

    let Fg = 2 * Math.PI;
    if (geometry === "sphere") Fg = 4 * Math.PI;
    else if (geometry === "corner") Fg = Math.PI;
    else if (geometry === "trihedral") Fg = Math.PI / 2;

    const gSec = G / 60;
    if (D <= 0 || r <= 0) return 0;
    return gSec / (Fg * D * r);
  },

  runTransient: (params) => {
    const {
      releaseType = "continuous",
      G = 100,
      M = 50000,
      D = 0.05,
      r = 1.5,
      Q = 10,
      V = 100,
      geometry = "hemisphere",
      tTotal = 120,
      points = 200
    } = params;

    let Fg = 2 * Math.PI;
    let reflection = 2;
    if (geometry === "sphere") { Fg = 4 * Math.PI; reflection = 1; }
    else if (geometry === "corner") { Fg = Math.PI; reflection = 4; }
    else if (geometry === "trihedral") { Fg = Math.PI / 2; reflection = 8; }

    const lambdaPurge = (Q / V) / 60; // s^-1
    const times = [];
    const concs = [];
    const dt = tTotal / points;

    for (let i = 0; i <= points; i++) {
      const tMin = i * dt;
      const tSec = Math.max(0.1, tMin * 60);
      times.push(tMin);

      let c = 0;
      if (releaseType === "pulse") {
        const denom = 8 * Math.pow(Math.PI * D * tSec, 1.5);
        c = (M * reflection / denom) * Math.exp(-(r * r) / (4 * D * tSec) - lambdaPurge * tSec);
      } else {
        const gSec = G / 60;
        const Css = gSec / (Fg * D * r);
        const z = r / (2 * Math.sqrt(D * tSec));
        const erfZ = Math.min(1, Math.sqrt(1 - Math.exp(-4 * z * z / Math.PI)));
        const erfcZ = Math.max(0, 1 - erfZ);
        c = Css * erfcZ;
      }
      concs.push(Math.max(0, c));
    }

    const cMax = Math.max(...concs);
    const twa8 = ExposureMetrics.calcTwa8(times, concs);
    const stel = ExposureMetrics.calcStel(times, concs);

    return {
      times,
      concs,
      cMax,
      twa8,
      stel
    };
  }
};

/**
 * 4. Evaporation & Generation Rate Estimators
 */
export const GenerationRateEstimators = {
  hummelFehrenbacher: (params) => {
    const {
      mw,
      pvapMmHg,
      poolAreaM2,
      airVelocityMMin,
      isVelocityInMS = false,
      tempC = 20
    } = params;

    const uMS = isVelocityInMS ? airVelocityMMin : airVelocityMMin / 60;
    const tempK = tempC + 273.15;
    const pvapPa = pvapMmHg * 133.322368;

    const K_ms = 0.00211 * Math.pow(Math.max(0.01, uMS), 0.78) * Math.pow(18.015 / mw, 1 / 3);
    const fluxG_m2s = (K_ms * pvapPa * mw) / (R_IDEAL * tempK);

    const gSec = fluxG_m2s * poolAreaM2;
    const mgMin = gSec * 60000;
    const gMin = gSec * 60;

    return {
      K_ms,
      fluxG_m2s,
      mgMin,
      gSec,
      gMin
    };
  },

  mackayMatsugu: (params) => {
    const {
      mw,
      pvapMmHg,
      poolAreaM2,
      airVelocityMMin,
      isVelocityInMS = false,
      tempC = 20,
      sc = 2.0
    } = params;

    const uMS = isVelocityInMS ? airVelocityMMin : airVelocityMMin / 60;
    const tempK = tempC + 273.15;
    const pvapPa = pvapMmHg * 133.322368;
    const dPool = Math.sqrt((4 * poolAreaM2) / Math.PI);

    const Km_ms = 0.00478 * Math.pow(Math.max(0.01, uMS), 0.78) * Math.pow(Math.max(0.1, dPool), -0.11) * Math.pow(sc, -0.67);
    const fluxG_m2s = (Km_ms * pvapPa * mw) / (R_IDEAL * tempK);
    const gSec = fluxG_m2s * poolAreaM2;
    const mgMin = gSec * 60000;

    return {
      Km_ms,
      dPool,
      fluxG_m2s,
      mgMin,
      gSec
    };
  },

  massLoss: (deltaMassGrams, durationMinutes) => {
    if (!durationMinutes || durationMinutes <= 0) return { gMin: 0, mgMin: 0, gSec: 0 };
    const gMin = deltaMassGrams / durationMinutes;
    const mgMin = gMin * 1000;
    return { gMin, mgMin, gSec: gMin / 60 };
  }
};

/**
 * 5. Monte Carlo Probabilistic Simulation Engine
 */
export const MonteCarloEngine = {
  randomUniform: (min, max) => min + Math.random() * (max - min),

  randomNormal: (mean, stdDev) => {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  },

  randomLognormal: (geoMean, geoStdDev) => {
    if (geoMean <= 0 || geoStdDev <= 1.0) return geoMean;
    const mu = Math.log(geoMean);
    const sigma = Math.log(geoStdDev);
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.exp(mu + z0 * sigma);
  },

  randomTriangular: (min, mode, max) => {
    const u = Math.random();
    const f = (mode - min) / (max - min);
    if (u <= f) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  },

  sampleParam: (paramDef) => {
    if (!paramDef) return 0;
    const { type, val, min, max, mode, mean, stdDev, geoMean, geoStdDev } = paramDef;
    switch (type) {
      case "constant":
        return Number(val) || 0;
      case "uniform":
        return MonteCarloEngine.randomUniform(Number(min) || 0, Number(max) || 0);
      case "normal":
        return Math.max(0, MonteCarloEngine.randomNormal(Number(mean) || 0, Number(stdDev) || 0));
      case "lognormal":
        return MonteCarloEngine.randomLognormal(Number(geoMean) || 1, Number(geoStdDev) || 1.1);
      case "triangular":
        return MonteCarloEngine.randomTriangular(Number(min) || 0, Number(mode) || 0, Number(max) || 0);
      default:
        return Number(val) || 0;
    }
  },

  runSimulation: (modelType, paramDefs, iterations = 2000, oel = 50) => {
    const results = [];
    const metricKey = paramDefs.metric || "twa8";

    for (let i = 0; i < iterations; i++) {
      let sampledValue = 0;

      if (modelType === "WMR_CGR") {
        const G = MonteCarloEngine.sampleParam(paramDefs.G);
        const Q = MonteCarloEngine.sampleParam(paramDefs.Q);
        const V = MonteCarloEngine.sampleParam(paramDefs.V);
        const tStop = MonteCarloEngine.sampleParam(paramDefs.tStop);

        const res = WellMixedRoom.runCGR({
          G, Q: Math.max(0.01, Q), V: Math.max(0.1, V),
          tStop, tTotal: 480, points: 50
        });
        sampledValue = res[metricKey] || res.twa8;

      } else if (modelType === "WMR_EDG") {
        const M0 = MonteCarloEngine.sampleParam(paramDefs.M0);
        const alpha = MonteCarloEngine.sampleParam(paramDefs.alpha);
        const Q = MonteCarloEngine.sampleParam(paramDefs.Q);
        const V = MonteCarloEngine.sampleParam(paramDefs.V);

        const res = WellMixedRoom.runEDG({
          M0, alpha: Math.max(1e-5, alpha), Q: Math.max(0.01, Q), V: Math.max(0.1, V),
          tTotal: 480, points: 50
        });
        sampledValue = res[metricKey] || res.twa8;

      } else if (modelType === "TwoZone") {
        const G = MonteCarloEngine.sampleParam(paramDefs.G);
        const Q = MonteCarloEngine.sampleParam(paramDefs.Q);
        const beta = MonteCarloEngine.sampleParam(paramDefs.beta);
        const V_NF = MonteCarloEngine.sampleParam(paramDefs.V_NF);
        const V_FF = MonteCarloEngine.sampleParam(paramDefs.V_FF);
        const tStop = MonteCarloEngine.sampleParam(paramDefs.tStop);

        const res = TwoZoneModel.runTwoZone({
          mode: "CGR", G, Q: Math.max(0.01, Q), beta: Math.max(0.01, beta),
          V_NF: Math.max(0.1, V_NF), V_FF: Math.max(0.1, V_FF),
          tStop, tTotal: 480, steps: 50
        });
        sampledValue = res.twa8NF;
      }

      if (Number.isFinite(sampledValue)) {
        results.push(Math.max(0, sampledValue));
      }
    }

    results.sort((a, b) => a - b);
    const n = results.length;
    if (n === 0) return null;

    const getP = (p) => {
      const idx = Math.min(n - 1, Math.max(0, Math.floor((p / 100) * n)));
      return results[idx];
    };

    const mean = results.reduce((acc, v) => acc + v, 0) / n;
    const variance = results.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const validLogValues = results.filter(v => v > 0).map(v => Math.log(v));
    let geoMean = 0, geoStdDev = 1;
    if (validLogValues.length > 0) {
      const meanLog = validLogValues.reduce((a, b) => a + b, 0) / validLogValues.length;
      const varLog = validLogValues.reduce((a, b) => a + Math.pow(b - meanLog, 2), 0) / validLogValues.length;
      geoMean = Math.exp(meanLog);
      geoStdDev = Math.exp(Math.sqrt(varLog));
    }

    const countExceed = results.filter(v => v > oel).length;
    const exceedancePct = (countExceed / n) * 100;

    const p95 = getP(95);
    const aihaVerdict = ExposureMetrics.classifyAihaCategory(p95, oel);

    const minVal = results[0];
    const maxVal = results[n - 1];
    const binCount = 25;
    const binWidth = maxVal > minVal ? (maxVal - minVal) / binCount : 1;
    const bins = Array(binCount).fill(0);
    const binLabels = [];

    for (let b = 0; b < binCount; b++) {
      binLabels.push((minVal + (b + 0.5) * binWidth).toFixed(2));
    }

    results.forEach(v => {
      let bIdx = Math.floor((v - minVal) / binWidth);
      if (bIdx >= binCount) bIdx = binCount - 1;
      bins[bIdx]++;
    });

    return {
      iterations: n,
      min: minVal,
      max: maxVal,
      mean,
      stdDev,
      geoMean,
      geoStdDev,
      p5: getP(5),
      p10: getP(10),
      p25: getP(25),
      p50: getP(50),
      p75: getP(75),
      p90: getP(90),
      p95,
      p99: getP(99),
      oel,
      exceedancePct,
      aihaVerdict,
      histogram: {
        bins,
        labels: binLabels,
        binWidth
      }
    };
  }
};

/**
 * ACGIH 2025 Special Assessments & Appendix Calculations
 */
export const AcgihGuidelines = {
  /**
   * Appendix E: Additive Mixture Formula
   * Sum(C_i / T_i) <= 1
   * @param {Array<{ conc: number, limit: number, name?: string }>} components
   */
  calcAdditiveMixture: (components) => {
    let sum = 0;
    const details = [];
    components.forEach(c => {
      if (c.limit > 0) {
        const fraction = c.conc / c.limit;
        sum += fraction;
        details.push({
          name: c.name || 'Component',
          conc: c.conc,
          limit: c.limit,
          fraction
        });
      }
    });
    return {
      index: sum,
      exceeded: sum > 1.0,
      details,
      verdict: sum <= 1.0
        ? `Acceptable (Mixture Index = ${sum.toFixed(2)} <= 1.0)`
        : `EXCEEDED (Mixture Index = ${sum.toFixed(2)} > 1.0)`
    };
  },

  /**
   * Appendix H: Reciprocal Calculation Method (RCP) for Refined Hydrocarbons
   * GGV_mixture = 1 / Sum(F_i / GGV_i)
   * @param {Array<{ fraction: number, ggv: number, name?: string }>} fractions - Liquid mass fractions (0-1)
   */
  calcHydrocarbonRcp: (fractions) => {
    let reciprocalSum = 0;
    let totalFraction = 0;
    fractions.forEach(f => {
      totalFraction += f.fraction;
      if (f.ggv > 0) {
        reciprocalSum += f.fraction / f.ggv;
      }
    });

    if (reciprocalSum === 0) return { ggvRaw: 0, ggvRounded: 0 };
    const ggvRaw = totalFraction / reciprocalSum;

    // Rounding rules from Appendix H:
    // < 100 mg/m3: round to nearest 25
    // 100 - 600 mg/m3: round to nearest 50
    // > 600 mg/m3: round to nearest 200
    let ggvRounded = ggvRaw;
    if (ggvRaw < 100) {
      ggvRounded = Math.round(ggvRaw / 25) * 25;
    } else if (ggvRaw <= 600) {
      ggvRounded = Math.round(ggvRaw / 50) * 50;
    } else {
      ggvRounded = Math.round(ggvRaw / 200) * 200;
    }

    return {
      ggvRaw,
      ggvRounded,
      totalFraction
    };
  },

  /**
   * Unusual Work Schedule: Brief & Scala Model
   * Adjusts 8-hour TLV-TWA for extended shifts (> 8 hrs/day or > 40 hrs/week)
   * Daily: F = (8 / h) * (24 - h) / 16
   * Weekly: F_w = (40 / h_w) * (168 - h_w) / 128
   */
  calcBriefScalaSchedules: (twa8Oel, dailyHours = 8, weeklyHours = 40) => {
    let dailyFactor = 1.0;
    if (dailyHours > 8) {
      dailyFactor = (8 / dailyHours) * ((24 - dailyHours) / 16);
    }

    let weeklyFactor = 1.0;
    if (weeklyHours > 40) {
      weeklyFactor = (40 / weeklyHours) * ((168 - weeklyHours) / 128);
    }

    const appliedFactor = Math.min(dailyFactor, weeklyFactor);
    const adjustedOel = twa8Oel * appliedFactor;

    return {
      dailyHours,
      weeklyHours,
      dailyFactor,
      weeklyFactor,
      appliedFactor,
      adjustedOel
    };
  }
};

