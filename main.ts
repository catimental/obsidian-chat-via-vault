import { Plugin, PluginSettingTab, Setting, Notice, App, TFile, WorkspaceLeaf, ItemView } from 'obsidian';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 플러그인 설정 인터페이스
interface AIPluginSettings {
  apiKey: string;
}

const DEFAULT_SETTINGS: AIPluginSettings = {
  apiKey: '',
};

// 유틸리티 함수 추가
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .trim()
    .split(/\s+/);
}

function termFrequency(terms: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  terms.forEach((term) => {
    tf[term] = (tf[term] || 0) + 1;
  });
  return tf;
}

function computeIDF(df: number, totalDocs: number): number {
  return Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
}

function bm25Score(
  queryTerms: string[],
  docTerms: string[],
  df: Record<string, number>,
  totalDocs: number,
  avgDocLength: number,
  k1 = 1.5,
  b = 0.75
): number {
  const tf: Record<string, number> = termFrequency(docTerms);
  const docLength = docTerms.length;
  let score = 0;

  for (const term of queryTerms) {
    if (tf[term]) {
      const idf = computeIDF(df[term] || 0, totalDocs);
      const numerator = tf[term] * (k1 + 1);
      const denominator = tf[term] + k1 * (1 - b + b * (docLength / avgDocLength));
      score += idf * (numerator / denominator);
    }
  }

  return score;
}

// generateAIContent 함수 수정 (history를 유지하도록)
async function generateAIContent(
  query: string,
  context: string,
  apiKey: string,
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>
): Promise<string | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 사용자의 쿼리를 메시지로 추가
    chatHistory.push({
      role: "user",
      parts: [{ text: context }],
    });

    const chat = model.startChat({
      history: chatHistory,
    });

    // API 요청
    let result = await chat.sendMessage(query);

    // 새로운 AI 응답을 history에 추가
    chatHistory.push({
      role: "model",
      parts: [{ text: result.response.text() }],
    });

    console.log('API 응답:', result.response.text());

    return result.response.text();
  } catch (error) {
    console.error('Gemini API 요청 중 오류가 발생했습니다:', error);
    new Notice('AI 응답을 가져오는 중 오류가 발생했습니다.');
  }

  return null;
}

// 수정된 getRelevantDocuments 함수
async function getRelevantDocuments(query: string, app: App): Promise<string> {
  try {
    const files = app.vault.getMarkdownFiles();
    console.log(`Found ${files.length} markdown files.`);
    
    if (files.length === 0) {
      new Notice('마크다운 파일을 찾을 수 없습니다.');
      return '';
    }

    const documents: { file: TFile; content: string; terms: string[] }[] = [];

    // 모든 문서의 토큰화 및 수집
    for (const file of files) {
      const content = await app.vault.cachedRead(file);
      const terms = tokenize(content);
      documents.push({ file, content, terms });
      console.log(`Processed file: ${file.basename}, Terms: ${terms.length}`);
    }

    // 문서 빈도 계산 및 평균 문서 길이 계산
    const df: Record<string, number> = {};
    const totalDocs = documents.length;
    let totalDocLength = 0;

    documents.forEach((doc) => {
      totalDocLength += doc.terms.length;
      const uniqueTerms = new Set(doc.terms);
      uniqueTerms.forEach((term) => {
        df[term] = (df[term] || 0) + 1;
      });
    });

    const avgDocLength = totalDocLength / totalDocs;

    console.log(`Total documents: ${totalDocs}`);
    console.log(`Average document length: ${avgDocLength}`);
    console.log('Document frequencies (first 10 terms):', Object.keys(df).slice(0, 10));

    // 쿼리 토큰화
    const queryTerms = tokenize(query);
    console.log('Query terms:', queryTerms);

    // BM25 점수 계산
    const similarities = documents.map((doc) => {
      const score = bm25Score(queryTerms, doc.terms, df, totalDocs, avgDocLength);
      return { file: doc.file, content: doc.content, score };
    });

    // 점수 순으로 정렬
    similarities.sort((a, b) => b.score - a.score);

    // 상위 5개의 문서 선택
    const topDocuments = similarities.slice(0, 5).filter((doc) => doc.score > 0);

    console.log(`Number of top documents with score > 0: ${topDocuments.length}`);

    // 매칭된 문서의 제목과 점수를 로그로 출력
    topDocuments.forEach((doc) => {
      console.log(`매칭된 문서 발견: ${doc.file.basename}, 점수: ${doc.score.toFixed(4)}`);
    });

    // 컨텍스트로 사용할 문서 내용 합치기 (제목 포함)
    const matchingContents = topDocuments.map(
      (doc) => `## ${doc.file.basename}\n\n${doc.content}`
    );

    const context = matchingContents.join('\n\n---\n\n');

    console.log('생성된 컨텍스트:', context);

    return context;
  } catch (error) {
    console.error('Error in getRelevantDocuments:', error);
    new Notice('문서를 검색하는 중 오류가 발생했습니다.');
    return '';
  }
}

// 컨텍스트를 제한하는 함수
function truncateContext(context: string, maxLength: number): string {
  if (context.length <= maxLength) {
    return context;
  }
  return context.substring(0, maxLength);
}

// 새로운 뷰 생성
const AI_VIEW_TYPE = 'ai-plugin-view';

class AIView extends ItemView {
  plugin: AIPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: AIPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return AI_VIEW_TYPE;
  }

  getDisplayText() {
    return "AI Assistant";
  }

  async onOpen() {
    const container = this.containerEl.children[1];

    const inputField = container.createEl('input', {
      type: 'text',
      placeholder: 'Ask AI...',
    });
    inputField.setAttribute('style', 'width: 100%; padding: 8px; margin-bottom: 10px;');

    const askButton = container.createEl('button', {
      text: 'Ask',
    });
    askButton.setAttribute('style', 'padding: 8px; margin-left: 10px;');

    const responseParagraph = container.createEl('p');
    responseParagraph.setAttribute('style', 'margin-top: 10px;');

    askButton.addEventListener('click', async () => {
      const query = inputField.value;
      if (!query) {
        new Notice('질문을 입력해주세요.');
        return;
      }

      askButton.disabled = true;
      askButton.innerText = '생각 중...';

      // 관련 문서 가져오기
      const MAX_CONTEXT_LENGTH = 4000;
      let context = await getRelevantDocuments(query, this.plugin.app);

      context = truncateContext(context, MAX_CONTEXT_LENGTH);

      // AI로부터 답변 가져오기
      const response = await generateAIContent(query, context, this.plugin.settings.apiKey, this.plugin.chatHistory);
      responseParagraph.innerText = response || 'AI로부터 응답이 없습니다.';

      askButton.disabled = false;
      askButton.innerText = 'Ask';
    });
  }

  async onClose() {
    // 뷰가 닫힐 때의 처리 로직이 있을 경우 여기에 추가
  }
}

// 플러그인 메인 클래스
export default class AIPlugin extends Plugin {
  settings: AIPluginSettings = DEFAULT_SETTINGS;
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  async onload() {
    console.log('AI Plugin loaded!');
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new AIPluginSettingTab(this.app, this));

    // 새 탭 열기 명령 등록
    this.addRibbonIcon('bot', 'AI Assistant', () => {
      this.activateView();
    });

    this.registerView(AI_VIEW_TYPE, (leaf) => new AIView(leaf, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(AI_VIEW_TYPE);
  }

  async activateView() {
    this.app.workspace.detachLeavesOfType(AI_VIEW_TYPE);

    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({
      type: AI_VIEW_TYPE,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// 플러그인 설정 탭 클래스
class AIPluginSettingTab extends PluginSettingTab {
  plugin: AIPlugin;

  constructor(app: App, plugin: AIPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI Plugin Settings' });

    new Setting(containerEl)
      .setName('Gemini API Key')
      .setDesc('Gemini API 키를 입력하세요.')
      .addText((text) =>
        text
          .setPlaceholder('Enter API Key')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
