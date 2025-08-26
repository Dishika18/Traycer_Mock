# Traycer Mock (VS Code Extension)

**Traycer Mock** is a simplified **MVP** that re-creates and simplifies the core idea behind [**Traycer AI**](https://traycer.ai).  
It demonstrates the **"planning layer"** concept acting as a reasoning and orchestration layer on top of coding agents using the **Gemini AI SDK** inside a VS Code extension.

## About the Project

Traycer AI’s vision is to **help developers think and build better by adding a planning layer on top of coding agents**.  

This project is an **MVP mock**, created purely for the assessment, to show understanding of that vision. It does not attempt to be a full implementation but rather highlights the **core planning workflow**:

- Provides **clarification questions** before coding.  
- Generates **step-by-step plans** for development tasks.  
- Demonstrates how a **planning-first workflow** can sit between a developer and coding agents.

---

## ⚠️ Note:  
This is not the actual Traycer AI product. It is a **mock MVP created solely for the assignment** to demonstrate understanding of the idea.

---
 
## Features

- **Planning Layer Simulation** – Generates structured plans and clarifications.  
- **Gemini AI SDK Integration** – Uses Gemini models for reasoning.  
- **Interactive Sidebar** – Simple and easy to use inside VS Code.  
- **Session Context** – Keeps track of user queries during a session.  
- **MVP-First Approach** – Focused on recreating and simplifying the concept, not production scale.  

## 🛠️ Tech Stack

- **TypeScript** – Primary implementation  
- **Node.js** – Runtime  
- **VS Code Extension API** – For building the extension  
- **Gemini SDK** – For AI-powered reasoning and planning  

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/traycer-mock.git
   cd traycer-mock
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open the project in VS Code.
4. Press F5 to run the extension in a new Extension Development Host window.

## Configuration
The Gemini API key is required for the extension to work.
There are two steps to set it up:
1. (Optional for local dev) Create a .env file in the project root and add your key:

```
GEMINI_API_KEY=your_api_key_here
```
2. (Required for usage inside VS Code) Go to VS Code Settings → search for "Traycer Mock" → enter your Gemini API key in the extension’s settings field.
- This is the key actually used by the extension at runtime.
- Without setting it here, the extension will not function.

## Usage & Vision Alignment

1. Open the Traycer Mock Sidebar from the VS Code activity bar.

2. Ensure your Gemini API key is set in the extension settings.

3. Ask for a plan or clarification before coding.
Example queries:
- “Generate a plan for building a Todo App in React”
- “What clarifications do I need before making a backend API project?”

4. The extension will return structured steps or clarifying questions, simulating the planning layer idea.

By guiding the user to ask clarifying questions first, generate structured plans, and think like a builder before coding, this MVP captures the essence of Traycer AI’s vision in a simplified, working form.

## Video Demo
Watch the demo video here: [Demo Link](https://drive.google.com/file/d/1jhNuirYCYTL1jUXA5_j7ef7f6GhFpfld/view?usp=sharing)

---

Made with ❤️ by [Dishika Vaishkiyar](https://github.com/Dishika18)
