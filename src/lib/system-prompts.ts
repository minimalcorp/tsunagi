/**
 * System prompt for task workflow management
 * Applied once at the start of each session
 */
export function getTaskWorkflowPrompt(taskId: string, currentStatus: string): string {
  return `[Task: ${taskId}, Status: ${currentStatus}]
Update status: planning (spec work) → coding (implementation) → reviewing (after PR).

APIs:
- PUT /api/tasks/${taskId}/plans (requirement, design, procedure)
- PUT /api/tasks/${taskId}/status (status, pullRequestUrl?)
- POST /api/tasks/${taskId}/complete`;
}
