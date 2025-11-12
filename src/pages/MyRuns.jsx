import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import { db } from "../lib/firebase";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";

export default function MyRuns() {
  const { user } = useAuth();
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const q = query(
        collection(db, "runs"),
        where("uid", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(25)
      );
      const snap = await getDocs(q);
      setRuns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    })();
  }, [user]);

  if (!user) {
    return <div style={{padding:20, color:"#fff"}}>Please sign in to view your runs.</div>;
  }

  return (
    <div style={{padding:20, color:"#fff"}}>
      <h2>My Runs</h2>
      {runs.length === 0 && <div>No saved runs yet.</div>}
      <div style={{display:"grid", gap:12}}>
        {runs.map(run => (
          <div key={run.id} style={{border:"1px solid rgba(255,255,255,0.15)", borderRadius:10, padding:12}}>
            <div style={{fontWeight:700}}>{new Date(run.createdAt).toLocaleString()}</div>
            <div style={{fontSize:12, opacity:0.8}}>
              Scenario: {run.params.scenario} · Mode: {run.params.mode} · Dose: {run.params.dose} mg  
              · Half-life: {run.params.halfLife} h · IC50: {run.params.IC50} µM · Emax: {run.params.Emax}
            </div>
            <div style={{marginTop:6, display:"flex", gap:16, fontSize:14}}>
              <span>AUC: <b>{run.metrics.AUC.toLocaleString()}</b></span>
              <span>TTR≥50%: <b>{run.metrics.TTR50 ?? "—"}</b></span>
              <span>Final %R: <b>{run.metrics.finalResistantPct.toFixed(2)}%</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
