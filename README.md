# Occupational exposure modeling (IHMOD 2.0 &amp; ACGIH 2025 TLV / NIOSH NPG Suite)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Web & Android](https://img.shields.io/badge/Platform-Web%20%7C%20Android%20APK-brightgreen.svg)]()
[![Standard: AIHA IHMOD 2.0](https://img.shields.io/badge/Standard-AIHA%20IHMOD%202.0-orange.svg)]()
[![Database: ACGIH 2025 & NIOSH NPG](https://img.shields.io/badge/Database-ACGIH%202025%20TLV%20%7C%20NIOSH%20NPG-blueviolet.svg)]()
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Luzchange/occupational-exposure-modeller)

**Occupational exposure modeling** is a cross-platform (Responsive Web & Android APK) industrial hygiene exposure assessment suite. It is a full modern conversion and enhancement of AIHA's renowned **IHMOD 2.0** spreadsheet model, bringing deterministic mathematical air modeling, generation rate estimation, probabilistic Monte Carlo risk simulation, and an **offline chemical hazard database directly incorporating the 2025 ACGIH TLVs® and BEIs® as well as the NIOSH Pocket Guide to Chemical Hazards (NPG)**—**100% offline with zero dependencies**.

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

### 6. Offline Chemical Database (ACGIH 2025 TLVs® & NIOSH Pocket Guide)
The app embeds a comprehensive chemical database bundled locally (`chemicalDatabase.js`) providing **100% offline access** in the field without internet:
- **ACGIH 2025 TLVs® & BEIs®**:
  - 8-hour TWA, 15-minute STEL, and Ceiling limits
  - ACGIH Notations: Skin, DSEN (Dermal Sensitization), RSEN (Respiratory Sensitization), OTO (Ototoxicity), and Carcinogenicity (A1 Confirmed Human, A2 Suspected Human, A3 Animal, A4 Not Classifiable, A5 Not Suspected)
  - TLV Basis / Critical Health Effects (e.g. URT irritation, CNS impairment, neuropathy, liver/kidney damage)
  - Biological Exposure Indices (BEI®) determinative parameters (e.g., S-Phenylmercapturic acid for Benzene, o-Cresol for Toluene)
- **NIOSH Pocket Guide to Chemical Hazards (NPG)**:
  - CAS, RTECS, and DOT ID numbers
  - Molecular weight, boiling point, vapor pressure at 20°C, liquid density, flash point, and LEL/UEL
  - NIOSH Recommended Exposure Limits (RELs) and Carcinogen (`Ca`) classifications
  - OSHA Permissible Exposure Limits (PELs)
  - NIOSH Immediately Dangerous to Life or Health (IDLH) levels
  - Primary exposure routes, signs & symptoms, and target organs
  - Personal protective equipment, first aid, and respirator selection codes
- **Instant Search & Filter**: Filter by keyword, CAS #, carcinogens, ototoxicants, skin notations, or BEIs, with a one-click **"Model this Chemical"** button.

### 7. ACGIH Special Guidelines & Work Shift Calculators
- **ACGIH Appendix E (Additive Mixture Formula)**: Calculates the cumulative mixture exposure index $\sum \frac{C_i}{T_i}$ for chemicals affecting the same organ systems and evaluates compliance ($\le 1.0$).
- **ACGIH Appendix H (Reciprocal Calculation Method - RCP)**: Evaluates Group Guidance Values for complex refined hydrocarbon vapor mixtures ($GGV_{mix} = \frac{1}{\sum (F_i / GGV_i)}$) with official ACGIH rounding criteria.
- **Extended Work Shifts (Brief & Scala Model)**: Adjusts 8-hour TLV-TWAs for extended work days (> 8 hrs/day) or extended work weeks (> 40 hrs/week):
  $$F_{daily} = \frac{8}{h} \left(\frac{24 - h}{16}\right), \quad F_{weekly} = \frac{40}{h_w} \left(\frac{168 - h_w}{128}\right)$$
- **ACGIH 2025 Physical Agents Reference**: Quick reference tables for Audible Sound TLVs (85 dBA criteria, 3 dB exchange rate), Heat Stress WBGT screening criteria, and Hand-Arm Vibration (HAVS) limits.

### 8. Unit Converters & Reporting
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
OccupationalExposureModeling.apk
```
- Minimum Android Version: Android 7.0 (API Level 24)
- Target Android Version: Android 15 / 16 (API Level 36)
- **Offline & Standalone**: Zero network access required. Runs entirely on-device with hardware-accelerated rendering.
- Sideloading: Copy `OccupationalExposureModeling.apk` to your Android device, tap to install, and allow "Install from Unknown Sources".

### Option B: Web App (Desktop / Browser / Air-Gapped Laptops)
The web application is pure HTML5, CSS3, and ES6 JavaScript with **zero external CDN dependencies**:
- Simply open `web/index.html` in Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari.
- Or serve using any static web server:
  ```bash
  # Python 3
  python -m http.server 8000 --directory web

  # Or npm / npx
  npm start
  ```
- **PWA Ready**: Supports browser installation as a Progressive Web App (PWA) on Windows, macOS, and Linux with full offline caching via service worker (`sw.js`).

### Option C: Instant Cloud Hosting on Vercel
This repository includes a pre-configured [`vercel.json`](vercel.json) allowing seamless, zero-config deployment to Vercel:

1. **One-Click Deploy**:
   Click the button below to deploy your own instance immediately:
   
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Luzchange/occupational-exposure-modeller)

2. **Via Vercel Web Dashboard**:
   - Go to [vercel.com/new](https://vercel.com/new).
   - Select and import your GitHub repository: `occupational-exposure-modeller`.
   - Click **Deploy**. Vercel automatically detects `vercel.json` (pointing output to `web/` with `buildCommand: null`), activates clean URLs, and configures security and PWA headers without requiring any manual settings.

3. **Via Vercel CLI**:
   ```bash
   npm i -g vercel
   vercel
   ```

*Note: The hosted Vercel site also serves the standalone `OccupationalExposureModeling.apk` binary directly through the header **📱 APK** download button!*

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
2. **ACGIH® (2025)**: *TLVs® and BEIs®: Threshold Limit Values for Chemical Substances and Physical Agents & Biological Exposure Indices*. ACGIH, Cincinnati, OH.
3. **NIOSH (2024)**: *Pocket Guide to Chemical Hazards (NPG)*. National Institute for Occupational Safety and Health, Centers for Disease Control and Prevention (CDC).
4. **Fehrenbacher, M. C., & Hummel, A. A. (1996)**: *Evaluation of the Mass Transfer Coefficient for Evaporation of Organic Solvents*. American Industrial Hygiene Association Journal, 57(4), 352-355.
5. **Mackay, D., & Matsugu, R. S. (1973)**: *Evaporation rates of liquid hydrocarbon spills on land and water*. The Canadian Journal of Chemical Engineering, 51(4), 434-439.
6. **Brief, R. S., & Scala, R. A. (1975)**: *Occupational exposure limits for novel work schedules*. American Industrial Hygiene Association Journal, 36(6), 467-469.

---

## 📄 License
This project is released under the **MIT License**.

