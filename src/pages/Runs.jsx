// src/pages/Runs.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import {
  List,
  Activity,
  ArrowLeft,
  AlertCircle,
  History,
} from "lucide-react";

export default function RunsPage() {
  const { user } = useAuth();
  const [lang, setLang] = useState("th");
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const text = {
    th: {
      title: "ประวัติการจำลอง (My Runs)",
      subtitle:
        "รายการการจำลองทั้งหมดที่บันทึกไว้ในคลาวด์ สามารถใช้ดูและเปรียบเทียบผลลัพธ์ย้อนหลังได้",
      needLogin: "กรุณาลงชื่อเข้าใช้เพื่อดู Runs ที่บันทึกไว้",
      backHome: "กลับสู่หน้าแดชบอร์ด",
      createdAt: "เวลาที่บันทึก",
      params: "พารามิเตอร์การจำลอง",
      metrics: "ตัวชี้วัดสำคัญ",
      noRuns: "ยังไม่มีการจำลองที่ถูกบันทึก",
      scenario: "สถานการณ์การให้ยา",
      mode: "โหมด",
      dose: "ขนาดยา",
      halfLife: "ครึ่งชีวิตยา",
      ic50: "IC50",
      emax: "Emax",
      auc: "AUC (จำนวนเซลล์ vs เวลา)",
      ttr50: "เวลาเมื่อ % ดื้อยา ≥ 50%",
      finalRes: "% ดื้อยาสุดท้าย",
      scenarioLabels: {
        control: "ไม่มียา (Control)",
        continuous: "ให้ยาต่อเนื่อง (Continuous)",
        pulsed: "ให้ยา 3 วัน หยุด 1 วัน (Pulsed 3-on/1-off)",
      },
      modeLabels: {
        detailed: "โหมดละเอียด (High fidelity)",
        quick: "โหมดเร็ว (Preview)",
      },
    },
    en: {
      title: "My Saved Runs",
      subtitle:
        "All simulations saved to the cloud. Use this page to review and compare regimens.",
      needLogin: "Please sign in to view your saved runs.",
      backHome: "Back to dashboard",
      createdAt: "Created at",
      params: "Simulation parameters",
      metrics: "Key metrics",
      noRuns: "No saved runs yet.",
      scenario: "Scenario",
      mode: "Mode",
      dose: "Dose",
      halfLife: "Half-life",
      ic50: "IC50",
      emax: "Emax",
      auc: "AUC (population vs time)",
      ttr50: "TTR ≥50% Resistant",
      finalRes: "Final % Resistant",
      scenarioLabels: {
        control: "No drug (Control)",
        continuous: "Continuous dosing",
        pulsed: "Pulsed 3-on/1-off",
      },
      modeLabels: {
        detailed: "High fidelity",
        quick: "Quick preview",
      },
    },
  };

  useEffect(
    function () {
      if (!user) {
        setLoading(false);
        return;
      }

      async function fetchRuns() {
        try {
          setLoading(true);
          const q = query(
            collection(db, "runs"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          const items = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setRuns(items);
        } catch (err) {
          console.error(err);
          setError(err.message || "Failed to load runs");
        } finally {
          setLoading(false);
        }
      }

      fetchRuns();
    },
    [user]
  );

  const formatDateTime = (ts) => {
    if (!ts) return "-";
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(ts);
    }
  };

  const t = text[lang];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: "16px 20px",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <History size={22} color="#22d3ee" />
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              {t.title}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "rgba(148,163,184,0.9)",
                maxWidth: 520,
              }}
            >
              {t.subtitle}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setLang(lang === "en" ? "th" : "en")}
            style={{
              background: "rgba(15,23,42,0.9)",
              border: "1px solid rgba(148,163,184,0.8)",
              color: "#e5e7eb",
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {lang === "en" ? "🇹🇭 TH" : "🌐 EN"}
          </button>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.7)",
              color: "#e5e7eb",
              textDecoration: "none",
              fontSize: 12,
              background: "rgba(15,23,42,0.9)",
            }}
          >
            <ArrowLeft size={14} />
            {t.backHome}
          </Link>
        </div>
      </header>

      {/* If not logged in */}
      {!user && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(248,113,113,0.7)",
            background: "rgba(30, 64, 175, 0.4)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            maxWidth: 480,
          }}
        >
          <AlertCircle size={18} color="#fecaca" />
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 4 }}>{t.needLogin}</div>
            <Link
              to="/login"
              style={{
                color: "#93c5fd",
                textDecoration: "underline",
                fontSize: 13,
              }}
            >
              Go to Login
            </Link>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {user && loading && (
        <div style={{ marginTop: 24, fontSize: 13, opacity: 0.8 }}>
          <Activity
            size={16}
            style={{ marginRight: 6, verticalAlign: "middle" }}
          />
          {lang === "en" ? "Loading runs..." : "กำลังโหลดข้อมูลการจำลอง..."}
        </div>
      )}

      {user && error && !loading && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            border: "1px solid rgba(248,113,113,0.7)",
            background: "rgba(127,29,29,0.5)",
            maxWidth: 520,
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 4 }}>
            {lang === "en"
              ? "Unable to load your runs."
              : "ไม่สามารถโหลดข้อมูลการจำลองได้"}
          </div>
          <code style={{ fontSize: 11, opacity: 0.9 }}>{error}</code>
        </div>
      )}

      {/* Runs list */}
      {user && !loading && !error && (
        <>
          {runs.length === 0 ? (
            <div
              style={{
                marginTop: 32,
                padding: 20,
                borderRadius: 14,
                border: "1px dashed rgba(148,163,184,0.7)",
                background: "rgba(15,23,42,0.8)",
                maxWidth: 520,
                fontSize: 13,
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
                <List size={16} color="#9ca3af" />
                <strong>{t.noRuns}</strong>
              </div>
              <div style={{ opacity: 0.85 }}>
                {lang === "en"
                  ? "Go back to the dashboard, run a simulation and click “Save current run” to see it appear here."
                  : "กลับไปที่หน้าแดชบอร์ด เริ่มจำลองและกด “บันทึกการจำลองขึ้นคลาวด์” แล้วผลลัพธ์จะมาแสดงในหน้านี้"}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
                gap: 12,
              }}
            >
              {runs.map((run) => {
                const p = run.params || {};
                const m = run.metrics || {};
                const scenarioLabel =
                  t.scenarioLabels[p.scenario] || p.scenario || "-";
                const modeLabel =
                  t.modeLabels[p.mode] || p.mode || "-";

                return (
                  <div
                    key={run.id}
                    style={{
                      background: "rgba(15,23,42,0.9)",
                      borderRadius: 14,
                      border: "1px solid rgba(51,65,85,0.9)",
                      padding: 12,
                      display: "grid",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    {/* Header line */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.08,
                            color: "rgba(148,163,184,0.9)",
                          }}
                        >
                          {t.scenario}
                        </span>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#e5e7eb",
                          }}
                        >
                          {scenarioLabel}
                        </div>
                      </div>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(56,189,248,0.7)",
                          fontSize: 11,
                          whiteSpace: "nowrap",
                          color: "#7dd3fc",
                        }}
                      >
                        {t.mode}: {modeLabel}
                      </span>
                    </div>

                    {/* Created at */}
                    <div style={{ opacity: 0.9 }}>
                      <span
                        style={{
                          fontSize: 11,
                          color: "rgba(148,163,184,0.9)",
                        }}
                      >
                        {t.createdAt}:
                      </span>{" "}
                      {formatDateTime(run.createdAt)}
                    </div>

                    {/* Params + metrics two-column layout on desktop */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1.2fr",
                        gap: 10,
                      }}
                    >
                      {/* Parameters */}
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.08,
                            color: "rgba(148,163,184,0.9)",
                            marginBottom: 4,
                          }}
                        >
                          {t.params}
                        </div>
                        <ul
                          style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "grid",
                            gap: 2,
                          }}
                        >
                          <li>
                            {t.dose}: <b>{p.dose}</b>
                          </li>
                          <li>
                            {t.halfLife}: <b>{p.halfLife}</b>
                          </li>
                          <li>
                            {t.ic50}: <b>{p.IC50}</b>
                          </li>
                          <li>
                            {t.emax}: <b>{p.Emax}</b>
                          </li>
                        </ul>
                      </div>

                      {/* Metrics */}
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: 0.08,
                            color: "rgba(148,163,184,0.9)",
                            marginBottom: 4,
                          }}
                        >
                          {t.metrics}
                        </div>
                        <ul
                          style={{
                            listStyle: "none",
                            padding: 0,
                            margin: 0,
                            display: "grid",
                            gap: 2,
                          }}
                        >
                          <li>
                            {t.auc}:{" "}
                            <b>
                              {typeof m.AUC === "number"
                                ? m.AUC.toLocaleString()
                                : "-"}
                            </b>
                          </li>
                          <li>
                            {t.ttr50}:{" "}
                            <b>{m.TTR50 !== null ? m.TTR50 : "—"}</b>
                          </li>
                          <li>
                            {t.finalRes}:{" "}
                            <b>
                              {typeof m.finalResistantPct === "number"
                                ? m.finalResistantPct.toFixed(1) + "%"
                                : "-"}
                            </b>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
