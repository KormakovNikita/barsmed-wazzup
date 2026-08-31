import type { AssignmentStrategy, Conversation, Operator } from "./types";

let roundRobinIndex = 0;

function countOpenDialogs(operatorId: string, conversations: Conversation[]): number {
  return conversations.filter((c) => c.assignedTo === operatorId).length;
}

export function getAssignmentStrategy(): AssignmentStrategy {
  const value = process.env.ASSIGNMENT_STRATEGY;
  if (value === "round_robin") return "round_robin";
  return "least_loaded";
}

export function pickOperatorForAssignment(
  operators: Operator[],
  conversations: Conversation[],
  strategy: AssignmentStrategy = getAssignmentStrategy(),
): Operator | null {
  const online = operators.filter((op) => op.online);
  const pool = online.length > 0 ? online : operators;
  if (pool.length === 0) return null;

  if (strategy === "round_robin") {
    const operator = pool[roundRobinIndex % pool.length];
    roundRobinIndex = (roundRobinIndex + 1) % pool.length;
    return operator;
  }

  return pool.reduce((best, current) => {
    const bestLoad = countOpenDialogs(best.id, conversations);
    const currentLoad = countOpenDialogs(current.id, conversations);
    return currentLoad < bestLoad ? current : best;
  });
}

export function getOperatorLoad(
  operators: Operator[],
  conversations: Conversation[],
): { operator: Operator; openDialogs: number }[] {
  return operators.map((operator) => ({
    operator,
    openDialogs: countOpenDialogs(operator.id, conversations),
  }));
}
