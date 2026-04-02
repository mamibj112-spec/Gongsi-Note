import json
import re
import os
import sys

# 출력 인코딩 설정 (Windows 터미널 한글 깨짐 방지)
sys.stdout.reconfigure(encoding='utf-8')

def parse_study_text(filepath):
    if not os.path.exists(filepath):
        print(f"파일을 찾을 수 없습니다: {filepath}")
        return None

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    questions = []
    current_q = None
    state = "intro" # intro, question, options, explanation

    # 정답 번호 추출 (문제 끝에 있는 '답 X' 형태)
    # 때로는 문제 상단에 있는 목록도 참고할 수 있지만, 문제별 '답 X'가 더 정확함

    for line in lines:
        line = line.strip()
        if not line: continue

        # 새로운 문제 시작 감지 (예: 01, 10, 25 등 숫자로 시작)
        # 단, 보기(1, 2, 3, 4)와 헷갈리지 않게 두자리 숫자 위주로 감지
        q_start_match = re.match(r'^(\d{2})\s+(.*)', line)
        if q_start_match:
            if current_q:
                questions.append(current_q)
            
            current_q = {
                "id": int(q_start_match.group(1)),
                "question": q_start_match.group(2),
                "options": [],
                "answer": 1,
                "explanation": ""
            }
            state = "question"
            continue

        if not current_q: continue

        # 보기 감지 (1, 2, 3, 4로 시작)
        opt_match = re.match(r'^([1-4])\s+(.*)', line)
        if opt_match and state in ["question", "options"]:
            current_q["options"].append(f"{opt_match.group(1)} {opt_match.group(2)}")
            state = "options"
            continue

        # 해설 시작 감지
        if line.startswith("해설"):
            state = "explanation"
            continue

        # 정답 감지 (답 4, 답 3 등)
        ans_match = re.search(r'^답\s*(\d)', line)
        if ans_match:
            current_q["answer"] = int(ans_match.group(1))
            state = "intro" # 한 문제 끝
            continue

        # 상태에 따른 텍스트 누적
        if state == "question":
            current_q["question"] += " " + line
        elif state == "explanation":
            current_q["explanation"] += line + "\n"
        elif state == "options" and not opt_match:
            # 보기가 여러 줄인 경우 마지막 보기에 추가
            if current_q["options"]:
                current_q["options"][-1] += " " + line

    # 마지막 문제 추가
    if current_q:
        questions.append(current_q)

    return questions

def main():
    input_file = r"D:\government official\pdf\2026 소방 행정법총론 해설 이승철.txt"
    output_dir = r"D:\government official\json_output"
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "fire_admin_law_2026.json")

    # 파일명에서 년도와 과목 추출 시도
    filename = os.path.basename(input_file)
    year_match = re.search(r'(\d{4})', filename)
    year = year_match.group(1) if year_match else "2026"
    
    # 과목 추출 (공백이나 특정 키워드 기준)
    subject = "행정법총론"
    if "소방" in filename and "행정법총론" in filename:
        subject = "소방 행정법총론"
    elif "행정법" in filename:
        subject = "행정법"

    print(f"변환 시작: {filename} (연도: {year}, 과목: {subject})")
    questions = parse_study_text(input_file)

    if questions:
        # 데이터 구조화 (앱이 요구하는 형식: year, subject, questions)
        data = {
            "year": year,
            "subject": subject,
            "count": len(questions),
            "questions": questions
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"성공! {len(questions)}문제가 추출되었습니다.")
        print(f"파일 위치: {output_file}")
    else:
        print("문제를 추출하지 못했습니다. 파일 내용이나 형식을 확인해 주세요.")

if __name__ == "__main__":
    main()
