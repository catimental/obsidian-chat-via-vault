import { Plugin, Modal, Notice, TextComponent, App } from 'obsidian'
import { AIPluginSettings, DEFAULT_SETTINGS, AIPluginSettingTab } from './settings';
import { continueWriting } from './function'; // 분리된 함수 가져오기
import { AIView } from './ui';
import { generateAIContent } from './ai';



export default class AIPlugin extends Plugin {
  settings: AIPluginSettings = DEFAULT_SETTINGS;
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new AIPluginSettingTab(this.app, this));

    this.addRibbonIcon('bot', 'Gemini-Chat via Vault', () => {
      this.activateView();
    });

    this.registerView('Gemini-Chat via Vault', (leaf) => new AIView(leaf, this));


    // "이어쓰기" 명령어 등록
    this.addCommand({
      id: 'continue-writing',
      name: '이어 쓰기',
      editorCallback: async (editor) => {
        await continueWriting(editor, this.settings, this.chatHistory); // 함수 호출
      }
    });

    this.addCommand({
      id: 'create-flowchart',
      name: '플로차트 만들기',
      editorCallback: async (editor) => {
        const docContent = editor.getValue(); // 현재 문서 내용 가져오기
        new FlowchartModal(this.app, async (flowchartInput) => {
          if (flowchartInput) {
            const mermaidCode = await generateMermaidFlowchart(docContent, flowchartInput, this.settings, this.chatHistory);
            editor.replaceRange(mermaidCode, editor.getCursor());
            new Notice('플로차트가 삽입되었습니다.');
          }
        }).open();
      }
    });


  }

  onunload() {
    this.app.workspace.detachLeavesOfType('Gemini-Chat via Vault');
  }

  async activateView() {
    this.app.workspace.detachLeavesOfType('Gemini-Chat via Vault');

    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf!.setViewState({
      type: 'Gemini-Chat via Vault',
      active: true,
    });

    this.app.workspace.revealLeaf(leaf!);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
class FlowchartModal extends Modal {
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

// Mermaid 플로차트 코드 생성 함수
async function generateMermaidFlowchart(docContent: string, input: string, settings: AIPluginSettings, chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>): Promise<string> {
  // AI에게 현재 문서 내용과 사용자가 입력한 플로차트 노드 전달
  const apiKey = settings.apiKey;
  const model = settings.selectedModel;

  if (!apiKey) {
    new Notice('Gemini API 키가 설정되지 않았습니다.');
    return '';
  }

  try {
    // generateAIContent의 query에 inputEl 값, context에 docContent 전달
    const aiGeneratedContent = await generateAIContent("Use ```mermaid ``` to draw a flow chart that meets the following requirements:"+input, docContent, apiKey, model, chatHistory);
    return `${aiGeneratedContent}`;
  } catch (error) {
    new Notice('AI로부터 응답을 받는 중 문제가 발생했습니다.');
    return `\`\`\`mermaid\nflowchart TD\n${input}\n\`\`\``;
  }
}