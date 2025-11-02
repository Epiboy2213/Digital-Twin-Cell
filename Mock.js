import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Download, Play, Hourglass, Rocket, FlaskConical, Settings2, Database, LineChart, Activity, BarChart2, CircleDot } from "lucide-react";
import { LineChart as RLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, BarChart as RBarChart, Bar } from "recharts";

// fake data for charts
const timeSeries = Array.from({ length: 50 }, (_, i) => ({
  t: i,
  population: Math.max(0, 1000 * Math.exp(-0.015 * i) + 200 * Math.sin(i / 4)),
  resistant: Math.min(100, Math.max(0, 2 + i * 1.6)),
  sensitive: Math.max(0, 100 - (2 + i * 1.6)),
}));

const pkSeries = Array.from({ length: 40 }, (_, i) => ({ t: i, C: Math.exp(-0.12 * i) }));
const pdSeries = Array.from({ length: 11 }, (_, i) => ({ C: i / 10, inhib: (i / 10) ** 1.2 / (0.5 ** 1.2 + (i / 10) ** 1.2) }));

export default function DashboardMock() {
  const [mode, setMode] = useState("quick");
  const [scenario, setScenario] = useState("pulsed");
  const [dose, setDose] = useState([50]);
  const [halfLife, setHalfLife] = useState("10");
  const [ic50, setIC50] = useState("0.5");
  const [emax, setEmax] = useState("0.9");

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-white grid lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="border-r border-white/10 p-4 space-y-4 bg-gradient-to-b from-[#0a0f1c] to-[#0e1830]">
        <div className="flex items-center gap-2">
          <CircleDot className="text-cyan-400" />
          <h1 className="text-lg font-semibold">Cellular Digital Twin</h1>
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-cyan-300">Simulation Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Scenario</Label>
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger className="bg-white/10 border-white/10">
                  <SelectValue placeholder="Select scenario" />
                </SelectTrigger>
                <SelectContent className="bg-[#0e1830] text-white border-white/10">
                  <SelectItem value="control">No drug (Control)</SelectItem>
                  <SelectItem value="continuous">Continuous</SelectItem>
                  <SelectItem value="pulsed">Pulsed 3-on / 1-off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-2"><FlaskConical size={14} /> Dose (mg)</Label>
              <Slider value={dose} onValueChange={setDose} max={200} step={10} className="cursor-pointer" />
              <div className="text-xs text-white/70">Current: {dose[0]} mg</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Half-life (h)</Label>
                <Input value={halfLife} onChange={(e) => setHalfLife(e.target.value)} className="bg-white/10 border-white/10" />
              </div>
              <div>
                <Label className="text-xs">IC50 (µM)</Label>
                <Input value={ic50} onChange={(e) => setIC50(e.target.value)} className="bg-white/10 border-white/10" />
              </div>
              <div>
                <Label className="text-xs">Emax</Label>
                <Input value={emax} onChange={(e) => setEmax(e.target.value)} className="bg-white/10 border-white/10" />
              </div>
              <div className="flex items-center justify-between pt-5">
                <Label className="text-xs flex items-center gap-2"><Settings2 size={14}/> Mode</Label>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${mode === "quick" ? "text-cyan-300" : "text-white/60"}`}>Quick</span>
                  <Switch checked={mode === "detailed"} onCheckedChange={(v) => setMode(v ? "detailed" : "quick")} />
                  <span className={`text-[11px] ${mode === "detailed" ? "text-cyan-300" : "text-white/60"}`}>Detailed</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button className="bg-cyan-600 hover:bg-cyan-500 w-full"><Play className="mr-2 h-4 w-4"/>Run</Button>
              <Button variant="outline" className="w-full border-white/20 text-white hover:bg-white/10"><Download className="mr-2 h-4 w-4"/>Export</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-cyan-300 flex items-center gap-2"><Database size={16}/>Datasets</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-white/70 space-y-1">
            <p>DepMap / GDSC / Cellosaurus</p>
            <p>Parameters: half-life, IC50, Emax</p>
          </CardContent>
        </Card>
      </aside>

      {/* Main */}
      <main className="p-4 lg:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="text-cyan-400" />
            <div>
              <h2 className="text-xl font-semibold">Simulation Dashboard</h2>
              <p className="text-white/60 text-sm">NSCLC · {scenario.toUpperCase()} · {mode === "quick" ? "Preview" : "High fidelity"}</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-white/70"><Hourglass size={14}/> Time step: adaptive · Grid: 2D → 3D viz</div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="bg-white/10 border border-white/10">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pkpd">PK / PD</TabsTrigger>
            <TabsTrigger value="population">Population</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="tumor3d">3D Tumor</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300 flex items-center gap-2"><Activity size={16}/> Population vs Time</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeries}>
                      <defs>
                        <linearGradient id="pop" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="t" stroke="#9ca3af"/>
                      <YAxis stroke="#9ca3af"/>
                      <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                      <Area type="monotone" dataKey="population" stroke="#22d3ee" fill="url(#pop)" name="Population" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300 flex items-center gap-2"><LineChart size={16}/> % Resistant vs Time</CardTitle></CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RLineChart data={timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="t" stroke="#9ca3af"/>
                      <YAxis stroke="#9ca3af"/>
                      <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                      <Legend />
                      <Line type="monotone" dataKey="resistant" stroke="#f472b6" name="Resistant (%)" />
                      <Line type="monotone" dataKey="sensitive" stroke="#60a5fa" name="Sensitive (%)" />
                    </RLineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PK/PD */}
          <TabsContent value="pkpd" className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300">PK: Concentration C(t)</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={pkSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="t" stroke="#9ca3af"/>
                    <YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                    <Line type="monotone" dataKey="C" stroke="#22d3ee" name="C(t)" />
                  </RLineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300">PD: Inhibition vs Concentration</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RLineChart data={pdSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="C" stroke="#9ca3af"/>
                    <YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                    <Line type="monotone" dataKey="inhib" stroke="#a78bfa" name="Inhibition" />
                  </RLineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Population */}
          <TabsContent value="population" className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300 flex items-center gap-2"><LineChart size={16}/> Population Breakdown</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="t" stroke="#9ca3af"/>
                    <YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                    <Legend />
                    <Area type="monotone" dataKey="sensitive" stackId="1" stroke="#60a5fa" fill="#60a5fa40" name="Sensitive" />
                    <Area type="monotone" dataKey="resistant" stackId="1" stroke="#f472b6" fill="#f472b640" name="Resistant" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Metrics */}
          <TabsContent value="metrics" className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300 flex items-center gap-2"><BarChart2 size={16}/> AUC (Population)</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={[{ label: "Continuous", val: 5200 }, { label: "Pulsed", val: 3900 }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="label" stroke="#9ca3af"/>
                    <YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                    <Bar dataKey="val" name="AUC" fill="#22d3ee" />
                  </RBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300">Time-to-Resistance ≥50%</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={[{ label: "Continuous", ttr: 18 }, { label: "Pulsed", ttr: 34 }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="label" stroke="#9ca3af"/>
                    <YAxis stroke="#9ca3af"/>
                    <Tooltip contentStyle={{ background: "#0e1830", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}/>
                    <Bar dataKey="ttr" name="TTR (days)" fill="#a78bfa" />
                  </RBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3D */}
          <TabsContent value="tumor3d">
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-cyan-300">3D Tumor Spheroid (mock)</CardTitle></CardHeader>
              <CardContent className="h-80 grid place-items-center text-white/60">
                <div className="w-64 h-64 rounded-full bg-gradient-to-br from-cyan-400/30 to-fuchsia-400/20 border border-white/10 shadow-[0_0_60px_-10px_#22d3ee] grid place-items-center">
                  <div className="text-center text-xs">
                    <p>• Green = Sensitive</p>
                    <p>• Red = Resistant</p>
                    <p>• Gray = Dead</p>
                    <p className="mt-2 text-white/70">(placeholder viz)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
