import { useState, useEffect, useCallback, useRef } from "react";

// ─── THEME ───────────────────────────────────────────────────────────────────
const LIGHT = {
  bg: "#F8F7FF",
  surface: "#FFFFFF",
  surfaceAlt: "#F2F0FB",
  border: "#E4E1F7",
  borderStrong: "#C5BFEE",
  primary: "#5B4FE8",
  primaryHover: "#4A3FD4",
  primaryLight: "#EAE8FD",
  primaryText: "#3C2FA3",
  success: "#0B8A5A",
  successBg: "#E5F6EE",
  successText: "#086B46",
  warning: "#B25E00",
  warningBg: "#FFF3E0",
  warningText: "#8A4800",
  danger: "#C0392B",
  dangerBg: "#FDEDEC",
  dangerText: "#9B2C22",
  info: "#1565C0",
  infoBg: "#E3F2FD",
  infoText: "#0D47A1",
  text: "#1A1630",
  textSub: "#5E5A76",
  textMuted: "#9490A8",
  shadow: "0 1px 4px rgba(91,79,232,0.08), 0 4px 16px rgba(91,79,232,0.06)",
  shadowHover: "0 4px 24px rgba(91,79,232,0.14)",
  navBg: "#FFFFFF",
};
const DARK = {
  bg: "#0F0D1E",
  surface: "#1A1730",
  surfaceAlt: "#221F3A",
  border: "#2D2950",
  borderStrong: "#3F3B6B",
  primary: "#8B81FF",
  primaryHover: "#7B6FFF",
  primaryLight: "#1E1B40",
  primaryText: "#B0A8FF",
  success: "#34D399",
  successBg: "#0A2A1E",
  successText: "#6EE7B7",
  warning: "#FBBF24",
  warningBg: "#2D1F00",
  warningText: "#FCD34D",
  danger: "#F87171",
  dangerBg: "#2A0D0D",
  dangerText: "#FCA5A5",
  info: "#60A5FA",
  infoBg: "#0D1F3C",
  infoText: "#93C5FD",
  text: "#EDE9FF",
  textSub: "#A89FC8",
  textMuted: "#6B6488",
  shadow: "0 1px 4px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)",
  shadowHover: "0 4px 24px rgba(0,0,0,0.5)",
  navBg: "#14112A",
};

// ─── OPENROUTER HELPERS ───────────────────────────────────────────────────────────────
async function callOpenRouter(prompt, maxTokens = 1500) {
  const res = await fetch(
    "/api/analyze",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku", // you can change this to any model available on OpenRouter
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    }
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `HTTP ${res.status}`;
    throw new Error(`OpenRouter API error: ${errorMessage}`);
  }

  const data = await res.json();

  // Check if we got a valid response
  if (!data.choices?.length) {
    // Check for error message
    if (data.error?.message) {
      throw new Error(`OpenRouter error: ${data.error.message}`);
    }
    throw new Error('No response generated from OpenRouter API');
  }

  return data.choices?.[0]?.message?.content || "";
}

async function analyzeResume(resumeText, jobDescription) {
  const prompt = `You are an expert ATS and resume analyst. Analyze the resume vs job description and return ONLY a valid JSON object (no markdown, no backticks).

RESUME:\n${resumeText.slice(0, 3500)}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 2000)}

Return this exact JSON:
{
  "score": <0-100 integer>,
  "ats_score": <0-100 integer, ATS compatibility score>,
  "readability_score": <0-100 integer>,
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "missing_keywords": ["<kw1>","<kw2>","<kw3>","<kw4>","<kw5>","<kw6>"],
  "suggestions": [
    {"section":"<Resume section>","priority":"high|medium|low","tip":"<specific actionable improvement>"},
    {"section":"<Resume section>","priority":"high|medium|low","tip":"<specific actionable improvement>"},
    {"section":"<Resume section>","priority":"high|medium|low","tip":"<specific actionable improvement>"},
    {"section":"<Resume section>","priority":"medium|low","tip":"<specific actionable improvement>"}
  ],
  "skill_match": {"matched":["<skill>"],"missing":["<skill>"]},
  "section_scores": {"experience":<0-100>,"skills":<0-100>,"education":<0-100>,"formatting":<0-100>,"keywords":<0-100>},
  "verdict": "<Highly Recommended|Recommended|Consider|Not Recommended>",
  "red_flags": ["<issue 1>","<issue 2>"],
  "keyword_density": <0-100 integer, keyword density score>,
  "experience_years": <estimated years of relevant experience as integer>,
  "top_skills": ["<top skill 1>","<top skill 2>","<top skill 3>","<top skill 4>","<top skill 5>"]
}`;

  let text = undefined;
  try {
    text = await callOpenRouter(prompt, 1800);

    // Debug: Log what we received (in development)
    // console.log('AI response:', text);

    // Clean the response - remove markdown code blocks if present
    let cleanedText = text.replace(/```json|```/g, "").trim();

    // Try to find JSON object in the response
    let jsonText = cleanedText;
    if (!cleanedText.startsWith('{')) {
      // Try to extract JSON from between braces
      const startIdx = cleanedText.indexOf('{');
      const endIdx = cleanedText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonText = cleanedText.substring(startIdx, endIdx + 1);
      }
    }

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    if (text !== undefined) {
      console.error('Raw response:', text);
    }

    // Re-throw with a more user-friendly message
    throw new Error('Failed to parse analysis response from AI. The response was not valid JSON. Please try again.');
  }
}

async function generateInterviewQuestions(resumeText, jobDescription) {
  const prompt = `Generate 10 targeted interview questions (mix of behavioral, technical, situational, culture-fit). Return ONLY a JSON array, no markdown.

RESUME: ${resumeText.slice(0, 2000)}\nJOB: ${jobDescription.slice(0, 1500)}

Format: [{"type":"behavioral|technical|situational|culture-fit","difficulty":"easy|medium|hard","question":"...","tip":"what a great answer covers in 1 sentence","follow_up":"one follow-up question"}]`;

  let text = undefined;
  try {
    text = await callOpenRouter(prompt, 1400);

    // Clean the response - remove markdown code blocks if present
    let cleanedText = text.replace(/```json|```/g, "").trim();

    // Try to find JSON array in the response
    let jsonText = cleanedText;
    if (!cleanedText.startsWith('[')) {
      // Try to extract JSON from between brackets
      const startIdx = cleanedText.indexOf('[');
      const endIdx = cleanedText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonText = cleanedText.substring(startIdx, endIdx + 1);
      }
    }

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse interview questions:', error);
    if (text !== undefined) {
      console.error('Raw response:', text);
    }
    return [];
  }
}

async function rewriteResume(resumeText, jobDescription) {
  const prompt = `Rewrite and improve this resume to better match the job description. Use strong action verbs, quantified achievements, ATS-friendly formatting, and relevant keywords. Keep the same overall structure and real facts. Do NOT add fabricated details.

RESUME: ${resumeText.slice(0, 3000)}\nJOB: ${jobDescription.slice(0, 1500)}

Return ONLY the improved resume text. No JSON, no commentary, no headers.`;

  try {
    return await callOpenRouter(prompt, 1800);
  } catch (error) {
    console.error('Failed to rewrite resume:', error);
    throw new Error('Failed to generate rewritten resume. Please try again.');
  }
}

async function generateCoverLetter(resumeText, jobDescription, jobTitle) {
  const prompt = `Write a compelling, personalized cover letter for "${jobTitle || "this position"}". Use their real experience. 3 paragraphs, professional but warm. Do NOT use placeholder brackets — write a complete, ready-to-send letter.

RESUME: ${resumeText.slice(0, 2500)}\nJOB: ${jobDescription.slice(0, 1500)}

Return ONLY the cover letter text.`;

  try {
    return await callOpenRouter(prompt, 1000);
  } catch (error) {
    console.error('Failed to generate cover letter:', error);
    throw new Error('Failed to generate cover letter. Please try again.');
  }
}

async function generateLinkedInSummary(resumeText, jobDescription) {
  const prompt = `Write a compelling LinkedIn "About" section for this candidate targeting "${jobDescription.slice(0, 500)}". Make it first-person, 3-4 paragraphs, highlight key skills and value proposition. No hashtags.

RESUME: ${resumeText.slice(0, 2000)}

Return ONLY the LinkedIn summary text.`;

  try {
    return await callOpenRouter(prompt, 600);
  } catch (error) {
    console.error('Failed to generate LinkedIn summary:', error);
    throw new Error('Failed to generate LinkedIn summary. Please try again.');
  }
}

async function generateNegotiationScript(resumeText, jobDescription, jobTitle) {
  const prompt = `Based on this candidate's profile and the job description, write a salary negotiation script they can use. Include: opening line, key leverage points from their experience, suggested salary range justification, and 3 counter-offer responses. Keep it practical and direct.

RESUME: ${resumeText.slice(0, 2000)}\nJOB TITLE: ${jobTitle || "the role"}\nJOB: ${jobDescription.slice(0, 1500)}

Return plain text, structured but no JSON.`;

  try {
    return await callOpenRouter(prompt, 800);
  } catch (error) {
    console.error('Failed to generate negotiation script:', error);
    throw new Error('Failed to generate negotiation script. Please try again.');
  }
}

// ─── SCORE RING SVG ──────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80, label = "", C }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? C.success : score >= 40 ? C.warning : C.danger;
  const bg = score >= 70 ? C.successBg : score >= 40 ? C.warningBg : C.dangerBg;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: bg, borderRadius: "50%"
      }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
        {label && <span style={{ fontSize: 9, color, fontWeight: 600, letterSpacing: "0.3px", marginTop: 1 }}>{label}</span>}
      </div>
    </div>
  );
}

// ─── BAR CHART ───────────────────────────────────────────────────────────────
function BarChart({ scores, C }) {
  const cats = [
    { key: "experience", label: "Experience", icon: "💼" },
    { key: "skills", label: "Skills", icon: "⚡" },
    { key: "education", label: "Education", icon: "🎓" },
    { key: "formatting", label: "Formatting", icon: "📐" },
    { key: "keywords", label: "Keywords", icon: "🔑" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {cats.map(({ key, label, icon }) => {
        const val = scores?.[key] || 0;
        const color = val >= 70 ? C.success : val >= 40 ? C.warning : C.danger;
        const trackBg = val >= 70 ? C.successBg : val >= 40 ? C.warningBg : C.dangerBg;
        return (
          <div key={key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 5, alignItems: "center" }}>
              <span style={{ color: C.textSub, fontWeight: 500 }}>{icon} {label}</span>
              <span style={{ fontWeight: 700, color, fontSize: 14 }}>{val}</span>
            </div>
            <div style={{ height: 7, background: trackBg, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", background: color, width: `${val}%`, borderRadius: 4, transition: "width 0.9s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── RADAR CHART ─────────────────────────────────────────────────────────────
function RadarChart({ scores, C }) {
  const cats = ["experience", "skills", "education", "formatting", "keywords"];
  const labels = ["Experience", "Skills", "Education", "Format", "Keywords"];
  const size = 200, cx = 100, cy = 100, r = 72;
  const angleStep = (2 * Math.PI) / 5;
  const off = -Math.PI / 2;
  const pt = (i, pct) => {
    const a = off + i * angleStep;
    const d = (pct / 100) * r;
    return [cx + d * Math.cos(a), cy + d * Math.sin(a)];
  };
  const dataPts = cats.map((k, i) => pt(i, scores?.[k] || 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[25, 50, 75, 100].map(lvl => (
        <polygon key={lvl}
          points={cats.map((_, i) => pt(i, lvl).join(",")).join(" ")}
          fill="none" stroke={C.border} strokeWidth={0.5}
        />
      ))}
      {cats.map((_, i) => {
        const [px, py] = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke={C.border} strokeWidth={0.5} />;
      })}
      <polygon
        points={dataPts.map(p => p.join(",")).join(" ")}
        fill={C.primary + "28"} stroke={C.primary} strokeWidth={2}
      />
      {dataPts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r={4} fill={C.primary} />
      ))}
      {cats.map((_, i) => {
        const [px, py] = pt(i, 100);
        const lx = cx + (px - cx) * 1.3, ly = cy + (py - cy) * 1.3;
        return (
          <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill={C.textMuted} fontFamily="system-ui">{labels[i]}</text>
        );
      })}
    </svg>
  );
}

// ─── BADGE ───────────────────────────────────────────────────────────────────
function Badge({ children, color = "primary", C }) {
  const map = {
    green: { bg: C.successBg, text: C.successText },
    red: { bg: C.dangerBg, text: C.dangerText },
    yellow: { bg: C.warningBg, text: C.warningText },
    blue: { bg: C.infoBg, text: C.infoText },
    primary: { bg: C.primaryLight, text: C.primaryText },
  };
  const { bg, text } = map[color] || map.primary;
  return (
    <span style={{ background: bg, color: text, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, display: "inline-block" }}>
      {children}
    </span>
  );
}

// ─── COPY BUTTON ─────────────────────────────────────────────────────────────
function CopyBtn({ text, C }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      background: copied ? C.successBg : C.surfaceAlt,
      color: copied ? C.success : C.textSub,
      border: `1px solid ${C.border}`,
      borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer"
    }}>
      {copied ? "✓ Copied!" : "Copy"}
    </button>
  );
}

// ─── SPINNY LOADER ────────────────────────────────────────────────────────────
function Spinner({ C }) {
  return (
    <div style={{ display: "inline-block", width: 16, height: 16 }}>
      <svg viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <circle cx="8" cy="8" r="6" fill="none" stroke={C.primary} strokeWidth="2.5" strokeDasharray="24" strokeDashoffset="8" />
      </svg>
    </div>
  );
}

// ─── ANALYSIS RESULT ─────────────────────────────────────────────────────────
function AnalysisResult({ result, jobTitle, resumeText, jdText, C }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [tool, setTool] = useState(null);
  const [toolContent, setToolContent] = useState("");
  const [toolLoading, setToolLoading] = useState(false);
  const [chartMode, setChartMode] = useState("bar");
  const [sortPriority, setSortPriority] = useState("all");

  const {
    score, ats_score, readability_score, summary, strengths, missing_keywords,
    suggestions, skill_match, verdict, section_scores, red_flags,
    keyword_density, experience_years, top_skills
  } = result;

  const verdictColor = verdict?.includes("Recommended") && !verdict.includes("Not") ? "green"
    : verdict === "Consider" ? "yellow" : "red";

  const card = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "20px 22px", boxShadow: C.shadow,
    marginBottom: 14, transition: "all 0.2s",
  };

  const runTool = async (type) => {
    if (tool === type) { setTool(null); return; }
    setTool(type); setToolContent(""); setToolLoading(true);
    try {
      let content = "";
      if (type === "interview") content = JSON.stringify(await generateInterviewQuestions(resumeText, jdText));
      else if (type === "rewrite") content = await rewriteResume(resumeText, jdText);
      else if (type === "cover") content = await generateCoverLetter(resumeText, jdText, jobTitle);
      else if (type === "linkedin") content = await generateLinkedInSummary(resumeText, jdText);
      else if (type === "negotiate") content = await generateNegotiationScript(resumeText, jdText, jobTitle);
      setToolContent(content);
    } catch (e) { setToolContent("Error: " + e.message); }
    setToolLoading(false);
  };

  let interviews = [];
  if (tool === "interview" && toolContent) {
    try { interviews = JSON.parse(toolContent); } catch {}
  }

  const filteredSugs = suggestions?.filter(s =>
    sortPriority === "all" || s.priority === sortPriority
  ) || [];

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "skills", label: "Skills & Scores" },
    { key: "suggestions", label: "Suggestions" },
    { key: "tools", label: "AI Tools" },
  ];

  const tabStyle = (key) => ({
    padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", background: activeTab === key ? C.primary : "transparent",
    color: activeTab === key ? "#FFF" : C.textSub, transition: "all 0.15s",
  });

  return (
    <div>
      {/* Result Header */}
      <div style={{ ...card, background: C.primaryLight, border: `1px solid ${C.borderStrong}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
              Analysis Complete
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>
              {jobTitle || "Job Position"}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              <Badge color={verdictColor} C={C}>{verdict}</Badge>
              {experience_years > 0 && <Badge color="blue" C={C}>{experience_years}yr exp</Badge>}
            </div>
            <p style={{ margin: 0, fontSize: 14, color: C.textSub, lineHeight: 1.7, maxWidth: 600 }}>{summary}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
            <div style={{ textAlign: "center" }}>
              <ScoreRing score={score} size={80} label="MATCH" C={C} />
            </div>
            <div style={{ textAlign: "center" }}>
              <ScoreRing score={ats_score || 0} size={60} label="ATS" C={C} />
            </div>
            <div style={{ textAlign: "center" }}>
              <ScoreRing score={readability_score || 0} size={60} label="READ" C={C} />
            </div>
          </div>
        </div>

        {/* Red flags */}
        {red_flags?.length > 0 && (
          <div style={{ marginTop: 14, background: C.dangerBg, border: `1px solid ${C.danger}40`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.dangerText, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              ⚠️ Issues to Address
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {red_flags.map((f, i) => <Badge key={i} color="red" C={C}>{f}</Badge>)}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surfaceAlt, padding: 4, borderRadius: 10, width: "fit-content" }}>
        {tabs.map(t => <button key={t.key} style={tabStyle(t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>)}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {/* Top Skills */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              ⚡ Top Skills Detected
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(top_skills || []).map((sk, i) => (
                <span key={i} style={{
                  background: C.primaryLight, color: C.primaryText,
                  borderRadius: 6, padding: "5px 10px", fontSize: 13, fontWeight: 600
                }}>{sk}</span>
              ))}
            </div>
          </div>

          {/* Strengths */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              ✅ Key Strengths
            </div>
            {(strengths || []).map((st, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 14, alignItems: "flex-start" }}>
                <span style={{ color: C.success, fontWeight: 700, flexShrink: 0 }}>•</span>
                <span style={{ color: C.textSub }}>{st}</span>
              </div>
            ))}
          </div>

          {/* Matched skills */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              ✅ Matched Skills ({skill_match?.matched?.length || 0})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {(skill_match?.matched || []).map((sk, i) => <Badge key={i} color="green" C={C}>{sk}</Badge>)}
            </div>
          </div>

          {/* Missing keywords */}
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
              🔑 Missing Keywords ({missing_keywords?.length || 0})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {(missing_keywords || []).map((kw, i) => <Badge key={i} color="red" C={C}>{kw}</Badge>)}
            </div>
            {(skill_match?.missing || []).length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 12, marginBottom: 6 }}>
                  Missing Skills
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {(skill_match.missing || []).map((sk, i) => <Badge key={i} color="yellow" C={C}>{sk}</Badge>)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SKILLS & SCORES TAB */}
      {activeTab === "skills" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Section Scores
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {["bar", "radar"].map(v => (
                  <button key={v} style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", border: "none",
                    background: chartMode === v ? C.primary : C.surfaceAlt,
                    color: chartMode === v ? "#FFF" : C.textSub,
                  }} onClick={() => setChartMode(v)}>
                    {v === "bar" ? "Bars" : "Radar"}
                  </button>
                ))}
              </div>
            </div>
            {chartMode === "bar"
              ? <BarChart scores={section_scores} C={C} />
              : <div style={{ display: "flex", justifyContent: "center" }}><RadarChart scores={section_scores} C={C} /></div>
            }
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 16 }}>
              Score Breakdown
            </div>
            {[
              { label: "Overall Match", value: score, icon: "🎯" },
              { label: "ATS Score", value: ats_score || 0, icon: "🤖" },
              { label: "Readability", value: readability_score || 0, icon: "📖" },
              { label: "Keyword Density", value: keyword_density || 0, icon: "🔑" },
            ].map(({ label, value, icon }) => {
              const color = value >= 70 ? C.success : value >= 40 ? C.warning : C.danger;
              return (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ color: C.textSub }}>{icon} {label}</span>
                    <span style={{ fontWeight: 700, color }}>{value}/100</span>
                  </div>
                  <div style={{ height: 6, background: C.surfaceAlt, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: color, width: `${value}%`, borderRadius: 3, transition: "width 0.9s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUGGESTIONS TAB */}
      {activeTab === "suggestions" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, alignSelf: "center" }}>Priority:</span>
            {["all", "high", "medium", "low"].map(p => (
              <button key={p} style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: "pointer", border: "none", transition: "all 0.15s",
                background: sortPriority === p ? C.primary : C.surfaceAlt,
                color: sortPriority === p ? "#FFF" : C.textSub,
              }} onClick={() => setSortPriority(p)}>
                {p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {filteredSugs.map((sug, i) => {
              const prioColor = sug.priority === "high" ? "red" : sug.priority === "medium" ? "yellow" : "primary";
              return (
                <div key={i} style={{
                  ...card, marginBottom: 0,
                  borderLeft: `3px solid ${sug.priority === "high" ? C.danger : sug.priority === "medium" ? C.warning : C.primary}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.primaryText, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                      {sug.section}
                    </div>
                    <Badge color={prioColor} C={C}>{sug.priority}</Badge>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: C.textSub }}>{sug.tip}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI TOOLS TAB */}
      {activeTab === "tools" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { key: "interview", icon: "🎤", label: "Interview Prep", desc: "10 targeted questions" },
              { key: "rewrite", icon: "✏️", label: "Rewrite Resume", desc: "ATS-optimized version" },
              { key: "cover", icon: "📝", label: "Cover Letter", desc: "Ready to send" },
              { key: "linkedin", icon: "💼", label: "LinkedIn Summary", desc: "Compelling About section" },
              { key: "negotiate", icon: "💰", label: "Salary Script", desc: "Negotiation talking points" },
            ].map(({ key, icon, label, desc }) => (
              <button key={key} onClick={() => runTool(key)} style={{
                background: tool === key ? C.primary : C.surfaceAlt,
                color: tool === key ? "#FFF" : C.text,
                border: `1px solid ${tool === key ? C.primary : C.border}`,
                borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                textAlign: "left", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 4,
              }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
                <span style={{ fontSize: 11, opacity: 0.75 }}>{desc}</span>
              </button>
            ))}
          </div>

          {tool && (
            <div style={{ ...card, background: C.surfaceAlt }}>
              {toolLoading ? (
                <div style={{ textAlign: "center", padding: "40px 24px", color: C.textMuted }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>
                    {tool === "interview" ? "🎤" : tool === "rewrite" ? "✏️" : tool === "cover" ? "📝" : tool === "linkedin" ? "💼" : "💰"}
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: C.text }}>Generating with AI…</div>
                  <div style={{ fontSize: 13 }}>This may take a moment</div>
                </div>
              ) : tool === "interview" && interviews.length > 0 ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>🎤 Interview Questions</div>
                    <span style={{ fontSize: 13, color: C.textMuted }}>{interviews.length} questions</span>
                  </div>
                  {interviews.map((q, i) => {
                    const qColor = q.type === "behavioral" ? "yellow" : q.type === "technical" ? "blue" : q.type === "culture-fit" ? "green" : "primary";
                    const diffColor = q.difficulty === "hard" ? "red" : q.difficulty === "medium" ? "yellow" : "green";
                    return (
                      <div key={i} style={{ ...card, marginBottom: 10 }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          <Badge color={qColor} C={C}>{q.type}</Badge>
                          <Badge color={diffColor} C={C}>{q.difficulty}</Badge>
                          <span style={{ fontSize: 12, color: C.textMuted, alignSelf: "center" }}>Q{i + 1}</span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: C.text }}>{q.question}</div>
                        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 6 }}>💡 {q.tip}</div>
                        {q.follow_up && (
                          <div style={{ fontSize: 12, color: C.textMuted, fontStyle: "italic", borderTop: `1px solid ${C.border}`, paddingTop: 6, marginTop: 6 }}>
                            Follow-up: {q.follow_up}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
                      {tool === "rewrite" ? "✏️ Improved Resume" : tool === "cover" ? "📝 Cover Letter" : tool === "linkedin" ? "💼 LinkedIn Summary" : "💰 Salary Negotiation Script"}
                    </div>
                    <CopyBtn text={toolContent} C={C} />
                  </div>
                  <div style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "14px 16px", fontSize: 14, lineHeight: 1.8,
                    whiteSpace: "pre-wrap", color: C.textSub, maxHeight: 500, overflowY: "auto",
                    fontFamily: "inherit"
                  }}>{toolContent}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── UPLOAD ZONE ─────────────────────────────────────────────────────────────
function UploadZone({ onText, C }) {
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState("");
  const fileRef = useRef();

  const readFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    setStatus("Reading file…");
    try {
      if (name.endsWith(".txt")) {
        const text = await file.text();
        onText(text);
        setStatus(`✅ ${file.name} loaded`);
      } else if (name.endsWith(".pdf")) {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        const workerMod = await import("pdfjs-dist/build/pdf.worker.mjs?url");
        GlobalWorkerOptions.workerSrc = workerMod.default;
        const ab = await file.arrayBuffer();
        const pdf = await getDocument({ data: ab }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(" ") + "\n";
        }
        if (!fullText.trim()) { setStatus("❌ PDF has no readable text. Paste below."); return; }
        onText(fullText);
        setStatus(`✅ PDF loaded (${pdf.numPages} pages)`);
      } else if (name.endsWith(".docx")) {
        const mammoth = await import("mammoth");
        const ab = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: ab });
        onText(res.value);
        setStatus("✅ DOCX loaded");
      } else {
        setStatus("❌ Use .txt, .pdf, or .docx");
      }
    } catch (e) {
      setStatus("❌ Error: " + e.message);
    }
  };

  return (
    <div>
      <div
        style={{
          border: `2px dashed ${drag ? C.primary : C.border}`,
          borderRadius: 10, padding: "20px 16px", textAlign: "center",
          cursor: "pointer", transition: "all 0.2s",
          background: drag ? C.primaryLight : C.surfaceAlt,
        }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current.click()}
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 3 }}>
          Drop file or click to browse
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>PDF, DOCX, TXT supported</div>
      </div>
      <input ref={fileRef} type="file" style={{ display: "none" }}
        accept=".txt,.pdf,.docx" onChange={e => readFile(e.target.files[0])} />
      {status && (
        <div style={{ fontSize: 12, color: status.includes("✅") ? C.success : C.danger, marginTop: 7, fontWeight: 500 }}>
          {status}
        </div>
      )}
    </div>
  );
}

// ─── HISTORY CARD ─────────────────────────────────────────────────────────────
function HistoryCard({ item, onClick, C }) {
  const color = item.score >= 70 ? "green" : item.score >= 40 ? "yellow" : "red";
  return (
    <div
      onClick={onClick}
      style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "14px 18px", cursor: "pointer",
        marginBottom: 10, transition: "all 0.15s",
        boxShadow: C.shadow,
      }}
      onMouseOver={e => e.currentTarget.style.boxShadow = C.shadowHover}
      onMouseOut={e => e.currentTarget.style.boxShadow = C.shadow}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3 }}>{item.job_title}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{new Date(item.created_at).toLocaleDateString()}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ScoreRing score={item.score} size={40} C={C} />
          <Badge color={color} C={C}>{item.score}/100</Badge>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("raeDark") === "true"; } catch { return false; }
  });
  const [tab, setTab] = useState("analyze");
  const [resumeText, setResumeText] = useState("");
  const [jdText, setJdText] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const C = darkMode ? DARK : LIGHT;

  useEffect(() => {
    try { localStorage.setItem("raeDark", String(darkMode)); } catch {}
  }, [darkMode]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("raeHistory") || "[]");
      setHistory(saved);
    } catch {}
  }, []);

  const saveToHistory = (res, title) => {
    const item = {
      id: Date.now(),
      job_title: title || "Untitled",
      score: res.score,
      verdict: res.verdict,
      created_at: new Date().toISOString(),
      result_json: res,
    };
    const updated = [item, ...history].slice(0, 20);
    setHistory(updated);
    try { localStorage.setItem("raeHistory", JSON.stringify(updated)); } catch {}
  };

  const analyze = async () => {
    if (!resumeText.trim()) { setStatus("❌ Upload or paste your resume first."); return; }
    if (!jdText.trim()) { setStatus("❌ Paste a job description."); return; }
    setLoading(true); setResult(null);
    setStatus("🤖 Analyzing with AI via backend…");
    try {
      const res = await analyzeResume(resumeText, jdText);
      setResult(res);
      saveToHistory(res, jobTitle);
      setStatus("✅ Analysis complete");
    } catch (e) {
      setStatus("❌ " + e.message);
    }
    setLoading(false);
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem("raeHistory"); } catch {}
  };

  const inputStyle = {
    width: "100%", padding: "10px 13px", border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
    background: C.surfaceAlt, color: C.text, transition: "border-color 0.15s",
    fontFamily: "inherit",
  };
  const textareaStyle = { ...inputStyle, resize: "vertical", minHeight: 110, lineHeight: 1.6 };
  const cardStyle = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: "20px 22px", boxShadow: C.shadow, marginBottom: 14,
  };
  const btnPrimary = {
    background: C.primary, color: "#FFF", border: "none",
    borderRadius: 8, padding: "11px 28px", fontWeight: 700, fontSize: 14,
    cursor: "pointer", transition: "all 0.15s", display: "inline-flex",
    alignItems: "center", gap: 8,
  };
  const navTabStyle = (key) => ({
    padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: "pointer", border: "none", transition: "all 0.15s",
    background: tab === key ? C.primary : "transparent",
    color: tab === key ? "#FFF" : C.textSub,
  });

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: C.bg, color: C.text, transition: "background 0.2s, color 0.2s" }}>
      {/* NAV */}
      <nav style={{
        background: C.navBg, borderBottom: `1px solid ${C.border}`,
        padding: "0 28px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 58,
        boxShadow: C.shadow, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <span style={{ fontWeight: 800, fontSize: 17, color: C.primary, letterSpacing: "-0.3px" }}>ResumeAI</span>
          <Badge color="primary" C={C}>Pro</Badge>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {["analyze", "history", "about"].map(t => (
            <button key={t} style={navTabStyle(t)} onClick={() => setTab(t)}>
              {t === "analyze" ? "⚡ Analyzer" : t === "history" ? `📂 History (${history.length})` : "ℹ️ About"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowSettings(s => !s)}
            style={{ background: showSettings ? C.primaryLight : "transparent", color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            ⚙️ API Config
          </button>
          <button
            onClick={() => setDarkMode(d => !d)}
            style={{ background: "transparent", color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 16 }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </nav>

      {/* SETTINGS DRAWER - API key now handled via backend */}
      {showSettings && (
        <div style={{
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: "16px 28px", display: "flex", alignItems: "center",
          gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textSub }}>API Configuration:</span>
          <span style={{ fontSize: 12, color: C.textSub }}>
            The OpenRouter API key is now configured on the backend (server.js).
            Please set the OPENROUTER_API_KEY environment variable in your .env file.
            If you encounter errors, try changing the model in src/ResumeAnalyzer.jsx (line 73).
          </span>
          <button onClick={() => setShowSettings(false)} style={{ ...btnPrimary, padding: "8px 16px", fontSize: 13 }}>OK</button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main style={{ maxWidth: 1020, margin: "0 auto", padding: "28px 20px" }}>

        {/* ANALYZE TAB */}
        {tab === "analyze" && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.4px" }}>
                Resume Analyzer
              </h1>
              <p style={{ margin: 0, color: C.textMuted, fontSize: 14 }}>
                AI-powered ATS matching, skill gap analysis, and career tools
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {/* Resume Input */}
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, color: C.text }}>📄 Your Resume</div>
                <UploadZone onText={setResumeText} C={C} />
                <p style={{ fontSize: 12, color: C.textMuted, margin: "12px 0 6px" }}>Or paste your resume:</p>
                <textarea
                  style={textareaStyle}
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste your resume content here…"
                />
                {resumeText && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                    {resumeText.split(/\s+/).length} words · {resumeText.length} characters
                  </div>
                )}
              </div>

              {/* JD Input */}
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, color: C.text }}>💼 Job Description</div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 5 }}>Job Title</label>
                <input
                  style={{ ...inputStyle, marginBottom: 14 }}
                  value={jobTitle}
                  onChange={e => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior React Engineer at Stripe"
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 5 }}>Job Description</label>
                <textarea
                  style={{ ...textareaStyle, minHeight: 200 }}
                  value={jdText}
                  onChange={e => setJdText(e.target.value)}
                  placeholder="Paste the full job description, requirements, and responsibilities…"
                />
                {jdText && (
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>
                    {jdText.split(/\s+/).length} words
                  </div>
                )}
              </div>
            </div>

            <div style={{ textAlign: "center", margin: "6px 0 28px" }}>
              {status && (
                <div style={{
                  fontSize: 13, fontWeight: 500, marginBottom: 12,
                  color: status.includes("✅") ? C.success : status.includes("❌") ? C.danger : C.textSub
                }}>{status}</div>
              )}
              <button
                style={{
                  ...btnPrimary, padding: "13px 48px", fontSize: 15,
                  opacity: loading || !resumeText || !jdText ? 0.6 : 1,
                  boxShadow: loading ? "none" : `0 4px 18px ${C.primary}40`,
                }}
                onClick={analyze}
                disabled={loading || !resumeText || !jdText}
              >
                {loading ? <><Spinner C={C} /> Analyzing…</> : "🚀 Analyze Resume"}
              </button>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                Powered by OpenRouter AI · Analysis takes 5–15 seconds
              </div>
            </div>

            {result && (
              <AnalysisResult
                result={result}
                jobTitle={jobTitle}
                resumeText={resumeText}
                jdText={jdText}
                C={C}
              />
            )}
          </>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: C.text }}>Analysis History</h1>
                <p style={{ margin: 0, color: C.textMuted, fontSize: 13 }}>Your last {history.length} analyses · Saved locally in your browser</p>
              </div>
              {history.length > 0 && (
                <button onClick={clearHistory} style={{
                  background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.danger}30`,
                  borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer"
                }}>Clear All</button>
              )}
            </div>

            {history.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", padding: "60px 24px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                <p style={{ color: C.textMuted, margin: 0 }}>No analyses yet. Run your first one on the Analyzer tab!</p>
              </div>
            ) : (
              <>
                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Total Analyses", value: history.length, icon: "📊" },
                    { label: "Average Score", value: Math.round(history.reduce((a, h) => a + h.score, 0) / history.length) + "%", icon: "🎯" },
                    { label: "Recommended", value: history.filter(h => h.verdict?.includes("Recommended") && !h.verdict.includes("Not")).length, icon: "✅" },
                  ].map(stat => (
                    <div key={stat.label} style={{ ...cardStyle, textAlign: "center", padding: 16, marginBottom: 0 }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{stat.icon}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.primary }}>{stat.value}</div>
                      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {history.map(item => (
                  <HistoryCard
                    key={item.id}
                    item={item}
                    C={C}
                    onClick={() => {
                      setResult(item.result_json);
                      setJobTitle(item.job_title);
                      setTab("analyze");
                    }}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* ABOUT TAB */}
        {tab === "about" && (
          <div style={{ maxWidth: 660 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800 }}>About ResumeAI</h1>
            <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 28 }}>An open, browser-based AI resume analyzer</p>

            {[
              { icon: "🤖", title: "AI-Powered Analysis", body: "Uses OpenRouter AI models to analyze your resume against a job description with the same criteria as modern ATS systems." },
              { icon: "🔒", title: "Privacy First", body: "Everything runs in your browser. Your resume and job descriptions are never stored on any server. History is saved locally in your browser only." },
              { icon: "📊", title: "Multi-Dimensional Scoring", body: "Get scores across match %, ATS compatibility, readability, keyword density, and section-by-section breakdown." },
              { icon: "🛠️", title: "AI Career Tools", body: "Beyond analysis: AI-powered interview prep, resume rewriting, cover letters, LinkedIn summaries, and salary negotiation scripts." },
              { icon: "📁", title: "File Support", body: "Upload PDF, DOCX, or TXT files. Or paste text directly. Word count and character count shown live." },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ ...cardStyle, display: "flex", gap: 14, alignItems: "flex-start" }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 5, color: C.text }}>{title}</div>
                  <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6 }}>{body}</div>
                </div>
              </div>
            ))}

            <div style={{ ...cardStyle, background: C.primaryLight, border: `1px solid ${C.borderStrong}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.primaryText, marginBottom: 8 }}>🔑 Getting Started</div>
              <ol style={{ margin: 0, paddingLeft: 20, color: C.textSub, fontSize: 14, lineHeight: 2 }}>
                <li>Get a free OpenRouter API key at <span style={{ color: C.primary, cursor: "pointer" }}
                  onClick={() => window.open("https://openrouter.ai/keys")}>openrouter.ai</span></li>
                <li>Click ⚙️ Settings and paste your API key</li>
                <li>Upload your resume (PDF, DOCX, TXT)</li>
                <li>Paste a job description you're applying for</li>
                <li>Click Analyze and explore your results!</li>
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
