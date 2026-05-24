use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::io::Read as IoRead;

#[derive(Debug, Serialize)]
pub struct EvaluatorRequest {
    pub job_description: String,
    pub user_cv: String,
    /// Pre-formatted string of user preferences injected into the prompt
    pub user_preferences: String,
}

#[derive(Debug, Deserialize)]
pub struct EvaluatorResponse {
    pub score: String,
    pub missing_skills: Vec<String>,
    pub archetype: String,
    pub block_a: String,
    pub block_b: String,
    pub block_c: String,
    pub block_d: String,
    pub block_e: String,
    pub block_f: String,
    pub block_g: String,
}

impl EvaluatorResponse {
    pub fn full_report(&self) -> String {
        format!(
            "## A) Role Summary\n\n{}\n\n## B) CV Match\n\n{}\n\n## C) Level & Strategy\n\n{}\n\n## D) Comp & Market\n\n{}\n\n## E) Personalization Plan\n\n{}\n\n## F) Interview Prep\n\n{}\n\n## G) Posting Legitimacy\n\n{}",
            self.block_a, self.block_b, self.block_c, self.block_d, self.block_e, self.block_f, self.block_g
        )
    }
}

pub struct AiEngine {
    client: Client,
    api_key: String,
}

impl AiEngine {
    pub fn new() -> anyhow::Result<Self> {
        let api_key = env::var("GEMINI_API_KEY")
            .unwrap_or_else(|_| env::var("AI_ENGINE_API_KEY").unwrap_or_default());

        let mut headers = header::HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, header::HeaderValue::from_static("application/json"));

        let client = Client::builder()
            .default_headers(headers)
            .build()?;

        Ok(Self { client, api_key })
    }

    pub async fn evaluate_job(&self, req: &EvaluatorRequest) -> anyhow::Result<EvaluatorResponse> {
        if self.api_key.is_empty() || self.api_key == "invalid_key" {
            tracing::warn!("No GEMINI_API_KEY provided. Returning mock data.");
            return Ok(EvaluatorResponse {
                score: "B+".to_string(),
                missing_skills: vec!["GraphQL".to_string(), "Kubernetes".to_string()],
                archetype: "Full-Stack Engineer".to_string(),
                block_a: "Mock evaluation. Add your GEMINI_API_KEY to get real results.".to_string(),
                block_b: "N/A".to_string(),
                block_c: "N/A".to_string(),
                block_d: "N/A".to_string(),
                block_e: "N/A".to_string(),
                block_f: "N/A".to_string(),
                block_g: "N/A".to_string(),
            });
        }

        tracing::info!("Calling Gemini 2.5 Flash for Career Ops evaluation...");

        let system_prompt = r###"You are career-ops, an AI-powered job search evaluation system.
You evaluate job offers against the candidate's CV using the Career Ops 7-block (A-G) methodology.
Follow the methodology below EXACTLY.

══════════════════════════════════════════
SCORING SYSTEM
══════════════════════════════════════════

The evaluation uses 6 dimensions with a global score of 1-5:

| Dimension         | What it measures                                         |
|-------------------|----------------------------------------------------------|
| Match con CV      | Skills, experience, proof points alignment               |
| North Star        | How well the role fits the candidate's target archetypes |
| Comp              | Salary vs market (5=top quartile, 1=well below)         |
| Cultural signals  | Company culture, growth, stability, remote policy        |
| Red flags         | Blockers, warnings (negative adjustments)                |
| **Global**        | Weighted average of above                                |

Score interpretation:
- 4.5+ → A/A+ — Strong match, recommend applying immediately
- 4.0-4.4 → B+/A- — Good match, worth applying
- 3.5-3.9 → B/B- — Decent but not ideal
- 3.0-3.4 → C — Below threshold
- Below 3.0 → D/F — Recommend against applying

══════════════════════════════════════════
ARCHETYPE DETECTION
══════════════════════════════════════════

Classify every offer into one (or hybrid of 2) of these archetypes:

| Archetype               | Key signals in JD                                              |
|--------------------------|----------------------------------------------------------------|
| AI Platform / LLMOps     | "observability", "evals", "pipelines", "monitoring"            |
| Agentic / Automation     | "agent", "HITL", "orchestration", "workflow", "multi-agent"    |
| Technical AI PM          | "PRD", "roadmap", "discovery", "stakeholder", "product manager"|
| AI Solutions Architect   | "architecture", "enterprise", "integration", "systems"         |
| AI Forward Deployed      | "client-facing", "deploy", "prototype", "fast delivery"        |
| AI Transformation        | "change management", "adoption", "enablement"                  |
| Frontend Engineer        | "React", "UI/UX", "components", "design system"               |
| Backend Engineer         | "API", "microservices", "database", "infrastructure"           |
| Full Stack Engineer      | Mix of frontend + backend signals                              |
| Data / ML Engineer       | "data pipelines", "ML models", "ETL", "feature engineering"   |
| DevOps / SRE             | "CI/CD", "Kubernetes", "infrastructure", "reliability"         |

══════════════════════════════════════════
7-BLOCK EVALUATION (A-G)
══════════════════════════════════════════

Generate ALL 7 blocks. Each block must be substantive.

## Block A — Role Summary
Table with: Archetype detected, Domain, Function (build/consult/manage/deploy), Seniority, Remote policy, Team size (if mentioned), TL;DR in 1 sentence.

## Block B — CV Match
Create a table mapping EACH requirement from the JD to specific lines/proof points from the candidate's CV.
Columns: JD Requirement | CV Proof Point | Strength (Strong/Partial/Gap)

Then a **Gaps** section: for each gap identified:
1. Is it a hard blocker or nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Concrete mitigation plan (phrase for cover letter, quick project, etc.)

## Block C — Level & Strategy
1. Level detected in JD vs candidate's natural level
2. "Sell senior without lying" plan: specific phrases, concrete achievements to highlight
3. "If downleveled" plan: accept if comp is fair, negotiate 6-month review

## Block D — Comp & Market
Estimate salary range based on:
- Role title + seniority + location
- Industry benchmarks from your training data
- Note if comp is mentioned in JD
Table with estimated range, market positioning, and recommendation.

## Block E — Personalization Plan
Table with columns: # | CV Section | Current State | Proposed Change | Why
Top 5 changes to CV to maximize match for this specific role.

## Block F — Interview Prep
6-10 STAR+R stories mapped to JD requirements:
Table: # | JD Requirement | Story Title | Situation | Task | Action | Result | Reflection

The Reflection column captures what was learned — this signals seniority.

Include:
- 1 recommended case study (which project to present and how)
- Red-flag questions and how to answer them

## Block G — Posting Legitimacy
Assess whether this is likely a real, active opening.
Three tiers: High Confidence / Proceed with Caution / Suspicious
Analyze: description quality, tech specificity, requirements realism, role-company fit.
Present observations, not accusations. Every signal has legitimate explanations.

══════════════════════════════════════════
GLOBAL RULES
══════════════════════════════════════════

- NEVER invent experience or metrics. Only cite what's in the CV.
- Be direct and actionable — no fluff, no corporate-speak.
- Cite exact lines from the CV when matching.
- Generate in the language of the JD (English default).
- Use native tech English: short sentences, action verbs, no passive voice.

══════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════

Return a valid JSON object with SEPARATE fields for each block.
Keep each block CONCISE. Use Markdown tables, short bullets, no long prose.

{
  "score": "Letter grade (A+, A, A-, B+, B, B-, C, D, F)",
  "missing_skills": ["key", "missing", "skills"],
  "archetype": "Detected archetype",
  "block_a": "Markdown content for Block A (Role Summary table)",
  "block_b": "Markdown content for Block B (CV Match table + gaps)",
  "block_c": "Markdown content for Block C (Level & Strategy)",
  "block_d": "Markdown content for Block D (Comp & Market table)",
  "block_e": "Markdown content for Block E (Personalization table)",
  "block_f": "Markdown content for Block F (Interview STAR+R table)",
  "block_g": "Markdown content for Block G (Posting Legitimacy assessment)"
}"###;

        let prefs_section = if req.user_preferences.trim().is_empty() {
            String::new()
        } else {
            format!("\n\n## Candidate Preferences & Filters\n\n{}\n\nUse these preferences to inform Block D (salary fit), flag work-mode or location mismatches, and adjust the overall score if dealbreakers are present.", req.user_preferences)
        };

        let user_message = format!(
            "## Candidate CV\n\n{}{}\n\n---\n\n## JOB DESCRIPTION TO EVALUATE\n\n{}\n\n---\n\nEvaluate this job against the candidate's CV using the full Career Ops A-G methodology. Return JSON only.",
            req.user_cv, prefs_section, req.job_description
        );

        let body = json!({
            "systemInstruction": {
                "parts": [{ "text": system_prompt }]
            },
            "contents": [{
                "parts": [{ "text": user_message }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 65536,
                "responseMimeType": "application/json"
            }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            tracing::error!("Gemini API error: {}", error_text);
            return Err(anyhow::anyhow!("AI Engine Error: {}", error_text));
        }

        let res_json: Value = res.json().await?;
        let content_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("{}");

        let mut clean_json = content_text.trim();
        if clean_json.starts_with("```json") {
            clean_json = clean_json.strip_prefix("```json").unwrap_or(clean_json);
        } else if clean_json.starts_with("```") {
            clean_json = clean_json.strip_prefix("```").unwrap_or(clean_json);
        }
        if clean_json.ends_with("```") {
            clean_json = clean_json.strip_suffix("```").unwrap_or(clean_json);
        }
        clean_json = clean_json.trim();

        let eval: EvaluatorResponse = serde_json::from_str(clean_json).map_err(|e| {
            tracing::error!("Failed to parse AI response: {}. Raw: {}", e, &clean_json[..clean_json.len().min(500)]);
            anyhow::anyhow!("Failed to parse AI Engine response")
        })?;

        Ok(eval)
    }

    pub async fn generate_resume(&self, job_description: &str, user_cv: &str) -> anyhow::Result<String> {
        if self.api_key.is_empty() || self.api_key == "invalid_key" {
            tracing::warn!("No GEMINI_API_KEY provided. Returning mock data.");
            return Ok("# Mock Optimized Resume\n\nAdd your API key to generate real resumes.".to_string());
        }

        tracing::info!("Calling Gemini 2.5 Pro for ATS Resume generation...");

        let system_prompt = r#"You are Career Ops — an expert ATS resume writer.

══════════════════════════════════════════
RESUME GENERATION PIPELINE
══════════════════════════════════════════

Follow this pipeline exactly:

1. Extract 15-20 keywords from the JD
2. Detect the role archetype to shape narrative framing
3. Rewrite Professional Summary injecting JD keywords (3-4 lines, keyword-dense)
4. Build Core Competencies grid (6-8 keyword phrases from JD requirements)
5. Select top 3-4 most relevant projects for this specific role
6. Reorder experience bullets by relevance to this JD (most relevant first)
7. Inject keywords naturally into existing achievements (NEVER invent experience)

══════════════════════════════════════════
ATS RULES (MANDATORY)
══════════════════════════════════════════

- Single-column layout (no sidebars, no parallel columns)
- Standard section headers: "Professional Summary", "Core Competencies", "Work Experience", "Projects", "Education", "Skills"
- Keywords from JD distributed: Summary (top 5), first bullet of each role, Skills section
- No tables, no images, no fancy formatting — clean Markdown only
- Quantify achievements with real numbers from the CV

══════════════════════════════════════════
KEYWORD INJECTION (ETHICAL, TRUTH-BASED)
══════════════════════════════════════════

Only reformulate existing experience with JD vocabulary. Examples:
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → "RAG pipeline design and LLM orchestration"
- JD says "stakeholder management" and CV says "collaborated with team" → "stakeholder management across engineering and business"

NEVER add skills the candidate does not have. Only reformulate real experience.

══════════════════════════════════════════
SECTION ORDER (6-second recruiter scan)
══════════════════════════════════════════

1. Header (name, contact)
2. Professional Summary (3-4 lines, keyword-dense)
3. Core Competencies (6-8 keyword phrases)
4. Work Experience (reverse chronological, bullets reordered by JD relevance)
5. Projects (top 3-4 most relevant)
6. Education & Certifications
7. Skills (technical + languages)

══════════════════════════════════════════
WRITING RULES
══════════════════════════════════════════

- Avoid cliché: no "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded"
- Use specific verbs: "built", "ran", "cut", "shipped", "designed"
- Mix sentence lengths. Don't start every bullet the same way.
- Prefer specifics: "Cut p95 latency from 2.1s to 380ms" beats "improved performance"
- Name tools, projects, and technologies explicitly
- Native tech English: short sentences, action verbs, no passive voice

Output the resume as clean Markdown. Do not wrap in code blocks."#;

        let user_message = format!(
            "## Base CV\n\n{}\n\n---\n\n## Target Job Description\n\n{}\n\n---\n\nGenerate the tailored ATS-optimized resume following the Career Ops pipeline.",
            user_cv, job_description
        );

        let body = json!({
            "systemInstruction": {
                "parts": [{ "text": system_prompt }]
            },
            "contents": [{
                "parts": [{ "text": user_message }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 8192
            }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            tracing::error!("Gemini API error: {}", error_text);
            return Err(anyhow::anyhow!("AI Engine Error: {}", error_text));
        }

        let res_json: Value = res.json().await?;
        let content_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("Failed to generate content.");

        Ok(content_text.to_string())
    }

    /// Hybrid PDF-to-Markdown: extract text with pdf-extract, then format with Gemini Flash
    pub async fn pdf_to_markdown(&self, pdf_bytes: &[u8]) -> anyhow::Result<String> {
        // Step 1: Extract raw text from PDF using pdf-extract
        tracing::info!("Extracting text from PDF ({} bytes)...", pdf_bytes.len());
        let raw_text = pdf_extract::extract_text_from_mem(pdf_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to extract text from PDF: {}", e))?;

        if raw_text.trim().is_empty() {
            return Err(anyhow::anyhow!("PDF appears to be empty or image-only. Please paste your CV as text instead."));
        }

        tracing::info!("Extracted {} chars from PDF. Sending to Gemini for formatting...", raw_text.len());

        // Step 2: Send to Gemini Flash to format as structured markdown
        if self.api_key.is_empty() {
            // No API key — return raw text with basic formatting
            return Ok(format!("# Resume\n\n{}", raw_text));
        }

        let system_prompt = r#"You are a resume parser. Convert the raw text extracted from a PDF resume into clean, well-structured Markdown.

Rules:
- Detect the person's name and make it an H1 heading
- Detect sections (Experience, Education, Skills, etc.) and make them H2 headings
- Detect job titles, companies, and dates — format as H3 with dates
- Convert bullet points properly
- Preserve all factual content — do NOT add, remove, or modify any information
- Do NOT invent metrics, skills, or experiences
- Clean up PDF extraction artifacts (broken words, weird spacing, header/footer noise)
- Output clean Markdown only, no code blocks around it"#;

        let body = json!({
            "systemInstruction": {
                "parts": [{ "text": system_prompt }]
            },
            "contents": [{
                "parts": [{ "text": format!("Raw text extracted from a PDF resume:\n\n{}", raw_text) }]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 8192
            }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;

        if !res.status().is_success() {
            let error_text = res.text().await?;
            tracing::error!("Gemini PDF formatting error: {}", error_text);
            // Fallback: return raw text if Gemini fails
            return Ok(format!("# Resume\n\n{}", raw_text));
        }

        let res_json: Value = res.json().await?;
        let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or(&raw_text);

        // Clean markdown code blocks if Gemini wraps it
        let mut clean = content.trim();
        if clean.starts_with("```markdown") {
            clean = clean.strip_prefix("```markdown").unwrap_or(clean);
        } else if clean.starts_with("```md") {
            clean = clean.strip_prefix("```md").unwrap_or(clean);
        } else if clean.starts_with("```") {
            clean = clean.strip_prefix("```").unwrap_or(clean);
        }
        if clean.ends_with("```") {
            clean = clean.strip_suffix("```").unwrap_or(clean);
        }

        Ok(clean.trim().to_string())
    }

    /// Career Ops interview-prep mode: STAR+R stories + technical Q&A + red flag questions
    pub async fn generate_interview_prep(&self, job_description: &str, user_cv: &str, company: &str) -> anyhow::Result<String> {
        if self.api_key.is_empty() {
            return Ok("# Interview Prep\n\nAdd your GEMINI_API_KEY to generate real interview prep.".to_string());
        }

        tracing::info!("Calling Gemini 2.5 Pro for interview prep generation...");

        let system_prompt = r###"You are career-ops in interview-prep mode.

══════════════════════════════════════════
INTERVIEW PREP METHODOLOGY
══════════════════════════════════════════

Given a JD and the candidate's CV, generate a complete interview preparation sheet.

## STEP 1 — EXTRACT REQUIREMENTS
Extract the 5-8 most critical competency requirements from the JD.
For each, identify the best matching experience from the candidate's CV.

## STEP 2 — STAR+R STORIES
For each competency, build a STAR+R story:
- **S**ituation: Brief context (1-2 sentences)
- **T**ask: What was the candidate's responsibility
- **A**ction: Specific actions taken (3-5 bullets, use numbers and tools)
- **R**esult: Quantified outcome (%, time saved, revenue, users)
- **R**eflection: What you learned / would do differently

Rules for STAR stories:
- Use ONLY real experiences from the CV — never invent
- Quantify every result. If CV lacks numbers, say "X was tracked internally"
- Keep each story to 200-250 words for a 90-second verbal answer
- Use the JD vocabulary naturally in the story

## STEP 3 — TECHNICAL QUESTIONS
Generate 6-8 expected technical/domain questions for this specific role.
For each: state the question, then provide a concise answer framework (3-5 bullet points).

## STEP 4 — QUESTIONS TO ASK
Generate 5 high-signal questions the candidate should ask the interviewer.
These should reveal:
- Team engineering culture and practices
- What success looks like in 30/60/90 days
- Key challenges for this role
- Why the role is open (growth vs. attrition)
- Decision-making and autonomy

## STEP 5 — RED FLAGS TO PROBE
Based on the JD, identify 2-3 potential red flags (vague comp, unrealistic requirements, churn signals, etc.)
and suggest how to probe them diplomatically.

## FORMAT
Output as clean, readable Markdown. Use clear section headers.
Do NOT wrap in code blocks."###;

        let user_message = format!(
            "## Company\n{}\n\n## Candidate CV\n\n{}\n\n---\n\n## Job Description\n\n{}\n\n---\n\nGenerate the full interview prep sheet.",
            company, user_cv, job_description
        );

        let body = json!({
            "systemInstruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "parts": [{ "text": user_message }] }],
            "generationConfig": { "temperature": 0.4, "maxOutputTokens": 16384 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            let err = res.text().await?;
            return Err(anyhow::anyhow!("Gemini error: {}", err));
        }

        let res_json: Value = res.json().await?;
        let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("Failed to generate prep sheet.")
            .to_string();

        Ok(content)
    }

    /// Career Ops deep mode: company research for interview intelligence
    pub async fn research_company(&self, company: &str, role: &str, job_description: &str) -> anyhow::Result<String> {
        if self.api_key.is_empty() {
            return Ok("# Company Research\n\nAdd your GEMINI_API_KEY to generate real research.".to_string());
        }

        tracing::info!("Calling Gemini 2.5 Flash for company research...");

        let system_prompt = r###"You are career-ops in deep-research mode.

══════════════════════════════════════════
COMPANY INTELLIGENCE REPORT
══════════════════════════════════════════

Generate a comprehensive pre-interview company intelligence report.

## SECTIONS TO COVER

### 1. Company Overview
- Founded, HQ, headcount, funding stage (Series A/B/public/etc.)
- Core product/service and target customer
- Mission and key value proposition

### 2. Business Model & Market Position
- Revenue model (SaaS, marketplace, enterprise, etc.)
- Key metrics if public (ARR, growth rate, NRR, etc.)
- Main competitors and how this company differentiates
- Market size and growth trajectory

### 3. Engineering Culture & Tech Stack
- Known tech stack from job posts, GitHub, engineering blogs
- Engineering team size estimate
- Known practices: monolith vs microservices, cloud provider, CI/CD
- Any known open-source contributions or engineering blog

### 4. Recent News & Events (last 12 months)
- Funding rounds, M&A, product launches
- Leadership changes
- Press coverage highlights

### 5. Green Flags 🟢
- Positive signals for a candidate considering this role

### 6. Red Flags 🔴
- Concerns to probe during the interview

### 7. Strategic Talking Points
- 3-5 specific things the candidate should reference in the interview to show company knowledge
- How to connect the candidate's background to the company's current priorities

## RULES
- Be specific and data-driven where possible
- If you don't have verified data for a section, say "Unknown — research via LinkedIn/Crunchbase/Glassdoor"
- Keep the tone analytical, not promotional
- Output as clean Markdown"###;

        let user_message = format!(
            "Company: {}\nRole: {}\n\nJob Description:\n{}\n\nGenerate the company intelligence report.",
            company, role, job_description
        );

        let body = json!({
            "systemInstruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "parts": [{ "text": user_message }] }],
            "generationConfig": { "temperature": 0.3, "maxOutputTokens": 8192 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            let err = res.text().await?;
            return Err(anyhow::anyhow!("Gemini error: {}", err));
        }

        let res_json: Value = res.json().await?;
        let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("Failed to generate research.")
            .to_string();

        Ok(content)
    }

    /// Career Ops contacto mode: personalized LinkedIn outreach
    pub async fn generate_outreach(&self, job_description: &str, user_cv: &str, company: &str, role: &str, recruiter_name: Option<&str>) -> anyhow::Result<String> {
        if self.api_key.is_empty() {
            return Ok("# Outreach Messages\n\nAdd your GEMINI_API_KEY to generate real outreach.".to_string());
        }

        tracing::info!("Calling Gemini 2.5 Flash for outreach generation...");

        let system_prompt = r###"You are career-ops in outreach (contacto) mode.

══════════════════════════════════════════
LINKEDIN OUTREACH GENERATION
══════════════════════════════════════════

Generate personalized LinkedIn outreach messages for a job opportunity.

## RULES
- Analyze the candidate's strongest match points for this role
- Reference specific, real things from their background (not generic)
- Never use these clichés: "passionate about", "I'd love to connect", "synergy", "I came across your profile"
- Sound like a human, not a template
- Be direct about purpose — recruiters respect clarity
- LinkedIn connection request: MAX 300 characters (hard limit — count carefully)

## OUTPUT FORMAT

### Connection Request Note (≤300 chars)
[One personalized connection request. Mention the specific role, one concrete match point.]

---

### Message Variant A — Value-First
[Lead with a specific insight or contribution angle. Why does the candidate's background make them uniquely valuable for THIS role at THIS company right now? 2-3 short paragraphs.]

---

### Message Variant B — Direct & Concise
[Straight to the point: who they are, what they want, why they're a fit. Under 100 words.]

---

### Message Variant C — Problem-Solution
[Identify a likely challenge or priority for this role/company, then position the candidate as someone who has solved exactly that. 2-3 paragraphs.]

---

### Follow-Up (if no response in 5-7 days)
[One short follow-up message. Add new value — don't just bump. Under 50 words.]

## TONE
Professional but human. Direct. No corporate speak. Write as a high-signal candidate would write."###;

        let recruiter = recruiter_name.unwrap_or("the hiring team");
        let user_message = format!(
            "Company: {}\nRole: {}\nRecruiter/Contact: {}\n\n## Candidate CV\n{}\n\n---\n\n## Job Description\n{}\n\nGenerate the outreach messages.",
            company, role, recruiter, user_cv, job_description
        );

        let body = json!({
            "systemInstruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "parts": [{ "text": user_message }] }],
            "generationConfig": { "temperature": 0.5, "maxOutputTokens": 4096 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            let err = res.text().await?;
            return Err(anyhow::anyhow!("Gemini error: {}", err));
        }

        let res_json: Value = res.json().await?;
        let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("Failed to generate outreach.")
            .to_string();

        Ok(content)
    }

    /// Parallel job comparison: evaluate multiple JDs concurrently, return ranked JSON
    pub async fn compare_jobs(&self, jobs: &[JobInput], user_cv: &str) -> anyhow::Result<Vec<CompareResult>> {
        if self.api_key.is_empty() {
            return Ok(vec![]);
        }

        tracing::info!("Comparing {} jobs in parallel...", jobs.len());

        let system_prompt = r###"You are career-ops in comparison mode.

Evaluate a single job offer against the candidate's CV. Return ONLY valid JSON with this exact structure:
{
  "score": "B+",
  "archetype": "Full Stack Engineer",
  "summary": "2-3 sentence role summary",
  "match_pct": 72,
  "top_strengths": ["strength 1", "strength 2", "strength 3"],
  "top_gaps": ["gap 1", "gap 2"],
  "comp_range": "$120k–$160k",
  "verdict": "1 sentence go/no-go recommendation",
  "block_g_flag": "LEGITIMATE | SUSPICIOUS | CANNOT_VERIFY"
}

Scoring: A=90-100%, B=75-89%, C=60-74%, D=40-59%, F=<40%
match_pct: integer 0-100 representing overall CV-to-JD match.
block_g_flag: LEGITIMATE (real company, normal JD), SUSPICIOUS (vague comp, ghost posting signals), CANNOT_VERIFY (not enough info)."###;

        let mut handles = vec![];

        for (i, job) in jobs.iter().enumerate() {
            let client = self.client.clone();
            let api_key = self.api_key.clone();
            let cv = user_cv.to_string();
            let jd = job.description.clone();
            let title = job.title.clone().unwrap_or_else(|| format!("Job {}", i + 1));
            let company = job.company.clone().unwrap_or_default();
            let sys = system_prompt.to_string();

            let handle = tokio::spawn(async move {
                let user_msg = format!(
                    "## Candidate CV\n\n{}\n\n---\n\n## Job: {} at {}\n\n{}\n\nReturn JSON only.",
                    cv, title, company, jd
                );

                let body = serde_json::json!({
                    "systemInstruction": { "parts": [{ "text": sys }] },
                    "contents": [{ "parts": [{ "text": user_msg }] }],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json"
                    }
                });

                let url = format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
                    api_key
                );

                let res = client.post(&url).json(&body).send().await?;
                if !res.status().is_success() {
                    let err = res.text().await?;
                    return Err(anyhow::anyhow!("Gemini error: {}", err));
                }

                let res_json: serde_json::Value = res.json().await?;
                let text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    .as_str()
                    .unwrap_or("{}");

                let mut clean = text.trim();
                if clean.starts_with("```json") { clean = clean.strip_prefix("```json").unwrap_or(clean); }
                else if clean.starts_with("```") { clean = clean.strip_prefix("```").unwrap_or(clean); }
                if clean.ends_with("```") { clean = clean.strip_suffix("```").unwrap_or(clean); }

                let parsed: serde_json::Value = serde_json::from_str(clean.trim())
                    .unwrap_or_else(|_| serde_json::json!({ "score": "?", "verdict": "Parse error" }));

                Ok::<(String, String, serde_json::Value), anyhow::Error>((title, company, parsed))
            });

            handles.push(handle);
        }

        let mut results = vec![];
        for handle in handles {
            match handle.await {
                Ok(Ok((title, company, data))) => {
                    results.push(CompareResult { title, company, data });
                }
                Ok(Err(e)) => tracing::error!("Job comparison error: {}", e),
                Err(e) => tracing::error!("Task join error: {}", e),
            }
        }

        // Sort by match_pct descending
        results.sort_by(|a, b| {
            let pa = a.data.get("match_pct").and_then(|v| v.as_i64()).unwrap_or(0);
            let pb = b.data.get("match_pct").and_then(|v| v.as_i64()).unwrap_or(0);
            pb.cmp(&pa)
        });

        Ok(results)
    }

    /// Career Matching: score user's CV against each target archetype, return fit map
    pub async fn career_match(&self, user_cv: &str, target_archetypes: &[String]) -> anyhow::Result<String> {
        if self.api_key.is_empty() {
            return Ok("Add GEMINI_API_KEY to run career matching.".to_string());
        }

        tracing::info!("Running career matching for {} archetypes...", target_archetypes.len());

        let archetypes_str = target_archetypes.join(", ");

        let system_prompt = r###"You are career-ops in career-matching mode.

Analyze a candidate's CV against a set of target role archetypes. Return a comprehensive career fit analysis.

## FOR EACH ARCHETYPE, ASSESS:
1. **Fit Score** (0-100): How well does the CV match this archetype's requirements?
2. **Current Strengths**: What the candidate already has for this archetype (3-4 points)
3. **Critical Gaps**: What's missing or underdeveloped (2-3 points)
4. **Time to Ready**: Honest estimate if gaps exist — "Ready now", "3-6 months", "1+ year"
5. **Key Signal**: One sentence summary of why this is a strong or weak fit

## OVERALL ANALYSIS:
- Best Fit Archetype (with explanation)
- Recommended Pivot Path (if best fit isn't their current trajectory)
- Top 3 skills to build across ALL target roles
- Whether to niche down or stay broad (recommendation with reasoning)

## FORMAT: Clean Markdown. Use a card-style layout per archetype with clear headers."###;

        let user_msg = format!(
            "## Candidate CV\n\n{}\n\n---\n\n## Target Archetypes to Evaluate\n\n{}\n\nGenerate the career fit analysis.",
            user_cv, archetypes_str
        );

        let body = serde_json::json!({
            "systemInstruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "parts": [{ "text": user_msg }] }],
            "generationConfig": { "temperature": 0.4, "maxOutputTokens": 8192 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            let err = res.text().await?;
            return Err(anyhow::anyhow!("Gemini error: {}", err));
        }

        let res_json: Value = res.json().await?;
        let content = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("Failed to generate career match analysis.")
            .to_string();

        Ok(content)
    }

    // ─── Employer Mode AI Methods ───────────────────────────────────────────

    pub async fn employer_screen_cv(&self, job_description: &str, candidate_cv: &str, candidate_name: &str) -> anyhow::Result<String> {
        let prompt = format!(
            r#"You are an expert recruiter and hiring manager. Screen the following candidate CV against the job description.

## Job Description
{}

## Candidate: {}
{}

Provide a structured hiring assessment in Markdown with:

### Overall Recommendation
HIRE / STRONG HIRE / PASS / MAYBE — with a one-line rationale.

### Match Score
X/10 with breakdown: Technical Skills (X/10), Experience Level (X/10), Culture/Soft Skills (X/10)

### Key Strengths
3-5 bullet points of what makes this candidate compelling for this role.

### Concerns & Gaps
3-5 bullet points of gaps, risks, or red flags relative to the JD.

### Interview Focus Areas
Top 3 areas to probe in the interview, with 2 sample questions each.

### Salary Expectation
Based on their CV background, estimated market range for this candidate in this role.

Be direct, specific, and actionable. Reference specific lines from the CV."#,
            job_description, candidate_name, candidate_cv
        );

        let body = json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": { "temperature": 0.3, "maxOutputTokens": 4096 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );
        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            return Err(anyhow::anyhow!("Gemini error: {}", res.text().await?));
        }
        let json: Value = res.json().await?;
        Ok(json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("Failed to screen CV.").to_string())
    }

    pub async fn employer_generate_jd(&self, role_title: &str, company: &str, requirements: &str, seniority: &str, work_mode: &str, salary_range: &str) -> anyhow::Result<String> {
        let prompt = format!(
            r#"You are a senior technical recruiter. Generate a compelling, ATS-optimized job description.

Role: {} ({})
Company: {}
Work Mode: {}
Salary Range: {}
Key Requirements / Notes: {}

Generate a complete job description in Markdown with these sections:
- About the Role (2-3 sentences, exciting hook)
- What You'll Do (6-8 bullet points, specific responsibilities)
- What We're Looking For (Required skills, 5-6 bullets + Nice to have, 3-4 bullets)
- What We Offer (benefits, growth, culture)
- About [Company] (2-3 sentences if company name given)

Keep it concise, specific, and compelling. Avoid corporate fluff. Use active voice."#,
            role_title, seniority, company, work_mode, salary_range, requirements
        );

        let body = json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": { "temperature": 0.4, "maxOutputTokens": 2048 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );
        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            return Err(anyhow::anyhow!("Gemini error: {}", res.text().await?));
        }
        let json: Value = res.json().await?;
        Ok(json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("Failed to generate JD.").to_string())
    }

    pub async fn employer_interview_questions(&self, job_description: &str, seniority: &str, focus_areas: &str) -> anyhow::Result<String> {
        let focus_line = if focus_areas.is_empty() { String::new() } else { format!("Focus especially on: {}", focus_areas) };
        let prompt = format!(
            r#"You are an expert interviewer. Generate a structured interview question bank for this role.

## Job Description
{}

Seniority: {}
{}

Generate 25 interview questions organized in Markdown:

### Technical / Domain Questions (10 questions)
Questions to test hard skills and domain knowledge. Include the ideal answer signal for each.

### Behavioral / Competency Questions (8 questions)
STAR-format questions for soft skills, leadership, collaboration. Include what you're looking for.

### System Design / Case Questions (4 questions)
Scenario-based questions to test problem-solving and architecture thinking.

### Culture Fit & Motivation Questions (3 questions)
Questions to assess alignment with company values and role motivation.

Format each question as:
**Q:** [Question]
*Signal:* [What a strong answer looks like]"#,
            job_description, seniority, focus_line
        );

        let body = json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": { "temperature": 0.4, "maxOutputTokens": 4096 }
        });

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );
        let res = self.client.post(&url).json(&body).send().await?;
        if !res.status().is_success() {
            return Err(anyhow::anyhow!("Gemini error: {}", res.text().await?));
        }
        let json: Value = res.json().await?;
        Ok(json["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("Failed to generate questions.").to_string())
    }

    /// Fetch a job posting URL and extract clean text using Gemini
    pub async fn extract_job_from_url(&self, url: &str) -> anyhow::Result<String> {
        use regex::Regex;

        tracing::info!("Fetching job URL: {}", url);

        // Try Scrapling sidecar first — better JS rendering than reqwest, no Chrome needed
        let scraping_url = std::env::var("SCRAPING_SERVICE_URL").unwrap_or_default();
        let scraping_key = std::env::var("SCRAPING_SERVICE_KEY").unwrap_or_default();
        if !scraping_url.is_empty() {
            let extract_endpoint = format!("{}/jobs/extract", scraping_url.trim_end_matches('/'));
            let mut req = self.client
                .post(&extract_endpoint)
                .json(&serde_json::json!({ "url": url }));
            if !scraping_key.is_empty() {
                req = req.header("X-API-Key", scraping_key);
            }
            if let Ok(res) = req.send().await {
                if let Ok(data) = res.json::<serde_json::Value>().await {
                    if data["success"].as_bool().unwrap_or(false) {
                        let desc = data["description"].as_str().unwrap_or("").to_string();
                        if desc.len() > 200 {
                            tracing::info!("Scrapling sidecar extracted {} chars from {}", desc.len(), url);
                            return Ok(desc);
                        }
                    }
                }
            }
            tracing::warn!("Scrapling sidecar extract failed for {} — falling back to reqwest", url);
        }

        // Fetch page HTML with a realistic user-agent
        let html = self.client
            .get(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await?
            .text()
            .await?;

        // Strip <script> and <style> blocks
        let re_script = Regex::new(r"(?si)<(script|style)[^>]*>.*?</(script|style)>").unwrap();
        let no_scripts = re_script.replace_all(&html, " ");

        // Strip all HTML tags
        let re_tags = Regex::new(r"<[^>]+>").unwrap();
        let text = re_tags.replace_all(&no_scripts, " ");

        // Decode common HTML entities
        let text = text
            .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ");

        // Collapse whitespace
        let re_ws = Regex::new(r"[ \t]+").unwrap();
        let text = re_ws.replace_all(&text, " ");
        let re_nl = Regex::new(r"\n{3,}").unwrap();
        let text = re_nl.replace_all(&text, "\n\n");
        let text = text.trim().to_string();

        // Truncate to ~12k chars to stay within token limits
        let truncated = if text.len() > 12000 {
            text[..12000].to_string()
        } else {
            text
        };

        // If reqwest got less than 200 chars, likely JS-rendered — try headless Chrome
        let truncated = if truncated.len() < 200 {
            tracing::info!("reqwest got thin content, trying headless Chrome for: {}", url);
            match Self::fetch_with_headless(url).await {
                Ok(rendered) if rendered.len() >= 200 => {
                    tracing::info!("headless Chrome succeeded, {} chars", rendered.len());
                    if rendered.len() > 12000 { rendered[..12000].to_string() } else { rendered }
                }
                Ok(_) | Err(_) => {
                    return Err(anyhow::anyhow!(
                        "Could not extract content from this URL. The site may block automated access. Please paste the job description manually."
                    ));
                }
            }
        } else {
            truncated
        };

        // Use Gemini to extract just the job description from the page text
        let prompt = format!(
            "Extract ONLY the job description from the following webpage text. Return the job title, company, requirements, responsibilities, and qualifications as clean plain text. Remove navigation, ads, headers, footers, and unrelated content. If this is not a job posting, say 'NOT_A_JOB_POSTING'.\n\n---\n\n{}",
            truncated
        );

        let body = json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": { "temperature": 0.1, "maxOutputTokens": 4096 }
        });

        let api_url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}",
            self.api_key
        );

        let res = self.client.post(&api_url).json(&body).send().await?;
        if !res.status().is_success() {
            let err = res.text().await?;
            return Err(anyhow::anyhow!("AI extraction failed: {}", err));
        }

        let res_json: Value = res.json().await?;
        let extracted = res_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();

        if extracted.contains("NOT_A_JOB_POSTING") {
            return Err(anyhow::anyhow!("This URL doesn't appear to be a job posting."));
        }

        Ok(extracted)
    }

    /// Launch headless Chrome, navigate to URL, wait for JS, return inner text
    async fn fetch_with_headless(url: &str) -> anyhow::Result<String> {
        use regex::Regex;
        let url_owned = url.to_string();

        // headless_chrome is blocking — run in dedicated thread
        let html = tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
            use headless_chrome::{Browser, LaunchOptions};
            use std::time::Duration;

            let browser = Browser::new(
                LaunchOptions {
                    headless: true,
                    sandbox: false,
                    args: vec![
                        std::ffi::OsStr::new("--no-sandbox"),
                        std::ffi::OsStr::new("--disable-gpu"),
                        std::ffi::OsStr::new("--disable-dev-shm-usage"),
                        std::ffi::OsStr::new("--blink-settings=imagesEnabled=false"),
                    ],
                    ..Default::default()
                }
            ).map_err(|e| anyhow::anyhow!("Chrome launch failed: {}", e))?;

            let tab = browser.new_tab()?;
            tab.navigate_to(&url_owned)?;
            // Wait up to 8s for network idle
            let _ = tab.wait_until_navigated();
            std::thread::sleep(Duration::from_millis(2500));

            let text = tab.evaluate(
                "document.body ? document.body.innerText : document.documentElement.innerText",
                true,
            )?;

            let result = text.value
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_default();

            Ok(result)
        })
        .await
        .map_err(|e| anyhow::anyhow!("spawn_blocking panicked: {}", e))??;

        // Collapse excess whitespace
        let re_ws = Regex::new(r"[ \t]+")?;
        let cleaned = re_ws.replace_all(&html, " ");
        let re_nl = Regex::new(r"\n{3,}")?;
        let cleaned = re_nl.replace_all(&cleaned, "\n\n");
        Ok(cleaned.trim().to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobInput {
    pub title: Option<String>,
    pub company: Option<String>,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct CompareResult {
    pub title: String,
    pub company: String,
    pub data: serde_json::Value,
}
