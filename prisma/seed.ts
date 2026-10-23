/* Demo tenant: a realistic Chennai rooftop-solar EPC with a full sales funnel. */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { provisionOrganization } from "../src/lib/services/tenant";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { basicQualification, salesScore } from "../src/lib/qualification";
import { sizeSystem } from "../src/lib/solar/sizing";
import { loanPlan } from "../src/lib/solar/finance";
import { buildLineItems, DEFAULT_TERMS } from "../src/lib/solar/quote";
import { haversineM } from "../src/lib/geo";
import { PROJECT_STAGES } from "../src/lib/defaults";

const db = new PrismaClient();
const S = DEFAULT_SETTINGS;
const DEMO_PASSWORD = "Demo@12345";

let seed = 20261022;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const jitter = (v: number, m: number) => v + (rnd() - 0.5) * (m / 55_000);

const AREAS = [
  { name: "Anna Nagar", lat: 13.085, lng: 80.2101, pin: "600040" },
  { name: "Adyar", lat: 13.0012, lng: 80.2565, pin: "600020" },
  { name: "Velachery", lat: 12.9815, lng: 80.218, pin: "600042" },
  { name: "T. Nagar", lat: 13.0418, lng: 80.2341, pin: "600017" },
  { name: "Tambaram", lat: 12.9249, lng: 80.1, pin: "600045" },
  { name: "Porur", lat: 13.0382, lng: 80.1565, pin: "600116" },
  { name: "Sholinganallur", lat: 12.901, lng: 80.2279, pin: "600119" },
  { name: "Mylapore", lat: 13.0368, lng: 80.2676, pin: "600004" },
  { name: "Perambur", lat: 13.121, lng: 80.2329, pin: "600011" },
  { name: "Chromepet", lat: 12.9516, lng: 80.1462, pin: "600044" },
  { name: "Avadi", lat: 13.1067, lng: 80.097, pin: "600054" },
  { name: "Medavakkam", lat: 12.9171, lng: 80.1923, pin: "600100" },
  { name: "Ambattur", lat: 13.1143, lng: 80.1548, pin: "600053" },
  { name: "Guindy", lat: 13.0067, lng: 80.2206, pin: "600032" },
];
const FIRST = ["Ravi", "Lakshmi", "Karthik", "Priya", "Suresh", "Divya", "Arjun", "Meena", "Vignesh", "Anitha", "Senthil", "Kavya", "Prakash", "Revathi", "Ganesh", "Deepa", "Mohan", "Sangeetha", "Balaji", "Nithya", "Rajesh", "Swathi", "Harish", "Gayathri", "Murali", "Pooja", "Sathish", "Janani", "Ashok", "Bhavani"];
const LAST = ["Kumar", "Subramanian", "Raman", "Iyer", "Natarajan", "Krishnan", "Pillai", "Venkatesh", "Shankar", "Rajan", "Balasubramanian", "Sundaram", "Murthy", "Reddy", "Nair"];
const STREETS = ["2nd Main Road", "Gandhi Street", "Nehru Nagar 4th Cross", "Bharathi Salai", "Kamarajar Street", "Temple View Avenue", "Lake View Road", "VOC Street", "Thiruvalluvar Nagar", "Rajaji Road"];
const SOURCES = ["WEBSITE", "FACEBOOK", "GOOGLE_ADS", "WHATSAPP", "REFERRAL", "INSTAGRAM", "JUSTDIAL", "WALK_IN", "CHANNEL_PARTNER"] as const;

async function main() {
  console.log("Resetting demo dataâ€¦");
  // Remove the demo tenant so the seed can be re-run safely.
  await db.organization.deleteMany({ where: { slug: "zeedra-solar" } });
  await db.automationRun.deleteMany({});

  const { org, owner } = await provisionOrganization(db, {
    orgName: "Zeedra Solar Solutions",
    ownerName: "Faiz",
    email: "owner@zeedra.demo",
    phone: "919840012345",
    password: DEMO_PASSWORD,
  });
  await db.organization.update({
    where: { id: org.id },
    data: { slug: "zeedra-solar", address: "No. 12, Mount Road, Guindy, Chennai 600032", gstin: "33ABCDE1234F1Z5" },
  });

  const hash = await bcrypt.hash(DEMO_PASSWORD, 11);
  const mk = (name: string, email: string, role: Prisma.UserCreateManyInput["role"], color: string, territory?: string, phone?: string) =>
    db.user.create({
      data: { organizationId: org.id, name, email, role, avatarColor: color, passwordHash: hash, territory, phone: phone ?? `9198400${Math.floor(10000 + rnd() * 89999)}` },
    });
  const manager = await mk("Divya Raghavan", "manager@zeedra.demo", "SALES_MANAGER", "#6366f1");
  const tc1 = await mk("Anitha Joseph", "telecaller@zeedra.demo", "TELECALLER", "#ec4899");
  const tc2 = await mk("Farhan Ali", "farhan@zeedra.demo", "TELECALLER", "#14b8a6");
  const fs1 = await mk("Arun Prakash", "field@zeedra.demo", "FIELD_SALES", "#22c55e", "South Chennai", "919840055501");
  const fs2 = await mk("Karthik Selvam", "karthik@zeedra.demo", "FIELD_SALES", "#3b82f6", "West Chennai", "919840055502");
  const fs3 = await mk("Vijay Anand", "vijay@zeedra.demo", "FIELD_SALES", "#f97316", "North Chennai", "919840055503");
  const installer = await mk("Ramesh Babu", "installer@zeedra.demo", "INSTALLER", "#a855f7");
  const field = [fs1, fs2, fs3];
  const tcs = [tc1, tc2];

  const now = new Date();
  const day = 86_400_000;
  const todayAt = (h: number, m = 0, offsetDays = 0) => {
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return new Date(d.getTime() + offsetDays * day);
  };

  type StagePlan = { stage: Prisma.LeadCreateInput["stage"]; n: number };
  const plan: StagePlan[] = [
    { stage: "NEW", n: 12 },
    { stage: "CONTACTED", n: 9 },
    { stage: "QUALIFIED", n: 10 },
    { stage: "SITE_VISIT_SCHEDULED", n: 8 },
    { stage: "SITE_VISIT_DONE", n: 5 },
    { stage: "QUOTATION_SENT", n: 8 },
    { stage: "NEGOTIATION", n: 5 },
    { stage: "WON", n: 9 },
    { stage: "LOST", n: 4 },
    { stage: "DISQUALIFIED", n: 4 },
  ];

  let codeN = 0;
  let quoteN = 0;
  let projectN = 0;
  const leads: { id: string; stage: string; lat: number; lng: number; fieldUser: (typeof field)[number]; name: string; phone: string }[] = [];

  for (const p of plan) {
    for (let i = 0; i < p.n; i++) {
      const area = pick(AREAS);
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const isComm = rnd() < 0.12;
      const segment = isComm ? pick(["COMMERCIAL", "INDUSTRIAL"] as const) : rnd() < 0.08 ? "HOUSING_SOCIETY" : "RESIDENTIAL";
      const disq = p.stage === "DISQUALIFIED";
      const bill = disq ? Math.round(between(400, 1000)) : segment === "RESIDENTIAL" ? Math.round(between(1500, 7500) / 10) * 10 : Math.round(between(15000, 90000) / 100) * 100;
      const owns = disq ? rnd() < 0.5 : true;
      const late = ["NEW", "CONTACTED"].includes(p.stage!);
      const advanced = ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "QUOTATION_SENT", "NEGOTIATION", "WON"].includes(p.stage!);
      const createdAt = new Date(now.getTime() - (late ? between(0, 6) : advanced ? between(8, 40) : between(3, 20)) * day);
      const fieldUser = field.find((f) => f.territory?.startsWith(["Adyar", "Velachery", "Sholinganallur", "Medavakkam", "Guindy", "Mylapore", "Chromepet", "Tambaram"].includes(area.name) ? "South" : ["Porur", "Ambattur", "Avadi"].includes(area.name) ? "West" : "North")) ?? fs1;
      const lat = jitter(area.lat, 1500);
      const lng = jitter(area.lng, 1500);

      const qual = {
        segment,
        monthlyBill: late && rnd() < 0.4 ? null : bill,
        ownsProperty: late && rnd() < 0.4 ? null : owns,
        roofType: pick(["RCC", "RCC", "RCC", "METAL_SHEET", "TILED"] as const),
        roofAreaSqft: Math.round(between(350, 1600)),
        shadowFree: rnd() < 0.8,
        siteVisitReady: advanced ? true : late ? null : rnd() < 0.6,
        installationTimeline: advanced ? pick(["IMMEDIATE", "WITHIN_1_MONTH"] as const) : late ? null : pick(["WITHIN_1_MONTH", "ONE_TO_3_MONTHS", "THREE_TO_6_MONTHS", "EXPLORING"] as const),
        paymentMode: advanced ? pick(["CASH", "LOAN", "PARTIAL_LOAN"] as const) : late ? null : pick(["CASH", "LOAN", "UNDECIDED"] as const),
        loanStatus: null as string | null,
        budgetConfirmed: advanced && rnd() < 0.5,
        objection: p.stage === "NEGOTIATION" ? pick(["PRICE", "FAMILY_DECISION", "COMPETITOR"] as const) : p.stage === "QUALIFIED" && rnd() < 0.3 ? "FINANCE" : "NONE",
        decisionMakerMet: advanced ? rnd() < 0.8 : null,
        lastContactAt: new Date(Math.min(now.getTime(), createdAt.getTime() + between(0, 3) * day)),
      };
      if (qual.paymentMode === "LOAN" || qual.paymentMode === "PARTIAL_LOAN") qual.loanStatus = pick(["DOCS_PENDING", "APPLIED", "SANCTIONED"]);
      const basic = basicQualification(qual, S);
      const sc = salesScore(qual, S, basic, now);
      const sz = qual.monthlyBill ? sizeSystem({ monthlyBill: qual.monthlyBill, segment, roofAreaSqft: qual.roofAreaSqft }, S) : null;
      const assignedTo = advanced || p.stage === "WON" ? fieldUser : pick(tcs);
      const phone = `91${pick(["98", "97", "94", "90", "88", "73"])}${String(Math.floor(rnd() * 1e8)).padStart(8, "0")}`;

      const lead = await db.lead.create({
        data: {
          organizationId: org.id,
          code: `LD-${String(++codeN).padStart(5, "0")}`,
          name: segment === "COMMERCIAL" ? `${pick(["Sri Murugan", "Annai", "Lotus", "Green Valley", "Royal"])} ${pick(["Textiles", "Hospital", "Hotels", "Supermarket", "School"])}` : segment === "INDUSTRIAL" ? `${pick(["Precision", "Chennai", "Delta"])} ${pick(["Auto Components", "Plastics", "Engineering"])}` : segment === "HOUSING_SOCIETY" ? `${pick(["Ramaniyam", "Casagrand", "Appaswamy"])} Residents Welfare Assn` : name,
          phone,
          email: rnd() < 0.5 ? `${name.split(" ")[0].toLowerCase()}${Math.floor(rnd() * 99)}@gmail.com` : null,
          source: pick(SOURCES),
          campaign: rnd() < 0.4 ? pick(["Diwali Solar Offer", "PM Surya Ghar Awareness", "Chennai Rooftop Q4"]) : null,
          segment,
          address: `${Math.floor(between(1, 120))}, ${pick(STREETS)}, ${area.name}`,
          city: "Chennai",
          district: "Chennai",
          state: "Tamil Nadu",
          pincode: area.pin,
          lat,
          lng,
          sitePinned: advanced,
          stage: p.stage,
          temperature: p.stage === "WON" ? "HOT" : sc.temperature,
          score: sc.score,
          scoreBreakdown: { breakdown: sc.breakdown, nextActions: sc.nextActions, missing: basic.missing } as unknown as Prisma.InputJsonValue,
          monthlyBill: qual.monthlyBill,
          monthlyUnits: qual.monthlyBill ? Math.round((qual.monthlyBill - S.fixedChargesMonthly) / S.tariffPerUnit) : null,
          discom: "TNPDCL",
          consumerNumber: qual.monthlyBill ? `0${Math.floor(between(1, 9))}-${Math.floor(between(100, 999))}-${Math.floor(between(1000, 9999))}` : null,
          sanctionedLoadKw: segment === "RESIDENTIAL" ? pick([3, 4, 5, 6, 8]) : pick([20, 35, 50, 75]),
          phase: segment === "RESIDENTIAL" ? pick(["SINGLE", "THREE"]) : "THREE",
          ownsProperty: qual.ownsProperty,
          roofType: qual.roofType,
          roofAreaSqft: qual.roofAreaSqft,
          shadowFree: qual.shadowFree,
          floors: Math.floor(between(1, 4)),
          basicQualified: basic.status === "INCOMPLETE" ? null : basic.status === "QUALIFIED",
          basicCheckReason: [...basic.reasons, ...basic.warnings].join(" ") || null,
          siteVisitReady: qual.siteVisitReady,
          installationTimeline: qual.installationTimeline,
          paymentMode: qual.paymentMode,
          loanInterest: qual.paymentMode === "LOAN" || qual.paymentMode === "PARTIAL_LOAN",
          loanStatus: qual.loanStatus,
          budgetConfirmed: qual.budgetConfirmed,
          objection: qual.objection as Prisma.LeadCreateInput["objection"],
          decisionMakerMet: qual.decisionMakerMet,
          recommendedKw: sz?.recommendedKw,
          estimatedCost: sz?.totalCost,
          subsidyAmount: sz?.subsidy,
          assignedToId: assignedTo.id,
          createdById: pick(tcs).id,
          nextFollowUpAt: ["WON", "LOST", "DISQUALIFIED"].includes(p.stage!) ? null : new Date(now.getTime() + between(-1, 4) * day),
          lastContactAt: qual.lastContactAt,
          lostReason: p.stage === "LOST" ? pick(["Went with a cheaper local installer", "Postponed â€” family decision", "Loan not sanctioned", "Roof renovation planned next year"]) : null,
          wonAt: p.stage === "WON" ? new Date(createdAt.getTime() + between(5, 20) * day) : null,
          dealValue: p.stage === "WON" ? sz?.totalCost : null,
          createdAt,
        },
      });
      leads.push({ id: lead.id, stage: p.stage!, lat, lng, fieldUser, name: lead.name, phone });

      await db.activity.create({ data: { organizationId: org.id, leadId: lead.id, type: "SYSTEM", title: `Lead created from ${lead.source.replace(/_/g, " ").toLowerCase()}`, createdAt } });
      if (!late) {
        await db.whatsAppMessage.createMany({
          data: [
            { organizationId: org.id, leadId: lead.id, phone, direction: "OUT", body: `Namaste ${name.split(" ")[0]} ðŸ™ Thank you for your interest in rooftop solar with Zeedra Solar Solutions! Could you share a photo of your latest EB bill? â˜€ï¸`, status: "READ", automated: true, templateKey: "welcome", createdAt: new Date(createdAt.getTime() + 60_000) },
            { organizationId: org.id, leadId: lead.id, phone, direction: "IN", body: pick(["Sure, sending the bill now", "Hi, my bill is around " + bill + " per month", "What is the cost for 3kW?", "Is subsidy available in Chennai?", "Ok please call me in the evening"]), status: "RECEIVED", createdAt: new Date(createdAt.getTime() + 3_600_000) },
          ],
        });
        await db.activity.create({ data: { organizationId: org.id, leadId: lead.id, type: "QUALIFICATION", title: `Scored ${sc.score} â€” ${sc.temperature}`, createdAt: new Date(createdAt.getTime() + 2 * 3_600_000) } });
      }

      // Appointments, quotations and projects for later stages
      if (advanced || p.stage === "LOST") {
        const isSched = p.stage === "SITE_VISIT_SCHEDULED";
        const start = isSched ? todayAt(pick([10, 11, 12, 15, 16, 17]), pick([0, 30]), pick([0, 0, 1, 1, 2])) : new Date(createdAt.getTime() + between(2, 5) * day);
        const appt = await db.appointment.create({
          data: {
            organizationId: org.id,
            leadId: lead.id,
            assignedToId: fieldUser.id,
            type: "SITE_VISIT",
            status: isSched ? "SCHEDULED" : "COMPLETED",
            startAt: start,
            endAt: new Date(start.getTime() + 3_600_000),
            address: lead.address,
            notes: isSched ? "Customer prefers morning; bring sample panel brochure." : null,
            outcome: isSched ? null : "Roof inspected, shadow-free south-facing area confirmed.",
            checkInAt: isSched ? null : new Date(start.getTime() + 5 * 60_000),
            checkInLat: isSched ? null : jitter(lat, 40),
            checkInLng: isSched ? null : jitter(lng, 40),
            checkInAccuracy: isSched ? null : Math.round(between(6, 25)),
            checkInDistanceM: isSched ? null : Math.round(between(8, 60)),
            checkInVerdict: isSched ? null : "VERIFIED",
            checkOutAt: isSched ? null : new Date(start.getTime() + 55 * 60_000),
          },
        });

        if (["QUOTATION_SENT", "NEGOTIATION", "WON", "LOST"].includes(p.stage!) && sz) {
          const kind = rnd();
          const verdict = kind < 0.68 ? "VERIFIED" : kind < 0.8 ? "OUT_OF_RANGE" : kind < 0.88 ? "TIME_MISMATCH" : kind < 0.94 ? "OFFICE_CREATED" : "CLOCK_TAMPER";
          const capLat = verdict === "OUT_OF_RANGE" ? lat + 0.016 : jitter(lat, 30);
          const capLng = verdict === "OUT_OF_RANGE" ? lng - 0.009 : jitter(lng, 30);
          const capturedAt = verdict === "TIME_MISMATCH" ? new Date(appt.endAt.getTime() + 7 * 3_600_000) : new Date(appt.startAt.getTime() + 35 * 60_000);
          const loan = qual.paymentMode !== "CASH" ? loanPlan(sz.netCost, sz.monthlySavings, S.loanRatePct, S.loanTenureMonths, S.loanDownPaymentPct) : null;
          const distance = verdict === "OFFICE_CREATED" ? null : Math.round(haversineM({ lat: capLat, lng: capLng }, { lat, lng }));
          const brand = { panelBrand: pick(S.panelBrands), panelWattage: 550, inverterBrand: pick(S.inverterBrands) };
          const q = await db.quotation.create({
            data: {
              organizationId: org.id,
              number: `QT-${now.getFullYear()}-${String(++quoteN).padStart(5, "0")}`,
              leadId: lead.id,
              createdById: fieldUser.id,
              appointmentId: appt.id,
              status: p.stage === "WON" ? "ACCEPTED" : p.stage === "LOST" ? "REJECTED" : "SENT",
              systemKw: sz.recommendedKw,
              ...brand,
              panelCount: sz.panelCount,
              inverterKw: sz.inverterKw,
              lineItems: buildLineItems(sz, brand, S.bomRates) as unknown as Prisma.InputJsonValue,
              subtotal: sz.subtotal,
              gstRate: S.gstRate,
              gstAmount: sz.gstAmount,
              totalAmount: sz.totalCost,
              subsidyAmount: sz.subsidy,
              netCost: sz.netCost,
              loanAmount: loan?.loanAmount,
              loanRate: loan?.ratePct,
              loanTenureMonths: loan?.tenureMonths,
              emi: loan?.emi,
              annualGenerationKwh: sz.annualGenerationKwh,
              annualSavings: sz.annualSavings,
              paybackYears: sz.paybackYears,
              savings25Years: sz.savings25Years,
              co2TonnesPerYear: sz.co2TonnesPerYear,
              validUntil: new Date(capturedAt.getTime() + S.quotationValidityDays * day),
              terms: DEFAULT_TERMS,
              capturedLat: verdict === "OFFICE_CREATED" ? null : capLat,
              capturedLng: verdict === "OFFICE_CREATED" ? null : capLng,
              capturedAccuracyM: verdict === "OFFICE_CREATED" ? null : Math.round(between(5, 30)),
              deviceTime: verdict === "CLOCK_TAMPER" ? new Date(capturedAt.getTime() - 47 * 60_000) : capturedAt,
              serverTime: capturedAt,
              distanceFromSiteM: distance,
              geoVerdict: verdict,
              geoFlags: verdict === "VERIFIED" || verdict === "OFFICE_CREATED" ? undefined : ({ flags: [verdict], checks: [] } as unknown as Prisma.InputJsonValue),
              deviceInfo: "Android 15 Â· Chrome 141",
              sentAt: capturedAt,
              acceptedAt: p.stage === "WON" ? new Date(capturedAt.getTime() + 2 * day) : null,
              createdAt: capturedAt,
            },
          });
          if (verdict !== "OFFICE_CREATED")
            await db.locationPing.create({ data: { organizationId: org.id, userId: fieldUser.id, lat: capLat, lng: capLng, accuracyM: 12, source: "QUOTATION", refId: q.id, createdAt: capturedAt } });
          await db.activity.create({
            data: { organizationId: org.id, leadId: lead.id, userId: fieldUser.id, type: "QUOTATION", title: `Quotation ${q.number} Â· ${sz.recommendedKw} kW Â· â‚¹${sz.netCost.toLocaleString("en-IN")} net`, body: `Location check: ${verdict.replace(/_/g, " ").toLowerCase()}`, createdAt: capturedAt },
          });

          if (p.stage === "WON") {
            const stageIdx = Math.floor(between(0, PROJECT_STAGES.length - 1));
            const history = PROJECT_STAGES.slice(0, stageIdx + 1).map((s, k) => ({ stage: s.key, at: new Date(capturedAt.getTime() + (k + 2) * 3 * day).toISOString(), by: manager.name }));
            await db.project.create({
              data: {
                organizationId: org.id,
                leadId: lead.id,
                code: `PRJ-${String(++projectN).padStart(4, "0")}`,
                stage: PROJECT_STAGES[stageIdx].key,
                systemKw: sz.recommendedKw,
                contractValue: sz.totalCost,
                amountReceived: Math.round(sz.totalCost * Math.min(1, 0.3 + stageIdx * 0.08)),
                managerId: stageIdx > 5 ? installer.id : manager.id,
                portalAppId: stageIdx >= 2 ? `PMSG-TN-${Math.floor(between(100000, 999999))}` : null,
                stageHistory: history as unknown as Prisma.InputJsonValue,
                checklist: { aadhaar: true, ebBill: true, bankPassbook: stageIdx > 0, propertyProof: stageIdx > 0, roofPhotos: true, agreement: true, portalApplication: stageIdx >= 2, feasibilityLetter: stageIdx >= 3 } as Prisma.InputJsonValue,
              },
            });
          }
        }
      }
    }
  }

  // Today's agenda for the demo field salesperson (Arun): one done, one now, one later.
  const arunLeads = await db.lead.findMany({ where: { organizationId: org.id, stage: "QUALIFIED" }, take: 3 });
  const slots = [
    { h: now.getHours() - 2, status: "COMPLETED" as const },
    { h: now.getHours(), status: "SCHEDULED" as const },
    { h: now.getHours() + 3, status: "SCHEDULED" as const },
  ];
  for (let i = 0; i < arunLeads.length; i++) {
    const l = arunLeads[i];
    const start = todayAt(Math.max(8, Math.min(slots[i].h, 20)), 0);
    await db.lead.update({ where: { id: l.id }, data: { assignedToId: fs1.id, stage: i === 0 ? "SITE_VISIT_DONE" : "SITE_VISIT_SCHEDULED", sitePinned: true, siteVisitReady: true, temperature: "HOT", score: 78 } });
    await db.appointment.create({
      data: {
        organizationId: org.id,
        leadId: l.id,
        assignedToId: fs1.id,
        type: "SITE_VISIT",
        status: slots[i].status,
        startAt: start,
        endAt: new Date(start.getTime() + 3_600_000),
        address: l.address,
        notes: "Customer wants EMI options explained.",
        ...(slots[i].status === "COMPLETED"
          ? { checkInAt: new Date(start.getTime() + 4 * 60_000), checkInLat: l.lat, checkInLng: l.lng, checkInAccuracy: 9, checkInDistanceM: 14, checkInVerdict: "VERIFIED", checkOutAt: new Date(start.getTime() + 50 * 60_000), outcome: "Shadow-free RCC roof, 600 sq.ft usable. Customer wants 3 kW with loan." }
          : {}),
      },
    });
  }

  // Live-ish positions for the field team map.
  for (const f of field) {
    const base = leads.find((l) => l.fieldUser.id === f.id) ?? leads[0];
    for (let k = 4; k >= 0; k--) {
      await db.locationPing.create({
        data: { organizationId: org.id, userId: f.id, lat: jitter(base.lat, 2500), lng: jitter(base.lng, 2500), accuracyM: Math.round(between(5, 30)), source: "HEARTBEAT", createdAt: new Date(now.getTime() - k * 25 * 60_000) },
      });
    }
  }

  // Tasks
  const openLeads = await db.lead.findMany({ where: { organizationId: org.id, stage: { in: ["NEW", "CONTACTED", "QUALIFIED", "NEGOTIATION"] } }, take: 14 });
  for (const l of openLeads) {
    await db.task.create({
      data: {
        organizationId: org.id,
        leadId: l.id,
        assignedToId: l.assignedToId,
        title: pick(["Call to collect EB bill", "Explain PM Surya Ghar subsidy", "Share loan documents checklist", "Follow up on quotation", "Book site visit"]) + ` â€” ${l.name}`,
        dueAt: new Date(now.getTime() + between(-0.5, 2) * day),
        priority: pick(["NORMAL", "HIGH", "NORMAL"]),
      },
    });
  }

  await db.notification.createMany({
    data: [
      { organizationId: org.id, userId: owner.id, title: "ðŸ”¥ 3 leads turned HOT today", body: "Book site visits within 24 hours", href: "/leads?temperature=HOT" },
      { organizationId: org.id, userId: owner.id, title: "âš  Quotation failed location check", body: "Review in Field Tracking", href: "/tracking" },
      { organizationId: org.id, userId: manager.id, title: "âš  Quotation failed location check", body: "Review in Field Tracking", href: "/tracking" },
    ],
  });

  await db.counter.createMany({
    data: [
      { organizationId: org.id, key: "lead", value: codeN },
      { organizationId: org.id, key: `quote-${now.getFullYear()}`, value: quoteN },
      { organizationId: org.id, key: "project", value: projectN },
    ],
  });

  console.log(`âœ” Seeded "${org.name}" â€” ${codeN} leads, ${quoteN} quotations, ${projectN} projects`);
  console.log(`  Login: owner@zeedra.demo / ${DEMO_PASSWORD}  (also manager@, telecaller@, field@, installer@)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
