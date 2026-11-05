import { describe, expect, it } from "vitest";
import {
  autoLayout, FLOW_OWNED_TRIGGERS, FLOW_RECIPES, flowWarnings, isOptIn, isOptOut, matchReply, matchesKeyword, nextNodeId, nextSendTime,
  outputHandles, overlappingRuleTriggers, removeReplyOption, sanitizeGraph, validateFlow,
  type FlowEdge, type FlowGraph, type FlowNodeData,
} from "@/lib/nurture/types";

describe("reply matching", () => {
  const opts = ["Yes, book visit", "Send details", "Not now"];
  it("matches button titles, numbers and partial text", () => {
    expect(matchReply("Yes, book visit", opts)).toBe("opt:0");
    expect(matchReply("  send DETAILS ", opts)).toBe("opt:1");
    expect(matchReply("3", opts)).toBe("opt:2");
    expect(matchReply("not now thanks", opts)).toBe("opt:2");
    expect(matchReply("what is the price?", opts)).toBe("any");
    expect(matchReply("9", opts)).toBe("any");
  });
  it("detects keywords as whole words", () => {
    expect(matchesKeyword("Hi there", ["hi"])).toBe(true);
    expect(matchesKeyword("This is great", ["hi"])).toBe(false);
    expect(matchesKeyword("MENU", ["menu"])).toBe(true);
  });
  it("recognises opt-out / opt-in", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("Stop.")).toBe(true);
    expect(isOptOut("don't stop the visit")).toBe(false);
    expect(isOptIn("start")).toBe(true);
  });
  it("does not treat 'cancel' as unsubscribe (customers cancel site visits)", () => {
    expect(isOptOut("cancel")).toBe(false);
    expect(isOptOut("Cancel")).toBe(false);
    expect(isOptOut("unsubscribe")).toBe(true);
  });
});

describe("quiet hours (IST)", () => {
  it("defers night sends to 9 am IST", () => {
    // 22:00 IST = 16:30 UTC
    const night = new Date(Date.UTC(2026, 10, 5, 16, 30));
    const at = nextSendTime(night, 21, 9);
    expect(at.toISOString()).toBe(new Date(Date.UTC(2026, 10, 6, 3, 30)).toISOString()); // 09:00 IST next day
    // 02:00 IST = 20:30 UTC previous day → same-morning 9 am
    const early = new Date(Date.UTC(2026, 10, 5, 20, 30));
    expect(nextSendTime(early, 21, 9).toISOString()).toBe(new Date(Date.UTC(2026, 10, 6, 3, 30)).toISOString());
  });
  it("sends immediately during the day", () => {
    const noon = new Date(Date.UTC(2026, 10, 5, 6, 30)); // 12:00 IST
    expect(nextSendTime(noon, 21, 9)).toEqual(noon);
  });
});

describe("graph", () => {
  it("every recipe is valid, connected and laid out as a left-to-right tree", () => {
    for (const r of FLOW_RECIPES) {
      const g = r.build();
      expect(validateFlow(g), r.key).toEqual([]);
      const start = g.nodes.find((n) => n.data.kind === "trigger")!;
      expect(start.position.x).toBe(0);
      for (const e of g.edges) {
        const s = g.nodes.find((n) => n.id === e.source)!, t = g.nodes.find((n) => n.id === e.target)!;
        expect(outputHandles(s.data).map((h) => h.id)).toContain(e.sourceHandle);
        expect(t).toBeTruthy();
      }
      // Every node reachable from the start.
      const seen = new Set([start.id]);
      const stack = [start.id];
      while (stack.length) {
        const cur = stack.pop();
        for (const e of g.edges.filter((x) => x.source === cur)) if (!seen.has(e.target)) { seen.add(e.target); stack.push(e.target); }
      }
      expect(seen.size, r.key).toBe(g.nodes.length);
    }
  });

  it("flags loops without a wait", () => {
    const g: FlowGraph = {
      nodes: [
        { id: "t", position: { x: 0, y: 0 }, data: { kind: "trigger", trigger: "MANUAL", keywords: [], conditions: [] } },
        { id: "a", position: { x: 0, y: 0 }, data: { kind: "message", templateKey: null, body: "hi", buttons: [] } },
        { id: "b", position: { x: 0, y: 0 }, data: { kind: "action", action: { type: "SET_FOLLOW_UP", inHours: 1 } } },
      ],
      edges: [
        { id: "1", source: "t", sourceHandle: "next", target: "a" },
        { id: "2", source: "a", sourceHandle: "next", target: "b" },
        { id: "3", source: "b", sourceHandle: "next", target: "a" },
      ],
    };
    expect(validateFlow(g).join()).toMatch(/loop/i);
    expect(nextNodeId(g, "t", "next")).toBe("a");
  });

  it("auto-layout puts children to the right of parents", () => {
    const g = autoLayout(FLOW_RECIPES[1].build());
    for (const e of g.edges) {
      const s = g.nodes.find((n) => n.id === e.source)!, t = g.nodes.find((n) => n.id === e.target)!;
      expect(t.position.x).toBeGreaterThan(s.position.x);
    }
  });
});

const node = (id: string, data: FlowNodeData) => ({ id, position: { x: 0, y: 0 }, data });
const edge = (source: string, sourceHandle: string, target: string): FlowEdge => ({ id: `${source}-${sourceHandle}-${target}`, source, sourceHandle, target });

describe("editing branches", () => {
  it("removing a reply option keeps the other branches on the same answers", () => {
    const edges = [edge("r", "opt:0", "a"), edge("r", "opt:1", "b"), edge("r", "opt:2", "c"), edge("r", "timeout", "d"), edge("x", "opt:2", "y")];
    const out = removeReplyOption(edges, "r", 0);
    expect(out.map((e) => `${e.source}:${e.sourceHandle}>${e.target}`)).toEqual(["r:opt:0>b", "r:opt:1>c", "r:timeout>d", "x:opt:2>y"]);
    expect(removeReplyOption(edges, "r", 2).map((e) => e.target)).toEqual(["a", "b", "d", "y"]);
  });

  it("sanitizeGraph drops dangling links and links from outputs that no longer exist", () => {
    const g: FlowGraph = {
      nodes: [
        node("t", { kind: "trigger", trigger: "MANUAL", keywords: [], conditions: [] }),
        node("r", { kind: "waitReply", options: ["Yes"], timeoutMinutes: 60 }),
        node("a", { kind: "end" }),
      ],
      edges: [edge("t", "next", "r"), edge("r", "opt:0", "a"), edge("r", "opt:1", "a"), edge("r", "any", "gone"), edge("t", "next", "a")],
    };
    expect(sanitizeGraph(g).edges.map((e) => e.id)).toEqual(["t-next-r", "r-opt:0-a"]);
  });
});

describe("24-hour window warnings", () => {
  const tpl = [{ key: "welcome_ok", metaTemplateName: "welcome_v1" }, { key: "draft", metaTemplateName: null }];
  const msg = (body: string, templateKey: string | null = null, buttons: string[] = []): FlowNodeData => ({ kind: "message", templateKey, body, buttons });

  it("flags a free-text first message after a lead event", () => {
    const g: FlowGraph = {
      nodes: [node("t", { kind: "trigger", trigger: "LEAD_CREATED", keywords: [], conditions: [] }), node("m", msg("Hi"))],
      edges: [edge("t", "next", "m")],
    };
    const w = flowWarnings(g, tpl);
    expect(w).toHaveLength(1);
    expect(w[0].nodeId).toBe("m");
    expect(w[0].text).toMatch(/first message/i);
  });

  it("accepts an approved template first, but not an unapproved one", () => {
    const mk = (k: string): FlowGraph => ({
      nodes: [node("t", { kind: "trigger", trigger: "LEAD_CREATED", keywords: [], conditions: [] }), node("m", msg("", k))],
      edges: [edge("t", "next", "m")],
    });
    expect(flowWarnings(mk("welcome_ok"), tpl)).toEqual([]);
    expect(flowWarnings(mk("draft"), tpl)).toHaveLength(1);
  });

  it("keyword bots and replies open the window; long waits and reply timeouts close it", () => {
    const g: FlowGraph = {
      nodes: [
        node("t", { kind: "trigger", trigger: "KEYWORD", keywords: ["hi"], conditions: [] }),
        node("m1", msg("Menu", null, ["A", "B"])),
        node("r", { kind: "waitReply", options: ["A", "B"], timeoutMinutes: 1440 }),
        node("m2", msg("You chose A")),
        node("w", { kind: "wait", minutes: 2 * 1440 }),
        node("m3", msg("Two days later")),
        node("m4", msg("Nudge after no reply")),
      ],
      edges: [edge("t", "next", "m1"), edge("m1", "next", "r"), edge("r", "opt:0", "m2"), edge("m2", "next", "w"), edge("w", "next", "m3"), edge("r", "timeout", "m4")],
    };
    expect(flowWarnings(g, tpl).map((x) => x.nodeId).sort()).toEqual(["m3", "m4"]);
  });

  it("warns when buttons have no matching reply step", () => {
    const g: FlowGraph = {
      nodes: [
        node("t", { kind: "trigger", trigger: "KEYWORD", keywords: ["hi"], conditions: [] }),
        node("m", msg("Pick", null, ["Price", "Subsidy"])),
        node("r", { kind: "waitReply", options: ["Price"], timeoutMinutes: 60 }),
      ],
      edges: [edge("t", "next", "m"), edge("m", "next", "r")],
    };
    const w = flowWarnings(g, tpl);
    expect(w).toHaveLength(1);
    expect(w[0].text).toMatch(/Subsidy/);
  });

  it("the new-lead recipe asks for approved templates on its out-of-window messages", () => {
    const g = FLOW_RECIPES.find((r) => r.key === "new-lead")!.build();
    const flagged = flowWarnings(g, []).map((w) => w.nodeId);
    expect(flagged.length).toBeGreaterThan(0);
    const first = nextNodeId(g, g.nodes[0].id, "next");
    expect(flagged).toContain(first);
    // The menu bot answers a customer who just wrote, so it needs no templates.
    expect(flowWarnings(FLOW_RECIPES.find((r) => r.key === "menu-bot")!.build(), [])).toEqual([]);
  });
});

describe("rule overlap", () => {
  it("lead-created flows overlap with the welcome and qualification rules", () => {
    expect(overlappingRuleTriggers("LEAD_CREATED")).toEqual(expect.arrayContaining(["LEAD_CREATED", "LEAD_QUALIFIED"]));
    expect(overlappingRuleTriggers("KEYWORD")).toEqual(["WHATSAPP_RECEIVED"]);
    expect(overlappingRuleTriggers("MANUAL")).toEqual([]);
  });
  it("transactional messages are never skipped for a flow", () => {
    for (const t of ["APPOINTMENT_BOOKED", "APPOINTMENT_REMINDER", "QUOTATION_SENT", "QUOTATION_EXPIRING", "STAGE_CHANGED"]) expect(FLOW_OWNED_TRIGGERS).not.toContain(t);
    expect(FLOW_OWNED_TRIGGERS).toContain("LEAD_CREATED");
  });
});
