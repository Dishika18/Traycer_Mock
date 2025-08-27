import type * as vscode from "vscode"
import type { GeminiService } from "./geminiService"
import type { FileManipulator } from "./fileManipulator"
import { CodebaseAnalyzer, type CodebaseContext } from "./codebaseAnalyzer"
import type { PlanItem } from "./types"

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "traycer-planner-webview"

  private _view?: vscode.WebviewView
  private readonly codebaseAnalyzer: CodebaseAnalyzer
  private codebaseContext?: CodebaseContext
  private currentRequest = ""
  private clarificationQuestions: string[] = []
  private clarificationAnswers: string[] = []
  private currentPlan: PlanItem[] = []

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly geminiService: GeminiService,
    private readonly fileManipulator: FileManipulator,
  ) {
    this.codebaseAnalyzer = new CodebaseAnalyzer()
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "generatePlan":
          await this.handleGeneratePlan(data.request)
          break
        case "submitAnswer":
          await this.handleSubmitAnswer(data.answer)
          break
        case "executeToIDE":
          await this.handleExecuteToIDE()
          break
        case "restartWorkflow":
          await this.handleRestartWorkflow()
          break
      }
    })

    this.initializeCodebaseContext()
  }

  private async initializeCodebaseContext() {
    try {
      console.log("Analyzing codebase for context...")
      this._view?.webview.postMessage({
        type: "showStatus",
        message: "Analyzing your codebase...",
      })

      this.codebaseContext = await this.codebaseAnalyzer.analyzeWorkspace()

      console.log("Codebase analysis complete:", {
        projectType: this.codebaseContext.projectType,
        frameworks: this.codebaseContext.frameworks,
        fileCount: this.codebaseContext.keyFiles.length,
      })

      this._view?.webview.postMessage({
        type: "showStatus",
        message: `Ready! Detected ${this.codebaseContext.projectType} with ${this.codebaseContext.frameworks.join(", ")}`,
      })
    } catch (error) {
      console.log("Failed to analyze codebase:", error)
      this._view?.webview.postMessage({
        type: "showStatus",
        message: "Could not analyze the codebase. Please select a project or provide the files.",
      })
    }
  }

  private async handleGeneratePlan(request: string) {
    try {
      this.currentRequest = request

      this._view?.webview.postMessage({
        type: "showLoading",
        message: "Analyzing your request with codebase context...",
      })

      const clarifications = await this.geminiService.generateClarificationQuestions(request, this.codebaseContext)
      this.clarificationQuestions = clarifications

      this._view?.webview.postMessage({
        type: "showClarifications",
        questions: clarifications,
        originalRequest: request,
      })
    } catch (error) {
      this._view?.webview.postMessage({
        type: "showError",
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    }
  }

  private async handleSubmitAnswer(answer: string) {
    try {
      this.clarificationAnswers.push(answer)

      this._view?.webview.postMessage({
        type: "showLoading",
        message: "Generating contextual implementation plan...",
      })

      const plan = await this.geminiService.generatePlan(
        this.currentRequest,
        this.clarificationAnswers,
        this.codebaseContext,
      )
      this.currentPlan = plan

      this._view?.webview.postMessage({
        type: "showPlan",
        plan: plan,
      })
    } catch (error) {
      this._view?.webview.postMessage({
        type: "showError",
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    }
  }

  private async handleExecuteToIDE() {
    try {
      this._view?.webview.postMessage({
        type: "showLoading",
        message: "Generating Copilot prompts...",
      })

      const copilotPrompts = this.generateCopilotPrompts(this.currentPlan, this.codebaseContext)

      this._view?.webview.postMessage({
        type: "showCopilotPrompts",
        prompts: copilotPrompts,
      })
    } catch (error) {
      this._view?.webview.postMessage({
        type: "showError",
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      })
    }
  }

  private generateCopilotPrompts(
    plan: PlanItem[],
    context?: CodebaseContext,
  ): Array<{ file: string; action: string; prompt: string }> {
    const contextInfo = context ? `This is a ${context.projectType} using ${context.frameworks.join(", ")}. ` : ""

    return plan.map((item) => ({
      file: item.file,
      action: item.action,
      prompt: this.createCopilotPrompt(item, contextInfo),
    }))
  }

  private createCopilotPrompt(item: PlanItem, contextInfo: string): string {
    const basePrompt = `${contextInfo}${item.description}`

    switch (item.action) {
      case "new":
        return `Create a new file ${item.file}. ${basePrompt}. Follow the existing code patterns and use the same styling/structure as other files in this project.`

      case "modify":
        return `Modify the existing file ${item.file}. ${basePrompt}. Keep the existing code structure and only add/change what's necessary for this feature.`

      case "remove":
        return `Remove or refactor the file ${item.file}. ${basePrompt}. Make sure to update any imports or references to this file in other parts of the codebase.`

      default:
        return basePrompt
    }
  }

  private async handleRestartWorkflow() {
    this.currentRequest = ""
    this.clarificationQuestions = []
    this.clarificationAnswers = []
    this.currentPlan = []

    this._view?.webview.postMessage({
      type: "resetWorkflow",
    })
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Traycer Planner</title>
    <style>
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
            overflow-x: hidden;
        }
        
        .container {
            padding: 20px;
            max-width: 100%;
            min-height: 100vh;
        }
        
        h2 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 24px 0;
            color: var(--vscode-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        h3 {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 16px 0;
            color: var(--vscode-foreground);
        }
        
        .input-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }
        
        textarea, input {
            width: 100%;
            padding: 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            outline: none;
        }
        
        textarea:focus, input:focus {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        
        textarea {
            min-height: 90px;
            resize: vertical;
            font-family: inherit;
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            margin-right: 8px;
            margin-bottom: 8px;
            transition: all 0.2s ease;
            min-height: 32px;
        }
        
        button:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }
        
        button:active:not(:disabled) {
            transform: translateY(0);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }
        
        .results {
            margin-top: 20px;
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background-color: var(--vscode-panel-background);
            font-size: 13px;
        }
        
        .loading {
            color: var(--vscode-charts-blue);
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 500;
        }
        
        .loading::before {
            content: '';
            display: flex;
            gap: 4px;
        }
        
        .loading::after {
            content: '●●●';
            font-size: 18px;
            animation: pulse 1.5s ease-in-out infinite;
            letter-spacing: 2px;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
        }
        
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            border-color: var(--vscode-inputValidation-errorBorder);
        }
        
        .success {
            color: var(--vscode-terminal-ansiGreen);
            background-color: rgba(22, 163, 74, 0.1);
            border-color: var(--vscode-terminal-ansiGreen);
        }
        
        .status {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-bottom: 16px;
            padding: 12px;
            background-color: var(--vscode-badge-background);
            border-radius: 6px;
            border-left: 3px solid var(--vscode-charts-blue);
        }
        
        .plan-item {
            margin: 12px 0;
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background-color: var(--vscode-editor-background);
            transition: all 0.2s ease;
            word-break: break-word;
            overflow-wrap: anywhere;
        }
        
        .plan-item:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .plan-action {
            font-weight: 600;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            margin-right: 8px;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .action-new { 
            color: #ffffff;
            background-color: var(--vscode-terminal-ansiGreen);
        }
        .action-modify { 
            color: #000000;
            background-color: var(--vscode-terminal-ansiYellow);
        }
        .action-remove { 
            color: #ffffff;
            background-color: var(--vscode-terminal-ansiRed);
        }
        
        .copilot-prompt {
            margin: 16px 0;
            padding: 16px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background-color: var(--vscode-editor-background);
            position: relative;
            transition: all 0.2s ease;
        }
        
        .copilot-prompt:hover {
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .copy-btn {
            position: absolute;
            top: 12px;
            right: 12px;
            padding: 6px 12px;
            font-size: 11px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            min-height: auto;
        }
        
        .copy-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .prompt-text {
            font-family: var(--vscode-editor-font-family, 'SF Mono', Monaco, 'Cascadia Code', monospace);
            font-size: 12px;
            margin-top: 12px;
            padding: 12px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 6px;
            white-space: pre-wrap;
            line-height: 1.4;
            border: 1px solid var(--vscode-panel-border);
            word-break: break-word;
            overflow-wrap: anywhere;
        }

        .plan-item strong, .copilot-prompt strong {
            word-break: break-word;
            overflow-wrap: anywhere;
            display: block;
        }
        
        .hidden { 
            display: none !important; 
        }
        
        #requestPhase, #clarificationPhase, #planPhase, #copilotPhase {
            animation: fadeIn 0.3s ease-in-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        #questionsContainer p {
            margin: 12px 0;
            padding: 12px;
            background-color: var(--vscode-panel-background);
            border-radius: 6px;
            border-left: 3px solid var(--vscode-charts-blue);
        }
        
        #questionsContainer strong {
            color: var(--vscode-charts-blue);
        }
        
        @media (max-width: 400px) {
            .container {
                padding: 16px;
            }
            
            h2 {
                font-size: 18px;
            }
            
            button {
                width: 100%;
                margin-right: 0;
                margin-bottom: 8px;
            }
            
            .copy-btn {
                position: static;
                width: 100%;
                margin-top: 12px;
            }
            
            .plan-item, .copilot-prompt {
                padding: 12px;
            }
        }
        
        @media (max-width: 300px) {
            .container {
                padding: 12px;
            }
            
            textarea, input {
                padding: 10px;
            }
            
            .plan-action {
                display: block;
                margin-bottom: 8px;
                margin-right: 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>🤖 Traycer Mock Planner</h2>
        
        <div id="statusBar" class="status hidden"></div>
        
        <div id="requestPhase">
            <div class="input-group">
                <label for="requestInput">Enter your request:</label>
                <textarea id="requestInput" placeholder="e.g., Replace local authentication with Auth0"></textarea>
            </div>
            <button id="generateBtn">Generate Plan</button>
        </div>

        <div id="clarificationPhase" class="hidden">
            <h3>Clarification Questions</h3>
            <div id="questionsContainer"></div>
            <div class="input-group">
                <label for="answerInput">Your answer:</label>
                <textarea id="answerInput" placeholder="Please provide your answers to the questions above"></textarea>
            </div>
            <button id="submitAnswerBtn">Submit Answer</button>
            <button id="restartBtn">Start Over</button>
        </div>

        <div id="planPhase" class="hidden">
            <h3>Implementation Plan</h3>
            <div id="planContainer"></div>
            <button id="executeBtn">Ask Traycer Mock</button>
            <button id="restartBtn2">Start Over</button>
        </div>

        <div id="copilotPhase" class="hidden">
            <h3>Copilot Prompts</h3>
            <p>Copy these prompts and paste them into GitHub Copilot Chat:</p>
            <div id="copilotContainer"></div>
            <button id="restartBtn3">Start Over</button>
        </div>

        <div id="results" class="results hidden"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // DOM elements
        const requestInput = document.getElementById('requestInput');
        const generateBtn = document.getElementById('generateBtn');
        const requestPhase = document.getElementById('requestPhase');
        const clarificationPhase = document.getElementById('clarificationPhase');
        const planPhase = document.getElementById('planPhase');
        const copilotPhase = document.getElementById('copilotPhase');
        const questionsContainer = document.getElementById('questionsContainer');
        const answerInput = document.getElementById('answerInput');
        const submitAnswerBtn = document.getElementById('submitAnswerBtn');
        const planContainer = document.getElementById('planContainer');
        const copilotContainer = document.getElementById('copilotContainer');
        const executeBtn = document.getElementById('executeBtn');
        const restartBtn = document.getElementById('restartBtn');
        const restartBtn2 = document.getElementById('restartBtn2');
        const restartBtn3 = document.getElementById('restartBtn3');
        const results = document.getElementById('results');
        const statusBar = document.getElementById('statusBar');

        let currentPlan = null;

        generateBtn.addEventListener('click', () => {
            const request = requestInput.value.trim();
            if (request) {
                vscode.postMessage({
                    type: 'generatePlan',
                    request: request
                });
            }
        });

        submitAnswerBtn.addEventListener('click', () => {
            const answer = answerInput.value.trim();
            if (answer) {
                vscode.postMessage({
                    type: 'submitAnswer',
                    answer: answer
                });
            }
        });

        executeBtn.addEventListener('click', () => {
            vscode.postMessage({
                type: 'executeToIDE'
            });
        });

        [restartBtn, restartBtn2, restartBtn3].forEach(btn => {
            btn.addEventListener('click', () => {
                vscode.postMessage({
                    type: 'restartWorkflow'
                });
            });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'showStatus':
                    showStatus(message.message);
                    break;
                    
                case 'showLoading':
                    showResults(message.message, 'loading');
                    break;
                    
                case 'showClarifications':
                    showClarifications(message.questions);
                    break;
                    
                case 'showPlan':
                    showPlan(message.plan);
                    break;
                    
                case 'showCopilotPrompts':
                    showCopilotPrompts(message.prompts);
                    break;
                    
                case 'showError':
                    showResults(message.message, 'error');
                    break;
                    
                case 'showSuccess':
                    showResults(message.message, 'success');
                    break;
                    
                case 'resetWorkflow':
                    resetWorkflow();
                    break;
            }
        });

        function showStatus(message) {
            statusBar.textContent = message;
            statusBar.classList.remove('hidden');
        }

        function showResults(message, type = '') {
            results.textContent = message;
            results.className = 'results ' + type;
            results.classList.remove('hidden');
        }

        function showClarifications(questions) {
            questionsContainer.innerHTML = questions.map((q, i) => 
                '<p><strong>Q' + (i + 1) + ':</strong> ' + q + '</p>'
            ).join('');
            
            requestPhase.classList.add('hidden');
            clarificationPhase.classList.remove('hidden');
            results.classList.add('hidden');
        }

        function showPlan(plan) {
            currentPlan = plan;
            planContainer.innerHTML = plan.map(item => 
                '<div class="plan-item">' +
                '<span class="plan-action action-' + item.action + '">[' + item.action.toUpperCase() + ']</span>' +
                '<strong>' + item.file + '</strong><br>' +
                '<small>' + item.description + '</small>' +
                '</div>'
            ).join('');
            
            clarificationPhase.classList.add('hidden');
            planPhase.classList.remove('hidden');
            results.classList.add('hidden');
        }

        function showCopilotPrompts(prompts) {
            copilotContainer.innerHTML = prompts.map((item, i) => 
                '<div class="copilot-prompt">' +
                '<button class="copy-btn" onclick="copyPrompt(event, ' + i + ')">Copy</button>' +
                '<span class="plan-action action-' + item.action + '">[' + item.action.toUpperCase() + ']</span>' +
                '<strong>' + item.file + '</strong>' +
                '<div class="prompt-text" id="prompt-' + i + '">' + item.prompt + '</div>' +
                '</div>'
            ).join('');
            
            planPhase.classList.add('hidden');
            copilotPhase.classList.remove('hidden');
            results.classList.add('hidden');
        }

        function copyPrompt(event, index) {
            const promptEl = document.getElementById('prompt-' + index);
            const promptText = promptEl ? promptEl.textContent : '';
            navigator.clipboard.writeText(promptText).then(() => {
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 1000);
            });
        }

        function resetWorkflow() {
            requestPhase.classList.remove('hidden');
            clarificationPhase.classList.add('hidden');
            planPhase.classList.add('hidden');
            copilotPhase.classList.add('hidden');
            results.classList.add('hidden');
            
            requestInput.value = '';
            answerInput.value = '';
            currentPlan = null;
        }
    </script>
</body>
</html>`
  }
}
