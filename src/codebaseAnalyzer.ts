import * as vscode from "vscode"
import * as path from "path"

export interface FileInfo {
  path: string
  content: string
  language: string
  size: number
}

export interface CodebaseContext {
  projectType: string
  frameworks: string[]
  languages: string[]
  keyFiles: FileInfo[]
  structure: string
  dependencies: string[]
}

export class CodebaseAnalyzer {
  private readonly maxFileSize = 50000
  private readonly maxTotalFiles = 20

  async analyzeWorkspace(): Promise<CodebaseContext> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error("No workspace folder found")
    }

    const rootPath = workspaceFolders[0].uri.fsPath
    console.log("Analyzing workspace:", rootPath)

    const keyFiles = await this.findKeyFiles(rootPath)
    const dependencies = await this.extractDependencies(keyFiles)
    const frameworks = this.detectFrameworks(keyFiles, dependencies)
    const languages = this.detectLanguages(keyFiles)
    const projectType = this.determineProjectType(frameworks, keyFiles)
    const structure = await this.generateStructure(rootPath)

    return {
      projectType,
      frameworks,
      languages,
      keyFiles,
      structure,
      dependencies,
    }
  }

  private async findKeyFiles(rootPath: string): Promise<FileInfo[]> {
    const keyFilePatterns = [
      "**/package.json",
      "**/tsconfig.json",
      "**/next.config.*",
      "**/vite.config.*",
      "**/webpack.config.*",
      "**/tailwind.config.*",
      "**/src/**/*.{ts,tsx,js,jsx}",
      "**/app/**/*.{ts,tsx,js,jsx}",
      "**/pages/**/*.{ts,tsx,js,jsx}",
      "**/components/**/*.{ts,tsx,js,jsx}",
      "**/lib/**/*.{ts,tsx,js,jsx}",
      "**/utils/**/*.{ts,tsx,js,jsx}",
      "**/*.md",
      "**/Dockerfile",
      "**/.env*",
    ]

    const files: FileInfo[] = []

    for (const pattern of keyFilePatterns) {
      try {
        const foundFiles = await vscode.workspace.findFiles(pattern, "**/node_modules/**", this.maxTotalFiles)

        for (const file of foundFiles) {
          if (files.length >= this.maxTotalFiles) break

          try {
            const stat = await vscode.workspace.fs.stat(file)
            if (stat.size > this.maxFileSize) continue

            const content = await vscode.workspace.fs.readFile(file)
            const textContent = Buffer.from(content).toString("utf8")

            files.push({
              path: vscode.workspace.asRelativePath(file),
              content: textContent,
              language: this.getLanguageFromPath(file.fsPath),
              size: stat.size,
            })
          } catch (error) {
            console.log("Error reading file:", file.fsPath, error)
          }
        }
      } catch (error) {
        console.log("Error finding files with pattern:", pattern, error)
      }
    }

    return files.slice(0, this.maxTotalFiles)
  }

  private async extractDependencies(files: FileInfo[]): Promise<string[]> {
    const dependencies: string[] = []

    const packageJsonFile = files.find((f) => f.path.endsWith("package.json"))
    if (packageJsonFile) {
      try {
        const packageJson = JSON.parse(packageJsonFile.content)
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        }
        dependencies.push(...Object.keys(deps))
      } catch (error) {
        console.log("Error parsing package.json:", error)
      }
    }

    return dependencies
  }

  private detectFrameworks(files: FileInfo[], dependencies: string[]): string[] {
    const frameworks: string[] = []

    // Check dependencies
    if (dependencies.includes("next")) frameworks.push("Next.js")
    if (dependencies.includes("react")) frameworks.push("React")
    if (dependencies.includes("vue")) frameworks.push("Vue.js")
    if (dependencies.includes("svelte")) frameworks.push("Svelte")
    if (dependencies.includes("express")) frameworks.push("Express")
    if (dependencies.includes("fastify")) frameworks.push("Fastify")
    if (dependencies.includes("tailwindcss")) frameworks.push("Tailwind CSS")
    if (dependencies.includes("typescript")) frameworks.push("TypeScript")

    // Check config files
    if (files.some((f) => f.path.includes("next.config"))) frameworks.push("Next.js")
    if (files.some((f) => f.path.includes("vite.config"))) frameworks.push("Vite")
    if (files.some((f) => f.path.includes("tailwind.config"))) frameworks.push("Tailwind CSS")

    return [...new Set(frameworks)]
  }

  private detectLanguages(files: FileInfo[]): string[] {
    const languages = new Set<string>()

    files.forEach((file) => {
      languages.add(file.language)
    })

    return Array.from(languages)
  }

  private determineProjectType(frameworks: string[], files: FileInfo[]): string {
    if (frameworks.includes("Next.js")) return "Next.js Application"
    if (frameworks.includes("React")) return "React Application"
    if (frameworks.includes("Vue.js")) return "Vue.js Application"
    if (frameworks.includes("Svelte")) return "Svelte Application"
    if (frameworks.includes("Express")) return "Node.js Backend"
    if (files.some((f) => f.path.includes("package.json"))) return "Node.js Project"
    return "Web Project"
  }

  private async generateStructure(rootPath: string): Promise<string> {
    try {
      const structure = await this.buildDirectoryTree(rootPath, 0, 3) // Max depth 3
      return structure
    } catch (error) {
      console.log("Error generating structure:", error)
      return "Unable to generate project structure"
    }
  }

  private async buildDirectoryTree(dirPath: string, currentDepth: number, maxDepth: number): Promise<string> {
    if (currentDepth >= maxDepth) return ""

    const indent = "  ".repeat(currentDepth)
    let tree = ""

    try {
      const uri = vscode.Uri.file(dirPath)
      const entries = await vscode.workspace.fs.readDirectory(uri)

      for (const [name, type] of entries) {
        if (name.startsWith(".") && !["src", "app", "pages", "components"].includes(name)) continue
        if (name === "node_modules") continue

        tree += `${indent}${name}\n`

        if (type === vscode.FileType.Directory && currentDepth < maxDepth - 1) {
          const subTree = await this.buildDirectoryTree(path.join(dirPath, name), currentDepth + 1, maxDepth)
          tree += subTree
        }
      }
    } catch (error) {
      console.log("Error reading directory:", dirPath, error)
    }

    return tree
  }

  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const languageMap: { [key: string]: string } = {
      ".ts": "TypeScript",
      ".tsx": "TypeScript React",
      ".js": "JavaScript",
      ".jsx": "JavaScript React",
      ".json": "JSON",
      ".md": "Markdown",
      ".css": "CSS",
      ".scss": "SCSS",
      ".html": "HTML",
      ".py": "Python",
      ".java": "Java",
      ".go": "Go",
      ".rs": "Rust",
    }

    return languageMap[ext] || "Unknown"
  }
}
