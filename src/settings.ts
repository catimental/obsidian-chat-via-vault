import { PluginSettingTab, Setting, App } from 'obsidian';
import AIPlugin from "./main";
import { AIView, PromptModal } from './ui';

export interface AIPluginSettings {
  apiKey: string;
  selectedModel: string;
  maxContextLength: number;
  documentNum: number;
  conversationHeight: number;
  searchalgorithm: string;
  lightFontColor: string;  // 라이트 테마 글자 색
  lightBackgroundColor: string;  // 라이트 테마 배경 색
  darkFontColor: string;  // 다크 테마 글자 색
  darkBackgroundColor: string;  // 다크 테마 배경 색
  prompts: Array<string>;  // 프롬프트 목록
  selectedPrompt: string;  // 선택된 프롬프트
}

export const DEFAULT_SETTINGS: AIPluginSettings = {
  apiKey: '',
  selectedModel: 'gemini-1.5-flash-latest',
  maxContextLength: 4000,
  documentNum: 5,
  conversationHeight: 400,
  searchalgorithm: "BM25",
  lightFontColor: '#000000',  // 라이트 테마 글자 색 (검정)
  lightBackgroundColor: '#FFFFFF',  // 라이트 테마 배경 색 (하양)
  darkFontColor: '#FFFFFF',  // 다크 테마 글자 색 (하양)
  darkBackgroundColor: '#000000',  // 다크 테마 배경 색 (검정)
  prompts: [],  // 기본적으로 빈 프롬프트 목록
  selectedPrompt: '',  // 기본적으로 선택된 프롬프트 없음

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

              const activeView = this.app.workspace.getLeavesOfType('Vault Chat').find(leaf => leaf.view instanceof AIView);
              if (activeView && activeView.view instanceof AIView) {
                activeView.view.updateChatContainerHeight(newValue);
              }
            }
          })
      );

      new Setting(containerEl)
        .setName('Document Search')
        .setDesc('문서 검색 방법입니다. BM25: 느리지만 높은 성능, TF-IDF: 빠르지만 일부 경우에서 낮은 성능.')
        .addDropdown(dropdown => dropdown
          .addOption('BM25', 'BM25')
          .addOption('TF-IDF', 'TF-IDF')
          .setValue(this.plugin.settings.searchalgorithm)
          .onChange(async (value) => {
            this.plugin.settings.searchalgorithm = value as 'BM25' | 'TF-IDF';  // 타입 캐스팅 적용
            await this.plugin.saveSettings();
        })
      );
      // 라이트 테마 글자 색 설정
    new Setting(containerEl)
      .setName('Light Theme Font Color')
      .setDesc('AI Chat View의 라이트 테마 글자 색을 선택하세요.')
      .addColorPicker((color) =>
        color
          .setValue(this.plugin.settings.lightFontColor)
          .onChange(async (value) => {
            this.plugin.settings.lightFontColor = value;
            await this.plugin.saveSettings();
            this.updateAIViewStyles();  // 설정 변경 후 즉시 적용
          })
      );

    // 라이트 테마 배경 색 설정
    new Setting(containerEl)
      .setName('Light Theme Background Color')
      .setDesc('AI Chat View의 라이트 테마 배경 색을 선택하세요.')
      .addColorPicker((color) =>
        color
          .setValue(this.plugin.settings.lightBackgroundColor)
          .onChange(async (value) => {
            this.plugin.settings.lightBackgroundColor = value;
            await this.plugin.saveSettings();
            this.updateAIViewStyles();  // 설정 변경 후 즉시 적용
          })
      );

    // 다크 테마 글자 색 설정
    new Setting(containerEl)
      .setName('Dark Theme Font Color')
      .setDesc('AI Chat View의 다크 테마 글자 색을 선택하세요.')
      .addColorPicker((color) =>
        color
          .setValue(this.plugin.settings.darkFontColor)
          .onChange(async (value) => {
            this.plugin.settings.darkFontColor = value;
            await this.plugin.saveSettings();
            this.updateAIViewStyles();  // 설정 변경 후 즉시 적용
          })
      );

    // 다크 테마 배경 색 설정
    new Setting(containerEl)
      .setName('Dark Theme Background Color')
      .setDesc('AI Chat View의 다크 테마 배경 색을 선택하세요.')
      .addColorPicker((color) =>
        color
          .setValue(this.plugin.settings.darkBackgroundColor)
          .onChange(async (value) => {
            this.plugin.settings.darkBackgroundColor = value;
            await this.plugin.saveSettings();
            this.updateAIViewStyles();  // 설정 변경 후 즉시 적용
          })
      );
      // 프롬프트 관리 섹션 추가
    containerEl.createEl('h3', { text: 'Manage Prompts' });

    // 프롬프트 목록을 보여줌
    this.plugin.settings.prompts.forEach((prompt, index) => {
      const setting = new Setting(containerEl)
        .setName(`Prompt ${index + 1}`);

      // 줄바꿈을 포함한 설명을 표시하는 HTML 요소 생성
      const descEl = document.createElement('div');
      descEl.style.whiteSpace = 'pre-wrap';  // 줄바꿈을 유지하기 위한 스타일
      descEl.textContent = prompt;
      setting.descEl.appendChild(descEl);  // 설명 요소에 추가

      // 편집 및 삭제 버튼
      setting.addExtraButton((btn) => {
        btn.setIcon("pencil").setTooltip("Edit").onClick(() => {
          this.editPrompt(prompt, index);
        });
      }).addExtraButton((btn) => {
        btn.setIcon("trash").setTooltip("Delete").onClick(async () => {
          this.plugin.settings.prompts.splice(index, 1);  // 프롬프트 삭제
          await this.plugin.saveSettings();
          this.display();  // 설정 UI 다시 로드
        });
      });

      // 라디오 버튼을 생성하여 선택 가능하게 함
      const radioContainer = document.createElement('div');
      const radioInput = document.createElement('input');
      radioInput.type = 'radio';
      radioInput.name = 'promptRadio';
      radioInput.value = prompt;
      radioInput.checked = prompt === this.plugin.settings.selectedPrompt;

      radioInput.addEventListener('change', async () => {
        this.plugin.settings.selectedPrompt = prompt;  // 선택된 프롬프트 설정
        await this.plugin.saveSettings();
      });

      radioContainer.appendChild(radioInput);
      setting.controlEl.appendChild(radioContainer);  // 라디오 버튼을 설정 UI에 추가
    });

    // 새로운 프롬프트 추가 버튼
    new Setting(containerEl)
      .setName('Add New Prompt')
      .addButton((btn) =>
        btn.setButtonText('Add Prompt').onClick(() => {
          this.addNewPrompt();
        })
      );
  }

  // 새로운 프롬프트 추가 메서드
  addNewPrompt() {
    const modal = new PromptModal(this.app, async (newPrompt: string) => {
      this.plugin.settings.prompts.push(newPrompt);  // 새로운 프롬프트 추가
      await this.plugin.saveSettings();
      this.display();  // 설정 UI 다시 로드
    });
    modal.open();
  }

  // 프롬프트 수정 메서드
  editPrompt(prompt: string, index: number) {
    const modal = new PromptModal(this.app, async (updatedPrompt: string) => {
      this.plugin.settings.prompts[index] = updatedPrompt;  // 프롬프트 업데이트
      await this.plugin.saveSettings();
      this.display();  // 설정 UI 다시 로드
    }, prompt);
    modal.open();
  }

  updateAIViewStyles() {
    const activeView = this.app.workspace.getLeavesOfType('Vault Chat').find(leaf => leaf.view instanceof AIView);
    if (activeView && activeView.view instanceof AIView) {
      activeView.view.applyStyles();  // 현재 테마에 맞게 스타일을 업데이트
    }
  }

  
}
