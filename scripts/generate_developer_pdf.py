import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
    Preformatted,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import arabic_reshaper
from bidi.algorithm import get_display

# Register Fonts
pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))

def ar(text):
    if not text:
        return ""
    reshaped = arabic_reshaper.reshape(text)
    return get_display(reshaped)

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Arial", 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Header
        self.drawString(54, 755, "WaseetAI Microservice - Developer Integration Guide & API Reference")
        self.drawRightString(612 - 54, 755, "https://waaseet-ai.web.app")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 748, 612 - 54, 748)

        # Footer
        self.line(54, 45, 612 - 54, 45)
        self.drawString(54, 32, "Confidential - For Waseet Platform Development Team (dev.waseetai.com)")
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(612 - 54, 32, page_text)

        self.restoreState()

def build_pdf(filename):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )

    c_primary = colors.HexColor("#0F172A")
    c_blue = colors.HexColor("#2563EB")
    c_dark = colors.HexColor("#1E293B")
    c_muted = colors.HexColor("#64748B")
    c_light = colors.HexColor("#F8FAFC")
    c_border = colors.HexColor("#CBD5E1")

    title_style = ParagraphStyle(
        "CoverTitle",
        fontName="Arial-Bold",
        fontSize=23,
        leading=28,
        textColor=c_primary,
        alignment=TA_CENTER,
    )

    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        fontName="Arial",
        fontSize=12,
        leading=18,
        textColor=c_blue,
        alignment=TA_CENTER,
    )

    h1_style = ParagraphStyle(
        "Heading1_Custom",
        fontName="Arial-Bold",
        fontSize=14,
        leading=18,
        textColor=c_primary,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True,
    )

    h2_style = ParagraphStyle(
        "Heading2_Custom",
        fontName="Arial-Bold",
        fontSize=11,
        leading=15,
        textColor=c_blue,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True,
    )

    body_style = ParagraphStyle(
        "Body_Custom",
        fontName="Arial",
        fontSize=9,
        leading=13.5,
        textColor=c_dark,
    )

    body_bold = ParagraphStyle(
        "Body_Bold",
        fontName="Arial-Bold",
        fontSize=9,
        leading=13.5,
        textColor=c_dark,
    )

    th_style = ParagraphStyle(
        "TH_Custom",
        fontName="Arial-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        alignment=TA_LEFT,
    )

    code_style = ParagraphStyle(
        "Code_Custom",
        fontName="Courier",
        fontSize=7.8,
        leading=10,
        textColor=colors.HexColor("#0F172A"),
        backColor=colors.HexColor("#F1F5F9"),
        borderPadding=5,
        spaceBefore=3,
        spaceAfter=4,
    )

    badge_post = ParagraphStyle(
        "Badge_POST",
        fontName="Arial-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        backColor=colors.HexColor("#2563EB"),
        alignment=TA_CENTER,
    )

    badge_get = ParagraphStyle(
        "Badge_GET",
        fontName="Arial-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
        backColor=colors.HexColor("#10B981"),
        alignment=TA_CENTER,
    )

    story = []

    # ==================== PAGE 1: COVER ====================
    story.append(Spacer(1, 35))
    story.append(Paragraph("WASEET FREELANCE PLATFORM", ParagraphStyle("Brand", fontName="Arial-Bold", fontSize=11, textColor=c_blue, alignment=TA_CENTER)))
    story.append(Spacer(1, 10))
    story.append(Paragraph("WaseetAI Microservice", title_style))
    story.append(Paragraph("Developer Integration Guide & API Reference", title_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph(ar("دليل المطور الشامل للربط والتكامل البرمجي مع خدمات الذكاء الاصطناعي"), subtitle_style))
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=2, color=c_blue, spaceBefore=4, spaceAfter=18))

    meta_data = [
        [Paragraph("<b>Production Base URL</b>", body_bold), Paragraph("<code>https://waaseet-ai.web.app</code>", code_style)],
        [Paragraph("<b>Direct Cloud Run API</b>", body_bold), Paragraph("<code>https://waseet-ai-api-1041761245251.us-central1.run.app</code>", code_style)],
        [Paragraph("<b>Interactive Playground</b>", body_bold), Paragraph("<code>https://waaseet-ai.web.app</code> (Live in-browser tester with Request/Response logs)", body_style)],
        [Paragraph("<b>Authentication Scheme</b>", body_bold), Paragraph("<code>Authorization: Bearer waseet_secret_dev_key_2026</code>", code_style)],
        [Paragraph("<b>Target Consumer App</b>", body_bold), Paragraph("Waseet Freelance Platform (<code>https://dev.waseetai.com/</code>)", body_style)],
        [Paragraph("<b>Microservice Stack</b>", body_bold), Paragraph("Node.js 20 + TypeScript + Fastify + Socket.IO + Google Cloud Run (Containerized)", body_style)],
        [Paragraph("<b>Multi-Project Quota Router</b>", body_bold), Paragraph("9 Projects (1 Paid + 8 Free) with Auto Failover across 56 Quota Slots", body_style)],
        [Paragraph("<b>Document Version</b>", body_bold), Paragraph("v1.0.0 — Production Ready & Verified", body_style)],
    ]
    meta_table = Table(meta_data, colWidths=[165, 339])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_light),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(meta_table)

    story.append(Spacer(1, 20))
    story.append(Paragraph("<b>Executive Summary:</b>", h2_style))
    story.append(Paragraph(
        "This integration guide provides everything frontend and backend engineers need to seamlessly connect the main "
        "Waseet platform (<code>https://dev.waseetai.com/</code>) with the WaseetAI Microservice. The microservice fulfills "
        "all 31 AI requirements specified across AI.pdf and AI2.pdf, including real-time generative streaming (SSE), "
        "100% mathematically balanced milestone breakdowns, algorithmic exam grading, dispute resolution, RAG customer support, "
        "and audio speech synthesis.",
        body_style
    ))
    story.append(PageBreak())

    # ==================== PAGE 2: ARCHITECTURE & SECURITY ====================
    story.append(Paragraph("1. Architecture, Security & Authentication", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=c_border, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("<b>Enterprise Security &amp; Zero-Exposure Model:</b>", h2_style))
    story.append(Paragraph(
        "• <b>Complete Key Isolation:</b> All Google Gemini API keys (1 Paid key + 8 Free keys) are stored securely inside "
        "the Cloud Run server environment. The client browser and frontend apps never receive, handle, or store any Google API keys.<br/>"
        "• <b>Tenant Bearer Authentication:</b> Every incoming request to <code>/v1/ai/*</code> is authenticated against the tenant bearer secret.<br/>"
        "• <b>Data Privacy Routing:</b> Payloads classified as <code>SENSITIVE</code>, <code>PERSONAL</code>, or <code>DISPUTE</code> "
        "are strictly routed to the dedicated Paid Project (<code>projects/1041761245251</code>), ensuring commercial privacy compliance.",
        body_style
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("<b>Standard HTTP Headers:</b>", h2_style))
    headers_data = [
        [Paragraph("Header Name", th_style), Paragraph("Required", th_style), Paragraph("Value / Description", th_style)],
        [Paragraph("<code>Authorization</code>", code_style), Paragraph("Yes", body_style), Paragraph("<code>Bearer waseet_secret_dev_key_2026</code>", code_style)],
        [Paragraph("<code>Content-Type</code>", code_style), Paragraph("Yes", body_style), Paragraph("<code>application/json</code> (or <code>text/event-stream</code> for SSE)", body_style)],
        [Paragraph("<code>X-Client-Id</code>", code_style), Paragraph("Optional", body_style), Paragraph("<code>waseet_core_backend</code>", code_style)],
        [Paragraph("<code>X-Request-Id</code>", code_style), Paragraph("Optional", body_style), Paragraph("Client-generated UUID for distributed request tracing", body_style)],
    ]
    t_headers = Table(headers_data, colWidths=[130, 60, 314])
    t_headers.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_dark),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_headers)

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Multi-Project Quota Router &amp; Failover Architecture:</b>", h2_style))
    story.append(Paragraph(
        "The microservice implements an autonomous multi-project pool router. When any Gemini model encounters a <code>429 Too Many Requests</code> "
        "or <code>503 Overloaded</code> response, the router automatically applies exponential backoff cooldown to that specific quota, "
        "and immediately retries across the other 56 active quota slots on the remaining 8 projects without dropping the user's connection.",
        body_style
    ))
    story.append(Spacer(1, 12))

    # ==================== CORE ENDPOINTS ====================
    story.append(Paragraph("2. Core Endpoints Reference", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=c_border, spaceBefore=2, spaceAfter=8))

    def make_ep(num, title_en, title_ar, method, path, desc, req_json, res_json, is_stream=False):
        b = []
        badge = Paragraph(f"<b>{method}</b>", badge_post if method == "POST" else badge_get)
        path_p = Paragraph(f"<b>{num}. {title_en}</b> — <i>{ar(title_ar)}</i><br/><code>{path}</code>", h2_style)
        header_table = Table([[badge, path_p]], colWidths=[52, 452])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1),
            ('TOPPADDING', (0,0), (-1,-1), 1),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
        ]))
        b.append(header_table)
        b.append(Spacer(1, 3))
        b.append(Paragraph(f"<b>Description:</b> {desc}", body_style))
        if is_stream:
            b.append(Paragraph("<b>Protocol:</b> Server-Sent Events (SSE) (<code>text/event-stream; charset=utf-8</code>)", body_style))
        b.append(Spacer(1, 3))

        req_col = [Paragraph("<b>Request Payload (JSON):</b>", body_bold), Preformatted(req_json, code_style)]
        res_col = [Paragraph("<b>Response Sample (JSON):</b>", body_bold), Preformatted(res_json, code_style)]
        
        block_table = Table([[req_col, res_col]], colWidths=[248, 256])
        block_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        b.append(block_table)
        b.append(Spacer(1, 10))
        return KeepTogether(b)

    # 2.1 Project Description Stream
    story.append(make_ep(
        "2.1", "Project Description Live Stream", "توليد وتحسين وصف المشروع",
        "POST", "/v1/ai/project-description/stream",
        "Generates a structured scope of work and project description in Arabic Markdown, streamed character-by-character via SSE.",
        '{\n  "title": "Waseet Freelance Platform",\n  "category": "Web & Mobile Development",\n  "language": "ar",\n  "modelTier": "LIGHT"\n}',
        '// SSE Events Streamed Live:\nevent: generation.started\ndata: {"status":"started"}\n\nevent: text.delta\ndata: {"chunk":"مشروع منصة وسيط..."}\n\nevent: generation.completed\ndata: {"status":"completed"}',
        is_stream=True
    ))

    # 2.2 Milestones
    story.append(make_ep(
        "2.2", "Project Milestones Calculator", "تقسيم وحساب مراحل المشروع",
        "POST", "/v1/ai/milestones",
        "Breaks down total project scope into delivery phases with 100% exact mathematical balance (percentages sum to 100%, amounts sum to total).",
        '{\n  "title": "E-Commerce App",\n  "description": "Client app, driver app, admin panel",\n  "totalAmount": 3000,\n  "currency": "USD"\n}',
        '{\n  "success": true,\n  "data": {\n    "milestones": [\n      {\n        "title": "Stage 1: UI/UX & Prototypes",\n        "description": "Figma screens and flows",\n        "days": 5, "percentage": 30, "amount": 900\n      },\n      {\n        "title": "Stage 2: Core Backend & APIs",\n        "description": "Database, auth, payments",\n        "days": 10, "percentage": 50, "amount": 1500\n      },\n      {\n        "title": "Stage 3: Testing & Launch",\n        "description": "QA, deployment and handover",\n        "days": 5, "percentage": 20, "amount": 600\n      }\n    ]\n  }\n}'
    ))

    story.append(PageBreak())

    # 2.3 Plan Feasibility Analysis
    story.append(make_ep(
        "2.3", "Plan Feasibility & Risk Audit", "تحليل الجدوى والمخاطر الفنية",
        "POST", "/v1/ai/project-analysis",
        "Audits requirement clarity, feasibility score, and detects technical gaps and budget misalignments prior to publishing.",
        '{\n  "title": "Smart Travel Booking App",\n  "description": "Integration with 4 flight APIs and crypto",\n  "budget": 1500,\n  "deadlineDays": 15,\n  "currency": "USD"\n}',
        '{\n  "success": true,\n  "data": {\n    "clarityScore": 85,\n    "feasibilityScore": 72,\n    "marketFitRating": "Good",\n    "executiveSummary": "Feasible but budget is low for 4 APIs",\n    "strengths": ["Clear feature scope"],\n    "gapsAndRisks": ["API subscription costs not accounted for"]\n  }\n}'
    ))

    # 2.4 Skill Assessment Generation
    story.append(make_ep(
        "2.4", "Technical Assessment Generation", "توليد الاختبارات التقنية الحتمية",
        "POST", "/v1/ai/assessments",
        "Generates dynamic, non-repeating technical multiple-choice questions tailored to provider specialty with server-side answer keys.",
        '{\n  "providerSpecialtyId": "spec-react-01",\n  "specialtyName": "React & TypeScript",\n  "questionCount": 10,\n  "timeLimitMinutes": 15\n}',
        '{\n  "success": true,\n  "data": {\n    "attemptId": "att-1dfc375b-8531...",\n    "questions": [\n      {\n        "id": 1,\n        "textAr": "كيف تمنع إعادة التقديم غير الضروري في React؟",\n        "options": [\n          {"id":"a", "text":"React.memo & useCallback"},\n          {"id":"b", "text":"localStorage caching"},\n          {"id":"c", "text":"Class Components"},\n          {"id":"d", "text":"DOM reload"}\n        ]\n      }\n    ],\n    "timeLimitMinutes": 15\n  }\n}'
    ))

    # 2.5 Assessment Submission & Grading
    story.append(make_ep(
        "2.5", "Assessment Submission & Grading", "تصحيح الامتحان والتقييم الحتمي",
        "POST", "/v1/ai/assessments/:attemptId/submit",
        "Evaluates submitted answers deterministically, calculates final score %, and generates personalized qualitative feedback.",
        '{\n  "submittedAnswers": {\n    "1": "a",\n    "2": "b",\n    "3": "a"\n  },\n  "timeSpentSeconds": 180\n}',
        '{\n  "success": true,\n  "data": {\n    "attemptId": "att-1dfc375b-8531...",\n    "score": 80,\n    "isPassed": true,\n    "status": "COMPLETED",\n    "feedbackAr": "أظهر المستقل فهماً متقدماً للأساسيات وأفضل الممارسات",\n    "strengths": ["إتقان تحسين الأداء"],\n    "weaknesses": ["مراجعة حالات الأخطاء الاستثنائية"]\n  }\n}'
    ))

    story.append(PageBreak())

    # 2.6 Dispute AI Summary
    story.append(make_ep(
        "2.6", "Dispute Legal Review & Settlement", "تلخيص وحل النزاعات القضائي",
        "POST", "/v1/ai/disputes/summary",
        "Strictly routed to Paid Project. Analyzes claims from both parties against contract milestones and suggests judicial settlement.",
        '{\n  "disputeId": "disp-101",\n  "projectId": "proj-202",\n  "clientClaim": "Provider delayed delivery by 10 days",\n  "providerClaim": "Client requested extra features out of scope",\n  "evidenceList": ["Scope Change Logs", "Delivery Files"]\n}',
        '{\n  "success": true,\n  "data": {\n    "summary": "نزاع حول تأخر التسليم الناتج عن طلب ميزات مستحدثة",\n    "clientPerspective": "يدعي العميل الإخلال بالموعد...",\n    "providerPerspective": "يدفع المستقل بأن التأخير كان بطلب العميل...",\n    "recommendation": "توصية استرشادية: منح مهلة تصحيحية 4 أيام مع تسوية ودية"\n  }\n}'
    ))

    # 2.7 Help Assistant Chat
    story.append(make_ep(
        "2.7", "RAG Customer Support Chat", "مساعد الدعم الفني الذكي RAG",
        "POST", "/v1/ai/help/chat",
        "Answers inquiries using verified knowledge base docs. Returns streamed text chunks, document citations, or triggers human fallback.",
        '{\n  "question": "ما هي سياسة المنصة في ضمان حقوق الدفع؟"\n}',
        '// SSE Stream with Verified Citations:\nevent: text.delta\ndata: {"chunk":"في منصة وسيط نضمن حقوقك عبر نظام Escrow..."}\n\nevent: citations\ndata: [{"docId":"terms-escrow","title":"سياسة الضمان المالي"}]\n\nevent: generation.completed\ndata: {"status":"completed"}',
        is_stream=True
    ))

    # 2.8 Avatar Voice Chat
    story.append(make_ep(
        "2.8", "Speech Avatar Voice Synthesis", "المحادثة الصوتية مع الأفاتار",
        "POST", "/v1/ai/avatar/chat",
        "Synthesizes natural Arabic spoken audio response alongside text, enabling interactive conversational avatars.",
        '{\n  "message": "كيف أقدم عرضاً على مشروع جديد؟"\n}',
        '{\n  "success": true,\n  "data": {\n    "text": "يمكنك تصفح المشاريع والضغط على زر تقديم عرض...",\n    "audio": {\n      "mimeType": "audio/mp3",\n      "base64Audio": "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU5LjI3..."\n    }\n  }\n}'
    ))

    story.append(PageBreak())

    # ==================== SECTION 3: INTEGRATION CODE ====================
    story.append(Paragraph("3. Integration Code Examples (JavaScript / TypeScript)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=c_border, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("<b>A) Standard REST Call (Browser or Node.js Backend):</b>", h2_style))
    code_rest = """// Base URL and Secret Configuration
const API_BASE = "https://waseet-ai-api-1041761245251.us-central1.run.app";
const AUTH_TOKEN = "Bearer waseet_secret_dev_key_2026";

async function calculateMilestones(title, description, totalAmount, currency = "USD") {
  const response = await fetch(`${API_BASE}/v1/ai/milestones`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": AUTH_TOKEN
    },
    body: JSON.stringify({ title, description, totalAmount, currency })
  });

  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message || "Milestone generation failed");
  return json.data.milestones;
}"""
    story.append(Preformatted(code_rest, code_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("<b>B) Consuming Real-Time SSE Streams (Live Description Streaming):</b>", h2_style))
    code_sse = """async function streamDescription(title, category, onChunk, onComplete, onError) {
  try {
    const response = await fetch(`${API_BASE}/v1/ai/project-description/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": AUTH_TOKEN
      },
      body: JSON.stringify({ title, category, language: "ar", modelTier: "LIGHT" })
    });

    if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) onChunk(data.chunk, data.model);
          } catch (e) {}
        }
      }
    }
    onComplete();
  } catch (err) {
    if (onError) onError(err);
  }
}"""
    story.append(Preformatted(code_sse, code_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("<b>C) Real-Time Socket.IO Bridge (Alternative WebSocket Connection):</b>", h2_style))
    code_socket = """import { io } from "socket.io-client";

const socket = io("https://waseet-ai-api-1041761245251.us-central1.run.app", {
  transports: ["websocket", "polling"],
  query: { userId: "user-client-101" }
});

// Stream description over socket
socket.emit("ai:generate_description", { title: "تطبيق حجز عيادات" });
socket.on("ai:description_chunk", (data) => console.log("Chunk:", data.chunk));
socket.on("ai:description_complete", () => console.log("Stream Complete!"));"""
    story.append(Preformatted(code_socket, code_style))

    story.append(PageBreak())

    # ==================== SECTION 4: 31 FEATURES MATRIX ====================
    story.append(Paragraph("4. Complete 31 Features Mapping Matrix", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=c_border, spaceBefore=2, spaceAfter=6))
    story.append(Paragraph(
        "All 31 features from AI.pdf and AI2.pdf are implemented and active in the microservice:",
        body_style
    ))
    story.append(Spacer(1, 4))

    matrix_rows = [
        [Paragraph("<b>#</b>", th_style), Paragraph("<b>Feature ID</b>", th_style), Paragraph("<b>Modern Endpoint (/v1/...)</b>", th_style), Paragraph("<b>Privacy</b>", th_style), Paragraph("<b>Socket Event</b>", th_style)],
        ["1", "AI-01", "/v1/ai/project-description/stream", "Public", "ai:generate_description"],
        ["2", "AI-02", "/v1/ai/request-draft", "Public", "-"],
        ["3", "AI-03", "/v1/ai/milestones", "Public", "-"],
        ["4", "AI-04", "/v1/ai/project-analysis", "Public", "-"],
        ["5", "AI-05", "/v1/ai/text/suggest/stream", "Public", "stream_ai_suggest_text"],
        ["6", "AI-06", "/v1/ai/portfolio-review", "Public", "-"],
        ["7", "AI-07", "/v1/ai/accreditation-review", "Public", "-"],
        ["8", "AI-08", "/v1/ai/assessments", "Public", "start_assessment"],
        ["9", "AI-09", "/v1/ai/onboarding-quizzes", "Public", "setup_test:init"],
        ["10", "AI-10", "/v1/ai/proposals/suggest", "Public", "-"],
        ["11", "AI-11", "/v1/ai/proposals/audit/stream", "Public", "trigger_ai_audit"],
        ["12", "AI-12", "/v1/ai/proposals/enrich", "Paid (Sens.)", "-"],
        ["13", "AI-13", "/v1/ai/matching/projects-for-provider", "Public", "-"],
        ["14", "AI-14", "/v1/ai/project-fit", "Public", "-"],
        ["15", "AI-15", "/v1/ai/marketplace/recommendations", "Public", "-"],
        ["16", "AI-16", "/v1/ai/profile/performance-summary", "Public", "-"],
        ["17", "AI-17", "/v1/ai/profile/bio & /skills", "Public", "-"],
        ["18", "AI-18", "/v1/ai/project-health", "Paid (Sens.)", "-"],
        ["19", "AI-19", "/v1/ai/delivery-review (Client)", "Paid (Sens.)", "-"],
        ["20", "AI-20", "/v1/ai/disputes/summary", "Paid (Sens.)", "-"],
        ["21", "AI-21", "/v1/ai/help/stream & /chat", "Public", "help:ask"],
        ["22", "AI2-01", "/v1/ai/business-models/re-audit", "Public", "-"],
        ["23", "AI2-02", "/v1/ai/business-models/audit", "Public", "-"],
        ["24", "AI2-03", "/v1/ai/delivery-review (Provider)", "Paid (Sens.)", "-"],
        ["25", "AI2-04", "/v1/ai/avatar/chat", "Public", "ai_chat"],
        ["26", "AI2-05", "/v1/ai/assessments/:id/submit", "Public", "submit_answer"],
        ["27", "AI2-06", "/v1/ai/assessments/:id/status", "Public", "-"],
        ["28", "AI2-07", "/v1/ai/assessments/stream", "Public", "question_streamed"],
        ["29", "AI2-08", "/v1/ai/proposals/audit/stream", "Public", "trigger_ai_audit"],
        ["30", "AI2-09", "/v1/ai/text/suggest/stream", "Public", "stream_ai_suggest_text"],
        ["31", "AI2-10", "/v1/ai/text/enhance/stream", "Public", "stream_ai_enhance_description"],
    ]

    t_matrix_data = []
    for r in matrix_rows:
        if isinstance(r[0], Paragraph):
            t_matrix_data.append(r)
        else:
            t_matrix_data.append([
                Paragraph(r[0], ParagraphStyle("Num", fontName="Arial", fontSize=8, leading=9, alignment=TA_CENTER)),
                Paragraph(f"<b>{r[1]}</b>", ParagraphStyle("FID", fontName="Arial-Bold", fontSize=8, leading=9)),
                Paragraph(f"<code>{r[2]}</code>", ParagraphStyle("MiniCode", fontName="Courier", fontSize=7.2, leading=8.5)),
                Paragraph(f"<font color='{'#DC2626' if 'Paid' in r[3] else '#16A34A'}'><b>{r[3]}</b></font>", ParagraphStyle("Priv", fontName="Arial-Bold", fontSize=7.8, leading=8.5)),
                Paragraph(f"<code>{r[4]}</code>", ParagraphStyle("MiniCode2", fontName="Courier", fontSize=7.2, leading=8.5)),
            ])

    t_matrix = Table(t_matrix_data, colWidths=[20, 48, 220, 80, 136])
    t_matrix.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_dark),
        ('BOX', (0,0), (-1,-1), 1, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.5, c_border),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_light]),
        ('TOPPADDING', (0,0), (-1,-1), 1.6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1.6),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_matrix)

    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>Online Testing &amp; Developer Handoff:</b>", h2_style))
    story.append(Paragraph(
        "Every endpoint in this matrix can be tested directly in the browser via the interactive console: "
        "<b>https://waaseet-ai.web.app</b>. For production inquiries, contact the Waseet AI Core Architecture team.",
        body_style
    ))

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated: {filename}")

if __name__ == "__main__":
    out1 = os.path.abspath("docs/WaseetAI_API_Integration_Guide.pdf")
    out2 = os.path.abspath("deliverables/WaseetAI_API_Integration_Guide.pdf")
    out3 = os.path.abspath("public/WaseetAI_API_Integration_Guide.pdf")
    build_pdf(out1)
    build_pdf(out2)
    build_pdf(out3)
