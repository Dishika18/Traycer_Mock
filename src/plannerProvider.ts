import * as vscode from "vscode"
import type { GeminiService } from "./geminiService"
import type { FileManipulator } from "./fileManipulator"
import { type WorkflowState, ActionType } from "./types"

export class PlannerProvider implements vscode.TreeDataProvider<PlannerItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PlannerItem | undefined | null | void> = new vscode.EventEmitter<
    PlannerItem | undefined | null | void
  >()
  readonly onDidChangeTreeData: vscode.Event<PlannerItem | undefined | null | void> = this._onDidChangeTreeData.event

  private workflowState: WorkflowState = {
    phase: "idle",
    userRequest: "",
    clarificationQuestions: [],
    clarificationAnswers: [],
    plan: [],
  }

  private readonly WORKFLOW_STATE_KEY = "traycer.workflowState"

  constructor(
    private context: vscode.ExtensionContext,
    private geminiService: GeminiService,
    private fileManipulator: FileManipulator,
  ) {
    this.loadWorkflowState()
  }

  private saveWorkflowState(): void {
    this.context.workspaceState.update(this.WORKFLOW_STATE_KEY, this.workflowState)
  }

  private loadWorkflowState(): void {
    const savedState = this.context.workspaceState.get<WorkflowState>(this.WORKFLOW_STATE_KEY)
    if (savedState) {
      this.workflowState = savedState
      this.refresh()
    }
  }

  private resetWorkflowState(): void {
    this.workflowState = {
      phase: "idle",
      userRequest: "",
      clarificationQuestions: [],
      clarificationAnswers: [],
      plan: [],
    }
    this.saveWorkflowState()
    this.refresh()
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: PlannerItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: PlannerItem): Thenable<PlannerItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems())
    }
    return Promise.resolve([])
  }

  private getRootItems(): PlannerItem[] {
    const items: PlannerItem[] = []

    items.push(new PlannerItem(`🎯 Traycer Mock Planner`, vscode.TreeItemCollapsibleState.None, "header"))

    items.push(new PlannerItem("📝 User Request", vscode.TreeItemCollapsibleState.None, "section-header"))

    if (this.workflowState.userRequest) {
      items.push(
        new PlannerItem(`"${this.workflowState.userRequest}"`, vscode.TreeItemCollapsibleState.None, "request-text"),
      )
    }

    if (this.workflowState.phase === "idle") {
      items.push(new PlannerItem("Generate Plan", vscode.TreeItemCollapsibleState.None, "generate-button"))
    } else if (this.workflowState.phase === "clarification") {
      items.push(new PlannerItem("Restart Planning", vscode.TreeItemCollapsibleState.None, "restart-button"))
    } else if (this.workflowState.phase === "ready") {
      items.push(new PlannerItem("Start New Plan", vscode.TreeItemCollapsibleState.None, "restart-button"))
    }

    if (this.workflowState.phase === "clarification" && this.workflowState.clarificationQuestions.length > 0) {
      const answeredCount = this.workflowState.clarificationAnswers.length
      const totalCount = this.workflowState.clarificationQuestions.length

      items.push(
        new PlannerItem(
          `❓ Clarification Questions (${answeredCount}/${totalCount})`,
          vscode.TreeItemCollapsibleState.None,
          "section-header",
        ),
      )

      this.workflowState.clarificationQuestions.forEach((question, index) => {
        const isAnswered = index < this.workflowState.clarificationAnswers.length
        const icon = isAnswered ? "✅" : "❔"
        items.push(
          new PlannerItem(`${icon} Q${index + 1}: ${question}`, vscode.TreeItemCollapsibleState.None, "question"),
        )

        if (isAnswered) {
          const answer = this.workflowState.clarificationAnswers[index]
          items.push(new PlannerItem(`💬 A${index + 1}: ${answer}`, vscode.TreeItemCollapsibleState.None, "answer"))
        }
      })

      if (answeredCount < totalCount) {
        items.push(
          new PlannerItem(
            `📝 Answer Question ${answeredCount + 1}`,
            vscode.TreeItemCollapsibleState.None,
            "answer-next-button",
          ),
        )
      } else {
        items.push(
          new PlannerItem("✅ Generate Implementation Plan", vscode.TreeItemCollapsibleState.None, "submit-button"),
        )
      }
    }

    if (this.workflowState.phase === "ready" && this.workflowState.plan.length > 0) {
      items.push(
        new PlannerItem(
          `📋 Implementation Plan (${this.workflowState.plan.length} changes)`,
          vscode.TreeItemCollapsibleState.None,
          "section-header",
        ),
      )

      const newFiles = this.workflowState.plan.filter((item) => item.action === ActionType.NEW)
      const modifyFiles = this.workflowState.plan.filter((item) => item.action === ActionType.MODIFY)
      const removeFiles = this.workflowState.plan.filter((item) => item.action === ActionType.REMOVE)

      if (newFiles.length > 0) {
        items.push(
          new PlannerItem(`📄 New Files (${newFiles.length})`, vscode.TreeItemCollapsibleState.None, "group-header"),
        )
        newFiles.forEach((planItem) => {
          const item = new PlannerItem(`[NEW] ${planItem.file}`, vscode.TreeItemCollapsibleState.None, "plan-item-new")
          item.tooltip = planItem.description
          items.push(item)
        })
      }

      if (modifyFiles.length > 0) {
        items.push(
          new PlannerItem(
            `✏️ Modified Files (${modifyFiles.length})`,
            vscode.TreeItemCollapsibleState.None,
            "group-header",
          ),
        )
        modifyFiles.forEach((planItem) => {
          const item = new PlannerItem(
            `[MODIFY] ${planItem.file}`,
            vscode.TreeItemCollapsibleState.None,
            "plan-item-modify",
          )
          item.tooltip = planItem.description
          items.push(item)
        })
      }

      if (removeFiles.length > 0) {
        items.push(
          new PlannerItem(
            `🗑️ Removed Files (${removeFiles.length})`,
            vscode.TreeItemCollapsibleState.None,
            "group-header",
          ),
        )
        removeFiles.forEach((planItem) => {
          const item = new PlannerItem(
            `[REMOVE] ${planItem.file}`,
            vscode.TreeItemCollapsibleState.None,
            "plan-item-remove",
          )
          item.tooltip = planItem.description
          items.push(item)
        })
      }

      items.push(new PlannerItem("⚡ Execute to IDE", vscode.TreeItemCollapsibleState.None, "execute-button"))
    }

    const statusText = this.getDetailedStatusText()
    items.push(new PlannerItem(`📊 ${statusText}`, vscode.TreeItemCollapsibleState.None, "status"))

    return items
  }

  private getActionLabel(action: string): string {
    switch (action) {
      case ActionType.NEW:
        return "[NEW]"
      case ActionType.MODIFY:
        return "[MODIFY]"
      case ActionType.REMOVE:
        return "[REMOVE]"
      default:
        return "[UNKNOWN]"
    }
  }

  private getDetailedStatusText(): string {
    switch (this.workflowState.phase) {
      case "idle":
        return "Ready - Enter a request to start planning"
      case "clarification":
        const answered = this.workflowState.clarificationAnswers.length
        const total = this.workflowState.clarificationQuestions.length
        return `Clarification Phase - ${answered}/${total} questions answered`
      case "planning":
        return "Generating implementation plan..."
      case "ready":
        return `Plan Ready - ${this.workflowState.plan.length} file changes prepared`
      default:
        return "Unknown state"
    }
  }

  async generatePlan(): Promise<void> {
    if (this.workflowState.phase !== "idle") {
      return
    }

    try {
      const userRequest = await vscode.window.showInputBox({
        prompt: "Enter your implementation request",
        placeHolder: "e.g., 'Replace local authentication with Auth0', 'Add user dashboard with analytics'",
        validateInput: (value) => {
          if (!value || value.trim().length < 10) {
            return "Please enter a more detailed request (at least 10 characters)"
          }
          return null
        },
      })

      if (!userRequest) {
        return
      }

      this.workflowState.userRequest = userRequest.trim()
      this.workflowState.phase = "clarification"
      this.workflowState.clarificationQuestions = []
      this.workflowState.clarificationAnswers = []
      this.saveWorkflowState()
      this.refresh()

      vscode.window.showInformationMessage("🤔 Analyzing your request and generating clarification questions...")

      const questions = await this.geminiService.generateClarificationQuestions(userRequest)

      if (questions.length === 0) {
        throw new Error("No clarification questions generated")
      }

      this.workflowState.clarificationQuestions = questions
      this.saveWorkflowState()
      this.refresh()

      vscode.window.showInformationMessage(
        `Generated ${questions.length} clarification questions. Please answer them to proceed.`,
      )
    } catch (error) {
      vscode.window.showErrorMessage(`Error generating clarification questions: ${error}`)
      this.workflowState.phase = "idle"
      this.saveWorkflowState()
      this.refresh()
    }
  }

  async answerNextQuestion(): Promise<void> {
    if (this.workflowState.phase !== "clarification") {
      return
    }

    const nextQuestionIndex = this.workflowState.clarificationAnswers.length
    if (nextQuestionIndex >= this.workflowState.clarificationQuestions.length) {
      return
    }

    const question = this.workflowState.clarificationQuestions[nextQuestionIndex]
    const answer = await vscode.window.showInputBox({
      prompt: `Question ${nextQuestionIndex + 1} of ${this.workflowState.clarificationQuestions.length}`,
      placeHolder: "Enter your answer...",
      value: "",
      validateInput: (value) => {
        if (!value || value.trim().length < 2) {
          return "Please provide a meaningful answer"
        }
        return null
      },
    })

    if (!answer) {
      return 
    }

    this.workflowState.clarificationAnswers.push(answer.trim())
    this.saveWorkflowState()
    this.refresh()

    const remaining = this.workflowState.clarificationQuestions.length - this.workflowState.clarificationAnswers.length
    if (remaining > 0) {
      vscode.window.showInformationMessage(`Answer recorded. ${remaining} question(s) remaining.`)
    } else {
      vscode.window.showInformationMessage("All questions answered! Ready to generate implementation plan.")
    }
  }

  async submitClarification(): Promise<void> {
    if (this.workflowState.phase !== "clarification") {
      return
    }

    if (this.workflowState.clarificationAnswers.length !== this.workflowState.clarificationQuestions.length) {
      vscode.window.showWarningMessage("Please answer all clarification questions first.")
      return
    }

    this.workflowState.phase = "planning"
    this.saveWorkflowState()
    this.refresh()

    try {
      vscode.window.showInformationMessage("Generating detailed implementation plan...")

      const plan = await this.geminiService.generatePlan(
        this.workflowState.userRequest,
        this.workflowState.clarificationAnswers,
      )

      if (plan.length === 0) {
        throw new Error("No implementation plan generated")
      }

      this.workflowState.plan = plan
      this.workflowState.phase = "ready"
      this.saveWorkflowState()
      this.refresh()

      vscode.window.showInformationMessage(
        `Implementation plan generated successfully! ${plan.length} file changes ready for execution.`,
      )
    } catch (error) {
      vscode.window.showErrorMessage(`Error generating implementation plan: ${error}`)
      this.workflowState.phase = "clarification"
      this.saveWorkflowState()
      this.refresh()
    }
  }

  async executeToIDE(): Promise<void> {
    if (this.workflowState.phase !== "ready" || this.workflowState.plan.length === 0) {
      vscode.window.showWarningMessage("No implementation plan available to execute")
      return
    }

    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to execute ${this.workflowState.plan.length} file changes to your workspace?`,
      { modal: true },
      "Yes, Execute Plan",
      "Cancel",
    )

    if (confirmation !== "Yes, Execute Plan") {
      return
    }

    try {
      vscode.window.showInformationMessage("⚡ Executing implementation plan...")

      let successCount = 0
      for (const [index, planItem] of this.workflowState.plan.entries()) {
        try {
          await this.fileManipulator.applyPlanItem(planItem)
          successCount++

          if (this.workflowState.plan.length > 3) {
            vscode.window.showInformationMessage(
              `Progress: ${index + 1}/${this.workflowState.plan.length} - ${planItem.action} ${planItem.file}`,
            )
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to apply change to ${planItem.file}: ${error}`)
        }
      }

      vscode.window.showInformationMessage(
        `Execution completed! Successfully applied ${successCount}/${this.workflowState.plan.length} file changes.`,
      )

      this.resetWorkflowState()
    } catch (error) {
      vscode.window.showErrorMessage(`Error executing implementation plan: ${error}`)
    }
  }

  async restartWorkflow(): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      "Are you sure you want to restart the planning workflow? This will clear all current progress.",
      "Yes, Restart",
      "Cancel",
    )

    if (confirmation === "Yes, Restart") {
      this.resetWorkflowState()
      vscode.window.showInformationMessage("Workflow restarted. Ready for a new planning session.")
    }
  }
}

export class PlannerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: string,
  ) {
    super(label, collapsibleState)

    switch (itemType) {
      case "header":
        this.iconPath = new vscode.ThemeIcon("target")
        break
      case "generate-button":
        this.command = {
          command: "traycer.generatePlan",
          title: "Generate Plan",
        }
        this.iconPath = new vscode.ThemeIcon("play")
        break
      case "restart-button":
        this.command = {
          command: "traycer.restartWorkflow",
          title: "Restart Workflow",
        }
        this.iconPath = new vscode.ThemeIcon("refresh")
        break
      case "answer-next-button":
        this.command = {
          command: "traycer.answerNextQuestion",
          title: "Answer Next Question",
        }
        this.iconPath = new vscode.ThemeIcon("edit")
        break
      case "submit-button":
        this.command = {
          command: "traycer.submitClarification",
          title: "Generate Implementation Plan",
        }
        this.iconPath = new vscode.ThemeIcon("check")
        break
      case "execute-button":
        this.command = {
          command: "traycer.executeToIDE",
          title: "Execute to IDE",
        }
        this.iconPath = new vscode.ThemeIcon("rocket")
        break
      case "plan-item-new":
        this.iconPath = new vscode.ThemeIcon("file-add", new vscode.ThemeColor("charts.green"))
        break
      case "plan-item-modify":
        this.iconPath = new vscode.ThemeIcon("edit", new vscode.ThemeColor("charts.yellow"))
        break
      case "plan-item-remove":
        this.iconPath = new vscode.ThemeIcon("trash", new vscode.ThemeColor("charts.red"))
        break
      case "group-header":
        this.iconPath = new vscode.ThemeIcon("folder")
        break
      case "question":
        this.iconPath = new vscode.ThemeIcon("question")
        break
      case "answer":
        this.iconPath = new vscode.ThemeIcon("comment")
        break
      case "section-header":
        this.iconPath = new vscode.ThemeIcon("list-unordered")
        break
      case "status":
        this.iconPath = new vscode.ThemeIcon("pulse")
        break
      case "request-text":
        this.iconPath = new vscode.ThemeIcon("quote")
        break
    }
  }
}
