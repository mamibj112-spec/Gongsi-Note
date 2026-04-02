const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE'; // wrangler secret put GEMINI_API_KEY로 설정 추천
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;
const ALLOWED_ORIGIN = '*'; // 보안상 본인 GitHub Pages URL ('https://유저명.github.io')로 변경 권장

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const apiKey = env?.GEMINI_API_KEY || GEMINI_API_KEY;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }});
    }

    try {
      const { pdfData, pdfName } = await request.json();
      
      const systemPrompt = `당신은 공무원 시험 전문 학습 도우미입니다. 
제공된 PDF 파일을 분석하여 다음 JSON 형식으로 변환하세요. 
출력은 반드시 순수한 JSON 형식이어야 하며 다른 텍스트는 포함하지 마십시오.

형식:
{
  "year": "파일명에서 추출한 년도 (예: 2026)",
  "subject": "파일명에서 추출한 과목명 (예: 행정법총론)",
  "questions": [
    {
      "id": 숫자,
      "question": "문제 내용",
      "options": ["1 보기1", "2 보기2", "3 보기3", "4 보기4"],
      "answer": 정답번호 (1~4),
      "explanation": "해설 내용"
    }
  ]
}`;

      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts: [
              { inline_data: { mime_type: "application/pdf", data: pdfData } },
              { text: `이 PDF 파일(${pdfName})에서 문제를 추출해 주세요.` }
            ]
          }],
          generationConfig: { 
            maxOutputTokens: 8192, 
            temperature: 0.1,
            response_mime_type: "application/json"
          }
        })
      });

      const gemData = await gemRes.json();
      const resultText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      return new Response(resultText, { headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }});
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
