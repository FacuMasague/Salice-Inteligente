import type { Client } from "../../shared/models";

export const number = (value: number, maximumFractionDigits = 0) => new Intl.NumberFormat("es-AR", {
    maximumFractionDigits,
}).format(value);

export const compactNumber = (value: number) => {
    const absolute = Math.abs(value);
    if (absolute < 1000) return number(value);
    const divisor = absolute >= 1_000_000 ? 1_000_000 : 1000;
    const suffix = divisor === 1_000_000 ? "M" : "K";
    const scaled = value / divisor;
    return `${number(scaled, Math.abs(scaled) < 100 ? 1 : 0)} ${suffix}`;
};

export const money = (value: number, compact = false) => compact
    ? `${value < 0 ? "-$" : "$"} ${compactNumber(Math.abs(value))}`
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(value);

export const shortDate = (value: string) => {
    if (!value) return "No data";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" })
        .format(new Date(`${value}T12:00:00`));
};

export const compactDate = (value: string) => {
    if (!value) return "No data";
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
        .format(new Date(`${value}T12:00:00`));
};

export const paymentDelay = (days: number) => days === 0
    ? "on the due date"
    : days > 0
        ? `${days} d after`
        : `${Math.abs(days)} d before`;

type CreditTermClient = Pick<Client,
    "creditDays" | "creditTermStatus" | "creditTermSampleSize" | "creditTermDominantShare"
    | "creditTermMinDays" | "creditTermMaxDays" | "creditTermOptions"
>;

const termDaysLabel = (days: number) => days === 0 ? "Cash terms observed" : `${days} days`;

export const creditTermLabel = (client: CreditTermClient) => {
    if (client.creditDays == null || client.creditTermStatus === "unavailable") return "No recent usual terms";
    if (client.creditTermStatus === "mixed") return "Mixed terms";
    if (client.creditTermStatus === "single") return `${termDaysLabel(client.creditDays)} · 1 invoice`;
    if (client.creditTermStatus === "predominant") return `${termDaysLabel(client.creditDays)} predominant`;
    return `${termDaysLabel(client.creditDays)} usual`;
};

export const creditTermDetail = (client: CreditTermClient) => {
    if (!client.creditTermSampleSize) {
        return "No invoices have valid purchase, issue, and due dates in the last 365 days.";
    }
    const observedRange = client.creditTermMinDays !== client.creditTermMaxDays
        ? ` · exact range ${client.creditTermMinDays}–${client.creditTermMaxDays} days`
        : "";
    if (client.creditTermStatus === "single") return `Based on one invoice${observedRange}.`;
    if (client.creditTermStatus === "mixed") {
        const alternatives = client.creditTermOptions.slice(0, 3)
            .map((option) => `${option.days} d (${option.share}%)`)
            .join(", ");
        return `${client.creditTermSampleSize} invoices with multiple terms and no majority: ${alternatives}${observedRange}.`;
    }
    const calendarNote = client.creditTermOptions[0]
        && client.creditTermOptions[0].minDays !== client.creditTermOptions[0].maxDays
        ? `; includes shifts from ${client.creditTermOptions[0].minDays} to ${client.creditTermOptions[0].maxDays} days`
        : "";
    const predominance = client.creditTermStatus === "predominant"
        ? ` · ${client.creditTermDominantShare}% of the sample`
        : "";
    return `${client.creditTermSampleSize} invoices observed${predominance}${calendarNote}${observedRange}.`;
};

export const longDate = (value: string) => {
    if (!value) return "No data";
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
};

export const minutesAsTime = (minutes: number) => {
    const start = 9 * 60;
    const total = start + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
