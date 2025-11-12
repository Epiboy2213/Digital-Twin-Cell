import React from "react";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function Login() {
  const { login, loading, user } = useAuth();
  if (loading) return <div style={{padding:20}}>Loading…</div>;
  if (user) return <div style={{padding:20}}>Already signed in as {user.email}</div>;
  return (
    <div style={{minHeight:"100vh", display:"grid", placeItems:"center", background:"#0a0f1c", color:"#fff"}}>
      <div style={{padding:24, border:"1px solid rgba(255,255,255,0.15)", borderRadius:12, background:"rgba(255,255,255,0.05)"}}>
        <h2 style={{marginTop:0}}>Sign in</h2>
        <button onClick={login} style={{padding:"10px 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.2)", background:"#0ea5e9", color:"#fff"}}>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
