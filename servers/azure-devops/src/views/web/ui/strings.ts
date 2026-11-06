/**
 * Every visible word the boards views share with the Azure DevOps web UI, in one place. The exact
 * strings come from the reference captures (m365-setup/reference/azure-devops/words.md) and a test
 * renders the views and asserts each appears, so a wording drift fails the build.
 */
export const S = {
  loading: "Loading...",
  board: {
    toDo: "To Do",
    doing: "Doing",
    done: "Done",
    newItem: "New item",
    viewAsBacklog: "View as backlog",
    tabBoard: "Board",
    tabAnalytics: "Analytics",
  },
  backlog: {
    viewAsBoard: "View as Board",
    tabBacklog: "Backlog",
    newWorkItem: "New Work Item",
    columnOptions: "Column Options",
    emptyTitle: "Get started with your product backlog",
    emptyText: 'Use the "New Work Item" command to create and prioritize work items',
    learnMore: "Learn more about backlogs",
    planning: "Planning",
    planningHelp: "Drag and drop work items to include them in a sprint.",
    noWork: "No work scheduled yet",
    newSprint: "New Sprint",
  },
  sprint: {
    taskboard: "Taskboard",
    backlog: "Backlog",
    capacity: "Capacity",
    analytics: "Analytics",
    person: "Person: All",
    noDates: "No iteration dates",
    setDates: "Set dates",
    emptyTitle: "You do not have any work scheduled yet",
    scheduleWork: "Schedule Work",
    emptyAfterLink: " from your product backlog or create new work items.",
    newWorkItem: "New Work Item",
    columnOptions: "Column Options",
  },
  form: {
    save: "Save",
    comments: "0 Comments",
    addTag: "Add Tag",
    titleRequired: "Field 'Title' cannot be empty.",
    state: "State",
    reason: "Reason",
    area: "Area",
    iteration: "Iteration",
    details: "Details",
    description: "Description",
    discussion: "Discussion",
    planning: "Planning",
    priority: "Priority",
    effort: "Effort",
    deployment: "Deployment",
    deploymentHelp:
      "To track releases associated with this work item, go to Releases and turn on deployment status reporting for Boards in your pipeline's Options menu. Learn more about deployment status reporting",
    development: "Development",
    addLink: "Add link",
    developmentHelp: "Link an Azure Repos commit, pull request or branch to see the status of your development. You can also create a branch to get started.",
    relatedWork: "Related Work",
    relatedHelp: "Add an existing work item as a parent",
  },
} as const;

/** "NEW ISSUE *" style header of the new work item form. */
export function newItemHeader(type: string): string {
  return `NEW ${type.toUpperCase()} *`;
}
