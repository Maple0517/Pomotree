import type { Task } from "@/types/domain";

export interface TaskRow {
  task: Task;
  depth: number;
  hasChildren: boolean;
}

function getTaskParentKey(parentId: string | null) {
  return parentId ?? "__task_root__";
}

export function getTaskChildrenMap(tasks: Task[], options: { includeArchived?: boolean } = {}) {
  const includeArchived = options.includeArchived ?? false;
  const byParent = new Map<string, Task[]>();

  for (const task of tasks) {
    if (!includeArchived && task.status === "archived") {
      continue;
    }

    const key = getTaskParentKey(task.parentId);
    byParent.set(key, [...(byParent.get(key) ?? []), task]);
  }

  return byParent;
}

export function getTaskPathIds(tasks: Task[], taskId: string | null | undefined) {
  if (!taskId) return [];

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(taskId);

  while (current) {
    if (seen.has(current.id)) {
      throw new Error("Task tree cycle detected");
    }

    seen.add(current.id);
    path.unshift(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

export function getTaskIdsMatchingLabel(tasks: Task[], labelId: string | null) {
  if (!labelId) return null;

  const included = new Set<string>();
  for (const task of tasks) {
    if (!(task.labelIds ?? []).includes(labelId)) continue;
    for (const pathId of getTaskPathIds(tasks, task.id)) {
      included.add(pathId);
    }
  }
  return included;
}

export function getTaskRows(
  tasks: Task[],
  options: {
    includeArchived?: boolean;
    expandedTaskIds?: Iterable<string>;
    defaultExpandedDepth?: number;
    filterTaskIds?: Set<string> | null;
  } = {},
): TaskRow[] {
  const includeArchived = options.includeArchived ?? false;
  const expandedTaskIds = new Set(options.expandedTaskIds ?? []);
  const defaultExpandedDepth = options.defaultExpandedDepth ?? Number.POSITIVE_INFINITY;
  const filterTaskIds = options.filterTaskIds ?? null;
  const byParent = getTaskChildrenMap(tasks, { includeArchived });

  const rows: TaskRow[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const key = getTaskParentKey(parentId);
    for (const task of byParent.get(key) ?? []) {
      if (filterTaskIds && !filterTaskIds.has(task.id)) continue;

      const hasVisibleChildren = (byParent.get(getTaskParentKey(task.id)) ?? []).some((child) => !filterTaskIds || filterTaskIds.has(child.id));
      rows.push({ task, depth, hasChildren: hasVisibleChildren });
      if (hasVisibleChildren && (filterTaskIds || expandedTaskIds.has(task.id) || depth <= defaultExpandedDepth)) {
        visit(task.id, depth + 1);
      }
    }
  };

  visit(null, 0);
  return rows;
}

export function getActiveTaskRows(tasks: Task[]) {
  return getTaskRows(tasks, { includeArchived: false });
}

export function getAutoExpandedTaskIds(tasks: Task[], taskIds: Array<string | null | undefined>) {
  const expanded = new Set<string>();

  for (const taskId of taskIds) {
    const path = getTaskPathIds(tasks, taskId);
    for (const ancestorId of path.slice(0, -1)) {
      expanded.add(ancestorId);
    }
  }

  return expanded;
}

export function getArchivedBranchRoots(tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => {
    if (task.status !== "archived") return false;
    const parent = task.parentId ? byId.get(task.parentId) : undefined;
    return !parent || parent.status !== "archived";
  });
}

export function isArchivedBranchRoot(task: Task, tasks: Task[]) {
  if (task.status !== "archived") return false;
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const parent = task.parentId ? byId.get(task.parentId) : undefined;
  return !parent || parent.status !== "archived";
}
