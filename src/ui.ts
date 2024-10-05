import { TFile, WorkspaceLeaf, ItemView, MarkdownRenderer, MarkdownView, Notice } from 'obsidian';
import { getRelevantDocuments, truncateContext } from './nlp';
import { generateAIContent } from './ai';
import AIPlugin from './main';

const AI_VIEW_TYPE = 'Gemini-Chat via Vault';

export class AIView extends ItemView {
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
    title.addClass('ai-chat-title');

    this.chatContainer = container.createEl('div');
    this.chatContainer.addClass('ai-chat-container');
    this.chatContainer.style.setProperty('--conversation-height', `${this.plugin.settings.conversationHeight}px`);

    const addMessageToChat = async (message: string, role: 'user' | 'ai') => {
      const messageEl = this.chatContainer.createEl('div');
      messageEl.addClass(role === 'user' ? 'user-message' : 'ai-message');

      const mdContent = document.createElement('div');

      // Markdown 및 Mermaid 렌더링 처리
      if (message.startsWith('```mermaid')) {
        // Mermaid 구문을 직접 렌더링
        await MarkdownRenderer.renderMarkdown(message, mdContent, '', this.plugin);
      } else {
        // 일반적인 Markdown 처리
        await MarkdownRenderer.renderMarkdown(message, mdContent, '', this.plugin);
      }

      messageEl.appendChild(mdContent);

      // 내부 링크 처리
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

      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
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

      // 사용자 입력을 Markdown으로 렌더링
      await addMessageToChat(query, 'user');
      inputField.value = '';

      askButton.disabled = true;
      askButton.innerText = '답변 중...';

      let context = await getRelevantDocuments(query, this.plugin.app, this.plugin.settings.documentNum, this.lastOpenedFile);
      context = truncateContext(context, this.plugin.settings.maxContextLength);
      const response = await generateAIContent(query, context, this.plugin.settings.apiKey, this.plugin.settings.selectedModel, this.plugin.chatHistory);

      // AI 응답을 Markdown으로 렌더링
      await addMessageToChat(response || 'AI로부터 응답이 없습니다.', 'ai');

      askButton.disabled = false;
      askButton.innerText = 'Ask';
    });

    refreshButton.addEventListener('click', () => {
      this.chatContainer.empty();
      this.plugin.chatHistory = [];
      new Notice('채팅 내역이 초기화 되었습니다.');
    });
  }

  updateChatContainerHeight(newHeight: number) {
    this.chatContainer.style.height = `${newHeight}px`;
  }

  async onClose() {}
}
