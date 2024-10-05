import { Plugin, PluginSettingTab, Setting, App } from 'obsidian';
import { AIView } from './ui';
import { AIPluginSettings, DEFAULT_SETTINGS } from './ai';

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

              const activeView = this.app.workspace.getLeavesOfType('Gemini-Chat via Vault').find(leaf => leaf.view instanceof AIView);
              if (activeView && activeView.view instanceof AIView) {
                activeView.view.updateChatContainerHeight(newValue);
              }
            }
          })
      );
  }
}
