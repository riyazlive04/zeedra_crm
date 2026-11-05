import { describe, expect, it } from "vitest";
import {
  autoLayout, FLOW_RECIPES, isOptIn, isOptOut, matchReply, matchesKeyword, nextNodeId, nextSendTime, outputHandles, validateFlow,
  type FlowGraph,
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
