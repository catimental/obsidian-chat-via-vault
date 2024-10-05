import { TFile, WorkspaceLeaf, ItemView, MarkdownRenderer, MarkdownView, Notice } from 'obsidian';
import { generateAIContent, truncateContext } from './nlp';
import { getRelevantDocuments } from './nlp';
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

    const inputContainer = container.createEl('div');
    inputContainer.setAttribute('style', 'display: flex; gap: 10px;');

    const inputField = inputContainer.createEl('textarea', {
      placeholder: 'Ask AI...',
    });
    inputField.setAttribute('style', 'flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #ccc; resize: none; height: 60px;');

    const askButton = inputContainer.createEl('button', { text: 'Ask' });
    askButton.setAttribute('style', 'padding: 10px 20px; background-color: #e1e1e1; color: #333; border: none; border-radius: 5px; cursor: pointer;');

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
      inputField.value = '';

      askButton.disabled = true;
      askButton.innerText = '답변 중...';

      let context = await getRelevantDocuments(query, this.plugin.app, this.plugin.settings.documentNum, this.lastOpenedFile);
      context = truncateContext(context, this.plugin.settings.maxContextLength);
      const response = await generateAIContent(query, context, this.plugin.settings.apiKey, this.plugin.settings.selectedModel, this.plugin.chatHistory);

      addMessageToChat(response || 'AI로부터 응답이 없습니다.', 'ai');

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
    this.chatContainer.style.maxHeight = `${newHeight}px`;
  }

  async onClose() {}
}
