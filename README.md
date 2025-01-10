# Chat via Vault 플러그인

Obsidian에서 Google Generative AI(Gemini)를 사용하여 Vault 내의 데이터를 기반으로 AI와 소통할 수 있도록 도와주는 플러그인입니다. 이 플러그인을 통해 Vault의 콘텐츠를 활용한 AI 채팅이 가능하며, Obsidian의 문서와 연계된 다양한 질문에 대한 답변을 얻을 수 있습니다.

## 주요 기능

- **Gemini AI와의 채팅**: Google Generative AI(Gemini)와 실시간으로 대화하고 Vault 내 문서를 참고하여 답변을 제공합니다.
- **Vault 데이터를 통한 컨텍스트 제공**: AI가 Vault 내의 문서를 검색하여 적절한 문서를 바탕으로 답변을 생성합니다.
- **새 탭 인터페이스**: Obsidian에서 새 탭을 열어 Gemini와의 대화가 가능합니다.

## 설치 방법

1. 이 레포지토리를 다운로드하거나 복제합니다.
2. Obsidian의 플러그인 폴더(`.obsidian/plugins/`)에 다운로드한 플러그인 폴더를 추가합니다.
3. 플러그인 설정 화면에서 **Chat via Vault** 플러그인을 활성화합니다.

## 설정
1. 플러그인을 활성화한 후, 설정 탭에서 **Gemini API Key**를 입력합니다.
   - Google Generative AI에 대한 API 키가 필요합니다. [여기서](https://console.cloud.google.com/) API 키를 발급받을 수 있습니다.
2. 설정을 저장합니다.

## 사용법

1. Obsidian 상단의 리본 메뉴에서 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> 아이콘을 클릭하여 새 탭을 엽니다.
2. 새로 열린 탭에서 질문을 입력하고 **Ask** 버튼을 클릭합니다.
3. AI가 Vault 내의 문서를 분석한 후 적절한 답변을 제공합니다.

## 예시

- 질문: "{title} 문서에 대한 요약을 제공해줘."
- Vault 내 문서를 바탕으로 AI가 요약을 제공합니다.
