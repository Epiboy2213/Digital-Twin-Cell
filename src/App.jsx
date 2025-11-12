import React, { useMemo, useState } from "react";
import {
  AreaChart, Area, LineChart as RLineChart, Line,
  BarChart as RBarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  Play, Download, FlaskConical, Settings2, Rocket, Activity,
  LineChart, Beaker
} from "lucide-react";
import Tumor3D from "./components/Tumor3D.jsx";

/* NEW: auth + db + routing */
import { useAuth } from "./contexts/AuthContext.jsx";
import { db } from "./lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";

/* ------------------ helpers ------------------ */
function downloadCSV(filename, rows) {
  const header = Object.keys(rows[0] || {}).join(",");
  const body = rows.map(r => Object.values(r).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
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
  const T = mode === "quick" ? 40 : 80; // time steps
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
    const t = o.t; const conc = o.C;
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
      Ns: Ns, Nr: Nr
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
    mode: base.mode
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
      tabs: { overview: "ภาพรวม", pkpd: "PK / PD", population: "ประชากร", metrics: "ตัวชี้วัด", tumor3d: "เนื้องอก 3 มิติ" },
      dose: "ขนาดยา (มก.)",
      halfLife: "ครึ่งชีวิตยา (ชม.)",
      ic50: "IC50 (ไมโครโมลาร์)",
      emax: "Emax (0–1)",
      scenario: "สถานการณ์",
      scenarios: { control: "ไม่มียา (ควบคุม)", continuous: "ให้ยาต่อเนื่อง", pulsed: "ให้ยา 3 วัน หยุด 1 วัน" },
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
      signedInAs: "ลงชื่อเข้าใช้เป็น"
    },
    en: {
      appTitle: "Cellular Digital Twin",
      dashboard: "Simulation Dashboard",
      tabs: { overview: "Overview", pkpd: "PK / PD", population: "Population", metrics: "Metrics", tumor3d: "3D Tumor" },
      dose: "Dose (mg)",
      halfLife: "Half-life (h)",
      ic50: "IC50 (µM)",
      emax: "Emax (0–1)",
      scenario: "Scenario",
      scenarios: { control: "No drug (Control)", continuous: "Continuous", pulsed: "Pulsed 3-on / 1-off" },
      mode: "Mode",
      modeQuick: "Quick",
      modeDetailed: "Detailed",
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
      signedInAs: "Signed in as"
    }
  };

  /* Inputs (left sidebar, draft) */
  const [scenarioInput, setScenarioInput] = useState("pulsed");
  const [modeInput, setModeInput] = useState("quick");
  const [doseInput, setDoseInput] = useState(50);
  const [halfLifeInput, setHalfLifeInput] = useState(10);
  const [IC50Input, setIC50Input] = useState(0.5);
  const [EmaxInput, setEmaxInput] = useState(0.9);

  /* Applied (used for simulate) */
  const [scenario, setScenario] = useState("pulsed");
  const [mode, setMode] = useState("quick");
  const [dose, setDose] = useState(50);
  const [halfLife, setHalfLife] = useState(10);
  const [IC50, setIC50] = useState(0.5);
  const [Emax, setEmax] = useState(0.9);
  const [isRunning, setIsRunning] = useState(false);

  const simResult = useMemo(function () {
    return simulate({ scenario: scenario, dose: dose, halfLife: Number(halfLife), IC50: Number(IC50), Emax: Number(Emax), mode: mode });
  }, [scenario, dose, halfLife, IC50, Emax, mode]);

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
    setTimeout(function () { setIsRunning(false); }, 500);
  };

  const downloadAll = function () {
    const rows = pop.map(function (p, i) {
      return {
        t: p.t,
        population: p.population,
        resistantPct: p.resistantPct.toFixed(2),
        sensitivePct: p.sensitivePct.toFixed(2),
        C: pk[i] ? pk[i].C.toFixed(4) : "",
        inhibition: pk[i] ? pk[i].inhib.toFixed(4) : ""
      };
    });
    downloadCSV("simulation_" + scenario + "_" + mode + ".csv", rows);
  };

  const [tab, setTab] = useState("population");

  // Data for 3D & summary
  const last = pop.length ? pop[pop.length - 1] : { population: 0, resistantPct: 0, sensitivePct: 0, Ns: 0, Nr: 0 };
  const S_last = (typeof last.Ns === "number") ? last.Ns : (last.population * (last.sensitivePct / 100));
  const R_last = (typeof last.Nr === "number") ? last.Nr : (last.population * (last.resistantPct / 100));
  const D_last = Math.max(0, N0 - (S_last + R_last));

  const sCount = Math.max(0, Math.round(S_last || 0));
  const rCount = Math.max(0, Math.round(R_last || 0));
  const dCount = Math.max(0, Math.round(D_last || 0));
  const totalNow = Math.max(1, sCount + rCount + dCount);
  const sPct = (sCount / totalNow) * 100;
  const rPct = (rCount / totalNow) * 100;
  const dPct = (dCount / totalNow) * 100;
  const fmt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : "0");

  /* NEW: Auth hooks + navigation + save method */
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function saveCurrentRun() {
    if (!user) { navigate("/login"); return; }
    const doc = {
      uid: user.uid,
      createdAt: Date.now(),
      params: { scenario: scenario, mode: mode, dose: dose, halfLife: halfLife, IC50: IC50, Emax: Emax },
      metrics: {
        AUC: AUC,
        TTR50: TTR50,
        finalResistantPct: (pop.length ? pop[pop.length - 1].resistantPct : 0)
      }
      // add pk/pop arrays later if needed
    };
    await addDoc(collection(db, "runs"), doc);
    navigate("/runs");
  }

  return (
    <div style={{minHeight:"100vh", display:"grid", gridTemplateColumns:"320px 1fr", background:"#0a0f1c", color:"#fff"}}>
      {/* Sidebar */}
      <aside style={{borderRight:"1px solid rgba(255,255,255,0.1)", padding:"16px", background:"linear-gradient(180deg,#0a0f1c,#0e1830)"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
          <div style={{display:"flex", alignItems:"center", gap:8}}>
            <Beaker size={18} color="#22d3ee" />
            <h1 style={{fontSize:16, fontWeight:600}}>{text[lang].appTitle}</h1>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            style={{background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer"}}
          >
            {lang === "en" ? "🇹🇭 TH" : "🌐 EN"}
          </button>
        </div>

        <div style={{border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:12, marginBottom:12, background:"rgba(255,255,255,0.05)"}}>
          <label style={{fontSize:12}}>{text[lang].scenario}</label>
          <select
            value={scenarioInput}
            onChange={e => setScenarioInput(e.target.value)}
            style={{width:"100%", marginTop:4, marginBottom:10, padding:6, borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff"}}
          >
            <option value="control">{text[lang].scenarios.control}</option>
            <option value="continuous">{text[lang].scenarios.continuous}</option>
            <option value="pulsed">{text[lang].scenarios.pulsed}</option>
          </select>

          <label style={{fontSize:12}}>{text[lang].dose}: {doseInput}</label>
          <input type="range" min={0} max={200} step={10} value={doseInput} onChange={e=>setDoseInput(Number(e.target.value))} style={{width:"100%", marginBottom:8}}/>

          <label style={{fontSize:12}}>{text[lang].halfLife}</label>
          <input value={halfLifeInput} onChange={e=>setHalfLifeInput(e.target.value)} style={{width:"100%", marginBottom:8, padding:6, borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff"}}/>

          <label style={{fontSize:12}}>{text[lang].ic50}</label>
          <input value={IC50Input} onChange={e=>setIC50Input(e.target.value)} style={{width:"100%", marginBottom:8, padding:6, borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff"}}/>

          <label style={{fontSize:12}}>{text[lang].emax}</label>
          <input value={EmaxInput} onChange={e=>setEmaxInput(e.target.value)} style={{width:"100%", marginBottom:8, padding:6, borderRadius:8, background:"rgba(255,255,255,0.08)", color:"#fff"}}/>

          <div style={{marginBottom:10}}>
            <span style={{fontSize:12}}>{text[lang].mode}</span><br/>
            <button onClick={()=>setModeInput("quick")} style={{padding:"4px 8px", margin:2, background:modeInput==="quick"?"#0891b2":"transparent", color:"#fff", borderRadius:8}}>⚡ {text[lang].modeQuick}</button>
            <button onClick={()=>setModeInput("detailed")} style={{padding:"4px 8px", margin:2, background:modeInput==="detailed"?"#7c3aed":"transparent", color:"#fff", borderRadius:8}}>🔬 {text[lang].modeDetailed}</button>
          </div>

          <button onClick={onRun} disabled={isRunning} style={{width:"100%", background:"#0ea5e9", color:"#fff", border:"none", borderRadius:8, padding:8, marginBottom:6}}>
            {isRunning ? text[lang].running : text[lang].run}
          </button>
          <button onClick={downloadAll} style={{width:"100%", background:"transparent", border:"1px solid rgba(255,255,255,0.3)", color:"#fff", borderRadius:8, padding:8}}>
            {text[lang].export}
          </button>

          {/* NEW: save + auth section */}
          {user ? (
            <div style={{marginTop:10, display:"grid", gap:8}}>
              <button onClick={saveCurrentRun} style={{width:"100%", background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:8}}>
                {text[lang].saveRun}
              </button>
              <div style={{display:"flex", justifyContent:"space-between", fontSize:12, opacity:0.85}}>
                <span>{text[lang].signedInAs} {user.email}</span>
                <button onClick={logout} style={{background:"transparent", border:"1px solid rgba(255,255,255,0.3)", color:"#fff", borderRadius:6, padding:"2px 8px"}}>
                  Sign out
                </button>
              </div>
              <Link to="/runs" style={{color:"#67e8f9", fontSize:12, textDecoration:"underline"}}>My Runs</Link>
            </div>
          ) : (
            <div style={{marginTop:10}}>
              <Link to="/login" style={{display:"inline-block", background:"#6366f1", color:"#fff", padding:"8px 12px", borderRadius:8}}>
                {text[lang].signInToSave}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{padding:"16px 20px"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <Rocket color="#22d3ee" />
            <div>
              <h2 style={{margin:0, fontSize:20, fontWeight:700}}>
                {text[lang].dashboard}
              </h2>
              <p style={{margin:0, color:"rgba(255,255,255,0.7)", fontSize:13}}>
                NSCLC · {scenario.toUpperCase()} · {mode==="quick" ? text[lang].headerQuick : text[lang].headerDetailed}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            style={{background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.2)", color:"#fff", padding:"6px 12px", borderRadius:10, fontSize:12, cursor:"pointer"}}
          >
            {lang === "en" ? "🇹🇭 TH" : "🌐 EN"}
          </button>
        </div>

        {/* Tabs */}
        <div style={{display:"flex", gap:8, marginBottom:12}}>
          {["overview","pkpd","population","metrics","tumor3d"].map(function (key) {
            return (
              <button key={key}
                onClick={() => setTab(key)}
                style={{
                  padding:"8px 12px", borderRadius:10, border:"1px solid rgba(255,255,255,0.15)",
                  background: tab===key ? "rgba(34,211,238,0.15)" : "transparent", color:"#fff"
                }}>
                {text[lang].tabs[key]}
              </button>
            );
          })}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <Card title={<><Activity size={16}/> Population vs Time</>} height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pop}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
                  <XAxis dataKey="t" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
                  <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
                  <Area type="monotone" dataKey="population" stroke="#22d3ee" fill="#22d3ee40" name="Population"/>
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title={<><LineChart size={16}/> % Resistant vs Time</>} height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={pop}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
                  <XAxis dataKey="t" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
                  <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
                  <Legend />
                  <Line type="monotone" dataKey="resistantPct" stroke="#f472b6" name="Resistant (%)"/>
                  <Line type="monotone" dataKey="sensitivePct" stroke="#60a5fa" name="Sensitive (%)"/>
                </RLineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* PK/PD */}
        {tab === "pkpd" && (
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <Card title="PK: Concentration C(t)" height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={pk}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
                  <XAxis dataKey="t" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
                  <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
                  <Line type="monotone" dataKey="C" stroke="#22d3ee" name="C(t)"/>
                </RLineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="PD: Inhibition (Emax/Hill)" height={280}>
              <ResponsiveContainer width="100%" height="100%">
                <RLineChart data={pk}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
                  <XAxis dataKey="t" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
                  <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
                  <Line type="monotone" dataKey="inhib" stroke="#a78bfa" name="Inhibition"/>
                </RLineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* POPULATION */}
        {tab === "population" && (
          <>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <Card title="Population (bar snapshot)" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={[
                    { name: lang==="en" ? "Sensitive" : "ไวต่อยา", value: Math.round(sCount) },
                    { name: lang==="en" ? "Resistant" : "ดื้อยา", value: Math.round(rCount) }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
                    <XAxis dataKey="name" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
                    <Bar dataKey="value" fill="#22d3ee" />
                  </RBarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Population timeline" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={pop}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
                    <XAxis dataKey="t" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
                    <Line type="monotone" dataKey="population" stroke="#22d3ee" name="N(t)" dot={false}/>
                  </RLineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Compare view below */}
            <div style={{marginTop:12}}>
              <Card title={lang==="en" ? "Compare: Continuous vs Pulsed" : text.th.compare} height={300}>
                <CompareChart dose={dose} halfLife={halfLife} IC50={IC50} Emax={Emax} mode={mode} />
              </Card>
            </div>
          </>
        )}

        {/* METRICS */}
        {tab === "metrics" && (
          <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12}}>
            <Card title="AUC (pop vs t)" height={120}>
              <div style={{fontSize:22, fontWeight:700}}>{AUC.toLocaleString()}</div>
              <div style={{fontSize:12, color:"rgba(255,255,255,0.7)"}}>arbitrary units</div>
            </Card>
            <Card title="TTR ≥50% Resistant" height={120}>
              <div style={{fontSize:22, fontWeight:700}}>{TTR50 !== null ? TTR50 : "—"}</div>
              <div style={{fontSize:12, color:"rgba(255,255,255,0.7)"}}>time step</div>
            </Card>
            <Card title="Final % Resistant" height={120}>
              <div style={{fontSize:22, fontWeight:700}}>{(last.resistantPct || 0).toFixed(2)}%</div>
              <div style={{fontSize:12, color:"rgba(255,255,255,0.7)"}}>at end of run</div>
            </Card>
          </div>
        )}

        {/* 3D TUMOR */}
        {tab === "tumor3d" && (
          <div style={{display:"grid", gridTemplateColumns:"1fr", gap:12}}>
            <Card title="3D Tumor Spheroid" height={380}>
              <div style={{height:"100%"}}>
                <Tumor3D S={S_last} R={R_last} D={D_last} N0={N0} points={1500} />
              </div>

              {/* Summary Blue / Orange / Gray */}
              <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginTop:12}}>
                {/* Blue */}
                <div style={{background:"rgba(96,165,250,0.12)", border:"1px solid rgba(96,165,250,0.35)", borderRadius:10, padding:"10px 12px"}}>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                    <span style={{width:10, height:10, borderRadius:"50%", background:"#60a5fa", display:"inline-block"}}/>
                    <strong style={{fontSize:13}}>{text[lang].blue}</strong>
                  </div>
                  <div style={{fontSize:20, fontWeight:700}}>{fmt(sCount)}</div>
                  <div style={{fontSize:12, color:"rgba(255,255,255,0.7)"}}>{sPct.toFixed(1)}%</div>
                </div>
                {/* Orange */}
                <div style={{background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.35)", borderRadius:10, padding:"10px 12px"}}>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                    <span style={{width:10, height:10, borderRadius:"50%", background:"#f59e0b", display:"inline-block"}}/>
                    <strong style={{fontSize:13}}>{text[lang].orange}</strong>
                  </div>
                  <div style={{fontSize:20, fontWeight:700}}>{fmt(rCount)}</div>
                  <div style={{fontSize:12, color:"rgba(255,255,255,0.7)"}}>{rPct.toFixed(1)}%</div>
                </div>
                {/* Gray */}
                <div style={{background:"rgba(148,163,184,0.12)", border:"1px solid rgba(148,163,184,0.35)", borderRadius:10, padding:"10px 12px"}}>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:4}}>
                    <span style={{width:10, height:10, borderRadius:"50%", background:"#94a3b8", display:"inline-block"}}/>
                    <strong style={{fontSize:13}}>{text[lang].gray}</strong>
                  </div>
                  <div style={{fontSize:20, fontWeight:700}}>{fmt(dCount)}</div>
                  <div style={{fontSize:12, color:"rgba(255,255,255,0.7)"}}>{dPct.toFixed(1)}%</div>
                </div>
              </div>

              <div style={{fontSize:12, color:"rgba(255,255,255,0.7)", marginTop:10}}>
                {text[lang].legend}
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
  const base = { dose: dose, halfLife: halfLife, IC50: IC50, Emax: Emax, mode: mode };

  const popCont = useMemo(function () { return runScenario(base, "continuous"); }, [dose, halfLife, IC50, Emax, mode]);
  const popPulse = useMemo(function () { return runScenario(base, "pulsed"); }, [dose, halfLife, IC50, Emax, mode]);

  // last t without .at/.?./??
  const lastContT = popCont.length ? popCont[popCont.length - 1].t : 0;
  const lastPulseT = popPulse.length ? popPulse[popPulse.length - 1].t : 0;
  const T = Math.max(lastContT, lastPulseT);

  // index map
  const contByT = useMemo(function () {
    const m = Object.create(null);
    for (let i = 0; i < popCont.length; i++) m[popCont[i].t] = popCont[i];
    return m;
  }, [popCont]);
  const pulseByT = useMemo(function () {
    const m = Object.create(null);
    for (let i = 0; i < popPulse.length; i++) m[popPulse[i].t] = popPulse[i];
    return m;
  }, [popPulse]);

  const data = useMemo(function () {
    const arr = new Array(T + 1);
    for (let t = 0; t <= T; t++) {
      const c = contByT[t];
      const p = pulseByT[t];
      arr[t] = {
        t: t,
        cont:    c ? c.population   : null,
        pulse:   p ? p.population   : null,
        contRes: c ? c.resistantPct : null,
        pulseRes:p ? p.resistantPct : null
      };
    }
    return arr;
  }, [T, contByT, pulseByT]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
        <XAxis dataKey="t" stroke="#9ca3af"/><YAxis stroke="#9ca3af"/>
        <Tooltip contentStyle={{background:"#0e1830", border:"1px solid rgba(255,255,255,0.1)", color:"#fff"}}/>
        <Legend />
        <Line type="monotone" dataKey="cont" stroke="#60a5fa" name="Continuous N(t)" dot={false}/>
        <Line type="monotone" dataKey="pulse" stroke="#22d3ee" name="Pulsed N(t)" dot={false}/>
        <Line type="monotone" dataKey="contRes" stroke="#fb7185" name="Continuous %R" strokeDasharray="4 3" dot={false}/>
        <Line type="monotone" dataKey="pulseRes" stroke="#f59e0b" name="Pulsed %R" strokeDasharray="4 3" dot={false}/>
      </RLineChart>
    </ResponsiveContainer>
  );
}

/* ------------------ small Card ------------------ */
function Card({ title, height = 240, children }) {
  return (
    <div style={{
      background:"rgba(255,255,255,0.04)",
      border:"1px solid rgba(255,255,255,0.12)",
      borderRadius:14, padding:12
    }}>
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8, fontWeight:600}}>
        {typeof title === "string" ? <span>{title}</span> : title}
      </div>
      <div style={{height: height}}>{children}</div>
    </div>
  );
}
