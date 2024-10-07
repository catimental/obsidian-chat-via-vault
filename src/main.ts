import { Plugin, Notice } from 'obsidian'
import { AIPluginSettings, DEFAULT_SETTINGS, AIPluginSettingTab } from './settings';
import { continueWriting, generateMermaidFlowchart } from './function'; // 분리된 함수 가져오기
import { AIView, FlowchartModal } from './ui';


export default class AIPlugin extends Plugin {
  settings: AIPluginSettings = DEFAULT_SETTINGS;
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new AIPluginSettingTab(this.app, this));

    this.addRibbonIcon('bot', 'Chat via Vault', () => {
      this.activateView();
    });

    this.registerView('Chat via Vault', (leaf) => new AIView(leaf, this));


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
    this.registerEvent(this.app.workspace.on('css-change', () => {
      const activeView = this.app.workspace.getLeavesOfType('Chat via Vault').find(leaf => leaf.view instanceof AIView);
      if (activeView && activeView.view instanceof AIView) {
        activeView.view.applyStyles();  // 테마 변경에 따라 스타일 업데이트
      }
    }));


  }


  onunload() {
    this.app.workspace.detachLeavesOfType('Chat via Vault');
  }
  

  async activateView() {
    this.app.workspace.detachLeavesOfType('Chat via Vault');

    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf!.setViewState({
      type: 'Chat via Vault',
      active: true,
    });

    this.app.workspace.revealLeaf(leaf!);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
