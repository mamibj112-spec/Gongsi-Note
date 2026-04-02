const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const ALLOWED_ORIGIN = '*';
const GITHUB_REPO = 'mamibj112-spec/Gongsi-Note';
const GITHUB_BRANCH = 'main';

async function commitToGitHub(token, path, content, message) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'gongsi-note-worker'
  };

  // 기존 파일 SHA 가져오기 (업데이트 시 필요)
  let sha;
  const existing = await fetch(apiUrl, { headers });
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }

  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`GitHub commit 실패: ${err.message}`);
  }
}

async function updateIndex(token, newFile) {
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/www/data/index.json`;
  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'gongsi-note-worker'
  };

  let files = [];
  let sha;
  const existing = await fetch(apiUrl, { headers });
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
    files = JSON.parse(atob(data.content.replace(/\n/g, '')));
  }

  if (!files.includes(newFile)) {
    files.push(newFile);
  }

  const body = {
    message: `data: update index.json`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(files)))),
    branch: GITHUB_BRANCH
  };
  if (sha) body.sha = sha;

  await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
}

export default {
  async fetch(request, env) {
    const apiKey = env?.GEMINI_API_KEY || GEMINI_API_KEY;
    const githubToken = env?.GITHUB_TOKEN || '';

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

      const parts = [{ inline_data: { mime_type: "application/pdf", data: pdfData } }];
      if (pdfData2) parts.push({ inline_data: { mime_type: "application/pdf", data: pdfData2 } });
      const fileNames = pdfName2 ? `${pdfName} (문제) + ${pdfName2} (해설)` : pdfName;
      parts.push({ text: `이 PDF(${fileNames})에서 모든 문제를 추출해 주세요.` });

      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 65536, temperature: 0.1 }
        })
      });

      const gemData = await gemRes.json();
      if (!gemRes.ok) throw new Error(`Gemini API Error: ${gemData.error?.message || 'Unknown error'}`);

      let resultText = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resultText) throw new Error('AI가 결과를 반환하지 않았습니다.');

      resultText = resultText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

      try {
        JSON.parse(resultText);
      } catch(e) {
        const lastBrace = resultText.lastIndexOf('},');
        if (lastBrace !== -1) resultText = resultText.substring(0, lastBrace + 1) + ']}';
      }

      // GitHub에 자동 저장
      if (githubToken) {
        try {
          const parsed = JSON.parse(resultText);
          const fileName = `${parsed.year}_${parsed.subject}.json`;
          const filePath = `www/data/${fileName}`;
          await commitToGitHub(githubToken, filePath, resultText, `data: add ${fileName}`);
          await updateIndex(githubToken, fileName);
          console.log(`GitHub에 저장 완료: ${filePath}`);
        } catch(e) {
          console.error('GitHub 저장 실패 (분석 결과는 정상):', e.message);
        }
      }

      return new Response(resultText, { headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }});
    } catch (err) {
      console.error('Worker Error:', err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
