"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isPast, isToday } from "date-fns";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "./ui";
import { api } from "@/lib/client";
import { useToast } from "./toast";

export interface TaskItem {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
  priority: string;
  lead: { id: string; name: string; phone: string } | null;
  assignedTo: { name: string } | null;
}

export function TasksBoard({ tasks, showAssignee }: { tasks: TaskItem[]; showAssignee: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(tasks);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(format(new Date(Date.now() + 3_600_000), "yyyy-MM-dd'T'HH:mm"));
  const [adding, setAdding] = useState(false);

  async function toggle(t: TaskItem) {
    setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await api("/api/tasks", { method: "PATCH", body: { id: t.id, done: !t.done } });
      if (!t.done) toast.success("Task done ✓");
    } catch (e) {
      setItems((xs) => xs.map((x) => (x.id === t.id ? t : x)));
      toast.error("Could not update", e instanceof Error ? e.message : undefined);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      await api("/api/tasks", { body: { title: title.trim(), dueAt: new Date(due).toISOString() } });
      setTitle("");
      router.refresh();
    } catch (err) {
      toast.error("Could not add task", err instanceof Error ? err.message : undefined);
    } finally {
      setAdding(false);
    }
  }

  const open = items.filter((t) => !t.done);
  const groups = [
    { label: "Overdue", tone: "text-rose-600", items: open.filter((t) => isPast(new Date(t.dueAt)) && !isToday(new Date(t.dueAt))) },
    { label: "Today", tone: "text-sun-700", items: open.filter((t) => isToday(new Date(t.dueAt))) },
    { label: "Upcoming", tone: "text-slate-600", items: open.filter((t) => !isPast(new Date(t.dueAt)) && !isToday(new Date(t.dueAt))) },
    { label: "Completed", tone: "text-emerald-700", items: items.filter((t) => t.done) },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input className="input min-w-[14rem] flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task — e.g. Call Ravi about loan documents" />
          <input type="datetime-local" className="input w-auto" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button variant="primary" loading={adding}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      </Card>
      {items.length === 0 && (
        <Card>
          <EmptyState title="No tasks" body="Automations create follow-up tasks for new and hot leads automatically." />
        </Card>
      )}
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <Card key={g.label}>
              <div className={clsx("border-b border-slate-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide", g.tone)}>
                {g.label} · {g.items.length}
              </div>
              <ul className="divide-y divide-slate-100">
                {g.items.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <input type="checkbox" checked={t.done} onChange={() => toggle(t)} className="h-4 w-4 accent-amber-500" aria-label="Mark done" />
                    <div className="min-w-0 flex-1">
                      <div className={clsx("text-sm", t.done ? "text-slate-400 line-through" : "text-slate-800")}>{t.title}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {format(new Date(t.dueAt), "EEE d MMM, h:mm a")}
                        {t.lead && (
                          <Link href={`/leads/${t.lead.id}`} className="font-medium text-sun-700 hover:underline">
                            {t.lead.name}
                          </Link>
                        )}
                        {showAssignee && t.assignedTo && <span>· {t.assignedTo.name}</span>}
                      </div>
                    </div>
                    {t.priority === "HIGH" && !t.done && <Badge tone="rose">High</Badge>}
                    {t.lead && !t.done && (
                      <a href={`tel:+${t.lead.phone}`} className="text-xs font-medium text-emerald-700 hover:underline">
                        Call
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ),
      )}
    </div>
  );
}
