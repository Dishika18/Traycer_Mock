import * as vscode from "vscode"
import { PlannerProvider } from "./plannerProvider"
import { GeminiService } from "./geminiService"
import { FileManipulator } from "./fileManipulator"
import { SidebarProvider } from "./sidebarProvider"

export function activate(context: vscode.ExtensionContext) {
  console.log("Traycer Mock extension is now active!")

  const geminiService = new GeminiService()
  const fileManipulator = new FileManipulator()
  const sidebarProvider = new SidebarProvider(context.extensionUri, geminiService, fileManipulator)

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider))

  setTimeout(() => {
    vscode.commands.executeCommand("workbench.view.extension.traycer-sidebar")
  }, 1000)

  const plannerProvider = new PlannerProvider(context, geminiService, fileManipulator)

  // Register commands
  const generatePlanCommand = vscode.commands.registerCommand("traycer.generatePlan", () => {
    plannerProvider.generatePlan()
  })

  const executeToIDECommand = vscode.commands.registerCommand("traycer.executeToIDE", () => {
    plannerProvider.executeToIDE()
  })

  const submitClarificationCommand = vscode.commands.registerCommand("traycer.submitClarification", () => {
    plannerProvider.submitClarification()
  })

  const answerNextQuestionCommand = vscode.commands.registerCommand("traycer.answerNextQuestion", () => {
    plannerProvider.answerNextQuestion()
  })

  const restartWorkflowCommand = vscode.commands.registerCommand("traycer.restartWorkflow", () => {
    plannerProvider.restartWorkflow()
  })

  context.subscriptions.push(
    generatePlanCommand,
    executeToIDECommand,
    submitClarificationCommand,
    answerNextQuestionCommand,
    restartWorkflowCommand,
  )
}

export function deactivate() {}
