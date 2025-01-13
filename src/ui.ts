import { TFile, WorkspaceLeaf, ItemView, MarkdownRenderer, MarkdownView, Notice, App, Modal, TextComponent, TextAreaComponent } from 'obsidian';
import { getRelevantDocuments, getRelevantDocumentsByTopChunks, truncateContext } from './nlp';
import { generateAIContent, generateAIContentStream } from './ai';
import AIPlugin from './main';

const AI_VIEW_TYPE = 'Chat via Vault';

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
    return AI_VIEW_TYPE;
  }

  getDisplayText() {
    return "Chat via Vault";
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

    const title = container.createEl('h2', { text: 'Chat via Vault' });
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
  
      // 유저 메시지를 추가
      this.messages.push({ role: 'user', message: query });
      const userMessageElement = addMessageToChat(query, 'user');
      inputField.value = '';
  
      // "답변 중..." 메시지 추가
      this.messages.push({ role: 'model', message: "문서 검색 중..." });
      const aiMessageElement = addMessageToChat("문서 검색 중...", 'model');
  
      askButton.disabled = true;
      let context = "";
      if (this.plugin.settings.chunkEnabled==false) {
        console.time("getRelevantDocuments");
        context = await getRelevantDocuments(query, this.plugin.app, this.plugin.settings.documentNum, this.lastOpenedFile, this.plugin.settings.searchalgorithm);
        console.timeEnd("getRelevantDocuments");
      } else {
        context = await getRelevantDocumentsByTopChunks(query, this.plugin.app, this.plugin.settings.documentNum, this.lastOpenedFile, this.plugin.settings.chunkNum, this.plugin.settings.searchalgorithm);

      }

      context = `::: Selected Text :::\n${this.selectedText}\n` + context;
      context = truncateContext(context, this.plugin.settings.maxContextLength);

		const llmSettings = this.plugin.settings.platformSettings[this.plugin.settings.selectedPlatform];
		const apiKey = llmSettings.apiKey;
		const model = llmSettings.selectedModel;
      // AI 응답을 실시간 스트리밍으로 받기
      if (this.plugin.settings.generationStreaming==true) {
        await generateAIContentStream(query, context, apiKey, model, this.plugin.chatHistory, this.plugin.settings.selectedPrompt, (chunkText) => {
            const lastMessageIndex = this.messages.length - 1;
            if (this.messages[lastMessageIndex].message === "문서 검색 중...") {
                this.messages[lastMessageIndex].message = ""; // "답변 중..."을 빈 문자열로 교체
            }
            this.messages[lastMessageIndex].message += chunkText;
            
            // UI 업데이트
            updateMessageContent(aiMessageElement, this.messages[lastMessageIndex].message);
        });
      } else if (this.plugin.settings.generationStreaming==false){
        const lastMessageIndex = this.messages.length - 1;
        this.messages[lastMessageIndex].message = "답변 중...";
        updateMessageContent(aiMessageElement, this.messages[lastMessageIndex].message);
        const response = await generateAIContent(query, context, apiKey, model, this.plugin.chatHistory, this.plugin.settings.selectedPrompt,);
        this.messages[lastMessageIndex].message = response;
        updateMessageContent(aiMessageElement, this.messages[lastMessageIndex].message);
      }
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  
      this.plugin.chatHistory.push({ role: 'user', parts: [{ text: query }] });
      this.plugin.chatHistory.push({ role: 'model', parts: [{ text: this.messages[this.messages.length - 1].message }] });
	console.log(`chatHistory: ${this.plugin.chatHistory.map((message) => message.parts.map(part => part.text).join('')).join('\r\n')}`);
      askButton.disabled = false;
      askButton.innerText = 'Ask';
      


  })
  refreshButton.addEventListener('click', () => {
    this.chatContainer.empty();
    this.plugin.chatHistory = [];
    new Notice('채팅 내역이 초기화 되었습니다.');
  });
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
  
      const inputEl = new TextAreaComponent(contentEl);
      inputEl.setValue(this.prompt);  // 기존 프롬프트가 있을 경우 미리 입력
  
      inputEl.inputEl.style.width = '100%';
  
      inputEl.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' && event.shiftKey) {
          // Shift + Enter일 경우 줄바꿈을 추가
          const { selectionStart, selectionEnd, value } = inputEl.inputEl;
          inputEl.inputEl.value = value.slice(0, selectionStart) + "\n" + value.slice(selectionEnd);
          inputEl.inputEl.selectionStart = inputEl.inputEl.selectionEnd = selectionStart + 1;
          event.preventDefault();  // 기본 Enter 동작을 막음 (폼 제출 등)
        } else if (event.key === 'Enter') {
          // Enter만 누를 경우 프롬프트 제출
          event.preventDefault();
          this.onSubmit(inputEl.getValue());
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
  
