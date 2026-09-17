# Occupational Exposure Modeller (IHMOD 2.0 Suite)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Web & Android](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20APK-brightgreen.svg)]()
[![Standard: AIHA IHMOD 2.0](https://img.shields.io/badge/Standard-AIHA%20IHMOD%202.0-orange.svg)]()

**Occupational Exposure Modeller** is a cross-platform (Responsive Web & Android APK) industrial hygiene exposure assessment suite. It is a full modern conversion and enhancement of AIHA's renowned **IHMOD 2.0** spreadsheet model, bringing deterministic mathematical air modeling, generation rate estimation, and probabilistic Monte Carlo risk simulation to any web browser and mobile device—**completely offline with zero dependencies**.

---

## 🌟 Key Capabilities & Models

### 1. Single-Zone / Well-Mixed Room (WMR) Models
- **Constant Generation Rate (CGR)**: Analytical solution for continuous emission into a ventilated enclosure ($V \frac{dC}{dt} = G - QC$). Computes steady-state concentration ($C_{ss} = G/Q$), peak concentration, 8-hour TWA, and 15-minute rolling STEL with decay after emission ceases ($t_{stop}$).
- **Exponentially Decreasing Generation Rate (EDG / Evaporating Spill)**: Models decaying emission ($G(t) = \alpha M_0 e^{-\alpha t}$), resolving both standard and resonance ($\alpha = Q/V$) analytical solutions. Automatically calculates peak exposure time $t_{peak} = \frac{\ln(\alpha) - \ln(Q/V)}{\alpha - Q/V}$.
- **Vapor Saturation / Backpressure**: Accounts for declining evaporation driving force as indoor vapor approaches saturation ($C_{sat} = \frac{P_{vap} M_w}{R T}$). Calculates effective loss rate and equilibrium concentration.
- **Ventilation Purge & Decay**: Evaluates room air clearance half-life ($t_{1/2}$) and 99% decontamination time ($t_{99\%} = \frac{\ln(100)}{Q/V}$) with zero emission.

### 2. Two-Zone (Near-Field / Far-Field) Models
- Evaluates worker micro-environment exposure (Near-Field, NF) vs background enclosure concentration (Far-Field, FF).
- Differential equations solved dynamically using a **4th-Order Runge-Kutta (RK4)** numerical integrator:
  $$\begin{aligned}
  V_{NF} \frac{dC_{NF}}{dt} &= G(t) + \beta C_{FF} - \beta C_{NF} \\
  V_{FF} \frac{dC_{FF}}{dt} &= \beta C_{NF} - (\beta + Q) C_{FF}
  \end{aligned}$$
- **Interzonal Airflow ($\beta$) Geometry Calculator**: Built-in interactive tool calculating $\beta = \frac{1}{2} v \cdot FSA$ for hemispherical ($FSA = 2\pi r^2$), spherical ($4\pi r^2$), or 5-sided box geometries based on local air speed.
- Supports both **CGR** and **EDG** modes with simultaneous dual-curve visualization.

### 3. Turbulent Eddy Diffusion Models
- Models concentration gradient radiating outward from an unconfined point source into a room with turbulent mixing.
- **Continuous Point Source**: Steady-state gradient $C(r) = \frac{G}{F_g D_T r}$ and transient build-up solved via complementary error function approximations.
- **Instantaneous Pulse / Puff Release**: Models catastrophic container rupture or transient puffs with turbulent decay:
  $$C(r,t) = \frac{M \cdot R_f}{8 (\pi D_T t)^{3/2}} \exp\left(-\frac{r^2}{4 D_T t} - \lambda t\right)$$
- Boundary geometries: Spherical ($4\pi$), Hemispherical floor/wall ($2\pi$), Dihedral corner ($\pi$), and Trihedral corner ($\pi/2$).

### 4. Emission Rate & Evaporation Estimators
- **Hummel-Fehrenbacher Pool Evaporation**: High-precision mass transfer coefficient estimation:
  $$K = 0.00211 \cdot u^{0.78} \cdot \left(\frac{18}{M_w}\right)^{1/3} \quad [\text{m/s}]$$
  $$\text{Evaporation Flux: } E = \frac{K \cdot P_{vap} \cdot M_w}{R \cdot T}$$
- **Mackay-Matsugu Model**: Accounts for pool surface area diameter and organic vapor Schmidt numbers.
- **Direct Mass Loss**: Calculates emission rates from measured gravimetric change ($\Delta M / \Delta t$).
- **One-Click Transfer**: Transfer calculated $G$ directly into Well-Mixed Room or Two-Zone inputs.

### 5. Probabilistic Monte Carlo Simulation
- Overcomes single-point deterministic uncertainty by sampling distributions for $G$, $Q$, $V$, $\beta$, $M_0$, and durations.
- Distribution types supported: **Constant**, **Normal** ($\mu, \sigma$), **Lognormal** (Geometric Mean, Geometric Standard Deviation), **Uniform** ($a, b$), and **Triangular** ($a, c, b$).
- Configurable iterations: 1,000 to 10,000 runs.
- Full statistical reporting: Arithmetic Mean, Standard Deviation, GM, GSD, and complete percentile distribution (**P5, P10, P25, P50, P75, P90, P95, P99**).
- **AIHA Exposure Rating & OEL Exceedance**: Automatically assesses the 95th percentile against the OEL to classify the exposure into AIHA Risk Categories 1 through 4:
  - **Category 1**: $< 10\%$ of OEL (Well Controlled)
  - **Category 2**: $10\% - 50\%$ of OEL (Controlled)
  - **Category 3**: $50\% - 100\%$ of OEL (Action Level / Surveillance Required)
  - **Category 4**: $> 100\%$ of OEL (Uncontrolled / Immediate Engineering Controls Required)
- High-performance Canvas histogram visualization with OEL cutoff threshold and exceedance coloring.

### 6. Chemical Database & Physical Properties
- Pre-populated library of **36 common industrial chemicals** (Acetone, Benzene, Toluene, Xylenes, Methylene Chloride, Trichloroethylene, n-Hexane, MEK, Styrene, Formaldehyde, etc.).
- Includes CAS numbers, Molecular Weight, Vapor Pressure at 20°C, Liquid Density, OSHA PEL, ACGIH TLV-TWA, Short-Term Exposure Limits (STEL), and NIOSH REL.
- Instant chemical lookup auto-fills physical properties and OEL thresholds across all models.

### 7. Unit Converters & Reporting
- **Inhalation Unit Conversions**: Real-time bidirectional conversion between $\text{ppm}$ and $\text{mg/m}^3$ at standard or non-standard ambient temperature and pressure.
- **Ventilation Conversions**: Real-time conversion between Air Changes per Hour ($\text{ACH}$), volumetric flow ($\text{m}^3/\text{min}$), and Cubic Feet per Minute ($\text{CFM}$).
- **Scenario Management**: Export/import scenarios to/from JSON to save and archive exposure assessments.
- **Data Export**: Export full time-series simulation data (time, concentration, ppm) to standard `.csv`.
- **Executive Assessment Report**: Formatted assessment page ready for printing or saving to PDF, including scenario parameters, exposure metrics, regulatory comparison, and AIHA Hierarchy of Controls recommendations.

---

## 📱 Platforms & Installation

### Option A: Android APK (Mobile / Tablet)
A pre-compiled standalone Android APK is available directly in the root directory:
```
OccupationalExposureModeller.apk
```
- Minimum Android Version: Android 7.0 (API Level 24)
- Target Android Version: Android 15 / 16 (API Level 36)
- **Offline & Standalone**: Zero network access required. Runs entirely on-device with hardware-accelerated rendering.
- Sideloading: Copy `OccupationalExposureModeller.apk` to your Android device, tap to install, and allow "Install from Unknown Sources".

### Option B: Web App (Desktop / Browser / Air-Gapped Laptops)
The web application is pure HTML5, CSS3, and ES6 JavaScript with **zero external CDN dependencies**:
- Simply open `web/index.html` in Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari.
- Or serve using any static web server:
  ```bash
  # Python 3
  python -m http.server 8000 --directory web

  # Or npx serve
  npx serve web
  ```
- **PWA Ready**: Supports browser installation as a Progressive Web App (PWA) on Windows, macOS, and Linux with full offline caching via service worker (`sw.js`).

---

## 🛠️ Building Android APK from Source

The Android project is located in `android/`:
```bash
cd android
# Windows
.\gradlew.bat assembleDebug

# Linux / macOS
./gradlew assembleDebug
```
The output APK will be generated at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📚 References & Scientific Basis
1. **AIHA (American Industrial Hygiene Association)**: *Mathematical Models for Estimating Occupational Exposure to Chemicals* (2nd Edition), edited by Charles B. Keil, Catherine E. Simmons, and Thomas R. Nicas.
2. **Fehrenbacher, M. C., & Hummel, A. A. (1996)**: *Evaluation of the Mass Transfer Coefficient for Evaporation of Organic Solvents*. American Industrial Hygiene Association Journal, 57(4), 352-355.
3. **Mackay, D., & Matsugu, R. S. (1973)**: *Evaporation rates of liquid hydrocarbon spills on land and water*. The Canadian Journal of Chemical Engineering, 51(4), 434-439.
4. **Jayjock, M. A., & Armstrong, T. W. (2000)**: *Application of Industrial Hygiene Exposure Models in Risk Assessment*. Applied Occupational and Environmental Hygiene.

---

## 📄 License
This project is released under the **MIT License**.
