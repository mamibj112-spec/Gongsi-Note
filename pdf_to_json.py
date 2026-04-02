import pdfplumber
import json
import re
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

def parse_pdf(pdf_path):
    """PDF에서 텍스트 추출"""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    return text

def extract_questions(text, year, subject):
    """텍스트에서 문제/보기/정답 파싱"""
    questions = []

    # 문제 번호로 분리 (01, 02 ... 또는 1, 2 ...)
    pattern = r'(?=^(?:0?\d{1,2})\s)'
    blocks = re.split(r'\n(?=0?\d{1,2}\s)', text, flags=re.MULTILINE)

    q_id = 1
    for block in blocks:
        block = block.strip()
        if not block:
            continue

        lines = block.split('\n')
        if not lines:
            continue

        # 첫 줄에서 번호 제거하고 문제 추출
        first_line = lines[0].strip()
        q_num_match = re.match(r'^0?(\d{1,2})\s+(.*)', first_line)
        if not q_num_match:
            continue

        num = int(q_num_match.group(1))
        if num < 1 or num > 50:
            continue

        question_parts = [q_num_match.group(2)]

        options = []
        explanation_lines = []
        answer = None
        in_explanation = False

        for line in lines[1:]:
            line = line.strip()
            if not line:
                continue

            # 해설 시작 감지
            if re.match(r'^해설$|^■|^\[해설\]', line):
                in_explanation = True
                continue

            # 정답 감지 (㉠ ① 등)
            answer_match = re.search(r'답\s*[①②③④⑤]|정답\s*[①②③④⑤]|㉠\s*(\d)|^[①②③④⑤]\s*$', line)

            # 보기 감지
            option_match = re.match(r'^([①②③④⑤])\s+(.+)', line)
            if option_match and not in_explanation:
                options.append(option_match.group(1) + " " + option_match.group(2))
                continue

            # 정답 번호 추출 (맨 아래 ㉠ 숫자 형태)
            final_answer_match = re.search(r'㉠\s*(\d)', line)
            if final_answer_match:
                answer = int(final_answer_match.group(1))
                continue

            if in_explanation:
                explanation_lines.append(line)
            else:
                question_parts.append(line)

        question_text = ' '.join(question_parts).strip()
        explanation_text = ' '.join(explanation_lines[:5]).strip()  # 해설 앞 5줄만

        if question_text and len(options) >= 2:
            questions.append({
                "id": q_id,
                "question": question_text,
                "options": options,
                "answer": answer if answer else 1,
                "explanation": explanation_text
            })
            q_id += 1

    return questions

def pdf_to_json(pdf_path, year, subject, output_dir):
    print(f"처리 중: {os.path.basename(pdf_path)}")
    text = parse_pdf(pdf_path)
    questions = extract_questions(text, year, subject)

    if not questions:
        print(f"  [!] 문제를 찾지 못했습니다. PDF 구조가 다를 수 있어요.")
        # 원본 텍스트 저장 (수동 확인용)
        txt_path = os.path.join(output_dir, f"{year}_{subject}_raw.txt")
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"  → 원본 텍스트 저장됨: {txt_path} (직접 확인해보세요)")
        return

    data = {
        "year": year,
        "subject": subject,
        "questions": questions
    }

    out_file = os.path.join(output_dir, f"{year}_{subject}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  [완료] {len(questions)}문제 추출 완료 -> {out_file}")

def guess_year_subject(filename):
    """파일명에서 년도와 과목 자동 추출"""
    name = os.path.splitext(filename)[0]
    year_match = re.search(r'(20\d{2})', name)
    year = year_match.group(1) if year_match else "2026"

    # 불필요한 단어 제거
    remove_words = [year, '해설', '이승철', '소방', '해경', '승진시험', '국가직', '지방직', '경찰', '소방직', '기출']
    subject = name
    for w in remove_words:
        subject = subject.replace(w, '')
    subject = re.sub(r'\s+', ' ', subject).strip()

    return year, subject

def main():
    pdf_dir = "D:/government official/pdf"
    output_dir = "D:/government official/json_output"
    os.makedirs(output_dir, exist_ok=True)

    pdf_files = [f for f in os.listdir(pdf_dir) if f.endswith('.pdf')]
    if not pdf_files:
        print("pdf 폴더에 PDF 파일이 없습니다.")
        return

    print(f"\n총 {len(pdf_files)}개 PDF 처리 시작\n")

    for pdf_file in pdf_files:
        year, subject = guess_year_subject(pdf_file)
        print(f"파일: {pdf_file}")
        print(f"  → 년도: {year}, 과목: {subject}")
        pdf_path = os.path.join(pdf_dir, pdf_file)
        pdf_to_json(pdf_path, year, subject, output_dir)
        print()

    print(f"\n완료! JSON 파일 위치: {output_dir}")

if __name__ == "__main__":
    main()
