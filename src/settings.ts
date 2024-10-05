import { PluginSettingTab, Setting, App } from 'obsidian';
import AIPlugin from "./main"
import { AIView } from './ui';

export interface AIPluginSettings {
  apiKey: string;
  selectedModel: string;
  maxContextLength: number;
  documentNum: number;
  conversationHeight: number;
}

export const DEFAULT_SETTINGS: AIPluginSettings = {
  apiKey: '',
  selectedModel: 'gemini-1.5-flash-latest',
  maxContextLength: 4000,
  documentNum: 5,
  conversationHeight: 400,
};

export class AIPluginSettingTab extends PluginSettingTab {
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
