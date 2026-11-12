import type { ToolExecutionLog } from '../api/client';
import type { ToolCall } from './AgentSteps';

export function fromToolExecutionLog(log: ToolExecutionLog): ToolCall {
  return {
    id: log.id,
    name: log.tool_name,
    status:
      log.status === 'success'
        ? 'success'
        : log.status === 'error'
        ? 'error'
        : 'running',
    args: log.input_arguments,
    result:
      typeof log.output_result === 'string'
        ? log.output_result
        : log.output_result
        ? JSON.stringify(log.output_result, null, 2)
        : log.error_message || undefined,
    executionTimeMs: log.execution_time_ms,
  };
}