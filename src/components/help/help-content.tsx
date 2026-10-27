import type { ReactNode } from "react";
import type { RoleName } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/rbac";

export type HelpTopicKey =
  | "start" | "dashboard" | "leads" | "pipeline" | "appointments" | "tasks" | "whatsapp"
  | "field" | "quotations" | "tracking" | "projects" | "automations" | "calculator" | "team";

/** Same keys as NavPerms in components/shell.tsx. "always" topics show for every signed-in role. */
export type HelpPerm = "always" | "dashboard" | "leads" | "field" | "quotations" | "whatsapp" | "tracking" | "projects" | "automations" | "settings";

function P({ children }: { children: ReactNode }) {
  return <p className="text-[13.5px] leading-relaxed text-slate-700">{children}</p>;
}
function Steps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700">{children}</ol>;
}
function Bullets({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700">{children}</ul>;
}
function H({ children }: { children: ReactNode }) {
  return <h3 className="pt-1 text-sm font-semibold text-slate-900">{children}</h3>;
}
function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-sun-200 bg-sun-50/60 px-3 py-2 text-[13px] leading-relaxed text-amber-900">{children}</div>;
}

const START: Record<RoleName, ReactNode> = {
  OWNER: (
    <div className="space-y-3">
      <P>You run the whole workspace. You can see every lead, every quotation and every installation, and you are the only one who can see Billing.</P>
      <P>A good first week looks like this:</P>
      <Steps>
        <li>Go to <b>Settings → Team</b> and add your sales managers, tele-callers, field sales reps and installers.</li>
        <li>Check <b>Settings → Company</b>, <b>Pricing & subsidy</b> and <b>WhatsApp templates</b> so quotes and messages carry your real numbers and tone.</li>
        <li>Turn on WhatsApp and Google Calendar under <b>Settings → Integrations</b> so messages and appointments sync automatically.</li>
        <li>Open the <b>Dashboard</b> each morning. It is built to answer "what needs my attention today" in under a minute.</li>
      </Steps>
    </div>
  ),
  ADMIN: (
    <div className="space-y-3">
      <P>You have the same day-to-day access as the Owner, with one exception: Billing is Owner-only. Everything else, from leads to settings to the team list, is yours to manage.</P>
      <Steps>
        <li>Start on the <b>Dashboard</b> to see how the business is doing today.</li>
        <li>Use <b>Settings</b> to keep pricing, templates and the team list up to date.</li>
        <li>Step into <b>Leads</b>, <b>Quotations</b> or <b>Installations</b> whenever you need to help a deal move forward.</li>
      </Steps>
    </div>
  ),
  SALES_MANAGER: (
    <div className="space-y-3">
      <P>You run the sales team. You can see every lead, assign work, review field quotations and set up automations, but Settings and Billing stay with the Owner/Admin.</P>
      <Steps>
        <li>Check the <b>Dashboard</b> for today's hot leads, overdue follow-ups and your team's leaderboard.</li>
        <li>Use <b>Leads</b> and <b>Pipeline</b> to see who is working what, and reassign if someone is overloaded.</li>
        <li>Open <b>Quotations</b> and look for the <b>⚠ Flagged</b> tab. These are quotes your field team made somewhere GPS could not confirm, and they need your review.</li>
        <li>Visit <b>Field Tracking</b> to see where your field reps are and how reliable their check-ins have been.</li>
      </Steps>
    </div>
  ),
  TELECALLER: (
    <div className="space-y-3">
      <P>Your job is to pick up new leads fast, qualify them on the phone, and book a site visit for a field sales rep when a lead is ready.</P>
      <Steps>
        <li>Start on the <b>Dashboard</b>, then open <b>Leads</b> and sort by score to call the hottest ones first.</li>
        <li>Open a lead, fill in the <b>Qualification</b> tab as you talk to the customer, and save. The lead's score and temperature update right away.</li>
        <li>When a customer is ready, click <b>Book visit</b> to schedule a field sales visit.</li>
        <li>Check <b>Tasks</b> each day for follow-up calls that are due.</li>
      </Steps>
    </div>
  ),
  FIELD_SALES: (
    <div className="space-y-3">
      <P>You meet customers at their homes or offices. Most of your work happens in the <b>Field App</b>, which is built for your phone.</P>
      <Steps>
        <li>Open the <b>Field App</b> and tap <b>Start duty</b> so your manager can see you are out and about.</li>
        <li>For each visit: tap <b>Navigate</b> to get directions, then <b>Check in</b> once you are at the customer's site. This records your GPS location.</li>
        <li>After checking in, tap <b>Quote</b> to build the solar proposal on the spot and share it with the customer.</li>
        <li>When the visit is done, tap <b>Complete</b> and note the outcome.</li>
      </Steps>
      <Note>Always check in before building a quotation. Quotes created far from the customer's site get flagged for your manager to review.</Note>
    </div>
  ),
  INSTALLER: (
    <div className="space-y-3">
      <P>Once a deal is won, it becomes a project here for you to carry through installation, DISCOM approval and subsidy. <b>Installations</b> is the only page you need.</P>
      <Steps>
        <li>Open <b>Installations</b>. You will see every project assigned to you.</li>
        <li>Click a project to open it. Tick off each execution stage as you complete it, and tick the document checklist as paperwork comes in.</li>
        <li>Keep <b>Amount received</b> and the <b>PM Surya Ghar application number</b> up to date so the office always knows where the project stands.</li>
      </Steps>
    </div>
  ),
};

export const HELP_TOPICS: { key: HelpTopicKey; label: string; perm: HelpPerm; section?: string; body: ReactNode }[] = [
  { key: "start", label: "Getting started", perm: "always", body: null },

  {
    key: "dashboard",
    label: "Dashboard",
    perm: "dashboard",
    section: "Your workspace",
    body: (
      <div className="space-y-3">
        <P>The Dashboard is your home screen. It shows the numbers that matter today: new leads, hot leads still open, visits scheduled, pipeline value, and anything overdue.</P>
        <Bullets>
          <li>Click any stat tile, like <b>Hot leads open</b> or <b>Overdue follow-ups</b>, to jump straight to that filtered list.</li>
          <li>The charts below show new leads per day, your sales funnel, and where your leads are coming from.</li>
          <li><b>Upcoming appointments</b>, <b>Hot leads going cold</b> and <b>My tasks</b> on the right are your "do this next" list.</li>
          <li>Sales Managers, Admins and the Owner also see <b>Today&apos;s AI sales brief</b> and a <b>Team leaderboard</b> ranking the team by quotes, GPS-verified visits and deals won.</li>
        </Bullets>
      </div>
    ),
  },

  {
    key: "leads",
    label: "Leads",
    perm: "leads",
    body: (
      <div className="space-y-3">
        <P>Every enquiry your business receives lands here, whether it came from your website, Facebook, a walk-in, or was typed in by a tele-caller.</P>
        <H>Finding a lead</H>
        <P>Use the search box, or the Temperature, Stage, Source and Owner filters above the table, to narrow the list down. Click a lead's name to open it.</P>
        <H>Adding a lead by hand</H>
        <Steps>
          <li>Click <b>+ New lead</b> at the top right.</li>
          <li>Fill in the customer's name, phone number and basic details. If you know their monthly electricity bill, add it too as it helps size the system automatically.</li>
          <li>Click <b>Create lead</b>. The system scores the lead and sends a WhatsApp welcome message automatically.</li>
        </Steps>
        <H>Working a lead</H>
        <P>Open any lead to reach its full workspace: qualification questions, the AI sales co-pilot, WhatsApp chat, a timeline of everything that has happened, and buttons to book a visit, create a quotation, or mark the deal Won or Lost.</P>
        <Bullets>
          <li>The <b>Qualification</b> tab is where you record what the customer told you (electricity bill, roof type, timeline, budget, and so on). Save it to re-score the lead.</li>
          <li>The <b>AI sales co-pilot</b> card on the right (click <b>Analyse</b>) suggests what to do next, explains why the lead is hot or cold, and can draft a WhatsApp message for you.</li>
          <li>The <b>WhatsApp</b> tab shows your full conversation with the customer and lets you send messages or templates without leaving the lead.</li>
          <li>The <b>Timeline</b> tab logs every call, note, message and stage change automatically, so you never lose context.</li>
        </Bullets>
        <Note>Tele-callers and Field Sales reps only see leads assigned to them. Owners, Admins and Sales Managers see every lead in the organisation.</Note>
      </div>
    ),
  },

  {
    key: "pipeline",
    label: "Pipeline",
    perm: "leads",
    body: (
      <div className="space-y-3">
        <P>Pipeline shows every open deal as cards on a board, grouped by stage, from New all the way to Won or Lost.</P>
        <Bullets>
          <li>Drag a card from one column to another to move it to a new stage.</li>
          <li>Click a card to open the full lead.</li>
          <li>Use this page to get a quick visual sense of how much business is in each stage, and to spot deals that have been sitting too long.</li>
        </Bullets>
      </div>
    ),
  },

  {
    key: "appointments",
    label: "Appointments",
    perm: "leads",
    body: (
      <div className="space-y-3">
        <P>Appointments is your team's weekly calendar of site visits, quotation meetings and installation visits.</P>
        <Bullets>
          <li>You book a new appointment from inside a lead, by clicking <b>Book visit</b>, not from this page directly.</li>
          <li>Pick a visit type, the salesperson, and a day and time. Available slots are shown automatically based on working hours and travel time between visits.</li>
          <li>If a salesperson has connected their Google Calendar (from their profile), the appointment is added there too and reminders go out 24 hours and 2 hours before the visit.</li>
        </Bullets>
      </div>
    ),
  },

  {
    key: "tasks",
    label: "Tasks",
    perm: "leads",
    body: (
      <div className="space-y-3">
        <P>Tasks is your follow-up to-do list. Most tasks are created automatically (for example, "call back in 2 days"), but you can also add your own from a lead's Timeline tab.</P>
        <P>Sales Managers, Admins and the Owner can switch between <b>Show only mine</b> and <b>Show whole team</b> to see what everyone is working on.</P>
      </div>
    ),
  },

  {
    key: "whatsapp",
    label: "WhatsApp",
    perm: "whatsapp",
    body: (
      <div className="space-y-3">
        <P>This is your WhatsApp inbox: every conversation with every customer you can see, automated and manual, in one place.</P>
        <Bullets>
          <li>Click a conversation on the left to open it and reply.</li>
          <li>Use saved templates for common replies instead of typing them out each time. Manage templates under <b>Settings → WhatsApp templates</b> (Owner/Admin only).</li>
          <li>Automated messages, like the welcome message on a new lead or a reminder before a visit, also show up here so you always have the full picture.</li>
        </Bullets>
      </div>
    ),
  },

  {
    key: "field",
    label: "Field App",
    perm: "field",
    section: "On site",
    body: (
      <div className="space-y-3">
        <P>The Field App is a simple, phone-friendly screen built for visiting customers. It lists today's, tomorrow's and later visits as cards.</P>
        <Steps>
          <li>Tap <b>Start duty</b> at the top when you begin your day. This lets your manager see you are out in the field.</li>
          <li>For each visit card, tap <b>Navigate</b> for directions or <b>Call</b> to ring the customer.</li>
          <li>Tap <b>Check in</b> once you arrive. The app records your GPS location and checks it against the customer's address.</li>
          <li>After checking in, tap <b>Quote</b> to open the on-site quotation builder for that customer.</li>
          <li>When you are done, tap <b>Complete</b>, note the outcome, and tick off what you handed the customer (quotation PDF, visiting card, brochure, and so on).</li>
        </Steps>
      </div>
    ),
  },

  {
    key: "quotations",
    label: "Quotations",
    perm: "quotations",
    body: (
      <div className="space-y-3">
        <P>Every solar proposal you have created lives here, with its status, system size, price and whether its location could be verified.</P>
        <Bullets>
          <li>Use the <b>⚠ Flagged</b> tab to find quotes that could not be confirmed as created at the customer's site. Sales Managers and above can review these and approve or reject the flag.</li>
          <li>Open a quotation to print it, copy a shareable customer link, resend it on WhatsApp, or record whether the customer accepted it.</li>
          <li>From a lead's page, click <b>Quotation</b> to start a new one for that customer. Field Sales reps are taken to the on-site builder (which needs a GPS check); Sales Managers, Admins and the Owner can also create quotes directly from the office.</li>
          <li>Sales Managers, Admins and the Owner can also click <b>+ New quotation</b> on this page to quote someone who isn't a lead yet. Fill in their name, phone and bill, and a lead is created for them automatically. If that phone number already exists, the quote is simply added to their existing lead.</li>
          <li>Need to change a price after it was already sent? Open the quotation and click <b>Revise</b>. The original is kept exactly as it was (useful if a manager already reviewed it); the new version carries the same quote number with a revision mark, and a <b>Version history</b> list shows every revision.</li>
        </Bullets>
      </div>
    ),
  },

  {
    key: "tracking",
    label: "Field Tracking",
    perm: "tracking",
    body: (
      <div className="space-y-3">
        <P>Field Tracking is a live map of your field sales team: where they are, how many check-ins they have done today, and how trustworthy their quotations are.</P>
        <P>Use it to spot a rep who has gone quiet, or to review a quotation that was flagged because it was created far from the customer's address or outside the booked time slot.</P>
      </div>
    ),
  },

  {
    key: "projects",
    label: "Installations",
    perm: "projects",
    section: "After the sale",
    body: (
      <div className="space-y-3">
        <P>When a deal is marked Won, it automatically becomes a project here, tracked from booking all the way to subsidy credit.</P>
        <Steps>
          <li>Click a project card to open it.</li>
          <li>Tick off each stage in <b>Execution stages</b> as it is completed, for example Documentation, DISCOM feasibility, Installation, Net-meter applied, and so on.</li>
          <li>Tick items in the <b>Documents & compliance</b> checklist as paperwork is collected.</li>
          <li>Keep <b>Amount received</b>, the <b>PM Surya Ghar application number</b> and the <b>Net-meter number</b> filled in so everyone can see where the project stands.</li>
        </Steps>
        <P>Installers only see the projects assigned to them. Owners, Admins and Sales Managers see every project and can set who is responsible for each stage under <b>Settings → Project workflow</b>.</P>
      </div>
    ),
  },

  {
    key: "automations",
    label: "Automations",
    perm: "automations",
    body: (
      <div className="space-y-3">
        <P>Automations are simple rules that run your sales playbook for you, in plain "WHEN this happens, IF these conditions are true, THEN do this" cards.</P>
        <Bullets>
          <li>For example: WHEN a lead is created, THEN send a WhatsApp welcome message. Or: WHEN a lead has had no contact for 2 days AND is marked Hot, THEN alert the Sales Manager.</li>
          <li>Turn any rule on or off with its switch. Click a rule to edit it.</li>
          <li>If a rule fails to run, you will see a red note on its card explaining what went wrong.</li>
        </Bullets>
      </div>
    ),
  },

  {
    key: "calculator",
    label: "Solar Calculator",
    perm: "leads",
    body: (
      <div className="space-y-3">
        <P>A quick, no-lead-needed calculator for use live on a call or in a first meeting. Enter a customer's monthly electricity bill and instantly see the recommended system size, PM Surya Ghar subsidy, monthly savings and EMI options.</P>
      </div>
    ),
  },

  {
    key: "team",
    label: "Team & settings",
    perm: "settings",
    section: "Admin",
    body: (
      <div className="space-y-3">
        <P>Settings is where you configure how the business runs. Owners and Admins see every tab; everyone else only sees their own profile.</P>
        <Bullets>
          <li><b>Company</b>: your business name, contact details and logo, shown on proposals and WhatsApp messages.</li>
          <li><b>Pricing & subsidy</b>, <b>Qualification</b>, <b>GPS validation</b> and <b>Scheduling</b>: the numbers and rules that drive every quotation, lead score and appointment slot. This includes the panel rate and per-component build costs every quote is priced from, an optional company margin, and (for Tamil Nadu) a switch to price bills using the exact TNEB bi-monthly slab table instead of a flat average rate.</li>
          <li><b>Project workflow</b>: who is responsible for each installation stage, and the default task created when a project reaches it.</li>
          <li><b>Team</b>: click <b>Add user</b> to invite a new team member. Give them a name, email, role and a temporary password, then share it with them. You can change anyone's role or deactivate them from the same screen.</li>
          <li><b>WhatsApp templates</b>: reusable message templates your team can send with one click.</li>
          <li><b>Integrations</b>: connect WhatsApp Cloud API, Google Calendar and the lead-capture webhook used by your website and ad forms.</li>
          <li><b>Billing & plan</b>: visible to the Owner only, this is where you manage your subscription.</li>
          <li><b>My profile</b>: available to everyone from the person icon in the top right. Update your own details, connect your personal Google Calendar, change your password, or set a quick PIN so you can sign in faster next time.</li>
        </Bullets>
      </div>
    ),
  },
];

export function getStartContent(role: RoleName) {
  return START[role];
}

export function roleWelcomeLine(role: RoleName) {
  return `You are signed in as ${ROLE_LABEL[role]}. This guide only shows the pages you have access to.`;
}
