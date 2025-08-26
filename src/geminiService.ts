import { GoogleGenerativeAI } from "@google/generative-ai"
import * as vscode from "vscode"
import * as dotenv from "dotenv"
import * as path from "path"
import * as fs from "fs"
import type { PlanItem } from "./types"
import type { CodebaseContext } from "./codebaseAnalyzer"

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null
  private model: any = null
  private isInitialized = false
  private initializationPromise: Promise<void>

  constructor() {
    this.initializationPromise = this.initializeGemini()
  }

  private async initializeGemini(): Promise<void> {
    try {
      const apiKey = this.getApiKey()

      if (!apiKey) {
        console.warn("Gemini API key not found. Using fallback responses.")
        vscode.window
          .showWarningMessage(
            "Gemini API key not found. Please set it in VS Code settings or add GEMINI_API_KEY to your .env file.",
            "Open Settings",
          )
          .then((selection) => {
            if (selection === "Open Settings") {
              vscode.commands.executeCommand("workbench.action.openSettings", "traycer.geminiApiKey")
            }
          })
        return
      }

      this.genAI = new GoogleGenerativeAI(apiKey)
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp", 
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      })
      this.isInitialized = true

      vscode.window.showInformationMessage("Gemini AI connected successfully!")
    } catch (error) {
      console.error("Failed to initialize Gemini:", error)
      vscode.window.showErrorMessage(`Gemini AI initialization failed: ${error}`)
    }
  }

  private async ensureInitialized(): Promise<boolean> {
    await this.initializationPromise
    return this.isInitialized && this.model !== null
  }

  private getApiKey(): string | undefined {

    const config = vscode.workspace.getConfiguration("traycer")
    const settingsApiKey = config.get<string>("geminiApiKey")
    if (settingsApiKey && settingsApiKey.trim()) {
      return settingsApiKey.trim()
    }

    if (process.env.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (workspaceRoot) {
      const envPath = path.join(workspaceRoot, ".env")
      if (fs.existsSync(envPath)) {
        try {
          dotenv.config({ path: envPath })
          if (process.env.GEMINI_API_KEY) {
            return process.env.GEMINI_API_KEY
          }
        } catch (error) {
          console.warn("Failed to load .env file:", error)
        }
      }
    }

    try {
      const extensionRoot = path.dirname(__filename)
      const envPath = path.join(extensionRoot, ".env")
      if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath })
        if (process.env.GEMINI_API_KEY) {
          return process.env.GEMINI_API_KEY
        }
      }
    } catch (error) {
      console.warn("Failed to load extension .env file:", error)
    }

    console.warn("No API key found in any location")
    return undefined
  }

  public async refreshApiKey(): Promise<void> {
    this.isInitialized = false
    this.initializationPromise = this.initializeGemini()
    await this.initializationPromise
  }

  async generateClarificationQuestions(userRequest: string, codebaseContext?: CodebaseContext): Promise<string[]> {

    const initialized = await this.ensureInitialized()

    if (!initialized) {
      return this.getFallbackClarificationQuestions(userRequest)
    }

    try {

      const contextInfo = codebaseContext ? this.buildContextPrompt(codebaseContext) : ""

      const prompt = `${contextInfo}

A developer in this project wants: "${userRequest}"

Based on the existing codebase and project structure, generate 2-3 specific clarification questions that would help implement this request properly. Consider:
- The current technology stack and frameworks being used
- Existing patterns and architecture in the codebase
- Integration points with current code
- Specific technical decisions needed for this project

Keep questions focused on what's needed to implement this feature in THIS specific codebase.

Return only the questions, one per line:`

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      const text = response.text()


      const questions = text
        .split("\n")
        .map((q: string) => q.trim())
        .filter((q: string) => q.length > 0 && q.includes("?"))
        .slice(0, 3)

      if (questions.length > 0) {
        return questions
      } else {
        return this.getFallbackClarificationQuestions(userRequest)
      }
    } catch (error) {
      console.error("Error generating clarification questions:", error)
      vscode.window.showWarningMessage("Failed to generate questions with AI. Using fallback.")
      return this.getFallbackClarificationQuestions(userRequest)
    }
  }

  async generatePlan(
    userRequest: string,
    clarificationAnswers: string[],
    codebaseContext?: CodebaseContext,
  ): Promise<PlanItem[]> {

    const initialized = await this.ensureInitialized()

    if (!initialized) {
      return this.getFallbackPlan(userRequest)
    }

    try {

      const contextInfo = codebaseContext ? this.buildContextPrompt(codebaseContext) : ""
      const clarificationContext =
        clarificationAnswers.length > 0
          ? `\n\nClarification Details:\n${clarificationAnswers.map((answer, i) => `${i + 1}. ${answer}`).join("\n")}`
          : ""

      const prompt = `${contextInfo}

Create an implementation plan for: "${userRequest}"${clarificationContext}

Based on the existing codebase structure and patterns, generate a JSON array of file changes needed. Follow these guidelines:

1. Use the EXISTING file structure and naming conventions shown above
2. Integrate with the current technology stack (${codebaseContext?.frameworks.join(", ") || "detected frameworks"})
3. Follow the existing patterns in the codebase
4. Only include files directly needed for the requested feature
5. Use realistic file paths that match the current project structure

Each item should have:
- "file": file path from project root (matching existing structure)
- "action": "new", "modify", or "remove"
- "description": specific implementation details for this codebase

Return only valid JSON array:`

      const result = await this.model.generateContent(prompt)
      const response = await result.response
      let text = response.text().trim()

    
      text = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim()

      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error("No valid JSON array found in response")
      }

      const planData = JSON.parse(jsonMatch[0])

      if (!Array.isArray(planData)) {
        throw new Error("Response is not an array")
      }

      const validatedPlan: PlanItem[] = planData
        .filter(
          (item) =>
            item &&
            typeof item.file === "string" &&
            typeof item.action === "string" &&
            typeof item.description === "string" &&
            ["new", "modify", "remove"].includes(item.action),
        )
        .map((item) => ({
          file: item.file.trim(),
          action: item.action as "new" | "modify" | "remove",
          description: item.description.trim(),
        }))

      if (validatedPlan.length === 0) {
        throw new Error("No valid plan items found")
      }

      return validatedPlan
    } catch (error) {
      console.error("Error generating plan:", error)
      vscode.window.showWarningMessage("Failed to generate plan with AI. Using fallback.")
      return this.getFallbackPlan(userRequest)
    }
  }

  private getFallbackClarificationQuestions(userRequest: string): string[] {
    const request = userRequest.toLowerCase()

    if (request.includes("auth")) {
      return [
        "Which authentication service would you like to use (Auth0, Firebase, or build custom)?",
        "Do you need social login options like Google or GitHub?",
        "Should this work with your existing user database?",
      ]
    }

    if (request.includes("api") || request.includes("endpoint")) {
      return [
        "Do you prefer a REST API or GraphQL for this feature?",
        "What database should this connect to?",
        "Do you need authentication/authorization on these endpoints?",
      ]
    }

    if (request.includes("database") || request.includes("db")) {
      return [
        "Which database system are you using (PostgreSQL, MongoDB, MySQL)?",
        "Do you need migration scripts for existing data?",
        "What ORM or database client do you prefer (Prisma, TypeORM, etc.)?",
      ]
    }

    return [
      "What technology stack should this use?",
      "Do you need this to work with existing code or systems?",
      "Are there any specific requirements or constraints?",
    ]
  }

  private getFallbackPlan(userRequest: string): PlanItem[] {
    const request = userRequest.toLowerCase()

    if (request.includes("auth")) {
      return [
        {
          file: "src/types/auth.ts",
          action: "new",
          description: "Define authentication types and user interfaces",
        },
        {
          file: "src/lib/auth.ts",
          action: "new",
          description: "Create Auth0 integration service with login/logout methods",
        },
        {
          file: "src/components/LoginForm.tsx",
          action: "new",
          description: "Create login form component with Auth0 integration",
        },
        {
          file: "src/components/ProtectedRoute.tsx",
          action: "new",
          description: "Create route protection component for authenticated pages",
        },
        {
          file: "src/App.tsx",
          action: "modify",
          description: "Add Auth0 provider and protected routing configuration",
        },
        {
          file: "src/utils/localAuth.ts",
          action: "remove",
          description: "Remove old local authentication utilities",
        },
      ]
    }

    return [
      {
        file: "src/components/NewFeature.tsx",
        action: "new",
        description: "Create main component for the requested feature",
      },
      {
        file: "src/types/feature.ts",
        action: "new",
        description: "Define TypeScript types for the new feature",
      },
      {
        file: "src/App.tsx",
        action: "modify",
        description: "Integrate new feature into main application",
      },
    ]
  }

  private buildContextPrompt(context: CodebaseContext): string {
    const keyFilesInfo = context.keyFiles
      .slice(0, 10) 
      .map((file) => `${file.path} (${file.language})`)
      .join("\n")

    const recentFileContents = context.keyFiles
      .filter((f) => f.path.includes("package.json") || f.path.includes("tsconfig.json") || f.path.includes(".config"))
      .slice(0, 3)
      .map((file) => `\n--- ${file.path} ---\n${file.content.slice(0, 1000)}`)
      .join("\n")

    return `CURRENT PROJECT CONTEXT:

Project Type: ${context.projectType}
Frameworks: ${context.frameworks.join(", ")}
Languages: ${context.languages.join(", ")}
Dependencies: ${context.dependencies.slice(0, 15).join(", ")}

Project Structure:
${context.structure}

Key Files:
${keyFilesInfo}

Configuration Files:${recentFileContents}

---`
  }
}
