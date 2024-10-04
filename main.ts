import { Plugin, PluginSettingTab, Setting, Notice, App, TFile, WorkspaceLeaf, ItemView } from 'obsidian';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface AIPluginSettings {
  apiKey: string;
  selectedModel: string;
  maxContextLength: number;
  documentNum: number;
  conversationHeight: number;

};

const DEFAULT_SETTINGS: AIPluginSettings = {
  apiKey: '',
  selectedModel: 'gemini-1.5-flash',
  maxContextLength: 4000,
  documentNum: 5,
  conversationHeight: 400,
};

import { encode } from 'gpt-tokenizer';


async function tokenize(inputText: string): Promise<string[]> {
  try {
    if (typeof inputText !== 'string') {
      throw new Error('올바른 문자열을 입력해주세요.');
    }
    const tokens = encode(inputText).map(token => token.toString());
    return tokens;
  } catch (error) {
    console.error('토큰화 중 오류가 발생했습니다:', error);
    return [];
  }
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
  titleTerms: string[],
  df: Record<string, number>,
  totalDocs: number,
  avgDocLength: number,
  k1 = 1.5,
  b = 0.75,
  titleWeight = 1.5
): number {
  const tf: Record<string, number> = termFrequency(docTerms);
  const titleTF: Record<string, number> = termFrequency(titleTerms);
  const docLength = docTerms.length;
  let score = 0;

  for (const term of queryTerms) {
    if (tf[term]) {
      const idf = computeIDF(df[term] || 0, totalDocs);
      const numerator = tf[term] * (k1 + 1);
      const denominator = tf[term] + k1 * (1 - b + b * (docLength / avgDocLength));
      score += idf * (numerator / denominator);
    }
    
    if (titleTF[term]) {
      const idf = computeIDF(df[term] || 0, totalDocs);
      const numerator = titleTF[term] * (k1 + 1);
      const denominator = titleTF[term] + k1 * (1 - b + b * (docLength / avgDocLength));
      score += titleWeight * idf * (numerator / denominator);
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
      parts: [{ text: context }],
    });

    const chat = selectedModel.startChat({
      history: chatHistory,
    });

    let result = await chat.sendMessage("# rules\n- If you reference a document, be sure to provide the document's wiki link (e.g. [[path/to/document]]).\n# Info\n- \"Current Opened Document\" refers to the document that is currently open and being viewed by the user.\nUsing the documentation provided, answer the following questions in the appropriate language for questions.:"+query);

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

// getRelevantDocuments 함수에서 this를 사용하지 않고 필요한 정보를 인자로 받습니다.
async function getRelevantDocuments(
  query: string,
  app: App, 
  documentNum: number,
  lastOpenedFile: TFile | null
): Promise<string> {
  try {
    const files = app.vault.getMarkdownFiles();
    
    if (files.length === 0) {
      new Notice('마크다운 파일을 찾을 수 없습니다.');
      return '';
    }

    const documents: { file: TFile; content: string; terms: string[]; titleTerms: string[] }[] = [];

    // 링크된 문서들을 포함하기 위한 추가 처리
    const linkedDocuments: { file: TFile; content: string }[] = [];

    // 1. query에서 [[wikilink]] 추출
    const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
    let match;
    const linkedPaths: string[] = [];

    while ((match = wikilinkPattern.exec(query)) !== null) {
      linkedPaths.push(match[1]);
    }

    // 2. 링크된 문서들을 찾아서 context에 추가
    for (const path of linkedPaths) {
      const file = app.metadataCache.getFirstLinkpathDest(path, "");
      if (file) {
        const content = await app.vault.cachedRead(file);
        linkedDocuments.push({ file, content });
      }
    }

    // 3. 일반 문서 검색 처리
    for (const file of files) {
      const content = await app.vault.cachedRead(file);
      const title = file.basename;
      const titleTerms = await tokenize(title);
      const contentTerms = await tokenize(content);
      const terms = [...titleTerms, ...contentTerms];
      documents.push({ file, content, terms, titleTerms });
    }

    // DF 계산과 유사도 계산
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
    const queryTerms = await tokenize(query);

    // BM25를 이용한 문서 유사도 계산
    const similarities = documents.map((doc) => {
      const score = bm25Score(queryTerms, doc.terms, doc.titleTerms, df, totalDocs, avgDocLength);
      return { file: doc.file, content: doc.content, score };
    }); 

    similarities.sort((a, b) => b.score - a.score);
    const topDocuments = similarities.slice(0, documentNum).filter((doc) => doc.score > 0);
    
    // 4. 마지막으로 열었던 문서 추가
    let currentDocumentContent = '';
    if (lastOpenedFile) {
      const lastOpenedContent = await app.vault.cachedRead(lastOpenedFile);
      currentDocumentContent = `::: Current Opened Document Path :::\n${lastOpenedFile.path}\n\n::: Current Opened Document Content :::\n${lastOpenedContent}`;
    }
    console.log(currentDocumentContent);

    // 5. 링크된 문서들과 관련 문서들을 모두 context로 합침
    const matchingContents = [
      ...linkedDocuments.map(doc => `::: Document Path :::\n${doc.file.path}\n\n::: Document Content: :::\n${doc.content}`),
      ...topDocuments.map(doc => `::: Document Path :::\n${doc.file.path}\n\n::: Document Content :::\n${doc.content}`)
    ];

    // 마지막으로 열었던 문서 내용을 context 맨 앞에 추가
    matchingContents.unshift(currentDocumentContent);  // 맨 앞에 추가
    const context = matchingContents.join('\n\n---\n\n');
    console.log(context);
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


import { MarkdownRenderer, MarkdownView } from 'obsidian';

class AIView extends ItemView {
  plugin: AIPlugin;
  chatContainer!: HTMLElement;
  lastOpenedFile: TFile | null = null;


  constructor(leaf: WorkspaceLeaf, plugin: AIPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return AI_VIEW_TYPE;
  }

  getDisplayText() {
    return "Gemini AI Chat";
  }

  

  async onload() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          const currentFile = leaf.view.file;
          if (currentFile) {
            this.lastOpenedFile = currentFile;
          }
        }
      })
    );
    
    const container = this.containerEl.children[1];
  
    const title = container.createEl('h2', { text: 'Gemini AI Chat' });
    title.setAttribute('style', 'text-align: center; margin-bottom: 20px; color: #333; font-weight: bold;');
  
    this.chatContainer = container.createEl('div');
    this.chatContainer.setAttribute('style', `height: ${this.plugin.settings.conversationHeight}px; overflow-y: auto; background-color: #f9f9f9; padding: 10px; border-radius: 8px; border: 1px solid #ccc; margin-bottom: 20px; display: flex; flex-direction: column;`);
  
    const addMessageToChat = async (message: string, role: 'user' | 'ai') => {
      const messageEl = this.chatContainer.createEl('div');
      messageEl.addClass(role === 'user' ? 'user-message' : 'ai-message');
  
      if (role === 'user') {
        messageEl.setText(message);
        messageEl.setAttribute('style', 'background-color: #e9e9e9; padding: 10px; border-radius: 8px; margin-bottom: 10px; max-width: 75%; align-self: flex-end; word-wrap: break-word; user-select: text;');
      } else {
        const mdContent = document.createElement('div');
        messageEl.setAttribute('style', 'background-color: #f1f1f1; padding: 10px; border-radius: 8px; margin-bottom: 10px; max-width: 75%; align-self: flex-start; word-wrap: break-word; user-select: text;');
  
        await MarkdownRenderer.renderMarkdown(message, mdContent, '', this.plugin);
        messageEl.appendChild(mdContent);
  
        const internalLinks = mdContent.querySelectorAll('a.internal-link');
        internalLinks.forEach((linkEl) => {
          linkEl.addEventListener('click', (event) => {
            event.preventDefault();
            const linkText = linkEl.getAttribute('href');
            if (linkText) {
              const file = this.plugin.app.metadataCache.getFirstLinkpathDest(linkText, "");
              if (file) {
                this.plugin.app.workspace.getLeaf(true).openFile(file);
              } else {
                new Notice(`파일을 찾을 수 없습니다: ${linkText}`);
              }
            }
          });
        });
      }
  
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    };
  
    // 입력 필드 및 버튼들 생성
    const inputContainer = container.createEl('div');
    inputContainer.setAttribute('style', 'display: flex; gap: 10px;');
  
    const inputField = inputContainer.createEl('textarea', {
      placeholder: 'Ask AI...',
    });
    inputField.setAttribute('style', 'flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #ccc; resize: none; height: 60px;');
  
    const askButton = inputContainer.createEl('button', { text: 'Ask' });
    askButton.setAttribute('style', 'padding: 10px 20px; background-color: #e1e1e1; color: #333; border: none; border-radius: 5px; cursor: pointer;');
  
    // 새로고침 버튼 생성
    const refreshButton = inputContainer.createEl('button', { text: 'Refresh' });
    refreshButton.setAttribute('style', 'padding: 10px 20px; background-color: #e1e1e1; color: #333; border: none; border-radius: 5px; cursor: pointer;');
  
    inputField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        askButton.click();
      }
    });
  
    askButton.addEventListener('click', async () => {
      const query = inputField.value.trim();
      if (!query) {
        new Notice('질문을 입력해주세요.');
        return;
      }
  
      addMessageToChat(query, 'user');
      inputField.value = ''; // 입력 필드를 비웁니다
  
      askButton.disabled = true;
      askButton.innerText = '답변 중...';
  
      let context = await getRelevantDocuments(query, this.plugin.app, this.plugin.settings.documentNum, this.lastOpenedFile);
      context = truncateContext(context, this.plugin.settings.maxContextLength);
      const response = await generateAIContent(query, context, this.plugin.settings.apiKey, this.plugin.settings.selectedModel, this.plugin.chatHistory);
  
      addMessageToChat(response || 'AI로부터 응답이 없습니다.', 'ai');
  
      askButton.disabled = false;
      askButton.innerText = 'Ask';
    });
  
    // 새로고침 버튼 클릭 시 chatContainer 초기화
    refreshButton.addEventListener('click', () => {
      this.chatContainer.empty(); // 채팅 내역을 초기화
      this.plugin.chatHistory = [];
      new Notice('채팅 내역이 초기화 되었습니다.');
    });
  }
  

  updateChatContainerHeight(newHeight: number) {
    this.chatContainer.style.maxHeight = `${newHeight}px`;
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
    await leaf!.setViewState({
      type: AI_VIEW_TYPE,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf!);
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

    containerEl.createEl('h2', { text: 'Vault Chat Plugin Settings' });

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
      .setName('Model')
      .setDesc('사용할 모델을 선택하세요.')
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
    new Setting(containerEl)
      .setName('Max Context Length')
      .setDesc('최대 컨텍스트 길이를 설정하세요.')
      .addText((text) =>
        text
          .setPlaceholder('4000')
          .setValue(this.plugin.settings.maxContextLength.toString())
          .onChange(async (value) => {
            const newValue = parseInt(value, 10);
            if (!isNaN(newValue)) {
              this.plugin.settings.maxContextLength = newValue;
              await this.plugin.saveSettings();
            }
          })
      );
    new Setting(containerEl)
      .setName('Document Count')
      .setDesc('제공할 문서 갯수를 설정하세요.')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(this.plugin.settings.documentNum.toString())
          .onChange(async (value) => {
            const newValue = parseInt(value, 10);
            if (!isNaN(newValue)) {
              this.plugin.settings.documentNum = newValue;
              await this.plugin.saveSettings();
            }
          })
      );
      new Setting(containerEl)
      .setName('Conversation Height')
      .setDesc('대화창의 높이를 설정하세요(px).')
      .addText((text) =>
        text
          .setPlaceholder('400')
          .setValue(this.plugin.settings.conversationHeight.toString())
          .onChange(async (value) => {
            const newValue = parseInt(value, 10);
            if (!isNaN(newValue)) {
              this.plugin.settings.conversationHeight = newValue;
              await this.plugin.saveSettings();

              const activeView = this.app.workspace.getLeavesOfType(AI_VIEW_TYPE).find(leaf => leaf.view instanceof AIView);
              if (activeView && activeView.view instanceof AIView) {
                activeView.view.updateChatContainerHeight(newValue);
              }
            }
          })
      );


  }
}
