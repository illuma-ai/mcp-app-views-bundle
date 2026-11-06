import { describe, expect, it, jest } from "@jest/globals";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { AdoApi, type HostBridge } from "../../../src/views/web/lib/api";
import { type ReviewGrant, formatToken } from "../../../src/views/web/lib/review";

const GRANT: ReviewGrant = { nonce: "ab12", slot: 4_000_000, key: "view-key" };
import { flattenSuites, formatDuration, parseSteps, stepsFromProposal, stepsToText, summariseOutcomes, toCaseRefs, toPlans, toResults, toSuites } from "../../../src/views/web/lib/testplans";
import { CaseView, PlanView, PlansList, ResultsView, TestCaseForm } from "../../../src/views/web/ui/TestPlanViews";
import { testCasePrefillFrom } from "../../../src/views/web/ui/TestScreens";

const STEPS_XML =
  '<steps id="0" last="3"><step id="2" type="ValidateStep"><parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;Open the page &amp;amp; wait&lt;/P&gt;&lt;/DIV&gt;</parameterizedString><parameterizedString isformatted="true">&lt;DIV&gt;&lt;P&gt;The &lt;b&gt;form&lt;/b&gt; is shown&lt;/P&gt;&lt;/DIV&gt;</parameterizedString><description/></step><step id="3" type="ValidateStep"><parameterizedString isformatted="true">&lt;P&gt;Press Sign up&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true"></parameterizedString><description/></step></steps>';

describe("test plan data", () => {
  it("reads the steps XML into action and expected result as plain text", () => {
    expect(parseSteps(STEPS_XML)).toEqual([
      { action: "Open the page & wait", expected: "The form is shown" },
      { action: "Press Sign up", expected: "" },
    ]);
    expect(parseSteps(undefined)).toEqual([]);
    expect(parseSteps("<nothing/>")).toEqual([]);
  });

  it("writes steps in the 'N. action|expected' text the tools take and keeps the delimiter safe", () => {
    expect(
      stepsToText([
        { action: "Open", expected: "Shown" },
        { action: "", expected: "" },
        { action: "a|b\nc", expected: "ok" },
      ])
    ).toBe("1. Open|Shown\n2. a/b c|ok");
    expect(stepsFromProposal("1. Open the page|It loads\n2. Close")).toEqual([
      { action: "Open the page", expected: "It loads" },
      { action: "Close", expected: "" },
    ]);
    expect(stepsFromProposal(["1. A|B"])).toEqual([{ action: "A", expected: "B" }]);
  });

  it("reads plans, the suite tree, case references and results", () => {
    expect(toPlans({ testPlans: [{ id: 1, name: "R1", state: "Active", iteration: "Dev\\Sprint 1", owner: { displayName: "Kavya" }, rootSuite: { id: 10 } }] })).toEqual([
      { id: 1, name: "R1", state: "Active", iteration: "Dev\\Sprint 1", area: undefined, start: undefined, end: undefined, owner: "Kavya", rootSuiteId: 10 },
    ]);
    const tree = toSuites({ testSuites: [{ id: 10, name: "Root", children: [{ id: 11, name: "Sign-up" }] }] });
    expect(flattenSuites(tree).map((r) => [r.suite.id, r.depth])).toEqual([
      [10, 0],
      [11, 1],
    ]);
    expect(toCaseRefs({ testCases: [{ workItem: { id: 50, name: "Case" } }] })).toEqual([{ id: 50, title: "Case" }]);
    const results = toResults([
      { id: 1, testCaseTitle: "a", outcome: "Passed", durationInMs: 420 },
      { id: 2, testCaseTitle: "b", outcome: "Failed", errorMessage: "boom" },
      { id: 3, testCaseTitle: "c", outcome: "Weird" },
    ]);
    expect(summariseOutcomes(results)).toEqual([
      { outcome: "Passed", count: 1 },
      { outcome: "Failed", count: 1 },
      { outcome: "Other", count: 1 },
    ]);
    expect(formatDuration(420)).toBe("420 ms");
    expect(formatDuration(61_250)).toBe("1 m 1 s");
  });

  it("turns the model's proposal into the form's pre-fill", () => {
    expect(testCasePrefillFrom({ title: "T", steps: ["1. A|B"], priority: 2, planId: 1, suiteId: 11 })).toMatchObject({
      title: "T",
      steps: [{ action: "A", expected: "B" }],
      priority: "2",
      planId: 1,
      suiteId: 11,
    });
  });
});

const html = (node: ReactElement): string =>
  renderToStaticMarkup(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("rendered words", () => {
  it("plans list", () => {
    const out = html(<PlansList plans={[{ id: 1, name: "Release 1 acceptance", state: "Active", iteration: "Dev\\Sprint 1" }]} iterations={[]} canCreate />);
    for (const w of ["Test Plans", "New Test Plan", "Name", "State", "Iteration", "Owner", "Release 1 acceptance", "Active"]) expect(out).toContain(w);
    expect(html(<PlansList plans={[]} iterations={[]} canCreate={false} />)).toContain("No test plans");
    expect(html(<PlansList plans={[]} iterations={[]} canCreate={false} />)).not.toContain("New Test Plan");
  });

  it("plan with suites and cases", () => {
    const out = html(
      <PlanView
        plan={{ id: 1, name: "R1" }}
        suites={[{ id: 10, name: "Root", children: [{ id: 11, name: "Sign-up", children: [] }] }]}
        suiteId={11}
        cases={[{ id: 50, title: "Sign up works", state: "Design", priority: 1 }]}
        canWrite
      />
    );
    for (const w of ["Define", "Execute", "Chart", "Root", "Sign-up", "New suite", "New Test Case", "1 test case", "Sign up works", "Design"]) expect(out).toContain(w);
  });

  it("new test case form and the read-only case", () => {
    const out = html(<TestCaseForm suites={[]} iterations={[]} initial={{ title: "T" }} />);
    for (const w of ["NEW TEST CASE *", "Add step", "Priority", "Iteration", "Add to test suite", "Create"]) expect(out).toContain(w);
    const ro = html(<CaseView id={50} title="T" steps={[{ action: "Open", expected: "Shown" }]} canEdit={false} />);
    expect(ro).toContain("TEST CASE 50");
    expect(ro).not.toContain("Save");
  });

  it("results with outcome totals", () => {
    const out = html(
      <ResultsView
        buildId={42}
        results={toResults([
          { id: 1, testCaseTitle: "a", outcome: "Passed" },
          { id: 2, testCaseTitle: "b", outcome: "Failed" },
        ])}
      />
    );
    for (const w of ["Test results, build 42", "Passed 1", "Failed 1", "2 results"]) expect(out).toContain(w);
  });
});

describe("test case Create", () => {
  it("makes the create call with the review token, then adds the case to the chosen suite", async () => {
    const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: '{"id":60,"rev":1,"fields":{}}' }] });
    const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
    const api = new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools: ["testplan_test_case_write", "testplan_test_suite_write"], review: GRANT });

    await api.createTestCase({ title: "Welcome email", steps: stepsToText([{ action: "Sign up", expected: "Works" }]), priority: 2 }, { planId: 1, suiteId: 11 });

    expect(callTool).toHaveBeenCalledTimes(2);
    const createArgs = { action: "create", project: "Dev", title: "Welcome email", steps: "1. Sign up|Works", priority: 2 };
    expect(callTool).toHaveBeenNthCalledWith(1, "testplan_test_case_write", { ...createArgs, reviewToken: formatToken(GRANT, "testplan_test_case_write", createArgs) });
    expect(callTool).toHaveBeenNthCalledWith(2, "testplan_test_suite_write", expect.objectContaining({ action: "add_test_cases", project: "Dev", planId: 1, suiteId: 11, testCaseIds: ["60"] }));
  });

  it("sends the review token with plan, suite and step writes", async () => {
    const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: "{}" }] });
    const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
    const api = new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools: ["testplan_test_plan_write", "testplan_test_suite_write", "testplan_test_case_write"], review: GRANT });
    await api.createTestPlan({ name: "P", iteration: "Dev\\Sprint 1" });
    await api.createSuite(1, 10, "S");
    await api.updateSteps(5, "1. a|b");
    for (const call of callTool.mock.calls) expect((call[1] as { reviewToken?: string }).reviewToken).toMatch(/^[0-9a-f]{16}$/);
  });
});
