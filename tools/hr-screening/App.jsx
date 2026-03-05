import { useState, useCallback, useRef, useMemo, memo } from "react";

const MODEL = "claude-sonnet-4-20250514";

// ─── Read file to base64 ──────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

// ─── Single API call: extract resume data + score against JD in one prompt ───
async function analyseResume(base64, filename, jobDescription) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": "pdfs-2024-09-25",   // required for PDF document blocks
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: `You are an expert HR screener. Analyse this resume against the job description below and return a single JSON object. Respond ONLY with valid JSON — no markdown, no backticks, no preamble.

JOB DESCRIPTION:
${jobDescription}

Return this exact structure:
{
  "name": "full name",
  "email": "email or null",
  "phone": "phone or null",
  "summary": "2-3 sentence professional summary",
  "totalYearsExperience": <number>,
  "skills": ["skill1","skill2"],
  "jobs": [{"title":"","company":"","startYear":<n or null>,"endYear":<n|"Present"|null>,"durationMonths":<n>,"highlights":"1 line"}],
  "education": [{"degree":"","institution":"","year":<n or null>}],
  "certifications": [],
  "avgTenureMonths": <number>,
  "longestTenureMonths": <number>,
  "shortStints": <jobs under 12 months>,
  "overallScore": <0-100>,
  "skillsScore": <0-100>,
  "experienceScore": <0-100>,
  "tenureScore": <0-100, penalise avg tenure below 18mo>,
  "educationScore": <0-100>,
  "verdict": "Strong Match"|"Good Match"|"Partial Match"|"Weak Match",
  "strengths": ["s1","s2","s3"],
  "concerns": ["c1","c2"],
  "recommendation": "2-3 sentence hiring recommendation",
  "matchedSkills": ["skills present that match JD"],
  "missingSkills": ["important JD skills not found"]
}` }
        ]
      }]
    })
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  if (!data.content) throw new Error(data.error?.message || "Unexpected API response");
  const text = data.content.map(b => b.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return { ...JSON.parse(clean), filename, id: Math.random().toString(36) };
}

// ─── OPTIMISATION 4: Memoised pure components ─────────────────────────────────

const VERDICT = {
  "Strong Match":  { bg:"#dcfce7", border:"#86efac", text:"#15803d", dot:"#16a34a" },
  "Good Match":    { bg:"#fef9c3", border:"#fde047", text:"#a16207", dot:"#ca8a04" },
  "Partial Match": { bg:"#ffedd5", border:"#fdba74", text:"#c2410c", dot:"#ea580c" },
  "Weak Match":    { bg:"#fee2e2", border:"#fca5a5", text:"#b91c1c", dot:"#dc2626" },
};

const VerdictBadge = memo(({ verdict }) => {
  const s = VERDICT[verdict] || VERDICT["Partial Match"];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600,
      padding:"3px 10px", borderRadius:20, border:`1px solid ${s.border}`, color:s.text, background:s.bg }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, display:"inline-block" }}/>
      {verdict}
    </span>
  );
});

const ScoreRing = memo(({ value, size = 56 }) => {
  const color = value >= 75 ? "#16a34a" : value >= 55 ? "#ca8a04" : "#dc2626";
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray 0.9s cubic-bezier(.4,0,.2,1)" }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
        fontWeight:700, fontSize: size > 48 ? 16 : 12, color, fontFamily:"monospace" }}>
        {value ?? "…"}
      </div>
    </div>
  );
});

const MiniBar = memo(({ value }) => {
  const color = value >= 75 ? "#16a34a" : value >= 55 ? "#ca8a04" : "#dc2626";
  return (
    <div style={{ height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden", flex:1 }}>
      <div style={{ height:"100%", width:`${value}%`, background:color, borderRadius:3, transition:"width 0.8s ease" }}/>
    </div>
  );
});

const Pill = memo(({ children, variant = "neutral" }) => {
  const styles = {
    green:   { bg:"#dcfce7", color:"#15803d" },
    red:     { bg:"#fee2e2", color:"#b91c1c" },
    neutral: { bg:"#f3f4f6", color:"#374151" },
    amber:   { bg:"#fef3c7", color:"#92400e" },
  };
  const s = styles[variant] || styles.neutral;
  return (
    <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:12, background:s.bg, color:s.color }}>
      {children}
    </span>
  );
});



function Spinner({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, color:"#6b7280", fontSize:13 }}>
      <div style={{ width:16, height:16, border:"2px solid #e5e7eb", borderTop:"2px solid #3b82f6",
        borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
      {label}
    </div>
  );
}

// ─── OPTIMISATION 5: Candidate row memoised — only re-renders if its own data changes
const CandidateRow = memo(({ c, rank, isActive, onClick }) => (
  <div className="cand-row"
    onClick={onClick}
    style={{ padding:"13px 16px", cursor:"pointer",
      borderLeft:`3px solid ${isActive ? "#3b82f6":"transparent"}`,
      background: isActive ? "#eff6ff" : "transparent",
      transition:"background .12s,border-left-color .12s",
      animation:"fadeUp .35s ease both" }}>
    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
      <ScoreRing value={c.overallScore} size={46}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:isActive?"#1e40af":"#111827",
          marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          <span style={{ color:"#9ca3af", fontFamily:"monospace", fontSize:10, marginRight:5 }}>#{rank}</span>
          {c.name || c.filename}
        </div>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:5 }}>
          {c.totalYearsExperience} yrs exp · {c.jobs?.length||0} roles
        </div>
        <VerdictBadge verdict={c.verdict}/>
      </div>
    </div>
  </div>
));

// ─── Detail panel (memoised — only re-renders when selected candidate changes)
const DetailPanel = memo(({ sel, rank, total }) => {
  if (!sel) return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:12 }}>
      <div style={{ fontSize:52 }}>👈</div>
      <div style={{ fontSize:20, fontWeight:800, color:"#374151", letterSpacing:"-.02em" }}>
        Select a candidate
      </div>
      <div style={{ fontSize:14, color:"#9ca3af", textAlign:"center", maxWidth:260, lineHeight:1.7 }}>
        {total > 0
          ? "Click any candidate on the left to view their full analysis"
          : "Upload PDF resumes using the panel on the left to get started"}
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth:760, animation:"fadeUp .3s ease" }}>

      {/* Header */}
      <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"28px 30px",
        marginBottom:18, boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:".1em", marginBottom:6 }}>
              RANK #{rank} OF {total}
            </div>
            <h2 style={{ margin:"0 0 4px", fontSize:28, fontWeight:800, color:"#111827", letterSpacing:"-.02em" }}>
              {sel.name}
            </h2>
            <div style={{ fontSize:14, color:"#6b7280", marginBottom:14 }}>
              {sel.email}{sel.phone && ` · ${sel.phone}`}
            </div>
            <VerdictBadge verdict={sel.verdict}/>
          </div>
          <ScoreRing value={sel.overallScore} size={70}/>
        </div>
        {sel.summary && (
          <div style={{ marginTop:18, padding:"13px 16px", background:"#f8fafc",
            borderRadius:10, borderLeft:"3px solid #3b82f6",
            fontSize:14, color:"#374151", lineHeight:1.75 }}>
            {sel.summary}
          </div>
        )}
      </div>

      {/* Score breakdown */}
      <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"22px 26px",
        marginBottom:18, boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:".1em", marginBottom:14 }}>
          SCORE BREAKDOWN
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {[
            { label:"Skills Match", val:sel.skillsScore,     icon:"⚡" },
            { label:"Experience",   val:sel.experienceScore, icon:"🏢" },
            { label:"Job Tenure",   val:sel.tenureScore,     icon:"📅" },
            { label:"Education",    val:sel.educationScore,  icon:"🎓" },
          ].map(({label,val,icon}) => (
            <div key={label} style={{ background:"#f8fafc", borderRadius:10, padding:"13px 15px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:13, color:"#374151", fontWeight:600 }}>{icon} {label}</span>
                <span style={{ fontFamily:"monospace", fontSize:15, fontWeight:700,
                  color:val>=75?"#16a34a":val>=55?"#ca8a04":"#dc2626" }}>{val}</span>
              </div>
              <MiniBar value={val}/>
            </div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginTop:14 }}>
          {[
            { label:"Total Exp",    val:`${sel.totalYearsExperience}y`,  warn:false },
            { label:"Avg Tenure",   val:sel.avgTenureMonths?`${Math.round(sel.avgTenureMonths)}mo`:"—", warn:sel.avgTenureMonths<18 },
            { label:"Longest Role", val:sel.longestTenureMonths?`${Math.round(sel.longestTenureMonths)}mo`:"—", warn:false },
            { label:"Short Stints", val:sel.shortStints??"-", warn:sel.shortStints>1 },
          ].map(({label,val,warn}) => (
            <div key={label} style={{ textAlign:"center", background:warn?"#fef2f2":"#f0f7ff",
              borderRadius:10, padding:"10px 6px", border:`1px solid ${warn?"#fecaca":"#bfdbfe"}` }}>
              <div style={{ fontFamily:"monospace", fontSize:18, fontWeight:800,
                color:warn?"#dc2626":"#1e40af" }}>{val}</div>
              <div style={{ fontSize:11, color:"#6b7280", marginTop:2, fontWeight:600 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Skills */}
      {(sel.matchedSkills?.length > 0 || sel.missingSkills?.length > 0) && (
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"22px 26px",
          marginBottom:18, boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:".1em", marginBottom:14 }}>SKILLS ANALYSIS</div>
          {sel.matchedSkills?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#15803d", marginBottom:8 }}>✓ Matched Skills</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {sel.matchedSkills.map(s => <Pill key={s} variant="green">{s}</Pill>)}
              </div>
            </div>
          )}
          {sel.missingSkills?.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#b91c1c", marginBottom:8 }}>✗ Missing Skills</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {sel.missingSkills.map(s => <Pill key={s} variant="red">{s}</Pill>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Strengths & concerns */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:18 }}>
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"20px 22px",
          boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#15803d", letterSpacing:".1em", marginBottom:12 }}>✓ STRENGTHS</div>
          {sel.strengths?.map((s,i) => (
            <div key={i} style={{ display:"flex", gap:8, marginBottom:9, fontSize:14, color:"#374151", lineHeight:1.5 }}>
              <span style={{ color:"#16a34a", fontWeight:800, flexShrink:0 }}>+</span>{s}
            </div>
          ))}
        </div>
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"20px 22px",
          boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#b91c1c", letterSpacing:".1em", marginBottom:12 }}>⚠ CONCERNS</div>
          {sel.concerns?.length > 0
            ? sel.concerns.map((s,i) => (
                <div key={i} style={{ display:"flex", gap:8, marginBottom:9, fontSize:14, color:"#374151", lineHeight:1.5 }}>
                  <span style={{ color:"#dc2626", fontWeight:800, flexShrink:0 }}>−</span>{s}
                </div>
              ))
            : <div style={{ fontSize:14, color:"#9ca3af", fontStyle:"italic" }}>No significant concerns</div>
          }
        </div>
      </div>

      {/* Recommendation */}
      {sel.recommendation && (
        <div style={{ background:"linear-gradient(135deg,#eff6ff,#f0f7ff)", borderRadius:16,
          border:"1px solid #bfdbfe", padding:"20px 24px", marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#1d4ed8", letterSpacing:".1em", marginBottom:10 }}>
            💡 HIRING RECOMMENDATION
          </div>
          <div style={{ fontSize:15, color:"#1e3a5f", lineHeight:1.8 }}>{sel.recommendation}</div>
        </div>
      )}

      {/* Work history */}
      {sel.jobs?.length > 0 && (
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"22px 26px",
          marginBottom:18, boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:".1em", marginBottom:18 }}>WORK HISTORY</div>
          <div style={{ position:"relative", paddingLeft:22, borderLeft:"2px solid #e5e7eb" }}>
            {sel.jobs.map((j,i) => {
              const short = j.durationMonths && j.durationMonths < 12;
              return (
                <div key={i} style={{ marginBottom:20, position:"relative" }}>
                  <div style={{ position:"absolute", left:-27, top:4, width:10, height:10,
                    borderRadius:"50%", border:`2.5px solid ${short?"#fca5a5":"#93c5fd"}`, background:"#fff" }}/>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:700, color:"#111827" }}>{j.title}</div>
                      <div style={{ fontSize:13, color:"#6b7280", marginTop:1 }}>{j.company}</div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ fontFamily:"monospace", fontSize:12, color:"#6b7280" }}>
                        {j.startYear||"?"} – {j.endYear||"Present"}
                      </div>
                      <div style={{ marginTop:4 }}>
                        <Pill variant={short?"amber":"neutral"}>~{j.durationMonths||"?"} mo{short?" ⚠":""}</Pill>
                      </div>
                    </div>
                  </div>
                  {j.highlights && (
                    <div style={{ fontSize:13, color:"#6b7280", marginTop:5, lineHeight:1.6 }}>{j.highlights}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Education */}
      {sel.education?.length > 0 && (
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", padding:"22px 26px",
          boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:".1em", marginBottom:14 }}>EDUCATION</div>
          {sel.education.map((e,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"10px 0", borderBottom:i < sel.education.length-1 ? "1px solid #f0f4f8":"none" }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{e.degree}</div>
                <div style={{ fontSize:13, color:"#6b7280" }}>{e.institution}</div>
              </div>
              <span style={{ fontFamily:"monospace", fontSize:13, color:"#9ca3af" }}>{e.year||"—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function HRScreening() {
  const [step, setStep]             = useState("job");
  const [jobTitle, setJobTitle]     = useState("");
  const [jobDesc, setJobDesc]       = useState("");
  const [candidates, setCandidates]   = useState([]);
  const [selected, setSelected]       = useState(null);
  const [dragOver, setDragOver]       = useState(false);
  const [errors, setErrors]           = useState([]);
  const [processingName, setProcessingName] = useState(null); // name of currently-processing file
  const fileRef = useRef();

  // ── OPTIMISATION 6: sorted list memoised so it only recomputes when candidates change
  const sorted = useMemo(
    () => [...candidates].sort((a,b) => b.overallScore - a.overallScore),
    [candidates]
  );

  const rankOf = useCallback((id) =>
    sorted.findIndex(c => c.id === id) + 1,
    [sorted]
  );

  const processFiles = useCallback(async (files) => {
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf");
    if (!pdfs.length) return;
    setErrors([]);

    // Read ALL files to base64 in parallel (CPU-only, no network — essentially free)
    const b64s = await Promise.all(pdfs.map(f => readFileAsBase64(f)));

    // Process resumes sequentially to avoid rate limits
    for (let i = 0; i < pdfs.length; i++) {
      setProcessingName(pdfs[i].name.replace(/\.pdf$/i, ""));
      try {
        const result = await analyseResume(b64s[i], pdfs[i].name, jobDesc);
        setCandidates(prev =>
          [...prev, result].sort((a, b) => b.overallScore - a.overallScore)
        );
      } catch (e) {
        setErrors(prev => [...prev, `${pdfs[i].name}: ${e.message}`]);
      }
    }
    setProcessingName(null);
  }, [jobDesc]);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const isProcessing = processingName !== null;

  // ── Step 1 ─────────────────────────────────────────────────────────────────
  if (step === "job") return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#f0f4ff 0%,#fafafa 60%,#f0fdf4 100%)",
      fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        * { box-sizing:border-box }
        input,textarea { outline:none; transition:border-color .15s,box-shadow .15s; }
        input:focus,textarea:focus { border-color:#3b82f6 !important; box-shadow:0 0 0 3px rgba(59,130,246,.12); }
      `}</style>

      <div style={{ background:"rgba(255,255,255,.85)", backdropFilter:"blur(8px)",
        borderBottom:"1px solid #e5e7eb", padding:"0 40px", height:60,
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, background:"linear-gradient(135deg,#1e40af,#3b82f6)",
            borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"0 2px 8px rgba(59,130,246,.4)" }}>
            <span style={{ color:"#fff", fontSize:16 }}>⚡</span>
          </div>
          <span style={{ fontSize:20, fontWeight:700, color:"#111827", letterSpacing:"-.02em" }}>TalentLens</span>
        </div>
        <div style={{ fontSize:13, color:"#9ca3af" }}>AI-Powered Candidate Screening</div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"60px 20px" }}>
        <div style={{ width:"100%", maxWidth:600, animation:"fadeUp .5s ease" }}>
          <div style={{ textAlign:"center", marginBottom:36 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"#eff6ff",
              border:"1px solid #bfdbfe", borderRadius:20, padding:"4px 14px",
              fontSize:12, fontWeight:700, color:"#1d4ed8", letterSpacing:".06em", marginBottom:16 }}>
              STEP 1 OF 2 — JOB DESCRIPTION
            </div>
            <h1 style={{ fontSize:36, fontWeight:800, color:"#111827", margin:"0 0 10px", letterSpacing:"-.03em" }}>
              What role are you hiring for?
            </h1>
            <p style={{ fontSize:16, color:"#6b7280", margin:0 }}>
              Paste the job description and we'll rank every applicant automatically.
            </p>
          </div>

          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #e5e7eb", padding:36,
            boxShadow:"0 8px 40px rgba(0,0,0,.08)" }}>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#374151",
                marginBottom:6, letterSpacing:".04em" }}>JOB TITLE</label>
              <input value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e5e7eb",
                  borderRadius:10, fontSize:15, color:"#111827", fontFamily:"inherit" }}/>
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:"block", fontSize:13, fontWeight:700, color:"#374151",
                marginBottom:6, letterSpacing:".04em" }}>FULL JOB DESCRIPTION</label>
              <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)}
                placeholder="Paste the complete job description — requirements, responsibilities, qualifications..."
                style={{ width:"100%", height:200, padding:"12px 14px", border:"1.5px solid #e5e7eb",
                  borderRadius:10, fontSize:14, color:"#111827", resize:"vertical",
                  lineHeight:1.7, fontFamily:"inherit" }}/>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                <span style={{ fontSize:12, color: jobDesc.length > 100 ? "#16a34a" : "#9ca3af" }}>
                  {jobDesc.length > 100 ? "✓ Looks good!" : `${Math.max(0,100-jobDesc.length)} more characters needed`}
                </span>
                <span style={{ fontSize:12, color:"#9ca3af" }}>{jobDesc.length} chars</span>
              </div>
            </div>
            <button onClick={() => { if (jobDesc.length > 100) setStep("screen"); }}
              disabled={jobDesc.length <= 100}
              style={{ width:"100%", padding:"14px",
                background: jobDesc.length > 100 ? "linear-gradient(135deg,#1e40af,#3b82f6)" : "#e5e7eb",
                color: jobDesc.length > 100 ? "#fff" : "#9ca3af",
                border:"none", borderRadius:12, fontSize:15, fontWeight:700,
                cursor: jobDesc.length > 100 ? "pointer" : "default",
                letterSpacing:".02em", transition:"all .2s",
                boxShadow: jobDesc.length > 100 ? "0 4px 16px rgba(59,130,246,.35)" : "none" }}>
              Continue — Upload Resumes →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 2 ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc",
      fontFamily:"system-ui,-apple-system,sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:5px }
        ::-webkit-scrollbar-track { background:#f1f5f9 }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px }
        .cand-row:hover { background:#f0f7ff !important; }
      `}</style>

      {/* Topbar */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", height:56,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"0 24px", flexShrink:0, boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:"linear-gradient(135deg,#1e40af,#3b82f6)",
            borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ color:"#fff", fontSize:13 }}>⚡</span>
          </div>
          <span style={{ fontSize:17, fontWeight:700, color:"#111827", letterSpacing:"-.02em" }}>TalentLens</span>
          <span style={{ width:1, height:16, background:"#e5e7eb", margin:"0 4px" }}/>
          <span style={{ fontSize:14, color:"#6b7280", maxWidth:280,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {jobTitle || "Untitled Position"}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {isProcessing && <Spinner label={`Analysing ${processingName}…`}/>}
          <span style={{ fontSize:13, fontWeight:600, color:"#374151", background:"#f3f4f6",
            padding:"4px 12px", borderRadius:20 }}>
            {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
          </span>
          <button onClick={() => { setStep("job"); setCandidates([]); setSelected(null); setErrors([]); }}
            style={{ fontSize:12, color:"#6b7280", background:"none", border:"1px solid #e5e7eb",
              borderRadius:7, padding:"5px 12px", cursor:"pointer" }}>
            ← Edit Job
          </button>
        </div>
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden", height:"calc(100vh - 56px)" }}>

        {/* Sidebar */}
        <div style={{ width:320, background:"#fff", borderRight:"1px solid #e5e7eb",
          display:"flex", flexDirection:"column", flexShrink:0 }}>

          {/* Upload */}
          <div style={{ padding:16, borderBottom:"2px solid #f0f4f8" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:".1em", marginBottom:10 }}>
              UPLOAD RESUMES
            </div>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              style={{
                border:`2.5px dashed ${dragOver ? "#3b82f6" : "#bfdbfe"}`,
                borderRadius:14, padding:"22px 16px", textAlign:"center", cursor:"pointer",
                background: dragOver ? "#eff6ff" : "linear-gradient(135deg,#f8fbff,#f0f7ff)",
                transition:"all .2s"
              }}>
              <div style={{ fontSize:30, marginBottom:6 }}>📂</div>
              <div style={{ fontSize:15, fontWeight:700, color:"#1e40af", marginBottom:3 }}>
                Drop PDF Resumes Here
              </div>
              <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.6 }}>
                or <span style={{ color:"#3b82f6", fontWeight:700 }}>click to browse</span>
              </div>
              <div style={{ marginTop:10, display:"inline-flex", alignItems:"center", gap:5,
                fontSize:11, fontWeight:600, color:"#6b7280", background:"#e8f0fe",
                padding:"4px 12px", borderRadius:20 }}>
                📄 Multiple PDFs supported
              </div>
              <input ref={fileRef} type="file" accept=".pdf" multiple hidden
                onChange={e => processFiles(e.target.files)}/>
            </div>
            {errors.map((err,i) => (
              <div key={i} style={{ fontSize:12, color:"#dc2626", marginTop:8, padding:"7px 10px",
                background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8 }}>⚠ {err}</div>
            ))}
          </div>

          {/* Candidate list */}
          <div style={{ flex:1, overflowY:"auto" }}>
            {sorted.length === 0 && !isProcessing ? (
              <div style={{ padding:"44px 20px", textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:10 }}>🗂️</div>
                <div style={{ fontSize:14, fontWeight:600, color:"#374151", marginBottom:4 }}>No candidates yet</div>
                <div style={{ fontSize:13, color:"#9ca3af", lineHeight:1.6 }}>
                  Upload PDF resumes above to<br/>start screening and ranking
                </div>
              </div>
            ) : (
              <>
                {sorted.length > 0 && (
                  <div style={{ padding:"10px 16px 4px", fontSize:11, fontWeight:700,
                    color:"#9ca3af", letterSpacing:".1em" }}>
                    RANKED BY MATCH SCORE
                  </div>
                )}
                {sorted.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    c={c}
                    rank={i + 1}
                    isActive={selected?.id === c.id}
                    onClick={() => setSelected(c)}
                  />
                ))}
                {isProcessing && (
                  <div style={{ padding:"13px 16px", opacity:.6, borderLeft:"3px solid #bfdbfe" }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                      <div style={{ width:46, height:46, background:"#f3f4f6", borderRadius:"50%", flexShrink:0,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <div style={{ width:18, height:18, border:"2.5px solid #e5e7eb", borderTop:"2.5px solid #3b82f6",
                          borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
                      </div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{processingName}</div>
                        <div style={{ fontSize:12, color:"#9ca3af" }}>Analysing…</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Detail */}
        <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
          <DetailPanel
            sel={selected}
            rank={selected ? rankOf(selected.id) : 0}
            total={candidates.length}
          />
        </div>
      </div>
    </div>
  );
}
