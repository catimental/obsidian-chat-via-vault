import { Notice } from 'obsidian';
import { generateAIContent } from './ai';
import { AIPluginSettings } from './settings';

export async function continueWriting(
  editor: any,
  settings: AIPluginSettings,
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>
) {
  const cursor = editor.getCursor();
  const context = editor.getRange({ line: 0, ch: 0 }, cursor); // 현재 커서 이전의 텍스트를 가져옴
  console.log(context)

  const apiKey = settings.apiKey;
  const model = settings.selectedModel;

  if (!apiKey) {
    new Notice('Gemini API 키가 설정되지 않았습니다.');
    return;
  }
  // AI로부터 이어 쓸 텍스트 생성
  const generatedText = await generateAIContent(
    "위 글을 이어서 써줘.",
    context, // 문맥을 AI에게 전달
    apiKey,
    model,
    chatHistory
  );
  console.log(generatedText)

  if (generatedText) {
    // 현재 커서 위치에 이어 쓴 내용을 삽입
    editor.replaceRange(generatedText, cursor);
    new Notice('AI가 이어서 작성한 내용을 삽입했습니다.');
  } else {
    new Notice('AI 응답을 가져오는데 실패했습니다.');
  }
}
