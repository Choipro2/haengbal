// 행발 생성 API (Vercel 서버 함수)
// 필요한 Vercel 환경변수
//   OPENAI_API_KEY   : 북트리와 같은 OpenAI 키
//   TEACHER_PASSWORD : 선생님만 쓰도록 하는 비밀번호
//   OPENAI_MODEL     : (선택) 기본값 gpt-4.1-mini

import crypto from "node:crypto";

const DEFAULT_MODEL = "gpt-4.1-mini";

export const DEFAULT_MASTER_PROMPT = `# 역할
당신은 대한민국 초등학교 담임교사이며 학교생활기록부 기재요령을 잘 아는 전문가입니다. 교사가 준 [학생 관찰 자료]만을 근거로 NEIS '행동특성 및 종합의견'을 작성합니다.

# 반드시 지킬 원칙
1. 문장 끝은 '~함.', '~음.', '~임.', '~보임.', '~기대됨.' 같은 명사형 종결어미로 끝맺음.
2. 관찰 자료에 없는 사실·사례·단점을 새로 만들어 내지 말 것. 비어 있는 항목은 다루지 않거나 자료에 있는 내용 범위 안에서만 일반화할 것.
3. 학생 이름, '이 학생은' 같은 주어는 쓰지 않음.
4. 기재 금지: 교외 수상, 사교육(학원·과외 등), 공인어학시험, 해외 연수, 부모의 사회·경제적 지위, 학교 밖 특정 기관·대회·상호명.
5. 보완점은 비난하거나 단정하지 말고, 지도와 노력으로 나아지고 있는 과정과 기대되는 모습으로 서술함.
6. 추상적 칭찬만 나열하지 말고 자료의 구체적 사례를 근거로 특성을 드러냄.
7. 자연스러운 한 문단으로 쓰고 줄바꿈·번호·괄호 머리말은 쓰지 않음.

# 서술 순서 (4단)
도입(성격·핵심 강점) → 교우관계·학급 역할 사례 → 학습 태도·자기관리 → 보완점의 변화와 기대

# 두 가지 버전
- versionA: 인성·교우관계 중심
- versionB: 학습 태도·성장 중심
두 버전은 같은 사실을 바탕으로 하되 강조점과 문장을 다르게 씀.`;

const GRADE_RULES = {
  low: "1~2학년(저학년): 기본생활습관, 학교 적응, 규칙 지키기, 친구와 어울리는 모습 중심으로 따뜻한 어조로 쓸 것.",
  mid: "3~4학년(중학년): 학급 규칙 준수, 협동심, 또래 관계, 호기심과 탐구하는 태도 중심으로 쓸 것.",
  high: "5~6학년(고학년): 자기주도적 학습, 리더십과 팔로워십, 갈등 조정, 책임감과 진로 관심 중심으로 성숙한 어휘를 쓸 것.",
};

const SCHEMA = {
  type: "object",
  properties: {
    versionA: { type: "string" },
    versionB: { type: "string" },
  },
  required: ["versionA", "versionB"],
  additionalProperties: false,
};

function sameSecret(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// NEIS 기준: 한글 등 3바이트, 영문·숫자·공백 1바이트, 줄바꿈 2바이트
export function neisBytes(str = "") {
  let b = 0;
  for (const ch of str) {
    if (ch === "\n") b += 2;
    else if (ch.codePointAt(0) <= 127) b += 1;
    else b += 3;
  }
  return b;
}

function clip(v, n = 800) {
  return String(v ?? "").trim().slice(0, n);
}

function extractText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (c?.type === "output_text" && typeof c.text === "string") return c.text;
    }
  }
  return "";
}

async function callOpenAI(input) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      input,
      temperature: 0.6,
      text: { format: { type: "json_schema", name: "haengbal", strict: true, schema: SCHEMA } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI 오류 (${res.status})`);
  }
  const text = extractText(data);
  const parsed = JSON.parse(text);
  if (!parsed.versionA || !parsed.versionB) throw new Error("AI 응답 형식이 올바르지 않습니다.");
  return { text, parsed };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  const expected = process.env.TEACHER_PASSWORD;
  if (!expected) {
    return res.status(500).json({ error: "서버에 TEACHER_PASSWORD 환경변수가 설정되지 않았습니다." });
  }
  const given = req.headers["x-teacher-password"] || "";
  if (!sameSecret(given, expected)) {
    return res.status(401).json({ error: "선생님 비밀번호가 맞지 않습니다." });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  // 비밀번호 확인용 호출
  if (body.check) return res.status(200).json({ ok: true });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "서버에 OPENAI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  const f = body.fields || {};
  const fields = {
    personality: clip(f.personality),
    episode: clip(f.episode),
    learning: clip(f.learning),
    growth: clip(f.growth),
  };
  if (!Object.values(fields).some(Boolean)) {
    return res.status(400).json({ error: "관찰 자료가 비어 있습니다." });
  }

  const grade = Math.min(6, Math.max(1, parseInt(body.grade, 10) || 4));
  const band = grade <= 2 ? "low" : grade <= 4 ? "mid" : "high";
  const maxBytes = Math.min(3000, Math.max(300, parseInt(body.maxBytes, 10) || 1500));
  const targetChars = Math.floor((maxBytes / 3) * 0.85);
  const master = clip(body.masterPrompt, 6000) || DEFAULT_MASTER_PROMPT;

  const system = `${master}

# 학년군 지침
${GRADE_RULES[band]}

# 분량
각 버전은 공백 포함 약 ${targetChars - 40}~${targetChars}자, NEIS 기준 ${maxBytes}바이트(한글 1자=3바이트)를 절대 넘지 않게 씀.

# 출력
{"versionA": "...", "versionB": "..."} JSON으로만 응답.`;

  const line = (label, v) => `- ${label}: ${v || "(입력 없음 — 이 항목은 지어내지 말 것)"}`;
  const user = `# 학생 관찰 자료 (초등학교 ${grade}학년)
${line("성격·핵심 장점", fields.personality)}
${line("학급 역할·구체적 사례", fields.episode)}
${line("학습 태도·자기관리", fields.learning)}
${line("보완점·지도 후 변화", fields.growth)}`;

  const input = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  try {
    let { text, parsed } = await callOpenAI(input);
    let retried = false;

    // 바이트 초과 시 한 번만 줄여 달라고 다시 요청
    if (neisBytes(parsed.versionA) > maxBytes || neisBytes(parsed.versionB) > maxBytes) {
      retried = true;
      const again = await callOpenAI([
        ...input,
        { role: "assistant", content: text },
        {
          role: "user",
          content: `NEIS ${maxBytes}바이트를 넘었습니다. 내용은 유지하되 두 버전 모두 공백 포함 ${targetChars - 60}자 안팎으로 줄여 같은 JSON 형식으로 다시 써 주세요.`,
        },
      ]);
      parsed = again.parsed;
    }

    return res.status(200).json({
      versionA: parsed.versionA.trim(),
      versionB: parsed.versionB.trim(),
      retried,
    });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: `AI 생성 오류: ${err?.message || "알 수 없는 오류"}` });
  }
}
