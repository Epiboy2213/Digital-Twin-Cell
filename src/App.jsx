import React, { useMemo, useState, useEffect } from "react";

import {
  AreaChart,
  Area,
  LineChart as RLineChart,
  Line,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Rocket, Activity, LineChart, Beaker } from "lucide-react";
import Tumor3D from "./components/Tumor3D.jsx";

/* NEW: auth + db + routing */
import { useAuth } from "./contexts/AuthContext.jsx";
import { db } from "./lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";

/* ------------------ helpers ------------------ */
function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const header = Object.keys(rows[0] || {}).join(",");
  const body = rows.map((r) => Object.values(r).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function auc(series, yKey = "population", xKey = "t") {
  if (!series.length) return 0;
  let s = 0;
  for (let i = 1; i < series.length; i++) {
    const dx = series[i][xKey] - series[i - 1][xKey];
    s += ((series[i][yKey] + series[i - 1][yKey]) / 2) * dx;
  }
  return Math.round(s);
}

function timeToResistance(series, threshold = 50) {
  for (let i = 0; i < series.length; i++) {
    if (series[i].resistantPct >= threshold) return series[i].t;
  }
  return null;
}

/* ------------------ simulation core ------------------ */
function simulate({ scenario, dose, halfLife, IC50, Emax, mode }) {
  const T = 80; // time steps
  const dt = 1;
  const hill = 1.2;
  const k = Math.log(2) / Math.max(halfLife, 0.1);

  // PK
  const C = [];
  let c = 0;
  for (let t = 0; t <= T; t += dt) {
    let u = 0;
    if (scenario === "continuous") u = dose * 0.1;
    else if (scenario === "pulsed") {
      const d = t % 4;
      if (d === 0 || d === 1 || d === 2) u = dose; // 3-on / 1-off
    }
    // control => u stays 0
    c = c * Math.exp(-k * dt) + u;
    C.push({ t: t, C: c });
  }

  // PD → inhibition
  const inhibSeries = C.map(function (o) {
    const t = o.t;
    const conc = o.C;
    const denom = Math.pow(IC50, hill) + Math.pow(conc, hill);
    const inh = (Emax * Math.pow(conc, hill)) / (denom || 1);
    return { t: t, C: conc, inhib: Math.max(0, Math.min(1, inh)) };
  });

  // Population
  const N0 = 1000;
  let Ns = N0 * 0.98;
  let Nr = N0 * 0.02;
  const rS = 0.045;
  const rR = 0.032;
  const d0 = 0.01;
  const mu = 0.0005;

  const pop = [];
  for (let i = 0; i < inhibSeries.length; i++) {
    const t = inhibSeries[i].t;
    const inhib = inhibSeries[i].inhib;
    const effS = rS * (1 - inhib) - d0 - 0.02 * inhib;
    const effR = rR * (1 - 0.3 * inhib) - d0;
    const mut = mu * (1 + 4 * inhib) * Ns;

    Ns = Math.max(0, Ns + effS * Ns - mut);
    Nr = Math.max(0, Nr + effR * Nr + mut);

    const N = Ns + Nr;
    const resistantPct = N > 0 ? (Nr / N) * 100 : 100;
    const sensitivePct = 100 - resistantPct;

    pop.push({
      t: t,
      population: Math.max(0, Math.round(N)),
      resistantPct: Math.min(100, resistantPct),
      sensitivePct: Math.max(0, sensitivePct),
      Ns: Ns,
      Nr: Nr,
    });
  }

  const AUC = auc(pop, "population", "t");
  const TTR50 = timeToResistance(pop, 50);
  return { pk: inhibSeries, pop, AUC, TTR50, N0 };
}

/* -------- helper for comparison (reuse simulate) -------- */
function runScenario(base, scenario) {
  return simulate({
    scenario: scenario,
    dose: base.dose,
    halfLife: base.halfLife,
    IC50: base.IC50,
    Emax: base.Emax,
    mode: base.mode,
  }).pop;
}

/* ------------------ UI ------------------ */
export default function App() {
  /* Language */
  const [lang, setLang] = useState("th");
  const text = {
    th: {
      appTitle: "เซลล์คู่แฝดดิจิทัล",
      dashboard: "แดชบอร์ดการจำลอง",
      tabs: {
        overview: "ภาพรวม",
        pkpd: "PK / PD",
        population: "ประชากร",
        metrics: "ตัวชี้วัด",
        tumor3d: "เนื้องอก 3 มิติ",
        model: "ข้อมูลโมเดล",
      },
      dose: "ขนาดยา (มก.)",
      halfLife: "ครึ่งชีวิตยา (ชม.)",
      ic50: "IC50 (ไมโครโมลาร์)",
      emax: "Emax (0–1)",
      scenario: "สถานการณ์",
      scenarios: {
        control: "ไม่มียา (ควบคุม)",
        continuous: "ให้ยาต่อเนื่อง",
        pulsed: "ให้ยา 3 วัน หยุด 1 วัน",
      },
      mode: "โหมด",
      modeQuick: "เร็ว",
      modeDetailed: "ละเอียด",
      run: "เริ่มจำลอง",
      running: "กำลังจำลอง...",
      export: "บันทึก CSV",
      headerQuick: "โหมดเร็ว",
      headerDetailed: "โหมดละเอียด",
      legend: "น้ำเงิน = ไวต่อยา, ส้ม = ดื้อยา, เทา = ตาย",
      compare: "เปรียบเทียบรูปแบบยา",
      blue: "ไวต่อยา (น้ำเงิน)",
      orange: "ดื้อยา (ส้ม)",
      gray: "ตาย (เทา)",
      signInToSave: "ลงชื่อเข้าใช้เพื่อบันทึก",
      saveRun: "บันทึกการจำลองขึ้นคลาวด์",
      signedInAs: "ลงชื่อเข้าใช้เป็น",
    },
    en: {
      appTitle: "Cellular Digital Twin",
      dashboard: "Simulation Dashboard",
      tabs: {
        overview: "Overview",
        pkpd: "PK / PD",
        population: "Population",
        metrics: "Metrics",
        tumor3d: "3D Tumor",
        model: "Model Info",
      },
      dose: "Dose (mg)",
      halfLife: "Half-life (h)",
      ic50: "IC50 (µM)",
      emax: "Emax (0–1)",
      scenario: "Scenario",
      scenarios: {
        control: "No drug (Control)",
        continuous: "Continuous",
        pulsed: "Pulsed 3-on / 1-off",
      },
      mode: "Mode",
      modeQuick: "Quick",
      modeDetailed: "High fidelity",
      run: "Run",
      running: "Running...",
      export: "Export CSV",
      headerQuick: "Preview",
      headerDetailed: "High fidelity",
      legend: "Blue = Sensitive, Orange = Resistant, Gray = Dead",
      compare: "Compare View",
      blue: "Sensitive (Blue)",
      orange: "Resistant (Orange)",
      gray: "Dead (Gray)",
      signInToSave: "Sign in to save",
      saveRun: "Save run to cloud",
      signedInAs: "Signed in as",
    },
  };

  /* NEW: helper text for parameters (tooltip) */
  const paramHelp = {
    dose: {
      th: "ขนาดยาที่ให้ในแต่ละรอบ ยิ่งสูงยิ่งกดการเติบโตของเซลล์ได้มาก แต่ก็อาจเร่งให้เกิดการดื้อยาในบางรูปแบบ",
      en: "Dose per administration. Higher dose can suppress tumor growth more, but may also speed up resistance in some regimens.",
    },
    halfLife: {
      th: "เวลาที่ความเข้มข้นยาลดลงเหลือครึ่งหนึ่งในร่างกาย มีผลต่อการสะสมของยา",
      en: "Time for the drug concentration to fall to half in the body; controls how long drug stays in the system.",
    },
    ic50: {
      th: "ความเข้มข้นยาที่ทำให้การเติบโตของเซลล์ถูกยับยั้ง 50% ยิ่งต่ำยิ่งแปลว่ายาแรง",
      en: "Drug concentration that inhibits 50% of cell growth. Lower IC50 means higher potency.",
    },
    emax: {
      th: "ประสิทธิภาพสูงสุดของยา (0–1) ว่ายาจะกดการเติบโตได้มากสุดแค่ไหน",
      en: "Maximum effect (0–1) describing how strongly the drug can inhibit growth at high concentrations.",
    },
  };

  /* Inputs (left sidebar) */
  const [scenarioInput, setScenarioInput] = useState("pulsed");
  const [modeInput, setModeInput] = useState("detailed");
  const [doseInput, setDoseInput] = useState(50);
  const [halfLifeInput, setHalfLifeInput] = useState(10);
  const [IC50Input, setIC50Input] = useState(0.5);
  const [EmaxInput, setEmaxInput] = useState(0.9);

  /* Applied (used for simulate) */
  const [scenario, setScenario] = useState("pulsed");
  const [mode, setMode] = useState("detailed");
  const [dose, setDose] = useState(50);
  const [halfLife, setHalfLife] = useState(10);
  const [IC50, setIC50] = useState(0.5);
  const [Emax, setEmax] = useState(0.9);
  const [isRunning, setIsRunning] = useState(false);

  const simResult = useMemo(
    function () {
      return simulate({
        scenario: scenario,
        dose: dose,
        halfLife: Number(halfLife),
        IC50: Number(IC50),
        Emax: Number(Emax),
        mode: mode,
      });
    },
    [scenario, dose, halfLife, IC50, Emax, mode]
  );

  const pk = simResult.pk;
  const pop = simResult.pop;
  const AUC = simResult.AUC;
  const TTR50 = simResult.TTR50;
  const N0 = simResult.N0;

  const onRun = function () {
    setIsRunning(true);
    setScenario(scenarioInput);
    setMode(modeInput);
    setDose(doseInput);
    setHalfLife(Number(halfLifeInput));
    setIC50(Number(IC50Input));
    setEmax(Number(EmaxInput));
    setTimeout(function () {
      setIsRunning(false);
    }, 500);
  };

  const downloadAll = function () {
    const rows = pop.map(function (p, i) {
      return {
        t: p.t,
        population: p.population,
        resistantPct: p.resistantPct.toFixed(2),
        sensitivePct: p.sensitivePct.toFixed(2),
        C: pk[i] ? pk[i].C.toFixed(4) : "",
        inhibition: pk[i] ? pk[i].inhib.toFixed(4) : "",
      };
    });
    downloadCSV("simulation_" + scenario + "_" + mode + ".csv", rows);
  };

  /* NEW: reset to default parameters */
  const resetDefaults = function () {
    setScenarioInput("pulsed");
    setModeInput("detailed");
    setDoseInput(50);
    setHalfLifeInput(10);
    setIC50Input(0.5);
    setEmaxInput(0.9);
  };

  const [tab, setTab] = useState("overview");

  // Data for 3D & summary
  const last = pop.length
    ? pop[pop.length - 1]
    : { population: 0, resistantPct: 0, sensitivePct: 0, Ns: 0, Nr: 0 };
  const S_last =
    typeof last.Ns === "number"
      ? last.Ns
      : last.population * (last.sensitivePct / 100);
  const R_last =
    typeof last.Nr === "number"
      ? last.Nr
      : last.population * (last.resistantPct / 100);
  const D_last = Math.max(0, N0 - (S_last + R_last));

  const sCount = Math.max(0, Math.round(S_last || 0));
  const rCount = Math.max(0, Math.round(R_last || 0));
  const dCount = Math.max(0, Math.round(D_last || 0));
  const totalNow = Math.max(1, sCount + rCount + dCount);
  const sPct = (sCount / totalNow) * 100;
  const rPct = (rCount / totalNow) * 100;
  const dPct = (dCount / totalNow) * 100;
  const fmt = (n) =>
    Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

  /* Auth hooks + navigation + save method */
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function saveCurrentRun() {
    if (!user) {
      navigate("/login");
      return;
    }
    const doc = {
      uid: user.uid,
      createdAt: Date.now(),
      params: {
        scenario: scenario,
        mode: mode,
        dose: dose,
        halfLife: halfLife,
        IC50: IC50,
        Emax: Emax,
      },
      metrics: {
        AUC: AUC,
        TTR50: TTR50,
        finalResistantPct: pop.length
          ? pop[pop.length - 1].resistantPct
          : 0,
      },
    };
    await addDoc(collection(db, "runs"), doc);
    navigate("/runs");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        background: "#0a0f1c",
        color: "#fff",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          borderRight: "1px solid rgba(255,255,255,0.1)",
          padding: "16px",
          background: "linear-gradient(180deg,#0a0f1c,#0e1830)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Beaker size={18} color="#22d3ee" />
            <h1 style={{ fontSize: 16, fontWeight: 600 }}>
              {text[lang].appTitle}
            </h1>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {lang === "en" ? "🇹🇭 TH" : "🌐 EN"}
          </button>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <label style={{ fontSize: 12 }}>{text[lang].scenario}</label>
          <select
            value={scenarioInput}
            onChange={(e) => setScenarioInput(e.target.value)}
            style={{
              width: "100%",
              marginTop: 4,
              marginBottom: 10,
              padding: 6,
              borderRadius: 8,
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          >
            <option value="control">{text[lang].scenarios.control}</option>
            <option value="continuous">
              {text[lang].scenarios.continuous}
            </option>
            <option value="pulsed">{text[lang].scenarios.pulsed}</option>
          </select>

          <label style={{ fontSize: 12 }}>
            <ParamLabel
              text={`${text[lang].dose}: ${doseInput}`}
              hint={paramHelp.dose[lang]}
            />
          </label>
          <input
            type="range"
            min={0}
            max={200}
            step={10}
            value={doseInput}
            onChange={(e) => setDoseInput(Number(e.target.value))}
            style={{ width: "100%", marginBottom: 8 }}
          />

          <label style={{ fontSize: 12 }}>
            <ParamLabel
              text={text[lang].halfLife}
              hint={paramHelp.halfLife[lang]}
            />
          </label>
          <input
            value={halfLifeInput}
            onChange={(e) => setHalfLifeInput(e.target.value)}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: 6,
              borderRadius: 8,
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          />

          <label style={{ fontSize: 12 }}>
            <ParamLabel
              text={text[lang].ic50}
              hint={paramHelp.ic50[lang]}
            />
          </label>
          <input
            value={IC50Input}
            onChange={(e) => setIC50Input(e.target.value)}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: 6,
              borderRadius: 8,
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          />

          <label style={{ fontSize: 12 }}>
            <ParamLabel
              text={text[lang].emax}
              hint={paramHelp.emax[lang]}
            />
          </label>
          <input
            value={EmaxInput}
            onChange={(e) => setEmaxInput(e.target.value)}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: 6,
              borderRadius: 8,
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          />

          <button
            onClick={onRun}
            disabled={isRunning}
            style={{
              width: "100%",
              background: "#0ea5e9",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: 8,
              marginBottom: 6,
            }}
          >
            {isRunning ? text[lang].running : text[lang].run}
          </button>
          <button
            onClick={downloadAll}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff",
              borderRadius: 8,
              padding: 8,
            }}
          >
            {text[lang].export}
          </button>

          {/* NEW: reset to default */}
          <button
            onClick={resetDefaults}
            style={{
              width: "100%",
              marginTop: 6,
              background: "transparent",
              border: "1px dashed rgba(148,163,184,0.7)",
              color: "#e5e7eb",
              borderRadius: 8,
              padding: 6,
              fontSize: 12,
            }}
          >
            {lang === "en" ? "Reset to default" : "รีเซ็ตค่ามาตรฐาน"}
          </button>

          {/* save + auth section */}
          {user ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <button
                onClick={saveCurrentRun}
                style={{
                  width: "100%",
                  background: "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {lang === "en"
                  ? "Save current run"
                  : "บันทึกการจำลองขึ้นคลาวด์"}
              </button>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  opacity: 0.85,
                }}
              >
                <span>
                  {text[lang].signedInAs} {user.email}
                </span>
                <button
                  onClick={logout}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  Sign out
                </button>
              </div>
              <Link
                to="/runs"
                style={{
                  color: "#67e8f9",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                My Runs
              </Link>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <Link
                to="/login"
                style={{
                  display: "inline-block",
                  background: "#6366f1",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: 8,
                }}
              >
                {text[lang].signInToSave}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Rocket color="#22d3ee" />
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                {text[lang].dashboard}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 13,
                }}
              >
                NSCLC · {scenario.toUpperCase()} ·{" "}
                {mode === "quick"
                  ? text[lang].headerQuick
                  : text[lang].headerDetailed}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 10,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {lang === "en" ? "🇹🇭 TH" : "🌐 EN"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["overview", "pkpd", "population", "metrics", "tumor3d", "model"].map(
            function (key) {
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background:
                      tab === key ? "rgba(34,211,238,0.15)" : "transparent",
                    color: "#fff",
                  }}
                >
                  {text[lang].tabs[key]}
                </button>
              );
            }
          )}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Card
                title={
                  <>
                    <Activity size={16} /> Population vs Time
                  </>
                }
                height={280}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pop}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis dataKey="t" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        background: "#0e1830",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="population"
                      stroke="#22d3ee"
                      fill="#22d3ee40"
                      name="Population"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card
                title={
                  <>
                    <LineChart size={16} /> % Resistant vs Time
                  </>
                }
                height={280}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={pop}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis dataKey="t" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        background: "#0e1830",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="resistantPct"
                      stroke="#f472b6"
                      name="Resistant (%)"
                    />
                    <Line
                      type="monotone"
                      dataKey="sensitivePct"
                      stroke="#60a5fa"
                      name="Sensitive (%)"
                    />
                  </RLineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* How to use card */}
            <div style={{ marginTop: 12 }}>
              <Card
                title={
                  lang === "en"
                    ? "How to use this dashboard"
                    : "วิธีใช้งานแดชบอร์ดนี้"
                }
                height={190}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: 16,
                    fontSize: 12,
                  }}
                >
                  <div>
                    <h4
                      style={{
                        margin: "0 0 6px 0",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {lang === "en"
                        ? "Quick start"
                        : "เริ่มต้นใช้งานอย่างรวดเร็ว"}
                    </h4>
                    <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                      <li>
                        {lang === "en"
                          ? "Choose the treatment scenario (control / continuous / pulsed) on the left."
                          : "เลือกสถานการณ์การให้ยา (ไม่มียา / ให้ต่อเนื่อง / ให้ยา 3 วัน หยุด 1 วัน) จากแถบด้านซ้าย"}
                      </li>
                      <li>
                        {lang === "en"
                          ? "Adjust Dose, Half-life, IC50 and Emax, then click RUN to simulate."
                          : "ปรับค่า ขนาดยา ครึ่งชีวิตยา IC50 และ Emax จากนั้นกดปุ่ม เริ่มจำลอง (RUN)"}
                      </li>
                      <li>
                        {lang === "en"
                          ? "Read the population curve on the left and the % resistant curve on the right."
                          : "ดูกราฟจำนวนเซลล์รวมด้านซ้าย และกราฟเปอร์เซ็นต์เซลล์ดื้อยา/ไวต่อยาด้านขวา"}
                      </li>
                      <li>
                        {lang === "en"
                          ? "Use other tabs (PK/PD, Population, Metrics, 3D Tumor, Model) for deeper analysis."
                          : "สลับไปแท็บอื่น ๆ (PK/PD, ประชากร, ตัวชี้วัด, เนื้องอก 3 มิติ, ข้อมูลโมเดล) เพื่อวิเคราะห์เชิงลึกเพิ่มเติม"}
                      </li>
                    </ol>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "rgba(15,23,42,0.8)",
                      border: "1px dashed rgba(148,163,184,0.6)",
                    }}
                  >
                    <h4
                      style={{
                        margin: "0 0 6px 0",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {lang === "en" ? "Tips" : "เคล็ดลับการอ่านผล"}
                    </h4>
                    <ul
                      style={{ margin: 0, paddingLeft: 16, lineHeight: 1.5 }}
                    >
                      <li>
                        {lang === "en"
                          ? "Lower and flatter population curve → better tumor control."
                          : "กราฟจำนวนเซลล์ต่ำและแบนลง แปลว่าควบคุมเนื้องอกได้ดีขึ้น"}
                      </li>
                      <li>
                        {lang === "en"
                          ? "Slower rise in % resistant → slower resistance evolution."
                          : "กราฟ % ดื้อยาขึ้นช้าหรือไม่ชันมาก แปลว่าการดื้อยาพัฒนาได้ช้าลง"}
                      </li>
                      <li>
                        {lang === "en"
                          ? "Save interesting runs to the cloud (if signed in) and compare later."
                          : "หากลงชื่อเข้าใช้แล้ว สามารถบันทึกการจำลองที่น่าสนใจเก็บไว้เปรียบเทียบภายหลังได้"}
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* PK/PD */}
        {tab === "pkpd" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <Card title="PK: Concentration C(t)" height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={pk}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <XAxis dataKey="t" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      background: "#0e1830",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                  />
                  <Line type="monotone" dataKey="C" stroke="#22d3ee" />
                </RLineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="PD: Inhibition (Emax/Hill)" height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={pk}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <XAxis dataKey="t" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      background: "#0e1830",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                  />
                  <Line type="monotone" dataKey="inhib" stroke="#a78bfa" />
                </RLineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* POPULATION */}
        {tab === "population" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Card title="Population (bar snapshot)" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart
                    data={[
                      {
                        name: lang === "en" ? "Sensitive" : "ไวต่อยา",
                        value: Math.round(sCount),
                      },
                      {
                        name: lang === "en" ? "Resistant" : "ดื้อยา",
                        value: Math.round(rCount),
                      },
                    ]}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        background: "#0e1830",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                      }}
                    />
                    <Bar dataKey="value" fill="#22d3ee" />
                  </RBarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Population timeline" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={pop}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />
                    <XAxis dataKey="t" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip
                      contentStyle={{
                        background: "#0e1830",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "#fff",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="population"
                      stroke="#22d3ee"
                      name="N(t)"
                      dot={false}
                    />
                  </RLineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Compare view */}
            <div style={{ marginTop: 12 }}>
              <Card
                title={
                  lang === "en"
                    ? "Compare: Continuous vs Pulsed"
                    : text.th.compare
                }
                height={300}
              >
                <CompareChart
                  dose={dose}
                  halfLife={halfLife}
                  IC50={IC50}
                  Emax={Emax}
                  mode={mode}
                />
              </Card>
            </div>
          </>
        )}

        {/* METRICS */}
        {tab === "metrics" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              <Card title="AUC (pop vs t)" height={120}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {AUC.toLocaleString()}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  arbitrary units
                </div>
              </Card>
              <Card title="TTR ≥50% Resistant" height={120}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {TTR50 !== null ? TTR50 : "—"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  time step
                </div>
              </Card>
              <Card title="Final % Resistant" height={120}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                  {(last.resistantPct || 0).toFixed(2)}%
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  at end of run
                </div>
              </Card>
            </div>

            {/* Summary interpretation */}
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px dashed rgba(148,163,184,0.7)",
                background: "rgba(15,23,42,0.7)",
                fontSize: 12,
                color: "rgba(226,232,240,0.9)",
                lineHeight: 1.6,
              }}
            >
              {lang === "en" ? (
                <>
                  <strong>Interpretation:</strong>{" "}
                  {AUC < 500000
                    ? "Overall tumor burden is relatively well-controlled in this regimen."
                    : "Overall tumor burden remains relatively high in this regimen."}{" "}
                  {TTR50 !== null
                    ? `Resistance reaches 50% around t = ${TTR50},`
                    : "Resistance does not reach 50% within the simulated window,"}{" "}
                  and the final fraction of resistant cells is{" "}
                  {(last.resistantPct || 0).toFixed(1)}%.
                </>
              ) : (
                <>
                  <strong>การแปลผลโดยสรุป:</strong>{" "}
                  {AUC < 500000
                    ? "โดยรวมแล้วขนาดเนื้องอกถูกควบคุมได้ค่อนข้างดีในรูปแบบการให้ยานี้"
                    : "ขนาดเนื้องอกโดยรวมยังค่อนข้างสูงในรูปแบบการให้ยานี้"}{" "}
                  {TTR50 !== null
                    ? `เซลล์ดื้อยามีสัดส่วนถึง 50% ประมาณ t = ${TTR50}`
                    : "สัดส่วนเซลล์ดื้อยาไม่ถึง 50% ภายในช่วงเวลาที่จำลอง"}{" "}
                  และมีสัดส่วนเซลล์ดื้อยาสุดท้ายประมาณ{" "}
                  {(last.resistantPct || 0).toFixed(1)}%
                </>
              )}
            </div>
          </>
        )}

        {/* 3D TUMOR */}
        {tab === "tumor3d" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
            }}
          >
            <Card title="3D Tumor Spheroid" height={380}>
              <div style={{ height: "100%" }}>
                <Tumor3D
                  S={S_last}
                  R={R_last}
                  D={D_last}
                  N0={N0}
                  points={1500}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    background: "rgba(96,165,250,0.12)",
                    border: "1px solid rgba(96,165,250,0.35)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#60a5fa",
                        display: "inline-block",
                      }}
                    />
                    <strong style={{ fontSize: 13 }}>
                      {text[lang].blue}
                    </strong>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {fmt(sCount)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {sPct.toFixed(1)}%
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.35)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#f59e0b",
                        display: "inline-block",
                      }}
                    />
                    <strong style={{ fontSize: 13 }}>
                      {text[lang].orange}
                    </strong>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {fmt(rCount)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {rPct.toFixed(1)}%
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(148,163,184,0.12)",
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#94a3b8",
                        display: "inline-block",
                      }}
                    />
                    <strong style={{ fontSize: 13 }}>
                      {text[lang].gray}
                    </strong>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {fmt(dCount)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    {dPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 10,
                }}
              >
                {text[lang].legend}
              </div>
            </Card>
          </div>
        )}

        {/* MODEL INFO */}
        {tab === "model" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {/* Assumptions */}
            <Card
              title={
                lang === "en"
                  ? "Model Assumptions"
                  : "สมมติฐานของโมเดล (Model Assumptions)"
              }
              height="auto"
            >
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {lang === "en" ? (
                  <>
                    <b>Pharmacokinetics (PK)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>One-compartment model</li>
                      <li>First-order elimination (exponential decay)</li>
                      <li>
                        Half-life can be tuned to mimic different EGFR-TKIs
                      </li>
                    </ul>

                    <b>Pharmacodynamics (PD)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>
                        Emax / Hill equation converts drug level to %
                        inhibition
                      </li>
                      <li>
                        Mainly suppresses proliferation of drug-sensitive cells
                      </li>
                    </ul>

                    <b>Tumor Cell Population</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>Initial Sensitive ≈ 98%, Resistant ≈ 2%</li>
                      <li>
                        Sensitive grows faster than Resistant when no drug is
                        present
                      </li>
                      <li>
                        Mutation S → R increases under high drug pressure
                        (evolutionary pressure)
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <b>Pharmacokinetics (PK)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>ใช้โมเดล one-compartment</li>
                      <li>การขับยาเป็น first-order elimination</li>
                      <li>
                        Half-life ให้ผู้ใช้ปรับได้
                        เพื่อแทนยา EGFR-TKI ชนิดต่าง ๆ
                      </li>
                    </ul>

                    <b>Pharmacodynamics (PD)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>
                        ใช้สมการ Emax/Hill แปลงความเข้มข้นยาเป็น %
                        การยับยั้งการแบ่งตัว
                      </li>
                      <li>
                        เน้นยับยั้งการแบ่งตัวของเซลล์ที่ไวต่อยาเป็นหลัก
                      </li>
                    </ul>

                    <b>Tumor Cell Population</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>Sensitive เริ่ม ~98%, Resistant ~2%</li>
                      <li>
                        อัตราแบ่งตัวของ Sensitive &gt; Resistant เมื่อไม่มียา
                      </li>
                      <li>
                        อัตราการกลายพันธุ์ S → R
                        สูงขึ้นเมื่อความเข้มข้นยาสูง
                        (แรงกดดันเชิงวิวัฒนาการ)
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </Card>

            {/* Why NSCLC */}
            <Card
              title={
                lang === "en"
                  ? "Why NSCLC & EGFR-TKIs?"
                  : "เหตุผลที่เลือก NSCLC & ยาที่ใช้ (EGFR-TKI)"
              }
              height="auto"
            >
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {lang === "en" ? (
                  <>
                    <b>Why NSCLC?</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>Most common type of lung cancer (~85%)</li>
                      <li>
                        Rich PK/PD and clinical data available in literature
                      </li>
                      <li>
                        Key problem: acquired resistance after
                        6–12&nbsp;months despite good initial response
                      </li>
                    </ul>

                    <b>Drug class</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>EGFR Tyrosine Kinase Inhibitors (EGFR-TKIs)</li>
                      <li>
                        Examples: Erlotinib, Gefitinib, Osimertinib
                        (here used as a virtual drug)
                      </li>
                      <li>
                        Mechanism: block EGFR signaling → reduce proliferation
                        and survival of tumor cells
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <b>ทำไมเลือก NSCLC?</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>เป็นชนิดที่พบมากที่สุดของมะเร็งปอด (~85%)</li>
                      <li>มีข้อมูล PK/PD และงานวิจัยทางคลินิกจำนวนมาก</li>
                      <li>
                        ปัญหาหลักคือการดื้อยาใน 6–12 เดือน
                        แม้ตอบสนองต่อการรักษาได้ดีในช่วงแรก
                      </li>
                    </ul>

                    <b>ยาที่โมเดลอิง</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>กลุ่ม EGFR Tyrosine Kinase Inhibitors (EGFR-TKIs)</li>
                      <li>Erlotinib / Gefitinib / Osimertinib (virtual drug)</li>
                      <li>
                        ยับยั้งสัญญาณ EGFR →
                        ลดการแบ่งตัวและการอยู่รอดของเซลล์มะเร็ง
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </Card>

            {/* Variables */}
            <Card
              title={
                lang === "en"
                  ? "Variables (Independent / Dependent / Controlled)"
                  : "ตัวแปรต้น-ตาม-ควบคุม"
              }
              height="auto"
            >
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {lang === "en" ? (
                  <>
                    <b>Independent variable</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>
                        Dosing schedule: control / continuous / pulsed
                        (3-on/1-off)
                      </li>
                    </ul>

                    <b>Dependent variables</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>Total tumor cell count N(t)</li>
                      <li>Percentage of resistant cells</li>
                      <li>
                        Summary metrics: AUC, time to ≥50% resistant (TTR50)
                      </li>
                    </ul>

                    <b>Controlled parameters</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>Dose level, half-life</li>
                      <li>IC50, Emax</li>
                      <li>
                        Baseline growth / death rates, mutation rate S → R
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <b>ตัวแปรต้น (Independent)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>
                        รูปแบบการให้ยา: Control / Continuous / Pulsed
                        (3 วัน หยุด 1 วัน)
                      </li>
                    </ul>

                    <b>ตัวแปรตาม (Dependent)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>จำนวนเซลล์รวม N(t)</li>
                      <li>% Resistant</li>
                      <li>AUC และ TTR50 (เวลาเมื่อ % ดื้อยา ≥ 50%)</li>
                    </ul>

                    <b>ตัวแปรควบคุม (Controlled)</b>
                    <ul style={{ paddingLeft: 18 }}>
                      <li>ขนาดยา, Half-life</li>
                      <li>IC50, Emax</li>
                      <li>ค่า growth / death rate และ mutation rate S → R</li>
                    </ul>
                  </>
                )}
              </div>
            </Card>

            {/* Equations */}
            <Card
              title={
                lang === "en"
                  ? "Key Equations used in the model"
                  : "สมการที่ใช้ในงานนี้"
              }
              height="auto"
            >
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                {lang === "en" ? (
                  <>
                    <b>1. PK: drug concentration</b>
                    <pre
                      style={{
                        fontSize: 11,
                        background: "rgba(15,23,42,0.9)",
                        padding: 6,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`C(t+1) = C(t) · e^{-k} + input(t)
k = ln(2) / halfLife`}
                    </pre>

                    <b>2. PD: Emax / Hill</b>
                    <pre
                      style={{
                        fontSize: 11,
                        background: "rgba(15,23,42,0.9)",
                        padding: 6,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`Inhibition(t) = (Emax · C(t)^h) / (IC50^h + C(t)^h)`}
                    </pre>

                    <b>3. Sensitive / Resistant dynamics</b>
                    <pre
                      style={{
                        fontSize: 11,
                        background: "rgba(15,23,42,0.9)",
                        padding: 6,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`Ns' = Ns + (rS(1 - Inhib) - d - μ) · Ns
Nr' = Nr + (rR - d) · Nr + μ · Ns`}
                    </pre>
                  </>
                ) : (
                  <>
                    <b>1. PK: ความเข้มข้นยา</b>
                    <pre
                      style={{
                        fontSize: 11,
                        background: "rgba(15,23,42,0.9)",
                        padding: 6,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`C(t+1) = C(t) · e^{-k} + input(t)
k = ln(2) / halfLife`}
                    </pre>

                    <b>2. PD: Emax/Hill</b>
                    <pre
                      style={{
                        fontSize: 11,
                        background: "rgba(15,23,42,0.9)",
                        padding: 6,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`Inhibition(t) = (Emax · C(t)^h) / (IC50^h + C(t)^h)`}
                    </pre>

                    <b>3. Dynamics ของ Sensitive / Resistant</b>
                    <pre
                      style={{
                        fontSize: 11,
                        background: "rgba(15,23,42,0.9)",
                        padding: 6,
                        borderRadius: 6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
{`Ns' = Ns + (rS(1 - Inhib) - d - μ) · Ns
Nr' = Nr + (rR - d) · Nr + μ · Ns`}
                    </pre>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------------ Compare Chart ------------------ */
function CompareChart({ dose, halfLife, IC50, Emax, mode }) {
  const base = { dose, halfLife, IC50, Emax, mode };

  const popCont = useMemo(
    function () {
      return runScenario(base, "continuous");
    },
    [dose, halfLife, IC50, Emax, mode]
  );
  const popPulse = useMemo(
    function () {
      return runScenario(base, "pulsed");
    },
    [dose, halfLife, IC50, Emax, mode]
  );

  const lastContT = popCont.length ? popCont[popCont.length - 1].t : 0;
  const lastPulseT = popPulse.length ? popPulse[popPulse.length - 1].t : 0;
  const T = Math.max(lastContT, lastPulseT);

  const contByT = useMemo(
    function () {
      const m = Object.create(null);
      for (let i = 0; i < popCont.length; i++) m[popCont[i].t] = popCont[i];
      return m;
    },
    [popCont]
  );
  const pulseByT = useMemo(
    function () {
      const m = Object.create(null);
      for (let i = 0; i < popPulse.length; i++) m[popPulse[i].t] = popPulse[i];
      return m;
    },
    [popPulse]
  );

  const data = useMemo(
    function () {
      const arr = new Array(T + 1);
      for (let t = 0; t <= T; t++) {
        const c = contByT[t];
        const p = pulseByT[t];
        arr[t] = {
          t: t,
          cont: c ? c.population : null,
          pulse: p ? p.population : null,
          contRes: c ? c.resistantPct : null,
          pulseRes: p ? p.resistantPct : null,
        };
      }
      return arr;
    },
    [T, contByT, pulseByT]
  );

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RLineChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.1)"
        />
        <XAxis dataKey="t" stroke="#9ca3af" />
        <YAxis stroke="#9ca3af" />
        <Tooltip
          contentStyle={{
            background: "#0e1830",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="cont"
          stroke="#60a5fa"
          name="Continuous N(t)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="pulse"
          stroke="#22d3ee"
          name="Pulsed N(t)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="contRes"
          stroke="#fb7185"
          name="Continuous %R"
          strokeDasharray="4 3"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="pulseRes"
          stroke="#f59e0b"
          name="Pulsed %R"
          strokeDasharray="4 3"
          dot={false}
        />
      </RLineChart>
    </ResponsiveContainer>
  );
}

/* ------------------ small Card ------------------ */
function Card({ title, height = 240, children }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {typeof title === "string" ? <span>{title}</span> : title}
      </div>
      <div style={{ height: height }}>{children}</div>
    </div>
  );
}

/* -------- small helper label with tooltip -------- */
function ParamLabel({ text, hint }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {text}
      <span
        title={hint}
        style={{
          fontSize: 10,
          width: 16,
          height: 16,
          borderRadius: "999px",
          border: "1px solid rgba(148,163,184,0.9)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(148,163,184,0.9)",
          cursor: "help",
        }}
      >
        i
      </span>
    </span>
  );
}
