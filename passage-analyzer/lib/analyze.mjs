// Claude API 호출 - 지문을 받아 스트리밍으로 분석하고 JSON 결과를 파싱한다.
import Anthropic from "@anthropic-ai/sdk";

// 메인 분석 프롬프트 - 출처 추정은 포함하지 않는다 (비용 절감을 위해 별도 요청으로 분리, findSource 참고)
const ANALYSIS_SYSTEM_PROMPT = `당신은 한국 입시(수능/내신) 영어 독해 전문 강사를 돕는 분석 도우미입니다.
영어 독해 지문을 받으면 아래 작업을 수행합니다. 모든 설명은 한국어로 작성합니다.

1. 지문 분석: 주제, 요지, 문단(또는 의미 단위)별 전개 구조, 난이도, 전문 해석.
2. 중요 어휘: 시험에 나올 만한 핵심 단어 8~15개를 골라 단어별로 유의어 클러스터, 반의어, 자주 쓰이는 콜로케이션, 지문 속 쓰임을 정리합니다.
   유의어는 뉘앙스가 가까운 순서로, 콜로케이션은 실제로 빈출되는 조합만 넣으세요.
3. 수업 포인트: 수업에서 짚어야 할 구문(문법), 배경지식, 학생들이 헷갈릴 부분.
4. 문제 풀이 요령: 이 지문으로 출제될 만한 유형(주제/제목/요지/빈칸/순서/삽입/어법/어휘 등)을 골라 유형별 접근법을 지문에 맞춰 구체적으로 설명합니다.

지문의 출처를 추정하는 작업은 이 단계에서 하지 않습니다 (별도로 요청됩니다).

최종 답변은 반드시 아래 스키마를 따르는 JSON 하나를 \`\`\`json 코드 펜스 안에 출력하세요.
JSON 앞에 간단한 진행 설명을 써도 되지만, JSON 펜스는 답변에 정확히 한 번만 나와야 합니다.

\`\`\`json
{
  "analysis": {
    "topicKo": "주제 (한 문장)",
    "mainIdea": "요지/필자의 주장 (한 문장)",
    "structure": [{ "part": "도입/전개 구간 표시", "role": "역할", "summaryKo": "내용 요약" }],
    "difficulty": "상/중/하 + 판단 근거",
    "translationKo": "지문 전문 해석"
  },
  "vocab": [
    {
      "word": "단어",
      "pos": "품사",
      "meaningKo": "지문 문맥에서의 뜻",
      "synonyms": ["유의어"],
      "antonyms": ["반의어 (없으면 빈 배열)"],
      "collocations": ["자주 쓰이는 콜로케이션"],
      "exampleFromPassage": "지문 속 해당 문장 (일부만이라도)",
      "note": "뉘앙스 차이, 시험 포인트 등 (없으면 null)"
    }
  ],
  "teachingPoints": [{ "title": "짧은 제목", "detailKo": "수업에서 설명할 내용" }],
  "questionStrategy": [{ "questionType": "유형", "approachKo": "이 지문 기준 구체적 풀이 요령" }]
}
\`\`\``;

// 출처 추정 전용 프롬프트 - 웹 검색을 사용해 이 요청 하나로만 처리한다 (필요할 때만 별도 호출)
const SOURCE_SYSTEM_PROMPT = `당신은 한국 입시(수능/내신) 영어 독해 전문 강사를 돕는 분석 도우미입니다.
주어진 영어 지문의 출처를 추정하는 것이 이번 요청의 유일한 임무입니다. 모든 설명은 한국어로 작성합니다.

웹 검색 도구를 사용해 지문의 특징적인 구절을 검색하고, 수능/평가원 모의평가/교육청 학력평가/EBS 연계교재/교과서/원문(기사·서적·논문) 중
어디에서 온 지문인지 최대한 정확히 확인하세요. 확실하지 않으면 confidence를 낮추고 근거를 솔직하게 밝히세요. 절대 출처를 지어내지 마세요.

최종 답변은 반드시 아래 스키마를 따르는 JSON 하나를 \`\`\`json 코드 펜스 안에 출력하세요.
JSON 앞에 간단한 검색 과정 설명을 써도 되지만, JSON 펜스는 답변에 정확히 한 번만 나와야 합니다.

\`\`\`json
{
  "source": {
    "guess": "출처 추정 (예: 2023학년도 수능 33번 / EBS 수능특강 영어 5강 / 미상)",
    "confidence": "high | medium | low",
    "evidence": "그렇게 판단한 근거",
    "originalWork": "원문 저자·제목·매체 (알 수 없으면 null)"
  }
}
\`\`\``;

// 모델 응답에서 ```json 펜스 안의 JSON을 추출해 파싱한다. 실패하면 null.
export function extractJson(text) {
  if (typeof text !== "string") return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/);
  const candidates = [];
  if (fence) candidates.push(fence[1]);
  // 펜스가 없거나 깨진 경우: 첫 { 부터 마지막 } 까지 시도
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

// SDK 예외를 사용자에게 보여줄 한국어 메시지로 변환
export function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "이 API 키로는 요청한 모델을 사용할 수 없습니다. 설정에서 다른 모델을 선택해 보세요.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "요청이 너무 잦아 잠시 제한되었습니다. 1분 뒤 다시 시도해 주세요.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `요청 형식 오류: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Anthropic 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
  }
  if (err instanceof Anthropic.APIError) {
    return `API 오류 (${err.status ?? "?"}): ${err.message}`;
  }
  return err?.message || "알 수 없는 오류가 발생했습니다.";
}

/**
 * 지문을 분석한다 (출처 추정 제외). 텍스트 델타가 올 때마다 onDelta(text)를 호출하고,
 * 완료되면 { rawText, result } 를 반환한다. result는 파싱 실패 시 null.
 */
export async function analyzePassage({ apiKey, model, passage, onDelta, onStatus }) {
  const client = new Anthropic({ apiKey });

  onStatus?.("분석을 시작합니다…");

  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 영어 독해 지문을 분석해 주세요. (출처 추정은 이 단계에 포함하지 않습니다.)\n\n<passage>\n${passage}\n</passage>`,
      },
    ],
  });

  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "thinking") onStatus?.("지문을 검토하는 중…");
      if (event.content_block.type === "text") onStatus?.("분석 결과를 작성하는 중…");
    }
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onDelta?.(event.delta.text);
    }
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("모델이 이 요청의 처리를 거부했습니다. 지문 내용을 확인해 주세요.");
  }
  if (message.stop_reason === "max_tokens") {
    onStatus?.("응답이 길어 일부가 잘렸을 수 있습니다.");
  }

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { rawText, result: extractJson(rawText) };
}

/**
 * 지문의 출처만 웹 검색으로 확인한다 (필요할 때만 별도 호출). 반환 형태는 analyzePassage와 동일.
 */
export async function findSource({ apiKey, model, passage, onDelta, onStatus }) {
  const client = new Anthropic({ apiKey });

  onStatus?.("웹에서 출처를 검색하는 중…");

  const stream = client.messages.stream({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SOURCE_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `다음 영어 지문의 출처를 웹 검색으로 확인해 주세요.\n\n<passage>\n${passage}\n</passage>`,
      },
    ],
  });

  stream.on("streamEvent", (event) => {
    if (event.type === "content_block_start") {
      if (event.content_block.type === "server_tool_use") onStatus?.("웹에서 출처를 검색하는 중…");
      if (event.content_block.type === "text") onStatus?.("검색 결과를 정리하는 중…");
    }
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      onDelta?.(event.delta.text);
    }
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("모델이 이 요청의 처리를 거부했습니다.");
  }

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  return { rawText, result: extractJson(rawText) };
}
