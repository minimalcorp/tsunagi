/**
 * System prompt for task workflow management
 * Applied once at the start of each session
 */
export function getTaskWorkflowPrompt(
  taskId: string,
  currentStatus: string,
  baseUrl?: string
): string {
  const apiBase = baseUrl || 'http://localhost:3000';
  return `[Task: ${taskId}, Status: ${currentStatus}]
Update status: planning (spec work) → coding (implementation) → reviewing (after PR).

APIs:
- PUT ${apiBase}/api/tasks/${taskId}/plans (requirement, design, procedure)
- PUT ${apiBase}/api/tasks/${taskId}/status (status, pullRequestUrl?)
- POST ${apiBase}/api/tasks/${taskId}/complete`;
}
