export interface PlanItem {
  file: string
  action: "new" | "modify" | "remove"
  description: string
}

export interface WorkflowState {
  phase: "idle" | "clarification" | "planning" | "ready"
  userRequest: string
  clarificationQuestions: string[]
  clarificationAnswers: string[]
  plan: PlanItem[]
}

export enum ActionType {
  NEW = "new",
  MODIFY = "modify",
  REMOVE = "remove",
}
