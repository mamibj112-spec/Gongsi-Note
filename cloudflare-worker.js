const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE'; // wrangler secret put GEMINI_API_KEY로 설정 추천
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;
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
      const { pdfData, pdfName, pdfData2, pdfName2 } = await request.json();
      console.log(`Processing: ${pdfName}${pdfName2 ? ' + ' + pdfName2 : ''}`);

      const systemPrompt = `당신은 공무원 시험 전문 학습 도우미입니다.
제공된 PDF 파일을 분석하여 다음 JSON 형식으로 변환하세요.
문제 PDF와 해설 PDF가 별도로 제공될 수 있으니 매칭하여 통합하세요.
출력은 반드시 순수한 JSON 형식이어야 하며 다른 텍스트는 포함하지 마십시오.

해설(explanation) 작성 규칙:
- 각 보기별 정오 여부와 이유를 짧게 요약하세요.
- 형식: ① (X) 내용... \n② (O) 내용... \n③ (X) 내용...
- 핵심만 짚어 200자 이내로 작성하세요.

형식:
{
  "year": "파일명에서 추출한 년도 (예: 2026)",
  "subject": "파일명에서 추출한 과목명 (예: 행정법총론)",
  "questions": [
    {
      "id": 숫자,
      "question": "문제 내용",
      "options": ["1 보기1", "2 보기2", "3 보기3", "4 보기4"],
      "answer": 정답번호 (1~4 숫자),
      "explanation": "① (X) ... \n② (O) ... \n③ (X) ... \n④ (X) ..."
    }
  ]
}`;

      const parts = [
        { inline_data: { mime_type: "application/pdf", data: pdfData } }
      ];
      if (pdfData2) {
        parts.push({ inline_data: { mime_type: "application/pdf", data: pdfData2 } });
      }
      const fileNames = pdfName2 ? `${pdfName} (문제) + ${pdfName2} (해설)` : pdfName;
      parts.push({ text: `이 PDF(${fileNames})에서 모든 문제를 추출해 주세요.` });

      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{
            parts
          }],
          generationConfig: {
            maxOutputTokens: 65536,
            temperature: 0.1
          }
        })
      });

      const gemData = await gemRes.json();
      
      if (!gemRes.ok) {
        console.error('Gemini API Error:', gemData);
        throw new Error(`Gemini API Error: ${gemData.error?.message || 'Unknown error'}`);
      }

      let resultText = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resultText) {
        console.error('Gemini Empty Result:', gemData);
        throw new Error('AI가 결과를 반환하지 않았습니다. (내용이 너무 많거나 처리 불가)');
      }

      // JSON 코드블록 제거
      resultText = resultText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

      // 잘린 JSON 복구: 마지막 완전한 문제까지만 사용
      try {
        JSON.parse(resultText);
      } catch(e) {
        const lastBrace = resultText.lastIndexOf('},');
        if (lastBrace !== -1) {
          resultText = resultText.substring(0, lastBrace + 1) + ']}';
        }
      }

      console.log('Successfully generated JSON for:', pdfName);

      return new Response(resultText, { headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }});
    } catch (err) {
      console.error('Worker Catch Error:', err.message);
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
