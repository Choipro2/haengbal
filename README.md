# 우리 반 행발 도우미 (haengbal)

관찰 키워드를 입력하면 ChatGPT(OpenAI)가 NEIS 행동특성 및 종합의견 버전 A/B를 만들어 주는 학급용 웹앱입니다.

## 구성
- `index.html` : 화면 (입력·표·바이트 계산·엑셀 저장/불러오기, 데이터는 브라우저에만 저장)
- `api/generate.js` : Vercel 서버 함수 (OpenAI 호출, 선생님 비밀번호 확인)

## Vercel 환경변수
| 이름 | 값 |
|---|---|
| `OPENAI_API_KEY` | 북트리와 같은 OpenAI 키 |
| `TEACHER_PASSWORD` | 선생님만 아는 비밀번호 |
| `OPENAI_MODEL` | (선택) 기본 `gpt-4.1-mini` |

## 개인정보
- 학생 이름은 서버로 보내지 않습니다. 관찰 칸에 이름을 적어도 '학생'으로 바꿔서 보냅니다.
- 입력 자료와 결과는 이 브라우저(localStorage)에만 저장됩니다. 다른 컴퓨터로 옮길 때는 엑셀 저장 → 엑셀 불러오기를 쓰세요.
