import { TFile, WorkspaceLeaf, ItemView, MarkdownRenderer, MarkdownView, Notice, App, Modal, TextComponent } from 'obsidian';
import { getRelevantDocuments, truncateContext } from './nlp';
import { generateAIContent, generateAIContentStream } from './ai';
import AIPlugin from './main';

const AI_VIEW_TYPE = 'Vault Chat';

export class AIView extends ItemView {
  plugin: AIPlugin;
  chatContainer!: HTMLElement;
  lastOpenedFile: TFile | null = null;
  selectedText: string = '';
  messages: Array<{ role: 'user' | 'model', message: string, images?: string[] }> = [];

  constructor(leaf: WorkspaceLeaf, plugin: AIPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return "Vault Chat";
  }

  getDisplayText() {
    return "Vault Chat";
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

    const title = container.createEl('h2', { text: 'Vault Chat' });
    title.addClass('ai-chat-title');

    this.chatContainer = container.createEl('div');
    this.chatContainer.addClass('ai-chat-container');
    this.chatContainer.style.setProperty('--conversation-height', `${this.plugin.settings.conversationHeight}px`);

    this.chatContainer.style.userSelect = 'text';

    this.applyStyles();


    const addMessageToChat = (message: string, role: 'user' | 'model', images?: string[] | null) => {
      const messageEl = this.chatContainer.createEl('div');
      messageEl.addClass(role === 'user' ? 'user-message' : 'model-message');
      messageEl.style.userSelect = 'text';

  
      const mdContent = document.createElement('div');
      mdContent.textContent = message;  // 텍스트를 직접 추가하여 확인
      messageEl.appendChild(mdContent);
  
      this.chatContainer.appendChild(messageEl);
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  
      return mdContent;
  };



  

    const updateMessageContent = async (mdContent: HTMLElement, message: string) => {
      mdContent.empty();
      await MarkdownRenderer.renderMarkdown(message, mdContent, this.lastOpenedFile?.path || '', this);
    };

    const inputContainer = container.createEl('div');
    inputContainer.addClass('ai-input-container');

    const inputField = inputContainer.createEl('textarea', {
      placeholder: 'Ask AI or enter Markdown...',
    });
    inputField.addClass('ai-input-field');

    const askButton = inputContainer.createEl('button', { text: 'Ask' });
    askButton.addClass('ai-ask-button');

    const refreshButton = inputContainer.createEl('button', { text: 'Refresh' });
    refreshButton.addClass('ai-refresh-button');

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

      refreshButton.addEventListener('click', () => {
        this.chatContainer.empty();
        this.plugin.chatHistory = [];
        new Notice('채팅 내역이 초기화 되었습니다.');
      });
  
      // 유저 메시지를 추가
      this.messages.push({ role: 'user', message: query });
      const userMessageElement = addMessageToChat(query, 'user');
      inputField.value = '';
  
      // "답변 중..." 메시지 추가
      this.messages.push({ role: 'model', message: "문서 검색 중..." });
      const aiMessageElement = addMessageToChat("문서 검색 중...", 'model');
  
      askButton.disabled = true;
  
      let context = await getRelevantDocuments(query, this.plugin.app, this.plugin.settings.documentNum, this.lastOpenedFile, this.plugin.settings.searchalgorithm);
      context = `::: Selected Text :::\n${this.selectedText}\n` + context;
      console.log(context)
      context = truncateContext(context, this.plugin.settings.maxContextLength);
  
      // AI 응답을 실시간 스트리밍으로 받기
      await generateAIContentStream(query, context, this.plugin.settings.apiKey, this.plugin.settings.selectedModel, this.plugin.chatHistory, this.plugin.settings.selectedPrompt, (chunkText) => {
          // "답변 중..."을 AI의 응답으로 교체
          const lastMessageIndex = this.messages.length - 1;
          if (this.messages[lastMessageIndex].message === "문서 검색 중...") {
              this.messages[lastMessageIndex].message = ""; // "답변 중..."을 빈 문자열로 교체
          }
          this.messages[lastMessageIndex].message += chunkText;
          
          // UI 업데이트
          updateMessageContent(aiMessageElement, this.messages[lastMessageIndex].message);
          this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
      });
  
      this.plugin.chatHistory.push({ role: 'user', parts: [{ text: query }] });
      this.plugin.chatHistory.push({ role: 'model', parts: [{ text: this.messages[this.messages.length - 1].message }] });
  
      askButton.disabled = false;
      askButton.innerText = 'Ask';
      


  })
  document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  
};
applyStyles() {
  const isDarkTheme = document.body.classList.contains('theme-dark');
  const fontColor = isDarkTheme ? this.plugin.settings.darkFontColor : this.plugin.settings.lightFontColor;
  const backgroundColor = isDarkTheme ? this.plugin.settings.darkBackgroundColor : this.plugin.settings.lightBackgroundColor;

  this.chatContainer.style.color = fontColor;
  this.chatContainer.style.backgroundColor = backgroundColor;
}

// 설정 변경 시 스타일 업데이트하는 메서드 추가
updateStyles() {
  this.applyStyles();  // 테마에 맞게 스타일 재적용
}

  handleSelectionChange() {
    const selection = window.getSelection();
    if (selection!.toString().trim().length>0){
      this.selectedText = selection!.toString().trim(); // 드래그된 텍스트를 저장
      console.log(this.selectedText)
    }
      
  }

  getSelectedText(): string {
    return this.selectedText; // 선택된 텍스트를 반환하는 메서드
  }


  updateChatContainerHeight(newHeight: number) {
    this.chatContainer.style.height = `${newHeight}px`;
  }

  async onClose() {}
}



export class FlowchartModal extends Modal {
    onSubmit: (flowchartInput: string) => void;
  
    constructor(app: App, onSubmit: (flowchartInput: string) => void) {
      super(app);
      this.onSubmit = onSubmit;
    }
  
    onOpen() {
      const { contentEl } = this;
  
      contentEl.createEl('h5', { text: '어떤 플로차트를 작성하고 싶으신가요?' });
  
      const inputEl = new TextComponent(contentEl);
      inputEl.setPlaceholder('이 문서의 흐름도를 작성해줘');
  
      inputEl.inputEl.style.width = '100%';
  
      inputEl.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.onSubmit(inputEl.getValue());
          this.close();
        }
      });
    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
  }
  


  export class PromptModal extends Modal {
    onSubmit: (prompt: string) => void;
    prompt: string;
  
    constructor(app: App, onSubmit: (prompt: string) => void, prompt: string = '') {
      super(app);
      this.onSubmit = onSubmit;
      this.prompt = prompt;
    }
  
    onOpen() {
      const { contentEl } = this;
  
      contentEl.createEl('h2', { text: 'Add/Edit Prompt' });
  
      const inputEl = new TextComponent(contentEl);
      inputEl.setValue(this.prompt);  // 기존 프롬프트가 있을 경우 미리 입력
  
      inputEl.inputEl.style.width = '100%';
  
      inputEl.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.onSubmit(inputEl.getValue());  // 프롬프트 제출
          this.close();
        }
      });
  
      inputEl.inputEl.focus();
    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
  }
  