/*
 * Lumen Metrix — AI Analyst Page
 * Chat interface for natural language data questions
 * Uses client-side data analysis (no backend needed)
 */
import { useState, useRef, useEffect } from "react";
import { useData } from "@/contexts/DataContext";
import {
  formatNumber, formatCurrency, getMaxMonth, isPartialYear,
  getAttendanceForMonths, getGivingForMonths, getNextStepsForMonths, MONTH_NAMES,
} from "@/lib/data";
import { Sparkles, Send, User, Bot, Lightbulb } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "What is our average weekly attendance for 2026?",
  "How does Canton compare to Jasper in giving?",
  "What is our FTG to Salvation conversion rate?",
  "Show me the giving per capita trend",
  "How has Easter attendance changed over the years?",
  "What is our volunteer to attendee ratio?",
  "Which campus has the highest growth rate?",
  "What are our baptism numbers for 2025 vs 2024?",
];

export default function AIAnalystTab() {
  const { data } = useData();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const analyzeQuestion = (question: string): string => {
    if (!data) return "Data is still loading. Please try again in a moment.";

    const q = question.toLowerCase();
    const latestYear = Math.max(...data.meta.years);
    const partial = isPartialYear(data, latestYear);
    const maxMonth = getMaxMonth(data, latestYear);
    const months = Array.from({ length: maxMonth }, (_, i) => i + 1);

    // Attendance questions
    if (q.includes("attendance") || q.includes("weekly") && (q.includes("average") || q.includes("avg"))) {
      const yearMatch = q.match(/20\\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : latestYear;
      const isPartial = isPartialYear(data, year);

      const allCampus = data.attendance.filter((r) => r.year === year && r.subgroup === "Total" && r.campus === "All Campuses");
      const total = allCampus.reduce((s, r) => s + r.avg_weekly, 0);

      const campusBreakdown = ["Canton", "Jasper", "Online"].map((c) => {
        const att = data.attendance.filter((r) => r.year === year && r.subgroup === "Total" && r.campus === c);
        return `${c}: ${formatNumber(att.reduce((s, r) => s + r.avg_weekly, 0))}`;
      }).join(" | ");

      return `**Average Weekly Attendance for ${year}${isPartial ? " (YTD)" : ""}:**\\n\\n` +
        `Total: **${formatNumber(total)}** per week\\n\\n` +
        `Campus breakdown: ${campusBreakdown}\\n\\n` +
        (isPartial ? `_Note: ${year} data covers Jan–${MONTH_NAMES[maxMonth - 1]} only._` : "");
    }

    // Giving questions
    if (q.includes("giving") || q.includes("tithe") || q.includes("offering")) {
      if (q.includes("per capita") || q.includes("gpc")) {
        const gpcData = data.computed.giving_per_capita.filter((r) => r.campus === "All Campuses").sort((a, b) => a.year - b.year);
        const lines = gpcData.slice(-5).map((r) => `${r.year}: $${r.giving_per_capita} annual ($${r.weekly_gpc}/wk)`);
        return `**Giving Per Capita Trend (All Campuses):**\\n\\n${lines.join("\\n")}\\n\\n` +
          `_GPC = Total Giving / Avg Weekly Attendance. Higher GPC indicates stronger per-person generosity._`;
      }

      const yearMatch = q.match(/20\\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : latestYear;
      const giving = data.giving.filter((r) => r.year === year);
      const allGiving = giving.filter((r) => r.campus === "All Campuses");
      const total = allGiving.reduce((s, r) => s + r.total, 0);

      if (q.includes("canton") && q.includes("jasper") || q.includes("compare") || q.includes("comparison")) {
        const canton = giving.filter((r) => r.campus === "Canton").reduce((s, r) => s + r.total, 0);
        const jasper = giving.filter((r) => r.campus === "Jasper").reduce((s, r) => s + r.total, 0);
        return `**Giving Comparison — ${year}:**\\n\\n` +
          `Canton: **${formatCurrency(canton)}**\\nJasper: **${formatCurrency(jasper)}**\\n\\n` +
          `Canton represents ${total > 0 ? ((canton / total) * 100).toFixed(1) : 0}% of total giving.`;
      }

      return `**Total Giving for ${year}:** ${formatCurrency(total)}\\n\\n` +
        `General: ${formatCurrency(allGiving.reduce((s, r) => s + r.general, 0))}\\n` +
        `Designated: ${formatCurrency(allGiving.reduce((s, r) => s + r.designated, 0))}`;
    }

    // FTG / Conversion questions
    if (q.includes("ftg") || q.includes("first time") || q.includes("first-time") || q.includes("conversion") || q.includes("guest")) {
      const yearMatch = q.match(/20\\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : latestYear;
      const ftg = data.next_steps.filter((r) => r.year === year && r.metric === "FTG").reduce((s, r) => s + r.total, 0);
      const salv = data.next_steps.filter((r) => r.year === year && r.metric === "Salvations").reduce((s, r) => s + r.total, 0);
      const bapt = data.next_steps.filter((r) => r.year === year && r.metric === "Baptisms").reduce((s, r) => s + r.total, 0);
      const stew = data.next_steps.filter((r) => r.year === year && r.metric === "Stewardship").reduce((s, r) => s + r.total, 0);

      return `**Assimilation Funnel — ${year}:**\\n\\n` +
        `First-Time Guests: **${formatNumber(ftg)}**\\n` +
        `Salvations: **${formatNumber(salv)}** (${ftg > 0 ? ((salv / ftg) * 100).toFixed(1) : 0}% of FTG)\\n` +
        `Baptisms: **${formatNumber(bapt)}** (${salv > 0 ? ((bapt / salv) * 100).toFixed(1) : 0}% of Salvations)\\n` +
        `New Stewards: **${formatNumber(stew)}** (${bapt > 0 ? ((stew / bapt) * 100).toFixed(1) : 0}% of Baptisms)\\n\\n` +
        `Overall FTG → Steward rate: **${ftg > 0 ? ((stew / ftg) * 100).toFixed(1) : 0}%**`;
    }

    // Volunteer questions
    if (q.includes("volunteer") || q.includes("serving") || q.includes("ratio")) {
      const yearMatch = q.match(/20\\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : latestYear;
      const vr = data.computed.volunteer_ratio.filter((r) => r.year === year);
      const all = vr.find((r) => r.campus === "All Campuses");

      if (all) {
        const campusLines = vr.filter((r) => r.campus !== "All Campuses").map((r) =>
          `${r.campus}: ${formatNumber(r.avg_volunteers)} volunteers (${(r.pct * 100).toFixed(1)}%, ${r.ratio}:1)`
        );
        return `**Volunteer Metrics — ${year}:**\\n\\n` +
          `Avg Weekly Volunteers: **${formatNumber(all.avg_volunteers)}**\\n` +
          `Volunteer %: **${(all.pct * 100).toFixed(1)}%** of attendance\\n` +
          `Ratio: **${all.ratio}:1** (attendees per volunteer)\\n\\n` +
          `Campus breakdown:\\n${campusLines.join("\\n")}`;
      }
      return `Volunteer data for ${year} is not available.`;
    }

    // Easter questions
    if (q.includes("easter")) {
      const easterMonths: Record<number, number> = {};
      // Easter is typically in March or April
      for (const y of data.meta.years) {
        const hasApr = data.attendance_monthly.some((r) => r.year === y && r.month === 4);
        const hasMar = data.attendance_monthly.some((r) => r.year === y && r.month === 3);
        easterMonths[y] = hasApr ? 4 : (hasMar ? 3 : 4);
      }

      const lines = data.meta.years.slice(-5).map((y) => {
        const m = easterMonths[y];
        const att = data.attendance_monthly.filter((r) => r.year === y && r.month === m && (r.subgroup === "Adults" || r.subgroup === "Kids")).reduce((s, r) => s + r.total, 0);
        const giv = data.giving_monthly.filter((r) => r.year === y && r.month === m).reduce((s, r) => s + r.total, 0);
        return `${y} (${MONTH_NAMES[m - 1]}): Attendance ${formatNumber(att)}, Giving ${formatCurrency(giv)}`;
      });

      return `**Easter Month Performance (Last 5 Years):**\\n\\n${lines.join("\\n")}`;
    }

    // Baptism questions
    if (q.includes("baptism") || q.includes("baptize")) {
      const years = q.match(/20\\d{2}/g);
      if (years && years.length >= 2) {
        const y1 = parseInt(years[0]);
        const y2 = parseInt(years[1]);
        const b1 = data.next_steps.filter((r) => r.year === y1 && r.metric === "Baptisms").reduce((s, r) => s + r.total, 0);
        const b2 = data.next_steps.filter((r) => r.year === y2 && r.metric === "Baptisms").reduce((s, r) => s + r.total, 0);
        const change = b1 > 0 ? ((b2 - b1) / b1 * 100).toFixed(1) : "N/A";
        return `**Baptisms Comparison:**\\n\\n${y1}: **${formatNumber(b1)}**\\n${y2}: **${formatNumber(b2)}**\\nChange: **${change}%**`;
      }
      const year = years ? parseInt(years[0]) : latestYear;
      const bapt = data.next_steps.filter((r) => r.year === year && r.metric === "Baptisms");
      const total = bapt.reduce((s, r) => s + r.total, 0);
      const byCampus = ["Canton", "Jasper"].map((c) => `${c}: ${formatNumber(bapt.filter((r) => r.campus === c).reduce((s, r) => s + r.total, 0))}`);
      return `**Baptisms for ${year}:** ${formatNumber(total)}\\n\\n${byCampus.join(" | ")}`;
    }

    // Growth questions
    if (q.includes("growth") || q.includes("growing") || q.includes("highest")) {
      const recentYears = data.meta.years.slice(-3);
      const campusGrowth = ["Canton", "Jasper", "Online"].map((c) => {
        const y1 = recentYears[0];
        const y2 = recentYears[recentYears.length - 1];
        const att1 = data.attendance.filter((r) => r.year === y1 && r.campus === c && r.subgroup === "Total").reduce((s, r) => s + r.avg_weekly, 0);
        const att2 = data.attendance.filter((r) => r.year === y2 && r.campus === c && r.subgroup === "Total").reduce((s, r) => s + r.avg_weekly, 0);
        const growth = att1 > 0 ? ((att2 - att1) / att1 * 100) : 0;
        return { campus: c, growth, att1, att2 };
      }).sort((a, b) => b.growth - a.growth);

      const lines = campusGrowth.map((c) =>
        `**${c.campus}**: ${c.growth >= 0 ? "+" : ""}${c.growth.toFixed(1)}% (${formatNumber(c.att1)} → ${formatNumber(c.att2)})`
      );

      return `**Campus Growth Rate (${recentYears[0]}–${recentYears[recentYears.length - 1]}):**\\n\\n${lines.join("\\n")}\\n\\n` +
        `Highest growth: **${campusGrowth[0].campus}** at ${campusGrowth[0].growth >= 0 ? "+" : ""}${campusGrowth[0].growth.toFixed(1)}%`;
    }

    // Default response
    return `I can help you analyze your church data. Here are some things I can answer:\\n\\n` +
      `- Attendance trends and averages\\n` +
      `- Giving totals and per capita analysis\\n` +
      `- FTG and conversion funnel metrics\\n` +
      `- Volunteer ratios and trends\\n` +
      `- Easter and event performance\\n` +
      `- Campus comparisons and growth rates\\n` +
      `- Baptism and salvation numbers\\n\\n` +
      `Try asking a specific question about your metrics!`;
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate slight delay for natural feel
    setTimeout(() => {
      const response = analyzeQuestion(userMsg.content);
      const assistantMsg: Message = { role: "assistant", content: response, timestamp: new Date() };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 600);
  };

  const handleSuggestion = (q: string) => {
    setInput(q);
    setTimeout(() => {
      const userMsg: Message = { role: "user", content: q, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      // Simulate slight delay for natural feel
      setTimeout(() => {
        const response = analyzeQuestion(q);
        const assistantMsg: Message = { role: "assistant", content: response, timestamp: new Date() };
        setMessages((prev) => [...prev, assistantMsg]);
        setIsTyping(false);
      }, 600);
    }, 100);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] sm:h-[calc(100vh-140px)] sm:h-[calc(100vh-180px)]">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(232,145,58,0.12)" }}>
              <Sparkles className="w-6 h-6" style={{ color: "#E8913A" }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: "'DM Sans', sans-serif" }}>AI Analyst</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Ask questions about your church data in natural language. I'll analyze your metrics and provide insights.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  className="text-left text-xs px-3 py-2.5 rounded-lg border border-border/60 hover:border-[#E8913A]/40 hover:bg-card transition-all"
                >
                  <Lightbulb className="w-3 h-3 inline-block mr-1.5 text-[#E8913A]" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(232,145,58,0.12)" }}>
                <Bot className="w-3.5 h-3.5" style={{ color: "#E8913A" }} />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-sm ${
                msg.role === "user"
                  ? "bg-[#E8913A] text-white"
                  : "bg-card border border-border/60"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none" style={{ fontSize: 13 }}>
                  {msg.content.split("\\n").map((line, j) => {
                    if (line.startsWith("**") && line.endsWith("**")) {
                      return <p key={j} className="font-bold mb-1">{line.replace(/\\*\\*/g, "")}</p>;
                    }
                    if (line.startsWith("_") && line.endsWith("_")) {
                      return <p key={j} className="italic text-muted-foreground text-xs mt-2">{line.replace(/_/g, "")}</p>;
                    }
                    if (line.startsWith("- ")) {
                      return <p key={j} className="ml-2">{line}</p>;
                    }
                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <p key={j} className="mb-0.5">
                        {parts.map((part, k) =>
                          part.startsWith("**") && part.endsWith("**")
                            ? <strong key={k} style={{ color: "#F5C882" }}>{part.replace(/\\*\\*/g, "")}</strong>
                            : <span key={k}>{part}</span>
                        )}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-muted">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: "rgba(232,145,58,0.12)" }}>
              <Bot className="w-3.5 h-3.5" style={{ color: "#E8913A" }} />
            </div>
            <div className="bg-card border border-border/60 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/40 pt-4">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about your church metrics..."
            className="flex-1 bg-card border border-border/60 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#E8913A]/50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-4 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-40"
            style={{ background: "#E8913A" }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
          AI Analyst uses your church data to answer questions. Responses are generated locally from your dashboard data.
        </p>
      </div>
    </div>
  );
}
