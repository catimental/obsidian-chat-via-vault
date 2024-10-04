import { Plugin, PluginSettingTab, Setting, Notice, App, TFile, WorkspaceLeaf, ItemView } from 'obsidian';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface AIPluginSettings {
  apiKey: string;
  selectedModel: string;
}

const DEFAULT_SETTINGS: AIPluginSettings = {
  apiKey: '',
  selectedModel: 'gemini-1.5-flash',
};

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

async function generateAIContent(
  query: string,
  context: string,
  apiKey: string,
  model: string,
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>
): Promise<string | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const selectedModel = genAI.getGenerativeModel({ model });

    chatHistory.push({
      role: "user",
      parts: [{ text: query }],
    });

    const chat = selectedModel.startChat({
      history: chatHistory,
    });

    let result = await chat.sendMessage(query);

    chatHistory.push({
      role: "model",
      parts: [{ text: result.response.text() }],
    });

    return result.response.text();
  } catch (error) {
    console.error('Gemini API 요청 중 오류가 발생했습니다:', error);
    new Notice('AI 응답을 가져오는 중 오류가 발생했습니다.');
  }

  return null;
}

async function getRelevantDocuments(query: string, app: App): Promise<string> {
  try {
    const files = app.vault.getMarkdownFiles();

    if (files.length === 0) {
      new Notice('마크다운 파일을 찾을 수 없습니다.');
      return '';
    }

    const documents: { file: TFile; content: string; terms: string[] }[] = [];

    for (const file of files) {
      const content = await app.vault.cachedRead(file);
      const terms = tokenize(content);
      documents.push({ file, content, terms });
    }

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

    const queryTerms = tokenize(query);

    const similarities = documents.map((doc) => {
      const score = bm25Score(queryTerms, doc.terms, df, totalDocs, avgDocLength);
      return { file: doc.file, content: doc.content, score };
    });

    similarities.sort((a, b) => b.score - a.score);

    const topDocuments = similarities.slice(0, 5).filter((doc) => doc.score > 0);

    const matchingContents = topDocuments.map(
      (doc) => `## ${doc.file.basename}\n\n${doc.content}`
    );

    const context = matchingContents.join('\n\n---\n\n');

    return context;
  } catch (error) {
    console.error('Error in getRelevantDocuments:', error);
    new Notice('문서를 검색하는 중 오류가 발생했습니다.');
    return '';
  }
}

function truncateContext(context: string, maxLength: number): string {
  if (context.length <= maxLength) {
    return context;
  }
  return context.substring(0, maxLength);
}

const AI_VIEW_TYPE = 'Gemini-Chat via Vault';

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
    return "Gemini-Chat via Vault";
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

      const MAX_CONTEXT_LENGTH = 4000;
      let context = await getRelevantDocuments(query, this.plugin.app);

      context = truncateContext(context, MAX_CONTEXT_LENGTH);

      const response = await generateAIContent(query, context, this.plugin.settings.apiKey, this.plugin.settings.selectedModel, this.plugin.chatHistory);
      responseParagraph.innerText = response || 'AI로부터 응답이 없습니다.';

      askButton.disabled = false;
      askButton.innerText = 'Ask';
    });
  }

  async onClose() {}
}

export default class AIPlugin extends Plugin {
  settings: AIPluginSettings = DEFAULT_SETTINGS;
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new AIPluginSettingTab(this.app, this));

    this.addRibbonIcon('bot', 'Gemini-Chat via Vault', () => {
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

    new Setting(containerEl)
      .setName('AI Model')
      .setDesc('사용할 AI 모델을 선택하세요.')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "gemini-1.5-flash-exp-0827": "gemini-1.5-flash-exp-0827",
            "gemini-1.5-flash": "gemini-1.5-flash-latest",
            "gemini-1.5-pro": "gemini-1.5-pro-latest",
          })
          .setValue(this.plugin.settings.selectedModel)
          .onChange(async (value) => {
            this.plugin.settings.selectedModel = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
