import { describe, expect, it } from "vitest";
import type { Task } from "@/types/domain";
import { getActiveTaskRows, getArchivedBranchRoots, getAutoExpandedTaskIds, getTaskIdsMatchingLabel, getTaskPathIds, getTaskRows, isArchivedBranchRoot } from "./taskSelectors";

const now = "2026-05-26T00:00:00.000Z";

const tasks: Task[] = [
  { id: "project", parentId: null, title: "Project", status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
  { id: "draft", parentId: "project", title: "Draft", status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
  {
    id: "archive-root",
    parentId: null,
    title: "Archive root",
    status: "archived",
    previousStatus: "todo",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    archivedAt: now,
  },
  {
    id: "archive-child",
    parentId: "archive-root",
    title: "Archive child",
    status: "archived",
    previousStatus: "done",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
    archivedAt: now,
  },
];

describe("task selectors", () => {
  it("hides archived branches from active task rows", () => {
    expect(getActiveTaskRows(tasks).map(({ task }) => task.id)).toEqual(["project", "draft"]);
  });

  it("can include archived tasks when requested", () => {
    expect(getTaskRows(tasks, { includeArchived: true }).map(({ task }) => task.id)).toEqual([
      "project",
      "draft",
      "archive-root",
      "archive-child",
    ]);
  });

  it("returns archived branch roots only once", () => {
    expect(getArchivedBranchRoots(tasks).map((task) => task.id)).toEqual(["archive-root"]);
    expect(isArchivedBranchRoot(tasks[2], tasks)).toBe(true);
    expect(isArchivedBranchRoot(tasks[3], tasks)).toBe(false);
  });

  it("supports collapsed tree traversal with top-level expanded by default", () => {
    const deepTasks: Task[] = [
      { id: "root", parentId: null, title: "Root", status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
      { id: "child", parentId: "root", title: "Child", status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
      { id: "leaf", parentId: "child", title: "Leaf", status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
    ];

    expect(getTaskRows(deepTasks, { includeArchived: false, defaultExpandedDepth: 0 }).map(({ task }) => task.id)).toEqual(["root", "child"]);
    expect(
      getTaskRows(deepTasks, { includeArchived: false, defaultExpandedDepth: 0, expandedTaskIds: ["child"] }).map(({ task }) => task.id),
    ).toEqual(["root", "child", "leaf"]);
  });

  it("builds task paths and auto-expanded ancestor ids", () => {
    expect(getTaskPathIds(tasks, "draft")).toEqual(["project", "draft"]);
    expect([...getAutoExpandedTaskIds(tasks, ["draft"])]).toEqual(["project"]);
  });

  it("filters by label while preserving ancestor context", () => {
    const labeledTasks: Task[] = [
      { id: "project", parentId: null, title: "Project", status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
      { id: "draft", parentId: "project", title: "Draft", labelIds: ["work"], status: "todo", sortOrder: 0, createdAt: now, updatedAt: now },
      { id: "personal", parentId: null, title: "Personal", labelIds: ["home"], status: "todo", sortOrder: 1, createdAt: now, updatedAt: now },
    ];

    const matchingIds = getTaskIdsMatchingLabel(labeledTasks, "work");
    expect([...(matchingIds ?? [])]).toEqual(["project", "draft"]);
    expect(getTaskRows(labeledTasks, { filterTaskIds: matchingIds }).map(({ task }) => task.id)).toEqual(["project", "draft"]);
  });
});
